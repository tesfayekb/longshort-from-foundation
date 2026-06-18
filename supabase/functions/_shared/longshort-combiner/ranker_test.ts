/**
 * Ranker unit tests — FP-052 (3.0c-i / ACT-238).
 *
 * DB-FREE. Exercises the pure `computeRankings` + `computeComposite`
 * arithmetic, the rank tiebreak contract, the no-overlap precondition
 * the book seeder depends on, the `ranker_source` literal stamp, the
 * `gics_sector` passthrough (incl. null), and the determinism contract
 * (two runs over the same input produce byte-identical JSON).
 *
 * NO Supabase / NO Date / NO `-999` / NO clock.
 */

import { assert, assertEquals, assertThrows, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeRankings,
  computeComposite,
  IncludedRowInvariantError,
  type RankingRow,
} from './ranker.ts';
import { RANKER_SOURCE_FALLBACK, BOOK_SEED_SIZE } from './ranker-constants.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
} from './signal-catalog.ts';
import type { FeatureVectorRow } from './feature-assembler.ts';

/**
 * Build a typed-absence FeatureVectorRow for tests.
 *
 * @param ticker      ticker symbol
 * @param criticals   the 2 critical z-scores (order = SIGNAL_IDS_CRITICAL)
 * @param noncritical map non-critical-id → value | 'absent'
 * @param gics_sector sector string or null
 */
function makeIncludedRow(
  ticker: string,
  criticals: [number, number],
  noncritical: Partial<Record<typeof SIGNAL_IDS_NON_CRITICAL[number], number | 'absent'>>,
  gics_sector: string | null = 'TECH',
): FeatureVectorRow {
  const features: Record<string, number | null> = {};
  features[SIGNAL_IDS_CRITICAL[0]] = criticals[0];
  features[SIGNAL_IDS_CRITICAL[1]] = criticals[1];
  let coverageCount = 2;
  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    const v = noncritical[id];
    if (v === undefined || v === 'absent') {
      features[nonCriticalValueKey(id)] = null;
      features[nonCriticalIsPresentKey(id)] = 0;
    } else {
      features[nonCriticalValueKey(id)] = v;
      features[nonCriticalIsPresentKey(id)] = 1;
      coverageCount += 1;
    }
  }
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    as_of_date: '2026-06-16',
    ticker,
    features,
    gics_sector,
    coverage_count: coverageCount,
    excluded_reason: null,
  };
}

Deno.test('computeComposite: hand-verified — 2 criticals + 3 non-criticals, all z=1.0', () => {
  const row = makeIncludedRow('AAA', [1.0, 1.0], {
    analyst_revision_drift: 1.0,
    pead_sue_20d: 1.0,
    options_flow_imbalance_5d: 1.0,
  });
  const { composite, presentCount } = computeComposite(row);
  assertEquals(presentCount, 5);
  assertAlmostEquals(composite, 1.0, 1e-12);
});

Deno.test('computeComposite: minimum-coverage row (2 criticals + exactly 3 non-criticals) → composite = sum / 5', () => {
  const row = makeIncludedRow('BBB', [0.5, -0.5], {
    analyst_revision_drift: 2.0,
    pead_sue_20d: -1.0,
    options_flow_imbalance_5d: 0.5,
  });
  const { composite, presentCount } = computeComposite(row);
  assertEquals(presentCount, 5);
  // numerator = 0.5 + (-0.5) + 2.0 + (-1.0) + 0.5 = 1.5; / 5 = 0.3
  assertAlmostEquals(composite, 0.3, 1e-12);
});

Deno.test('computeComposite: full coverage (all 9 signals present) → composite = sum / 9', () => {
  const row = makeIncludedRow('CCC', [1.0, 1.0], {
    analyst_revision_drift: 1.0,
    pead_sue_20d: 1.0,
    options_flow_imbalance_5d: 1.0,
    insider_transactions_90d: 1.0,
    news_sentiment_7d: 1.0,
    short_interest_change_30d: 1.0,
    active_catalyst_flag: 1.0,
  });
  const { composite, presentCount } = computeComposite(row);
  assertEquals(presentCount, 9);
  assertAlmostEquals(composite, 1.0, 1e-12);
});

