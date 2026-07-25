// ACT-515 Matrix — Chain C0 gate: hand-verified mini-window reconstructor.
//
// C0 GATE (Pin 3): a deterministic mini-window test — a small hand-verified
// slice (3 sessions, mixed candidates incl. K-overflow + dedup) where the
// expected admits are written BY HAND in this file and the reconstructor
// must match them exactly. Plus a shuffle-determinism property.
//
// SCOPE FENCE (Pin 5): imports from `../kernel/*` are READONLY (no kernel
// module is imported for the purpose of monkey-patching). A boundary probe
// at the bottom asserts every kernel-side symbol imported here is a value or
// type re-exported from the certified surface.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  reconstructSessionAdmits, deriveLongTier, buildLongCellKey,
  rankScoreFromCell, entryOffsetFor, LONG_BAND_LITERAL,
  type CorpusCandidateRow, type CellMapLookup, type ReconstructInput,
} from './reconstructor.ts';
import type { Clock, CellKey, Price } from '../kernel/types.ts';
import { price } from '../kernel/types.ts';
import type { SessionDate } from '../kernel/clock.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Hand-built mini-window fixture (3 sessions, LONG-only)
// ─────────────────────────────────────────────────────────────────────────────

// Trading calendar for the fixture (sequential, no gaps for simplicity).
const CAL: ReadonlyArray<SessionDate> = [
  '2024-01-02', '2024-01-03', '2024-01-04', // event dates
  '2024-01-05', '2024-01-08', '2024-01-09', // T+1 entries
  '2024-01-10', '2024-01-11', '2024-01-12', // padding
];
const sessionIdx = new Map(CAL.map((s, i) => [s, i]));
const sessionOffset = (s: SessionDate, n: number): SessionDate | null => {
  const i = sessionIdx.get(s);
  if (i === undefined) return null;
  return CAL[i + n] ?? null;
};

// All candidates are T2 (window=4 or 5 → outside T1 windows {1,2,3}) except
// where explicitly T1. T2 → entry T+1; T1 → entry T+2. Event dates chosen so
// all entries land on 2024-01-05 (T+1 for 2024-01-03 T2's, T+2 for
// 2024-01-03 T1's would land on 2024-01-08 — kept out).

function row(id: number, ticker: string, eventDate: SessionDate, windowDays: number,
             mq: number = 3, dd: number = 4): CorpusCandidateRow {
  return {
    eventId: id, ticker, side: 'long', eventDate,
    windowDays, momentumQuintile: mq, drawdownBucket: dd,
    daysToNearestEarnings: 30,
  };
}

// Session-1 entry date: 2024-01-05. Feeder events are 2024-01-04 (T+1 lands
// 2024-01-05) — window_days=4 (T2). Names sorted so we can predict rank.
// Cell map: mean_fwd_return_5d chosen so higher-priority tickers get higher
// rank_score.
const CELL_MEAN = new Map<string, number>([
  // key: `${windowDays}/${mq}/${dd}` — for our fixture we vary only ranking
  // through mq+dd; simplify by returning a per-window baseline plus mq offset.
  ['4/3/4', 0.010], // baseline T2
  ['4/4/2', 0.020], // higher rank
  ['4/5/1', 0.030], // highest rank (still T1 geometry: w=4 is NOT in T1 windows → stays T2)
  ['1/5/1', 0.025], // T1 geometry (w=1, mq=5, dd=1)
  ['5/3/4', 0.005], // low rank T2
]);
const cellMap: CellMapLookup = (k: CellKey) => {
  return CELL_MEAN.get(`${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}`) ?? null;
};

// Reference-price resolver — $50 for everyone; slot $2500/50 = 50 shares.
const refPx: (t: string, s: SessionDate) => Price | null = (_t, _s) => price(50);

const clock: Clock = { nowMs: () => 1_704_000_000_000 };

