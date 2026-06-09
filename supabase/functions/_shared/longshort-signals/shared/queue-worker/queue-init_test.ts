// deno-lint-ignore-file no-explicit-any -- typed mocks per FP-045 Phase 2 addendum
// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { initQueueRun } from './queue-init.ts';
import type { QueueSignalConfig } from './queue-config.ts';

function cfg(): QueueSignalConfig {
  return {
    signalId: 'test_signal', jobId: 'job-test',
    ratePerSec: 1, callsPerName: 1, sliceSize: 10,
    heartbeatTimeoutSec: 300, stagingTtlSec: 86400,
    fetchAndCompute: async () => ({ kind: 'value', raw: 0 }),
  };
}

function makeMock(opts: {
  openRuns?: Array<{ run_id: string; status: string }>;
  latestAsOf?: string | null;
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  insertRunFails?: string;
  insertCursorFails?: string;
}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const insertedRunId = '11111111-1111-1111-1111-111111111111';
  const supabase: any = {
    from(table: string) {
      const builder: any = {
        _filters: {} as Record<string, unknown>,
        select(_c?: string) { return builder; },
        eq(c: string, v: unknown) { builder._filters[c] = v; return builder; },
        in(_c: string, _vs: unknown[]) { return builder; },
        order() { return builder; },
        limit() { return builder; },
        async single() { return { data: null, error: null }; },
        insert(payload: any) {
          calls.push({ table, op: 'insert', payload });
          if (table === 'signal_queue_runs') {
            if (opts.insertRunFails) {
              return { select: () => ({ single: async () => ({ data: null, error: { message: opts.insertRunFails } }) }) };
            }
            return { select: () => ({ single: async () => ({ data: { run_id: insertedRunId }, error: null }) }) };
          }
          return Promise.resolve({ data: null, error: null });
        },
        upsert(payload: any) {
          calls.push({ table, op: 'upsert', payload });
          if (table === 'signal_queue_cursor' && opts.insertCursorFails) {
            return Promise.resolve({ error: { message: opts.insertCursorFails } });
          }
          return Promise.resolve({ error: null });
        },
        delete() {
          calls.push({ table, op: 'delete' });
          builder._delete = true;
          return builder;
        },
        then(resolve: any) {
          if (table === 'signal_queue_runs') {
            return resolve({ data: opts.openRuns ?? [], error: null });
          }
          if (table === 'universe_membership') {
            if (builder._filters.as_of_date === undefined) {
              const v = opts.latestAsOf;
              return resolve({ data: v ? [{ as_of_date: v }] : [], error: null });
            }
            return resolve({ data: opts.universe ?? [], error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
  return { supabase, calls };
}

Deno.test('init: empty_universe when no universe_membership snapshot exists', async () => {
  const { supabase } = makeMock({ openRuns: [], latestAsOf: null });
  const out = await initQueueRun({
    supabase, operator_id: 'op-1', config: cfg(),
    as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.kind, 'empty_universe');
});

Deno.test('init: empty_universe when latest snapshot has zero tickers', async () => {
  const { supabase } = makeMock({
    openRuns: [], latestAsOf: '2026-06-08', universe: [],
  });
  const out = await initQueueRun({
    supabase, operator_id: 'op-1', config: cfg(),
    as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.kind, 'empty_universe');
});

Deno.test('init: already_open when an open run exists for (signal, as_of_date)', async () => {
  const { supabase } = makeMock({
    openRuns: [{ run_id: 'r-existing', status: 'running' }],
  });
  const out = await initQueueRun({
    supabase, operator_id: 'op-1', config: cfg(),
    as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.kind, 'already_open');
  if (out.kind === 'already_open') {
    assertEquals(out.existing_run_id, 'r-existing');
    assertEquals(out.existing_status, 'running');
  }
});

Deno.test('init: started — seeds run row + cursor rows for each ticker', async () => {
  const { supabase, calls } = makeMock({
    openRuns: [],
    latestAsOf: '2026-06-08',
    universe: [
      { ticker: 'AAPL', gics_sector: 'Tech' },
      { ticker: 'MSFT', gics_sector: 'Tech' },
      { ticker: 'JPM',  gics_sector: 'Financials' },
    ],
  });
  const out = await initQueueRun({
    supabase, operator_id: 'op-1', config: cfg(),
    as_of: new Date('2026-06-09T20:00:00Z'),
  });
  assertEquals(out.kind, 'started');
  if (out.kind === 'started') {
    assertEquals(out.universe_size, 3);
    assertEquals(out.as_of_date, '2026-06-09');
  }
  const runInsert = calls.find((c) => c.table === 'signal_queue_runs' && c.op === 'insert');
  const cursorUpsert = calls.find((c) => c.table === 'signal_queue_cursor' && c.op === 'upsert');
  assert(runInsert);
  assert(cursorUpsert);
  assertEquals((cursorUpsert!.payload as any[]).length, 3);
});

Deno.test('init: cursor insert failure attempts rollback of the run row', async () => {
  const { supabase, calls } = makeMock({
    openRuns: [], latestAsOf: '2026-06-08',
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    insertCursorFails: 'boom',
  });
  let threw = false;
  try {
    await initQueueRun({
      supabase, operator_id: 'op-1', config: cfg(),
      as_of: new Date('2026-06-09T20:00:00Z'),
    });
  } catch (e) {
    threw = true;
    assert(String(e).includes('cursor insert failed'));
  }
  assert(threw);
  assert(calls.some((c) => c.table === 'signal_queue_runs' && c.op === 'delete'));
});