Deno.test('computeComposite: typed-absence — value=null + is_present=0 is correctly skipped (never coerced to 0 in arithmetic)', () => {
  // Build row with 2 criticals at 3.0, and non-criticals: 3 present at 3.0,
  // 4 absent (value=null, is_present=0). composite = (2*3 + 3*3) / 5 = 3.0.
  const row = makeIncludedRow('DDD', [3.0, 3.0], {
    analyst_revision_drift: 3.0,
    pead_sue_20d: 3.0,
    options_flow_imbalance_5d: 3.0,
  });
  // Sanity: the absent halves are literal null in the vector
  assertEquals(row.features[nonCriticalValueKey('insider_transactions_90d')], null);
  assertEquals(row.features[nonCriticalIsPresentKey('insider_transactions_90d')], 0);
  const { composite, presentCount } = computeComposite(row);
  assertEquals(presentCount, 5);
  assertAlmostEquals(composite, 3.0, 1e-12);
});

Deno.test('computeComposite: throws if caller passes an excluded row', () => {
  const row = makeIncludedRow('EEE', [1.0, 1.0], { analyst_revision_drift: 1.0 });
  const bad: FeatureVectorRow = { ...row, excluded_reason: 'below_coverage_threshold' };
  assertThrows(() => computeComposite(bad), IncludedRowInvariantError);
});

Deno.test('computeComposite: throws if critical is NaN / missing / non-finite', () => {
  const row = makeIncludedRow('FFF', [1.0, 1.0], { analyst_revision_drift: 1.0, pead_sue_20d: 1.0, options_flow_imbalance_5d: 1.0 });
  const bad: FeatureVectorRow = { ...row, features: { ...row.features, [SIGNAL_IDS_CRITICAL[0]]: NaN } };
  assertThrows(() => computeComposite(bad), IncludedRowInvariantError);
});

Deno.test('computeComposite: throws if non-critical is_present=1 but value is null (typed-absence contract broken)', () => {
  const row = makeIncludedRow('GGG', [1.0, 1.0], { analyst_revision_drift: 1.0, pead_sue_20d: 1.0, options_flow_imbalance_5d: 1.0 });
  const bad: FeatureVectorRow = {
    ...row,
    features: { ...row.features, [nonCriticalValueKey('analyst_revision_drift')]: null },
  };
  assertThrows(() => computeComposite(bad), IncludedRowInvariantError);
});

Deno.test('computeRankings: long_score = composite, short_score = -composite; ranker_source literal stamped', () => {
  const rows = [
    makeIncludedRow('AAA', [2.0, 2.0], { analyst_revision_drift: 2.0, pead_sue_20d: 2.0, options_flow_imbalance_5d: 2.0 }),
    makeIncludedRow('BBB', [-1.0, -1.0], { analyst_revision_drift: -1.0, pead_sue_20d: -1.0, options_flow_imbalance_5d: -1.0 }),
  ];
  const out = computeRankings(rows);
  assertEquals(out.length, 2);
  for (const r of out) {
    assertEquals(r.ranker_source, RANKER_SOURCE_FALLBACK);
    assertEquals(r.ranker_source, 'count_normalized_fallback'); // partial-index literal
    assertEquals(r.short_score, -r.long_score);
  }
  // AAA top long, BBB top short
  const aaa = out.find(r => r.ticker === 'AAA')!;
  const bbb = out.find(r => r.ticker === 'BBB')!;
  assertEquals(aaa.long_rank, 1);
  assertEquals(aaa.short_rank, 2);
  assertEquals(bbb.long_rank, 2);
  assertEquals(bbb.short_rank, 1);
});

