// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  defaultRatePerWorkerPerSec,
  runOptionsFlowCoordinator,
  shardUniverse,
  TRADIER_CAP_PER_MIN,
  SAFETY_UTILISATION,
  DEFAULT_N_WORKERS,
} from './options-flow-coordinator.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-09T20:00:00Z');
const LATEST = '2026-06-05';

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  upsertError?: { message: string } | null;
}) {
  const upsertPayloads: unknown[][] = [];
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST : null;
  const supabase = {
    from(table: string) {
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const builder: Record<string, unknown> = {
          select(cols: string) { mode = cols === 'as_of_date' ? 'latest' : 'rows'; return builder; },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(o: unknown, r: unknown) { return resolve().then(o, r); },
        };
        const resolve = () => mode === 'latest'
          ? Promise.resolve({ data: latestDate ? [{ as_of_date: latestDate }] : [], error: null })
          : Promise.resolve({ data: universe, error: null });
        return builder;
      }
      if (table === 'signal_observations') {
        return {
          upsert(p: unknown[]) {
            upsertPayloads.push(p);
            return Promise.resolve({ error: opts.upsertError ?? null, count: opts.upsertError ? null : p.length });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, upsertPayloads };
}

function workerFetchOk(values: Record<number, unknown[]>, skips: Record<number, unknown[]>) {
  return async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const idx = body.chunk_index as number;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ ok: true, values: values[idx] ?? [], skips: skips[idx] ?? [] }),
    };
  };
}

Deno.test('shardUniverse: even-stride sharding, sizes differ by ≤1', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  const chunks = shardUniverse(items, 3);
  assertEquals(chunks.length, 3);
  assertEquals(chunks.flat().sort((a, b) => a - b), items);
  const sizes = chunks.map((c) => c.length).sort();
  assertEquals(sizes, [3, 3, 4]);
});

Deno.test('shardUniverse: empty input → []', () => {
  assertEquals(shardUniverse([], 6), []);
});

Deno.test('defaultRatePerWorkerPerSec: stays under cap with default workers', () => {
  const rate = defaultRatePerWorkerPerSec(DEFAULT_N_WORKERS);
  const totalPerMin = rate * 60 * DEFAULT_N_WORKERS;
  assert(totalPerMin <= TRADIER_CAP_PER_MIN);
  // Conservative: should equal cap × safety
  assertEquals(totalPerMin, TRADIER_CAP_PER_MIN * SAFETY_UTILISATION);
});

Deno.test('coordinator: empty universe → outcome=failed, empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const result = await runOptionsFlowCoordinator(
    {
      supabase,
      operator_id: OPERATOR_ID,
      workerFetch: workerFetchOk({}, {}),
      workerUrl: 'https://x/worker',
      cronSecret: 'cs',
      correlationId: 'cid',
      nWorkers: 2,
    },
    AS_OF,
  );
  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'empty_universe');
});

Deno.test('coordinator: happy path aggregates worker slices and z-scores', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'Tech' },
    { ticker: 'B', gics_sector: 'Tech' },
    { ticker: 'C', gics_sector: 'Tech' },
    { ticker: 'D', gics_sector: 'Tech' },
  ];
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  // Chunk 0: [A, C]; Chunk 1: [B, D] (stride-based sharding)
  const result = await runOptionsFlowCoordinator(
    {
      supabase,
      operator_id: OPERATOR_ID,
      workerFetch: workerFetchOk(
        {
          0: [
            { ticker: 'A', raw_signal: 1.0, gics_sector: 'Tech' },
            { ticker: 'C', raw_signal: 3.0, gics_sector: 'Tech' },
          ],
          1: [
            { ticker: 'B', raw_signal: 2.0, gics_sector: 'Tech' },
            { ticker: 'D', raw_signal: 4.0, gics_sector: 'Tech' },
          ],
        },
        {},
      ),
      workerUrl: 'https://x/worker',
      cronSecret: 'cs',
      correlationId: 'cid',
      nWorkers: 2,
    },
    AS_OF,
  );
  assertEquals(result.outcome, 'completed');
  assertEquals(result.universe_size, 4);
  assertEquals(result.persisted_count, 4);
  // Upserted payload has 4 rows
  assertEquals(upsertPayloads[0].length, 4);
});

