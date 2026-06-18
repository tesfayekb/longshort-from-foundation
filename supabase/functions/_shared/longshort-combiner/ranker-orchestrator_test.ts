// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Tests for the FP-052 3.0c-ii ranker orchestrator.
 *
 * Mirrors the 3.0b-ii `feature-assembler-orchestrator_test.ts` pattern:
 * in-memory mock SupabaseClient, no live DB, no `createClient`, no
 * `service_role`. Structural assertions on:
 *   (a) read filters: eq(operator_id), eq(as_of_date), is(excluded_reason, null)
 *       — INCLUDED-only read contract;
 *   (b) compute-before-write ordering: BookOverlap / IncludedRow errors
 *       return `outcome:'failed'` with ZERO upserts attempted;
 *   (c) UPSERT shape for both `combiner_rankings` and `combiner_book`
 *       with correct onConflict + `computed_at == as_of`;
 *   (d) `combiner_model_registry` is NEVER touched;
 *   (e) empty-included → outcome=failed, failure_reason='no_included_vectors'.
 */
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createRankerOrchestrator } from './ranker-orchestrator.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalValueKey,
  nonCriticalIsPresentKey,
} from './signal-catalog.ts';
import { RANKER_SOURCE_FALLBACK } from './ranker-constants.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-16T00:00:00Z');
const AS_OF_DATE = '2026-06-16';

type Filter = { op: string; col: string; val: unknown };
type RangeWindow = { from: number; to: number };

/** Build a fully-included feature-vector row (criticals bare + all 7 non-criticals present). */
function fullIncludedRow(ticker: string, score: number, sector: string | null = 'IT') {
  const features: Record<string, number | null> = {};
  for (const cid of SIGNAL_IDS_CRITICAL) features[cid] = score;
  for (const ncid of SIGNAL_IDS_NON_CRITICAL) {
    features[nonCriticalValueKey(ncid)] = score;
    features[nonCriticalIsPresentKey(ncid)] = 1;
  }
  return {
    ticker,
    features,
    gics_sector: sector,
    coverage_count: 9,
    excluded_reason: null as null,
  };
}

function makeSupabase(opts: {
  cfvRows?: ReturnType<typeof fullIncludedRow>[];
  cfvErr?: { message: string } | null;
  rankingsUpsertErr?: { message: string } | null;
  bookUpsertErr?: { message: string } | null;
}) {
  const calls = {
    cfvFilters: [] as Filter[],
    cfvSelect: '' as string,
    cfvRanges: [] as RangeWindow[],
    rankingsUpserts: [] as Array<{ payload: unknown[]; onConflict: string }>,
    bookUpserts: [] as Array<{ payload: unknown[]; onConflict: string }>,
    registryTouches: 0,
  };
  const cfvRows = opts.cfvRows ?? [];

  function cfvBuilder() {
    const filters: Filter[] = [];
    let selectCols = '';
    let range: RangeWindow | null = null;
    const builder: Record<string, unknown> = {
      select(cols: string) { selectCols = cols; return builder; },
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return builder; },
      is(col: string, val: unknown) { filters.push({ op: 'is', col, val }); return builder; },
      range(from: number, to: number) { range = { from, to }; return builder; },
      then(onFul: unknown, onRej: unknown) {
        calls.cfvFilters = filters;
        calls.cfvSelect = selectCols;
        if (opts.cfvErr) {
          return Promise.resolve({ data: null, error: opts.cfvErr }).then(onFul, onRej);
        }
        const window = range ?? { from: 0, to: cfvRows.length - 1 };
        calls.cfvRanges.push(window);
        const slice = cfvRows.slice(window.from, window.to + 1);
        return Promise.resolve({ data: slice, error: null }).then(onFul, onRej);
      },
    };
    return builder;
  }

  function rankingsBuilder() {
    return {
      upsert(payload: unknown[], options: { onConflict: string }) {
        calls.rankingsUpserts.push({ payload, onConflict: options.onConflict });
        if (opts.rankingsUpsertErr) return Promise.resolve({ error: opts.rankingsUpsertErr });
        return Promise.resolve({ error: null });
      },
    };
  }

  function bookBuilder() {
    return {
      upsert(payload: unknown[], options: { onConflict: string }) {
        calls.bookUpserts.push({ payload, onConflict: options.onConflict });
        if (opts.bookUpsertErr) return Promise.resolve({ error: opts.bookUpsertErr });
        return Promise.resolve({ error: null });
      },
    };
  }

  const supabase = {
    from(table: string) {
      if (table === 'combiner_feature_vectors') return cfvBuilder();
      if (table === 'combiner_rankings') return rankingsBuilder();
      if (table === 'combiner_book') return bookBuilder();
      if (table === 'combiner_model_registry') {
        calls.registryTouches++;
        throw new Error('orchestrator must NOT touch combiner_model_registry');
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

Deno.test('(rorch-1) read filters: eq(operator_id), eq(as_of_date), is(excluded_reason,null)', async () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    fullIncludedRow(`T${i.toString().padStart(3, '0')}`, i * 0.1),
  );
  const { supabase, calls } = makeSupabase({ cfvRows: rows });
  await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(calls.cfvSelect, 'ticker, features, gics_sector, coverage_count, excluded_reason');
  const eqs = calls.cfvFilters.filter((f) => f.op === 'eq');
  assertEquals(eqs.length, 2);
  assertEquals(eqs[0], { op: 'eq', col: 'operator_id', val: OPERATOR_ID });
  assertEquals(eqs[1], { op: 'eq', col: 'as_of_date', val: AS_OF_DATE });
  const isFilters = calls.cfvFilters.filter((f) => f.op === 'is');
  assertEquals(isFilters.length, 1);
  assertEquals(isFilters[0], { op: 'is', col: 'excluded_reason', val: null });
});

Deno.test('(rorch-2) happy path — 40 included rows → 40 rankings upserted, 20+20 book upserted, registry untouched', async () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    fullIncludedRow(`T${i.toString().padStart(3, '0')}`, i * 0.1),
  );
  const { supabase, calls } = makeSupabase({ cfvRows: rows });
  const res = await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'completed');
  if (res.outcome !== 'completed') return;
  assertEquals(res.vectors_read, 40);
  assertEquals(res.rankings_written, 40);
  assertEquals(res.book_size_long, 20);
  assertEquals(res.book_size_short, 20);
  assertEquals(res.ranker_source, RANKER_SOURCE_FALLBACK);

  // Rankings upsert
  assertEquals(calls.rankingsUpserts.length, 1);
  assertEquals(calls.rankingsUpserts[0].onConflict, 'operator_id,as_of_date,ticker');
  assertEquals((calls.rankingsUpserts[0].payload as unknown[]).length, 40);
  const r0 = (calls.rankingsUpserts[0].payload as Array<Record<string, unknown>>)[0];
  assertEquals(r0.operator_id, OPERATOR_ID);
  assertEquals(r0.as_of_date, AS_OF_DATE);
  assertEquals(r0.computed_at, AS_OF.toISOString());
  assertEquals(r0.ranker_source, RANKER_SOURCE_FALLBACK);

  // Book upsert
  assertEquals(calls.bookUpserts.length, 1);
  assertEquals(calls.bookUpserts[0].onConflict, 'operator_id,as_of_date,side,rank_within_side');
  const bookPayload = calls.bookUpserts[0].payload as Array<Record<string, unknown>>;
  assertEquals(bookPayload.length, 40);
  const sides = bookPayload.map((b) => b.side);
  assertEquals(sides.filter((s) => s === 'long').length, 20);
  assertEquals(sides.filter((s) => s === 'short').length, 20);
  for (const b of bookPayload) {
    assertEquals(b.operator_id, OPERATOR_ID);
    assertEquals(b.as_of_date, AS_OF_DATE);
    assertEquals(b.computed_at, AS_OF.toISOString());
    assertEquals(b.ranker_source, RANKER_SOURCE_FALLBACK);
  }

  // Registry untouched
  assertEquals(calls.registryTouches, 0);
});