Deno.test('computeRankings: tie at the rank-20 boundary — one crosses by ticker-ASC, one does not', () => {
  // 21 names. 19 names with distinct strictly-positive composites + 2 tied
  // at the boundary (one crosses into top-20 by ticker-ASC, one stays out).
  const rows: FeatureVectorRow[] = [];
  // High composites for 19 names (T00..T18) — composite scales by index.
  for (let i = 0; i < 19; i++) {
    const c = 10.0 - i * 0.5; // 10.0, 9.5, 9.0, ... > 1.0
    rows.push(makeIncludedRow(`T${String(i).padStart(2, '0')}`, [c / 2, c / 2], { analyst_revision_drift: c / 5, pead_sue_20d: c / 5, options_flow_imbalance_5d: c / 5 }));
  }
  // Two tied at composite = 0.5: 'TIEA' (lex-smaller) and 'TIEB' (lex-larger).
  rows.push(makeIncludedRow('TIEA', [0.25, 0.25], { analyst_revision_drift: 0.25, pead_sue_20d: 0.25, options_flow_imbalance_5d: 0.25 }));
  rows.push(makeIncludedRow('TIEB', [0.25, 0.25], { analyst_revision_drift: 0.25, pead_sue_20d: 0.25, options_flow_imbalance_5d: 0.25 }));

  const out = computeRankings(rows);
  const byTicker = new Map(out.map(r => [r.ticker, r]));
  // T18 (lowest of the 19 distinct) should be rank 19; TIEA → 20; TIEB → 21
  assertEquals(byTicker.get('T18')!.long_rank, 19);
  assertEquals(byTicker.get('TIEA')!.long_rank, 20, 'lex-smaller breaks the tie INTO top-20');
  assertEquals(byTicker.get('TIEB')!.long_rank, 21, 'lex-larger stays out');
  // TIEA crosses into the top-`BOOK_SEED_SIZE`; TIEB does not.
  assert(byTicker.get('TIEA')!.long_rank <= BOOK_SEED_SIZE);
  assert(byTicker.get('TIEB')!.long_rank > BOOK_SEED_SIZE);
});

Deno.test('computeRankings: ranks form a permutation of 1..N for both long and short', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 40; i++) {
    rows.push(makeIncludedRow(`X${String(i).padStart(2, '0')}`, [i * 0.1, i * 0.1], { analyst_revision_drift: i * 0.05, pead_sue_20d: i * 0.05, options_flow_imbalance_5d: i * 0.05 }));
  }
  const out = computeRankings(rows);
  const longRanks = out.map(r => r.long_rank).sort((a, b) => a - b);
  const shortRanks = out.map(r => r.short_rank).sort((a, b) => a - b);
  for (let i = 0; i < 40; i++) {
    assertEquals(longRanks[i], i + 1);
    assertEquals(shortRanks[i], i + 1);
  }
});

Deno.test('computeRankings: gics_sector passthrough — string AND null preserved verbatim', () => {
  const rows = [
    makeIncludedRow('AAA', [1.0, 1.0], { analyst_revision_drift: 1.0, pead_sue_20d: 1.0, options_flow_imbalance_5d: 1.0 }, 'Information Technology'),
    makeIncludedRow('BBB', [1.0, 1.0], { analyst_revision_drift: 1.0, pead_sue_20d: 1.0, options_flow_imbalance_5d: 1.0 }, null),
  ];
  const out = computeRankings(rows);
  const byTicker = new Map(out.map(r => [r.ticker, r]));
  assertEquals(byTicker.get('AAA')!.gics_sector, 'Information Technology');
  assertEquals(byTicker.get('BBB')!.gics_sector, null);
});

Deno.test('computeRankings: determinism — two runs produce byte-identical JSON', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 140; i++) {
    rows.push(makeIncludedRow(`D${String(i).padStart(3, '0')}`, [Math.sin(i) * 0.7, Math.cos(i) * 0.3], {
      analyst_revision_drift: Math.sin(i + 1) * 0.2,
      pead_sue_20d: Math.cos(i + 2) * 0.1,
      options_flow_imbalance_5d: Math.sin(i + 3) * 0.4,
    }));
  }
  const a: RankingRow[] = computeRankings(rows);
  const b: RankingRow[] = computeRankings(rows);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test('computeRankings: 140-name universe → 140 emitted rows with valid 1..140 long+short ranks', () => {
  const rows: FeatureVectorRow[] = [];
  for (let i = 0; i < 140; i++) {
    rows.push(makeIncludedRow(`U${String(i).padStart(3, '0')}`, [i * 0.01, -i * 0.01], { analyst_revision_drift: 0.5, pead_sue_20d: 0.5, options_flow_imbalance_5d: 0.5 }));
  }
  const out = computeRankings(rows);
  assertEquals(out.length, 140);
  const maxLong = Math.max(...out.map(r => r.long_rank));
  const maxShort = Math.max(...out.map(r => r.short_rank));
  assertEquals(maxLong, 140);
  assertEquals(maxShort, 140);
});
