/**
 * FP-067 W1 — shap-attribution-writer pure-decomposition test.
 *
 * Locks the R4 invariant: Σ per-signal contributions == composite EXACTLY
 * under the linear fallback (byte-identical to `computeComposite`).
 * Also locks R2: gated-null + absent-non-critical signals MUST NOT
 * appear in the contributions map (typed-nothing, never fabricated 0).
 */

import { assertEquals, assertThrows, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeComposite } from './ranker.ts';
import {
  decomposeFallbackComposite,
  ShapDecompositionInvariantError,
} from './shap-attribution-writer.ts';
import type { FeatureVectorRow } from './feature-assembler.ts';

function makeRow(
  features: Record<string, number | null>,
  gated_signals: string[] | null = null,
): FeatureVectorRow {
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    as_of_date: '2026-07-01',
    ticker: 'TEST',
    features,
    gics_sector: 'Tech',
    coverage_count: 9,
    excluded_reason: null,
    gated_signals,
  };
}

// Fully-present INCLUDED row — every one of the 8 SIGNAL_IDS_FALLBACK_SUM
// entries contributes (2 criticals bare numeric; 6 non-criticals typed-
// absence with is_present=1).
const fullFeatures: Record<string, number | null> = {
  cross_sectional_momentum_12_1: 1.5,
  short_term_reversal_1w: -0.3,
  analyst_revision_drift__value: 0.7, analyst_revision_drift__is_present: 1,
  pead_sue_20d__value: -0.9,          pead_sue_20d__is_present: 1,
  options_flow_imbalance_5d__value: 0.4, options_flow_imbalance_5d__is_present: 1,
  insider_transactions_90d__value: 0.1, insider_transactions_90d__is_present: 1,
  news_sentiment_7d__value: -0.2,     news_sentiment_7d__is_present: 1,
  short_interest_change_30d__value: 0.6, short_interest_change_30d__is_present: 1,
  // catalyst present but excluded by DEC-074 from SIGNAL_IDS_FALLBACK_SUM
  active_catalyst_flag__value: 1, active_catalyst_flag__is_present: 1,
};

Deno.test('R4: Σ contributions === composite (fully-present row)', () => {
  const row = makeRow(fullFeatures);
  const { composite: cShap, contributions } = decomposeFallbackComposite(row);
  const { composite: cRanker } = computeComposite(row);

  const sum = Object.values(contributions).reduce((a, b) => a + b, 0);
  assertEquals(cShap, cRanker, 'decomposition composite must equal ranker composite');
  assertAlmostEquals(sum, cShap, 1e-12, 'Σ contributions must equal composite (linear reconstruction)');
  // 8 present signals (catalyst excluded from fallback sum).
  assertEquals(Object.keys(contributions).length, 8);
});

Deno.test('R2: absent non-critical signal is OMITTED (typed-nothing, no fabricated 0)', () => {
  const feats = { ...fullFeatures };
  feats['news_sentiment_7d__value'] = null;
  feats['news_sentiment_7d__is_present'] = 0;
  const row = makeRow(feats);
  const { contributions } = decomposeFallbackComposite(row);
  assertEquals(
    Object.prototype.hasOwnProperty.call(contributions, 'news_sentiment_7d'),
    false,
    'absent non-critical must NOT appear as a key (no fabricated 0)',
  );
  // 7 remaining present signals.
  assertEquals(Object.keys(contributions).length, 7);

  // Σ still == composite under absence.
  const { composite } = decomposeFallbackComposite(row);
  const sum = Object.values(contributions).reduce((a, b) => a + b, 0);
  assertAlmostEquals(sum, composite, 1e-12);
});

Deno.test('R2/DEC-071 3c: gated-null critical is OMITTED (typed-nothing)', () => {
  const feats = { ...fullFeatures };
  feats['cross_sectional_momentum_12_1'] = null;
  const row = makeRow(feats, ['cross_sectional_momentum_12_1']);
  const { contributions, composite } = decomposeFallbackComposite(row);

  assertEquals(
    Object.prototype.hasOwnProperty.call(contributions, 'cross_sectional_momentum_12_1'),
    false,
    'gated-null critical must NOT appear as a key (no fabricated 0)',
  );

  // Parity with ranker.
  const { composite: cRanker } = computeComposite(row);
  assertEquals(composite, cRanker);
  const sum = Object.values(contributions).reduce((a, b) => a + b, 0);
  assertAlmostEquals(sum, composite, 1e-12);
});

Deno.test('bug-null critical (not in gated_signals) throws — invariant preserved', () => {
  const feats = { ...fullFeatures };
  feats['cross_sectional_momentum_12_1'] = null;
  const row = makeRow(feats, null); // NOT gated
  assertThrows(
    () => decomposeFallbackComposite(row),
    ShapDecompositionInvariantError,
    'critical signal',
  );
});

Deno.test('empty presentCount → composite=0, contributions={} (denominator=1 guard)', () => {
  // All non-criticals absent; both criticals gated-null.
  const feats: Record<string, number | null> = {
    cross_sectional_momentum_12_1: null,
    short_term_reversal_1w: null,
  };
  for (const nc of [
    'analyst_revision_drift','pead_sue_20d','options_flow_imbalance_5d',
    'insider_transactions_90d','news_sentiment_7d','short_interest_change_30d',
  ]) {
    feats[`${nc}__value`] = null;
    feats[`${nc}__is_present`] = 0;
  }
  const row = makeRow(feats, ['cross_sectional_momentum_12_1','short_term_reversal_1w']);
  const { composite, contributions, present_count } = decomposeFallbackComposite(row);
  assertEquals(present_count, 0);
  assertEquals(composite, 0);
  assertEquals(Object.keys(contributions).length, 0);
});