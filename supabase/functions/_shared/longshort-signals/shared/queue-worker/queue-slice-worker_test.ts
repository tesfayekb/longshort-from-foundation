// deno-lint-ignore-file no-explicit-any no-import-prefix require-await -- typed mocks + std import per FP-045 Phase 2 addendum
// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runQueueSlice } from './queue-slice-worker.ts';
import type { QueueSignalConfig } from './queue-config.ts';
import { TokenBucket } from '../../options-flow/token-bucket.ts';

function fakeBucketFactory(): TokenBucket {
  let now = 0;
  return new TokenBucket({
    ratePerSec: 1000,
    now: () => now,
    sleep: async (ms: number) => { now += ms; },
  });
}

function cfg(over: Partial<QueueSignalConfig> = {}): QueueSignalConfig {
  return {
    signalId: 'test_signal', jobId: 'job-test',
    ratePerSec: 1000, callsPerName: 1, sliceSize: 5,
    heartbeatTimeoutSec: 300, stagingTtlSec: 86400,
    fetchAndCompute: async ({ ticker }) => ({ kind: 'value', raw: ticker.length }),
    ...over,
  };
}

function makeMock(opts: {
  claimed: Array<{ ticker: string; gics_sector: string | null }>;
  casWon: boolean;
}) {
  const writes: Record<string, any[]> = {};
  const rpcCalls: Array<{ fn: string; args: any }> = [];
  const updates: Array<{ table: string; payload: any; filters: Record<string, unknown> }> = [];
  const deletes: Array<{ table: string; filters: Record<string, unknown>; inVals?: unknown[] }> = [];

  const supabase: any = {
    async rpc(fn: string, args: any) {
      rpcCalls.push({ fn, args });
      if (fn === 'signal_queue_claim_slice') return { data: opts.claimed, error: null };
      if (fn === 'signal_queue_cas_finalizing') return { data: opts.casWon, error: null };
      return { data: null, error: null };
    },
    from(table: string) {
      const builder: any = {
        _filters: {} as Record<string, unknown>,
        _inVals: undefined as unknown[] | undefined,
        upsert: (payload: any) => {
          (writes[table] ??= []).push(payload);
          return Promise.resolve({ error: null });
        },
        update(payload: any) { builder._update = payload; return builder; },
        delete() { builder._delete = true; return builder; },
        eq(c: string, v: unknown) { builder._filters[c] = v; return builder; },
        in(_c: string, vs: unknown[]) { builder._inVals = vs; return builder; },
        then(resolve: any) {
          if (builder._update) {
            updates.push({ table, payload: builder._update, filters: { ...builder._filters } });
          } else if (builder._delete) {
            deletes.push({ table, filters: { ...builder._filters }, inVals: builder._inVals });
          }
          return resolve({ error: null, count: 1 });
        },
      };
      return builder;
    },
  };
  return { supabase, writes, rpcCalls, updates, deletes };
}

