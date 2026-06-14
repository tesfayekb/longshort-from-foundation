/**
 * Finalizer — invoked by the slice-worker that wins the
 * 'running' → 'finalizing' CAS. Reads the complete staging set + skip
 * set for the run, applies within-sector z-score (the existing shared
 * normalizer — addendum §7: engine carries no divisor/floor policy),
 * persists `signal_observations`, writes one `signal_compute_log` row,
 * and CASes 'finalizing' → 'completed'.
 *
 * Idempotency (the finalizer-re-entry test target):
 *   - The 'finalizing' → 'completed' CAS guards against a second
 *     invocation that observes the same status. If the second caller's
 *     CAS returns 0 rows, it returns the existing run_id from
 *     signal_compute_log without re-writing anything.
 *   - `signal_observations` upsert is on (operator_id, signal_id,
 *     as_of_date, ticker) — same-row replay is harmless (last-writer-
 *     wins; the inputs come from the immutable staging set so the
 *     "last writer" writes identical bytes).
 *   - `signal_compute_log` is keyed by `run_id` via a unique constraint
 *     conceptually; the finalizer never inserts a second row for the
 *     same run_id because the CAS gate above prevents it.
 *
 * Failure path:
 *   - Any error during read / z-score / persist transitions the run to
 *     status='failed' with a `failure_reason`. signal_compute_log is
 *     still written (outcome='failed') for telemetry parity with the
 *     non-queue cron handlers.
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isFeedMode,
  isWorkListMode,
  type FeedComputeFromItemsFn,
  type QueueSignalConfig,
  type TickerComputeResult,
  type WorkListLoadAndComputeFn,
} from './queue-config.ts';
import type { SignalRow, SignalSkip, SignalSkipReason } from '../signal-types.ts';
import { zScoreNormalizeWithinSector } from '../z-score-normalize.ts';
import { captureSignalObservations } from '../missingness-capture.ts';
import { persistSignalComputeLog } from '../../../persist-signal-compute-log.ts';
import type { SignalOrchestratorResult } from '../signal-orchestrator-types.ts';

export interface QueueFinalizerContext {
  supabase: SupabaseClient;
  config: QueueSignalConfig;
  operator_id: string;
  as_of: Date;
  run_id: string;
}

export type QueueFinalizerResult =
  | { kind: 'finalized'; run_id: string; compute_log_run_id: string | null; outcome: 'completed' | 'failed'; persisted_count: number; }
  | { kind: 'already_finalized'; run_id: string; }
  | { kind: 'not_eligible'; run_id: string; observed_status: string | null; };

interface RunRow {
  run_id: string;
  signal_id: string;
  as_of_date: string;
  status: string;
  universe_size: number;
  created_at: string;
}

interface StagingRow {
  ticker: string;
  gics_sector: string | null;
  raw_signal: number;
}

interface SkipRow {
  ticker: string;
  skip_reason: string;
  detail: string | null;
}

interface FeedItemRow {
  article_id: string;
  ticker: string;
  sentiment_num: number;
  tier_weight: number;
  published_utc: string;
}

interface UniverseFinalizerRow {
  ticker: string;
  gics_sector: string | null;
}

export async function runQueueFinalizer(
  ctx: QueueFinalizerContext,
): Promise<QueueFinalizerResult> {
  const { supabase, config, operator_id, as_of, run_id } = ctx;

  // ── 0. Re-check status. Only 'finalizing' is eligible; 'completed' is
  //      already-done; anything else means the sweeper or another path
  //      moved it and we should no-op rather than fight.
  const { data: runRowRaw, error: runErr } = await supabase
    .from('signal_queue_runs')
    .select('run_id, signal_id, as_of_date, status, universe_size, created_at')
    .eq('run_id', run_id)
    .single();
  if (runErr || !runRowRaw) {
    throw new Error(`finalizer: run row read failed: ${runErr?.message ?? 'no data'}`);
  }
  const runRow = runRowRaw as RunRow;
  if (runRow.status === 'completed' || runRow.status === 'failed') {
    return { kind: 'already_finalized', run_id };
  }
  if (runRow.status !== 'finalizing') {
    return { kind: 'not_eligible', run_id, observed_status: runRow.status };
  }

  // ── 1. Build the (staging, upstreamSkips) pair. Per-ticker mode reads
  //      both from DB tables (the slice-workers wrote them). Feed mode
  //      derives both IN-MEMORY by re-loading universe + grouping
  //      feed_items and invoking computeFromItems per universe ticker
  //      (no staging-table writes for feed mode — feed_items is the
  //      durable record; staging writes would be redundant disk traffic
  //      with zero diagnostic value feed_items doesn't already provide).
  //      Work-list mode (FP-050 Phase 3.6a) calls the consumer's
  //      loadAndCompute({asOf}) which reads from the consumer-private
  //      persistence table (e.g. insider_form4_rows) over its window
  //      and returns one TickerComputeResult per universe ticker. NO
  //      staging reads, NO feed_items reads, NO signal_queue_skips reads
  //      (those carry item-scope skips for telemetry only — Q4 two-ledger).
  let staging: StagingRow[];
  let skipsDb: SkipRow[];
  // Work-list mode override: runRow.universe_size holds the producer-side
  // accession-count ledger (correct for sweeper/budget contract). The
  // consumer-owned mass-balance universe-membership count is derived from
  // loadAndCompute's per-ticker result count and surfaced via
  // buildWorkListAggregates. Path (ii) ACT-218.
  let workListUniverseSize: number | null = null;
  if (isWorkListMode(config)) {
    const res = await buildWorkListAggregates(ctx, runRow);
    if (res.kind === 'failed') {
      return await transitionToFailed(ctx, runRow, res.reason);
    }
    staging = res.staging;
    skipsDb = res.skips;
    workListUniverseSize = res.universe_size;
  } else if (isFeedMode(config)) {
    const res = await buildFeedAggregates(ctx, runRow);
    if (res.kind === 'failed') {
      return await transitionToFailed(ctx, runRow, res.reason);
    }
    staging = res.staging;
    skipsDb = res.skips;
  } else {
    const { data: stagingRaw, error: stageErr } = await supabase
      .from('signal_queue_staging')
      .select('ticker, gics_sector, raw_signal')
      .eq('run_id', run_id);
    if (stageErr) {
      return await transitionToFailed(ctx, runRow, `staging read failed: ${stageErr.message}`);
    }
    staging = (stagingRaw ?? []) as StagingRow[];

    const { data: skipsRaw, error: skipErr } = await supabase
      .from('signal_queue_skips')
      .select('ticker, skip_reason, detail')
      .eq('run_id', run_id);
    if (skipErr) {
      return await transitionToFailed(ctx, runRow, `skips read failed: ${skipErr.message}`);
    }
    skipsDb = (skipsRaw ?? []) as SkipRow[];
  }

  // ── 2. Within-sector z-score. Degenerate sectors (singleton OR std=0)
  //      emit value=null per the existing normalizer contract; the
  //      engine carries no divisor policy — Phase 2 addendum §7.
  const zInputs = staging.map((s) => ({
    ticker: s.ticker,
    value: s.raw_signal,
    gics_sector: s.gics_sector,
  }));
  const zOutputs = zScoreNormalizeWithinSector(zInputs);

  // Tickers whose z-score collapsed to null because of a degenerate
  // sector get a `singleton_sector` skip — but ONLY when they weren't
  // already accounted for via a missing_sector path (gics_sector === null).
  const computed_at = as_of.toISOString();
  const as_of_date = runRow.as_of_date;

  const observations: SignalRow[] = [];
  const degenerateSkips: SignalSkip[] = [];
  for (const z of zOutputs) {
    observations.push({
      operator_id, signal_id: config.signalId, ticker: z.ticker,
      as_of_date, value: z.value, is_present: z.value !== null,
      gics_sector: z.gics_sector, computed_at,
    });
    if (z.value === null) {
      degenerateSkips.push({
        ticker: z.ticker,
        reason: z.gics_sector === null ? 'missing_sector' : 'singleton_sector',
        detail: z.gics_sector === null
          ? 'gics_sector null at finalizer time'
          : `sector '${z.gics_sector}' has σ=0 or singleton membership`,
      });
    }
  }

  // ── 3. Persist signal_observations.
  const capture = await captureSignalObservations(supabase, observations);
  if (capture.error) {
    return await transitionToFailed(ctx, runRow, capture.error.message);
  }

  // ── 4. Build the SignalOrchestratorResult shape for the existing
  //      persist-signal-compute-log helper — keeps the telemetry shape
  //      identical between queue-based and in-process orchestrators.
  const skippedAll: SignalSkip[] = [
    ...skipsDb.map((s) => ({
      ticker: s.ticker,
      reason: s.skip_reason as SignalSkipReason,
      detail: s.detail ?? '',
    })),
    ...degenerateSkips,
  ];

  const result: SignalOrchestratorResult = {
    outcome: 'completed',
    signal_id: config.signalId,
    as_of_date,
    universe_size: workListUniverseSize ?? runRow.universe_size,
    persisted_count: capture.inserted,
    skipped: skippedAll,
    started_at: runRow.created_at,
    completed_at: computed_at,
  };

  const { run_id: compute_log_run_id, persist_error } = await persistSignalComputeLog(
    supabase, result, operator_id,
  );
  if (persist_error) {
    return await transitionToFailed(ctx, runRow, persist_error.message);
  }

  // ── 5. CAS 'finalizing' → 'completed' (idempotency gate against a
  //      second finalizer invocation arriving on the same run_id).
  const completed = await casToTerminal(supabase, run_id, 'completed', null, as_of);
  if (!completed) {
    // Another path already terminalized this run — no-op.
    return { kind: 'already_finalized', run_id };
  }

  return {
    kind: 'finalized', run_id,
    compute_log_run_id, outcome: 'completed',
    persisted_count: capture.inserted,
  };
}

/**
 * Feed-mode aggregation — re-load universe (mass-balance source of
 * truth), group feed_items by ticker, invoke `computeFromItems` per
 * universe name (including names with zero items so the consumer can
 * emit `no_articles_in_window` — mass balance ruling 839). Returns an
 * in-memory staging-shaped list + skip list that the existing z + persist
 * pipeline consumes unchanged.
 */
