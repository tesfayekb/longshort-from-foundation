/**
 * Slice-worker — claims a bounded slice of unclaimed cursor rows under
 * `FOR UPDATE SKIP LOCKED`, executes the per-ticker compute adapter under
 * a token-bucket pacer, writes staging or skip rows, deletes the cursor
 * rows, and attempts the CAS from 'running' → 'finalizing' guarded by
 * the cursor-empty predicate (Phase 2 addendum §3 — the cursor-empty
 * check INSIDE the CAS statement is the aggregation barrier; z-score
 * can never run on a partial staging set even under racing slices).
 *
 * SQL claim contract (DEC-047, MIG-082 partial index
 * `idx_signal_queue_cursor_unclaimed`):
 *
 *   WITH claimed AS (
 *     SELECT ticker
 *     FROM signal_queue_cursor
 *     WHERE run_id=$1 AND claimed_at IS NULL
 *     ORDER BY ticker
 *     FOR UPDATE SKIP LOCKED
 *     LIMIT $2
 *   )
 *   UPDATE signal_queue_cursor c
 *     SET claimed_at = now()
 *     FROM claimed
 *     WHERE c.run_id=$1 AND c.ticker = claimed.ticker
 *   RETURNING c.ticker, c.gics_sector
 *
 * Executed via an RPC because the PostgREST JS client can't express
 * SKIP LOCKED. RPC contract: `signal_queue_claim_slice(p_run_id uuid,
 * p_limit int) returns table(ticker text, gics_sector text)`. RPC body
 * ships in a separate migration (MIG-083 — Phase 2.5, see module doc).
 *
 * Wall-clock discipline: `as_of` is supplied by the caller (handler
 * derives it from `productionClock`). No `new Date()` inside.
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueSignalConfig, TickerComputeFn } from './queue-config.ts';
import type { SignalSkip } from '../signal-types.ts';
import { TokenBucket } from '../../options-flow/token-bucket.ts';

export interface QueueSliceWorkerContext {
  supabase: SupabaseClient;
  config: QueueSignalConfig;
  as_of: Date;
  /**
   * The open run_id this slice belongs to. Caller (handler) selects the
   * oldest open run for this signal_id under the addendum §5 "OLDEST
   * running run" serialization rule.
   */
  run_id: string;
  /** Injectable for tests. Defaults to a real TokenBucket. */
  bucketFactory?: (ratePerSec: number) => TokenBucket;
}

export interface QueueSliceWorkerResult {
  run_id: string;
  signal_id: string;
  claimed: number;
  succeeded: number;
  skipped: number;
  cas_attempted: boolean;
  cas_won: boolean;
  /** True when the claim returned zero rows — slice is a no-op (cursor empty). */
  empty: boolean;
}

interface ClaimedRow {
  ticker: string;
  gics_sector: string | null;
}