Deno.test('coordinator: failed worker → fetch_error skip per ticker, run still completes if others ok', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'Tech' },
    { ticker: 'B', gics_sector: 'Tech' },
    { ticker: 'C', gics_sector: 'Tech' },
    { ticker: 'D', gics_sector: 'Tech' },
    { ticker: 'E', gics_sector: 'Tech' },
    { ticker: 'F', gics_sector: 'Tech' },
  ];
  const { supabase } = makeSupabase({ universe });
  const fetcher = async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (body.chunk_index === 1) {
      return { ok: false, status: 500, statusText: 'Server Error', text: async () => 'boom' };
    }
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({
        ok: true,
        values: body.chunk.map((c: { ticker: string; gics_sector: string }, i: number) => ({
          ticker: c.ticker, raw_signal: i + 1, gics_sector: c.gics_sector,
        })),
        skips: [],
      }),
    };
  };
  const result = await runOptionsFlowCoordinator(
    {
      supabase, operator_id: OPERATOR_ID, workerFetch: fetcher,
      workerUrl: 'https://x/worker', cronSecret: 'cs', correlationId: 'cid', nWorkers: 2,
    },
    AS_OF,
  );
  assertEquals(result.outcome, 'completed');
  // 3 tickers in failed chunk → 3 fetch_error skips, all preserve ticker identity
  const fetchErrors = result.skipped.filter((s) => s.reason === 'fetch_error');
  assertEquals(fetchErrors.length, 3);
  assert(fetchErrors[0].detail?.includes('HTTP 500'));
});

Deno.test('coordinator: all workers fail → outcome=failed with reason', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'Tech' },
    { ticker: 'B', gics_sector: 'Tech' },
  ];
  const { supabase } = makeSupabase({ universe });
  const fetcher = async () => {
    throw new Error('network down');
  };
  const result = await runOptionsFlowCoordinator(
    {
      supabase, operator_id: OPERATOR_ID, workerFetch: fetcher,
      workerUrl: 'https://x/worker', cronSecret: 'cs', correlationId: 'cid', nWorkers: 2,
    },
    AS_OF,
  );
  assertEquals(result.outcome, 'failed');
  assert(result.failure_reason?.includes('all 2 worker chunks failed'));
  assertEquals(result.skipped.length, 2);
  assertEquals(result.skipped[0].reason, 'fetch_error');
});

Deno.test('coordinator: malformed worker response → fetch_error skips', async () => {
  const universe = [{ ticker: 'A', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetcher = async () => ({
    ok: true, status: 200, statusText: 'OK',
    text: async () => 'not json at all',
  });
  const result = await runOptionsFlowCoordinator(
    {
      supabase, operator_id: OPERATOR_ID, workerFetch: fetcher,
      workerUrl: 'https://x/worker', cronSecret: 'cs', correlationId: 'cid', nWorkers: 1,
    },
    AS_OF,
  );
  assertEquals(result.outcome, 'failed');
  assert(result.skipped[0].detail?.includes('malformed JSON'));
});

Deno.test('coordinator: persistence failure → outcome=failed with reason', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'Tech' },
    { ticker: 'B', gics_sector: 'Tech' },
  ];
  const { supabase } = makeSupabase({ universe, upsertError: { message: 'db down' } });
  const result = await runOptionsFlowCoordinator(
    {
      supabase, operator_id: OPERATOR_ID,
      workerFetch: workerFetchOk({
        0: [
          { ticker: 'A', raw_signal: 1, gics_sector: 'Tech' },
          { ticker: 'B', raw_signal: 2, gics_sector: 'Tech' },
        ],
      }, {}),
      workerUrl: 'https://x/worker', cronSecret: 'cs', correlationId: 'cid', nWorkers: 1,
    },
    AS_OF,
  );
  assertEquals(result.outcome, 'failed');
  assert(result.failure_reason?.includes('persistence failed'));
  assert(result.failure_reason?.includes('db down'));
});

Deno.test('coordinator: posts X-Cron-Secret + correct body shape to worker', async () => {
  const universe = [{ ticker: 'A', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const captured: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = [];
  const fetcher = async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    captured.push({ url, init });
    return {
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({ ok: true, values: [], skips: [] }),
    };
  };
  await runOptionsFlowCoordinator(
    {
      supabase, operator_id: OPERATOR_ID, workerFetch: fetcher,
      workerUrl: 'https://x/worker', cronSecret: 'super-secret', correlationId: 'cid-1', nWorkers: 1,
    },
    AS_OF,
  );
  assertEquals(captured.length, 1);
  assertEquals(captured[0].url, 'https://x/worker');
  assertEquals(captured[0].init.method, 'POST');
  assertEquals(captured[0].init.headers['X-Cron-Secret'], 'super-secret');
  const body = JSON.parse(captured[0].init.body);
  assertEquals(body.correlation_id, 'cid-1');
  assertEquals(body.chunk_index, 0);
  assertEquals(body.total_chunks, 1);
  assertEquals(body.chunk, [{ ticker: 'A', gics_sector: 'Tech' }]);
  assert(typeof body.rate_per_sec === 'number' && body.rate_per_sec > 0);
});