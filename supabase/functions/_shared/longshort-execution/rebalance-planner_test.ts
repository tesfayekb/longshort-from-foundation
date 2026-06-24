/**
 * rebalance-planner_test — FP-056 E1 (ACT-307).
 *
 * Pure, mock-injected. NO credentials, NO live broker. Covers scenarios (a)–(j)
 * enumerated in the FP-056 E1 build prompt + a Gate-6 wall-clock self-scan
 * (the kernel file must not contain Date.now / performance.now / new Date() —
 * `ts` is the sole injected Date source per DEC-034 clause 4).
 */

import { assertEquals, assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY,
  NOOP_FLOOR_USD,
  NOOP_PCT,
  OppositeSideOpenPositionError,
  PRIMARY_BOOK_TOP_N_PER_SIDE,
  SUBSTITUTION_SCAN_CAP_RANK,
  computeDeltas,
  planRebalance,
  preflightKey,
  selectFinalTargets,
  type CurrentPosition,
  type PreflightKey,
  type PreflightResult,
  type RankingRow,
} from './rebalance-planner.ts';

const RS = 'count_normalized_fallback';
const TS = new Date('2026-06-24T20:30:00Z');

/** Build a ranking row pair (same ticker is both long and short candidate; we
 *  set the opposite-side rank to a value outside the scan window). */
function row(
  ticker: string,
  side: 'long' | 'short',
  rank: number,
  sector: string | null,
  score = 1 / rank,
): RankingRow {
  return {
    ticker,
    long_rank: side === 'long' ? rank : 999,
    short_rank: side === 'short' ? rank : 999,
    long_score: side === 'long' ? score : -score,
    short_score: side === 'short' ? score : -score,
    gics_sector: sector,
    ranker_source: RS,
  };
}

function pf(passed: boolean, reason: string | null = null): PreflightResult {
  return { passed, reason, failed_verifiers: passed ? [] : ['verify_short_availability'] };
}

/** Build a passing pre-flight map for every (symbol, side) in `rankings`. */
function passAll(rankings: readonly RankingRow[]): Map<PreflightKey, PreflightResult> {
  const m = new Map<PreflightKey, PreflightResult>();
  for (const r of rankings) {
    if (r.long_rank <= SUBSTITUTION_SCAN_CAP_RANK) m.set(preflightKey(r.ticker, 'long'), pf(true));
    if (r.short_rank <= SUBSTITUTION_SCAN_CAP_RANK) m.set(preflightKey(r.ticker, 'short'), pf(true));
  }
  return m;
}

/** Generate 30 long + 30 short candidates across 4 sectors, evenly distributed. */
function fullUniverse(): RankingRow[] {
  const sectors = ['Tech', 'Health', 'Energy', 'ConsDisc'];
  const out: RankingRow[] = [];
  for (let i = 1; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) {
    out.push(row(`L${i}`, 'long', i, sectors[(i - 1) % 4]));
  }
  for (let i = 1; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) {
    out.push(row(`S${i}`, 'short', i, sectors[(i - 1) % 4]));
  }
  return out;
}

// ── (a) No-substitution baseline — all top-20 pass; book = 40, no substitution. ──
Deno.test('(a) no-substitution baseline — top-20/side all pass = full 40-name book, no substitution', () => {
  const rankings = fullUniverse();
  const preflight = passAll(rankings);
  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  assertEquals(res.summary.book_size, 40);
  assertEquals(res.summary.book_size_long, 20);
  assertEquals(res.summary.book_size_short, 20);
  assertEquals(res.summary.substitutions_made_long, 0);
  assertEquals(res.summary.substitutions_made_short, 0);
  assertEquals(res.summary.one_fewer_fallbacks_long, 0);
  assertEquals(res.summary.one_fewer_fallbacks_short, 0);
  assertEquals(res.summary.per_name_notional, 500_000 / 40); // $12,500
  for (const t of res.selected) assertEquals(t.selection_reason, 'primary');
});

// ── (b) Single substitution — sector-legal substitute selected, provenance stamped. ──
Deno.test('(b) single substitution sector-legal — provenance stamped (substituted_from + original_rank)', () => {
  const rankings = fullUniverse();
  const preflight = passAll(rankings);
  preflight.set(preflightKey('L1', 'long'), pf(false, 'borrow_locate_unavailable'));
  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  assertEquals(res.summary.book_size_long, 20);
  assertEquals(res.summary.substitutions_made_long, 1);
  assertEquals(res.summary.substitution_attempts_long, 1);
  assertEquals(res.summary.one_fewer_fallbacks_long, 0);
  // First substitute should be rank-21 L21 (same Tech sector; sector cap 6 not exceeded:
  //   primary Tech accepted = L5,L9,L13,L17 + L21 ⇒ 5/6 OK).
  const sub = res.selected.find((t) => t.selection_reason === 'substitute');
  assert(sub, 'expected a substitute');
  assertEquals(sub!.symbol, 'L21');
  assertEquals(sub!.substituted_from_symbol, 'L1');
  assertEquals(sub!.original_rank, 21);
});

