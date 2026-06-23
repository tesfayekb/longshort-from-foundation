// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Tests for the FP-052 3.0b-ii assembly orchestrator.
 *
 * Mirrors the momentum-orchestrator test pattern: in-memory mock
 * SupabaseClient, no live DB, no `createClient`, no `service_role`.
 * Pure structural assertions on:
 *   (a) universe floor query carries the `<= as_of` filter (DIVERGENCE);
 *   (b) signal load is EXACT as_of, no window;
 *   (c) upsert payload shape + chunking + ON CONFLICT keys;
 *   (d) error-path outcome shapes (no universe / persistence failure);
 *   (e) computed_at derives from as_of (no wall-clock).
 */
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createFeatureAssemblyOrchestrator,
} from './feature-assembler-orchestrator.ts';
import {
  EXCLUDED_REASON,
  SIGNAL_IDS_ALL,
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
} from './signal-catalog.ts';
import {
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
} from '../longshort-signals/market-regime/compute-regime.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-16T20:00:00Z');
const AS_OF_DATE = '2026-06-16';
const FLOOR_DATE = '2026-06-05';

type Filter = { op: string; col: string; val: unknown };
type RangeWindow = { from: number; to: number };

/**
 * Programmable mock that records every chained-builder call against
 * `universe_membership`, `signal_observations`, and
 * `combiner_feature_vectors`. Returns three query traces for assertions.
 */
