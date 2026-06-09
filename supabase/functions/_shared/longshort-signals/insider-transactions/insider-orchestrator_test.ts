// @ts-nocheck — Deno test file.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createInsiderOrchestrator, SIGNAL_ID } from './insider-orchestrator.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type { SignalRow } from '../shared/signal-types.ts';
import type { Form4Row } from '../shared/polygon-form4-fetcher.ts';
import type { PolygonForm4Fetcher } from '../shared/polygon-form4-fetcher.ts';
import type { PolygonSharesOutstandingFetcher } from '../shared/polygon-shares-outstanding-fetcher.ts';
import type { PolygonPriceHistoryFetcher } from '../shared/polygon-price-history-fetcher.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-08T21:00:00Z');
const AS_OF_DATE = '2026-06-08';
const LATEST_SNAPSHOT = '2026-06-05';

type Form4Behavior =
  | { kind: 'rows'; rows: Form4Row[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' }
  | { kind: 'throw'; err: unknown };

type SharesBehavior =
  | { kind: 'shares'; shares: number }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

type PriceBehavior =
  | { kind: 'bars'; close: number }
  | { kind: 'empty' }
  | { kind: 'null' };

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  upsertError?: { message: string } | null;
}) {
  const upsertPayloads: SignalRow[][] = [];
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;
  const supabase = {
    from(table: string) {
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
            return Promise.resolve({ data: latestDate ? [{ as_of_date: latestDate }] : [], error: null });
          }
          return Promise.resolve({ data: universe, error: null });
        };
        return builder;
      }
      if (table === 'signal_observations') {
        return {
          upsert(payload: SignalRow[]) {
            upsertPayloads.push(payload);
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
  return { supabase, upsertPayloads };
}

function makeForm4(behaviors: Record<string, Form4Behavior>) {
  // Build a Map<ticker, Form4Row[]> from the per-ticker behaviors. If
  // ANY behavior is 'unavailable', the whole market-wide call returns
  // that (mirrors real-world entitlement gate behavior). If ANY is
  // 'throw', the market-wide call throws.
  return {
    async fetchForm4MarketWide() {
      const rowsByTicker = new Map<string, Form4Row[]>();
      for (const [t, b] of Object.entries(behaviors)) {
        if (b.kind === 'throw') throw b.err;
        if (b.kind === 'unavailable') {
          return { kind: 'unavailable', reason: b.reason };
        }
        if (b.rows.length > 0) rowsByTicker.set(t, b.rows);
      }
      return { kind: 'rows', rowsByTicker };
    },
    // Per-ticker variant retained for debug paths; unused by orchestrator.
    async fetchForm4(ticker: string) {
      const b = behaviors[ticker];
      if (!b) return { kind: 'rows', rows: [] };
      if (b.kind === 'throw') throw b.err;
      if (b.kind === 'unavailable') return { kind: 'unavailable', reason: b.reason };
      return { kind: 'rows', rows: b.rows };
    },
  } as unknown as PolygonForm4Fetcher;
}
function makeShares(behaviors: Record<string, SharesBehavior> = {}) {
  return {
    async fetchShares(ticker: string) {
      const b = behaviors[ticker];
      if (!b) return { kind: 'shares', shares: 1_000_000_000 };
      if (b.kind === 'unavailable') return { kind: 'unavailable', reason: b.reason };
      return { kind: 'shares', shares: b.shares };
    },
  } as unknown as PolygonSharesOutstandingFetcher;
}
function makePrice(behaviors: Record<string, PriceBehavior> = {}) {
  return {
    async fetchPriceHistory(ticker: string) {
      const b = behaviors[ticker];
      if (!b) return [{ ts: '2026-06-08', close: 100 }];
      if (b.kind === 'null') return null;
      if (b.kind === 'empty') return [];
      return [{ ts: '2026-06-08', close: b.close }];
    },
  } as unknown as PolygonPriceHistoryFetcher;
}

function buyRow(over: Partial<Form4Row> = {}): Form4Row {
  return {
    record_type: 'transaction',
    transaction_code: 'P',
    aff_10b5_one: false,
    transaction_acquired_disposed: 'A',
    transaction_shares: 1000,
    transaction_price_per_share: 100,
    transaction_date: '2026-06-05',
    is_officer: true,
    officer_title: 'CEO',
    ...over,
  };
}

function ctx(supabase: unknown, form4: unknown, shares?: unknown, price?: unknown) {
  return {
    supabase,
    form4,
    sharesOutstanding: shares ?? makeShares(),
    priceHistory: price ?? makePrice(),
    operator_id: OPERATOR_ID,
  };
}

Deno.test('(1) signal_id locked = insider_transactions_90d', () => {
  assertEquals(SIGNAL_ID, 'insider_transactions_90d');
});

Deno.test('(2) happy path — qualifying buy on 2 of 3 tickers, third skipped no_qualifying', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  const form4 = makeForm4({
    AAPL: { kind: 'rows', rows: [buyRow({ transaction_shares: 1000 })] },
    MSFT: { kind: 'rows', rows: [buyRow({ transaction_shares: 500 })] },
    NVDA: { kind: 'rows', rows: [] }, // empty 90-day window
  });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.universe_size, 3);
  assertEquals(res.persisted_count, 2);
  const nvda = res.skipped.find((s) => s.ticker === 'NVDA');
  assert(nvda);
  assertEquals(nvda!.reason, 'no_qualifying_transactions');
  assertEquals(upsertPayloads[0].length, 2);
});

