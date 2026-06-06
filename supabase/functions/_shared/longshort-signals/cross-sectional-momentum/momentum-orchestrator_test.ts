// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createMomentumOrchestrator,
  SIGNAL_ID,
} from './momentum-orchestrator.ts';
import { MOMENTUM_MIN_BARS } from './compute-momentum.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-05-25T20:00:00Z');
const AS_OF_DATE = '2026-05-25';
const LATEST_SNAPSHOT = '2026-05-22';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Build `n` ascending daily bars ending at `endTs`. */
function makeBars(n: number, closeFn: (i: number) => number, endTs = AS_OF.getTime()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = endTs - (n - 1 - i) * MS_PER_DAY;
    const iso = new Date(t).toISOString().slice(0, 10);
    out.push({ ts: iso, close: closeFn(i) });
  }
  return out;
}

/**
 * Supabase mock — handles:
 *   .from('universe_membership').select('as_of_date').eq().eq().order().limit()
 *   .from('universe_membership').select('ticker, gics_sector').eq().eq()
 *   .from('signal_observations').upsert(...)
 * Programmable: universe rows + upsert response. Captures calls for assertions.
 */
function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  latestError?: { message: string } | null;
  universeError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const calls = {
    upsertPayloads: [] as any[],
    fromTables: [] as string[],
  };
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;

  const supabase = {
    from(table: string) {
      calls.fromTables.push(table);
      if (table === 'universe_membership') {
        // Two distinct queries — distinguish by .select() arg.
        let mode: 'latest' | 'rows' = 'rows';
        const builder: any = {
          select(cols: string) {
            mode = cols === 'as_of_date' ? 'latest' : 'rows';
            return builder;
          },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(onFul: any, onRej: any) { return resolve().then(onFul, onRej); },
        };
        const resolve = () => {
          if (mode === 'latest') {
            if (opts.latestError) return Promise.resolve({ data: null, error: opts.latestError });
            return Promise.resolve({
              data: latestDate ? [{ as_of_date: latestDate }] : [],
              error: null,
            });
          }
          if (opts.universeError) return Promise.resolve({ data: null, error: opts.universeError });
          return Promise.resolve({ data: universe, error: null });
        };
        return builder;
      }
      if (table === 'signal_observations') {
        return {
          upsert(payload: any) {
            calls.upsertPayloads.push(payload);
            return Promise.resolve({
              error: opts.upsertError ?? null,
              count: opts.upsertError ? null : payload.length,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

/**
 * Price-history fetcher mock — programmable per-ticker. Behaviors:
 *   { kind: 'bars', bars }      → returns bars
 *   { kind: 'null' }            → returns null (Polygon 404)
 *   { kind: 'throw', err }      → throws err
 */
function makePriceHistory(behaviors: Record<string, any>) {
  const callOrder: string[] = [];
  let inFlight = 0;
  let peakInFlight = 0;
  return {
    fetcher: {
      async fetchPriceHistory(ticker: string) {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        callOrder.push(ticker);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        const b = behaviors[ticker];
        if (!b) throw new Error(`no behavior for ${ticker}`);
        if (b.kind === 'null') return null;
        if (b.kind === 'throw') throw b.err;
        return b.bars;
      },
    } as any,
    callOrder,
    peak: () => peakInFlight,
  };
}

function ctx(supabase: any, fetcher: any, concurrency?: number) {
  return {
    supabase,
    priceHistory: fetcher,
    operator_id: OPERATOR_ID,
    ...(concurrency !== undefined ? { concurrency } : {}),
  };
}

// Successful 253-bar history → momentum = (close[T-21]/close[T-252]) - 1.
// Use linear closes so momentum is deterministic and non-zero.
function fullHistory(slope: number, base: number) {
  return makeBars(MOMENTUM_MIN_BARS, (i) => base + i * slope);
}

Deno.test('(1) happy path — 5 tickers, 2 sectors, all persist', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
    { ticker: 'JPM',  gics_sector: 'Financials' },
    { ticker: 'BAC',  gics_sector: 'Financials' },
  ];
  const { supabase, calls } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
    NVDA: { kind: 'bars', bars: fullHistory(2.0, 50) },
    JPM:  { kind: 'bars', bars: fullHistory(0.3, 150) },
    BAC:  { kind: 'bars', bars: fullHistory(0.1, 30) },
  });
  const orch = createMomentumOrchestrator(ctx(supabase, fetcher));
  const res = await orch.run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.signal_id, SIGNAL_ID);
  assertEquals(res.as_of_date, AS_OF_DATE);
  assertEquals(res.universe_size, 5);
  assertEquals(res.persisted_count, 5);
  assertEquals(res.skipped, []);
  assertEquals(calls.upsertPayloads.length, 1);
  assertEquals(calls.upsertPayloads[0].length, 5);
});

Deno.test('(2) insufficient history skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'NEW',  gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    NEW:  { kind: 'bars', bars: makeBars(MOMENTUM_MIN_BARS - 1, (i) => 10 + i) },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  // AAPL alone in its sector after skip → singleton_sector
  assertEquals(res.outcome, 'completed');
  const reasons = res.skipped.map((s) => `${s.ticker}:${s.reason}`).sort();
  assertEquals(reasons, ['AAPL:singleton_sector', 'NEW:insufficient_history']);
  assertEquals(res.persisted_count, 0);
});

Deno.test('(3) Polygon 404 → fetch_error skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'DEAD', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
    DEAD: { kind: 'null' },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  assertEquals(res.skipped.length, 1);
  assertEquals(res.skipped[0].ticker, 'DEAD');
  assertEquals(res.skipped[0].reason, 'fetch_error');
  assertStringIncludes(res.skipped[0].detail!, 'polygon 404');
});