// ── (c) Sector-cap blocks — rank-21 ConsDisc skipped at cap, next legal substituted. ──
Deno.test('(c) sector-cap blocks — V2 live scenario: rank-21 sector-illegal, scan continues to next legal', () => {
  // Construct a short side where ConsDisc occupies ranks 1–6 (all primary-accepted ⇒ 6/6),
  // then rank 7..20 fill with non-ConsDisc, rank-20 fails pre-flight, rank-21 is ConsDisc
  // (must be SKIPPED for sector-illegality), rank-22 is Tech (must be substituted in).
  const rankings: RankingRow[] = [];
  for (let i = 1; i <= 6; i++) rankings.push(row(`S${i}`, 'short', i, 'ConsDisc'));
  for (let i = 7; i <= 20; i++) rankings.push(row(`S${i}`, 'short', i, 'Health'));
  rankings.push(row('S21', 'short', 21, 'ConsDisc'));
  rankings.push(row('S22', 'short', 22, 'Tech'));
  // Pad ranks 23..30 with Energy.
  for (let i = 23; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`S${i}`, 'short', i, 'Energy'));
  // Add a parallel long universe so the planner has both sides.
  for (let i = 1; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`L${i}`, 'long', i, 'Tech'));

  const preflight = passAll(rankings);
  preflight.set(preflightKey('S20', 'short'), pf(false, 'borrow_locate_unavailable'));
  // Force long side to break too — only one substitute on long, sector cap doesn't bind there.

  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  const sub = res.selected.find((t) => t.selection_reason === 'substitute' && t.side === 'short');
  assert(sub, 'expected a short-side substitute');
  assertEquals(sub!.symbol, 'S22', 'should skip S21 (sector-illegal: ConsDisc 6/6) and select S22 (Tech)');
  assertEquals(sub!.substituted_from_symbol, 'S20');
  assertEquals(sub!.original_rank, 22);
  assertEquals(res.summary.substitutions_made_short, 1);
});

// ── (d) Cascade exhausts to rank 30 → one-fewer fallback. ──
Deno.test('(d) cascade to rank-30 exhausts → one-fewer fallback (selection has 19, not 20)', () => {
  const rankings = fullUniverse();
  const preflight = passAll(rankings);
  // Long L1 fails, AND every rank-21..30 long candidate also fails pre-flight.
  preflight.set(preflightKey('L1', 'long'), pf(false));
  for (let i = 21; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) {
    preflight.set(preflightKey(`L${i}`, 'long'), pf(false));
  }
  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  assertEquals(res.summary.book_size_long, 19);
  assertEquals(res.summary.book_size_short, 20);
  assertEquals(res.summary.book_size, 39);
  assertEquals(res.summary.substitutions_made_long, 0);
  assertEquals(res.summary.one_fewer_fallbacks_long, 1);
  assertEquals(res.summary.substitution_attempts_long, 1);
  // per_name rises because divisor shrinks.
  assertEquals(res.summary.per_name_notional, 500_000 / 39);
});

// ── (e) Sequential substitution re-reads sector counts. ──
Deno.test('(e) sequential substitution re-reads sector counts (second substitute sees first substitute\'s sector)', () => {
  // Construct: long sector cap edge case.
  //   Primary Tech accepted: L1,L5,L9,L13,L17 = 5/6
  //   L21 (Tech) substituted in for failing L2 ⇒ Tech now 6/6
  //   L4 fails next → scan substitutes; L25 (Tech) MUST be skipped (cap 6/6),
  //                   L26 (Health) selected instead. Without re-read, planner
  //                   would wrongly accept L25.
  const rankings: RankingRow[] = [];
  // Long ranks 1..20 with sectors so Tech sits at 1,5,9,13,17 (i mod 4 == 1).
  const sectors = ['Tech', 'Health', 'Energy', 'ConsDisc'];
  for (let i = 1; i <= 20; i++) rankings.push(row(`L${i}`, 'long', i, sectors[(i - 1) % 4]));
  rankings.push(row('L21', 'long', 21, 'Tech'));
  rankings.push(row('L22', 'long', 22, 'Energy'));
  rankings.push(row('L23', 'long', 23, 'Health'));
  rankings.push(row('L24', 'long', 24, 'ConsDisc'));
  rankings.push(row('L25', 'long', 25, 'Tech'));
  rankings.push(row('L26', 'long', 26, 'Health'));
  for (let i = 27; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`L${i}`, 'long', i, 'Energy'));
  // Parallel short side.
  for (let i = 1; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`S${i}`, 'short', i, 'Tech'));

  const preflight = passAll(rankings);
  preflight.set(preflightKey('L2', 'long'), pf(false));  // Health → substitute L21 (Tech, brings Tech to 6/6)
  preflight.set(preflightKey('L4', 'long'), pf(false));  // ConsDisc → must NOT pick L25 (Tech 6/6), must pick L26 (Health)

  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  assertEquals(res.summary.substitutions_made_long, 2);
  const subs = res.selected.filter((t) => t.selection_reason === 'substitute');
  const subForL2 = subs.find((t) => t.substituted_from_symbol === 'L2');
  const subForL4 = subs.find((t) => t.substituted_from_symbol === 'L4');
  assertEquals(subForL2?.symbol, 'L21');
  assertEquals(subForL4?.symbol, 'L26', 'must skip L25 (Tech 6/6 after L21 sub) and accept L26 (Health)');
});

