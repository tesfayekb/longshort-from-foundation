// deno-lint-ignore-file no-explicit-unknown no-import-prefix require-await -- typed mocks + std import per FP-045 Phase 2 addendum
// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runQueueSweeper, pickOldestRunningRun } from './queue-sweeper.ts';
import { createTestRegistry, type QueueSignalConfig } from './queue-config.ts';

function cfg(over: Partial<QueueSignalConfig> = {}): QueueSignalConfig {
  return {
    signalId: 'test_signal', jobId: 'job-test',
    ratePerSec: 1, callsPerName: 1, sliceSize: 10,
    heartbeatTimeoutSec: 60, stagingTtlSec: 3600,
    fetchAndCompute: async () => ({ kind: 'value', raw: 0 }),
    ...over,
  };
}

function makeMock(opts: {
  stale?: Array<{ run_id: string; status: string; heartbeat_at: string }>;
  terminal?: Array<{ run_id: string; finalized_at: string }>;
  failCasCount?: number;
  oldestRun?: { run_id: string; signal_id: string; created_at: string } | null;
}) {
  const updates: Array<{ table: string; payload: unknown; filters: Record<string, unknown> }> = [];
  const deletes: Array<{ table: string; filters: Record<string, unknown> }> = [];

  const supabase: unknown = {
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        select(_c?: string) { return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        in(c: string, vs: unknown[]) { b._filters[`${c}__in`] = vs; return b; },
        lt(c: string, v: unknown) { b._filters[`${c}__lt`] = v; return b; },
        not(_c: string, _op: string, _v: unknown) { return b; },
        order() { return b; },
        limit() { return b; },
        update(payload: unknown) { b._update = payload; return b; },
        delete(_arg?: unknown) { b._delete = true; return b; },
        then(resolve: unknown) {
          if (b._update && table === 'signal_queue_runs') {
            updates.push({ table, payload: b._update, filters: { ...b._filters } });
            return resolve({ error: null, count: opts.failCasCount ?? 1 });
          }
          if (b._delete) {
            deletes.push({ table, filters: { ...b._filters } });
            return resolve({ error: null, count: 1 });
          }
          if (table === 'signal_queue_runs') {
            if ('heartbeat_at__lt' in b._filters) {
              return resolve({ data: opts.stale ?? [], error: null });
            }
            if ('finalized_at__lt' in b._filters) {
              return resolve({ data: opts.terminal ?? [], error: null });
            }
            return resolve({ data: opts.oldestRun ? [opts.oldestRun] : [], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return b;
    },
  };
  return { supabase, updates, deletes };
}

Deno.test('sweeper: empty registry → no work', async () => {
  const { supabase } = makeMock({});
  const out = await runQueueSweeper({
    supabase, registry: createTestRegistry(),
    as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.per_signal.length, 0);
  assertEquals(out.total_failed_out, 0);
});

Deno.test('sweeper: stale running run → CAS-to-failed with stale_heartbeat', async () => {
  const { supabase, updates } = makeMock({
    stale: [{ run_id: 'r-stale', status: 'running', heartbeat_at: '2026-06-09T19:00:00Z' }],
    failCasCount: 1,
  });
  const reg = createTestRegistry();
  reg.register(cfg());
  const out = await runQueueSweeper({
    supabase, registry: reg, as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.total_failed_out, 1);
  const cas = updates[0];
  assertEquals(cas.payload.status, 'failed');
  assert(String(cas.payload.failure_reason).startsWith('stale_heartbeat'));
  assertEquals(cas.filters.run_id, 'r-stale');
  assertEquals(cas.filters.status, 'running');
});

Deno.test('sweeper: lost CAS (slice-worker bumped heartbeat) → not counted as failed_out', async () => {
  const { supabase } = makeMock({
    stale: [{ run_id: 'r-stale', status: 'running', heartbeat_at: '2026-06-09T19:00:00Z' }],
    failCasCount: 0,
  });
  const reg = createTestRegistry();
  reg.register(cfg());
  const out = await runQueueSweeper({
    supabase, registry: reg, as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.total_failed_out, 0);
  assertEquals(out.per_signal[0].failed_out, 0);
});

Deno.test('sweeper: terminal-run past TTL → staging + skips deleted', async () => {
  const { supabase, deletes } = makeMock({
    terminal: [{ run_id: 'r-old', finalized_at: '2026-06-08T20:00:00Z' }],
  });
  const reg = createTestRegistry();
  reg.register(cfg());
  await runQueueSweeper({
    supabase, registry: reg, as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assert(deletes.some((d) => d.table === 'signal_queue_staging' && d.filters.run_id === 'r-old'));
  assert(deletes.some((d) => d.table === 'signal_queue_skips' && d.filters.run_id === 'r-old'));
});

Deno.test('pickOldestRunningRun: empty registry → null', async () => {
  const { supabase } = makeMock({ oldestRun: null });
  const got = await pickOldestRunningRun(supabase, createTestRegistry());
  assertEquals(got, null);
});

Deno.test('pickOldestRunningRun: returns the oldest running run', async () => {
  const { supabase } = makeMock({
    oldestRun: { run_id: 'r-1', signal_id: 'test_signal', created_at: '2026-06-09T19:00:00Z' },
  });
  const reg = createTestRegistry();
  reg.register(cfg());
  const got = await pickOldestRunningRun(supabase, reg);
  assertEquals(got, { run_id: 'r-1', signal_id: 'test_signal' });
});