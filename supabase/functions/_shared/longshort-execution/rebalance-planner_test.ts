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
  // Construct a scenario where a PRIOR SUBSTITUTE pushes Tech to 6/6, then a
  // LATER failing primary must skip the next Tech candidate that would have
  // been legal under a snapshot taken at start-of-day:
  //   Primary Tech accepted at L1..L5 (Tech 5/6 after processing)
  //   L6 (Health) primary accepted
  //   L7 (Energy) primary FAILS → scan. Substitute pool starts at rank 21.
  //     L21 (Tech) — sector-legal (Tech=5<6), passing → ACCEPT ⇒ Tech now 6/6.
  //   L8 (ConsDisc) primary FAILS → scan.
  //     L22 (Tech) — MUST be SKIPPED (Tech=6/6 — only possible to detect with
  //                  per-substitution re-read).
  //     L23 (Health) — sector-legal, passing → ACCEPT.
  // Without re-read, the planner would wrongly accept L22.
  const rankings: RankingRow[] = [];
  for (let i = 1; i <= 5; i++) rankings.push(row(`L${i}`, 'long', i, 'Tech'));
  rankings.push(row('L6', 'long', 6, 'Health'));
  rankings.push(row('L7', 'long', 7, 'Energy'));
  rankings.push(row('L8', 'long', 8, 'ConsDisc'));
  // L9..L20 fill primaries with non-Tech to leave Tech at 5 after primaries.
  for (let i = 9; i <= 20; i++) rankings.push(row(`L${i}`, 'long', i, 'Health'));
  rankings.push(row('L21', 'long', 21, 'Tech'));
  rankings.push(row('L22', 'long', 22, 'Tech'));
  rankings.push(row('L23', 'long', 23, 'Health'));
  for (let i = 24; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`L${i}`, 'long', i, 'Energy'));
  // Short side full pass.
  for (let i = 1; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`S${i}`, 'short', i, 'Tech'));

  // Health primary at L9 — make sure L9-L20 don't breach Health cap. With cap=6
  // and Health=L6+L9..L13 = 6, L14..L20 (7 more) would breach. So restrict:
  // simplify with Energy filler for L14..L20.
  // Rebuild precisely:
  rankings.length = 0;
  for (let i = 1; i <= 5; i++) rankings.push(row(`L${i}`, 'long', i, 'Tech'));      // Tech 5/6
  rankings.push(row('L6', 'long', 6, 'Health'));                                     // Health 1/6
  rankings.push(row('L7', 'long', 7, 'Energy'));                                     // primary FAILS
  rankings.push(row('L8', 'long', 8, 'ConsDisc'));                                   // primary FAILS
  for (let i = 9; i <= 13; i++) rankings.push(row(`L${i}`, 'long', i, 'Health'));    // Health 1+5=6/6
  for (let i = 14; i <= 20; i++) rankings.push(row(`L${i}`, 'long', i, 'Energy'));   // Energy 1+7=8
  // Energy cap! L14..L20 are 7 names of Energy + L7 (would have been Energy) = 8 > 6.
  // L7 fails so it doesn't count. L14..L20 = 7 Energy primaries — still breaches 6.
  // Replace L14..L20 with alternating non-cap-breaching sectors:
  rankings.length = 0;
  for (let i = 1; i <= 5; i++) rankings.push(row(`L${i}`, 'long', i, 'Tech'));      // Tech 5
  rankings.push(row('L6', 'long', 6, 'Health'));                                     // Health 1
  rankings.push(row('L7', 'long', 7, 'Energy'));                                     // FAILS
  rankings.push(row('L8', 'long', 8, 'ConsDisc'));                                   // FAILS
  // L9..L20 = 12 slots, distribute across {Health, Energy, ConsDisc, Financials}
  // such that none exceeds 6.
  const filler = ['Health', 'Energy', 'ConsDisc', 'Financials'];
  for (let i = 9; i <= 20; i++) rankings.push(row(`L${i}`, 'long', i, filler[(i - 9) % 4]));
  // Substitute pool ranks 21+:
  rankings.push(row('L21', 'long', 21, 'Tech'));        // SUB for L7 — Tech 5→6
  rankings.push(row('L22', 'long', 22, 'Tech'));        // would be sub for L8 but Tech now 6/6 → SKIP
  rankings.push(row('L23', 'long', 23, 'Health'));      // SUB for L8 — Health 4 → 5 (OK)
  for (let i = 24; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`L${i}`, 'long', i, 'Energy'));
  for (let i = 1; i <= SUBSTITUTION_SCAN_CAP_RANK; i++) rankings.push(row(`S${i}`, 'short', i, 'Tech'));

  const preflight = passAll(rankings);
  preflight.set(preflightKey('L7', 'long'), pf(false));
  preflight.set(preflightKey('L8', 'long'), pf(false));

  const res = selectFinalTargets({ rankings, preflightResults: preflight, capitalBase: 500_000 });
  assertEquals(res.summary.substitutions_made_long, 2);
  const subs = res.selected.filter((t) => t.selection_reason === 'substitute');
  const subForL7 = subs.find((t) => t.substituted_from_symbol === 'L7');
  const subForL8 = subs.find((t) => t.substituted_from_symbol === 'L8');
  assertEquals(subForL7?.symbol, 'L21', 'first substitute should be L21 (Tech, 5/6 → 6/6)');
  assertEquals(subForL8?.symbol, 'L23', 'must SKIP L22 (Tech 6/6 due to L21 sub) and accept L23 (Health)');
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
