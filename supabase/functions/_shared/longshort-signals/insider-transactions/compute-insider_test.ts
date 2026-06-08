// @ts-nocheck — Deno test file.
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyRoleWeight,
  computeInsiderSignal,
  filterQualifyingTransactions,
  ROLE_TIER_SOURCE,
} from './compute-insider.ts';
import type { Form4Row } from '../shared/polygon-form4-fetcher.ts';

const AS_OF = new Date('2026-06-08T00:00:00Z');
const ONE_BILLION = 1_000_000_000;

function row(over: Partial<Form4Row> = {}): Form4Row {
  return {
    record_type: 'transaction',
    transaction_code: 'P',
    aff_10b5_one: false,
    transaction_acquired_disposed: 'A',
    transaction_shares: 1000,
    transaction_price_per_share: 100,
    transaction_date: '2026-06-08', // age=0 → decay=1
    is_officer: true,
    officer_title: 'Chief Executive Officer',
    ...over,
  };
}

// ── classifyRoleWeight ───────────────────────────────────────────────────

Deno.test('classifier: CEO → 1.0 (spec-named)', () => {
  assertEquals(classifyRoleWeight(row({ officer_title: 'Chief Executive Officer' })), 1.0);
  assertEquals(classifyRoleWeight(row({ officer_title: 'CEO' })), 1.0);
});

Deno.test('classifier: CFO → 1.0 (spec-named)', () => {
  assertEquals(classifyRoleWeight(row({ officer_title: 'Chief Financial Officer' })), 1.0);
  assertEquals(classifyRoleWeight(row({ officer_title: 'CFO' })), 1.0);
});

Deno.test('classifier: compound "CEO AND PRESIDENT" → 1.0 (live-probe fixture)', () => {
  // The 2026-06-08 live probe of DELL returned exactly this title shape.
  // Word-boundary regex must catch CEO inside the compound title; an
  // exact-string equality check would have silently downgraded this to
  // 0.7 and quietly lost a spec-1.0 row.
  assertEquals(classifyRoleWeight(row({ officer_title: 'CEO AND PRESIDENT' })), 1.0);
});

Deno.test('classifier: President alone → 1.0 (grouped with C-suite per tier-1 regex)', () => {
  assertEquals(classifyRoleWeight(row({ officer_title: 'President' })), 1.0);
});

Deno.test('classifier: COO/CTO/EVP/SVP → 0.7 (NEO proxy tier)', () => {
  assertEquals(classifyRoleWeight(row({ officer_title: 'Chief Operating Officer' })), 0.7);
  assertEquals(classifyRoleWeight(row({ officer_title: 'Chief Technology Officer' })), 0.7);
  assertEquals(classifyRoleWeight(row({ officer_title: 'EVP, Global Sales' })), 0.7);
  assertEquals(classifyRoleWeight(row({ officer_title: 'SVP and Treasurer' })), 0.7);
  assertEquals(classifyRoleWeight(row({ officer_title: 'Executive Vice President' })), 0.7);
});

Deno.test('classifier: officer with no title match → 0.4 (Section 16 generic)', () => {
  assertEquals(
    classifyRoleWeight(row({ officer_title: 'VP of Investor Relations', is_officer: true })),
    0.4,
  );
});

Deno.test('classifier: independent director (director, not officer) → 0.3', () => {
  assertEquals(
    classifyRoleWeight(row({
      officer_title: undefined,
      is_officer: false,
      is_director: true,
    })),
    0.3,
  );
});

Deno.test('classifier: pure 10%+ owner (no officer/director) → 0.5', () => {
  assertEquals(
    classifyRoleWeight(row({
      officer_title: undefined,
      is_officer: false,
      is_director: false,
      is_ten_percent_owner: true,
    })),
    0.5,
  );
});

Deno.test('classifier: officer-AND-10%-owner → 0.4 (officer wins over owner)', () => {
  assertEquals(
    classifyRoleWeight(row({
      officer_title: undefined,
      is_officer: true,
      is_ten_percent_owner: true,
    })),
    0.4,
  );
});

Deno.test('classifier: no flags + no title → null (drop the row)', () => {
  assertEquals(
    classifyRoleWeight({ record_type: 'transaction', not_subject_to_section_16: true }),
    null,
  );
});

// ── filterQualifyingTransactions ─────────────────────────────────────────

Deno.test('filter: drops record_type=holding rows (first gate)', () => {
  const out = filterQualifyingTransactions([
    { record_type: 'holding' },
    row({ transaction_code: 'P' }),
  ]);
  assertEquals(out.length, 1);
});

Deno.test('filter: keeps ALL P (purchases) regardless of 10b5-1 flag', () => {
  const out = filterQualifyingTransactions([
    row({ transaction_code: 'P', aff_10b5_one: false }),
    row({ transaction_code: 'P', aff_10b5_one: true }),
  ]);
  assertEquals(out.length, 2);
});

Deno.test('filter: keeps S only when aff_10b5_one=false (load-bearing)', () => {
  const out = filterQualifyingTransactions([
    row({ transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: true, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: undefined, transaction_acquired_disposed: 'D' }),
  ]);
  // Only the explicit aff_10b5_one=false S survives. Missing flag is
  // conservatively EXCLUDED — we cannot prove discretionary.
  assertEquals(out.length, 1);
  assertEquals(out[0].aff_10b5_one, false);
});

Deno.test('filter: drops M / C / A / G codes (option exercises, grants, gifts)', () => {
  const out = filterQualifyingTransactions([
    row({ transaction_code: 'M' }),
    row({ transaction_code: 'C' }),
    row({ transaction_code: 'A' }),
    row({ transaction_code: 'G' }),
  ]);
  assertEquals(out.length, 0);
});

