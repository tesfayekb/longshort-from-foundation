// deno-lint-ignore-file no-explicit-unknown no-import-prefix require-await -- typed mocks + std import per FP-045 Phase 2 addendum
// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runQueueFinalizer } from './queue-finalizer.ts';
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
  runStatus: string;
  universeSize?: number;
  staging: Array<{ ticker: string; gics_sector: string | null; raw_signal: number }>;
  skips?: Array<{ ticker: string; skip_reason: string; detail: string | null }>;
  casCount?: number;
  observationsError?: string;
}) {
  const writes: Record<string, unknown[]> = {};
  const updates: Array<{ table: string; payload: unknown; filters: Record<string, unknown> }> = [];
  const supabase: unknown = {
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        select(_c?: string) { return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        async single() {
          if (table === 'signal_queue_runs') {
            return {
              data: {
                run_id: b._filters.run_id, signal_id: 'test_signal',
                as_of_date: '2026-06-09', status: opts.runStatus,
                universe_size: opts.universeSize ?? opts.staging.length,
                created_at: '2026-06-09T19:00:00Z',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert(payload: unknown) {
          (writes[table] ??= []).push(payload);
          if (table === 'signal_observations' && opts.observationsError) {
            return Promise.resolve({ error: { message: opts.observationsError }, count: 0 });
          }
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
          if (table === 'signal_queue_staging') return resolve({ data: opts.staging, error: null });
          if (table === 'signal_queue_skips') return resolve({ data: opts.skips ?? [], error: null });
          return resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
  return { supabase, writes, updates };
}

Deno.test('finalizer: already_finalized when status=completed', async () => {
  const { supabase } = makeMock({ runStatus: 'completed', staging: [] });
  const out = await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  assertEquals(out.kind, 'already_finalized');
});

Deno.test('finalizer: not_eligible when status still running (CAS not yet won)', async () => {
  const { supabase } = makeMock({ runStatus: 'running', staging: [] });
  const out = await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  assertEquals(out.kind, 'not_eligible');
});

Deno.test('finalizer: happy path — z-score + observations + log + terminal CAS', async () => {
  const { supabase, writes, updates } = makeMock({
    runStatus: 'finalizing',
    staging: [
      { ticker: 'A', gics_sector: 'Tech', raw_signal: 1 },
      { ticker: 'B', gics_sector: 'Tech', raw_signal: 2 },
      { ticker: 'C', gics_sector: 'Tech', raw_signal: 3 },
    ],
  });
  const out = await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  assertEquals(out.kind, 'finalized');
  if (out.kind === 'finalized') {
    assertEquals(out.outcome, 'completed');
    assertEquals(out.persisted_count, 3);
  }
  assertEquals(writes['signal_observations'][0].length, 3);
  assert(writes['signal_compute_log']);
  const cas = updates.find((u) => u.table === 'signal_queue_runs');
  assert(cas);
  assertEquals(cas!.filters.status, 'finalizing');
  assertEquals((cas!.payload as unknown).status, 'completed');
});

Deno.test('finalizer: singleton sector → typed singleton_sector skip', async () => {
  const { supabase, writes } = makeMock({
    runStatus: 'finalizing',
    staging: [{ ticker: 'SOLO', gics_sector: 'Niche', raw_signal: 1 }],
  });
  const out = await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  assertEquals(out.kind, 'finalized');
  const obs = writes['signal_observations'][0][0];
  assertEquals(obs.value, null);
  assertEquals(obs.is_present, false);
  assert(JSON.stringify(writes['signal_compute_log'][0]).includes('singleton_sector'));
});

Deno.test('finalizer: zero-dispersion sector (all-equal raws) → null observations', async () => {
  const { supabase, writes } = makeMock({
    runStatus: 'finalizing',
    staging: [
      { ticker: 'A', gics_sector: 'Tech', raw_signal: 5 },
      { ticker: 'B', gics_sector: 'Tech', raw_signal: 5 },
      { ticker: 'C', gics_sector: 'Tech', raw_signal: 5 },
    ],
  });
  await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  for (const obs of writes['signal_observations'][0]) {
    assertEquals(obs.value, null);
    assertEquals(obs.is_present, false);
  }
});

Deno.test('finalizer: idempotent re-entry — lost terminal CAS → already_finalized', async () => {
  const { supabase } = makeMock({
    runStatus: 'finalizing',
    staging: [
      { ticker: 'A', gics_sector: 'Tech', raw_signal: 1 },
      { ticker: 'B', gics_sector: 'Tech', raw_signal: 2 },
    ],
    casCount: 0,
  });
  const out = await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  assertEquals(out.kind, 'already_finalized');
});

Deno.test('finalizer: observations-persist failure → transition to failed', async () => {
  const { supabase, updates, writes } = makeMock({
    runStatus: 'finalizing',
    staging: [
      { ticker: 'A', gics_sector: 'Tech', raw_signal: 1 },
      { ticker: 'B', gics_sector: 'Tech', raw_signal: 2 },
    ],
    observationsError: 'PostgREST 500',
  });
  const out = await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  assertEquals(out.kind, 'finalized');
  if (out.kind === 'finalized') assertEquals(out.outcome, 'failed');
  const cas = updates.find((u) => (u.payload as unknown).status === 'failed');
  assert(cas);
  assert(String((cas!.payload as unknown).failure_reason).includes('PostgREST 500'));
  assert(writes['signal_compute_log']);
});

Deno.test('finalizer: upstream skips merged into compute_log alongside z-score skips', async () => {
  const { supabase, writes } = makeMock({
    runStatus: 'finalizing',
    staging: [
      { ticker: 'A', gics_sector: 'Tech', raw_signal: 1 },
      { ticker: 'B', gics_sector: 'Tech', raw_signal: 2 },
    ],
    skips: [
      { ticker: 'X', skip_reason: 'zero_dispersion', detail: 'σ=0' },
      { ticker: 'Y', skip_reason: 'fetch_error', detail: 'vendor 503' },
    ],
  });
  await runQueueFinalizer({
    supabase, config: cfg(), operator_id: 'op-1',
    as_of: new Date('2026-06-09T20:00:00Z'), run_id: 'r-1',
  });
  const logPayload = JSON.stringify(writes['signal_compute_log'][0]);
  assert(logPayload.includes('zero_dispersion'));
  assert(logPayload.includes('fetch_error'));
});