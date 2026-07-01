/**
 * rebalance-outcome-classify — DW-208 Fix 2 (§9 phantom-success elimination).
 *
 * Derives an `outcome_class` label from the RebalanceSubmitResponse's
 * `refusal` + `submission_counts`, so a `longshort.rebalance.completed`
 * audit event can never conflate a refused run with a healthy no-op or
 * a submitting run. Additive audit-metadata only — behaviour of the
 * planner/orchestrator is UNCHANGED.
 *
 * Classes:
 *   - `refused_<reason>` — result.refusal populated (e.g. `refused_rankings_stale`).
 *   - `submitted`        — no refusal AND any submission_counts value > 0.
 *   - `no_op`            — no refusal AND every submission_counts value === 0
 *                          (a legitimate rebalance that planned + had nothing to do).
 *
 * Cross-ref: DW-208 / DW-208-ADD-01 (root cause); DW-208-ADD-03 (this Fix 2);
 * rebalance-submit-orchestrator.ts `RebalanceSubmitResponse.refusal` (:107-112)
 * and `.submission_counts` (:97).
 */

export type RebalanceOutcomeClass =
  | `refused_${string}`
  | 'submitted'
  | 'no_op';

export interface OutcomeClassifiableResult {
  refusal?: { reason: string; [k: string]: unknown } | undefined;
  submission_counts: Record<string, number>;
}

export function classifyRebalanceOutcome(
  result: OutcomeClassifiableResult,
): RebalanceOutcomeClass {
  if (result.refusal) {
    return `refused_${result.refusal.reason}` as RebalanceOutcomeClass;
  }
  const counts = result.submission_counts ?? {};
  const anyNonZero = Object.values(counts).some((n) => (n ?? 0) > 0);
  return anyNonZero ? 'submitted' : 'no_op';
}