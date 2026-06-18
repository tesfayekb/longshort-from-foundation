/**
 * Book-seeder unit tests — FP-052 (3.0c-i / ACT-238).
 *
 * DB-FREE. Covers: 40-name universe → 20+20 split; 140-name universe →
 * 20+20 split; the pre-persistence no-overlap assertion fires on a
 * 39-name contrived case where the median name occupies both top-20
 * long AND top-20 short; small-side rule (do not pad when < 20 names
 * exist on a side); `ranker_source` literal stamp on every emitted row.
 */

import { assertEquals, assertThrows, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeRankings } from './ranker.ts';
import { seedBook, BookOverlapError, type BookRow } from './book-seeder.ts';
import { RANKER_SOURCE_FALLBACK, BOOK_SEED_SIZE } from './ranker-constants.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
} from './signal-catalog.ts';
import type { FeatureVectorRow } from './feature-assembler.ts';

function makeIncludedRow(ticker: string, composite: number): FeatureVectorRow {
  // Construct so composite = composite: 2 criticals at c/2 each + 3
  // non-criticals at c/3 each → numerator = c + c; presentCount = 5;
  // /5 = (2c)/5. So set criticals = 5c/4 each, non-criticals = 5c/6
  // such that (2*(5c/4) + 3*(5c/6))/5 = c. Simpler: use full-coverage row
  // where every signal contributes c, so numerator = 9c, presentCount=9,
  // composite = c.
  const features: Record<string, number | null> = {};
  features[SIGNAL_IDS_CRITICAL[0]] = composite;
  features[SIGNAL_IDS_CRITICAL[1]] = composite;
  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    features[nonCriticalValueKey(id)] = composite;
    features[nonCriticalIsPresentKey(id)] = 1;
  }
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    as_of_date: '2026-06-16',
    ticker,
    features,
    gics_sector: 'TECH',
    coverage_count: 9,
    excluded_reason: null,
  };
}

Deno.test('seedBook: 40-name universe → exactly 20 long + 20 short, no overlap', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 40; i++) {
    rows.push(makeIncludedRow(`N${String(i).padStart(2, '0')}`, (i + 1) * 0.1)); // distinct
  }
  const book = seedBook(computeRankings(rows));
  const longs = book.filter(b => b.side === 'long');
  const shorts = book.filter(b => b.side === 'short');
  assertEquals(longs.length, 20);
  assertEquals(shorts.length, 20);
  // rank_within_side is 1..20 on each side
  assertEquals(longs.map(b => b.rank_within_side), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
  assertEquals(shorts.map(b => b.rank_within_side), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
  // Highest composite (N39, c=4.0) is top-long; lowest (N00, c=0.1) is top-short
  assertEquals(longs[0].ticker, 'N39');
  assertEquals(shorts[0].ticker, 'N00');
});

Deno.test('seedBook: 140-name universe → 20+20 split; sides are disjoint', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 140; i++) {
    rows.push(makeIncludedRow(`M${String(i).padStart(3, '0')}`, (i + 1) * 0.001));
  }
  const book = seedBook(computeRankings(rows));
  const longs = book.filter(b => b.side === 'long');
  const shorts = book.filter(b => b.side === 'short');
  assertEquals(longs.length, BOOK_SEED_SIZE);
  assertEquals(shorts.length, BOOK_SEED_SIZE);
  const longSet = new Set(longs.map(b => b.ticker));
  for (const s of shorts) assert(!longSet.has(s.ticker), `overlap on ${s.ticker}`);
});

Deno.test('seedBook: ranker_source literal stamped on every row (long + short)', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 40; i++) rows.push(makeIncludedRow(`L${i}`, i * 0.1));
  const book = seedBook(computeRankings(rows));
  assertEquals(book.length, 40);
  for (const b of book) {
    assertEquals(b.ranker_source, RANKER_SOURCE_FALLBACK);
    assertEquals(b.ranker_source, 'count_normalized_fallback');
  }
});

Deno.test('seedBook: long.score = ranker long_score (positive); short.score = ranker short_score (negative for positive composites)', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 40; i++) rows.push(makeIncludedRow(`P${String(i).padStart(2, '0')}`, (i + 1) * 0.1));
  const rankings = computeRankings(rows);
  const book = seedBook(rankings);
  const rankByTicker = new Map(rankings.map(r => [r.ticker, r]));
  for (const b of book) {
    const r = rankByTicker.get(b.ticker)!;
    if (b.side === 'long') assertEquals(b.score, r.long_score);
    else assertEquals(b.score, r.short_score);
  }
});

