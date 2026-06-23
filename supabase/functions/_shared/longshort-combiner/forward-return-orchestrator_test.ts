// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the FP-052 3.M-iv forward-return orchestrator (ACT-244).
 *
 * DB-free + Polygon-free: in-memory mock SupabaseClient + injected
 * PriceHistoryPort fake. Structural + behavioral assertions on:
 *   (forch-1) anti-join: tuples already in combiner_forward_returns are
 *             skipped.
 *   (forch-2) dedup: one fetch per distinct ticker even when multiple
 *             books / variants / horizons reference it.
 *   (forch-3) partial-fail isolation: one ticker throws → that ticker's
 *             tuples become fetch_error; OTHER tickers still write.
 *   (forch-4) idempotency: second run with the same set of existing
 *             rows writes ZERO new rows.
 *   (forch-5) maturation floor: immature tuples (run − seed < H days)
 *             are excluded BEFORE fetch.
 */
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createForwardReturnOrchestrator } from './forward-return-orchestrator.ts';
import { LIVE_VARIANT_LABEL } from './forward-return-constants.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

type LiveBookRow = { as_of_date: string; ticker: string; side: 'long' | 'short'; score: number | null };
type ShadowBookRow = LiveBookRow & { variant: string };
type FRKey = {
  source_table: 'combiner_book' | 'combiner_book_shadow';
  variant: string;
  seed_as_of_date: string;
  ticker: string;
  horizon_td: number;
  /** Status drives the anti-join filter introduced by the
   *  3.M-iv maturation-retry corrective: only `'success'` rows are terminal. */
  price_source_status?: 'success' | 'fetch_error' | 'polygon_404';
};
type Bar = { ts: string; close: number };

function makeSupabase(opts: {
  liveRows?: LiveBookRow[];
  shadowRows?: ShadowBookRow[];
  existingFR?: FRKey[];
  upsertErr?: { message: string } | null;
}) {
  const calls = {
    upsertChunks: [] as Array<{ payload: any[]; onConflict: string }>,
    sigInFilters: [] as unknown[],
  };
  const live = opts.liveRows ?? [];
  const shadow = opts.shadowRows ?? [];
  const existing = opts.existingFR ?? [];

  function pagedBuilder<T>(rows: T[], cfg: { applyEqFilters?: boolean } = {}) {
    let range: { from: number; to: number } | null = null;
    const eqFilters: Array<[string, unknown]> = [];
    const b: any = {
      select() { return b; },
      eq(col: string, val: unknown) {
        // Only honor the `price_source_status` filter — that's the contract
        // under test for the 3.M-iv anti-join. Other .eq() calls (e.g.
        // operator_id) are intentionally no-ops because the in-memory mock
        // rows omit those columns.
        if (cfg.applyEqFilters && col === 'price_source_status') {
          eqFilters.push([col, val]);
        }
        return b;
      },
      in(_col: string, val: unknown) { calls.sigInFilters.push(val); return b; },
      range(from: number, to: number) { range = { from, to }; return b; },
      then(onFul: any, onRej: any) {
        let filtered = rows as unknown as Array<Record<string, unknown>>;
        if (cfg.applyEqFilters && eqFilters.length > 0) {
          filtered = filtered.filter((r) =>
            eqFilters.every(([c, v]) => r[c] === v),
          );
        }
        const w = range ?? { from: 0, to: filtered.length - 1 };
        const slice = filtered.slice(w.from, w.to + 1);
        return Promise.resolve({ data: slice, error: null }).then(onFul, onRej);
      },
    };
    return b;
  }

  const supabase = {
    from(table: string) {
      if (table === 'combiner_book') return pagedBuilder(live);
      if (table === 'combiner_book_shadow') return pagedBuilder(shadow);
      if (table === 'combiner_forward_returns') {
        return {
          ...pagedBuilder(existing, { applyEqFilters: true }),
          upsert(payload: any[], options: { onConflict: string }) {
            calls.upsertChunks.push({ payload, onConflict: options.onConflict });
            if (opts.upsertErr) return Promise.resolve({ error: opts.upsertErr });
            // Mutate existing so a follow-up read sees these as present.
            // Carry `price_source_status` through so the anti-join filter
            // (`.eq('price_source_status','success')`) sees the right shape
            // after a retry overwrite flips a fetch_error row → success.
            for (const r of payload) {
              existing.push({
                source_table: r.source_table,
                variant: r.variant,
                seed_as_of_date: r.seed_as_of_date,
                ticker: r.ticker,
                horizon_td: r.horizon_td,
                price_source_status: r.price_source_status,
              });
            }
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { supabase, calls };
}

function makeBars(startDom: number, n: number, base = 100): Bar[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: `2026-06-${String(startDom + i).padStart(2, '0')}`,
    close: base + i,
  }));
}

function makePriceHistory(
  bundles: Map<string, Bar[] | null>,
  throwTickers: Set<string> = new Set(),
) {
  const fetched: string[] = [];
  return {
    fetched,
    port: {
      async fetchPriceHistory(ticker: string): Promise<Bar[] | null> {
        fetched.push(ticker);
        if (throwTickers.has(ticker)) throw new Error('synthetic polygon failure');
        return bundles.get(ticker) ?? [];
      },
    },
  };
}

Deno.test('(forch-1) anti-join: existing FR rows are not re-written', async () => {
  const liveRows: LiveBookRow[] = [
    { as_of_date: '2026-06-01', ticker: 'AAPL', side: 'long', score: 0.9 },
  ];
  // Already accrued T+1 for AAPL/live — only T+5 + T+20 should remain after anti-join.
  const existingFR: FRKey[] = [
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'AAPL', horizon_td: 1, price_source_status: 'success' },
  ];
  const bundles = new Map<string, Bar[]>([['AAPL', makeBars(1, 25, 100)]]);
  const { port } = makePriceHistory(bundles);
  const { supabase, calls } = makeSupabase({ liveRows, existingFR });

  const res = await createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: port,
  }).run(new Date('2026-07-15T00:00:00Z'));

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  // 1 ticker × 4 horizons (MIG-115 added T+10) = 4 candidates; 1 already in FR; survivors = 3.
  assertEquals(res.tuples_considered, 4);
  assertEquals(res.tuples_after_anti_join, 3);
  assertEquals(res.rows_written, 3);
  // ONLY T+5, T+10, T+20 rows in payload.
  const horizons = calls.upsertChunks
    .flatMap((c) => c.payload.map((p) => p.horizon_td))
    .sort((a, b) => a - b);
  assertEquals(horizons, [5, 10, 20]);
});

