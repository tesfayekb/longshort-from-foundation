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
        if (cfg.applyEqFilters) eqFilters.push([col, val]);
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
    { source_table: 'combiner_book', variant: LIVE_VARIANT_LABEL, seed_as_of_date: '2026-06-01', ticker: 'AAPL', horizon_td: 1 },
  ];
  const bundles = new Map<string, Bar[]>([['AAPL', makeBars(1, 25, 100)]]);
  const { port } = makePriceHistory(bundles);
  const { supabase, calls } = makeSupabase({ liveRows, existingFR });

  const res = await createForwardReturnOrchestrator({
    supabase, operator_id: OPERATOR_ID, priceHistory: port,
  }).run(new Date('2026-07-15T00:00:00Z'));

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  // 1 ticker × 3 horizons = 3 candidates; 1 already in FR; survivors = 2.
  assertEquals(res.tuples_considered, 3);
  assertEquals(res.tuples_after_anti_join, 2);
  assertEquals(res.rows_written, 2);
  // ONLY T+5 and T+20 rows in payload.
  const horizons = calls.upsertChunks
    .flatMap((c) => c.payload.map((p) => p.horizon_td))
    .sort((a, b) => a - b);
  assertEquals(horizons, [5, 20]);
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
  assertEquals(res.rows_written, 6); // 2 tickers × 3 horizons
  const payload = calls.upsertChunks.flatMap((c) => c.payload);
  const aapl = payload.filter((p) => p.ticker === 'AAPL');
  const msft = payload.filter((p) => p.ticker === 'MSFT');
  assertEquals(aapl.length, 3);
  assertEquals(msft.length, 3);
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
  assertEquals(r1.rows_written, 3);
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