Deno.test('(3) subscription_gated (403) → typed skip, NOT a fake zero', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'GATED', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const form4 = makeForm4({
    AAPL: { kind: 'rows', rows: [buyRow({ transaction_shares: 1000 })] },
    MSFT: { kind: 'rows', rows: [buyRow({ transaction_shares: 500 })] },
    GATED: { kind: 'unavailable', reason: 'subscription_gated' },
  });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  const gated = res.skipped.find((s) => s.ticker === 'GATED');
  assert(gated);
  assertEquals(gated!.reason, 'subscription_gated');
});

Deno.test('(4) missing shares → missing_shares_outstanding skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NOSHARES', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const form4 = makeForm4({
    AAPL: { kind: 'rows', rows: [buyRow()] },
    MSFT: { kind: 'rows', rows: [buyRow()] },
    NOSHARES: { kind: 'rows', rows: [buyRow()] },
  });
  const shares = makeShares({ NOSHARES: { kind: 'unavailable', reason: 'data_unavailable' } });
  const res = await createInsiderOrchestrator(ctx(supabase, form4, shares)).run(AS_OF);
  const ns = res.skipped.find((s) => s.ticker === 'NOSHARES');
  assert(ns);
  assertEquals(ns!.reason, 'missing_shares_outstanding');
});

Deno.test('(5) missing price (null/empty) → data_unavailable skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NOPX', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const form4 = makeForm4({
    AAPL: { kind: 'rows', rows: [buyRow()] },
    MSFT: { kind: 'rows', rows: [buyRow()] },
    NOPX: { kind: 'rows', rows: [buyRow()] },
  });
  const price = makePrice({ NOPX: { kind: 'null' } });
  const res = await createInsiderOrchestrator(ctx(supabase, form4, undefined, price)).run(AS_OF);
  const nopx = res.skipped.find((s) => s.ticker === 'NOPX');
  assert(nopx);
  assertEquals(nopx!.reason, 'data_unavailable');
});

Deno.test('(6) market-wide fetch throw → outcome=failed + failure_reason, NO per-ticker skips (INC-70 / ACT-156 double-tally fix)', async () => {
  // FP-042 P2 fix: a throw on the SOLE Form 4 source means the run has
  // zero data and MUST surface as a single `outcome='failed'` with a
  // failure_reason carrying the thrown message. Crucially, the run must
  // NOT push per-ticker `fetch_error` skips AND must NOT fall through
  // into the qualifying-filter loop (the pre-ACT-156 bug pushed BOTH
  // a `fetch_error` and a `no_qualifying_transactions` skip per ticker,
  // producing 1678 skips for an 839-ticker universe).
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'XYZ', gics_sector: 'IT' },
  ];
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  // The mock form4 throws from fetchForm4MarketWide when ANY behavior is
  // 'throw' (see makeForm4 helper) — modeling the real market-wide call
  // failing for the whole run.
  const form4 = makeForm4({
    XYZ: {
      kind: 'throw',
      err: new SignalComputationError(
        'polygon_form4',
        'MARKET_WIDE',
        'pagination cap exceeded (50 pages); refusing to follow further',
      ),
    },
  });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.universe_size, 3);
  assertEquals(res.persisted_count, 0);
  // No per-ticker skips emitted on the throw path — failure_reason is
  // the single canonical surface for the diagnosis.
  assertEquals(res.skipped.length, 0);
  // No double-tally: a single ticker can never appear in two skip
  // classes (the bug fixed at INC-70 / ACT-156).
  assertEquals(res.skipped.filter((s) => s.ticker === 'XYZ').length, 0);
  assert(res.failure_reason);
  assertStringIncludes(res.failure_reason!, 'form4 market-wide fetch failed');
  assertStringIncludes(res.failure_reason!, 'pagination cap exceeded');
  // Persist was not called on the failed path (no signal_observations
  // upsert for a zero-data run).
  assertEquals(upsertPayloads.length, 0);
});