async function buildFeedAggregates(
  ctx: QueueFinalizerContext,
  runRow: RunRow,
): Promise<
  | { kind: 'ok'; staging: StagingRow[]; skips: SkipRow[] }
  | { kind: 'failed'; reason: string }
> {
  const { supabase, config, operator_id, as_of } = ctx;
  const compute = config.computeFromItems as FeedComputeFromItemsFn;

  // 1. Re-load the universe used by init for this (operator, as_of_date).
  //    Init seeds universe_size from a LATEST snapshot read; we re-read
  //    the SAME snapshot here so the mass-balance invariant holds even if
  //    the universe table mutated between init and finalize. The
  //    operator's daily universe-refresh is a 1×/day write; the
  //    finalizer running within a single intraday drain (5-6 min worst)
  //    sees the same snapshot init saw.
  const { data: latestRows, error: latestErr } = await supabase
    .from('universe_membership')
    .select('as_of_date')
    .eq('operator_id', operator_id)
    .order('as_of_date', { ascending: false })
    .limit(1);
  if (latestErr) {
    return { kind: 'failed', reason: `feed-finalizer: universe latest-date probe failed: ${latestErr.message}` };
  }
  const latest = latestRows && latestRows.length > 0
    ? (latestRows[0] as { as_of_date: string }).as_of_date
    : null;
  if (latest === null) {
    return { kind: 'failed', reason: 'feed-finalizer: universe snapshot disappeared between init and finalize' };
  }
  const { data: universeRaw, error: universeErr } = await supabase
    .from('universe_membership')
    .select('ticker, gics_sector')
    .eq('operator_id', operator_id)
    .eq('as_of_date', latest);
  if (universeErr) {
    return { kind: 'failed', reason: `feed-finalizer: universe read failed: ${universeErr.message}` };
  }
  const universe = (universeRaw ?? []) as UniverseFinalizerRow[];
  if (universe.length === 0) {
    return { kind: 'failed', reason: 'feed-finalizer: universe snapshot empty at finalize-time' };
  }

  // 2. Load feed_items for the run, group by ticker.
  const { data: itemsRaw, error: itemsErr } = await supabase
    .from('signal_queue_feed_items')
    .select('article_id, ticker, sentiment_num, tier_weight, published_utc')
    .eq('run_id', runRow.run_id);
  if (itemsErr) {
    return { kind: 'failed', reason: `feed-finalizer: feed_items read failed: ${itemsErr.message}` };
  }
  const items = (itemsRaw ?? []) as FeedItemRow[];
  const byTicker = new Map<string, FeedItemRow[]>();
  for (const it of items) {
    const arr = byTicker.get(it.ticker);
    if (arr) arr.push(it);
    else byTicker.set(it.ticker, [it]);
  }

  // 3. Per universe ticker, call computeFromItems → value or typed skip.
  const staging: StagingRow[] = [];
  const skips: SkipRow[] = [];
  const detailFor = (s: { reason: string; detail: string }) => s.detail;
  for (const u of universe) {
    const tickerItems = (byTicker.get(u.ticker) ?? []).map((r) => ({
      articleId: r.article_id,
      sentimentNum: r.sentiment_num,
      tierWeight: r.tier_weight,
      publishedUtc: r.published_utc,
    }));
    let result;
    try {
      result = compute({
        ticker: u.ticker,
        gicsSector: u.gics_sector,
        items: tickerItems,
        asOf: as_of,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skips.push({ ticker: u.ticker, skip_reason: 'fetch_error', detail: `computeFromItems threw: ${msg}` });
      continue;
    }
    if (result.kind === 'value') {
      if (!Number.isFinite(result.raw)) {
        skips.push({
          ticker: u.ticker,
          skip_reason: 'fetch_error',
          detail: `computeFromItems returned non-finite value: ${result.raw}`,
        });
      } else {
        staging.push({
          ticker: u.ticker,
          gics_sector: u.gics_sector,
          raw_signal: result.raw,
        });
      }
    } else {
      skips.push({
        ticker: u.ticker,
        skip_reason: result.reason,
        detail: detailFor(result),
      });
    }
  }

  return { kind: 'ok', staging, skips };
}

/**
 * Work-list-mode aggregation (FP-050 Phase 3.6a) — calls the consumer's
 * loadAndCompute({asOf}) which reads from the consumer-private
 * persistence table over its window and returns one TickerComputeResult
 * per universe ticker. The engine never touches the consumer's table.
 *
 * Mass-balance (Q4 two-ledger): the 839 universe-name accounting is
 * CONSUMER's responsibility — every universe ticker must appear in
 * loadAndCompute's return (value OR typed skip). Item-scope permanent
 * skips in signal_queue_skips are telemetry-only and NOT read here.
 */
async function buildWorkListAggregates(
  ctx: QueueFinalizerContext,
  _runRow: RunRow,
): Promise<
  | { kind: 'ok'; staging: StagingRow[]; skips: SkipRow[] }
  | { kind: 'failed'; reason: string }
> {
  const { config, as_of } = ctx;
  const loadAndCompute = config.loadAndCompute as WorkListLoadAndComputeFn;

  let results: ReadonlyArray<{ ticker: string; gicsSector: string | null; result: TickerComputeResult }>;
  try {
    results = await loadAndCompute({ asOf: as_of });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: 'failed', reason: `work-list-finalizer: loadAndCompute threw: ${msg}` };
  }

  const staging: StagingRow[] = [];
  const skips: SkipRow[] = [];
  for (const r of results) {
    if (r.result.kind === 'value') {
      if (!Number.isFinite(r.result.raw)) {
        skips.push({
          ticker: r.ticker,
          skip_reason: 'fetch_error',
          detail: `loadAndCompute returned non-finite value: ${r.result.raw}`,
        });
      } else {
        staging.push({
          ticker: r.ticker,
          gics_sector: r.gicsSector,
          raw_signal: r.result.raw,
        });
      }
    } else {
      skips.push({
        ticker: r.ticker,
        skip_reason: r.result.reason,
        detail: r.result.detail,
      });
    }
  }

  return { kind: 'ok', staging, skips };
}

async function transitionToFailed(
  ctx: QueueFinalizerContext,
  runRow: RunRow,
  failure_reason: string,
): Promise<QueueFinalizerResult> {
  const { supabase, config, operator_id, as_of, run_id } = ctx;
  const computed_at = as_of.toISOString();

  const result: SignalOrchestratorResult = {
    outcome: 'failed',
    signal_id: config.signalId,
    as_of_date: runRow.as_of_date,
    universe_size: runRow.universe_size,
    persisted_count: 0,
    skipped: [],
    failure_reason,
    started_at: runRow.created_at,
    completed_at: computed_at,
  };
  const { run_id: compute_log_run_id } = await persistSignalComputeLog(
    supabase, result, operator_id,
  ).catch(() => ({ run_id: null, persist_error: null }));

  await casToTerminal(supabase, run_id, 'failed', failure_reason, as_of);
  return {
    kind: 'finalized', run_id, compute_log_run_id,
    outcome: 'failed', persisted_count: 0,
  };
}

async function casToTerminal(
  supabase: SupabaseClient,
  run_id: string,
  terminal: 'completed' | 'failed',
  failure_reason: string | null,
  as_of: Date,
): Promise<boolean> {
  const ts = as_of.toISOString();
  // PostgREST returns the affected-row count via the `count: 'exact'`
  // option; we use it as the CAS-won signal.
  const update: Record<string, unknown> = {
    status: terminal,
    finalized_at: ts,
    updated_at: ts,
  };
  if (failure_reason !== null) update.failure_reason = failure_reason;
  const { error, count } = await supabase
    .from('signal_queue_runs')
    .update(update, { count: 'exact' })
    .eq('run_id', run_id)
    .eq('status', 'finalizing');
  if (error) throw new Error(`finalizer: terminal CAS failed: ${error.message}`);
  return (count ?? 0) === 1;
}