// ── (f) MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY bound — beyond bound = no scan, one-fewer. ──
Deno.test('(f) per-side daily substitution-attempts cap = 10 (beyond bound: no scan, fall through to one-fewer)', () => {
  const rankings = fullUniverse();
  const preflight = passAll(rankings);
  // 11 primary long failures (L1..L11). The first 10 trigger scans (all succeed
  // since rank-21..30 are passing + sectors balanced). The 11th MUST fall
  // through to one-fewer without scanning.
  for (let i = 1; i <= 11; i++) preflight.set(preflightKey(`L${i}`, 'long'), pf(false));
  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  assertEquals(res.summary.substitution_attempts_long, MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY);
  assert(res.summary.substitutions_made_long <= MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY);
  assert(res.summary.one_fewer_fallbacks_long >= 1, 'the 11th failure must fall through');
});

// ── (g) Noop tolerance — just-under / just-over / exact-equal boundary. ──
Deno.test('(g) noop-tolerance band — boundary uses max(NOOP_PCT*|target|, NOOP_FLOOR_USD)', () => {
  // target 12,500 → noop_band = max(0.02*12500, 50) = 250.
  const selected = [{
    symbol: 'AAPL',
    side: 'long' as const,
    sector: 'Tech',
    target_notional: 12_500,
    original_rank: 1,
    substituted_from_symbol: null,
    selection_reason: 'primary' as const,
    score: 1,
    ranker_source: RS,
  }];
  const mk = (mv: number): CurrentPosition => ({
    symbol: 'AAPL', side: 'long', qty: mv / 100, market_value: mv, current_price: 100,
  });

  const justUnder = computeDeltas({ selectedTargets: selected, currentPositions: [mk(12_500 - 249)], ts: TS });
  assertEquals(justUnder[0].intent, 'noop');
  const exact = computeDeltas({ selectedTargets: selected, currentPositions: [mk(12_500 - 250)], ts: TS });
  assertEquals(exact[0].intent, 'noop', 'exact-equal-band is noop (≤ comparison)');
  const justOver = computeDeltas({ selectedTargets: selected, currentPositions: [mk(12_500 - 251)], ts: TS });
  assertEquals(justOver[0].intent, 'increase');
  // Small-target floor case: target 100, band = max(2, 50) = 50.
  const smallSel = [{ ...selected[0], target_notional: 100 }];
  const smallNoop = computeDeltas({ selectedTargets: smallSel, currentPositions: [mk(60)], ts: TS });
  assertEquals(smallNoop[0].noop_band_usd, NOOP_FLOOR_USD);
  assertEquals(smallNoop[0].intent, 'noop');
});

// ── (h) Close enumeration — current position NOT in selected set → intent=close. ──
Deno.test('(h) close enumeration — currentPositions iterated; symbols not in selected = close intent', () => {
  const selected = [{
    symbol: 'NEW',
    side: 'long' as const,
    sector: 'Tech',
    target_notional: 12_500,
    original_rank: 1,
    substituted_from_symbol: null,
    selection_reason: 'primary' as const,
    score: 1,
    ranker_source: RS,
  }];
  const current: CurrentPosition[] = [
    { symbol: 'OLD', side: 'long', qty: 100, market_value: 15_000, current_price: 150 },
    { symbol: 'NEW', side: 'long', qty: 80, market_value: 12_000, current_price: 150 },
  ];
  const deltas = computeDeltas({ selectedTargets: selected, currentPositions: current, ts: TS });
  const closeDelta = deltas.find((d) => d.symbol === 'OLD');
  assert(closeDelta);
  assertEquals(closeDelta!.intent, 'close');
  assertEquals(closeDelta!.target_notional, 0);
  assertEquals(closeDelta!.delta_notional, -15_000, 'close drives notional to zero');
  assertEquals(closeDelta!.selection_reason, null, 'close has no selection provenance');
  // NEW: |12500-12000|=500 > max(0.02*12500=250, 50)=250 → increase
  const newDelta = deltas.find((d) => d.symbol === 'NEW');
  assertEquals(newDelta!.intent, 'increase');
});

