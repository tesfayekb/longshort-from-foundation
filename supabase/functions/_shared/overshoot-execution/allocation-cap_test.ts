/**
 * allocation-cap_test — INC-96 aggregate-cap regression fence.
 *
 * T1  today-shape scenario         (32 held LONG, headroom ~$12K → ~4-5 admit, tail refused)
 * T2  zero-headroom                (held ≥ cap → 0 admit, all 36 refused)
 * T3  empty-book                   (no prior lots → loop truncates at cap, not at 36)
 * T4  SHORT sleeve mirror          (same three shapes on the SHORT side)
 * T5  rank preservation            (first-N by rank submit, tail refused; no reordering)
 *
 * Plus:
 *  T6  MV basis mix (marks vs cost-basis fallback vs ledger-only)
 *      — proves computeOpenMVBySide never understates exposure.
 *  T7  malformed input (NaN / negative) — refuses defensively.
 *
 * Run via: `deno test supabase/functions/_shared/overshoot-execution/allocation-cap_test.ts`
 */
import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  evaluateAllocationCap,
  computeOpenMVBySide,
  type BrokerPositionForCap,
  type OpenLotForCap,
  type AllocationCapResult,
} from './allocation-cap.ts';

// Ratified constants (mirror sizing.ts).
const ALLOC_LONG = 0.90;
const ALLOC_SHORT = 0.10;

// Helper: run the loop the entry handler runs — iterate `slots` in
// rank order, thread `accepted_notional`, and split each into
// {submitted, refused} exactly as the handler does.
function simulateLoop(params: {
  side: 'long' | 'short';
  sizingBase: number;
  sideAllocationPct: number;
  currentOpenMV: number;
  slots: ReadonlyArray<{ symbol: string; rank: number; notional: number }>;
}) {
  const submitted: string[] = [];
  const refused: string[] = [];
  let acceptedNotional = 0;
  // Preserve rank order (highest rank first — matches DESC in handler).
  const ordered = [...params.slots].sort((a, b) => b.rank - a.rank);
  for (const s of ordered) {
    const r = evaluateAllocationCap({
      side: params.side,
      sizingBase: params.sizingBase,
      sideAllocationPct: params.sideAllocationPct,
      currentOpenMV: params.currentOpenMV,
      acceptedNotionalThisRun: acceptedNotional,
      thisOrderNotional: s.notional,
    });
    if (r.ok) {
      submitted.push(s.symbol);
      acceptedNotional += s.notional;
    } else {
      refused.push(s.symbol);
    }
  }
  return { submitted, refused, acceptedNotional };
}

// ─────────────────────────────────────────────────────────────────────
// T1 — TODAY-SHAPE scenario (the ACT-497 Wave-1 LIVE bracket shape).
//
// equity=$99,500  alloc=1.00  margin=1.00  →  sizingBase=$99,500
// LONG cap = 99,500 × 0.90 = $89,550
// held LONG MV = $77,400  →  headroom = $12,150
// 36-slot LONG book, each slot notional ≈ $2,483 (44,700 / 18 from the
// LIVE envelope averaged) → expect ~4-5 admit, ~31-32 refused with
// allocation_cap_reached.
// ─────────────────────────────────────────────────────────────────────
Deno.test('T1 — today-shape: 4 or 5 slots admit, remainder refused', () => {
  const sizingBase = 99_500;
  const currentOpenMV = 77_400;
  // Build 36 slots at rank 36..1, all $2,483 notional (median of the
  // observed LIVE envelope).
  const slots = Array.from({ length: 36 }, (_, i) => ({
    symbol: `SYM${(i + 1).toString().padStart(2, '0')}`,
    rank: 36 - i,
    notional: 2_483,
  }));
  const out = simulateLoop({
    side: 'long',
    sizingBase,
    sideAllocationPct: ALLOC_LONG,
    currentOpenMV,
    slots,
  });
  // Cap $89,550 − held $77,400 = $12,150 headroom. Each slot $2,483.
  // Floor(12,150 / 2,483) = 4 fully-admissible slots (the 5th would
  // push projected 77,400 + 5×2,483 = 89,815 > 89,550).
  assertEquals(out.submitted.length, 4);
  assertEquals(out.refused.length, 32);
  // Total submitted+refused = full book (identity).
  assertEquals(out.submitted.length + out.refused.length, 36);
});