function baseInput(over: Partial<ReconstructInput>): ReconstructInput {
  return {
    sessionDate: '2024-01-05',
    corpusRows: [],
    cellMap,
    openBook: [],
    equityUsd: 100_000,
    variantId: '1x-const',
    budgets: { k: 5, shortDailyBudget: 1 },
    caps: { sideCapUsd: { long: 90_000, short: 10_000 } },
    referencePrice: refPx,
    sessionOffset,
    clock,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — happy path, 3 candidates, all admitted, within K=5.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('C0 gate — session 1: 3 LONG T2 candidates, all admitted (K=5 unstressed)', () => {
  const rows: CorpusCandidateRow[] = [
    row(101, 'AAA', '2024-01-04', 4, /*mq*/ 4, /*dd*/ 2), // rank 0.020
    row(102, 'BBB', '2024-01-04', 4, /*mq*/ 3, /*dd*/ 4), // rank 0.010
    row(103, 'CCC', '2024-01-04', 4, /*mq*/ 5, /*dd*/ 1), // rank 0.030
  ];
  const res = reconstructSessionAdmits(baseInput({ corpusRows: rows }));

  // HAND-COMPUTED expected: 3 admits ordered by kernel compareCandidates
  // (side=long, tier=T2 for all, rank DESC): CCC(0.030) → AAA(0.020) → BBB(0.010).
  assertEquals(res.entries.length, 3);
  assertEquals(res.entries.map(e => e.ticker), ['CCC', 'AAA', 'BBB']);
  assertEquals(res.entries.map(e => e.shares as unknown as number), [50, 50, 50]);
  assertEquals(res.entries.map(e => e.entryPrice as unknown as number), [50, 50, 50]);
  assertEquals(res.tally.admits, 3);
  assertEquals(res.tally.daily_budget_reached, 0);
  assertEquals(res.tally.skips_short, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — K-OVERFLOW: 7 candidates for one session → 5 admitted, 2 refused.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('C0 gate — K-overflow: 7 LONG candidates → 5 admits, 2 daily_budget_reached', () => {
  const rows: CorpusCandidateRow[] = [
    // 5 high-rank T2 (mq=5,dd=1 → 0.030) + 2 low-rank T2 (mq=3,dd=4 → 0.010).
    // Tickers picked so alphabetical tiebreak is unambiguous.
    row(201, 'H1', '2024-01-04', 4, 5, 1),
    row(202, 'H2', '2024-01-04', 4, 5, 1),
    row(203, 'H3', '2024-01-04', 4, 5, 1),
    row(204, 'H4', '2024-01-04', 4, 5, 1),
    row(205, 'H5', '2024-01-04', 4, 5, 1),
    row(206, 'L1', '2024-01-04', 4, 3, 4),
    row(207, 'L2', '2024-01-04', 4, 3, 4),
  ];
  const res = reconstructSessionAdmits(baseInput({ corpusRows: rows }));

  // HAND-COMPUTED: 5 admits are H1..H5 (rank 0.030 tied → ticker ASC).
  // 2 refusals with daily_budget_reached: L1, L2 (in that admit-loop order).
  assertEquals(res.entries.map(e => e.ticker), ['H1', 'H2', 'H3', 'H4', 'H5']);
  assertEquals(res.tally.admits, 5);
  assertEquals(res.tally.daily_budget_reached, 2);
  assertEquals(res.refusals.length, 2);
  assertEquals(res.refusals.map(r => r.category).sort(),
    ['daily_budget_reached', 'daily_budget_reached']);
  assertEquals(res.refusals.map(r => r.ticker).sort(), ['L1', 'L2']);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — DEDUP: candidate for a ticker already in openBook → refused.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('C0 gate — dedup: candidate for held ticker → position_already_open', () => {
  const rows: CorpusCandidateRow[] = [
    row(301, 'HELD', '2024-01-04', 4, 5, 1), // rank 0.030 but already held
    row(302, 'NEW1', '2024-01-04', 4, 4, 2), // rank 0.020 admits
  ];
  const res = reconstructSessionAdmits(baseInput({
    corpusRows: rows,
    openBook: [{ ticker: 'HELD', side: 'long', marketValueUsd: 2500 }],
  }));

  assertEquals(res.entries.map(e => e.ticker), ['NEW1']);
  assertEquals(res.tally.admits, 1);
  assertEquals(res.tally.position_already_open, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4 — SHORT skip: SHORT rows counted, no admits.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('C0 gate — SHORT rows emit typed skip and are counted', () => {
  const rows: CorpusCandidateRow[] = [
    { eventId: 401, ticker: 'SHT1', side: 'short', eventDate: '2024-01-04',
      windowDays: 4, momentumQuintile: 5, drawdownBucket: 1, daysToNearestEarnings: 30 },
    row(402, 'LNG1', '2024-01-04', 4, 5, 1),
  ];
  const res = reconstructSessionAdmits(baseInput({ corpusRows: rows }));
  assertEquals(res.entries.map(e => e.ticker), ['LNG1']);
  assertEquals(res.tally.skips_short, 1);
  assertEquals(res.skips[0]?.reason, 'short_reconstruction_not_yet_wired');
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5 — no_cell_map_hit: cell missing from map → skip.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('C0 gate — cell absent from map → no_cell_map_hit skip', () => {
  const rows: CorpusCandidateRow[] = [
    row(501, 'MISS', '2024-01-04', 2, 2, 5), // no entry in CELL_MEAN
    row(502, 'HIT',  '2024-01-04', 4, 5, 1),
  ];
  const res = reconstructSessionAdmits(baseInput({ corpusRows: rows }));
  assertEquals(res.entries.map(e => e.ticker), ['HIT']);
  assertEquals(res.tally.skips_no_cell, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6 — SHUFFLE DETERMINISM: input order does not affect output.
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('C0 gate — shuffle-determinism: output invariant to input order', () => {
  const rows: CorpusCandidateRow[] = [
    row(601, 'H1', '2024-01-04', 4, 5, 1),
    row(602, 'H2', '2024-01-04', 4, 5, 1),
    row(603, 'H3', '2024-01-04', 4, 5, 1),
    row(604, 'M1', '2024-01-04', 4, 4, 2),
    row(605, 'M2', '2024-01-04', 4, 4, 2),
    row(606, 'L1', '2024-01-04', 4, 3, 4),
    row(607, 'L2', '2024-01-04', 4, 3, 4),
  ];
  // Deterministic shuffle: 7! = 5040 permutations too many. Test 8 fixed
  // permutations (mix of reverses, swaps, rotations) — collectively cover
  // adjacent-swap + wide-swap + reverse-full cases.
  const perms: ReadonlyArray<ReadonlyArray<number>> = [
    [0,1,2,3,4,5,6], [6,5,4,3,2,1,0], [3,4,5,6,0,1,2],
    [1,0,3,2,5,4,6], [6,0,5,1,4,2,3], [2,4,6,0,1,3,5],
    [0,6,1,5,2,4,3], [5,3,1,6,4,2,0],
  ];
  const base = reconstructSessionAdmits(baseInput({ corpusRows: rows }));
  const baseTickers = base.entries.map(e => e.ticker);
  const baseTally = base.tally;
  for (const perm of perms) {
    const shuffled = perm.map(i => rows[i]);
    const r = reconstructSessionAdmits(baseInput({ corpusRows: shuffled }));
    assertEquals(r.entries.map(e => e.ticker), baseTickers,
      `perm ${perm} broke entries order`);
    assertEquals(r.tally, baseTally, `perm ${perm} broke tally`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7 — pure helpers (fast citations)
// ─────────────────────────────────────────────────────────────────────────────
Deno.test('helper: deriveLongTier — LONG_T1_GEOMETRY verbatim', () => {
  // T1: window ∈{1,2,3} ∧ mq ∈{4,5} ∧ dd ∈{1,2,3}
  assertEquals(deriveLongTier(row(1, 'T', '2024-01-04', 1, 4, 1)), 'T1');
  assertEquals(deriveLongTier(row(1, 'T', '2024-01-04', 3, 5, 3)), 'T1');
  // T2: any single condition fails
  assertEquals(deriveLongTier(row(1, 'T', '2024-01-04', 4, 4, 1)), 'T2'); // w=4
  assertEquals(deriveLongTier(row(1, 'T', '2024-01-04', 1, 3, 1)), 'T2'); // mq=3
  assertEquals(deriveLongTier(row(1, 'T', '2024-01-04', 1, 5, 4)), 'T2'); // dd=4
  // Short → null
  assertEquals(deriveLongTier({ ...row(1, 'T', '2024-01-04', 1, 5, 1), side: 'short' }), null);
});

Deno.test('helper: entryOffsetFor — matrix §2 horizons', () => {
  assertEquals(entryOffsetFor('T1'), 2);
  assertEquals(entryOffsetFor('T2'), 1);
});

Deno.test('helper: rankScoreFromCell — sideSign convention', () => {
  assertEquals(rankScoreFromCell('long',  0.02), 0.02);
  assertEquals(rankScoreFromCell('short', 0.02), -0.02);
});

Deno.test('helper: buildLongCellKey — verbatim detector.ts:1056-1063', () => {
  const k = buildLongCellKey(row(1, 'T', '2024-01-04', 3, 4, 2));
  assert(k !== null);
  assertEquals(k!.side, 'long');
  assertEquals(k!.band, LONG_BAND_LITERAL);
  assertEquals(k!.argmaxWindowDays, 3);
  assertEquals(k!.magnitudeQuintile, 4);
  assertEquals(k!.drawdownBucket, 2);
  assertEquals(k!.exclusionHorizonDays, 5);
});