// ── (i) Opposite-side current vs. target → system_bug classification (typed throw). ──
Deno.test('(i) opposite-side current vs. target on same symbol throws OppositeSideOpenPositionError (tier-3 system_bug)', () => {
  const selected = [{
    symbol: 'XYZ',
    side: 'long' as const,
    sector: 'Tech',
    target_notional: 12_500,
    original_rank: 1,
    substituted_from_symbol: null,
    selection_reason: 'primary' as const,
    score: 1,
    ranker_source: RS,
  }];
  const current: CurrentPosition[] = [
    { symbol: 'XYZ', side: 'short', qty: -50, market_value: -7_500, current_price: 150 },
  ];
  assertThrows(
    () => computeDeltas({ selectedTargets: selected, currentPositions: current, ts: TS }),
    OppositeSideOpenPositionError,
  );
});

// ── (j) Provenance flows to delta output — every ExecutionDelta carries it. ──
Deno.test('(j) provenance is FIRST-CLASS on ExecutionDelta (selection_reason / substituted_from / original_rank)', () => {
  const rankings = fullUniverse();
  const preflight = passAll(rankings);
  preflight.set(preflightKey('L1', 'long'), pf(false));   // forces substitute
  const result = planRebalance({
    rankings,
    preflightResults: preflight,
    currentPositions: [],
    ts: TS,
    capitalBase: 500_000,
  });
  assert(result.deltas.length > 0);
  for (const d of result.deltas) {
    // Every open delta MUST carry provenance — never null for selected names.
    assertEquals(d.intent, 'open');
    assert(d.selection_reason !== null, `delta for ${d.symbol} missing selection_reason`);
    assert(d.original_rank !== null, `delta for ${d.symbol} missing original_rank`);
    if (d.selection_reason === 'substitute') {
      assert(d.substituted_from_symbol !== null);
    } else {
      assertEquals(d.substituted_from_symbol, null);
    }
  }
  const subDelta = result.deltas.find((d) => d.selection_reason === 'substitute');
  assert(subDelta, 'expected one substitute delta');
  assertEquals(subDelta!.substituted_from_symbol, 'L1');
});

// ── Bonus: planRebalance composition + capital-base sizing arithmetic. ──
Deno.test('planRebalance composes selection + deltas; sizing arithmetic = capital_base × allocation × leverage / book_size', () => {
  const rankings = fullUniverse();
  const preflight = passAll(rankings);
  const r = planRebalance({
    rankings,
    preflightResults: preflight,
    currentPositions: [],
    ts: TS,
    capitalBase: 500_000,
    allocationPct: 1.0,
  });
  assertEquals(r.summary.book_size, 40);
  assertEquals(r.summary.capital_base, 500_000);
  assertEquals(r.summary.per_name_notional, 12_500);
  // Long deltas have positive target, short have negative.
  const longD = r.deltas.find((d) => d.side === 'long');
  const shortD = r.deltas.find((d) => d.side === 'short');
  assertEquals(longD!.target_notional, 12_500);
  assertEquals(shortD!.target_notional, -12_500);
});

// ── Gate-6 self-scan — kernel source MUST NOT use wall-clock APIs. ──
Deno.test('Gate-6 wall-clock self-scan: rebalance-planner.ts must not contain Date.now / performance.now / new Date()', async () => {
  const src = await Deno.readTextFile(new URL('./rebalance-planner.ts', import.meta.url));
  // Strip comments to avoid false positives on documentation strings.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert(!/\bDate\.now\s*\(/.test(code), 'Date.now() found in kernel');
  assert(!/\bperformance\.now\s*\(/.test(code), 'performance.now() found in kernel');
  assert(!/\bnew\s+Date\s*\(/.test(code), 'new Date() found in kernel');
});

// ── Constants surfaced for cross-module reference + ratification audit. ──
Deno.test('exported constants match DEC-068 clause (j) + E1 noop defaults', () => {
  assertEquals(SUBSTITUTION_SCAN_CAP_RANK, 30);
  assertEquals(MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY, 10);
  assertEquals(PRIMARY_BOOK_TOP_N_PER_SIDE, 20);
  assertEquals(NOOP_PCT, 0.02);
  assertEquals(NOOP_FLOOR_USD, 50);
});

void OppositeSideOpenPositionError; // ensure named export retained
void PreflightResult;