// ─────────────────────────────────────────────────────────────────────
// T2 — ZERO-HEADROOM: held MV already ≥ cap. All 36 refuse.
// ─────────────────────────────────────────────────────────────────────
Deno.test('T2 — zero-headroom: 0 admit, all 36 refused', () => {
  const sizingBase = 99_500;
  const currentOpenMV = 90_000; // > cap 89,550
  const slots = Array.from({ length: 36 }, (_, i) => ({
    symbol: `SYM${(i + 1).toString().padStart(2, '0')}`,
    rank: 36 - i,
    notional: 2_483,
  }));
  const out = simulateLoop({
    side: 'long',
    sizingBase,
    sideAllocationPct: ALLOC_LONG,
    currentOpenMV,
    slots,
  });
  assertEquals(out.submitted.length, 0);
  assertEquals(out.refused.length, 36);
  assertEquals(out.acceptedNotional, 0);
});

// ─────────────────────────────────────────────────────────────────────
// T3 — EMPTY BOOK: full cap available. Loop truncates AT cap, not at 36.
// ─────────────────────────────────────────────────────────────────────
Deno.test('T3 — empty book: loop truncates at cap, not at 36', () => {
  const sizingBase = 99_500;
  const currentOpenMV = 0;
  const slots = Array.from({ length: 36 }, (_, i) => ({
    symbol: `SYM${(i + 1).toString().padStart(2, '0')}`,
    rank: 36 - i,
    notional: 2_483,
  }));
  const out = simulateLoop({
    side: 'long',
    sizingBase,
    sideAllocationPct: ALLOC_LONG,
    currentOpenMV,
    slots,
  });
  // Cap $89,550. Floor(89,550 / 2,483) = 36 exactly.
  // 36 × 2,483 = 89,388 ≤ 89,550. So all 36 admit.
  // Bound-check: try slightly larger notional to force truncation.
  const bigger = Array.from({ length: 36 }, (_, i) => ({
    symbol: `BIG${(i + 1).toString().padStart(2, '0')}`,
    rank: 36 - i,
    notional: 3_000,
  }));
  const out2 = simulateLoop({
    side: 'long',
    sizingBase,
    sideAllocationPct: ALLOC_LONG,
    currentOpenMV,
    slots: bigger,
  });
  // Floor(89,550 / 3,000) = 29 slots (29 × 3,000 = 87,000 ≤ 89,550;
  // 30 × 3,000 = 90,000 > 89,550).
  assertEquals(out2.submitted.length, 29);
  assertEquals(out2.refused.length, 7);
  // T3 primary assertion: total book is 36, cap enforced, no "book size"
  // sanity leak (loop refused because of the cap, not because the book
  // ran out — book had 36 items and 7 were rejected).
  assertEquals(out2.submitted.length + out2.refused.length, 36);
  assert(out2.acceptedNotional <= 89_550, 'accepted notional exceeds cap');
  // Sanity: the identity slot fit — 36 × 2483 ≤ 89,550.
  assertEquals(out.submitted.length, 36);
});

// ─────────────────────────────────────────────────────────────────────
// T4 — SHORT sleeve mirror.
//   sizingBase $99,500 × 0.10 = $9,950 SHORT cap.
//   (a) empty short book, 4 slots of $2,000 → 4 admit (8,000 ≤ 9,950).
//   (b) held SHORT MV $8,000, 4 slots of $2,000 → 0 admit (10,000 > 9,950).
//   (c) held SHORT MV $10,000, 4 slots of any size → 0 admit.
// ─────────────────────────────────────────────────────────────────────
Deno.test('T4 — SHORT sleeve: mirror of the three LONG shapes', () => {
  const sizingBase = 99_500;
  const slots = Array.from({ length: 4 }, (_, i) => ({
    symbol: `SHR${(i + 1).toString().padStart(2, '0')}`,
    rank: 4 - i,
    notional: 2_000,
  }));
  // (a) empty
  const aOut = simulateLoop({
    side: 'short', sizingBase, sideAllocationPct: ALLOC_SHORT,
    currentOpenMV: 0, slots,
  });
  assertEquals(aOut.submitted.length, 4);
  // (b) near-cap held; first order pushes over.
  const bOut = simulateLoop({
    side: 'short', sizingBase, sideAllocationPct: ALLOC_SHORT,
    currentOpenMV: 8_000, slots,
  });
  // Cap $9,950 − held $8,000 = $1,950 headroom. First slot $2,000 > 1,950 → refused.
  assertEquals(bOut.submitted.length, 0);
  assertEquals(bOut.refused.length, 4);
  // (c) over-cap
  const cOut = simulateLoop({
    side: 'short', sizingBase, sideAllocationPct: ALLOC_SHORT,
    currentOpenMV: 10_000, slots,
  });
  assertEquals(cOut.submitted.length, 0);
  assertEquals(cOut.refused.length, 4);
});

