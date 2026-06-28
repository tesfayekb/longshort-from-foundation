// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
// Mirrors `cross-sectional-momentum/momentum-orchestrator_test.ts` shape.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createReversalOrchestrator,
  SIGNAL_ID,
} from './reversal-orchestrator.ts';
import { REVERSAL_MIN_BARS } from './compute-reversal.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type { SignalRow } from '../shared/signal-types.ts';

type DailyBarLite = { ts: string; close: number };
type Behavior =
  | { kind: 'bars'; bars: DailyBarLite[] }
  | { kind: 'null' }
  | { kind: 'throw'; err: unknown };
type MockCalls = {
  upsertPayloads: SignalRow[][];
  fromTables: string[];
  shadowUpserts: Array<Array<Record<string, unknown>>>;
  crossSignalReads: number;
  preconditionReads: number;
};

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-08T20:00:00Z');
const AS_OF_DATE = '2026-06-08';
const LATEST_SNAPSHOT = '2026-06-05';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeBars(n: number, closeFn: (i: number) => number, endTs = AS_OF.getTime()) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = endTs - (n - 1 - i) * MS_PER_DAY;
    out.push({ ts: new Date(t).toISOString().slice(0, 10), close: closeFn(i) });
  }
  return out;
}

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  latestError?: { message: string } | null;
  universeError?: { message: string } | null;
  upsertError?: { message: string } | null;
  runs?: string[];
  newsPresent?: string[];
  catalystPresent?: string[];
  shadowError?: { message: string } | null;
}) {
  const calls = {
    upsertPayloads: [] as SignalRow[][],
    fromTables: [] as string[],
    shadowUpserts: [] as Array<Array<Record<string, unknown>>>,
    crossSignalReads: 0,
    preconditionReads: 0,
  } satisfies MockCalls;
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;
  const runs = opts.runs ?? ['news_sentiment_7d', 'active_catalyst_flag'];
  const newsP = new Set(opts.newsPresent ?? []);
  const catP = new Set(opts.catalystPresent ?? []);

  const supabase = {
    from(table: string) {
      calls.fromTables.push(table);
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const builder: Record<string, unknown> = {
          select(cols: string) {
            mode = cols === 'as_of_date' ? 'latest' : 'rows';
            return builder;
          },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(onFul: unknown, onRej: unknown) { return resolve().then(onFul, onRej); },
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
        const builder: Record<string, unknown> = {
          select(_cols: string) { calls.crossSignalReads += 1; return builder; },
          eq() { return builder; },
          in() { return builder; },
          then(onFul: unknown, onRej: unknown) {
            const rows: Array<{ ticker: string; signal_id: string }> = [];
            for (const t of newsP) rows.push({ ticker: t, signal_id: 'news_sentiment_7d' });
            for (const t of catP) rows.push({ ticker: t, signal_id: 'active_catalyst_flag' });
            return Promise.resolve({ data: rows, error: null }).then(onFul as any, onRej as any);
          },
          upsert(payload: SignalRow[]) {
            calls.upsertPayloads.push(payload);
            return Promise.resolve({
              error: opts.upsertError ?? null,
              count: opts.upsertError ? null : payload.length,
            });
          },
        };
        return builder;
      }
      if (table === 'signal_compute_log') {
        const builder: Record<string, unknown> = {
          select() { calls.preconditionReads += 1; return builder; },
          eq() { return builder; },
          in() { return builder; },
          then(onFul: unknown, onRej: unknown) {
            const data = runs.map((s) => ({ signal_id: s }));
            return Promise.resolve({ data, error: null }).then(onFul as any, onRej as any);
          },
        };
        return builder;
      }
      if (table === 'reversal_ungated_observations') {
        return {
          upsert(payload: Array<Record<string, unknown>>) {
            calls.shadowUpserts.push(payload);
            return Promise.resolve({ error: opts.shadowError ?? null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

function makePriceHistory(behaviors: Record<string, Behavior>) {
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
    } as unknown as import('../shared/polygon-price-history-fetcher.ts').PolygonPriceHistoryFetcher,
    callOrder,
    peak: () => peakInFlight,
  };
}

function ctx(supabase: unknown, fetcher: unknown, concurrency?: number) {
  return {
    supabase,
    priceHistory: fetcher,
    operator_id: OPERATOR_ID,
    ...(concurrency !== undefined ? { concurrency } : {}),
  };
}

// Build a 7-bar history with a deterministic 5-day return.
// bars[0]=base, bars[5]=base*(1+ret), bars[1..4] interpolated, bars[6]=base
// (bars[6] is the "T" slot — not consulted by computeReversal).
function reversalHistory(base: number, fiveDayReturn: number) {
  const bars: DailyBarLite[] = makeBars(7, (i) => {
    if (i === 0) return base;
    if (i === 5) return base * (1 + fiveDayReturn);
    return base + i; // arbitrary; not consulted
  });
  return bars;
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    NVDA: { kind: 'bars', bars: reversalHistory(50,  0.10) },
    JPM:  { kind: 'bars', bars: reversalHistory(150, -0.03) },
    BAC:  { kind: 'bars', bars: reversalHistory(30,  0.01) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.03) },
    NEW:  { kind: 'bars', bars: makeBars(REVERSAL_MIN_BARS - 1, (i) => 10 + i) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    DEAD: { kind: 'null' },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    XYZ:  { kind: 'throw', err: new SignalComputationError('short_term_reversal_1w', 'XYZ', 'HTTP 500 boom') },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    SOLO: { kind: 'bars', bars: reversalHistory(80,  0.04) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    NUL:  { kind: 'bars', bars: reversalHistory(80,  0.04) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const nul = res.skipped.find((s) => s.ticker === 'NUL');
  assert(nul, 'expected NUL skip');
  assertEquals(nul!.reason, 'missing_sector');
});

Deno.test('(7) empty universe → outcome=failed, failure_reason=empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const { fetcher } = makePriceHistory({});
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
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
  await assertRejects(() => createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF), Error, 'db exploded');
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
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.persisted_count, 0);
  assertStringIncludes(res.failure_reason!, 'unique violation');
});

Deno.test('(10) concurrency cap honored', async () => {
  const universe = Array.from({ length: 20 }, (_, i) => ({
    ticker: `T${i}`,
    gics_sector: 'IT',
  }));
  const { supabase } = makeSupabase({ universe });
  const behaviors: Record<string, Behavior> = {};
  for (let i = 0; i < 20; i++) {
    behaviors[`T${i}`] = { kind: 'bars', bars: reversalHistory(100 + i, 0.01 * (i - 10)) };
  }
  const ph = makePriceHistory(behaviors);
  const res = await createReversalOrchestrator(ctx(supabase, ph.fetcher, 5)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 20);
  assert(ph.peak() <= 5, `peak=${ph.peak()}`);
});

Deno.test('(11) determinism — same inputs produce identical persisted values + as_of-derived timestamps', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const behaviors = {
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    NVDA: { kind: 'bars', bars: reversalHistory(50,  0.10) },
  };
  const a = makeSupabase({ universe });
  const b = makeSupabase({ universe });
  const fa = makePriceHistory(behaviors);
  const fb = makePriceHistory(behaviors);
  const ra = await createReversalOrchestrator(ctx(a.supabase, fa.fetcher)).run(AS_OF);
  const rb = await createReversalOrchestrator(ctx(b.supabase, fb.fetcher)).run(AS_OF);
  const vals = (calls: MockCalls) =>
    [...calls.upsertPayloads[0]]
      .sort((x, y) => x.ticker.localeCompare(y.ticker))
      .map((r) => ({ ticker: r.ticker, value: r.value }));
  assertEquals(vals(a.calls), vals(b.calls));
  assertEquals(ra.persisted_count, rb.persisted_count);
  const expectedTs = AS_OF.toISOString();
  assertEquals(ra.started_at, expectedTs);
  assertEquals(ra.completed_at, expectedTs);
  for (const row of a.calls.upsertPayloads[0]) {
    assertEquals(row.computed_at, expectedTs);
  }
});

Deno.test('(12) signal_id locked = short_term_reversal_1w', () => {
  assertEquals(SIGNAL_ID, 'short_term_reversal_1w');
});

// ─── DEC-071 sub-step 3b: cross-signal gate tests ──────────────────────

Deno.test('(13) DEC-071 — gated_by_news emits typed-absence row + shadow gate_decision', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({
    universe,
    newsPresent: ['AAPL'],
  });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    NVDA: { kind: 'bars', bars: reversalHistory(50, 0.10) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  // 2 normal (MSFT, NVDA z-scored) + 1 gated (AAPL typed-absence)
  assertEquals(calls.upsertPayloads.length, 1);
  const payload = calls.upsertPayloads[0];
  assertEquals(payload.length, 3);
  const aapl = payload.find((r) => r.ticker === 'AAPL')!;
  assertEquals(aapl.is_present, false);
  assertEquals(aapl.value, null);
  assertEquals(aapl.skip_reason, 'gated_by_news');
  const msft = payload.find((r) => r.ticker === 'MSFT')!;
  assertEquals(msft.is_present, true);
  assert(typeof msft.value === 'number');
  // Shadow: every value-ticker present with gate_decision tag.
  assertEquals(calls.shadowUpserts.length, 1);
  const shadow = calls.shadowUpserts[0];
  assertEquals(shadow.length, 3);
  const aaplShadow = shadow.find((r) => r.ticker === 'AAPL')!;
  assertEquals(aaplShadow.gate_decision, 'gated_by_news');
  assert(typeof aaplShadow.raw_value === 'number');
  const msftShadow = shadow.find((r) => r.ticker === 'MSFT')!;
  assertEquals(msftShadow.gate_decision, 'none');
});

Deno.test('(14) DEC-071 — news precedence over catalyst when both fire', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({
    universe,
    newsPresent: ['AAPL'],
    catalystPresent: ['AAPL', 'MSFT'],
  });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    NVDA: { kind: 'bars', bars: reversalHistory(50, 0.10) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  const payload = calls.upsertPayloads[0];
  const aapl = payload.find((r) => r.ticker === 'AAPL')!;
  assertEquals(aapl.skip_reason, 'gated_by_news'); // news beats catalyst
  const msft = payload.find((r) => r.ticker === 'MSFT')!;
  assertEquals(msft.skip_reason, 'gated_by_catalyst');
  assertEquals(msft.is_present, false);
  assertEquals(msft.value, null);
  // DEC-071 3b telemetry fix (MIG-136): orchestrator result carries
  // gate_counts computed from the typed-absence rows actually emitted —
  // news=1 (AAPL), catalyst=1 (MSFT, after news-precedence absorbed
  // AAPL's catalyst overlap). Distinct from skipped[]; verified disjoint.
  assertEquals(res.gate_counts, { gated_by_news: 1, gated_by_catalyst: 1 });
  // Disjoint-from-skipped invariant: the two gated tickers MUST NOT appear
  // in skipped[] (gated≠skipped); other tickers (e.g. NVDA singleton) may.
  const gatedTickers = new Set(['AAPL', 'MSFT']);
  for (const s of res.skipped) assert(!gatedTickers.has(s.ticker));
});

Deno.test('(15) DEC-071 — gate_inputs_unavailable → RAW emit (no skip, no exclude)', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({
    universe,
    runs: ['news_sentiment_7d'], // catalyst job did NOT run
    newsPresent: ['AAPL'], // even with news present, no gating triggers
  });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  // Cross-signal observations read MUST NOT happen when precondition fails.
  assertEquals(calls.crossSignalReads, 0);
  // Both names emit normal rows (raw → z-scored, is_present=true, no skip_reason).
  const payload = calls.upsertPayloads[0];
  assertEquals(payload.length, 2);
  for (const r of payload) {
    assertEquals(r.is_present, true);
    assert(typeof r.value === 'number');
    assert(r.skip_reason === null || r.skip_reason === undefined);
  }
  // Shadow rows tagged gate_inputs_unavailable — no series gap.
  const shadow = calls.shadowUpserts[0];
  assertEquals(shadow.length, 2);
  for (const r of shadow) {
    assertEquals(r.gate_decision, 'gate_inputs_unavailable');
  }
});

Deno.test('(16) DEC-071 — no news + no catalyst → byte-identical to pre-DEC-071', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  // Both precondition signals successful, but no per-ticker presence.
  const { supabase, calls } = makeSupabase({ universe });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  const payload = calls.upsertPayloads[0];
  for (const r of payload) {
    assertEquals(r.is_present, true);
    assert(typeof r.value === 'number');
    assert(r.skip_reason === null || r.skip_reason === undefined);
  }
  // All shadow rows tagged 'none' (normal emit).
  for (const r of calls.shadowUpserts[0]) {
    assertEquals(r.gate_decision, 'none');
  }
});

Deno.test('(17) DEC-071 — insufficient_history is NOT a gate; existing skip path unchanged', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NEW',  gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({
    universe,
    newsPresent: ['NEW'], // even gated, the genuine-data-gap skip wins
  });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
    NEW:  { kind: 'bars', bars: makeBars(REVERSAL_MIN_BARS - 1, (i) => 10 + i) },
  });
  const res = await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  const reasons = res.skipped.map((s) => `${s.ticker}:${s.reason}`).sort();
  assert(reasons.includes('NEW:insufficient_history'),
    `expected NEW:insufficient_history, got ${reasons.join(',')}`);
  // NEW gets NO shadow row (no raw_signal was computed).
  const tickersInShadow = calls.shadowUpserts[0].map((r) => r.ticker);
  assert(!tickersInShadow.includes('NEW'));
});

Deno.test('(18) DEC-071 — single batched cross-signal read', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({ universe, newsPresent: ['AAPL'] });
  const { fetcher } = makePriceHistory({
    AAPL: { kind: 'bars', bars: reversalHistory(100, 0.05) },
    MSFT: { kind: 'bars', bars: reversalHistory(200, -0.02) },
  });
  await createReversalOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(calls.preconditionReads, 1);
  assertEquals(calls.crossSignalReads, 1);
});