// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createShortInterestOrchestrator,
  SIGNAL_ID,
} from './short-interest-orchestrator.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type { SignalRow } from '../shared/signal-types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-08T21:00:00Z');
const AS_OF_DATE = '2026-06-08';
const LATEST_SNAPSHOT = '2026-06-05';

/**
 * Default shares-outstanding for the universe — chosen as 1.0 so that the
 * derived `si_pct_float = short_interest / shares` equals the raw
 * `short_interest` numeric, which keeps the historical test fixtures
 * (`reportsAround(0.08, -0.02)` etc.) numerically equivalent under the
 * FP-041 revision-fix derivation path.
 */
const DEFAULT_SHARES = 1.0;

type Behavior =
  | { kind: 'reports'; reports: Array<{ report_date: string; short_interest: number }> }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' }
  | { kind: 'throw'; err: unknown };

type SharesBehavior =
  | { kind: 'shares'; shares: number }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' }
  | { kind: 'throw'; err: unknown };

type MockCalls = {
  upsertPayloads: SignalRow[][];
  fromTables: string[];
};

function reportsAround(base: number, delta: number) {
  // 3 reports — `short_interest` raw counts (orchestrator derives si_pct_float
  // via short_interest / shares; with DEFAULT_SHARES=1 the numerical values
  // pass through unchanged so the test math still reads as si-percentage).
  return [
    { report_date: '2026-04-30', short_interest: base },
    { report_date: '2026-05-15', short_interest: base + delta / 2 },
    { report_date: '2026-05-31', short_interest: base + delta },
  ];
}

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  latestError?: { message: string } | null;
  universeError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const calls: MockCalls = {
    upsertPayloads: [],
    fromTables: [],
  };
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;

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
        return {
          upsert(payload: SignalRow[]) {
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

function makeFetcher(behaviors: Record<string, Behavior>) {
  const callOrder: string[] = [];
  let inFlight = 0;
  let peakInFlight = 0;
  return {
    fetcher: {
      async fetchShortInterest(ticker: string) {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        callOrder.push(ticker);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        const b = behaviors[ticker];
        if (!b) throw new Error(`no behavior for ${ticker}`);
        if (b.kind === 'throw') throw b.err;
        if (b.kind === 'unavailable') return { kind: 'unavailable', reason: b.reason };
        return { kind: 'reports', reports: b.reports };
      },
    } as unknown as import('../shared/polygon-short-interest-fetcher.ts').PolygonShortInterestFetcher,
    callOrder,
    peak: () => peakInFlight,
  };
}

function makeSharesFetcher(behaviors: Record<string, SharesBehavior> = {}) {
  return {
    fetcher: {
      async fetchShares(ticker: string) {
        const b = behaviors[ticker];
        if (!b) {
          // Default: return DEFAULT_SHARES so derivation is a pass-through.
          return { kind: 'shares', shares: DEFAULT_SHARES };
        }
        if (b.kind === 'throw') throw b.err;
        if (b.kind === 'unavailable') return { kind: 'unavailable', reason: b.reason };
        return { kind: 'shares', shares: b.shares };
      },
    } as unknown as import('../shared/polygon-shares-outstanding-fetcher.ts').PolygonSharesOutstandingFetcher,
  };
}

function ctx(
  supabase: unknown,
  fetcher: unknown,
  concurrency?: number,
  sharesFetcher?: unknown,
) {
  return {
    supabase,
    shortInterest: fetcher,
    sharesOutstanding: sharesFetcher ?? makeSharesFetcher().fetcher,
    operator_id: OPERATOR_ID,
    ...(concurrency !== undefined ? { concurrency } : {}),
  };
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
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    NVDA: { kind: 'reports', reports: reportsAround(0.20, -0.10) },
    JPM:  { kind: 'reports', reports: reportsAround(0.06,  0.02) },
    BAC:  { kind: 'reports', reports: reportsAround(0.04, -0.01) },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.signal_id, SIGNAL_ID);
  assertEquals(res.as_of_date, AS_OF_DATE);
  assertEquals(res.universe_size, 5);
  assertEquals(res.persisted_count, 5);
  assertEquals(res.skipped, []);
  assertEquals(calls.upsertPayloads.length, 1);
  assertEquals(calls.upsertPayloads[0].length, 5);
});

Deno.test('(2) insufficient reports skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'NEW',  gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    NEW:  { kind: 'reports', reports: [{ report_date: '2026-05-31', si_pct_float: 0.08 }] },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  const reasons = res.skipped.map((s) => `${s.ticker}:${s.reason}`).sort();
  // AAPL alone in IT after NEW skip → singleton_sector
  assertEquals(reasons, ['AAPL:singleton_sector', 'NEW:insufficient_history']);
  assertEquals(res.persisted_count, 0);
});

