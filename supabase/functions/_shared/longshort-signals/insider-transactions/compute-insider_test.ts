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
import type { Form4Row } from './form4-row-types.ts';

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

Deno.test('filter (DEC-073): keeps ALL P (purchases) regardless of 10b5-1 flag', () => {
  const out = filterQualifyingTransactions([
    row({ transaction_code: 'P', aff_10b5_one: false }),
    row({ transaction_code: 'P', aff_10b5_one: true }),
    row({ transaction_code: 'P', aff_10b5_one: undefined }),
  ]);
  assertEquals(out.length, 3);
});

Deno.test('filter (DEC-073 inverse pin): S ALWAYS drops, irrespective of aff_10b5_one', () => {
  // Inverse of the pre-DEC-073 "keeps S only when aff_10b5_one=false"
  // load-bearing pin: buys-only means EVERY S-row drops at this seam,
  // regardless of the 10b5-1 flag value (false / true / missing). The
  // aff_10b5_one predicate is moot in compute (the field stays on
  // ingestion for the §6.5 shadow harness / DW-183).
  const out = filterQualifyingTransactions([
    row({ transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: true, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: undefined, transaction_acquired_disposed: 'D' }),
  ]);
  assertEquals(out.length, 0);
});

Deno.test('filter (DEC-073): buys-only spans {P, S±10b5, M, C, A, G} → ONLY P survives', () => {
  const out = filterQualifyingTransactions([
    row({ transaction_code: 'P' }),
    row({ transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: true, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: undefined, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'M' }),
    row({ transaction_code: 'C' }),
    row({ transaction_code: 'A' }),
    row({ transaction_code: 'G' }),
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].transaction_code, 'P');
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

// DEC-073: the pre-DEC "pure-discretionary-sale → NEGATIVE raw_signal"
// assertion is DELETED. Buys-only means the net-sell case it tested can
// no longer exist — every S-row drops at the filter seam, and an
// only-sells name surfaces as typed-absence (null) rather than a
// negative raw_signal. The replacement pin is the only-sells →
// typed-absence test below.

Deno.test('compute (DEC-073): only-sells ticker → typed-absence (null), NOT a fabricated 0', () => {
  // Replaces the pre-DEC "pure-discretionary-sale → NEGATIVE" pin.
  // The orchestrator surfaces null as `no_qualifying_transactions`
  // (is_present=0) — honest absence, not a fabricated zero.
  const rows = [
    row({ transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D' }),
    row({ transaction_code: 'S', aff_10b5_one: true,  transaction_acquired_disposed: 'D' }),
  ];
  const res = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assertEquals(res, null, 'only-sells → typed-absence (no qualifying buys)');
});

Deno.test('compute (DEC-073): ALL S drops (10b5-1 OR discretionary) — exclusion outcome unchanged, rationale broadened', () => {
  // Pre-DEC: 10b5-1 was the lone S exclusion. Post-DEC: ALL S drops at
  // the buys-only seam. The exclusion outcome (null) survives; the
  // rationale broadens from "10b5-1 planned" to "all sells".
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

Deno.test('compute (DEC-073 sign-elision): raw_signal is non-negative whenever non-null', () => {
  // Buys-only ⇒ every surviving contribution is + (dollars × weight ×
  // decay, all non-negative). The × sign factor is dead-elided.
  const fixtures: Form4Row[][] = [
    [row({ transaction_code: 'P', officer_title: 'CEO' })],
    [
      row({ transaction_code: 'P', officer_title: 'CFO', transaction_date: '2026-05-01' }),
      row({ transaction_code: 'P', officer_title: 'EVP, Sales', transaction_date: '2026-04-15' }),
    ],
    // mixed with sells — sells drop, residue still non-negative
    [
      row({ transaction_code: 'P', officer_title: 'CEO' }),
      row({ transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D' }),
    ],
  ];
  for (const rows of fixtures) {
    const res = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
    if (res !== null) {
      assert(res.raw_signal >= 0, `expected >= 0, got ${res.raw_signal}`);
    }
  }
});

Deno.test('compute (DEC-073 must-not-move): only-buys name byte-identical to pre-DEC kernel', () => {
  // Locality guarantee: dropping the S-branch + eliding × sign must be
  // a NO-OP for a name whose qualifying set was already buys-only. The
  // pre-DEC kernel for a buy row produced `dollars × (+1) × weight ×
  // decay / market_cap`; the post-DEC kernel produces `dollars × weight
  // × decay / market_cap`. Reproduce the expected value inline (the
  // same arithmetic the pre-DEC kernel would have produced) and assert
  // byte equality.
  const rows = [
    row({
      transaction_code: 'P', transaction_acquired_disposed: 'A',
      transaction_shares: 1000, transaction_price_per_share: 100,
      transaction_date: '2026-06-08', // age=0 → decay=1
      officer_title: 'CEO', // weight=1.0
    }),
  ];
  const res = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assert(res);
  // Pre-DEC: 1000 * 100 * (+1) * 1.0 * 1 / 1e9 = 1e-4
  // Post-DEC: 1000 * 100 *        1.0 * 1 / 1e9 = 1e-4  → byte-identical
  assertEquals(res!.raw_signal, 1e-4);
});

Deno.test('compute (DEC-073 must-move): buys + discretionary-sells → new raw = buys-only sum (sells stripped)', () => {
  const buy = row({
    transaction_code: 'P', transaction_acquired_disposed: 'A',
    transaction_shares: 1000, transaction_price_per_share: 100,
    transaction_date: '2026-06-08', officer_title: 'CEO',
  });
  const sell = row({
    transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D',
    transaction_shares: 500, transaction_price_per_share: 110,
    transaction_date: '2026-06-08', officer_title: 'CEO',
  });
  const mixed = computeInsiderSignal([buy, sell], AS_OF, ONE_BILLION);
  const buysOnly = computeInsiderSignal([buy], AS_OF, ONE_BILLION);
  assert(mixed && buysOnly);
  // Post-DEC: the S contribution is stripped → mixed === buys-only.
  assertEquals(mixed!.raw_signal, buysOnly!.raw_signal);
  // And value strictly >= the pre-DEC mixed value would have been
  // (which was buy − sell-contribution). Pin the directional claim.
  const preDecMixed =
    (1000 * 100 * 1 * 1.0 * 1 - 500 * 110 * 1 * 1.0 * 1) / ONE_BILLION;
  assert(mixed!.raw_signal >= preDecMixed);
});

Deno.test('compute: spec-literal decay exp(-age/14) — age=14 → factor=exp(-1)≈0.368', () => {
  // The §4.4.4 formula `exp(-age_days / 14)` uses 14 as a time constant,
  // not a literal half-life. exp(-14/14) = exp(-1) ≈ 0.3679 (true half-
  // life of this curve is 14·ln(2) ≈ 9.7 days). Spec is explicit on the
  // formula; we implement it verbatim and lock the numerical decay
  // factor here.
  const rowsToday = [
    row({ transaction_date: '2026-06-08', transaction_shares: 1000, transaction_price_per_share: 100 }),
  ];
  const rows14d = [
    row({ transaction_date: '2026-05-25', transaction_shares: 1000, transaction_price_per_share: 100 }),
  ];
  const resToday = computeInsiderSignal(rowsToday, AS_OF, ONE_BILLION);
  const res14d = computeInsiderSignal(rows14d, AS_OF, ONE_BILLION);
  assert(resToday && res14d);
  const ratio = res14d!.raw_signal / resToday!.raw_signal;
  assertAlmostEquals(ratio, Math.exp(-1), 1e-6);
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
    // DEC-073: the second row is an S; post-DEC it drops at the filter
    // seam. Determinism property still holds (same inputs → same output)
    // and the residue is the deterministic buys-only kernel.
    row({ transaction_date: '2026-04-15', transaction_code: 'S', aff_10b5_one: false, transaction_acquired_disposed: 'D', transaction_shares: 300, transaction_price_per_share: 90 }),
  ];
  const a = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  const b = computeInsiderSignal(rows, AS_OF, ONE_BILLION);
  assertEquals(a, b);
});