Deno.test('(forch-2) dedup: one fetch per distinct ticker across books × variants × horizons', async () => {
  const liveRows: LiveBookRow[] = [
    { as_of_date: '2026-06-01', ticker: 'AAPL', side: 'long', score: 0.9 },
  ];
  const shadowRows: ShadowBookRow[] = [
    { as_of_date: '2026-06-01', variant: 'no_gate_k3', ticker: 'AAPL', side: 'long', score: 0.95 },
    { as_of_date: '2026-06-01', variant: 'no_gate_k5', ticker: 'AAPL', side: 'long', score: 0.97 },
  ];
  const bundles = new Map<string, Bar[]>([['AAPL', makeBars(1, 25, 100)]]);
  const ph = makePriceHistory(bundles);
  const { supabase } = makeSupabase({ liveRows, shadowRows });

  await createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: ph.port,
  }).run(new Date('2026-07-15T00:00:00Z'));

  assertEquals(ph.fetched, ['AAPL']);
});

Deno.test('(forch-3) partial-fail isolation: throwing ticker → fetch_error; others still write success', async () => {
  const liveRows: LiveBookRow[] = [
    { as_of_date: '2026-06-01', ticker: 'AAPL', side: 'long', score: 0.9 },
    { as_of_date: '2026-06-01', ticker: 'MSFT', side: 'short', score: -0.9 },
  ];
  const bundles = new Map<string, Bar[]>([
    ['AAPL', makeBars(1, 25, 100)],
    ['MSFT', makeBars(1, 25, 200)],
  ]);
  const ph = makePriceHistory(bundles, new Set(['AAPL']));
  const { supabase, calls } = makeSupabase({ liveRows });

  const res = await createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: ph.port,
  }).run(new Date('2026-07-15T00:00:00Z'));

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  assertEquals(res.rows_written, 8); // 2 tickers × 4 horizons (MIG-115 added T+10)
  const payload = calls.upsertChunks.flatMap((c) => c.payload);
  const aapl = payload.filter((p) => p.ticker === 'AAPL');
  const msft = payload.filter((p) => p.ticker === 'MSFT');
  assertEquals(aapl.length, 4);
  assertEquals(msft.length, 4);
  for (const r of aapl) {
    assertEquals(r.price_source_status, 'fetch_error');
    assertEquals(r.raw_return, null);
    assertEquals(r.side_signed_return, null);
  }
  for (const r of msft) {
    assertEquals(r.price_source_status, 'success');
    assert(r.raw_return !== null);
  }
});

Deno.test('(forch-4) idempotency: second run writes zero new rows', async () => {
  const liveRows: LiveBookRow[] = [
    { as_of_date: '2026-06-01', ticker: 'AAPL', side: 'long', score: 0.9 },
  ];
  const bundles = new Map<string, Bar[]>([['AAPL', makeBars(1, 25, 100)]]);
  const ph = makePriceHistory(bundles);
  const { supabase } = makeSupabase({ liveRows });
  const orch = createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: ph.port,
  });
  const r1 = await orch.run(new Date('2026-07-15T00:00:00Z'));
  const r2 = await orch.run(new Date('2026-07-15T00:00:00Z'));
  assertEquals(r1.outcome, 'completed');
  assertEquals(r2.outcome, 'completed');
  if (r1.outcome !== 'completed' || r2.outcome !== 'completed') return;
  assertEquals(r1.rows_written, 4); // 1 ticker × 4 horizons (MIG-115 added T+10)
  assertEquals(r2.rows_written, 0);
  assertEquals(r2.tuples_after_anti_join, 0);
});

