/**
 * Queue-init — seeds a `signal_queue_runs` row + per-ticker
 * `signal_queue_cursor` rows from the latest `universe_membership`
 * snapshot. The init handler returns 202 as soon as this completes; the
 * slice-worker cron drains the cursor across subsequent invocations.
 *
 * Idempotency strategy:
 *   - One running run per (signal_id, as_of_date) at a time. We refuse
 *     a second init when an open ('running' | 'finalizing') run exists
 *     for the same (signal_id, as_of_date) — the sweeper or finalizer
 *     is responsible for closing it. This prevents a double-init from
 *     fragmenting work across two cursors (which would yield a partial
 *     finalize the moment one drains).
 *   - The cursor insert is a single batched insert under the new
 *     run_id; the cursor PK is (run_id, ticker) so re-running with a
 *     fresh run_id can never collide with prior cursors.
 *
 * Wall-clock discipline: `as_of` is supplied by the caller (handler
 * derives it from `productionClock`). NO `new Date()` / `Date.now()`
 * in this file.
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FEED_SYNTHETIC_TICKER,
  isFeedMode,
  type QueueSignalConfig,
} from './queue-config.ts';

export interface QueueInitContext {
  supabase: SupabaseClient;
  operator_id: string;
  config: QueueSignalConfig;
  as_of: Date;
}

export type QueueInitResult =
  | {
      kind: 'started';
      run_id: string;
      signal_id: string;
      as_of_date: string;
      universe_size: number;
    }
  | {
      kind: 'empty_universe';
      signal_id: string;
      as_of_date: string;
    }
  | {
      kind: 'already_open';
      signal_id: string;
      as_of_date: string;
      existing_run_id: string;
      existing_status: string;
    };

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

export async function initQueueRun(ctx: QueueInitContext): Promise<QueueInitResult> {
  const { supabase, operator_id, config, as_of } = ctx;
  const as_of_iso = as_of.toISOString();
  const as_of_date = as_of_iso.slice(0, 10);

  // ── 1. Idempotency guard: existing open run for (signal, as_of_date)?
  const { data: openRows, error: openErr } = await supabase
    .from('signal_queue_runs')
    .select('run_id, status')
    .eq('signal_id', config.signalId)
    .eq('as_of_date', as_of_date)
    .in('status', ['running', 'finalizing'])
    .limit(1);
  if (openErr) {
    throw new Error(`queue-init: open-run probe failed: ${openErr.message}`);
  }
  if (openRows && openRows.length > 0) {
    const r = openRows[0] as { run_id: string; status: string };
    return {
      kind: 'already_open',
      signal_id: config.signalId,
      as_of_date,
      existing_run_id: r.run_id,
      existing_status: r.status,
    };
  }

  // ── 2. Load latest universe snapshot.
  const { data: latestRows, error: latestErr } = await supabase
    .from('universe_membership')
    .select('as_of_date')
    .eq('operator_id', operator_id)
    .order('as_of_date', { ascending: false })
    .limit(1);
  if (latestErr) {
    throw new Error(`queue-init: universe latest-date probe failed: ${latestErr.message}`);
  }
  const latest = latestRows && latestRows.length > 0
    ? (latestRows[0] as { as_of_date: string }).as_of_date
    : null;
  if (latest === null) {
    return { kind: 'empty_universe', signal_id: config.signalId, as_of_date };
  }

  const { data: universeRows, error: universeErr } = await supabase
    .from('universe_membership')
    .select('ticker, gics_sector')
    .eq('operator_id', operator_id)
    .eq('as_of_date', latest);
  if (universeErr) {
    throw new Error(`queue-init: universe read failed: ${universeErr.message}`);
  }
  const universe = (universeRows ?? []) as UniverseRow[];
  if (universe.length === 0) {
    return { kind: 'empty_universe', signal_id: config.signalId, as_of_date };
  }

  // ── 3. Insert run row (RETURNING run_id).
  //      Feed mode (FP-048 Phase 3a) carries the same run row + the new
  //      `feed_cursor` / `feed_pages_fetched` columns (MIG-089a; default
  //      NULL / 0 at insert time). The mode discriminator goes in
  //      `metadata.mode` for telemetry-side diagnosability.
  const mode: 'per-ticker' | 'sequential-feed' = isFeedMode(config)
    ? 'sequential-feed'
    : 'per-ticker';
  const { data: runRow, error: runErr } = await supabase
    .from('signal_queue_runs')
    .insert({
      signal_id: config.signalId,
      operator_id,
      as_of_date,
      status: 'running',
      universe_size: universe.length,
      heartbeat_at: as_of_iso,
      metadata: { as_of: as_of_iso, job_id: config.jobId, mode },
    })
    .select('run_id')
    .single();
  if (runErr || !runRow) {
    throw new Error(`queue-init: run insert failed: ${runErr?.message ?? 'no data'}`);
  }
  const run_id = (runRow as { run_id: string }).run_id;

  // ── 4. Seed the cursor.
  //      per-ticker mode: one row per universe ticker (claimed across many
  //        slices via SKIP LOCKED).
  //      sequential-feed mode: ONE synthetic-ticker row holding the
  //        run-level feed claim. The actual pagination token lives in
  //        signal_queue_runs.feed_cursor; this cursor row exists only
  //        so the existing claim/release/CAS-on-cursor-empty primitives
  //        work unmodified (the CAS predicate fires the moment this
  //        single row is DELETEd at feed exhaustion).
  //      The `signal_queue_cursor.gics_sector` column is nullable in
  //      MIG-082 (line 93: `gics_sector text` — no NOT NULL); MIG-089a
  //      re-asserts this as an idempotent precondition. NO sentinel
  //      string is invented for the feed row's sector (that would be a
  //      banned anti-phantom fake-numeric's string cousin).
  const cursorRows = isFeedMode(config)
    ? [{
        run_id,
        signal_id: config.signalId,
        ticker: FEED_SYNTHETIC_TICKER,
        gics_sector: null,
      }]
    : universe.map((u) => ({
        run_id,
        signal_id: config.signalId,
        ticker: u.ticker,
        gics_sector: u.gics_sector,
      }));
  const { error: cursorErr } = await supabase
    .from('signal_queue_cursor')
    .upsert(cursorRows, { onConflict: 'run_id,ticker', ignoreDuplicates: true });
  if (cursorErr) {
    // Try to roll back the run row so we don't leave an orphaned cursor-less
    // run; if the rollback fails the sweeper will eventually fail it out.
    await supabase.from('signal_queue_runs').delete().eq('run_id', run_id);
    throw new Error(`queue-init: cursor insert failed: ${cursorErr.message}`);
  }

  return {
    kind: 'started',
    run_id,
    signal_id: config.signalId,
    as_of_date,
    universe_size: universe.length,
  };
}