// ── computeInsiderSignal ─────────────────────────────────────────────────

Deno.test('compute: pure-buy ticker → POSITIVE raw_signal (sign load-bearing)', () => {
  const rows = [
    row({ transaction_code: 'P', transaction_acquired_disposed: 'A', transaction_shares: 1000, transaction_price_per_share: 100 }),
  ];
  const res = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assert(res);
  assert(res!.raw_signal > 0, `expected positive, got ${res!.raw_signal}`);
  assertEquals(res!.role_tier_source, ROLE_TIER_SOURCE);
});

Deno.test('compute: pure-discretionary-sale ticker → NEGATIVE raw_signal', () => {
  const rows = [
    row({
      transaction_code: 'S',
      aff_10b5_one: false,
      transaction_acquired_disposed: 'D',
      transaction_shares: 1000,
      transaction_price_per_share: 100,
    }),
  ];
  const res = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assert(res);
  assert(res!.raw_signal < 0, `expected negative, got ${res!.raw_signal}`);
});

Deno.test('compute: 10b5-1 sale EXCLUDED (would-be negative is suppressed)', () => {
  const rows = [
    row({
      transaction_code: 'S',
      aff_10b5_one: true,
      transaction_acquired_disposed: 'D',
      transaction_shares: 1000,
      transaction_price_per_share: 100,
    }),
  ];
  const res = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assertEquals(res, null, 'all rows filtered out → null (no qualifying)');
});

Deno.test('compute: 14-day half-life decay (age=14 → half weight)', () => {
  const rowsToday = [
    row({ transaction_date: '2026-06-08', transaction_shares: 1000, transaction_price_per_share: 100 }),
  ];
  const rows14d = [
    row({ transaction_date: '2026-05-25', transaction_shares: 1000, transaction_price_per_share: 100 }),
  ];
  const resToday = computeInsiderSignal(rowsToday, AS_OF, ONE_BILLION);
  const res14d = computeInsiderSignal(rows14d, AS_OF, ONE_BILLION);
  assert(resToday && res14d);
  // Half-life property: 14-day-old contribution is ~0.5x same-day contribution.
  const ratio = res14d!.raw_signal / resToday!.raw_signal;
  assertAlmostEquals(ratio, 0.5, 0.01);
});

Deno.test('compute: role weight applied (CEO contribution > generic-officer contribution)', () => {
  const ceo = computeInsiderSignal(
    [row({ officer_title: 'CEO', transaction_shares: 1000, transaction_price_per_share: 100 })],
    AS_OF,
    ONE_BILLION,
  );
  const generic = computeInsiderSignal(
    [row({ officer_title: 'VP of IR', transaction_shares: 1000, transaction_price_per_share: 100 })],
    AS_OF,
    ONE_BILLION,
  );
  assert(ceo && generic);
  // CEO weight 1.0 vs generic-officer 0.4 → ratio = 2.5.
  assertAlmostEquals(ceo!.raw_signal / generic!.raw_signal, 2.5, 0.001);
});

Deno.test('compute: divides by market_cap (smaller cap → larger signal magnitude)', () => {
  const rows = [row({ transaction_shares: 1000, transaction_price_per_share: 100 })];
  const big = computeInsiderSignal(rows, AS_OF, 10 * ONE_BILLION);
  const small = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assert(big && small);
  assertAlmostEquals(small!.raw_signal / big!.raw_signal, 10, 0.0001);
});

Deno.test('compute: empty rows → null (no qualifying)', () => {
  assertEquals(computeInsiderSignal([], AS_OF, ONE_BILLION), null);
});

Deno.test('compute: only holdings → null', () => {
  assertEquals(
    computeInsiderSignal([{ record_type: 'holding' }, { record_type: 'holding' }], AS_OF, ONE_BILLION),
    null,
  );
});

Deno.test('compute: market_cap=0 → null (divide-by-zero defensive guard)', () => {
  const rows = [row()];
  assertEquals(computeInsiderSignal(rows, AS_OF, 0), null);
  assertEquals(computeInsiderSignal(rows, AS_OF, -1), null);
  assertEquals(computeInsiderSignal(rows, AS_OF, NaN), null);
});

Deno.test('compute: future-dated row clamped to age=0 (decay never > 1)', () => {
  // Defensive: a future transaction_date would otherwise produce
  // decay = exp(+age/14) > 1 and silently inflate the contribution.
  const past = computeInsiderSignal(
    [row({ transaction_date: '2026-06-08' })],
    AS_OF,
    ONE_BILLION,
  );
  const future = computeInsiderSignal(
    [row({ transaction_date: '2026-07-01' })],
    AS_OF,
    ONE_BILLION,
  );
  assert(past && future);
  // Same magnitude — future clamped to age=0 → decay=1, identical to today.
  assertAlmostEquals(future!.raw_signal, past!.raw_signal, 1e-12);
});

Deno.test('compute: role_tier_source persisted as "title_heuristic" (DEC-044 visibility)', () => {
  const res = computeInsiderSignal([row()], AS_OF, ONE_BILLION);
  assertEquals(res!.role_tier_source, 'title_heuristic');
});

Deno.test('compute: as_of is replay-deterministic (same inputs → same output)', () => {
  const rows = [
    row({ transaction_date: '2026-05-01', transaction_shares: 500, transaction_price_per_share: 80 }),
    row({ transaction_date: '2026-04-15', transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D', transaction_shares: 300, transaction_price_per_share: 90 }),
  ];
  const a = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  const b = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assertEquals(a, b);
});