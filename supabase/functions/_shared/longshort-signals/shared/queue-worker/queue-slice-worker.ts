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
import {
  FEED_SYNTHETIC_TICKER,
  isFeedMode,
  type FeedFetchPageFn,
  type QueueSignalConfig,
  type TickerComputeFn,
} from './queue-config.ts';
import type { SignalSkip } from '../signal-types.ts';
import { TokenBucket } from '../../options-flow/token-bucket.ts';
import { productionClock, type ClockReader } from '../../../longshort-clock.ts';
import { maskSecretsInMessage } from './error-key-mask.ts';

/** INC-73 — consecutive feed-slice-throw threshold before terminal-failing the run. */
export const FEED_SLICE_FAILURE_THRESHOLD = 3;

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
  /**
   * INC-73 — Injectable wall-clock reader for the per-page heartbeat
   * monotonic-advance fix. Production callers omit this and accept the
   * `productionClock` default (DEC-034 clause 4 sanctioned exception);
   * tests inject a fixed clock to assert advancement under deterministic
   * timestamps. The kernel-frozen `as_of` is reserved for compute-input
   * timestamps (replay-determinism); heartbeats MUST track real time so
   * a long-running healthy slice never looks stale to the sweeper.
   */
  liveClock?: ClockReader;
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
  /** Engine mode the slice was processed under. Optional for backward-compat. */
  mode?: 'per-ticker' | 'sequential-feed';
  /** Feed mode only — pages fetched THIS slice (not cumulative). */
  pages_fetched?: number;
  /** Feed mode only — feed_items rows upserted THIS slice. */
  items_upserted?: number;
  /**
   * Feed mode only — set when the runaway guard tripped and the run was
   * transitioned to `failed`. Surfaces via the cron handler's audit
   * metadata so an operator sees the cause in the run.failed event.
   */
  runaway?: boolean;
}

interface ClaimedRow {
  ticker: string;
  gics_sector: string | null;
}

export async function runQueueSlice(
  ctx: QueueSliceWorkerContext,
): Promise<QueueSliceWorkerResult> {
  if (isFeedMode(ctx.config)) {
    return runFeedSlice(ctx);
  }
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
  const compute: TickerComputeFn = config.fetchAndCompute as TickerComputeFn;

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
    // FP-045 Phase 3 — acquire `callsPerName` tokens per ticker so the
    // pacer matches the actual vendor-call rate (PEAD adapter fires 2
    // Finnhub endpoints per ticker; options-flow fires 1). The
    // pre-flight arithmetic row in each consumer's registration uses
    // `(sliceSize × callsPerName) / ratePerSec` — the runtime must
    // match it for the budget to be honest. Backward-compatible:
    // callsPerName=1 (Phase 2 synthetic test config) is unchanged.
    for (let i = 0; i < (config.callsPerName as number); i++) {
      await bucket.acquire();
    }
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
    mode: 'per-ticker',
  };
}