Deno.test('(4) Polygon non-404 throw → fetch_error skip with ticker context', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'XYZ',  gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
    XYZ:  { kind: 'throw', err: new SignalComputationError('polygon_price_history', 'XYZ', 'HTTP 500 boom') },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const xyz = res.skipped.find((s) => s.ticker === 'XYZ');
  assert(xyz, 'expected XYZ skip');
  assertEquals(xyz!.reason, 'fetch_error');
  assertStringIncludes(xyz!.detail!, 'XYZ');
});

Deno.test('(5) singleton sector skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'SOLO', gics_sector: 'Utilities' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
    SOLO: { kind: 'bars', bars: fullHistory(0.7, 80) },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  assertEquals(res.skipped.length, 1);
  assertEquals(res.skipped[0].ticker, 'SOLO');
  assertEquals(res.skipped[0].reason, 'singleton_sector');
});

Deno.test('(6) missing sector skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NUL',  gics_sector: null },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
    NUL:  { kind: 'bars', bars: fullHistory(0.7, 80) },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const nul = res.skipped.find((s) => s.ticker === 'NUL');
  assert(nul, 'expected NUL skip');
  assertEquals(nul!.reason, 'missing_sector');
});

Deno.test('(7) empty universe → outcome=failed, failure_reason=empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const { fetcher } = makePriceHistory({});
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.failure_reason, 'empty_universe');
  assertEquals(res.universe_size, 0);
  assertEquals(res.persisted_count, 0);
});

Deno.test('(8) universe-read error → throws (catastrophic)', async () => {
  const { supabase } = makeSupabase({
    universe: [{ ticker: 'AAPL', gics_sector: 'IT' }],
    latestError: { message: 'db exploded' },
  });
  const { fetcher } = makePriceHistory({});
  const orch = createMomentumOrchestrator(ctx(supabase, fetcher));
  await assertRejects(() => orch.run(AS_OF), Error, 'db exploded');
});

Deno.test('(9) persistence error → outcome=failed with reason', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({
    universe,
    upsertError: { message: 'unique violation' },
  });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.persisted_count, 0);
  assertStringIncludes(res.failure_reason!, 'unique violation');
});