Deno.test('(3) subscription_gated (403) → typed skip, NOT a fake zero, ticker still ranked', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'GATED', gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    GATED: { kind: 'unavailable', reason: 'subscription_gated' },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const gated = res.skipped.find((s) => s.ticker === 'GATED');
  assert(gated, 'expected GATED skip');
  assertEquals(gated!.reason, 'subscription_gated');
  assertStringIncludes(gated!.detail!, '403');
  // No fabricated zero — GATED must NOT appear in any upsert payload.
  const persistedTickers = calls.upsertPayloads[0].map((r) => r.ticker);
  assert(!persistedTickers.includes('GATED'), 'GATED leaked into observations');
});

Deno.test('(4) data_unavailable (404) → typed skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NONE', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    NONE: { kind: 'unavailable', reason: 'data_unavailable' },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  const none = res.skipped.find((s) => s.ticker === 'NONE');
  assert(none);
  assertEquals(none!.reason, 'data_unavailable');
});

Deno.test('(5) ALL-MISSING entitlement-gated universe → outcome=completed (degraded), persisted_count=0', async () => {
  // Exercises the "subscription gated for the whole universe" path. The
  // signal is non-critical, so this is NOT a hard failure — the system
  // keeps working, the operator sees the gap, and the combiner imputes.
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'unavailable', reason: 'subscription_gated' },
    MSFT: { kind: 'unavailable', reason: 'subscription_gated' },
    NVDA: { kind: 'unavailable', reason: 'subscription_gated' },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 0);
  assertEquals(res.skipped.length, 3);
  assert(res.skipped.every((s) => s.reason === 'subscription_gated'));
});

Deno.test('(6) fetcher throw (non-403/404) → fetch_error skip with ticker context', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'XYZ',  gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    XYZ:  { kind: 'throw', err: new SignalComputationError('polygon_short_interest', 'XYZ', 'HTTP 500 boom') },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const xyz = res.skipped.find((s) => s.ticker === 'XYZ');
  assert(xyz);
  assertEquals(xyz!.reason, 'fetch_error');
  assertStringIncludes(xyz!.detail!, 'XYZ');
});

Deno.test('(7) empty universe → outcome=failed, failure_reason=empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const { fetcher } = makeFetcher({});
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.failure_reason, 'empty_universe');
});

Deno.test('(8) universe-read error → throws (catastrophic)', async () => {
  const { supabase } = makeSupabase({
    universe: [{ ticker: 'AAPL', gics_sector: 'IT' }],
    latestError: { message: 'db exploded' },
  });
  const { fetcher } = makeFetcher({});
  await assertRejects(
    () => createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF),
    Error,
    'db exploded',
  );
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
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
  });
  const res = await createShortInterestOrchestrator(ctx(supabase, fetcher)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
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
    behaviors[`T${i}`] = { kind: 'reports', reports: reportsAround(0.05 + i * 0.001, 0.01 * (i - 10)) };
  }
  const ph = makeFetcher(behaviors);
  const res = await createShortInterestOrchestrator(ctx(supabase, ph.fetcher, 5)).run(AS_OF);
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
  const behaviors: Record<string, Behavior> = {
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    NVDA: { kind: 'reports', reports: reportsAround(0.20, -0.10) },
  };
  const a = makeSupabase({ universe });
  const b = makeSupabase({ universe });
  const fa = makeFetcher(behaviors);
  const fb = makeFetcher(behaviors);
  const ra = await createShortInterestOrchestrator(ctx(a.supabase, fa.fetcher)).run(AS_OF);
  const rb = await createShortInterestOrchestrator(ctx(b.supabase, fb.fetcher)).run(AS_OF);
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

Deno.test('(12) signal_id locked = short_interest_change_30d', () => {
  assertEquals(SIGNAL_ID, 'short_interest_change_30d');
});

// ── FP-041 revision-fix: shares-outstanding derivation path ────────────

Deno.test('(13) si_pct_float is DERIVED from short_interest / shares (not read verbatim)', async () => {
  // Two tickers, identical raw `short_interest` arrays, DIFFERENT shares
  // → derived si_pct_float differs → z-scores within the same sector
  // differ. Locks the derivation: if the orchestrator regressed to
  // reading si_pct_float directly, both tickers would have identical
  // raw_signal and z-score to a tie (0,0).
  const universe = [
    { ticker: 'BIG', gics_sector: 'IT' }, // shares=1_000_000_000
    { ticker: 'SML', gics_sector: 'IT' }, // shares=10_000_000
  ];
  const { supabase, calls } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    BIG: { kind: 'reports', reports: [
      { report_date: '2026-04-30', short_interest: 100_000_000 },
      { report_date: '2026-05-15', short_interest: 105_000_000 },
      { report_date: '2026-05-31', short_interest:  80_000_000 },
    ]},
    SML: { kind: 'reports', reports: [
      { report_date: '2026-04-30', short_interest: 1_000_000 },
      { report_date: '2026-05-15', short_interest: 1_500_000 },
      { report_date: '2026-05-31', short_interest: 3_000_000 },
    ]},
  });
  const { fetcher: sharesFetcher } = makeSharesFetcher({
    BIG: { kind: 'shares', shares: 1_000_000_000 },
    SML: { kind: 'shares', shares:    10_000_000 },
  });
  const res = await createShortInterestOrchestrator(
    ctx(supabase, fetcher, undefined, sharesFetcher),
  ).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const payload = calls.upsertPayloads[0];
  const big = payload.find((r) => r.ticker === 'BIG')!;
  const sml = payload.find((r) => r.ticker === 'SML')!;
  // BIG: -(0.08 - 0.10) = +0.02 (bullish, shorts covered)
  // SML: -(0.30 - 0.10) = -0.20 (bearish, shorts piled on)
  // → BIG raw > SML raw → BIG z > SML z (within IT, 2 members: ±1)
  assert(big.value! > sml.value!, 'derivation regressed: BIG vs SML ordering wrong');
});

