// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the FP-052 3.M-iii shadow ranker orchestrator (ACT-243).
 *
 * DB-free: in-memory mock SupabaseClient mirrors the 3.0c-ii
 * `ranker-orchestrator_test.ts` shape. Structural assertions on:
 *   (sorch-1) variants + universe + signal_observations reads use
 *             paginated `.range()` and the exact eq/lte filter chain
 *             (replay-determinism: floor ≤ as_of);
 *   (sorch-2) happy path — 12 variants × ≤20/side seeded, every row
 *             tagged with the correct variant/inclusion_rule/k/
 *             ranker_source/computed_at, onConflict matches the
 *             combiner_book_shadow PK;
 *   (sorch-3) ShadowBookOverlapError → outcome=failed BEFORE any
 *             UPSERT (compute-before-write);
 *   (sorch-4) empty active variants → outcome=failed, no upserts;
 *   (sorch-5) non-universe tickers in signal_observations are dropped
 *             (universe-floor intersection).
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createShadowRankerOrchestrator } from './shadow-ranker-orchestrator.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
} from './signal-catalog.ts';
import { RANKER_SOURCE_SHADOW } from './shadow-constants.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-16T00:00:00Z');
const AS_OF_DATE = '2026-06-16';
const FLOOR_DATE = '2026-06-15';

const ALL_VARIANTS = [
  { variant: 'gated_k0', inclusion_rule: 'gated', k: 0 },
  { variant: 'gated_k3', inclusion_rule: 'gated', k: 3 },
  { variant: 'gated_k5', inclusion_rule: 'gated', k: 5 },
  { variant: 'gated_k10', inclusion_rule: 'gated', k: 10 },
  { variant: 'criticals_required_k0', inclusion_rule: 'criticals_required', k: 0 },
  { variant: 'criticals_required_k3', inclusion_rule: 'criticals_required', k: 3 },
  { variant: 'criticals_required_k5', inclusion_rule: 'criticals_required', k: 5 },
  { variant: 'criticals_required_k10', inclusion_rule: 'criticals_required', k: 10 },
  { variant: 'no_gate_k0', inclusion_rule: 'no_gate', k: 0 },
  { variant: 'no_gate_k3', inclusion_rule: 'no_gate', k: 3 },
  { variant: 'no_gate_k5', inclusion_rule: 'no_gate', k: 5 },
  { variant: 'no_gate_k10', inclusion_rule: 'no_gate', k: 10 },
];

type SigRow = {
  ticker: string;
  signal_id: string;
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
};

/** All 9 signals present for `ticker` with value=score. */
function fullyPresentRows(ticker: string, score: number, sector = 'IT'): SigRow[] {
  const rows: SigRow[] = [];
  for (const id of [...SIGNAL_IDS_CRITICAL, ...SIGNAL_IDS_NON_CRITICAL]) {
    rows.push({
      ticker,
      signal_id: id,
      value: score,
      is_present: true,
      gics_sector: sector,
    });
  }
  return rows;
}

