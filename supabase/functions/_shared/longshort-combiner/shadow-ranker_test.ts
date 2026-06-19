/**
 * Shadow ranker unit tests — FP-052 3.M-ii / ACT-242.
 *
 * DB-FREE. No Supabase, no Date, no -999, no clock. Tests are Deno
 * (Deno.test + std/assert) — NOT vitest — so Gate 2's deno glob picks
 * them up.
 *
 * Load-bearing tests:
 *   - REGRESSION TIE: identical (ticker, long_rank, short_rank) vs
 *     live `computeRankings` on a fully-gated fixture at
 *     `{ inclusionRule: 'gated', k: 0 }`.
 *   - Criticals-symmetric: no_gate row with ONLY signal #6 present
 *     yields composite = z and DOES NOT throw (the entire point of
 *     the shadow fork).
 */

import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  applyShrinkage,
  computeCompositeShadow,
  computeRankingsShadow,
  passesInclusion,
  seedShadowBook,
  ShadowBookOverlapError,
  type ShadowRankingRow,
} from './shadow-ranker.ts';
import {
  assembleShadowVectors,
  type ShadowObservationInput,
  type ShadowVector,
} from './shadow-assembler.ts';
import { RANKER_SOURCE_SHADOW } from './shadow-constants.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
} from './signal-catalog.ts';
import { computeRankings } from './ranker.ts';
import type { FeatureVectorRow } from './feature-assembler.ts';

/* ───────────────────────── fixture helpers ───────────────────────── */

function vec(
  ticker: string,
  present: Array<[string, number]>,
  gics_sector: string | null = 'TECH',
): ShadowVector {
  const m = new Map<string, number>();
  for (const [k, v] of present) m.set(k, v);
  // deno-lint-ignore no-explicit-any
  return { ticker, gics_sector, present: m as any, presentCount: m.size };
}

/**
 * Build a fully-gated FeatureVectorRow (live shape) AND derive the
 * matching shadow ShadowObservationInput[] from the same source data,
 * so the regression-tie test compares apples to apples.
 */
function fullyGatedPair(
  ticker: string,
  c6: number,
  c7: number,
  nonCriticalsPresent: Array<[typeof SIGNAL_IDS_NON_CRITICAL[number], number]>,
): { live: FeatureVectorRow; shadowObs: ShadowObservationInput[] } {
  const features: Record<string, number | null> = {};
  features[SIGNAL_IDS_CRITICAL[0]] = c6;
  features[SIGNAL_IDS_CRITICAL[1]] = c7;
  const shadowObs: ShadowObservationInput[] = [
    { ticker, signal_id: SIGNAL_IDS_CRITICAL[0], value: c6, is_present: true, gics_sector: 'TECH' },
    { ticker, signal_id: SIGNAL_IDS_CRITICAL[1], value: c7, is_present: true, gics_sector: 'TECH' },
  ];
  const present = new Set(nonCriticalsPresent.map(([id]) => id));
  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    if (present.has(id)) {
      const v = nonCriticalsPresent.find(([k]) => k === id)![1];
      features[nonCriticalValueKey(id)] = v;
      features[nonCriticalIsPresentKey(id)] = 1;
      shadowObs.push({ ticker, signal_id: id, value: v, is_present: true, gics_sector: 'TECH' });
    } else {
      features[nonCriticalValueKey(id)] = null;
      features[nonCriticalIsPresentKey(id)] = 0;
      shadowObs.push({ ticker, signal_id: id, value: null, is_present: false, gics_sector: 'TECH' });
    }
  }
  const live: FeatureVectorRow = {
    operator_id: '00000000-0000-0000-0000-000000000001',
    as_of_date: '2026-06-19',
    ticker,
    features,
    gics_sector: 'TECH',
    coverage_count: 2 + nonCriticalsPresent.length,
    excluded_reason: null,
  };
  return { live, shadowObs };
}

/* ───────────────────────── tests ───────────────────────── */

Deno.test('shadow-ranker: criticals-symmetric — no_gate with ONLY signal #6 present does NOT throw', () => {
  const v = vec('A', [[SIGNAL_IDS_CRITICAL[0], 1.5]]);
  // Must not throw (contrast with live computeComposite which throws).
  const { composite, presentCount } = computeCompositeShadow(v);
  assertEquals(presentCount, 1);
  assertAlmostEquals(composite, 1.5, 1e-12);
  const ranks = computeRankingsShadow([v], { inclusionRule: 'no_gate', k: 0 });
  assertEquals(ranks.length, 1);
  assertEquals(ranks[0].long_rank, 1);
  assertEquals(ranks[0].short_rank, 1);
});