Deno.test('(14) missing shares (404/null) → missing_shares_outstanding skip, ticker dropped from observations', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NOSHARES', gics_sector: 'IT' },
  ];
  const { supabase, calls } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    NOSHARES: { kind: 'reports', reports: reportsAround(0.06, -0.01) },
  });
  const { fetcher: sharesFetcher } = makeSharesFetcher({
    NOSHARES: { kind: 'unavailable', reason: 'data_unavailable' },
  });
  const res = await createShortInterestOrchestrator(
    ctx(supabase, fetcher, undefined, sharesFetcher),
  ).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const noshares = res.skipped.find((s) => s.ticker === 'NOSHARES');
  assert(noshares, 'expected NOSHARES skip');
  assertEquals(noshares!.reason, 'missing_shares_outstanding');
  const persistedTickers = calls.upsertPayloads[0].map((r) => r.ticker);
  assert(!persistedTickers.includes('NOSHARES'), 'NOSHARES leaked into observations (anti-phantom)');
});

Deno.test('(15) shares subscription_gated (403) → missing_shares_outstanding skip with diagnostic detail', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'GATED', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    GATED: { kind: 'reports', reports: reportsAround(0.06, -0.01) },
  });
  const { fetcher: sharesFetcher } = makeSharesFetcher({
    GATED: { kind: 'unavailable', reason: 'subscription_gated' },
  });
  const res = await createShortInterestOrchestrator(
    ctx(supabase, fetcher, undefined, sharesFetcher),
  ).run(AS_OF);
  const gated = res.skipped.find((s) => s.ticker === 'GATED')!;
  assertEquals(gated.reason, 'missing_shares_outstanding');
  assertStringIncludes(gated.detail!, '403');
});

Deno.test('(16) shares fetcher throw (non-403/404) → fetch_error skip, NOT missing_shares_outstanding', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'BOOM', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    AAPL: { kind: 'reports', reports: reportsAround(0.08, -0.02) },
    MSFT: { kind: 'reports', reports: reportsAround(0.05,  0.01) },
    BOOM: { kind: 'reports', reports: reportsAround(0.06, -0.01) },
  });
  const { fetcher: sharesFetcher } = makeSharesFetcher({
    BOOM: { kind: 'throw', err: new SignalComputationError('polygon_shares_outstanding', 'BOOM', 'HTTP 500 boom') },
  });
  const res = await createShortInterestOrchestrator(
    ctx(supabase, fetcher, undefined, sharesFetcher),
  ).run(AS_OF);
  const boom = res.skipped.find((s) => s.ticker === 'BOOM')!;
  assertEquals(boom.reason, 'fetch_error');
  assertStringIncludes(boom.detail!, 'BOOM');
});

Deno.test('(17) divide-by-zero defense — zero shares cannot reach divider even via mock', async () => {
  // Even if a future fetcher refactor weakens its `shares > 0` guard,
  // the orchestrator MUST not produce Infinity / NaN. The orchestrator
  // has a defensive re-check that maps zero shares to a typed skip.
  const universe = [{ ticker: 'ZERO', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe });
  const { fetcher } = makeFetcher({
    ZERO: { kind: 'reports', reports: reportsAround(0.06, -0.01) },
  });
  // Mock a fetcher that LIES and returns shares=0 (bypassing its own guard).
  const lyingFetcher = {
    async fetchShares(_ticker: string) {
      return { kind: 'shares', shares: 0 };
    },
  } as unknown as import('../shared/polygon-shares-outstanding-fetcher.ts').PolygonSharesOutstandingFetcher;
  const res = await createShortInterestOrchestrator(
    ctx(supabase, fetcher, undefined, lyingFetcher),
  ).run(AS_OF);
  // empty_universe path requires >=1 row; with the single ZERO ticker
  // skipped, the z-score step has nothing to produce → 0 persisted.
  assertEquals(res.persisted_count, 0);
  const zero = res.skipped.find((s) => s.ticker === 'ZERO')!;
  assertEquals(zero.reason, 'missing_shares_outstanding');
  assertStringIncludes(zero.detail!, 'defensive');
});