function makeSupabase(opts: {
  universeTickers?: string[];
  floorDate?: string | null;
  signalRows?: Array<{
    ticker: string;
    signal_id: string;
    value: number | null;
    is_present: boolean;
    gics_sector: string | null;
  }>;
  /**
   * Regime rows (FP-052.2 §(e)). Default: the 2 expected rows present
   * for happy-path tests. Pass `[]` to exercise the fail-loud path.
   */
  regimeRows?: Array<{ signal_id: string; value: number | null; is_present: boolean }>;
  floorErr?: { message: string } | null;
  universeErr?: { message: string } | null;
  signalErr?: { message: string } | null;
  regimeErr?: { message: string } | null;
  upsertErr?: { message: string } | null;
}) {
  const calls = {
    universeFloorFilters: [] as Filter[],
    universeFloorSelect: '' as string,
    universeFloorOrder: [] as Array<{ col: string; ascending: boolean }>,
    universeFloorLimit: 0,
    universeRowsFilters: [] as Filter[],
    universeRowsSelect: '' as string,
    universeRowsRanges: [] as RangeWindow[],
    regimeFilters: [] as Filter[],
    regimeSelect: '' as string,
    signalFilters: [] as Filter[],
    signalSelect: '' as string,
    signalRanges: [] as RangeWindow[],
    upsertCalls: [] as Array<{ payload: unknown[]; onConflict: string }>,
  };
  // Distinguish "caller passed null → simulate no snapshot" from "caller omitted → default FLOOR_DATE".
  const floorDate = 'floorDate' in opts ? opts.floorDate : FLOOR_DATE;
  const tickers = opts.universeTickers ?? ['AAPL', 'MSFT'];
  const signalRows = opts.signalRows ?? [];
  const regimeRows = opts.regimeRows ?? [
    { signal_id: MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID, value: 0.05, is_present: true },
    { signal_id: MARKET_REALIZED_VOL_6M_SIGNAL_ID, value: 0.18, is_present: true },
  ];

  function umBuilder() {
    const filters: Filter[] = [];
    let selectCols = '';
    const order: Array<{ col: string; ascending: boolean }> = [];
    let range: RangeWindow | null = null;
    const builder: Record<string, unknown> = {
      select(cols: string) { selectCols = cols; return builder; },
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return builder; },
      lte(col: string, val: unknown) { filters.push({ op: 'lte', col, val }); return builder; },
      order(col: string, o: { ascending: boolean }) { order.push({ col, ascending: o.ascending }); return builder; },
      range(from: number, to: number) { range = { from, to }; return builder; },
      limit(n: number) {
        calls.universeFloorFilters = filters;
        calls.universeFloorSelect = selectCols;
        calls.universeFloorOrder = order;
        calls.universeFloorLimit = n;
        if (opts.floorErr) return Promise.resolve({ data: null, error: opts.floorErr });
        return Promise.resolve({
          data: floorDate ? [{ as_of_date: floorDate }] : [],
          error: null,
        });
      },
      then(onFul: unknown, onRej: unknown) {
        // Rows-mode (no `.limit()` call) — resolve as universe rows.
        // Now paginated via `.range(from, to)` — slice tickers per window.
        calls.universeRowsFilters = filters;
        calls.universeRowsSelect = selectCols;
        if (opts.universeErr) {
          return Promise.resolve({ data: null, error: opts.universeErr }).then(onFul, onRej);
        }
        const window = range ?? { from: 0, to: tickers.length - 1 };
        calls.universeRowsRanges.push(window);
        const slice = tickers.slice(window.from, window.to + 1);
        return Promise.resolve({
          data: slice.map((t) => ({ ticker: t })),
          error: null,
        }).then(onFul, onRej);
      },
    };
    return builder;
  }

  function sigBuilder() {
    const filters: Filter[] = [];
    let selectCols = '';
    let range: RangeWindow | null = null;
    const builder: Record<string, unknown> = {
      select(cols: string) { selectCols = cols; return builder; },
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return builder; },
      in(col: string, val: unknown) { filters.push({ op: 'in', col, val }); return builder; },
      range(from: number, to: number) { range = { from, to }; return builder; },
      then(onFul: unknown, onRej: unknown) {
        // Distinguish regime-projection (no .range, narrow select) from
        // per-name signal projection (paginated via .range).
        const isRegime = range === null && /signal_id/.test(selectCols) && !/ticker/.test(selectCols);
        if (isRegime) {
          calls.regimeFilters = filters;
          calls.regimeSelect = selectCols;
          if (opts.regimeErr) {
            return Promise.resolve({ data: null, error: opts.regimeErr }).then(onFul, onRej);
          }
          return Promise.resolve({ data: regimeRows, error: null }).then(onFul, onRej);
        }
        calls.signalFilters = filters;
        calls.signalSelect = selectCols;
        if (opts.signalErr) {
          return Promise.resolve({ data: null, error: opts.signalErr }).then(onFul, onRej);
        }
        const window = range ?? { from: 0, to: signalRows.length - 1 };
        calls.signalRanges.push(window);
        const slice = signalRows.slice(window.from, window.to + 1);
        return Promise.resolve({ data: slice, error: null }).then(onFul, onRej);
      },
    };
    return builder;
  }

  function cfvBuilder() {
    return {
      upsert(payload: unknown[], options: { onConflict: string }) {
        calls.upsertCalls.push({ payload, onConflict: options.onConflict });
        if (opts.upsertErr) return Promise.resolve({ error: opts.upsertErr });
        return Promise.resolve({ error: null });
      },
    };
  }

  const supabase = {
    from(table: string) {
      if (table === 'universe_membership') return umBuilder();
      if (table === 'signal_observations') return sigBuilder();
      if (table === 'combiner_feature_vectors') return cfvBuilder();
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

/** Build the full 9-signal present row-set for a ticker. */
function fullObsForTicker(ticker: string, sector: string | null = 'IT') {
  return SIGNAL_IDS_ALL.map((sid) => ({
    ticker,
    signal_id: sid,
    value: 0.5,
    is_present: true,
    gics_sector: sector,
  }));
}

Deno.test('(orch-1) universe floor query carries <= as_of filter (DIVERGENCE from momentum)', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
  });
  await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  // Floor query MUST include lte('as_of_date', '2026-06-16') + DESC + LIMIT 1.
  assertEquals(calls.universeFloorSelect, 'as_of_date');
  const lteFilters = calls.universeFloorFilters.filter((f) => f.op === 'lte');
  assertEquals(lteFilters.length, 1, 'floor query must carry exactly one lte filter');
  assertEquals(lteFilters[0].col, 'as_of_date');
  assertEquals(lteFilters[0].val, AS_OF_DATE);
  assertEquals(calls.universeFloorOrder, [{ col: 'as_of_date', ascending: false }]);
  assertEquals(calls.universeFloorLimit, 1);
});