// ───────────────────────────────────────────────────────────────────────
// FP-048 Phase 3a — sequential-feed slice variant
// ───────────────────────────────────────────────────────────────────────
//
// One cursor row per run (synthetic ticker `__feed__`). Each tick:
//   1. Claim via the same RPC (limit=1; SKIP LOCKED keeps cross-tick
//      serialization correct).
//   2. Read run-row {feed_cursor, feed_pages_fetched}.
//   3. Bump heartbeat (entry barrier vs sweeper).
//   4. Pump up to `pagesPerSlice` pages through the shared TokenBucket.
//      Each page: upsert items → advance run row (cursor + pages +
//      heartbeat) — heartbeat bumps on EVERY page, never just once per
//      slice (operator amendment: a 5-slice drain must not look stale
//      mid-page; a single 94.5s slice is well over the
//      heartbeatTimeoutSec of fast signals).
//   5. If `nextToken === null` → exhausted: DELETE cursor → attempt CAS
//      (predicate "no cursor rows" stays true-only-after-final-DELETE,
//      regardless of how many release cycles preceded it).
//      Else → RELEASE the claim (claimed_at := NULL) for the next tick.
//   6. If `feed_pages_fetched >= maxPages` before a page is even
//      attempted → fail the run with `max_pages_exceeded`, DELETE the
//      cursor row, return runaway=true. No CAS (terminal state set
//      directly; the sweeper would have done this anyway via the
//      heartbeat path but explicit failure is more diagnosable).
//
// Idempotency: `signal_queue_feed_items` PK (run_id, article_id, ticker)
// makes a same-page re-fetch (transient blip, manual replay) a no-op at
// the DB layer.  The advance-after-upsert ordering ensures we never
// lose items: if the run-row advance fails AFTER the upsert succeeded,
// the slice throws and the next tick re-claims with the OLD cursor,
// re-fetches the same page, and the upsert is harmless.
function processedCountSemanticsNote() {
  // Feed-mode processed-count semantics (per operator amendment):
  //   - `pages_fetched` (this slice) is reported in slice.completed
  //     audit metadata — the cumulative drain shows up in run row
  //     `feed_pages_fetched`.
  //   - `persisted_count` at finalize is the final UNIVERSE TICKER count
  //     (the per-name observations written); this is what shows in
  //     signal_compute_log and matches per-ticker mode's semantics.
  // The module doc (Phase 3b) names both explicitly so the telemetry is
  // not ambiguous between modes.
  return null;
}

