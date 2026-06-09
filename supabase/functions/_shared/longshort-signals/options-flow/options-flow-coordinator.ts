/**
 * Chunked coordinator for the FP-043 options-flow signal (Phase 3).
 *
 * Replaces the in-process orchestrator's "iterate the whole universe in
 * one isolate" model with a "shard universe → fan out HTTP POSTs to
 * `longshort-options-flow-worker` → aggregate slices → z-score → persist"
 * model so the cron window stays well under Tradier's 120 req/min cap
 * (ACT-157) while finishing within ~5–6 minutes wall clock.
 *
 * Workers run in parallel isolates; each carries its own token-bucket
 * sized at (CAP_PER_MIN × SAFETY) / 60 / N_WORKERS tokens/sec so the
 * sum across workers stays under the cap. There is no shared rate-limit
 * primitive across isolates; the conservative per-worker share IS the
 * "shared bucket" discipline.
 *
 * Partial-failure handling (Signal #4 lesson):
 *   - A worker that returns 2xx with `{values, skips}` is trusted; its
 *     skips flow straight into the aggregated skip ledger.
 *   - A worker that returns non-2xx, throws, times out, or returns a
 *     malformed payload → coordinator emits a `fetch_error` skip for
 *     EVERY ticker in that chunk with the failure attribution in the
 *     skip `detail`. The run does NOT silently report `completed` with
 *     dropped tickers — those tickers appear in `skipped_detail` so the
 *     `signal_compute_log` row carries the truth.
 *   - If EVERY worker fails AND no values landed, the coordinator
 *     returns `outcome: 'failed'` with a `failure_reason` summarizing
 *     the per-chunk failures. Otherwise (at least one worker succeeded)
 *     the outcome is `completed` with honest per-ticker skip attribution.
 *   - A persistence error (signal_observations upsert) is always
 *     `outcome: 'failed'`.
 *
 * Wall-clock discipline (DEC-034): all timestamps derive from the
 * caller-supplied `as_of: Date`. NO Date.now() / performance.now().
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 3)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import { SIGNAL_ID } from './options-flow-orchestrator.ts';
import type { ChunkInputTicker, ChunkValueRow } from './options-flow-chunk-runner.ts';

/** Tradier production cap (ACT-157). */
export const TRADIER_CAP_PER_MIN = 120;
/** Conservative cap utilisation — leaves room for fetcher 429 retries. */
export const SAFETY_UTILISATION = 0.85;
/** Default fan-out worker count (matches Phase-3 design). */
export const DEFAULT_N_WORKERS = 6;

/**
 * Per-worker token rate so the fan-out stays under the Tradier cap with
 * a safety margin. With defaults: 120 * 0.85 / 60 / 6 ≈ 0.283 req/sec
 * per worker → ≈102 req/min total.
 */
export function defaultRatePerWorkerPerSec(nWorkers: number): number {
  if (!Number.isFinite(nWorkers) || nWorkers <= 0) {
    throw new Error(`defaultRatePerWorkerPerSec: nWorkers must be > 0, got ${nWorkers}`);
  }
  return (TRADIER_CAP_PER_MIN * SAFETY_UTILISATION) / 60 / nWorkers;
}

/** Fetch shape the coordinator uses to call workers. Injectable for tests. */
export type WorkerFetch = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; statusText: string; text: () => Promise<string> }>;

export interface WorkerRequestBody {
  chunk: ChunkInputTicker[];
  as_of: string;
  rate_per_sec: number;
  correlation_id: string;
  chunk_index: number;
  total_chunks: number;
}

export interface WorkerResponseBody {
  ok: true;
  values: ChunkValueRow[];
  skips: SignalSkip[];
}

export interface OptionsFlowCoordinatorContext {
  supabase: SupabaseClient;
  operator_id: string;
  workerFetch: WorkerFetch;
  /** Full URL to the worker edge function. */
  workerUrl: string;
  /** Cron secret used to authenticate the coordinator → worker hop. */
  cronSecret: string;
  correlationId: string;
  nWorkers?: number;
  /** Override per-worker pacing (defaults to defaultRatePerWorkerPerSec). */
  ratePerWorkerPerSec?: number;
}