Deno.test('(orch-2) signal load is EXACT as_of — no window, no per-signal lookback', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
  });
  await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  const eqAsOf = calls.signalFilters.filter((f) => f.op === 'eq' && f.col === 'as_of_date');
  assertEquals(eqAsOf.length, 1, 'signal query must use exact-eq on as_of_date');
  assertEquals(eqAsOf[0].val, AS_OF_DATE);
  // No range filters (lte/gte) on the signal query.
  const ranged = calls.signalFilters.filter((f) => f.op === 'lte' || f.op === 'gte');
  assertEquals(ranged.length, 0, 'no lookback window on signal query');
  // Catalog-9 in() filter present.
  const inFilter = calls.signalFilters.find((f) => f.op === 'in' && f.col === 'signal_id');
  assert(inFilter, 'signal query must filter signal_id IN catalog');
  assertEquals((inFilter.val as string[]).length, 9);
});

Deno.test('(orch-3) upsert ON CONFLICT keys + payload shape + computed_at == as_of', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
  });
  await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(calls.upsertCalls.length, 1);
  assertEquals(calls.upsertCalls[0].onConflict, 'operator_id,as_of_date,ticker');
  const row = (calls.upsertCalls[0].payload as Array<Record<string, unknown>>)[0];
  assertEquals(row.operator_id, OPERATOR_ID);
  assertEquals(row.as_of_date, AS_OF_DATE);
  assertEquals(row.ticker, 'AAPL');
  assertEquals(row.excluded_reason, null);
  assertEquals(row.coverage_count, 9);
  assertEquals(row.computed_at, AS_OF.toISOString());
  // 16 per-name + 2 regime broadcast = 18 keys (3.2-c additive; hash NOT flipped).
  assertEquals(Object.keys(row.features as Record<string, unknown>).length, 18);
  const features = row.features as Record<string, unknown>;
  assertEquals(features[MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID], 0.05);
  assertEquals(features[MARKET_REALIZED_VOL_6M_SIGNAL_ID], 0.18);
});

Deno.test('(orch-4) upsert chunking — 1200 universe rows splits into 3 chunks of 500/500/200', async () => {
  const N = 1200;
  const tickers = Array.from({ length: N }, (_, i) => `T${i.toString().padStart(4, '0')}`);
  // No signals — all excluded as missing_critical_signal_6 (deterministic).
  const { supabase, calls } = makeSupabase({ universeTickers: tickers, signalRows: [] });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(calls.upsertCalls.length, 3);
  assertEquals((calls.upsertCalls[0].payload as unknown[]).length, 500);
  assertEquals((calls.upsertCalls[1].payload as unknown[]).length, 500);
  assertEquals((calls.upsertCalls[2].payload as unknown[]).length, 200);
  assertEquals(res.outcome, 'completed');
  if (res.outcome === 'completed') {
    assertEquals(res.universe_size, N);
    assertEquals(res.persisted_count, N);
    assertEquals(res.included_count, 0);
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.MISSING_CRITICAL_6], N);
  }
});

Deno.test('(orch-5) empty floor → outcome=failed, no_universe_snapshot_on_or_before_as_of', async () => {
  const { supabase } = makeSupabase({ floorDate: null });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  if (res.outcome === 'failed') {
    assertEquals(res.failure_reason, 'no_universe_snapshot_on_or_before_as_of');
    assertEquals(res.universe_size, 0);
    assertEquals(res.persisted_count, 0);
  }
});

Deno.test('(orch-6) upsert error → outcome=failed with partial persisted_count', async () => {
  const tickers = Array.from({ length: 600 }, (_, i) => `T${i}`);
  const { supabase } = makeSupabase({
    universeTickers: tickers,
    signalRows: [],
    upsertErr: { message: 'simulated upsert failure' },
  });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  if (res.outcome === 'failed') {
    // First chunk fails immediately — no rows persisted, failure_reason cites offset 0.
    assertEquals(res.persisted_count, 0);
    assert(res.failure_reason.includes('chunk offset 0'));
    assert(res.failure_reason.includes('simulated upsert failure'));
  }
});

