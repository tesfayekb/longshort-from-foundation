/**
 * Combiner signal catalog (FP-052 3.0b-i) — the authoritative list of
 * the 9 live signal IDs and the §4.3.5 gate constants the feature
 * assembler consumes.
 *
 * Catalog-not-discovery (F7): the assembler MUST iterate this catalog
 * rather than `SELECT DISTINCT signal_id FROM signal_observations` so
 * (a) a missing observation is correctly classified as "absent" rather
 * than silently dropped from the 16-key vector, and (b) catalog drift
 * between this file and the live signal modules trips
 * `signal-catalog_test.ts` instead of producing a malformed feature
 * vector at runtime.
 *
 * The literals here MUST match the `SIGNAL_ID` exports under
 * `supabase/functions/_shared/longshort-signals/<dir>/`. The catalog
 * drift sentinel test in `signal-catalog_test.ts` locks them as exact
 * strings; do NOT mutate without operator approval + a corresponding
 * signal-module rename.
 *
 * The `EXCLUDED_REASON` literals MUST match the MIG-099
 * `combiner_feature_vectors.excluded_reason` CHECK constraint values
 * verbatim (`'missing_critical_signal_6'`, `'missing_critical_signal_7'`,
 * `'below_coverage_threshold'`). Any drift would surface as a CHECK
 * violation at the §22.5.1 live-smoke step (3.0b-ii).
 *
 * Pure: no I/O, no clock, no randomness — module is a constant table.
 */

/**
 * Signal #6 + Signal #7 — the two CRITICAL signals per CROSSWIND §4.3.5
 * L393. A name missing EITHER is excluded from ranking. Order is locked:
 * #6 (`cross_sectional_momentum_12_1`) precedes #7
 * (`short_term_reversal_1w`) so that when BOTH are absent the assembler
 * emits `missing_critical_signal_6` deterministically (precedence rule
 * confirmed at the FP-052 3.0b-i design pass).
 */
export const SIGNAL_IDS_CRITICAL = [
  'cross_sectional_momentum_12_1',
  'short_term_reversal_1w',
] as const;

/**
 * The 7 NON-CRITICAL signals per CROSSWIND §4.3.5. Order is locked so
 * the emitted `features` jsonb has byte-deterministic key sequence for
 * replay diffing (insertion order = JSON.stringify order in V8/Deno).
 */
export const SIGNAL_IDS_NON_CRITICAL = [
  'analyst_revision_drift',          // Signal #1
  'pead_sue_20d',                    // Signal #2
  'options_flow_imbalance_5d',       // Signal #3
  'insider_transactions_90d',        // Signal #4
  'news_sentiment_7d',               // Signal #5
  'short_interest_change_30d',       // Signal #8
  'active_catalyst_flag',            // Signal #9
] as const;

/** Union of the 9 live signal IDs in the deterministic emission order. */
export const SIGNAL_IDS_ALL = [
  ...SIGNAL_IDS_CRITICAL,
  ...SIGNAL_IDS_NON_CRITICAL,
] as const;

export type CriticalSignalId = typeof SIGNAL_IDS_CRITICAL[number];
export type NonCriticalSignalId = typeof SIGNAL_IDS_NON_CRITICAL[number];
export type SignalId = typeof SIGNAL_IDS_ALL[number];

/**
 * §4.3.5 L402 minimum-coverage floor: at least 3 of 7 non-critical
 * signals must be present (= 5 of 9 with the 2 criticals). Below this
 * floor the name is excluded as `below_coverage_threshold`.
 */
export const MIN_NON_CRITICAL_PRESENT = 3;

/** Total live signal count — locked for the 16-key feature-vector accountancy. */
export const TOTAL_SIGNAL_COUNT = SIGNAL_IDS_ALL.length; // 9

/**
 * Excluded-reason literals — MUST equal the MIG-099
 * `combiner_feature_vectors.excluded_reason` CHECK values verbatim.
 * Catalog-drift sentinel locks these strings in
 * `signal-catalog_test.ts`.
 */
export const EXCLUDED_REASON = {
  MISSING_CRITICAL_6: 'missing_critical_signal_6',
  MISSING_CRITICAL_7: 'missing_critical_signal_7',
  BELOW_COVERAGE: 'below_coverage_threshold',
} as const;

export type ExcludedReason = typeof EXCLUDED_REASON[keyof typeof EXCLUDED_REASON];

/** Feature-key helper — non-critical `<id>__value` key for the typed-absence pair. */
export function nonCriticalValueKey(signalId: NonCriticalSignalId): string {
  return `${signalId}__value`;
}

/** Feature-key helper — non-critical `<id>__is_present` key for the typed-absence pair. */
export function nonCriticalIsPresentKey(signalId: NonCriticalSignalId): string {
  return `${signalId}__is_present`;
}

/**
 * Expected feature-key count — 2 critical (bare numeric) + 7×2 non-critical pairs = 16.
 * Locked by §6.5 (16-feature representation) and by FP-052 item (2).
 */
export const EXPECTED_FEATURE_KEY_COUNT = SIGNAL_IDS_CRITICAL.length + SIGNAL_IDS_NON_CRITICAL.length * 2; // 16