Deno.test('(10) mixed skip + success — all four skip reasons exercised', async () => {
  const universe = [
    { ticker: 'A1', gics_sector: 'IT' },
    { ticker: 'A2', gics_sector: 'IT' },
    { ticker: 'A3', gics_sector: 'IT' },
    { ticker: 'F1', gics_sector: 'Financials' },
    { ticker: 'F2', gics_sector: 'Financials' },
    { ticker: 'F3', gics_sector: 'Financials' },
    { ticker: 'SHORT', gics_sector: 'IT' },        // insufficient_history
    { ticker: 'D404',  gics_sector: 'IT' },        // fetch_error (404)
    { ticker: 'SOLO',  gics_sector: 'Energy' },    // singleton_sector
    { ticker: 'NUL',   gics_sector: null },        // missing_sector
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    A1: { kind: 'bars', bars: fullHistory(1.0, 100) },
    A2: { kind: 'bars', bars: fullHistory(0.4, 150) },
    A3: { kind: 'bars', bars: fullHistory(2.0, 50) },
    F1: { kind: 'bars', bars: fullHistory(0.3, 70) },
    F2: { kind: 'bars', bars: fullHistory(0.5, 90) },
    F3: { kind: 'bars', bars: fullHistory(0.7, 60) },
    SHORT: { kind: 'bars', bars: makeBars(100, (i) => 10 + i) },
    D404:  { kind: 'null' },
    SOLO:  { kind: 'bars', bars: fullHistory(0.5, 80) },
    NUL:   { kind: 'bars', bars: fullHistory(0.5, 80) },
  });
  const res = await createMomentumOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 6);
  const byReason = res.skipped.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  assertEquals(byReason.insufficient_history, 1);
  assertEquals(byReason.fetch_error, 1);
  assertEquals(byReason.singleton_sector, 1);
  assertEquals(byReason.missing_sector, 1);
});

Deno.test('(11) concurrency cap honored', async () => {
  const universe = Array.from({ length: 20 }, (_, i) => ({
    ticker: `T${i}`,
    gics_sector: 'IT',
  }));
  const { supabase } = makeSupabase({ universe });
  const behaviors: Record<string, any> = {};
  for (let i = 0; i < 20; i++) {
    behaviors[`T${i}`] = { kind: 'bars', bars: fullHistory(1.0 + i * 0.01, 100) };
  }
  const ph = makePriceHistory(behaviors);
  const res = await createMomentumOrchestrator(ctx(supabase, ph.fetcher, 5)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 20);
  assert(ph.peak() <= 5, `peak=${ph.peak()}`);
});

Deno.test('(12) determinism — same inputs produce identical persisted values', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const behaviors = {
    AAPL: { kind: 'bars', bars: fullHistory(1.0, 100) },
    MSFT: { kind: 'bars', bars: fullHistory(0.5, 200) },
    NVDA: { kind: 'bars', bars: fullHistory(2.0, 50) },
  };
  const a = makeSupabase({ universe });
  const b = makeSupabase({ universe });
  const fa = makePriceHistory(behaviors);
  const fb = makePriceHistory(behaviors);
  const ra = await createMomentumOrchestrator(ctx(a.supabase, fa.fetcher)).run(AS_OF);
  const rb = await createMomentumOrchestrator(ctx(b.supabase, fb.fetcher)).run(AS_OF);
  const vals = (calls: any) =>
    [...calls.upsertPayloads[0]]
      .sort((x, y) => x.ticker.localeCompare(y.ticker))
      .map((r) => ({ ticker: r.ticker, value: r.value }));
  assertEquals(vals(a.calls), vals(b.calls));
  assertEquals(ra.persisted_count, rb.persisted_count);
  // DEC-034(4): telemetry timestamps derive from as_of, so two runs with
  // the same as_of produce byte-identical started_at/completed_at and
  // byte-identical computed_at on every persisted row.
  const expectedTs = AS_OF.toISOString();
  assertEquals(ra.started_at, expectedTs);
  assertEquals(ra.completed_at, expectedTs);
  assertEquals(rb.started_at, expectedTs);
  assertEquals(rb.completed_at, expectedTs);
  for (const row of a.calls.upsertPayloads[0]) {
    assertEquals(row.computed_at, expectedTs);
  }
  for (const row of b.calls.upsertPayloads[0]) {
    assertEquals(row.computed_at, expectedTs);
  }
});