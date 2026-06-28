/**
 * Catalog-drift sentinel — FP-052 3.0b-i (signal-catalog).
 *
 * Locks the 9 live signal_id literals + the 3 excluded_reason literals
 * as exact strings. Any divergence between this catalog and the live
 * signal modules' `SIGNAL_ID` exports (or the MIG-099
 * `combiner_feature_vectors.excluded_reason` CHECK constraint) trips
 * this test rather than producing a malformed feature vector or a
 * CHECK violation at the §22.5.1 live smoke.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EXCLUDED_REASON,
  EXPECTED_FEATURE_KEY_COUNT,
  MIN_NON_CRITICAL_PRESENT,
  REGIME_FEATURE_COUNT,
  SIGNAL_IDS_ALL,
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_FALLBACK_SUM,
  SIGNAL_IDS_NON_CRITICAL,
  TOTAL_SIGNAL_COUNT,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
} from './signal-catalog.ts';

Deno.test('catalog: critical signal IDs are exactly [#6, #7] in precedence order', () => {
  assertEquals(SIGNAL_IDS_CRITICAL.length, 2);
  assertEquals(SIGNAL_IDS_CRITICAL[0], 'cross_sectional_momentum_12_1');
  assertEquals(SIGNAL_IDS_CRITICAL[1], 'short_term_reversal_1w');
});

Deno.test('catalog: non-critical signal IDs are the 7 live literals in stable order', () => {
  assertEquals(SIGNAL_IDS_NON_CRITICAL.length, 7);
  assertEquals(SIGNAL_IDS_NON_CRITICAL[0], 'analyst_revision_drift');
  assertEquals(SIGNAL_IDS_NON_CRITICAL[1], 'pead_sue_20d');
  assertEquals(SIGNAL_IDS_NON_CRITICAL[2], 'options_flow_imbalance_5d');
  assertEquals(SIGNAL_IDS_NON_CRITICAL[3], 'insider_transactions_90d');
  assertEquals(SIGNAL_IDS_NON_CRITICAL[4], 'news_sentiment_7d');
  assertEquals(SIGNAL_IDS_NON_CRITICAL[5], 'short_interest_change_30d');
  assertEquals(SIGNAL_IDS_NON_CRITICAL[6], 'active_catalyst_flag');
});

Deno.test('catalog: total signal count is 9 and ALL = critical ++ non-critical', () => {
  assertEquals(TOTAL_SIGNAL_COUNT, 9);
  assertEquals(SIGNAL_IDS_ALL.length, 9);
  assertEquals(
    [...SIGNAL_IDS_ALL],
    [...SIGNAL_IDS_CRITICAL, ...SIGNAL_IDS_NON_CRITICAL],
  );
});

Deno.test('catalog: no duplicate signal IDs', () => {
  const set = new Set(SIGNAL_IDS_ALL);
  assertEquals(set.size, SIGNAL_IDS_ALL.length);
});

Deno.test('catalog: MIN_NON_CRITICAL_PRESENT = 3 (§4.3.5 L402 5-of-9 floor)', () => {
  assertEquals(MIN_NON_CRITICAL_PRESENT, 3);
});

Deno.test('catalog: REGIME_FEATURE_COUNT = 2 (DEC-066 §6.5.1.1 market-level)', () => {
  assertEquals(REGIME_FEATURE_COUNT, 2);
});

Deno.test('catalog: EXPECTED_FEATURE_KEY_COUNT = 18 (2 critical + 7×2 non-critical + 2 market-level)', () => {
  assertEquals(EXPECTED_FEATURE_KEY_COUNT, 18);
});

Deno.test('catalog: excluded-reason literals match MIG-099 CHECK values verbatim', () => {
  assertEquals(EXCLUDED_REASON.MISSING_CRITICAL_6, 'missing_critical_signal_6');
  assertEquals(EXCLUDED_REASON.MISSING_CRITICAL_7, 'missing_critical_signal_7');
  assertEquals(EXCLUDED_REASON.BELOW_COVERAGE, 'below_coverage_threshold');
});

Deno.test('catalog: feature-key helpers emit `<id>__value` / `<id>__is_present`', () => {
  assertEquals(nonCriticalValueKey('analyst_revision_drift'), 'analyst_revision_drift__value');
  assertEquals(nonCriticalIsPresentKey('analyst_revision_drift'), 'analyst_revision_drift__is_present');
});

// ── DEC-074 fallback-sum-set drift sentinel ───────────────────────────

Deno.test('DEC-074: SIGNAL_IDS_FALLBACK_SUM = SIGNAL_IDS_ALL minus active_catalyst_flag, order-preserved', () => {
  // 8 entries: 2 criticals + 6 non-criticals (catalyst excised).
  assertEquals(SIGNAL_IDS_FALLBACK_SUM.length, 8);
  // Catalyst MUST NOT appear in the fallback sum set.
  assertEquals(SIGNAL_IDS_FALLBACK_SUM.includes('active_catalyst_flag' as never), false);
  // Every other signal MUST appear, in the SAME relative order as SIGNAL_IDS_ALL.
  const expected = SIGNAL_IDS_ALL.filter((id) => id !== 'active_catalyst_flag');
  assertEquals([...SIGNAL_IDS_FALLBACK_SUM], expected);
});

Deno.test('DEC-074: catalyst REMAINS in SIGNAL_IDS_ALL (feature surface intact for trained combiner)', () => {
  // Catalyst is excluded only from the fallback SUM, not from the
  // catalog / feature-vector / persistence path. Trained-combiner
  // (FP-058) consumes SIGNAL_IDS_ALL via the assembler and MUST still
  // see catalyst as a feature.
  assertEquals(SIGNAL_IDS_ALL.includes('active_catalyst_flag'), true);
  assertEquals(SIGNAL_IDS_NON_CRITICAL.includes('active_catalyst_flag'), true);
  assertEquals(TOTAL_SIGNAL_COUNT, 9);
  assertEquals(EXPECTED_FEATURE_KEY_COUNT, 18);
});