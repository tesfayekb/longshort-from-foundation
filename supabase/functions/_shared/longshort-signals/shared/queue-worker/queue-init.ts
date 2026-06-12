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
  isWorkListMode,
  type QueueSignalConfig,
  type WorkListItem,
  type WorkListSeedFn,
} from './queue-config.ts';
import { maskSecretsInMessage } from './error-key-mask.ts';

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
    }
  | {
      // FP-050 Phase 3.6a Q5 — seedWorkItems threw at init; the run row
      // is inserted with status='failed' + failure_reason='seed_failed:
      // <masked>'. Never half-seeded (no cursor rows written). The
      // distinction from the empty-but-successful seed below is binding.
      kind: 'seed_failed';
      signal_id: string;
      as_of_date: string;
      run_id: string;
      failure_reason: string;
    }
  | {
      // FP-050 Phase 3.6a Q5 — seedWorkItems returned an empty array.
      // VALID run: status='running', zero cursor rows, no items to drain.
      // The next slice-tick (or, with an immediate handler dispatch, the
      // first claim) finds the empty cursor, attempts the CAS-to-
      // finalizing predicate "no cursor rows", wins, and the finalizer's
      // loadAndCompute reads the consumer's window. Empty seed ≠ no-op.
      kind: 'started_empty_work_list';
      run_id: string;
      signal_id: string;
      as_of_date: string;
    };

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

/**
 * FP-050 Phase 3.6a — cursor-insert batch size for work-list seeds.
 * 500 keeps a single insert under the Supabase JSON payload soft-cap
 * while still draining a ~10k-item backfill seed in 20 batches.
 */