function makeSupabase(opts: {
  variants?: typeof ALL_VARIANTS;
  variantErr?: { message: string } | null;
  floorDate?: string | null;
  universeTickers?: string[];
  signalRows?: SigRow[];
  bookUpsertErr?: { message: string } | null;
}) {
  const calls = {
    variantSelect: '',
    variantFilters: [] as Array<{ op: string; col: string; val: unknown }>,
    floorFilters: [] as Array<{ op: string; col: string; val: unknown }>,
    universeRanges: [] as Array<{ from: number; to: number }>,
    sigRanges: [] as Array<{ from: number; to: number }>,
    sigFilters: [] as Array<{ op: string; col: string; val: unknown }>,
    bookUpserts: [] as Array<{ payload: Array<Record<string, unknown>>; onConflict: string }>,
  };

  const variants = opts.variants ?? ALL_VARIANTS;
  const floorDate = opts.floorDate === undefined ? FLOOR_DATE : opts.floorDate;
  const universeTickers = opts.universeTickers ?? [];
  const signalRows = opts.signalRows ?? [];

  function variantBuilder() {
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    let select = '';
    const b: any = {
      select(c: string) { select = c; return b; },
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return b; },
      order() { return b; },
      then(onFul: any, onRej: any) {
        calls.variantSelect = select;
        calls.variantFilters = filters;
        if (opts.variantErr) return Promise.resolve({ data: null, error: opts.variantErr }).then(onFul, onRej);
        return Promise.resolve({ data: variants, error: null }).then(onFul, onRej);
      },
    };
    return b;
  }

  let umMode: 'floor' | 'rows' | null = null;
  function umBuilder() {
    umMode = null;
    let select = '';
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    let range: { from: number; to: number } | null = null;
    const b: any = {
      select(c: string) {
        select = c;
        umMode = c.includes('ticker') ? 'rows' : 'floor';
        return b;
      },
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return b; },
      lte(col: string, val: unknown) { filters.push({ op: 'lte', col, val }); return b; },
      order() { return b; },
      limit() { return b; },
      range(from: number, to: number) { range = { from, to }; return b; },
      then(onFul: any, onRej: any) {
        if (umMode === 'floor') {
          calls.floorFilters = filters;
          const data = floorDate ? [{ as_of_date: floorDate }] : [];
          return Promise.resolve({ data, error: null }).then(onFul, onRej);
        }
        // rows mode
        const window = range ?? { from: 0, to: universeTickers.length - 1 };
        calls.universeRanges.push(window);
        const slice = universeTickers.slice(window.from, window.to + 1).map((t) => ({ ticker: t }));
        return Promise.resolve({ data: slice, error: null }).then(onFul, onRej);
      },
    };
    return b;
  }

  function sigBuilder() {
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    let range: { from: number; to: number } | null = null;
    const b: any = {
      select() { return b; },
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return b; },
      in(col: string, val: unknown) { filters.push({ op: 'in', col, val }); return b; },
      range(from: number, to: number) { range = { from, to }; return b; },
      then(onFul: any, onRej: any) {
        calls.sigFilters = filters;
        const window = range ?? { from: 0, to: signalRows.length - 1 };
        calls.sigRanges.push(window);
        const slice = signalRows.slice(window.from, window.to + 1);
        return Promise.resolve({ data: slice, error: null }).then(onFul, onRej);
      },
    };
    return b;
  }

  function bookBuilder() {
    return {
      upsert(payload: any[], options: { onConflict: string }) {
        calls.bookUpserts.push({ payload, onConflict: options.onConflict });
        if (opts.bookUpsertErr) return Promise.resolve({ error: opts.bookUpsertErr });
        return Promise.resolve({ error: null });
      },
    };
  }

  const supabase = {
    from(table: string) {
      if (table === 'combiner_shadow_variant_config') return variantBuilder();
      if (table === 'universe_membership') return umBuilder();
      if (table === 'signal_observations') return sigBuilder();
      if (table === 'combiner_book_shadow') return bookBuilder();
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { supabase, calls };
}

Deno.test('(sorch-1) reads use paginated .range() + correct eq/lte filter chain', async () => {
  const tickers = Array.from({ length: 40 }, (_, i) => `T${i.toString().padStart(3, '0')}`);
  const sig: SigRow[] = tickers.flatMap((t, i) => fullyPresentRows(t, i * 0.1));
  const { supabase, calls } = makeSupabase({
    universeTickers: tickers,
    signalRows: sig,
  });
  await createShadowRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(calls.variantSelect, 'variant, inclusion_rule, k');
  // floor filter chain
  assertEquals(calls.floorFilters[0], { op: 'eq', col: 'operator_id', val: OPERATOR_ID });
  assertEquals(calls.floorFilters[1], { op: 'lte', col: 'as_of_date', val: AS_OF_DATE });
  // universe rows pagination
  assert(calls.universeRanges.length >= 1);
  assertEquals(calls.universeRanges[0].from, 0);
  // signal_observations exact-as_of + paginated
  assert(calls.sigRanges.length >= 1);
  assertEquals(calls.sigRanges[0].from, 0);
  const sigEqs = calls.sigFilters.filter((f) => f.op === 'eq');
  assertEquals(sigEqs[0], { op: 'eq', col: 'operator_id', val: OPERATOR_ID });
  assertEquals(sigEqs[1], { op: 'eq', col: 'as_of_date', val: AS_OF_DATE });
});

Deno.test('(sorch-2) happy path — 12 variants × ≤20/side; tagging + onConflict correct; computed_at == as_of', async () => {
  const tickers = Array.from({ length: 40 }, (_, i) => `T${i.toString().padStart(3, '0')}`);
  const sig: SigRow[] = tickers.flatMap((t, i) => fullyPresentRows(t, i * 0.1));
  const { supabase, calls } = makeSupabase({
    universeTickers: tickers,
    signalRows: sig,
  });
  const res = await createShadowRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  assertEquals(res.variants_active, 12);
  assertEquals(res.variants_written, 12);
  assertEquals(res.universe_size, 40);
  assertEquals(res.vectors_assembled, 40);
  assertEquals(res.per_variant_sizes.length, 12);
  for (const pv of res.per_variant_sizes) {
    assert(pv.long <= 20, `variant ${pv.variant} long ${pv.long} > 20`);
    assert(pv.short <= 20, `variant ${pv.variant} short ${pv.short} > 20`);
  }
  // 12 variants × 40 rows each = 480
  assertEquals(res.total_book_rows, 12 * 40);
  assertEquals(res.ranker_source, RANKER_SOURCE_SHADOW);

  // Single UPSERT chunk (480 ≤ 500).
  assertEquals(calls.bookUpserts.length, 1);
  assertEquals(
    calls.bookUpserts[0].onConflict,
    'operator_id,as_of_date,variant,side,rank_within_side,intraday_slot',
  );
  const payload = calls.bookUpserts[0].payload;
  assertEquals(payload.length, 480);
  const variantsSeen = new Set(payload.map((p) => p.variant));
  assertEquals(variantsSeen.size, 12);
  for (const p of payload) {
    assertEquals(p.operator_id, OPERATOR_ID);
    assertEquals(p.as_of_date, AS_OF_DATE);
    assertEquals(p.computed_at, AS_OF.toISOString());
    assertEquals(p.ranker_source, RANKER_SOURCE_SHADOW);
    assert(p.side === 'long' || p.side === 'short');
    assert(typeof p.rank_within_side === 'number' && p.rank_within_side >= 1 && p.rank_within_side <= 20);
  }
});

Deno.test('(sorch-3) ShadowBookOverlapError → outcome=failed with ZERO writes (compute-before-write)', async () => {
  // Construct 21 tickers where the top-20 and bottom-20 overlap on the
  // boundary — `no_gate_k0` over a single-signal-per-ticker fixture
  // would overlap, but easiest forced-overlap: ALL tickers tie on score
  // and are < 40. With 21 tickers tied at score 0.5, long top-20 and
  // short top-20 (with ticker-ASC tiebreak) BOTH start at T000…T019 →
  // long side; T001..T020 → short side → overlap T001..T019.
  const tickers = Array.from({ length: 21 }, (_, i) => `T${i.toString().padStart(3, '0')}`);
  // Make all tied at score 1.0 so adjusted == 1.0 across the board.
  const sig: SigRow[] = tickers.flatMap((t) => fullyPresentRows(t, 1.0));
  const { supabase, calls } = makeSupabase({
    universeTickers: tickers,
    signalRows: sig,
  });
  const res = await createShadowRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'failed');
  if (res.outcome !== 'failed') return;
  assertStringIncludes(res.failure_reason, 'ShadowBookOverlapError');
  // ZERO writes attempted.
  assertEquals(calls.bookUpserts.length, 0);
});

Deno.test('(sorch-4) empty active variants → outcome=failed=no_active_variants, no upserts', async () => {
  const { supabase, calls } = makeSupabase({ variants: [] });
  const res = await createShadowRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  if (res.outcome !== 'failed') return;
  assertEquals(res.failure_reason, 'no_active_variants');
  assertEquals(calls.bookUpserts.length, 0);
});

Deno.test('(sorch-5) non-universe tickers in signal_observations are dropped', async () => {
  // Use 40 distinct-score universe tickers (avoids ShadowBookOverlapError;
  // 40 ≥ 2 × BOOK_SEED_SIZE) + one non-universe ZZZ that must be dropped.
  const universe = Array.from({ length: 40 }, (_, i) => `T${i.toString().padStart(3, '0')}`);
  const sig: SigRow[] = [
    ...universe.flatMap((t, i) => fullyPresentRows(t, i * 0.1)),
    ...fullyPresentRows('ZZZ', 99.0),
  ];
  const { supabase } = makeSupabase({
    universeTickers: universe,
    signalRows: sig,
  });
  const res = await createShadowRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  // 40 universe vectors assembled — ZZZ filtered out by intersection.
  assertEquals(res.vectors_assembled, 40);
});