Deno.test('(rorch-3) empty included → outcome=failed, failure_reason=no_included_vectors, no upserts', async () => {
  const { supabase, calls } = makeSupabase({ cfvRows: [] });
  const res = await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'failed');
  if (res.outcome !== 'failed') return;
  assertEquals(res.failure_reason, 'no_included_vectors');
  assertEquals(res.vectors_read, 0);
  assertEquals(res.rankings_written, 0);
  assertEquals(res.book_size_long, 0);
  assertEquals(res.book_size_short, 0);
  assertEquals(calls.rankingsUpserts.length, 0);
  assertEquals(calls.bookUpserts.length, 0);
});

Deno.test('(rorch-4) included-row invariant violation → outcome=failed BEFORE any write', async () => {
  // Build a row that violates §4.3.5: critical missing (null) but excluded_reason=null.
  const bad = fullIncludedRow('AAPL', 0.5);
  bad.features[SIGNAL_IDS_CRITICAL[0]] = null;
  const { supabase, calls } = makeSupabase({ cfvRows: [bad] });
  const res = await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'failed');
  if (res.outcome !== 'failed') return;
  assertStringIncludes(res.failure_reason, 'IncludedRowInvariantError');
  // ZERO writes attempted — compute-before-write contract.
  assertEquals(calls.rankingsUpserts.length, 0);
  assertEquals(calls.bookUpserts.length, 0);
});

Deno.test('(rorch-5) rankings upsert error → outcome=failed, book NEVER attempted', async () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    fullIncludedRow(`T${i.toString().padStart(3, '0')}`, i * 0.1),
  );
  const { supabase, calls } = makeSupabase({
    cfvRows: rows,
    rankingsUpsertErr: { message: 'simulated PG failure' },
  });
  const res = await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'failed');
  if (res.outcome !== 'failed') return;
  assertStringIncludes(res.failure_reason, 'combiner_rankings upsert failed at chunk offset 0');
  assertEquals(calls.rankingsUpserts.length, 1);
  assertEquals(calls.bookUpserts.length, 0);
});

Deno.test('(rorch-6) book upsert error → outcome=failed with rankings_written carried', async () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    fullIncludedRow(`T${i.toString().padStart(3, '0')}`, i * 0.1),
  );
  const { supabase, calls } = makeSupabase({
    cfvRows: rows,
    bookUpsertErr: { message: 'simulated PG failure' },
  });
  const res = await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);

  assertEquals(res.outcome, 'failed');
  if (res.outcome !== 'failed') return;
  assertStringIncludes(res.failure_reason, 'combiner_book upsert failed at chunk offset 0');
  assertEquals(res.rankings_written, 40);
  assertEquals(calls.rankingsUpserts.length, 1);
  assertEquals(calls.bookUpserts.length, 1);
});

Deno.test('(rorch-7) read uses pagination (.range called)', async () => {
  const rows = Array.from({ length: 40 }, (_, i) =>
    fullIncludedRow(`T${i.toString().padStart(3, '0')}`, i * 0.1),
  );
  const { supabase, calls } = makeSupabase({ cfvRows: rows });
  await createRankerOrchestrator({ supabase, operator_id: OPERATOR_ID }).run(AS_OF);
  assert(calls.cfvRanges.length >= 1, 'read must use .range() pagination');
  assertEquals(calls.cfvRanges[0].from, 0);
});