async function runFeedSlice(
  ctx: QueueSliceWorkerContext,
): Promise<QueueSliceWorkerResult> {
  const { supabase, config, as_of, run_id } = ctx;
  const pagesPerSlice = config.pagesPerSlice as number;
  const maxPages = config.maxPages as number;
  const fetchPage = config.fetchPage as FeedFetchPageFn;

  // ── 1. Claim the singleton synthetic cursor row.
  const { data: claimedRaw, error: claimErr } = await supabase.rpc(
    'signal_queue_claim_slice',
    { p_run_id: run_id, p_limit: 1 },
  );
  if (claimErr) {
    throw new Error(`feed-slice: claim rpc failed: ${claimErr.message}`);
  }
  const claimed = (claimedRaw ?? []) as Array<{ ticker: string; gics_sector: string | null }>;
  if (claimed.length === 0) {
    // Cursor empty (or locked by a racing tick — same outcome). Try the
    // CAS in case this is the post-drain heartbeat tick.
    const cas = await attemptFinalizingCAS(supabase, run_id, as_of);
    return {
      run_id, signal_id: config.signalId,
      claimed: 0, succeeded: 0, skipped: 0,
      cas_attempted: true, cas_won: cas, empty: true,
      mode: 'sequential-feed', pages_fetched: 0, items_upserted: 0,
    };
  }

  // ── 2. Read run-row feed state.
  const { data: runRowRaw, error: runErr } = await supabase
    .from('signal_queue_runs')
    .select('feed_cursor, feed_pages_fetched')
    .eq('run_id', run_id)
    .single();
  if (runErr || !runRowRaw) {
    throw new Error(`feed-slice: run read failed: ${runErr?.message ?? 'no data'}`);
  }
  const runState = runRowRaw as { feed_cursor: string | null; feed_pages_fetched: number | null };
  let feedCursor: string | null = runState.feed_cursor ?? null;
  let pagesFetched: number = runState.feed_pages_fetched ?? 0;

  // ── 3. Entry heartbeat barrier.
  const hbErr = await bumpHeartbeat(supabase, run_id, as_of);
  if (hbErr) throw hbErr;

  // ── 4. Pump pages.
  const bucket = (ctx.bucketFactory ?? defaultBucketFactory)(config.ratePerSec);
  let pagesThisSlice = 0;
  let itemsUpserted = 0;
  let exhausted = false;

  for (let i = 0; i < pagesPerSlice; i++) {
    if (pagesFetched >= maxPages) {
      // Runaway guard — terminal-fail the run, clean cursor, return.
      const reason = `max_pages_exceeded (pages_fetched=${pagesFetched}, maxPages=${maxPages}, signal_id=${config.signalId})`;
      await failRunTerminal(supabase, run_id, as_of, reason);
      await supabase
        .from('signal_queue_cursor')
        .delete()
        .eq('run_id', run_id)
        .eq('ticker', FEED_SYNTHETIC_TICKER);
      return {
        run_id, signal_id: config.signalId,
        claimed: 1, succeeded: 0, skipped: 0,
        cas_attempted: false, cas_won: false, empty: false,
        mode: 'sequential-feed',
        pages_fetched: pagesThisSlice, items_upserted: itemsUpserted,
        runaway: true,
      };
    }

    // One bucket token per page (calls-per-page = 1 by feed-mode contract).
    await bucket.acquire();

    let page;
    try {
      page = await fetchPage({ cursorToken: feedCursor, asOf: as_of });
    } catch (e) {
      // A throw mid-drain is a slice failure (returned via thrown Error
      // → cron handler logs slice.failed). The next tick re-claims the
      // same cursor; idempotent retry via feed_items PK.
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`feed-slice: fetchPage threw on page ${pagesFetched + 1}: ${msg}`);
    }

    if (page.items.length > 0) {
      const rows = page.items.map((it) => ({
        run_id,
        article_id: it.articleId,
        ticker: it.ticker,
        sentiment_num: it.sentimentNum,
        tier_weight: it.tierWeight,
        published_utc: it.publishedUtc,
      }));
      const { error: itemsErr } = await supabase
        .from('signal_queue_feed_items')
        .upsert(rows, { onConflict: 'run_id,article_id,ticker', ignoreDuplicates: false });
      if (itemsErr) {
        throw new Error(`feed-slice: feed_items upsert failed: ${itemsErr.message}`);
      }
      itemsUpserted += rows.length;
    }

    feedCursor = page.nextToken;
    pagesFetched += 1;
    pagesThisSlice += 1;

    // Per-page advance + heartbeat. Status=running guard preserves the
    // sweeper's CAS-to-failed claim if it already won.
    const ts = as_of.toISOString();
    const { error: advanceErr } = await supabase
      .from('signal_queue_runs')
      .update({
        feed_cursor: feedCursor,
        feed_pages_fetched: pagesFetched,
        heartbeat_at: ts,
        updated_at: ts,
      })
      .eq('run_id', run_id)
      .eq('status', 'running');
    if (advanceErr) {
      throw new Error(`feed-slice: run advance failed: ${advanceErr.message}`);
    }

    if (page.nextToken === null) {
      exhausted = true;
      break;
    }
  }

  // ── 5. Exhausted → DELETE + CAS. Else RELEASE the claim.
  let casWon = false;
  if (exhausted) {
    const { error: delErr } = await supabase
      .from('signal_queue_cursor')
      .delete()
      .eq('run_id', run_id)
      .eq('ticker', FEED_SYNTHETIC_TICKER);
    if (delErr) {
      throw new Error(`feed-slice: cursor delete failed: ${delErr.message}`);
    }
    casWon = await attemptFinalizingCAS(supabase, run_id, as_of);
  } else {
    const { error: relErr } = await supabase
      .from('signal_queue_cursor')
      .update({ claimed_at: null })
      .eq('run_id', run_id)
      .eq('ticker', FEED_SYNTHETIC_TICKER);
    if (relErr) {
      throw new Error(`feed-slice: cursor release failed: ${relErr.message}`);
    }
  }

  return {
    run_id, signal_id: config.signalId,
    claimed: 1, succeeded: itemsUpserted, skipped: 0,
    cas_attempted: exhausted, cas_won: casWon, empty: false,
    mode: 'sequential-feed',
    pages_fetched: pagesThisSlice, items_upserted: itemsUpserted,
  };
}

async function failRunTerminal(
  supabase: SupabaseClient,
  run_id: string,
  as_of: Date,
  failure_reason: string,
): Promise<void> {
  const ts = as_of.toISOString();
  const { error } = await supabase
    .from('signal_queue_runs')
    .update({
      status: 'failed',
      failure_reason,
      finalized_at: ts,
      heartbeat_at: ts,
      updated_at: ts,
    })
    .eq('run_id', run_id)
    .in('status', ['running', 'finalizing']);
  if (error) {
    throw new Error(`feed-slice: failRunTerminal update failed: ${error.message}`);
  }
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