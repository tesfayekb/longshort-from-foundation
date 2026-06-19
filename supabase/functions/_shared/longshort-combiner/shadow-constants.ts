/**
 * Combiner shadow-book constants (FP-052 3.M-ii / ACT-242).
 *
 * Pure-constant module — no I/O, no clock, no randomness. Literals
 * MUST match the MIG-100 CHECK on `combiner_book_shadow.inclusion_rule`
 * and the `combiner_book_shadow.ranker_source` convention (degraded-
 * path attestation distinct from the live `RANKER_SOURCE_FALLBACK`).
 */

/**
 * The three inclusion regimes the shadow harness measures in parallel.
 * MUST equal the MIG-100 `combiner_book_shadow_inclusion_rule_chk` set
 * verbatim — drift trips the DB CHECK at first shadow UPSERT.
 *
 *   gated              — both criticals required AND non-critical
 *                        present count ≥ MIN_NON_CRITICAL_PRESENT.
 *                        Mirrors the live §4.3.5 gate exactly.
 *   criticals_required — both criticals required; coverage floor lifted.
 *   no_gate            — no exclusion; any row with ≥1 present signal.
 */
export const INCLUSION_RULES = ['gated', 'criticals_required', 'no_gate'] as const;
export type InclusionRule = typeof INCLUSION_RULES[number];

/**
 * Degraded-path attestation literal stamped on every shadow row. Held
 * distinct from `RANKER_SOURCE_FALLBACK` so a shadow-vs-live query
 * never confuses the two surfaces (the live `combiner_rankings`
 * partial index already filters on the fallback literal; the shadow
 * tables are physically separate but the literal split is the
 * second layer of defense).
 */
export const RANKER_SOURCE_SHADOW = 'count_normalized_shadow' as const;