Deno.test('seedBook: no-overlap assertion FIRES on 39-name contrived case (median name lands on both sides)', () => {
  // 39 distinct composites — long_rank[i] + short_rank[i] = 40. For
  // long_rank=20, short_rank=20 → same name on both sides. The pure
  // assertion must throw BookOverlapError BEFORE returning.
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 39; i++) {
    rows.push(makeIncludedRow(`Q${String(i).padStart(2, '0')}`, (i + 1) * 0.1));
  }
  assertThrows(() => seedBook(computeRankings(rows)), BookOverlapError);
});

Deno.test('seedBook: no-overlap assertion DOES NOT fire on 40-name minimum (edge below the boundary)', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 40; i++) rows.push(makeIncludedRow(`R${String(i).padStart(2, '0')}`, (i + 1) * 0.1));
  // Must not throw
  const book = seedBook(computeRankings(rows));
  assertEquals(book.length, 40);
});

Deno.test('seedBook: small-side rule — < BOOK_SEED_SIZE names produces a smaller book (no padding)', () => {
  // 10 names — sides would both want 20; we seed what exists (10 each).
  // But the no-overlap assertion would fire (every name is on both sides
  // because 10 < 2*BOOK_SEED_SIZE). So we instead build 25 names: each
  // side will be 20 by rank, with 15 overlap names → BookOverlapError.
  // Therefore use 40 names (no overlap) but then drop the top-half from
  // the ranking output BEFORE passing to seedBook to simulate "only 20
  // ranked names on one side." Simplest: pass 19 rankings to seedBook
  // directly — both sides get all 19; 19 < BOOK_SEED_SIZE; but overlap.
  //
  // Cleanest small-side test: monkey-construct rankings where short_rank
  // is artificially out-of-range on most rows so the short side seeds
  // < 20. This isolates "seed what exists, don't pad."
  const rankings = [
    { ticker: 'A', long_score: 1.0, short_score: -1.0, long_rank: 1, short_rank: 100, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'B', long_score: 0.9, short_score: -0.9, long_rank: 2, short_rank: 101, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'C', long_score: 0.8, short_score: -0.8, long_rank: 3, short_rank: 102, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'X', long_score: -1.0, short_score: 1.0, long_rank: 200, short_rank: 1, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'Y', long_score: -0.9, short_score: 0.9, long_rank: 201, short_rank: 2, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
  ] as const;
  const book = seedBook(rankings);
  // Long side: only A, B, C qualify (ranks 1,2,3 ≤ 20); short side: only X, Y (ranks 1, 2 ≤ 20).
  const longs = book.filter(b => b.side === 'long');
  const shorts = book.filter(b => b.side === 'short');
  assertEquals(longs.length, 3);
  assertEquals(shorts.length, 2);
  // No padding — the missing slots are simply absent (not sentinel rows).
  assertEquals(longs.map(b => b.ticker), ['A', 'B', 'C']);
  assertEquals(shorts.map(b => b.ticker), ['X', 'Y']);
});

Deno.test('seedBook: BookOverlapError carries the overlapping tickers, sorted', () => {
  // Contrive rankings with TWO overlaps: 'MID1' and 'MID2' on both sides.
  const rankings = [
    { ticker: 'TOP1', long_score: 5.0, short_score: -5.0, long_rank: 1, short_rank: 50, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'MID2', long_score: 1.0, short_score: -1.0, long_rank: 19, short_rank: 19, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'MID1', long_score: 1.1, short_score: -1.1, long_rank: 20, short_rank: 20, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
    { ticker: 'BOT1', long_score: -5.0, short_score: 5.0, long_rank: 99, short_rank: 1, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null },
  ];
  // Pad to fill the top-20 long with non-overlapping tickers so the
  // overlap set is exactly { MID1, MID2 }. (Long side 20 slots; we
  // already have TOP1@1, MID2@19, MID1@20; fill 2..18.)
  for (let i = 2; i <= 18; i++) {
    rankings.push({ ticker: `LONG${i}`, long_score: 5.0 - i * 0.1, short_score: -(5.0 - i * 0.1), long_rank: i, short_rank: 60 + i, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null });
  }
  // Fill short slots 2..18 with non-overlapping tickers.
  for (let i = 2; i <= 18; i++) {
    rankings.push({ ticker: `SHORT${i}`, long_score: -5.0 + i * 0.1, short_score: 5.0 - i * 0.1, long_rank: 200 + i, short_rank: i, ranker_source: RANKER_SOURCE_FALLBACK, gics_sector: null });
  }
  try {
    seedBook(rankings);
    throw new Error('expected BookOverlapError');
  } catch (e) {
    assert(e instanceof BookOverlapError);
    assertEquals(e.overlapping, ['MID1', 'MID2']); // sorted
  }
});

Deno.test('seedBook: empty input → empty book (no throw)', () => {
  const book: BookRow[] = seedBook([]);
  assertEquals(book, []);
});
