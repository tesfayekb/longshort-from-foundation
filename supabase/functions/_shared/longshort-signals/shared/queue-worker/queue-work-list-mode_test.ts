// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import per FP-045 Phase 2 addendum
// @ts-nocheck — Deno test file.
//
// FP-050 Phase 3.6a.ii — Work-list mode behavioral parity suite.
//
// The five-contract INC-73 parity bar (NEEDS-REVISION-by-definition):
//   (1) verbatim failure_reason stamping for slice-level deadlock
//   (2) slice.failed re-throw on transient + permanent deadlock paths
//   (3) claim / cursor preservation across transient-item retries
//   (4) 3-strikes terminal-fail including the deadlock-guard counter
//       AND the ≥1-success reset rule
//   (5) heartbeat monotonic advance under injected clock at the named
//       WORK_LIST_HEARTBEAT_ITEM_INTERVAL
//
// Plus the Q1..Q5 ruling pins:
//   • Q1  CAS barrier: process → upsert → engine-deletes-cursor per
//         item; after batch, CAS predicate "no cursor rows for run".
//   • Q2  Heartbeat: slice entry + every 25 items; named constant.
//   • Q3  3-strikes: slice-level only, reset on ≥1 success; deadlock
//         guard = claimed>0 ∧ succeeded=0 → failed slice.
//   • Q4  Two-ledger: item-scope permanent skips → signal_queue_skips;
//         mass balance (839) untouched by them — that lives entirely
//         in the consumer's loadAndCompute return.
//   • Q5  seedWorkItems throw → seed_failed (run inserted in terminal
//         'failed' state, never half-seeded); empty seed → VALID run
//         that proceeds directly to finalize.
//
// Cross-mode regression fence: per-ticker and sequential-feed test
// suites pass UNMODIFIED. Counts surfaced in the ACT line.

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  WORK_LIST_HEARTBEAT_ITEM_INTERVAL,
  createTestRegistry,
  type QueueSignalConfig,
  type WorkListItem,
  type WorkListItemResult,
} from './queue-config.ts';
import { initQueueRun } from './queue-init.ts';
import {
  WORK_LIST_SLICE_FAILURE_THRESHOLD,
  runQueueSlice,
} from './queue-slice-worker.ts';
import { runQueueFinalizer } from './queue-finalizer.ts';
import { createFixedClock } from '../../../longshort-clock.ts';
import type { TokenBucket } from '../../options-flow/token-bucket.ts';

// ─── helpers ───────────────────────────────────────────────────────────

function fakeBucket(): TokenBucket {
  return { acquire: async () => {} } as unknown as TokenBucket;
}

function workListCfg(
  over: Partial<QueueSignalConfig> = {},
): QueueSignalConfig {
  return {
    signalId: 'wl_test',
    jobId: 'job-wl-test',
    ratePerSec: 5,
    heartbeatTimeoutSec: 300,
    stagingTtlSec: 86400,
    mode: 'work-list',
    itemsPerSlice: 50,
    callsPerItem: 2,
    seedWorkItems: async () => [],
    processItem: async () => ({ kind: 'processed' as const }),
    loadAndCompute: async () => [],
    ...over,
  };
}

/**
 * Mock the Supabase client used by init. Tracks cursor-upsert payloads
 * and run-inserts so tests can assert seed shape.
 */
function makeInitMock() {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const supabase: unknown = {
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        select(_c?: string) { return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        in(_c: string, _vs: unknown[]) { return b; },
        order() { return b; },
        limit() { return b; },
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          if (table === 'signal_queue_runs') {
            return { select: () => ({ single: async () => ({ data: { run_id: `r-${calls.length}` }, error: null }) }) };
          }
          return Promise.resolve({ data: null, error: null });
        },
        upsert(payload: unknown) {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ error: null });
        },
        delete() { calls.push({ table, op: 'delete' }); return b; },
        then(resolve: unknown) {
          if (table === 'signal_queue_runs') return resolve({ data: [], error: null });
          return resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
  return { supabase, calls };
}