/** Even-stride sharding so chunk sizes differ by at most 1. */
export function shardUniverse<T>(items: ReadonlyArray<T>, nChunks: number): T[][] {
  if (nChunks <= 0) throw new Error(`shardUniverse: nChunks must be > 0, got ${nChunks}`);
  if (items.length === 0) return [];
  const actualN = Math.min(nChunks, items.length);
  const out: T[][] = Array.from({ length: actualN }, () => []);
  for (let i = 0; i < items.length; i += 1) {
    out[i % actualN].push(items[i]);
  }
  return out;
}

interface WorkerOutcome {
  index: number;
  values: ChunkValueRow[];
  skips: SignalSkip[];
  /** Non-null when the worker call failed; in that case `values` is empty
   *  and `skips` contains a fetch_error per ticker in the original chunk. */
  failure_reason: string | null;
}

async function invokeWorker(
  ctx: OptionsFlowCoordinatorContext,
  body: WorkerRequestBody,
): Promise<WorkerOutcome> {
  const failAllAsSkips = (reason: string): WorkerOutcome => ({
    index: body.chunk_index,
    values: [],
    skips: body.chunk.map((c) => ({
      ticker: c.ticker,
      reason: 'fetch_error',
      detail: `worker chunk ${body.chunk_index + 1}/${body.total_chunks} failed: ${reason}`,
    })),
    failure_reason: reason,
  });

  let resp: Awaited<ReturnType<WorkerFetch>>;
  try {
    resp = await ctx.workerFetch(ctx.workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': ctx.cronSecret,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return failAllAsSkips(`network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  let raw: string;
  try { raw = await resp.text(); } catch { raw = ''; }

  if (!resp.ok) {
    return failAllAsSkips(`HTTP ${resp.status} ${resp.statusText}: ${raw.slice(0, 200)}`);
  }

  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return failAllAsSkips(`malformed JSON response: ${raw.slice(0, 200)}`); }

  if (!isWorkerResponseBody(parsed)) {
    return failAllAsSkips(`worker response missing required fields`);
  }

  return {
    index: body.chunk_index,
    values: parsed.values,
    skips: parsed.skips,
    failure_reason: null,
  };
}

function isWorkerResponseBody(x: unknown): x is WorkerResponseBody {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return o.ok === true && Array.isArray(o.values) && Array.isArray(o.skips);
}

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

export async function runOptionsFlowCoordinator(
  ctx: OptionsFlowCoordinatorContext,
  as_of: Date,
): Promise<SignalOrchestratorResult> {
  const ts = as_of.toISOString();
  const started_at = ts;
  const as_of_date = ts.slice(0, 10);
  const nWorkers = ctx.nWorkers ?? DEFAULT_N_WORKERS;
  const ratePerSec = ctx.ratePerWorkerPerSec ?? defaultRatePerWorkerPerSec(nWorkers);

  // ── 1. Load latest universe ──────────────────────────────────────────
  const { data: latestRows, error: latestErr } = await ctx.supabase
    .from('universe_membership')
    .select('as_of_date')
    .eq('operator_id', ctx.operator_id)
    .order('as_of_date', { ascending: false })
    .limit(1);
  if (latestErr) {
    throw new Error(
      `options-flow-coordinator: universe_membership latest-date read failed: ${latestErr.message}`,
    );
  }
  const latest_as_of_date = latestRows && latestRows.length > 0
    ? (latestRows[0] as { as_of_date: string }).as_of_date
    : null;
  if (latest_as_of_date === null) {
    return emptyUniverseResult(as_of_date, started_at, ts);
  }

  const { data: universeRows, error: universeErr } = await ctx.supabase
    .from('universe_membership')
    .select('ticker, gics_sector')
    .eq('operator_id', ctx.operator_id)
    .eq('as_of_date', latest_as_of_date);
  if (universeErr) {
    throw new Error(
      `options-flow-coordinator: universe_membership read failed: ${universeErr.message}`,
    );
  }
  const universe = (universeRows ?? []) as UniverseRow[];
  if (universe.length === 0) {
    return emptyUniverseResult(as_of_date, started_at, ts);
  }

  // ── 2. Shard + fan out workers in parallel ──────────────────────────
  const chunks = shardUniverse(universe, nWorkers);
  const total_chunks = chunks.length;
  const outcomes = await Promise.all(chunks.map((chunk, idx) =>
    invokeWorker(ctx, {
      chunk,
      as_of: ts,
      rate_per_sec: ratePerSec,
      correlation_id: ctx.correlationId,
      chunk_index: idx,
      total_chunks,
    })
  ));

  const aggValues: ChunkValueRow[] = [];
  const aggSkips: SignalSkip[] = [];
  const failedChunks: Array<{ index: number; reason: string; size: number }> = [];
  for (const o of outcomes) {
    aggValues.push(...o.values);
    aggSkips.push(...o.skips);
    if (o.failure_reason !== null) {
      failedChunks.push({
        index: o.index,
        reason: o.failure_reason,
        size: chunks[o.index].length,
      });
    }
  }

  // ── 3. If every worker failed AND no values landed, surface FAILED ──
  if (aggValues.length === 0 && failedChunks.length === outcomes.length && outcomes.length > 0) {
    return {
      outcome: 'failed',
      signal_id: SIGNAL_ID,
      as_of_date,
      universe_size: universe.length,
      persisted_count: 0,
      skipped: aggSkips,
      failure_reason: `all ${outcomes.length} worker chunks failed: ` +
        failedChunks.map((f) => `[${f.index}] ${f.reason}`).join(' | '),
      started_at,
      completed_at: ts,
    };
  }

  // ── 4. Within-sector z-score ────────────────────────────────────────
  const zInputs = aggValues.map((v) => ({
    ticker: v.ticker,
    value: v.raw_signal,
    gics_sector: v.gics_sector,
  }));
  const zScored = zScoreNormalizeWithinSector(zInputs);

  const computed_at = ts;
  const rows: SignalRow[] = [];
  for (const z of zScored) {
    if (z.value === null) {
      const reason: SignalSkip['reason'] =
        z.gics_sector === null ? 'missing_sector' : 'singleton_sector';
      aggSkips.push({
        ticker: z.ticker,
        reason,
        detail: z.gics_sector
          ? `sector="${z.gics_sector}" yielded std=0`
          : 'gics_sector is null',
      });
      continue;
    }
    rows.push({
      operator_id: ctx.operator_id,
      signal_id: SIGNAL_ID,
      ticker: z.ticker,
      as_of_date,
      value: z.value,
      is_present: true,
      gics_sector: z.gics_sector,
      computed_at,
    });
  }

  // ── 5. Persist ──────────────────────────────────────────────────────
  const { inserted, error: persistErr } = await captureSignalObservations(
    ctx.supabase,
    rows,
  );
  if (persistErr) {
    return {
      outcome: 'failed',
      signal_id: SIGNAL_ID,
      as_of_date,
      universe_size: universe.length,
      persisted_count: 0,
      skipped: aggSkips,
      failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
      started_at,
      completed_at: ts,
    };
  }

  // If some chunks failed but others succeeded, the run is "completed"
  // with honest per-ticker fetch_error skips. The signal_compute_log row
  // carries the truth via skip_counts.fetch_error + skipped_detail.
  return {
    outcome: 'completed',
    signal_id: SIGNAL_ID,
    as_of_date,
    universe_size: universe.length,
    persisted_count: inserted,
    skipped: aggSkips,
    started_at,
    completed_at: ts,
  };
}

function emptyUniverseResult(
  as_of_date: string,
  started_at: string,
  completed_at: string,
): SignalOrchestratorResult {
  return {
    outcome: 'failed',
    signal_id: SIGNAL_ID,
    as_of_date,
    universe_size: 0,
    persisted_count: 0,
    skipped: [],
    failure_reason: 'empty_universe',
    started_at,
    completed_at,
  };
}