Deno.test('shadow-ranker: composite iterates SIGNAL_IDS_ALL in catalog order (determinism)', () => {
  // Two semantically-identical vectors built with different insertion
  // orders into the `present` Map — composite must be byte-identical.
  const a = vec('A', [
    [SIGNAL_IDS_CRITICAL[0], 0.1],
    [SIGNAL_IDS_NON_CRITICAL[0], 0.2],
    [SIGNAL_IDS_CRITICAL[1], 0.3],
  ]);
  const b = vec('A', [
    [SIGNAL_IDS_NON_CRITICAL[0], 0.2],
    [SIGNAL_IDS_CRITICAL[1], 0.3],
    [SIGNAL_IDS_CRITICAL[0], 0.1],
  ]);
  assertEquals(computeCompositeShadow(a).composite, computeCompositeShadow(b).composite);
});

Deno.test('shadow-ranker: is_present-guard contract — assembler never lets null reach composite', () => {
  const rows: ShadowObservationInput[] = [
    { ticker: 'A', signal_id: SIGNAL_IDS_CRITICAL[0], value: 1.0, is_present: true, gics_sector: 'X' },
    { ticker: 'A', signal_id: SIGNAL_IDS_CRITICAL[1], value: null, is_present: false, gics_sector: 'X' },
  ];
  const v = assembleShadowVectors(rows)[0];
  const { composite, presentCount } = computeCompositeShadow(v);
  assertEquals(presentCount, 1);
  assertAlmostEquals(composite, 1.0, 1e-12);
  assert(Number.isFinite(composite));
});

Deno.test('shadow-ranker: shrinkage math hand-verified — composite=1, n=4, k=3 ⇒ 0.5714…', () => {
  const adj = applyShrinkage(1.0, 4, 3);
  assertAlmostEquals(adj, 4 / 7, 1e-12);
  // k=0 ⇒ identity.
  assertEquals(applyShrinkage(0.42, 9, 0), 0.42);
});

Deno.test('shadow-ranker: inclusion rules filter exactly per regime', () => {
  // (a) 1-signal row (only #6).
  const oneSig = vec('A', [[SIGNAL_IDS_CRITICAL[0], 1.0]]);
  assertEquals(passesInclusion(oneSig, 'no_gate'), true);
  assertEquals(passesInclusion(oneSig, 'criticals_required'), false);
  assertEquals(passesInclusion(oneSig, 'gated'), false);

  // (b) both criticals + 0 non-critical.
  const bothCrit = vec('A', [
    [SIGNAL_IDS_CRITICAL[0], 1.0],
    [SIGNAL_IDS_CRITICAL[1], 1.0],
  ]);
  assertEquals(passesInclusion(bothCrit, 'no_gate'), true);
  assertEquals(passesInclusion(bothCrit, 'criticals_required'), true);
  assertEquals(passesInclusion(bothCrit, 'gated'), false); // floor not met

  // (c) both criticals + 3 non-critical (gate floor met).
  const gated = vec('A', [
    [SIGNAL_IDS_CRITICAL[0], 1.0],
    [SIGNAL_IDS_CRITICAL[1], 1.0],
    [SIGNAL_IDS_NON_CRITICAL[0], 1.0],
    [SIGNAL_IDS_NON_CRITICAL[1], 1.0],
    [SIGNAL_IDS_NON_CRITICAL[2], 1.0],
  ]);
  assertEquals(passesInclusion(gated, 'no_gate'), true);
  assertEquals(passesInclusion(gated, 'criticals_required'), true);
  assertEquals(passesInclusion(gated, 'gated'), true);

  // (d) zero present → fails every rule.
  const empty = vec('A', []);
  assertEquals(passesInclusion(empty, 'no_gate'), false);
  assertEquals(passesInclusion(empty, 'criticals_required'), false);
  assertEquals(passesInclusion(empty, 'gated'), false);
});

Deno.test('shadow-ranker: ticker-ASC tiebreak on equal adjusted', () => {
  const vs: ShadowVector[] = [
    vec('BBB', [[SIGNAL_IDS_CRITICAL[0], 1.0]]),
    vec('AAA', [[SIGNAL_IDS_CRITICAL[0], 1.0]]),
    vec('CCC', [[SIGNAL_IDS_CRITICAL[0], 1.0]]),
  ];
  const ranks = computeRankingsShadow(vs, { inclusionRule: 'no_gate', k: 0 });
  // All composites equal → long: AAA=1, BBB=2, CCC=3; short: AAA=1, BBB=2, CCC=3.
  const byTicker = new Map(ranks.map((r) => [r.ticker, r]));
  assertEquals(byTicker.get('AAA')!.long_rank, 1);
  assertEquals(byTicker.get('BBB')!.long_rank, 2);
  assertEquals(byTicker.get('CCC')!.long_rank, 3);
  assertEquals(byTicker.get('AAA')!.short_rank, 1);
  assertEquals(byTicker.get('BBB')!.short_rank, 2);
  assertEquals(byTicker.get('CCC')!.short_rank, 3);
});

