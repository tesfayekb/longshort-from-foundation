/**
 * Universe-component cross-check ReconcileCallSpec builder — FP-008 sub-step 8.8 / ACT-114.
 *
 * Per Surface 3 Option i (operator-locked at pre-flight): cross-check infrastructure
 * lives under `constituent-ingestion/` per DEC-038.1 clause (1) verbatim assignment
 * ("primary source fetcher + secondary source fetcher + cross-check infrastructure").
 *
 * Per Surface 1 Option A (operator-locked): single set-level event per refresh (one
 * reconciliation_events row per quarterly refresh); per-ticker forensics available via
 * divergence jsonb.
 *
 * Per Surface 2 Option γ (operator-locked): jaccard primary thresholds + safety floor
 * (sym-diff ≤ 3 forces false_positive_within_tolerance) + safety ceiling (sym-diff > 100
 * OR either set empty forces system_bug).
 *
 * Per AC-18 (verbatim): "Cross-check invocation uses ReconcileCallSpec... universe-
 * component does NOT directly write reconciliation_events rows." This builder constructs
 * the spec; the orchestrator invokes reconcile() with the spec; reconcile() writes the
 * event row per DEC-038.1 clause (2).
 *
 * Cont-Refresh scope per Surface Cont-Refresh Option (ii) (operator-locked): cross-check
 * fires at quarterly refresh ONLY at this sub-step; continuous-refresh cross-check
 * deferred per DW-068.
 *
 * S6 Option I (operator-locked): call_name = 'universe_cross_check' added to
 * VerifyCallName union; see DW-069 for naming-vs-scope discrepancy.
 *
 * Owner: longshort (FP-008 sub-step 8.8)
 * Classification: financial-critical.
 */

import type {
  ReconcileCallSpec,
  ReconciliationOutcome,
} from '../../../../../../supabase/functions/_shared/longshort-reconciliation-types.ts';

/**
 * Expected set — universe-component's primary source (Polygon) ticker set for the
 * current refresh's as_of_date.
 */
export interface CrossCheckExpected {
  readonly polygon_tickers: ReadonlySet<string>;
}

/**
 * Observed set — secondary source (iShares IVV + IJH) ticker set for cross-check.
 */
export interface CrossCheckObserved {
  readonly ishares_tickers: ReadonlySet<string>;
}

/**
 * Divergence record — aggregate set-comparison metrics; jsonb-serializable per
 * DEC-035 clause (1) replay-test determinism contract.
 */
export interface CrossCheckDivergence extends Record<string, unknown> {
  readonly polygon_set_size: number;
  readonly ishares_set_size: number;
  readonly intersection_size: number;
  readonly polygon_only_count: number;
  readonly ishares_only_count: number;
  readonly symmetric_difference_count: number;
  readonly jaccard_similarity: number;
  /** First 10 tickers in each "only" set for forensic context (jsonb size bounded). */
  readonly polygon_only_sample: ReadonlyArray<string>;
  readonly ishares_only_sample: ReadonlyArray<string>;
}

/**
 * Surface 2 Option γ thresholds — locked at sub-step 8.8 per operator ruling.
 * Calibration may evolve post-Phase 1 production data; threshold updates require
 * supervisor review + supervisor-instructions amendment OR DEC-038 amendment.
 */
export const SURFACE_2_THRESHOLDS = {
  /** Safety floor: ≤3 ticker symmetric difference → false_positive_within_tolerance regardless of jaccard. */
  SAFETY_FLOOR_SYM_DIFF: 3,
  /** Safety ceiling: >100 ticker symmetric difference OR either-set-empty → system_bug. */
  SAFETY_CEILING_SYM_DIFF: 100,
  /** Jaccard primary thresholds (asc-ordered outcome severity). */
  JACCARD_FALSE_POSITIVE: 0.95,
  JACCARD_EXPECTED_DIVERGENCE: 0.90,
  JACCARD_FAILURE_HANDLED: 0.80,
  // < 0.80 → failure_escalated (per Surface 2 Option γ)
} as const;

/**
 * Computes |A ∩ B| / |A ∪ B|. Returns 0 when both sets empty (safe; handled by
 * safety-ceiling branch in classify_outcome via either-set-empty → system_bug).
 *
 * Per v0.6.3 §22.3 (b) idiom-grep: no existing jaccard utility in repo; this is
 * the canonical implementation. Future cross-check applications (e.g., signal-stack
 * source-vs-source comparisons at Phase 2+) MAY extract this to a shared utility;
 * for now it lives co-located with its sole consumer.
 */