Deno.test('slice: empty claim attempts CAS and returns empty=true', async () => {
  const { supabase, rpcCalls } = makeMock({ claimed: [], casWon: false });
  const out = await runQueueSlice({
    supabase, config: cfg(), as_of: new Date('2026-06-09T20:00:00Z'),
    run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  assertEquals(out.empty, true);
  assertEquals(out.claimed, 0);
  assertEquals(out.cas_attempted, true);
  assert(rpcCalls.some((c) => c.fn === 'signal_queue_cas_finalizing'));
});

Deno.test('slice: stages values + deletes cursor rows + attempts CAS', async () => {
  const claimed = [
    { ticker: 'AAPL', gics_sector: 'Tech' },
    { ticker: 'MSFT', gics_sector: 'Tech' },
  ];
  const { supabase, writes, deletes } = makeMock({ claimed, casWon: true });
  const out = await runQueueSlice({
    supabase, config: cfg(), as_of: new Date('2026-06-09T20:00:00Z'),
    run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  assertEquals(out.claimed, 2);
  assertEquals(out.succeeded, 2);
  assertEquals(out.skipped, 0);
  assertEquals(out.cas_won, true);
  assertEquals(writes['signal_queue_staging'][0].length, 2);
  const del = deletes.find((d) => d.table === 'signal_queue_cursor');
  assert(del);
  assertEquals(del!.inVals, ['AAPL', 'MSFT']);
});

Deno.test('slice: kind=skip → signal_queue_skips (not staging)', async () => {
  const { supabase, writes } = makeMock({
    claimed: [{ ticker: 'XYZ', gics_sector: 'Tech' }], casWon: false,
  });
  const out = await runQueueSlice({
    supabase,
    config: cfg({ fetchAndCompute: async () => ({
      kind: 'skip', reason: 'zero_dispersion', detail: 'σ=0',
    }) }),
    as_of: new Date(), run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  assertEquals(out.skipped, 1);
  assertEquals(out.succeeded, 0);
  assert(!writes['signal_queue_staging']);
  assertEquals(writes['signal_queue_skips'][0][0].skip_reason, 'zero_dispersion');
});

Deno.test('slice: compute throw → typed fetch_error (ticker not dropped)', async () => {
  const { supabase, writes } = makeMock({
    claimed: [{ ticker: 'BOOM', gics_sector: 'X' }], casWon: false,
  });
  const out = await runQueueSlice({
    supabase,
    config: cfg({ fetchAndCompute: async () => { throw new Error('vendor 503'); } }),
    as_of: new Date(), run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  assertEquals(out.skipped, 1);
  assertEquals(writes['signal_queue_skips'][0][0].skip_reason, 'fetch_error');
  assert(String(writes['signal_queue_skips'][0][0].detail).includes('vendor 503'));
});

Deno.test('slice: non-finite value defensively converted to fetch_error skip', async () => {
  const { supabase, writes } = makeMock({
    claimed: [{ ticker: 'NAN', gics_sector: 'X' }], casWon: false,
  });
  const out = await runQueueSlice({
    supabase,
    config: cfg({ fetchAndCompute: async () => ({ kind: 'value', raw: NaN }) }),
    as_of: new Date(), run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  assertEquals(out.succeeded, 0);
  assertEquals(out.skipped, 1);
  assertEquals(writes['signal_queue_skips'][0][0].skip_reason, 'fetch_error');
});

Deno.test('slice: cas_won mirrors CAS rpc return (race-loser path)', async () => {
  const { supabase } = makeMock({
    claimed: [{ ticker: 'A', gics_sector: 'X' }], casWon: false,
  });
  const out = await runQueueSlice({
    supabase, config: cfg(), as_of: new Date(),
    run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  assertEquals(out.cas_attempted, true);
  assertEquals(out.cas_won, false);
});

Deno.test('slice: heartbeat bumped (status=running guard) before compute', async () => {
  const { supabase, updates } = makeMock({
    claimed: [{ ticker: 'A', gics_sector: 'X' }], casWon: true,
  });
  await runQueueSlice({
    supabase, config: cfg(), as_of: new Date('2026-06-09T20:00:00Z'),
    run_id: 'r-1', bucketFactory: fakeBucketFactory,
  });
  const heartbeat = updates.find((u) =>
    u.table === 'signal_queue_runs' && (u.payload as any).heartbeat_at
  );
  assert(heartbeat);
  assertEquals(heartbeat!.filters.run_id, 'r-1');
  assertEquals(heartbeat!.filters.status, 'running');
});

Deno.test('slice: token-bucket acquire is called once per claimed ticker', async () => {
  const claimed = Array.from({ length: 4 }, (_, i) => ({ ticker: `T${i}`, gics_sector: 'X' }));
  const { supabase } = makeMock({ claimed, casWon: false });
  let acquireCalls = 0;
  const factory = (_r: number) => ({
    acquire: async () => { acquireCalls += 1; },
  } as unknown as TokenBucket);
  await runQueueSlice({
    supabase, config: cfg(), as_of: new Date(),
    run_id: 'r-1', bucketFactory: factory,
  });
  assertEquals(acquireCalls, 4);
});

Deno.test('slice: callsPerName=2 acquires 2 tokens per ticker (FP-045 Phase 3 pacing fix)', async () => {
  const claimed = Array.from({ length: 3 }, (_, i) => ({ ticker: `T${i}`, gics_sector: 'X' }));
  const { supabase } = makeMock({ claimed, casWon: false });
  let acquireCalls = 0;
  const factory = (_r: number) => ({
    acquire: async () => { acquireCalls += 1; },
  } as unknown as TokenBucket);
  await runQueueSlice({
    supabase, config: cfg({ callsPerName: 2 }), as_of: new Date(),
    run_id: 'r-1', bucketFactory: factory,
  });
  // 3 tickers × 2 calls-per-name = 6 acquisitions.
  assertEquals(acquireCalls, 6);
});