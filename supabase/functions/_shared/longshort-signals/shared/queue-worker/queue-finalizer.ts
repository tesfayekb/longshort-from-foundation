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
import type { QueueSignalConfig } from './queue-config.ts';
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

  // ── 1. Read full staging + skip sets (the aggregation barrier
  //      guarantees the cursor is empty, so these reads are complete).
  const { data: stagingRaw, error: stageErr } = await supabase
    .from('signal_queue_staging')
    .select('ticker, gics_sector, raw_signal')
    .eq('run_id', run_id);
  if (stageErr) {
    return await transitionToFailed(ctx, runRow, `staging read failed: ${stageErr.message}`);
  }
  const staging = (stagingRaw ?? []) as StagingRow[];

  const { data: skipsRaw, error: skipErr } = await supabase
    .from('signal_queue_skips')
    .select('ticker, skip_reason, detail')
    .eq('run_id', run_id);
  if (skipErr) {
    return await transitionToFailed(ctx, runRow, `skips read failed: ${skipErr.message}`);
  }
  const skipsDb = (skipsRaw ?? []) as SkipRow[];

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
    universe_size: runRow.universe_size,
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