Deno.test('(orch-7) tally: bucket counts sum to universe_size', async () => {
  // 1 included + 1 missing-#6 + 1 missing-#7 + 1 below-coverage.
  const sigForIncluded = fullObsForTicker('AAA');
  const sigForMissing7 = SIGNAL_IDS_ALL.filter((s) => s !== SIGNAL_IDS_CRITICAL[1]).map((sid) => ({
    ticker: 'BBB', signal_id: sid, value: 0.1, is_present: true, gics_sector: 'IT',
  }));
  const sigForLowCov = [SIGNAL_IDS_CRITICAL[0], SIGNAL_IDS_CRITICAL[1], SIGNAL_IDS_NON_CRITICAL[0]].map((sid) => ({
    ticker: 'CCC', signal_id: sid, value: 0.1, is_present: true, gics_sector: 'IT',
  })); // only 3 of 9 = 1 non-critical < MIN_NON_CRITICAL_PRESENT(3) → below coverage
  const { supabase } = makeSupabase({
    universeTickers: ['AAA', 'BBB', 'CCC', 'DDD'], // DDD has no signals → missing #6
    signalRows: [...sigForIncluded, ...sigForMissing7, ...sigForLowCov],
  });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  if (res.outcome === 'completed') {
    assertEquals(res.universe_size, 4);
    assertEquals(res.persisted_count, 4);
    assertEquals(res.included_count, 1);
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.MISSING_CRITICAL_6], 1);
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.MISSING_CRITICAL_7], 1);
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.BELOW_COVERAGE], 1);
  }
});

/**
 * (orch-8) REGRESSION — PostgREST 1000-row default cap.
 *
 * Before the corrective, the orchestrator's unbounded `.select()` on
 * `signal_observations` was silently truncated to 1000 rows. At
 * as_of=2026-06-16 the expected payload was ~7,505 rows
 * (839 tickers × 9 signals); the truncated slice missed critical-#7
 * for every name and excluded 100% of the universe.
 *
 * Synthetic reproduction: 200 tickers × 9 signals = 1,800 signal rows
 * (> 1000-cap). Assert the orchestrator paginates and assembles ALL
 * rows, that the second page is a short read terminating the loop,
 * and that the included_count matches the universe size (not 0).
 */
Deno.test('(orch-8) regression — pagination defeats PostgREST 1000-row default cap', async () => {
  const N = 200;
  const tickers = Array.from({ length: N }, (_, i) => `T${i.toString().padStart(4, '0')}`);
  const signalRows = tickers.flatMap((t) =>
    SIGNAL_IDS_ALL.map((sid) => ({
      ticker: t,
      signal_id: sid,
      value: 0.5,
      is_present: true,
      gics_sector: 'IT',
    })),
  );
  // Sanity: payload exceeds the 1000-row cap that caused the bug.
  assertEquals(signalRows.length, 1800);
  assert(signalRows.length > 1000, 'fixture must exceed cap to exercise pagination');

  const { supabase, calls } = makeSupabase({ universeTickers: tickers, signalRows });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  // Pagination evidence: ≥2 signal pages, first page exactly 1000, final page short.
  assert(calls.signalRanges.length >= 2, `expected ≥2 signal pages, got ${calls.signalRanges.length}`);
  assertEquals(calls.signalRanges[0], { from: 0, to: 999 });
  assertEquals(calls.signalRanges[1], { from: 1000, to: 1999 });
  // 1800 total → page 0 returns 1000 (full), page 1 returns 800 (short → terminate).
  assertEquals(calls.signalRanges.length, 2, 'short read on page 1 must terminate the loop');

  // Outcome: NO mass-exclusion. Every ticker has all 9 signals present →
  // all included (the bug previously yielded included_count: 0).
  assertEquals(res.outcome, 'completed');
  if (res.outcome === 'completed') {
    assertEquals(res.universe_size, N);
    assertEquals(res.persisted_count, N);
    assertEquals(res.included_count, N, 'all tickers must be included after pagination fix');
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.MISSING_CRITICAL_6], 0);
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.MISSING_CRITICAL_7], 0);
    assertEquals(res.excluded_by_reason[EXCLUDED_REASON.BELOW_COVERAGE], 0);
  }
});