export async function runQueueSlice(
  ctx: QueueSliceWorkerContext,
): Promise<QueueSliceWorkerResult> {
  const { supabase, config, as_of, run_id } = ctx;

  // ── 1. Claim a slice via RPC (SKIP LOCKED inside the function).
  const { data: claimedRaw, error: claimErr } = await supabase.rpc(
    'signal_queue_claim_slice',
    { p_run_id: run_id, p_limit: config.sliceSize },
  );
  if (claimErr) {
    throw new Error(`slice-worker: claim rpc failed: ${claimErr.message}`);
  }
  const claimed = (claimedRaw ?? []) as ClaimedRow[];
  if (claimed.length === 0) {
    // Nothing to claim — either cursor empty OR every remaining row is
    // locked by a concurrent slice. Try CAS-to-finalizing in case we're
    // the post-drain heartbeat; the CAS predicate (cursor empty) is
    // authoritative.
    const cas = await attemptFinalizingCAS(supabase, run_id, as_of);
    return {
      run_id, signal_id: config.signalId,
      claimed: 0, succeeded: 0, skipped: 0,
      cas_attempted: true, cas_won: cas, empty: true,
    };
  }

  // ── 2. Bump heartbeat so the sweeper does not fail us out mid-slice.
  const heartbeatErr = await bumpHeartbeat(supabase, run_id, as_of);
  if (heartbeatErr) throw heartbeatErr;

  // ── 3. Compute under the token bucket.
  const bucket = (ctx.bucketFactory ?? defaultBucketFactory)(config.ratePerSec);
  const compute: TickerComputeFn = config.fetchAndCompute;

  const stagingRows: Array<{
    run_id: string; signal_id: string; ticker: string;
    gics_sector: string | null; raw_signal: number; computed_at: string;
  }> = [];
  const skipRows: Array<{
    run_id: string; signal_id: string; ticker: string;
    skip_reason: string; detail: string; recorded_at: string;
  }> = [];
  const perTickerSkips: SignalSkip[] = [];

  const computed_at = as_of.toISOString();

  // Serial within the slice — pacing is per-second, not concurrent. Keeps
  // the per-slice budget linear and the vendor-cap math one-to-one.
  for (const row of claimed) {
    await bucket.acquire();
    try {
      const result = await compute({
        ticker: row.ticker,
        gicsSector: row.gics_sector,
        asOf: as_of,
      });
      if (result.kind === 'value') {
        if (!Number.isFinite(result.raw)) {
          // Defensive: a compute that returns a non-finite "value" is a
          // bug; convert to a typed skip rather than poisoning staging.
          skipRows.push({
            run_id, signal_id: config.signalId, ticker: row.ticker,
            skip_reason: 'fetch_error',
            detail: `compute returned non-finite value: ${result.raw}`,
            recorded_at: computed_at,
          });
          perTickerSkips.push({
            ticker: row.ticker, reason: 'fetch_error',
            detail: `compute returned non-finite value: ${result.raw}`,
          });
        } else {
          stagingRows.push({
            run_id, signal_id: config.signalId, ticker: row.ticker,
            gics_sector: row.gics_sector, raw_signal: result.raw,
            computed_at,
          });
        }
      } else {
        skipRows.push({
          run_id, signal_id: config.signalId, ticker: row.ticker,
          skip_reason: result.reason, detail: result.detail,
          recorded_at: computed_at,
        });
        perTickerSkips.push({
          ticker: row.ticker, reason: result.reason, detail: result.detail,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skipRows.push({
        run_id, signal_id: config.signalId, ticker: row.ticker,
        skip_reason: 'fetch_error', detail: `compute threw: ${msg}`,
        recorded_at: computed_at,
      });
      perTickerSkips.push({
        ticker: row.ticker, reason: 'fetch_error',
        detail: `compute threw: ${msg}`,
      });
    }
  }

  // ── 4. Persist staging + skip rows. Both are PK (run_id, ticker) → upsert
  //      with ignoreDuplicates makes a same-run replay idempotent at the
  //      DB layer (slice retry after a transient write blip).
  if (stagingRows.length > 0) {
    const { error: stageErr } = await supabase
      .from('signal_queue_staging')
      .upsert(stagingRows, { onConflict: 'run_id,ticker', ignoreDuplicates: true });
    if (stageErr) {
      throw new Error(`slice-worker: staging upsert failed: ${stageErr.message}`);
    }
  }
  if (skipRows.length > 0) {
    const { error: skipErr } = await supabase
      .from('signal_queue_skips')
      .upsert(skipRows, { onConflict: 'run_id,ticker', ignoreDuplicates: true });
    if (skipErr) {
      throw new Error(`slice-worker: skips upsert failed: ${skipErr.message}`);
    }
  }

  // ── 5. Delete the claimed cursor rows. This is the work-completion
  //      signal; the CAS predicate `NOT EXISTS (... cursor ...)` reads
  //      the result of this delete to decide finalizer eligibility.
  const claimedTickers = claimed.map((r) => r.ticker);
  const { error: delErr } = await supabase
    .from('signal_queue_cursor')
    .delete()
    .eq('run_id', run_id)
    .in('ticker', claimedTickers);
  if (delErr) {
    throw new Error(`slice-worker: cursor delete failed: ${delErr.message}`);
  }

  // ── 6. Attempt CAS to 'finalizing'. The predicate guards against a
  //      racing slice that hasn't deleted its cursor rows yet; only the
  //      slice that drains the LAST cursor row wins. Idempotent across
  //      concurrent attempts — exactly one returns rowCount=1.
  const cas_won = await attemptFinalizingCAS(supabase, run_id, as_of);

  return {
    run_id, signal_id: config.signalId,
    claimed: claimed.length,
    succeeded: stagingRows.length,
    skipped: skipRows.length,
    cas_attempted: true,
    cas_won,
    empty: false,
  };
}

/**
 * Compare-and-set 'running' → 'finalizing' guarded by cursor-empty. The
 * predicate runs inside the UPDATE so a slice that's still mid-claim
 * (rows locked but not yet deleted) blocks the transition naturally — a
 * blocked predicate evaluates FALSE for the not-yet-committed delete and
 * the CAS no-ops; the next slice's CAS will succeed once the actual last
 * row is deleted.
 *
 * Implemented via RPC for the same reason as the claim: the cursor-empty
 * subquery must run inside the UPDATE's snapshot. RPC: `signal_queue_cas_finalizing
 * (p_run_id uuid, p_now timestamptz) returns boolean` — true iff this
 * caller won the CAS.
 */
async function attemptFinalizingCAS(
  supabase: SupabaseClient,
  run_id: string,
  as_of: Date,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('signal_queue_cas_finalizing', {
    p_run_id: run_id,
    p_now: as_of.toISOString(),
  });
  if (error) {
    throw new Error(`slice-worker: cas rpc failed: ${error.message}`);
  }
  return data === true;
}

async function bumpHeartbeat(
  supabase: SupabaseClient,
  run_id: string,
  as_of: Date,
): Promise<Error | null> {
  const { error } = await supabase
    .from('signal_queue_runs')
    .update({ heartbeat_at: as_of.toISOString(), updated_at: as_of.toISOString() })
    .eq('run_id', run_id)
    .eq('status', 'running');
  if (error) return new Error(`slice-worker: heartbeat bump failed: ${error.message}`);
  return null;
}

function defaultBucketFactory(ratePerSec: number): TokenBucket {
  // TokenBucket defaults route the clock through `productionClock` per
  // DEC-034 clause 4 — see token-bucket.ts header comment.
  return new TokenBucket({ ratePerSec });
}