export function jaccardSimilarity<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let intersectionSize = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersectionSize += 1;
    }
  }
  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) {
    return 0;
  }
  return intersectionSize / unionSize;
}

/**
 * Builder per the established ReconcileCallSpec pattern (verify_universe_membership
 * precedent at supabase/functions/_shared/longshort-verifiers/verify_universe_membership.ts).
 */
export function buildUniverseCrossCheckSpec(args: {
  operator_id: string;
}): ReconcileCallSpec<CrossCheckExpected, CrossCheckObserved> {
  return {
    call_name: 'universe_cross_check',
    operator_id: args.operator_id,
    symbol: null,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: {
      surface_2_option_gamma: {
        safety_floor_sym_diff: SURFACE_2_THRESHOLDS.SAFETY_FLOOR_SYM_DIFF,
        safety_ceiling_sym_diff: SURFACE_2_THRESHOLDS.SAFETY_CEILING_SYM_DIFF,
        jaccard_false_positive: SURFACE_2_THRESHOLDS.JACCARD_FALSE_POSITIVE,
        jaccard_expected_divergence: SURFACE_2_THRESHOLDS.JACCARD_EXPECTED_DIVERGENCE,
        jaccard_failure_handled: SURFACE_2_THRESHOLDS.JACCARD_FAILURE_HANDLED,
      },
    },

    compute_divergence: (expected, observed): CrossCheckDivergence => {
      const polygonSet = expected.polygon_tickers;
      const isharesSet = observed.ishares_tickers;

      const polygonOnly: string[] = [];
      const isharesOnly: string[] = [];
      let intersectionSize = 0;

      for (const ticker of polygonSet) {
        if (isharesSet.has(ticker)) {
          intersectionSize += 1;
        } else {
          polygonOnly.push(ticker);
        }
      }
      for (const ticker of isharesSet) {
        if (!polygonSet.has(ticker)) {
          isharesOnly.push(ticker);
        }
      }

      const symDiff = polygonOnly.length + isharesOnly.length;
      const unionSize = polygonSet.size + isharesSet.size - intersectionSize;
      const jaccard = unionSize === 0 ? 0 : intersectionSize / unionSize;

      polygonOnly.sort();
      isharesOnly.sort();

      return {
        polygon_set_size: polygonSet.size,
        ishares_set_size: isharesSet.size,
        intersection_size: intersectionSize,
        polygon_only_count: polygonOnly.length,
        ishares_only_count: isharesOnly.length,
        symmetric_difference_count: symDiff,
        jaccard_similarity: jaccard,
        polygon_only_sample: polygonOnly.slice(0, 10),
        ishares_only_sample: isharesOnly.slice(0, 10),
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as CrossCheckDivergence;

      // Safety ceiling — catastrophic-source-failure cases regardless of jaccard.
      if (d.polygon_set_size === 0 || d.ishares_set_size === 0) {
        return 'system_bug';
      }
      if (d.symmetric_difference_count > SURFACE_2_THRESHOLDS.SAFETY_CEILING_SYM_DIFF) {
        return 'system_bug';
      }

      // Safety floor — tiny-divergence cases regardless of jaccard.
      if (d.symmetric_difference_count <= SURFACE_2_THRESHOLDS.SAFETY_FLOOR_SYM_DIFF) {
        return 'false_positive_within_tolerance';
      }

      // Jaccard primary thresholds.
      const j = d.jaccard_similarity;
      if (j >= SURFACE_2_THRESHOLDS.JACCARD_FALSE_POSITIVE) {
        return 'false_positive_within_tolerance';
      }
      if (j >= SURFACE_2_THRESHOLDS.JACCARD_EXPECTED_DIVERGENCE) {
        return 'expected_divergence_handled';
      }
      if (j >= SURFACE_2_THRESHOLDS.JACCARD_FAILURE_HANDLED) {
        return 'failure_handled';
      }
      return 'failure_escalated';
    },

    failure_action: async (ctx) => {
      const d = ctx.divergence as CrossCheckDivergence;
      return {
        action_taken:
          ctx.outcome === 'system_bug'
            ? 'quarterly_refresh_aborted_cross_check_system_bug'
            : 'quarterly_refresh_aborted_cross_check_failure_escalated',
        action_metadata: {
          jaccard_similarity: d.jaccard_similarity,
          symmetric_difference_count: d.symmetric_difference_count,
          polygon_only_sample: d.polygon_only_sample,
          ishares_only_sample: d.ishares_only_sample,
        },
      };
    },
  };
}