Deno.test('(forch-5) maturation floor: immature tuples excluded before fetch', async () => {
  // run = seed + 3 calendar days. T+1, T+5, T+20 floors are 1/5/20.
  // Only T+1 has matured; T+5 and T+20 must be excluded BEFORE fetch.
  const liveRows: LiveBookRow[] = [
    { as_of_date: '2026-07-12', ticker: 'AAPL', side: 'long', score: 0.9 },
  ];
  const bundles = new Map<string, Bar[]>([['AAPL', makeBars(12, 5, 100)]]);
  const ph = makePriceHistory(bundles);
  const { supabase, calls } = makeSupabase({ liveRows });

  const res = await createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: ph.port,
  }).run(new Date('2026-07-15T00:00:00Z'));

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  // Floor: run-seed=3 days; only H=1 passes.
  assertEquals(res.tuples_considered, 1);
  const payload = calls.upsertChunks.flatMap((c) => c.payload);
  assertEquals(payload.length, 1);
  assertEquals(payload[0].horizon_td, 1);
});

Deno.test('(forch-6) maturation-retry contract: success rows anti-joined; fetch_error rows re-attempted and overwritten when bars catch up', async () => {
  // Two seeds, both T+1:
  //   - MSFT: prior `success` row — MUST be anti-joined / NOT re-fetched.
  //   - AAPL: prior `fetch_error` row (typed-absence from an earlier cron
  //           run at the maturation-floor boundary, when the horizon bar
  //           had not yet settled on Polygon) — MUST NOT be anti-joined,
  //           MUST be re-attempted, and with bars now including the D+1
  //           bar the run MUST write a `success` row that overwrites the
  //           prior typed-absence row (PK is identical; onConflict UPSERT).
  //
  // This closes the systemic return-loss the 3.M-iv corrective addresses:
  // without `.eq('price_source_status','success')` on the anti-join, the
  // AAPL fetch_error row would be treated as terminal and the matured T+1
  // return would be permanently lost.
  const liveRows: LiveBookRow[] = [
    { as_of_date: '2026-06-01', ticker: 'AAPL', side: 'long', score: 0.9 },
    { as_of_date: '2026-06-01', ticker: 'MSFT', side: 'long', score: 0.8 },
  ];
  const existingFR: FRKey[] = [
    // Prior cron-run typed-absence — eligible for retry under the new contract.
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'AAPL', horizon_td: 1, price_source_status: 'fetch_error' },
    // Already-realized return — terminal under the new contract.
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'MSFT', horizon_td: 1, price_source_status: 'success' },
    // Pre-existing terminal coverage for the T+5/T+20 horizons of both
    // tickers so this case isolates the T+1 retry behavior cleanly.
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'AAPL', horizon_td: 5, price_source_status: 'success' },
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'AAPL', horizon_td: 10, price_source_status: 'success' },
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'AAPL', horizon_td: 20, price_source_status: 'success' },
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'MSFT', horizon_td: 5, price_source_status: 'success' },
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'MSFT', horizon_td: 10, price_source_status: 'success' },
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'MSFT', horizon_td: 20, price_source_status: 'success' },
  ];
  // Bars now include D+1 → AAPL's T+1 horizon bar is available; retry succeeds.
  const bundles = new Map<string, Bar[]>([
    ['AAPL', makeBars(1, 25, 100)],
    ['MSFT', makeBars(1, 25, 200)],
  ]);
  const ph = makePriceHistory(bundles);
  const { supabase, calls } = makeSupabase({ liveRows, existingFR });

  const res = await createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: ph.port,
  }).run(new Date('2026-07-15T00:00:00Z'));

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;

  // 2 tickers × 4 horizons (MIG-115 added T+10) = 8 candidates; 7 already-success
  // (including the two T+10 fixtures above) → anti-joined; only AAPL T+1
  // (the fetch_error row) survives.
  assertEquals(res.tuples_considered, 8);
  assertEquals(res.tuples_after_anti_join, 1);
  assertEquals(res.rows_written, 1);

  // MSFT was never fetched (its sole survivor candidate was anti-joined out
  // before dedup-by-ticker). AAPL WAS fetched (the retry path).
  assertEquals(ph.fetched, ['AAPL']);

  const payload = calls.upsertChunks.flatMap((c) => c.payload);
  assertEquals(payload.length, 1);
  const overwrite = payload[0];
  assertEquals(overwrite.ticker, 'AAPL');
  assertEquals(overwrite.horizon_td, 1);
  assertEquals(overwrite.source_table, 'combiner_book');
  assertEquals(overwrite.variant, LIVE_VARIANT_LABEL);
  assertEquals(overwrite.seed_as_of_date, '2026-06-01');
  assertEquals(overwrite.price_source_status, 'success');
  assert(overwrite.raw_return !== null);
  assert(overwrite.side_signed_return !== null);

  // PK-identical to the prior fetch_error row → onConflict UPSERT overwrites
  // it in place. Confirm the conflict target includes every PK column the
  // typed-absence row was written under.
  assertEquals(
    calls.upsertChunks[0].onConflict,
    'operator_id,source_table,variant,seed_as_of_date,ticker,horizon_td',
  );
});