Deno.test('(7) sign convention — buy → positive raw, sale → negative raw (ordering)', async () => {
  const universe = [
    { ticker: 'BUY', gics_sector: 'IT' },
    { ticker: 'SELL', gics_sector: 'IT' },
  ];
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  const form4 = makeForm4({
    BUY: {
      kind: 'rows',
      rows: [buyRow({ transaction_code: 'P', transaction_acquired_disposed: 'A' })],
    },
    SELL: {
      kind: 'rows',
      rows: [buyRow({
        transaction_code: 'S',
        aff_10b5_one: false,
        transaction_acquired_disposed: 'D',
      })],
    },
  });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.persisted_count, 2);
  const payload = upsertPayloads[0];
  const buy = payload.find((r: SignalRow) => r.ticker === 'BUY')!;
  const sell = payload.find((r: SignalRow) => r.ticker === 'SELL')!;
  // BUY raw > SELL raw → within-IT-sector z-score: BUY > SELL.
  assert(buy.value > sell.value, `expected BUY z > SELL z, got buy=${buy.value} sell=${sell.value}`);
});

Deno.test('(8) 10b5-1 sale EXCLUDED — universe of all-10b5-1 sales → all skip no_qualifying', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'IT' },
    { ticker: 'B', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const form4 = makeForm4({
    A: { kind: 'rows', rows: [buyRow({
      transaction_code: 'S', aff_10b5_one: true, transaction_acquired_disposed: 'D',
    })]},
    B: { kind: 'rows', rows: [buyRow({
      transaction_code: 'S', aff_10b5_one: true, transaction_acquired_disposed: 'D',
    })]},
  });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.persisted_count, 0);
  assert(res.skipped.every((s) => s.reason === 'no_qualifying_transactions'));
});

Deno.test('(9) empty universe → outcome=failed, failure_reason=empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const form4 = makeForm4({});
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.failure_reason, 'empty_universe');
});

Deno.test('(10) persistence error → outcome=failed with reason', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'IT' },
    { ticker: 'B', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe, upsertError: { message: 'unique violation' } });
  const form4 = makeForm4({
    A: { kind: 'rows', rows: [buyRow()] },
    B: { kind: 'rows', rows: [buyRow({ transaction_shares: 500 })] },
  });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertStringIncludes(res.failure_reason!, 'unique violation');
});

Deno.test('(11) determinism — same inputs → same persisted values + as_of-derived timestamps', async () => {
  const universe = [
    { ticker: 'A', gics_sector: 'IT' },
    { ticker: 'B', gics_sector: 'IT' },
    { ticker: 'C', gics_sector: 'IT' },
  ];
  const rows = {
    A: [buyRow({ transaction_shares: 1000 })],
    B: [buyRow({ transaction_shares: 500 })],
    C: [buyRow({ transaction_shares: 2000 })],
  };
  const a = makeSupabase({ universe });
  const b = makeSupabase({ universe });
  const ra = await createInsiderOrchestrator(ctx(a.supabase, makeForm4({
    A: { kind: 'rows', rows: rows.A }, B: { kind: 'rows', rows: rows.B }, C: { kind: 'rows', rows: rows.C },
  }))).run(AS_OF);
  const rb = await createInsiderOrchestrator(ctx(b.supabase, makeForm4({
    A: { kind: 'rows', rows: rows.A }, B: { kind: 'rows', rows: rows.B }, C: { kind: 'rows', rows: rows.C },
  }))).run(AS_OF);
  const sortVals = (p: SignalRow[][]) =>
    p[0].slice().sort((x: SignalRow, y: SignalRow) => x.ticker.localeCompare(y.ticker))
      .map((r: SignalRow) => ({ ticker: r.ticker, value: r.value }));
  assertEquals(sortVals(a.upsertPayloads), sortVals(b.upsertPayloads));
  const expectedTs = AS_OF.toISOString();
  assertEquals(ra.started_at, expectedTs);
  assertEquals(ra.completed_at, expectedTs);
  for (const r of a.upsertPayloads[0]) {
    assertEquals(r.computed_at, expectedTs);
  }
  assertEquals(ra.persisted_count, rb.persisted_count);
});

Deno.test('(12) as_of_date in result matches as_of (YYYY-MM-DD slice)', async () => {
  const universe = [{ ticker: 'A', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe });
  const form4 = makeForm4({ A: { kind: 'rows', rows: [] } });
  const res = await createInsiderOrchestrator(ctx(supabase, form4)).run(AS_OF);
  assertEquals(res.as_of_date, AS_OF_DATE);
  assertEquals(res.signal_id, SIGNAL_ID);
});