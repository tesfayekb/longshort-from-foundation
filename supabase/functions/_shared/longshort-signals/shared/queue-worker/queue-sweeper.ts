/**
 * Orphan-sweeper — runs every 5 minutes from the cron handler. Two jobs:
 *
 *   (1) Stale-heartbeat fail-out. For every registered signal_id, find
 *       runs in status ∈ {'running','finalizing'} whose `heartbeat_at`
 *       is older than `heartbeatTimeoutSec` and CAS them to 'failed'
 *       with failure_reason='stale_heartbeat'. This is what catches a
 *       slice-worker that died mid-claim or a finalizer that crashed
 *       between the CAS-to-finalizing and the CAS-to-completed.
 *
 *   (2) Staging TTL. For runs in terminal state ('completed' | 'failed')
 *       whose finalized_at is older than `stagingTtlSec`, delete the
 *       associated staging + skip rows. Cursor rows are cleaned by the
 *       finalize path (they're consumed by the slice-workers before
 *       finalize even runs), but staging is retained briefly for
 *       diagnosability — the TTL bounds it.
 *
 * Per-signal config is consulted via the registry: each signal owns its
 * own timeouts (PEAD's heartbeat ceiling differs from a faster signal's).
 * A signal that's never registered is invisible to the sweeper, which is
 * correct: no consumer means no runs to sweep.
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueConfigRegistry } from './queue-config.ts';

export interface QueueSweeperContext {
  supabase: SupabaseClient;
  registry: QueueConfigRegistry;
  as_of: Date;
}

export interface QueueSweeperResult {
  per_signal: Array<{
    signal_id: string;
    failed_out: number;        // CAS-to-failed wins
    staging_pruned: number;    // staging+skip rows deleted
    runs_pruned: number;       // terminal runs that had staging pruned
  }>;
  total_failed_out: number;
  total_staging_pruned: number;
}

interface OpenRunRow {
  run_id: string;
  status: string;
  heartbeat_at: string;
}

interface TerminalRunRow {
  run_id: string;
  finalized_at: string;
}

export async function runQueueSweeper(
  ctx: QueueSweeperContext,
): Promise<QueueSweeperResult> {
  const { supabase, registry, as_of } = ctx;
  const nowMs = as_of.getTime();
  const nowIso = as_of.toISOString();

  const perSignal: QueueSweeperResult['per_signal'] = [];
  let totalFailed = 0;
  let totalStagingPruned = 0;

  for (const signalId of registry.listSignalIds()) {
    const cfg = registry.get(signalId);

    // ── (1) Stale-heartbeat fail-out.
    const heartbeatCutoff = new Date(nowMs - cfg.heartbeatTimeoutSec * 1000).toISOString();
    const { data: staleRaw, error: staleErr } = await supabase
      .from('signal_queue_runs')
      .select('run_id, status, heartbeat_at')
      .eq('signal_id', signalId)
      .in('status', ['running', 'finalizing'])
      .lt('heartbeat_at', heartbeatCutoff);
    if (staleErr) {
      throw new Error(`sweeper[${signalId}]: stale probe failed: ${staleErr.message}`);
    }
    const stale = (staleRaw ?? []) as OpenRunRow[];

    let failed_out = 0;
    for (const row of stale) {
      // CAS guarded by status so a slice-worker that just bumped the
      // heartbeat wins over us — sweeper is best-effort, not preemptive.
      const { error: casErr, count } = await supabase
        .from('signal_queue_runs')
        .update(
          {
            status: 'failed',
            failure_reason: `stale_heartbeat (last beat ${row.heartbeat_at}, observed ${nowIso}, status was ${row.status})`,
            finalized_at: nowIso,
            updated_at: nowIso,
          },
          { count: 'exact' },
        )
        .eq('run_id', row.run_id)
        .eq('status', row.status)
        .lt('heartbeat_at', heartbeatCutoff);
      if (casErr) {
        throw new Error(`sweeper[${signalId}]: fail-out CAS error: ${casErr.message}`);
      }
      if ((count ?? 0) === 1) failed_out += 1;
    }

    // ── (2) Staging TTL for terminal runs.
    const stagingCutoff = new Date(nowMs - cfg.stagingTtlSec * 1000).toISOString();
    const { data: terminalRaw, error: terminalErr } = await supabase
      .from('signal_queue_runs')
      .select('run_id, finalized_at')
      .eq('signal_id', signalId)
      .in('status', ['completed', 'failed'])
      .not('finalized_at', 'is', null)
      .lt('finalized_at', stagingCutoff);
    if (terminalErr) {
      throw new Error(`sweeper[${signalId}]: terminal probe failed: ${terminalErr.message}`);
    }
    const terminal = (terminalRaw ?? []) as TerminalRunRow[];

    let staging_pruned = 0;
    let runs_pruned = 0;
    for (const row of terminal) {
      const { error: stageDelErr, count: stageCount } = await supabase
        .from('signal_queue_staging')
        .delete({ count: 'exact' })
        .eq('run_id', row.run_id);
      if (stageDelErr) {
        throw new Error(`sweeper[${signalId}]: staging prune failed: ${stageDelErr.message}`);
      }
      const { error: skipDelErr, count: skipCount } = await supabase
        .from('signal_queue_skips')
        .delete({ count: 'exact' })
        .eq('run_id', row.run_id);
      if (skipDelErr) {
        throw new Error(`sweeper[${signalId}]: skips prune failed: ${skipDelErr.message}`);
      }
      // FP-048 Phase 3a — also prune signal_queue_feed_items for feed-mode
      // runs. Per-ticker runs have zero rows here (no-op); rolled into the
      // staging_pruned aggregate per operator amendment to avoid changing
      // the existing sweeper audit-event metadata shape.
      const { error: feedDelErr, count: feedCount } = await supabase
        .from('signal_queue_feed_items')
        .delete({ count: 'exact' })
        .eq('run_id', row.run_id);
      if (feedDelErr) {
        throw new Error(`sweeper[${signalId}]: feed_items prune failed: ${feedDelErr.message}`);
      }
      const pruned = (stageCount ?? 0) + (skipCount ?? 0) + (feedCount ?? 0);
      if (pruned > 0) runs_pruned += 1;
      staging_pruned += pruned;
    }

    perSignal.push({ signal_id: signalId, failed_out, staging_pruned, runs_pruned });
    totalFailed += failed_out;
    totalStagingPruned += staging_pruned;
  }

  return {
    per_signal: perSignal,
    total_failed_out: totalFailed,
    total_staging_pruned: totalStagingPruned,
  };
}

/**
 * Oldest open run picker — used by the slice handler to implement the
 * addendum §5 "OLDEST running run across ALL signals" serialization
 * rule. Lives here (sweeper module) because it shares the cross-signal
 * survey shape; the slice handler imports it.
 */
export async function pickOldestRunningRun(
  supabase: SupabaseClient,
  registry: QueueConfigRegistry,
): Promise<{ run_id: string; signal_id: string } | null> {
  const ids = registry.listSignalIds();
  if (ids.length === 0) return null;
  const { data, error } = await supabase
    .from('signal_queue_runs')
    .select('run_id, signal_id, created_at')
    .in('signal_id', ids)
    .eq('status', 'running')
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    throw new Error(`pickOldestRunningRun: probe failed: ${error.message}`);
  }
  if (!data || data.length === 0) return null;
  const r = data[0] as { run_id: string; signal_id: string };
  return { run_id: r.run_id, signal_id: r.signal_id };
}