// ─────────────────────────────────────────────────────────────────────
// T5 — RANK PRESERVATION: first-N-by-rank submit; tail refused.
//   No reordering induced by the cap. Even though we FEED the loop in
//   ascending-rank order, the sort in `simulateLoop` restores DESC so
//   the observed handler order (highest-rank first) is preserved.
// ─────────────────────────────────────────────────────────────────────
Deno.test('T5 — rank preservation: highest-rank names claim headroom', () => {
  const sizingBase = 99_500;
  const currentOpenMV = 77_400; // T1 headroom shape
  // Build the book with distinct rank tags so we can identity-check.
  const slots = [
    { symbol: 'BEST_1', rank: 100, notional: 2_483 },
    { symbol: 'BEST_2', rank: 99,  notional: 2_483 },
    { symbol: 'BEST_3', rank: 98,  notional: 2_483 },
    { symbol: 'BEST_4', rank: 97,  notional: 2_483 },
    { symbol: 'TAIL_5', rank: 5,   notional: 2_483 },
    { symbol: 'TAIL_6', rank: 4,   notional: 2_483 },
  ];
  const out = simulateLoop({
    side: 'long', sizingBase, sideAllocationPct: ALLOC_LONG,
    currentOpenMV, slots,
  });
  // Headroom fits 4 slots (T1 arithmetic). Best 4 by rank must submit;
  // tail 2 must refuse.
  assertEquals(out.submitted, ['BEST_1', 'BEST_2', 'BEST_3', 'BEST_4']);
  assertEquals(out.refused,   ['TAIL_5', 'TAIL_6']);
});

// ─────────────────────────────────────────────────────────────────────
// T6 — MV basis mix: broker marks primary, cost-basis fallback, ledger-only
// contribution NEVER understates exposure.
// ─────────────────────────────────────────────────────────────────────
Deno.test('T6 — MV basis: marks primary, cost-basis fallback, ledger-only additive', () => {
  const broker: BrokerPositionForCap[] = [
    // LONG, mark present
    { symbol: 'MARKED_L',  qty: 100, avg_entry_price: 10, market_value: 1_100 },
    // LONG, mark absent → cost-basis fallback = 10 * 50 = 500
    { symbol: 'NOMARK_L',  qty: 50,  avg_entry_price: 10 },
    // SHORT, mark present (Alpaca reports negative market_value; take abs)
    { symbol: 'MARKED_S',  qty: -20, avg_entry_price: 25, market_value: -450 },
    // Zero-qty row: must be ignored.
    { symbol: 'STALE',     qty: 0,   avg_entry_price: 99, market_value: 0 },
  ];
  const lots: OpenLotForCap[] = [
    // Ledger-only LONG lot the broker didn't report → additive as cost.
    { symbol: 'LEDGER_L', side: 'long',  cost_basis: 750 },
    // Ledger row that ALSO exists in the broker set → not double-counted.
    { symbol: 'MARKED_L', side: 'long',  cost_basis: 1_000 },
  ];
  const r = computeOpenMVBySide(broker, lots);
  assertEquals(r.long,  1_100 + 500 + 750); // 2350
  assertEquals(r.short, 450);
  assertEquals(r.basis_mix.long.broker_mark,          1_100);
  assertEquals(r.basis_mix.long.cost_basis_fallback,  500);
  assertEquals(r.basis_mix.long.ledger_only,          750);
  assertEquals(r.basis_mix.short.broker_mark,         450);
  assertEquals(r.basis_mix.short.cost_basis_fallback, 0);
  assertEquals(r.basis_mix.short.ledger_only,         0);
});

// ─────────────────────────────────────────────────────────────────────
// T7 — Malformed input refuses defensively (never silent-passes bad math
// into the money path).
// ─────────────────────────────────────────────────────────────────────
Deno.test('T7 — malformed input refuses defensively', () => {
  const badInputs: Array<Partial<Parameters<typeof evaluateAllocationCap>[0]>> = [
    { thisOrderNotional: Number.NaN },
    { currentOpenMV: -1 },
    { sizingBase: Number.POSITIVE_INFINITY },
    { sideAllocationPct: Number.NaN },
    { acceptedNotionalThisRun: -0.01 },
  ];
  const base = {
    side: 'long' as const,
    sizingBase: 99_500,
    sideAllocationPct: 0.9,
    currentOpenMV: 0,
    acceptedNotionalThisRun: 0,
    thisOrderNotional: 1_000,
  };
  for (const bad of badInputs) {
    const r: AllocationCapResult = evaluateAllocationCap({ ...base, ...bad });
    assertEquals(r.ok, false);
    if (r.ok === false) {
      assertEquals(r.refusal, 'allocation_cap_reached');
    }
  }
});