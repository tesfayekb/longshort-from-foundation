/**
 * verify-membership local types — DEC-038.1 clause (1) sub-folder.
 *
 * Owner: longshort (FP-008 sub-step 8.7 / ACT-113)
 * Classification: financial-critical (chokepoint consumed by
 * verify_universe_membership + trade-decision pre-checks per DEC-038
 * clause (1) + §11.0.7 #10).
 *
 * Per v0.6.3 §22.3 (c) minimum-coupling: types-only module; re-exports
 * UniverseMembershipStatus from _shared/longshort-broker-interfaces.ts for
 * consumer convenience; declares local types for chokepoint + persister
 * contracts.
 *
 * Surface 3 Option i (operator-locked at ACT-113 pre-flight): typed-absence
 * via `null`-with-narrowing per §2 axiom 3; `Optional.none()` from
 * DEC-038.1 clause (5) is spec-side drift logged as DW-067.
 */
import type { UniverseMembershipStatus } from '../../longshort-broker-interfaces.ts';

/** Re-export for consumer convenience. */
export type { UniverseMembershipStatus };

/**
 * universe_membership row shape — mirrors MIG-050 schema. Used by chokepoint
 * + per-symbol fetcher row reads.
 */
export interface UniverseEligibilityRow {
  readonly operator_id: string;
  readonly ticker: string;
  readonly as_of_date: string;
  readonly long_eligible: boolean;
  readonly short_eligible: boolean;
  readonly quarter_label: string;
  readonly refresh_id: string;
  readonly created_at: string;
}

/**
 * hard_exclusions row shape — mirrors MIG-051 schema. Used by per-symbol
 * fetcher to assemble UniverseMembershipStatus.exclusion_reasons.
 */
export interface HardExclusionRow {
  readonly operator_id: string;
  readonly ticker: string;
  readonly as_of_date: string;
  readonly firing_rules: ReadonlyArray<string>;
  readonly firing_reasons: Record<string, unknown>;
  readonly applied_at: string;
  readonly refresh_id: string | null;
}

/**
 * EligibleUniverse — chokepoint return shape per Surface 2 Option γ bulk tier.
 * Two-book separation enables consumers to query "long-eligible names" or
 * "short-eligible names" independently. Neither-state names absent (MIG-050
 * CHECK constraint enforces).
 */
export interface EligibleUniverse {
  readonly as_of_date: string;
  readonly eligible_long: ReadonlyArray<UniverseEligibilityRow>;
  readonly eligible_short: ReadonlyArray<UniverseEligibilityRow>;
  readonly refresh_id: string;
  readonly quarter_label: string;
}

/** Persister input — universe_membership bulk INSERT (Surface 5 Option q). */
export interface UniverseMembershipPersisterInput {
  readonly operator_id: string;
  readonly as_of_date: string;
  readonly quarter_label: string;
  readonly refresh_id: string;
  readonly rows: ReadonlyArray<{
    readonly ticker: string;
    readonly long_eligible: boolean;
    readonly short_eligible: boolean;
    /**
     * GICS sector per FP-009 Bucket 0 / MIG-063. `null` when the upstream
     * source did not carry sector (typed-absence per §2 axiom 3 + MIG-061 /
     * INC-36 epistemic-honesty).
     */
    readonly gics_sector: string | null;
  }>;
}

/** Persister input — hard_exclusions UPSERT (Surface 4 Option c). */
export interface HardExclusionsPersisterInput {
  readonly operator_id: string;
  readonly as_of_date: string;
  /** NULL for continuous-refresh firings per MIG-051 design. */
  readonly refresh_id: string | null;
  readonly rows: ReadonlyArray<{
    readonly ticker: string;
    readonly firing_rules: ReadonlyArray<string>;
    readonly firing_reasons: Record<string, unknown>;
  }>;
}