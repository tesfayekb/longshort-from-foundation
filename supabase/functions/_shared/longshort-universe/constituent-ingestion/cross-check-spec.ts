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
} from '../../longshort-reconciliation-types.ts';

/**
 * Expected set — universe-component's PRIMARY source ticker set for the
 * current refresh's as_of_date. Renamed from `polygon_tickers` to
 * `primary_tickers` at FP-008.2 Step C: the primary source is now the
 * operator-seeded membership table (SeededMembershipFetcher), no longer
 * Polygon's reference endpoint. Field name is source-agnostic so future
 * primary-source swaps do not invalidate the divergence schema.
 */
export interface CrossCheckExpected {
  readonly primary_tickers: ReadonlySet<string>;
}

/**
 * Observed set — SECONDARY cross-check source ticker set. Renamed from
 * `ishares_tickers` to `secondary_tickers` at FP-008.2 Step C: the
 * secondary source is now Wikipedia (WikipediaConstituentFetcher); iShares
 * CSV server-side bot-blocks Deno fetch from Edge Functions.
 */
export interface CrossCheckObserved {
  readonly secondary_tickers: ReadonlySet<string>;
}

/**
 * Divergence record — aggregate set-comparison metrics; jsonb-serializable per
 * DEC-035 clause (1) replay-test determinism contract.
 */
export interface CrossCheckDivergence extends Record<string, unknown> {
  readonly primary_set_size: number;
  readonly secondary_set_size: number;
  readonly intersection_size: number;
  readonly primary_only_count: number;
  readonly secondary_only_count: number;
  readonly symmetric_difference_count: number;
  readonly jaccard_similarity: number;
  /** First 10 tickers in each "only" set for forensic context (jsonb size bounded). */
  readonly primary_only_sample: ReadonlyArray<string>;
  readonly secondary_only_sample: ReadonlyArray<string>;
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
      const primarySet = expected.primary_tickers;
      const secondarySet = observed.secondary_tickers;

      const primaryOnly: string[] = [];
      const secondaryOnly: string[] = [];
      let intersectionSize = 0;

      for (const ticker of primarySet) {
        if (secondarySet.has(ticker)) {
          intersectionSize += 1;
        } else {
          primaryOnly.push(ticker);
        }
      }
      for (const ticker of secondarySet) {
        if (!primarySet.has(ticker)) {
          secondaryOnly.push(ticker);
        }
      }

      const symDiff = primaryOnly.length + secondaryOnly.length;
      const unionSize = primarySet.size + secondarySet.size - intersectionSize;
      const jaccard = unionSize === 0 ? 0 : intersectionSize / unionSize;

      primaryOnly.sort();
      secondaryOnly.sort();

      return {
        primary_set_size: primarySet.size,
        secondary_set_size: secondarySet.size,
        intersection_size: intersectionSize,
        primary_only_count: primaryOnly.length,
        secondary_only_count: secondaryOnly.length,
        symmetric_difference_count: symDiff,
        jaccard_similarity: jaccard,
        primary_only_sample: primaryOnly.slice(0, 10),
        secondary_only_sample: secondaryOnly.slice(0, 10),
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as CrossCheckDivergence;

      // Safety ceiling — catastrophic-source-failure cases regardless of jaccard.
      if (d.primary_set_size === 0 || d.secondary_set_size === 0) {
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
          primary_only_sample: d.primary_only_sample,
          secondary_only_sample: d.secondary_only_sample,
        },
      };
    },
  };
}