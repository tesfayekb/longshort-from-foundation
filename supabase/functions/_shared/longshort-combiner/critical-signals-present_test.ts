// @ts-nocheck — Deno test file
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DW-206 Fix B (ACT-434) — shared critical-signal presence helper.
 * Single source of truth for the tick's Gate-3 and the shadow-rank
 * path's Step 0. Tests: all-present → true; one-missing → false;
 * strict `.eq` on as_of_date (T8 replay-determinism) — a T-1 row
 * does NOT satisfy today; read error → throw.
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { criticalSignalsPresentForDate } from './critical-signals-present.ts';
import { SIGNAL_IDS_CRITICAL } from './signal-catalog.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF_DATE = '2026-07-01';

function makeSupabase(opts: {
  rows?: Array<{ signal_id: string; as_of_date?: string }>;
  err?: { message: string } | null;
}) {
  const calls = {
    filters: [] as Array<{ op: string; col: string; val: unknown }>,
  };
  const rows = opts.rows ?? [];
  const b: any = {
    select() { return b; },
    eq(col: string, val: unknown) { calls.filters.push({ op: 'eq', col, val }); return b; },
    in(col: string, val: unknown) { calls.filters.push({ op: 'in', col, val }); return b; },
    then(onFul: any, onRej: any) {
      if (opts.err) return Promise.resolve({ data: null, error: opts.err }).then(onFul, onRej);
      // Filter by the recorded as_of_date eq (T8 strictness assertion).
      const asOfEq = calls.filters.find((f) => f.op === 'eq' && f.col === 'as_of_date');
      const filtered = rows.filter((r) => (r.as_of_date ?? AS_OF_DATE) === asOfEq?.val);
      return Promise.resolve({ data: filtered.map((r) => ({ signal_id: r.signal_id })), error: null })
        .then(onFul, onRej);
    },
  };
  const supabase = { from() { return b; } };
  return { supabase, calls };
}

Deno.test('(csp-1) all critical signals present → true; filter chain includes strict .eq as_of_date + operator_id + .in signal_id', async () => {
  const rows = SIGNAL_IDS_CRITICAL.map((id) => ({ signal_id: id }));
  const { supabase, calls } = makeSupabase({ rows });
  const ok = await criticalSignalsPresentForDate(supabase as any, OPERATOR_ID, AS_OF_DATE);
  assertEquals(ok, true);
  const eqs = calls.filters.filter((f) => f.op === 'eq');
  assert(eqs.some((f) => f.col === 'operator_id' && f.val === OPERATOR_ID));
  assert(eqs.some((f) => f.col === 'as_of_date' && f.val === AS_OF_DATE));
  const ins = calls.filters.filter((f) => f.op === 'in');
  assertEquals(ins.length, 1);
  assertEquals(ins[0].col, 'signal_id');
});

Deno.test('(csp-2) missing ONE critical → false', async () => {
  const rows = SIGNAL_IDS_CRITICAL.slice(1).map((id) => ({ signal_id: id }));
  const { supabase } = makeSupabase({ rows });
  const ok = await criticalSignalsPresentForDate(supabase as any, OPERATOR_ID, AS_OF_DATE);
  assertEquals(ok, false);
});

Deno.test('(csp-3) T8 strictness — a T-1 row does NOT satisfy today', async () => {
  const rows = SIGNAL_IDS_CRITICAL.map((id) => ({ signal_id: id, as_of_date: '2026-06-30' }));
  const { supabase } = makeSupabase({ rows });
  const ok = await criticalSignalsPresentForDate(supabase as any, OPERATOR_ID, AS_OF_DATE);
  assertEquals(ok, false, 'yesterday-only rows must NOT count as present for today');
});

Deno.test('(csp-4) read error → throw', async () => {
  const { supabase } = makeSupabase({ err: { message: 'boom' } });
  await assertRejects(
    () => criticalSignalsPresentForDate(supabase as any, OPERATOR_ID, AS_OF_DATE),
    Error,
    'criticalSignalsPresentForDate failed: boom',
  );
});

Deno.test('(csp-5) empty result → false (no criticals at all)', async () => {
  const { supabase } = makeSupabase({ rows: [] });
  const ok = await criticalSignalsPresentForDate(supabase as any, OPERATOR_ID, AS_OF_DATE);
  assertEquals(ok, false);
});