Deno.test('shadow-ranker: REGRESSION TIE — identical ranks vs live computeRankings on fully-gated input (gated, k=0)', () => {
  // 5 fully-gated tickers with varied composites → exercises both long
  // and short rank orderings.
  const fixtures = [
    fullyGatedPair('AAPL',  1.5, -0.3, [
      [SIGNAL_IDS_NON_CRITICAL[0], 0.1],
      [SIGNAL_IDS_NON_CRITICAL[1], 0.2],
      [SIGNAL_IDS_NON_CRITICAL[2], 0.3],
    ]),
    fullyGatedPair('MSFT',  0.5,  0.4, [
      [SIGNAL_IDS_NON_CRITICAL[0], -0.1],
      [SIGNAL_IDS_NON_CRITICAL[1], -0.2],
      [SIGNAL_IDS_NON_CRITICAL[3], 0.5],
    ]),
    fullyGatedPair('NVDA',  2.1,  1.7, [
      [SIGNAL_IDS_NON_CRITICAL[0], 1.0],
      [SIGNAL_IDS_NON_CRITICAL[1], 1.0],
      [SIGNAL_IDS_NON_CRITICAL[2], 1.0],
      [SIGNAL_IDS_NON_CRITICAL[3], 1.0],
    ]),
    fullyGatedPair('TSLA', -1.2, -0.8, [
      [SIGNAL_IDS_NON_CRITICAL[2], -0.5],
      [SIGNAL_IDS_NON_CRITICAL[3], -0.6],
      [SIGNAL_IDS_NON_CRITICAL[4], -0.7],
    ]),
    fullyGatedPair('AMZN',  0.0,  0.0, [
      [SIGNAL_IDS_NON_CRITICAL[0], 0.0],
      [SIGNAL_IDS_NON_CRITICAL[1], 0.0],
      [SIGNAL_IDS_NON_CRITICAL[2], 0.0],
    ]),
  ];

  const liveRows = fixtures.map((f) => f.live);
  const allShadowObs = fixtures.flatMap((f) => f.shadowObs);

  const liveRanks = computeRankings(liveRows);
  const shadowVectors = assembleShadowVectors(allShadowObs);
  const shadowRanks = computeRankingsShadow(shadowVectors, { inclusionRule: 'gated', k: 0 });

  // Same set of tickers.
  assertEquals(shadowRanks.length, liveRanks.length);

  // Index by ticker on both sides and assert (long_rank, short_rank) equality.
  const liveByTicker = new Map(liveRanks.map((r) => [r.ticker, r]));
  for (const s of shadowRanks) {
    const l = liveByTicker.get(s.ticker);
    assert(l !== undefined, `regression-tie: ticker ${s.ticker} missing from live ranks`);
    assertEquals(
      [s.ticker, s.long_rank, s.short_rank],
      [l.ticker, l.long_rank, l.short_rank],
      `regression-tie drift on ${s.ticker}: shadow=(${s.long_rank},${s.short_rank}) live=(${l.long_rank},${l.short_rank})`,
    );
    // adjusted at k=0 must equal live composite (= live long_score).
    assertAlmostEquals(s.adjusted, l.long_score, 1e-12, `adjusted/composite drift on ${s.ticker}`);
  }
});

Deno.test('shadow-ranker: seedShadowBook stamps RANKER_SOURCE_SHADOW + throws on overlap', () => {
  // 3 names, size=2 — top-2 long, top-2 short.
  const ranked: ShadowRankingRow[] = [
    { ticker: 'A', adjusted: 2.0, composite: 2.0, presentCount: 5, long_rank: 1, short_rank: 3, gics_sector: null },
    { ticker: 'B', adjusted: 1.0, composite: 1.0, presentCount: 5, long_rank: 2, short_rank: 2, gics_sector: null },
    { ticker: 'C', adjusted: 0.0, composite: 0.0, presentCount: 5, long_rank: 3, short_rank: 1, gics_sector: null },
  ];
  const book = seedShadowBook(ranked, 2);
  assertEquals(book.length, 4);
  for (const r of book) assertEquals(r.ranker_source, RANKER_SOURCE_SHADOW);

  // Overlap-triggering fixture: A is rank 1 on BOTH sides.
  const overlapping: ShadowRankingRow[] = [
    { ticker: 'A', adjusted: 2.0, composite: 2.0, presentCount: 5, long_rank: 1, short_rank: 1, gics_sector: null },
    { ticker: 'B', adjusted: 1.0, composite: 1.0, presentCount: 5, long_rank: 2, short_rank: 2, gics_sector: null },
  ];
  assertThrows(() => seedShadowBook(overlapping, 2), ShadowBookOverlapError);
});