const WORK_LIST_CURSOR_BATCH_SIZE = 500;

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

  // ── 2a. Work-list mode (FP-050 Phase 3.6a): seedWorkItems is the seed
  //       source (NOT universe_membership). Q5 ruling: a throw is a
  //       fail-loud init failure with `failure_reason='seed_failed: ...'`
  //       (the run row is inserted into a TERMINAL 'failed' state so the
  //       failure is durable + diagnosable, never half-seeded). A
  //       successfully-computed EMPTY array is a VALID run that proceeds
  //       directly to finalize via the empty-cursor CAS path. Universe
  //       resolution happens at finalize-time inside the consumer's
  //       `loadAndCompute` (gics_sector NULL on cursor rows per Q ruling).
  if (isWorkListMode(config)) {
    return await initWorkListRun(ctx, as_of_iso, as_of_date);
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

// ───────────────────────────────────────────────────────────────────────
// FP-050 Phase 3.6a — work-list mode init branch
// ───────────────────────────────────────────────────────────────────────

async function initWorkListRun(
  ctx: QueueInitContext,
  as_of_iso: string,
  as_of_date: string,
): Promise<QueueInitResult> {
  const { supabase, operator_id, config, as_of } = ctx;
  const seed = config.seedWorkItems as WorkListSeedFn;

  // ── (1) Seed the work list. Q5 ruling: a throw inserts a TERMINAL
  //       'failed' run row so the failure_reason is durable, never
  //       half-seeded. (We insert AFTER the throw — no run row exists
  //       on the failure path until we explicitly persist the failure.)
  let items: ReadonlyArray<WorkListItem>;
  try {
    items = await seed({ asOf: as_of });
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e);
    const maskedMsg = maskSecretsInMessage(rawMsg);
    const failure_reason = `seed_failed: ${maskedMsg}`;
    const { data: failedRow, error: failedErr } = await supabase
      .from('signal_queue_runs')
      .insert({
        signal_id: config.signalId,
        operator_id,
        as_of_date,
        status: 'failed',
        universe_size: 0,
        heartbeat_at: as_of_iso,
        finalized_at: as_of_iso,
        failure_reason,
        metadata: { as_of: as_of_iso, job_id: config.jobId, mode: 'work-list', seed_failed: true },
      })
      .select('run_id')
      .single();
    if (failedErr || !failedRow) {
      // Re-throw the SEED error (it's the root cause; the run-insert
      // error is secondary and would mask the real failure).
      throw new Error(`queue-init[work-list]: seedWorkItems threw (${maskedMsg}); failed-run insert also failed: ${failedErr?.message ?? 'no data'}`);
    }
    return {
      kind: 'seed_failed',
      signal_id: config.signalId,
      as_of_date,
      run_id: (failedRow as { run_id: string }).run_id,
      failure_reason,
    };
  }

  // ── (2) Validate item shape (defensive — a buggy consumer that returns
  //       duplicate IDs would corrupt the cursor PK assumption).
  const seenIds = new Set<string>();
  for (const it of items) {
    if (!it || typeof it.id !== 'string' || it.id.length === 0) {
      throw new Error(`queue-init[work-list]: seedWorkItems returned an item with missing/empty id`);
    }
    if (seenIds.has(it.id)) {
      throw new Error(`queue-init[work-list]: seedWorkItems returned duplicate id '${it.id}'`);
    }
    seenIds.add(it.id);
  }

  // ── (3) Insert the run row. universe_size carries the seeded item
  //       count (the work-list analogue of universe size; consumer's
  //       loadAndCompute mass-balance still uses real universe_membership
  //       at finalize-time per Q4).
  const { data: runRow, error: runErr } = await supabase
    .from('signal_queue_runs')
    .insert({
      signal_id: config.signalId,
      operator_id,
      as_of_date,
      status: 'running',
      universe_size: items.length,
      heartbeat_at: as_of_iso,
      metadata: {
        as_of: as_of_iso,
        job_id: config.jobId,
        mode: 'work-list',
        seeded_item_count: items.length,
      },
    })
    .select('run_id')
    .single();
  if (runErr || !runRow) {
    throw new Error(`queue-init[work-list]: run insert failed: ${runErr?.message ?? 'no data'}`);
  }
  const run_id = (runRow as { run_id: string }).run_id;

  // ── (4) Empty seed → VALID run that proceeds directly to finalize via
  //       the CAS-on-empty-cursor predicate. We do NOT seed any cursor
  //       rows; the first slice tick finds the empty cursor, the CAS
  //       predicate "no cursor rows for this run" is naturally true,
  //       the CAS wins, finalizer runs loadAndCompute on the consumer's
  //       window. Empty seed ≠ no-op (Q5 distinction, test-pinned).
  if (items.length === 0) {
    return {
      kind: 'started_empty_work_list',
      run_id,
      signal_id: config.signalId,
      as_of_date,
    };
  }

  // ── (5) Batched cursor seed — one row per item. synthetic-ticker =
  //       item.id (Q ruling: lex-sortable, drained in lex order), gics_
  //       sector NULL (Q ruling: compute resolves sectors at finalize).
  //       Batched so a ~10k-item backfill doesn't exceed Supabase JSON
  //       payload soft-cap in a single insert.
  for (let i = 0; i < items.length; i += WORK_LIST_CURSOR_BATCH_SIZE) {
    const slice = items.slice(i, i + WORK_LIST_CURSOR_BATCH_SIZE);
    const cursorRows = slice.map((it) => ({
      run_id,
      signal_id: config.signalId,
      ticker: it.id,
      gics_sector: null as string | null,
    }));
    const { error: cursorErr } = await supabase
      .from('signal_queue_cursor')
      .upsert(cursorRows, { onConflict: 'run_id,ticker', ignoreDuplicates: true });
    if (cursorErr) {
      // Best-effort rollback — sweeper will fail us out if rollback fails.
      await supabase.from('signal_queue_cursor').delete().eq('run_id', run_id);
      await supabase.from('signal_queue_runs').delete().eq('run_id', run_id);
      throw new Error(`queue-init[work-list]: cursor batch ${i}/${items.length} insert failed: ${cursorErr.message}`);
    }
  }

  return {
    kind: 'started',
    run_id,
    signal_id: config.signalId,
    as_of_date,
    universe_size: items.length,
  };
}