// ─────────────── 3.2-c — regime read + fail-loud propagation ───────────────

Deno.test('(orch-3.2-c-a) regime read: separate projection, NO universe_membership join, exact-as_of, 2 signal_ids', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
  });
  await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  // Regime select projects only signal_id/value/is_present (NO ticker — sentinel is dropped by universe filter).
  assertEquals(calls.regimeSelect, 'signal_id, value, is_present');
  // Exact-as_of eq filter, no lte/gte (no lookback, no universe join).
  const eqAsOf = calls.regimeFilters.filter((f) => f.op === 'eq' && f.col === 'as_of_date');
  assertEquals(eqAsOf.length, 1);
  assertEquals(eqAsOf[0].val, AS_OF_DATE);
  const ranged = calls.regimeFilters.filter((f) => f.op === 'lte' || f.op === 'gte');
  assertEquals(ranged.length, 0);
  // 2 regime signal_ids in IN()-filter.
  const inFilter = calls.regimeFilters.find((f) => f.op === 'in' && f.col === 'signal_id');
  assert(inFilter);
  assertEquals((inFilter!.val as string[]).length, 2);
  assertEquals(
    new Set(inFilter!.val as string[]),
    new Set([MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID, MARKET_REALIZED_VOL_6M_SIGNAL_ID]),
  );
});

Deno.test('(orch-3.2-c-b) regime broadcast: IDENTICAL values across every per-name row at same as_of', async () => {
  const tickers = ['AAA', 'BBB', 'CCC'];
  const signalRows = tickers.flatMap((t) => fullObsForTicker(t));
  const { supabase, calls } = makeSupabase({ universeTickers: tickers, signalRows });
  await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  const payload = calls.upsertCalls[0].payload as Array<{ features: Record<string, unknown> }>;
  assertEquals(payload.length, 3);
  for (const r of payload) {
    assertEquals(r.features[MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID], 0.05);
    assertEquals(r.features[MARKET_REALIZED_VOL_6M_SIGNAL_ID], 0.18);
  }
});

Deno.test('(orch-3.2-c-c) regime ABSENT → fail-loud: zero rows written, typed reason, no book', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
    regimeRows: [], // producer didn't fire OR failed-loud
  });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  if (res.outcome === 'failed') {
    assertEquals(res.failure_reason, 'regime_data_unavailable_at_assemble');
    assertEquals(res.persisted_count, 0);
    assertEquals(res.included_count, 0);
  }
  // NO upsert call at all — zero feature vectors written.
  assertEquals(calls.upsertCalls.length, 0);
});

Deno.test('(orch-3.2-c-d) regime partial (1 of 2 rows) → fail-loud', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
    regimeRows: [
      { signal_id: MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID, value: 0.05, is_present: true },
      // market_realized_vol_6m missing
    ],
  });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  if (res.outcome === 'failed') {
    assertEquals(res.failure_reason, 'regime_data_unavailable_at_assemble');
  }
  assertEquals(calls.upsertCalls.length, 0);
});

Deno.test('(orch-3.2-c-e) regime row is_present=false → fail-loud (null-fill would poison training)', async () => {
  const { supabase, calls } = makeSupabase({
    universeTickers: ['AAPL'],
    signalRows: fullObsForTicker('AAPL'),
    regimeRows: [
      { signal_id: MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID, value: null, is_present: false },
      { signal_id: MARKET_REALIZED_VOL_6M_SIGNAL_ID, value: 0.18, is_present: true },
    ],
  });
  const res = await createFeatureAssemblyOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  if (res.outcome === 'failed') {
    assertEquals(res.failure_reason, 'regime_data_unavailable_at_assemble');
  }
  assertEquals(calls.upsertCalls.length, 0);
});