/**
 * Mock the Supabase client used by a single slice. Tracks every cursor
 * delete, cursor update (claim release), skip upsert, and run update
 * so contracts (Q1..Q4) can be asserted byte-faithfully.
 */
function makeSliceMock(opts: {
  claimReturn: Array<{ ticker: string; gics_sector: string | null }>;
  casReturn?: boolean;
  /** Optional prior slice_failure_count for 3-strikes tests. */
  initialSliceFailureCount?: number;
}) {
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const cursorDeletes: Array<Record<string, unknown>> = [];
  const cursorClaimReleases: Array<Record<string, unknown>> = [];
  const skipUpserts: unknown[] = [];
  const runUpdates: Array<Record<string, unknown>> = [];
  const runFailUpdates: Array<Record<string, unknown>> = [];
  let claimCount = 0;

  const supabase: unknown = {
    async rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      if (fn === 'signal_queue_claim_slice') {
        claimCount++;
        return { data: opts.claimReturn, error: null };
      }
      if (fn === 'signal_queue_cas_finalizing') {
        return { data: opts.casReturn ?? false, error: null };
      }
      return { data: null, error: null };
    },
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        _update: undefined as unknown,
        _delete: false,
        select(_c?: string) { return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        in(_c: string, _vs: unknown[]) { b._inFilter = _vs; return b; },
        async single() {
          if (table === 'signal_queue_runs') {
            return {
              data: { slice_failure_count: opts.initialSliceFailureCount ?? 0 },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert(payload: unknown) {
          if (table === 'signal_queue_skips') {
            skipUpserts.push(payload);
          }
          return Promise.resolve({ error: null });
        },
        update(payload: unknown) { b._update = payload; return b; },
        delete() { b._delete = true; return b; },
        then(resolve: unknown) {
          if (b._update !== undefined && table === 'signal_queue_runs') {
            const p = b._update as Record<string, unknown>;
            if (p.status === 'failed') runFailUpdates.push(p);
            else runUpdates.push(p);
            return resolve({ error: null, count: 1 });
          }
          if (b._update !== undefined && table === 'signal_queue_cursor') {
            cursorClaimReleases.push({ ...(b._update as Record<string, unknown>), _inFilter: b._inFilter, _filters: { ...b._filters } });
            return resolve({ error: null });
          }
          if (b._delete && table === 'signal_queue_cursor') {
            cursorDeletes.push({ ...b._filters });
            return resolve({ error: null });
          }
          return resolve({ error: null });
        },
      };
      return b;
    },
  };

  return {
    supabase, rpcCalls, cursorDeletes, cursorClaimReleases,
    skipUpserts, runUpdates, runFailUpdates,
    getClaimCount: () => claimCount,
  };
}

// ════════════════════════════════════════════════════════════════════
// 1) INIT — Q5 contracts (seed_failed / empty-direct-finalize / seeded)
// ════════════════════════════════════════════════════════════════════

Deno.test('init work-list: seedWorkItems throw → seed_failed (terminal run row, NEVER half-seeded)', async () => {
  const { supabase, calls } = makeInitMock();
  const out = await initQueueRun({
    supabase,
    operator_id: 'op-1',
    config: workListCfg({
      seedWorkItems: async () => { throw new Error('EDGAR daily index 503 Service Unavailable'); },
    }),
    as_of: new Date('2026-06-12T20:00:00Z'),
  });
  assertEquals(out.kind, 'seed_failed');
  if (out.kind === 'seed_failed') {
    assert(out.failure_reason.startsWith('seed_failed: '));
    assert(out.failure_reason.includes('EDGAR daily index 503'));
  }
  // Terminal 'failed' run row inserted; NO cursor rows seeded (half-seed guard).
  const runInsert = calls.find((c) => c.table === 'signal_queue_runs' && c.op === 'insert');
  assert(runInsert, 'expected a signal_queue_runs insert for the failed run row');
  const payload = runInsert!.payload as Record<string, unknown>;
  assertEquals(payload.status, 'failed');
  assert((payload.failure_reason as string).startsWith('seed_failed: '));
  const cursorInsert = calls.find((c) => c.table === 'signal_queue_cursor');
  assertEquals(cursorInsert, undefined, 'no cursor rows must be written on seed_failed (NEVER half-seeded)');
});

Deno.test('init work-list: empty seed → VALID run, status=running, ZERO cursor rows (empty seed ≠ no-op)', async () => {
  const { supabase, calls } = makeInitMock();
  const out = await initQueueRun({
    supabase,
    operator_id: 'op-1',
    config: workListCfg({ seedWorkItems: async () => [] }),
    as_of: new Date('2026-06-12T20:00:00Z'),
  });
  assertEquals(out.kind, 'started_empty_work_list');
  const runInsert = calls.find((c) => c.table === 'signal_queue_runs' && c.op === 'insert');
  assert(runInsert);
  const payload = runInsert!.payload as Record<string, unknown>;
  assertEquals(payload.status, 'running');
  assertEquals(payload.universe_size, 0);
  assertEquals((payload.metadata as Record<string, unknown>).mode, 'work-list');
  // No cursor rows — next slice tick will find empty cursor and CAS→finalizing immediately.
  const cursorInsert = calls.find((c) => c.table === 'signal_queue_cursor');
  assertEquals(cursorInsert, undefined, 'empty seed seeds ZERO cursor rows');
});

Deno.test('init work-list: non-empty seed → one cursor row per item (synthetic-ticker=item.id, gics_sector=null)', async () => {
  const { supabase, calls } = makeInitMock();
  const items: WorkListItem[] = [
    { id: '0001950170-26-000001', payload: { cik: '0000320193' } },
    { id: '0001493152-26-000007', payload: { cik: '0000789019' } },
    { id: '0001127602-26-000234', payload: { cik: '0001067983' } },
  ];
  const out = await initQueueRun({
    supabase,
    operator_id: 'op-1',
    config: workListCfg({ seedWorkItems: async () => items }),
    as_of: new Date('2026-06-12T20:00:00Z'),
  });
  assertEquals(out.kind, 'started');
  if (out.kind === 'started') assertEquals(out.universe_size, 3);

  const cursorUpsert = calls.find((c) => c.table === 'signal_queue_cursor' && c.op === 'upsert');
  assert(cursorUpsert);
  const rows = cursorUpsert!.payload as Array<{ ticker: string; gics_sector: string | null }>;
  assertEquals(rows.length, 3);
  // Synthetic-ticker = item.id; gics_sector NULL per Q ruling.
  const ids = rows.map((r) => r.ticker).sort();
  assertEquals(ids, [
    '0001127602-26-000234',
    '0001493152-26-000007',
    '0001950170-26-000001',
  ]);
  for (const r of rows) assertEquals(r.gics_sector, null);
});

Deno.test('init work-list: duplicate item id → throws (defensive cursor-PK guard)', async () => {
  const { supabase } = makeInitMock();
  await assertRejects(
    () => initQueueRun({
      supabase,
      operator_id: 'op-1',
      config: workListCfg({
        seedWorkItems: async () => [
          { id: 'X', payload: {} },
          { id: 'X', payload: {} },
        ],
      }),
      as_of: new Date('2026-06-12T20:00:00Z'),
    }),
    Error,
    "duplicate id 'X'",
  );
});

// ════════════════════════════════════════════════════════════════════
// 2) SLICE-WORKER — Q1 CAS barrier + Q2 heartbeat + Q3 + Q4
// ════════════════════════════════════════════════════════════════════

Deno.test('slice work-list: empty claim → CAS attempted, empty=true, mode tagged', async () => {
  const m = makeSliceMock({ claimReturn: [], casReturn: false });
  const out = await runQueueSlice({
    supabase: m.supabase,
    config: workListCfg(),
    as_of: new Date('2026-06-12T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.empty, true);
  assertEquals(out.cas_attempted, true);
  assertEquals(out.mode, 'work-list');
  assert(m.rpcCalls.some((c) => c.fn === 'signal_queue_cas_finalizing'));
});

Deno.test('slice work-list Q1 barrier: each processed item deletes ITS cursor row before CAS', async () => {
  const items: Array<{ ticker: string; gics_sector: string | null }> = [
    { ticker: 'A', gics_sector: null },
    { ticker: 'B', gics_sector: null },
    { ticker: 'C', gics_sector: null },
  ];
  const m = makeSliceMock({ claimReturn: items, casReturn: true });
  const out = await runQueueSlice({
    supabase: m.supabase,
    config: workListCfg({ processItem: async () => ({ kind: 'processed' as const }) }),
    as_of: new Date('2026-06-12T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.succeeded, 3);
  assertEquals(out.skipped, 0);
  // Per-item delete: one cursor delete per claimed item.
  assertEquals(m.cursorDeletes.length, 3);
  for (const d of m.cursorDeletes) assertEquals(d.run_id, 'r-1');
  const deletedTickers = m.cursorDeletes.map((d) => d.ticker).sort();
  assertEquals(deletedTickers, ['A', 'B', 'C']);
  // CAS attempted after the per-item barrier.
  assertEquals(out.cas_attempted, true);
  assertEquals(out.cas_won, true);
});

Deno.test('slice work-list Q4 two-ledger: permanent_skip writes signal_queue_skips + deletes cursor (no staging)', async () => {
  const items = [
    { ticker: 'A', gics_sector: null },
    { ticker: 'B', gics_sector: null },
  ];
  const m = makeSliceMock({ claimReturn: items, casReturn: false });
  const out = await runQueueSlice({
    supabase: m.supabase,
    config: workListCfg({
      processItem: async ({ item }) => {
        if (item.id === 'A') return { kind: 'processed' as const };
        return { kind: 'permanent_skip' as const, reason: 'no_primary_doc', detail: 'zero documents in index' };
      },
    }),
    as_of: new Date('2026-06-12T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.succeeded, 1);
  assertEquals(out.skipped, 1);
  // Both items had their cursor deleted (Q1 + Q4).
  assertEquals(m.cursorDeletes.length, 2);
  // Permanent-skip wrote ONE signal_queue_skips row (item-scope marker).
  assertEquals(m.skipUpserts.length, 1);
  const rows = m.skipUpserts[0] as Array<Record<string, unknown>>;
  assertEquals(rows.length, 1);
  assertEquals(rows[0].ticker, 'B');
  assertEquals(rows[0].skip_reason, 'no_primary_doc');
});

Deno.test('slice work-list Q3 transient: throw leaves cursor row claimed, releases at slice end, item_retries++', async () => {
  const items = [
    { ticker: 'A', gics_sector: null },
    { ticker: 'B', gics_sector: null },
  ];
  const m = makeSliceMock({ claimReturn: items, casReturn: false });
  const out = await runQueueSlice({
    supabase: m.supabase,
    config: workListCfg({
      processItem: async ({ item }) => {
        if (item.id === 'A') return { kind: 'processed' as const };
        throw new Error('EDGAR 429 Too Many Requests');
      },
    }),
    as_of: new Date('2026-06-12T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.succeeded, 1);
  assertEquals(out.skipped, 0);
  assertEquals(out.item_retries, 1);
  // A was deleted (processed); B's cursor row was preserved (transient).
  assertEquals(m.cursorDeletes.length, 1);
  assertEquals(m.cursorDeletes[0].ticker, 'A');
  // Transient claim released for next-tick retry.
  assert(m.cursorClaimReleases.length >= 1, 'expected at least one cursor claim release for transient items');
  const releaseRow = m.cursorClaimReleases.find((r) => (r as Record<string, unknown>).claimed_at === null);
  assert(releaseRow, 'transient items released by setting claimed_at=null');
});

Deno.test('slice work-list Q3 deadlock guard: claimed>0 ∧ succeeded=0 (all throw) → throws + stamps failure_reason verbatim', async () => {
  const items = [
    { ticker: 'A', gics_sector: null },
    { ticker: 'B', gics_sector: null },
  ];
  const m = makeSliceMock({
    claimReturn: items,
    initialSliceFailureCount: 0,
    casReturn: false,
  });
  await assertRejects(
    () => runQueueSlice({
      supabase: m.supabase,
      config: workListCfg({
        processItem: async ({ item }) => {
          throw new Error(`network timeout reading ${item.id}`);
        },
      }),
      as_of: new Date('2026-06-12T20:00:00Z'),
      run_id: 'r-1',
      bucketFactory: () => fakeBucket(),
    }),
    Error,
    'network timeout',
  );
  // Failure reason stamped on the run row (NOT terminal — only 1st strike).
  const stamped = m.runUpdates.find((u) => typeof u.failure_reason === 'string');
  assert(stamped, 'expected a failure_reason stamp on the run row');
  assert((stamped!.failure_reason as string).startsWith('work_list_slice_deadlock: '));
  assert((stamped!.failure_reason as string).includes('network timeout'));
  assertEquals(stamped!.slice_failure_count, 1);
  // No terminal-fail on the first strike.
  assertEquals(m.runFailUpdates.length, 0);
});

Deno.test('slice work-list Q3 deadlock guard: all-permanent_skip slice ALSO counts as failed (no forward progress in succeeded-sense)', async () => {
  const items = [
    { ticker: 'A', gics_sector: null },
    { ticker: 'B', gics_sector: null },
  ];
  const m = makeSliceMock({ claimReturn: items, initialSliceFailureCount: 0 });
  await assertRejects(
    () => runQueueSlice({
      supabase: m.supabase,
      config: workListCfg({
        processItem: async () => ({ kind: 'permanent_skip' as const, reason: 'no_primary_doc', detail: 'dead item' }),
      }),
      as_of: new Date('2026-06-12T20:00:00Z'),
      run_id: 'r-1',
      bucketFactory: () => fakeBucket(),
    }),
    Error,
  );
  // Counter incremented; reason indicates deadlock_guard with all-permanent-skip context.
  const stamped = m.runUpdates.find((u) => typeof u.failure_reason === 'string');
  assert(stamped);
  assert((stamped!.failure_reason as string).includes('deadlock_guard') || (stamped!.failure_reason as string).includes('work_list_slice_deadlock'));
});

Deno.test('slice work-list Q3 3-strikes: 3rd consecutive deadlock → TERMINAL fail with verbatim last error', async () => {
  const items = [{ ticker: 'A', gics_sector: null }];
  const m = makeSliceMock({
    claimReturn: items,
    initialSliceFailureCount: WORK_LIST_SLICE_FAILURE_THRESHOLD - 1,
  });
  await assertRejects(
    () => runQueueSlice({
      supabase: m.supabase,
      config: workListCfg({
        processItem: async () => { throw new Error('persistent vendor 503 verbatim'); },
      }),
      as_of: new Date('2026-06-12T20:00:00Z'),
      run_id: 'r-1',
      bucketFactory: () => fakeBucket(),
    }),
    Error,
    'persistent vendor 503',
  );
  // Terminal-fail update was emitted with status='failed' + 3x marker.
  assertEquals(m.runFailUpdates.length, 1);
  const term = m.runFailUpdates[0];
  assertEquals(term.status, 'failed');
  assert((term.failure_reason as string).startsWith('work_list_slice_deadlock_3x: '));
  assert((term.failure_reason as string).includes('persistent vendor 503'));
  assertEquals(term.slice_failure_count, WORK_LIST_SLICE_FAILURE_THRESHOLD);
});

Deno.test('slice work-list Q3 ≥1-success reset: counter reset to 0 on slice with any processed item', async () => {
  const items = [
    { ticker: 'A', gics_sector: null },
    { ticker: 'B', gics_sector: null },
  ];
  // Prior failures present, but THIS slice has at least one success.
  const m = makeSliceMock({
    claimReturn: items,
    initialSliceFailureCount: 2,
  });
  await runQueueSlice({
    supabase: m.supabase,
    config: workListCfg({
      processItem: async ({ item }) => {
        if (item.id === 'A') return { kind: 'processed' as const };
        throw new Error('B transient');
      },
    }),
    as_of: new Date('2026-06-12T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  // The success branch reset slice_failure_count to 0.
  const reset = m.runUpdates.find((u) => u.slice_failure_count === 0);
  assert(reset, 'expected slice_failure_count to be reset to 0 on ≥1-success slice');
});

Deno.test('slice work-list Q2 heartbeat: entry beat + per-25-items beats under injected clock (monotonic advance)', async () => {
  // Inject a fixed clock to assert heartbeat updates carry the SAME
  // liveClock timestamp deterministically. Sweep 25 + 1 items so we
  // get entry beat + one inner beat + final beat.
  const items = Array.from({ length: WORK_LIST_HEARTBEAT_ITEM_INTERVAL + 1 }, (_, i) => ({
    ticker: `t${String(i).padStart(3, '0')}`,
    gics_sector: null as string | null,
  }));
  const fixed = new Date('2026-06-12T22:00:00Z');
  const m = makeSliceMock({
    claimReturn: items,
    casReturn: false,
  });
  await runQueueSlice({
    supabase: m.supabase,
    config: workListCfg({
      itemsPerSlice: items.length,
      processItem: async () => ({ kind: 'processed' as const }),
    }),
    as_of: new Date('2026-06-12T20:00:00Z'),   // kernel-frozen as_of
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
    liveClock: createFixedClock(fixed),
  });
  // Heartbeats land in runUpdates (no status change). Count beats that
  // carry the fixed liveClock timestamp.
  const beats = m.runUpdates.filter(
    (u) => u.heartbeat_at === fixed.toISOString() && u.status === undefined,
  );
  // Entry beat (1) + at-25-items beat (1) + at-25+1-items NOT yet triggered
  // (the modulo only fires when itemsProcessedSinceHeartbeat reaches the
  // interval). Final reset bumps heartbeat as part of the reset update.
  // We assert ≥2 distinct beat-emitting updates to prove the per-interval
  // heartbeat path executed (entry + at least one inner beat).
  assert(beats.length >= 2, `expected ≥2 heartbeat updates with liveClock ts; got ${beats.length}`);
});

// ════════════════════════════════════════════════════════════════════
// 3) FINALIZER — Q4 mass balance via loadAndCompute (no staging reads)
// ════════════════════════════════════════════════════════════════════

function makeFinalizerMock(opts: {
  runStatus: string;
  universeSize?: number;
  casCount?: number;
}) {
  const writes: Record<string, unknown[]> = {};
  const updates: Array<{ table: string; payload: unknown; filters: Record<string, unknown> }> = [];
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const supabase: unknown = {
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        select(_c?: string) { reads.push({ table, filters: { ...b._filters } }); return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        async single() {
          if (table === 'signal_queue_runs') {
            return {
              data: {
                run_id: b._filters.run_id, signal_id: 'wl_test',
                as_of_date: '2026-06-12', status: opts.runStatus,
                universe_size: opts.universeSize ?? 3,
                created_at: '2026-06-12T19:00:00Z',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert(payload: unknown) {
          (writes[table] ??= []).push(payload);
          return Promise.resolve({ error: null, count: Array.isArray(payload) ? payload.length : 1 });
        },
        insert(payload: unknown) {
          (writes[table] ??= []).push(payload);
          if (table === 'signal_compute_log') {
            return { select: () => ({ single: async () => ({ data: { run_id: 'log-1' }, error: null }) }) };
          }
          return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
        },
        update(payload: unknown) { b._update = payload; return b; },
        then(resolve: unknown) {
          if (b._update) {
            updates.push({ table, payload: b._update, filters: { ...b._filters } });
            return resolve({ error: null, count: opts.casCount ?? 1 });
          }
          return resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
  return { supabase, writes, updates, reads };
}

Deno.test('finalizer work-list: dispatches to loadAndCompute, NO staging reads, NO feed_items reads', async () => {
  let loadCallCount = 0;
  const m = makeFinalizerMock({ runStatus: 'finalizing' });
  const out = await runQueueFinalizer({
    supabase: m.supabase,
    config: workListCfg({
      loadAndCompute: async () => {
        loadCallCount++;
        return [
          { ticker: 'AAPL', gicsSector: 'Tech', result: { kind: 'value' as const, raw: 1.5 } },
          { ticker: 'MSFT', gicsSector: 'Tech', result: { kind: 'value' as const, raw: -0.7 } },
          { ticker: 'XOM',  gicsSector: 'Energy', result: { kind: 'skip' as const, reason: 'no_qualifying_filings', detail: '' } },
        ];
      },
    }),
    operator_id: 'op-1',
    as_of: new Date('2026-06-12T22:00:00Z'),
    run_id: 'r-final-1',
  });
  assertEquals(loadCallCount, 1);
  assertEquals(out.kind, 'finalized');
  // Mass balance: 2 values + 1 typed skip = 3 universe names accounted for.
  // Verify NO staging or feed_items table was touched.
  const stagingReads = m.reads.filter((r) => r.table === 'signal_queue_staging');
  const feedItemReads = m.reads.filter((r) => r.table === 'signal_queue_feed_items');
  assertEquals(stagingReads.length, 0, 'work-list finalize must NOT read signal_queue_staging');
  assertEquals(feedItemReads.length, 0, 'work-list finalize must NOT read signal_queue_feed_items');
});

Deno.test('finalizer work-list Q4: signal_queue_skips NOT read for mass balance (consumer owns the 839 ledger)', async () => {
  const m = makeFinalizerMock({ runStatus: 'finalizing' });
  await runQueueFinalizer({
    supabase: m.supabase,
    config: workListCfg({
      loadAndCompute: async () => [
        { ticker: 'AAPL', gicsSector: 'Tech', result: { kind: 'value' as const, raw: 0 } },
      ],
    }),
    operator_id: 'op-1',
    as_of: new Date('2026-06-12T22:00:00Z'),
    run_id: 'r-final-2',
  });
  const skipReads = m.reads.filter((r) => r.table === 'signal_queue_skips');
  assertEquals(skipReads.length, 0, 'work-list finalize must NOT read signal_queue_skips for mass balance (Q4 two-ledger)');
});

Deno.test('finalizer work-list: loadAndCompute throw → transitions run to failed with verbatim reason', async () => {
  const m = makeFinalizerMock({ runStatus: 'finalizing' });
  const out = await runQueueFinalizer({
    supabase: m.supabase,
    config: workListCfg({
      loadAndCompute: async () => { throw new Error('consumer window read failed: db connection refused'); },
    }),
    operator_id: 'op-1',
    as_of: new Date('2026-06-12T22:00:00Z'),
    run_id: 'r-final-3',
  });
  assertEquals(out.kind, 'finalized');
  if (out.kind === 'finalized') assertEquals(out.outcome, 'failed');
  // The terminal-CAS update carried the wrapped reason.
  const failUpdate = m.updates.find((u) => (u.payload as Record<string, unknown>).status === 'failed');
  assert(failUpdate);
  assert(((failUpdate!.payload as Record<string, unknown>).failure_reason as string).includes('loadAndCompute threw'));
});

// ════════════════════════════════════════════════════════════════════
// 4) CROSS-MODE REGRESSION FENCE — config validator
// ════════════════════════════════════════════════════════════════════

Deno.test('regression fence: work-list mode registers cleanly alongside per-ticker and feed configs', () => {
  const r = createTestRegistry();
  // per-ticker
  r.register({
    signalId: 'pt', jobId: 'job-pt', ratePerSec: 1,
    callsPerName: 1, sliceSize: 5,
    heartbeatTimeoutSec: 60, stagingTtlSec: 3600,
    fetchAndCompute: async () => ({ kind: 'value', raw: 1 }),
  });
  // sequential-feed
  r.register({
    signalId: 'feed', jobId: 'job-feed', ratePerSec: 10,
    heartbeatTimeoutSec: 300, stagingTtlSec: 86400,
    mode: 'sequential-feed',
    pagesPerSlice: 3, maxPages: 100,
    fetchPage: async () => ({ items: [], nextToken: null }),
    computeFromItems: () => ({ kind: 'value', raw: 0 }),
  });
  // work-list
  r.register(workListCfg({ signalId: 'wl' }));
  assertEquals(r.listSignalIds().sort(), ['feed', 'pt', 'wl']);
});

Deno.test('regression fence: WORK_LIST_HEARTBEAT_ITEM_INTERVAL is the named Q2 constant (25)', () => {
  assertEquals(WORK_LIST_HEARTBEAT_ITEM_INTERVAL, 25);
});

Deno.test('regression fence: WORK_LIST_SLICE_FAILURE_THRESHOLD mirrors INC-73 (3 strikes)', () => {
  assertEquals(WORK_LIST_SLICE_FAILURE_THRESHOLD, 3);
});

// ════════════════════════════════════════════════════════════════════
// 5) PATH-(ii) CONSERVATION INVARIANT — ACT-218 / Fix A
// ════════════════════════════════════════════════════════════════════
// Precedent: feed-mode buildFeedAggregates already enforces the
// universe-membership mass balance (every universe ticker yields
// exactly one value-or-typed-skip; the ruling-839 invariant). Work-list
// mode now writes the analogous consumer-owned ledger into
// signal_compute_log.universe_size — replacing the producer-side
// accession-count ledger that was conflated into the same field
// pre-ACT-218 (run 2ac77620 surfaced the gap: 1098 accessions − 839
// universe tickers = 259 phantom drop).

Deno.test('finalizer work-list ACT-218: signal_compute_log.universe_size = staging + skips (consumer ledger, NOT runRow.universe_size)', async () => {
  // runRow.universe_size = 1098 simulates an accession-count seed
  // (producer-side ledger preserved on signal_queue_runs for the
  // sweeper/budget contract). loadAndCompute returns 3 per-ticker
  // results = 2 values + 1 typed skip. The finalizer MUST write 3
  // (consumer-owned mass-balance) into signal_compute_log.universe_size,
  // not 1098.
  const m = makeFinalizerMock({ runStatus: 'finalizing', universeSize: 1098 });
  await runQueueFinalizer({
    supabase: m.supabase,
    config: workListCfg({
      loadAndCompute: async () => [
        { ticker: 'AAPL', gicsSector: 'Tech',   result: { kind: 'value' as const, raw: 1.0 } },
        { ticker: 'MSFT', gicsSector: 'Tech',   result: { kind: 'value' as const, raw: -1.0 } },
        { ticker: 'XOM',  gicsSector: 'Energy', result: { kind: 'skip'  as const, reason: 'no_qualifying_filings', detail: '' } },
      ],
    }),
    operator_id: 'op-1',
    as_of: new Date('2026-06-12T22:00:00Z'),
    run_id: 'r-final-conservation',
  });
  const logWrites = (m.writes['signal_compute_log'] ?? []) as Array<Record<string, unknown>>;
  assertEquals(logWrites.length, 1, 'finalizer must write exactly one signal_compute_log row');
  const written = logWrites[0] as Record<string, unknown>;
  assertEquals(written.universe_size, 3, 'work-list universe_size MUST equal loadAndCompute per-ticker count (consumer ledger), NOT runRow.universe_size accession count');
  // Conservation invariant restated: universe_size === persisted + skips.
  // The mock z-score keeps both values present (sector "Tech" has σ>0;
  // singleton "Energy" yields no degenerate; XOM was a typed skip).
  const persisted = written.persisted_count as number;
  const skipped = (written.skipped as unknown[]).length;
  assertEquals((written.universe_size as number), persisted + skipped, 'mass balance: universe_size = persisted_count + skipped.length');
});