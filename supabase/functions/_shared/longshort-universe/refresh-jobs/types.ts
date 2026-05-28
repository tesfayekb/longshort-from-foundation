/**
 * Quarterly refresh-job types — FP-008 sub-step 8.4 / ACT-108.
 *
 * Per v0.6.2 §22.3 (c) minimum-coupling: types-only module; no runtime
 * dependencies. Consumed by the quarterly-refresh orchestrator and the
 * `longshort-universe-quarterly-refresh` edge function handler.
 *
 * Owner: longshort (FP-008 sub-step 8.4)
 */
import type { UniverseConstituent } from '../../longshort-universe-interfaces.ts';
import type { EligibleConstituent } from '../hard-exclusions/types.ts';
import type { ExclusionInputData } from '../hard-exclusions/types.ts';
import type { ConstituentFetcher } from '../../longshort-universe-interfaces.ts';
import type { UniverseEnrichmentFetcher } from '../enrichment/types.ts';
import type {
  UniverseMembershipPersisterInput,
  HardExclusionsPersisterInput,
} from '../verify-membership/types.ts';
import type { ReconciliationOutcome } from '../../longshort-reconciliation-types.ts';
import type { MetricsEmitter } from '../health-monitoring/metrics-emitter.ts';

/** Per CROSSWIND §3.4 LOCKED: quarterly cadence Jan/Apr/Jul/Oct.
 *  `'circuit_breaker_open'` added in FP-009a: the orchestrator halts before
 *  attempting a refresh when the last N attempts all failed, requiring
 *  manual operator intervention to clear the streak. */
export type RefreshOutcome = 'completed' | 'failed' | 'partial' | 'circuit_breaker_open';

/**
 * Result of a quarterly refresh execution. Persisted to
 * `public.universe_refresh_log` audit table (MIG-048) and returned to the
 * edge-function caller for §11.3 health-monitoring consumption (sub-step 8.9).
 */
export interface RefreshResult {
  /** UUID of the universe_refresh_log row created at orchestrator start. */
  refresh_id: string;
  /** ISO date corresponding to the trading day this refresh executed for. */
  as_of_date: string;
  /** e.g., 'Q2_2026'. Stable label for cross-quarter diagnostics. */
  quarter_label: string;
  /** Atomic outcome per R3 mitigation. */
  outcome: RefreshOutcome;
  /** Raw constituent count from primary fetcher (Polygon) prior to enrichment. */
  total_constituents_raw: number;
  /** Post-§3.2 filter count. */
  total_post_filters: number;
  /** Post-§3.3 hard-exclusion eligibility (long book). */
  total_eligible_long: number;
  /** Post-§3.3 hard-exclusion eligibility (short book). */
  total_eligible_short: number;
  /** Eligible-constituent payload. NOT persisted to universe_membership at this
   *  sub-step (deferred to MIG-050 at 8.6); returned in-memory for tests +
   *  observability. */
  eligible: ReadonlyArray<EligibleConstituent>;
  /** Failure reason populated only when outcome !== 'completed'. */
  failure_reason: string | null;
  /** iShares unenriched cross-check snapshot per Guardrail 2; logged to
   *  universe_refresh_log.ishares_cross_check_snapshot for sub-step 8.8
   *  reconcile() consumption. Does NOT flow into enrichment/filter inputs. */
  ishares_cross_check: ReadonlyArray<UniverseConstituent>;
}

/**
 * Constructor-injected dependencies — testability + replay parity per DEC-035.
 * No top-level singletons; the edge-function handler wires the production
 * fetchers + persister.
 */
export interface RefreshExecutionContext {
  polygonConstituents: ConstituentFetcher;
  iSharesConstituents: ConstituentFetcher;
  polygonEnrichment: UniverseEnrichmentFetcher;
  /** Per-rule input data for §3.3 hard-exclusion pipeline. Wired empty at
   *  sub-step 8.4; rule-specific fetchers stitched in at later sub-steps. */
  exclusionInput: ExclusionInputData;
  /** Persistence sink for `universe_refresh_log` rows. Edge function injects
   *  the supabase-admin-backed implementation; tests inject in-memory stub. */
  refreshLogPersister: RefreshLogPersister;
  /** Persistence sink for `universe_membership` rows — FP-008 sub-step 8.7 /
   *  ACT-113 (Surface 5 Option q two-phase persistence). Quarterly
   *  orchestrator invokes after pipeline success; pipeline failures skip
   *  persistence and finalize the refresh-log row with outcome='failed'. */
  universeMembershipPersister: UniverseMembershipPersister;
  /** Persistence sink for `hard_exclusions` rows — Surface 4 Option b
   *  (orchestrator-internal; consumed by BOTH quarterly + continuous-refresh
   *  orchestrators) + Option c (firing_rules array-union via caller-side
   *  per-ticker grouping). */
  hardExclusionsPersister: HardExclusionsPersister;
  /** Cross-check invocation — FP-008 sub-step 8.8 / ACT-114 (Surface 4
   *  Option a OUTSIDE persistence, step 2b). Builds `ReconcileCallSpec` per
   *  `buildUniverseCrossCheckSpec` and invokes `reconcile()`. Edge function
   *  injects the production wiring; tests inject stubs returning the
   *  outcome under assertion (abort vs proceed path). Per AC-18 verbatim:
   *  universe-component does NOT directly write `reconciliation_events`
   *  rows — `reconcile()` writes via its own supabaseAdmin path. */
  crossCheck: CrossCheckFn;
  /** Optional health-metrics emitter — FP-008 sub-step 8.9 / ACT-115 (Surface 1
   *  Option γ + Surface 3 Option ii). Invoked post-finalize on outcome='completed'
   *  to UPDATE universe_refresh_log with filter_rejection_counts +
   *  hard_exclusion_counts jsonb. Optional for backwards-compat with tests
   *  without emitter; production edge function wires the supabaseAdmin-backed
   *  implementation. Emitter errors do NOT fail the refresh (emission is
   *  observability, not correctness — orchestrator logs + continues). */
  metricsEmitter?: MetricsEmitter;
}

/**
 * Cross-check function signature — FP-008 sub-step 8.8 / ACT-114.
 * Returns ONLY the outcome surface the orchestrator needs to route the
 * abort/proceed decision (per Surface 5 Option q). Full `ReconcileResult`
 * persistence + divergence emission is handled by `reconcile()` internally.
 */
export type CrossCheckFn = (input: {
  readonly operator_id: string;
  readonly polygon_tickers: ReadonlyArray<string>;
  readonly ishares_tickers: ReadonlyArray<string>;
  readonly as_of: Date;
}) => Promise<{ readonly outcome: ReconciliationOutcome }>;

/**
 * Persistence sink contract — keeps the orchestrator decoupled from
 * supabase-js + RLS specifics. Per §22.5.3 INC-20 precedent: orchestrator is
 * stateless transformation; persistence is a side effect at the boundary.
 */
export interface RefreshLogPersister {
  insertStart(row: RefreshLogStartRow): Promise<{ refresh_id: string }>;
  finalize(refresh_id: string, patch: RefreshLogFinalizePatch): Promise<void>;
  /** FP-009a circuit breaker — returns the count of consecutive
   *  `outcome='failed'` rows at the tail of `universe_refresh_log`, capped
   *  at `limit`. Optional for backward compatibility with existing test
   *  stubs; missing implementation is treated as 0 (breaker open never). */
  countConsecutiveFailures?(limit: number): Promise<number>;
}

export interface RefreshLogStartRow {
  operator_id: string;
  refresh_started_at: string;
  as_of_date: string;
  quarter_label: string;
}

export interface RefreshLogFinalizePatch {
  refresh_completed_at: string;
  total_constituents_raw: number;
  total_post_filters: number;
  total_eligible_long: number;
  total_eligible_short: number;
  outcome: RefreshOutcome;
  failure_reason: string | null;
  ishares_cross_check_snapshot: unknown;
}

/**
 * Universe-membership persister contract. Mirrors the public surface of
 * `src/features/longshort/services/universe/refresh-jobs/universe-membership-persister.ts`
 * — kept as a separate interface here so tests can inject an in-memory stub
 * without importing the production module (decoupling per §22.5.3 INC-20
 * orchestrator-stateless-transformation pattern).
 */
export interface UniverseMembershipPersister {
  persist(input: UniverseMembershipPersisterInput): Promise<void>;
}

/**
 * Hard-exclusions persister contract — see types note on
 * `UniverseMembershipPersister`. Per Surface 4 Option b: BOTH quarterly +
 * continuous orchestrators invoke this same contract.
 */
export interface HardExclusionsPersister {
  persist(input: HardExclusionsPersisterInput): Promise<void>;
}

// ============================================================================
// Hard-exclusion refresh-job types — FP-008 sub-step 8.5 / ACT-109.
//
// Merged into this file (sibling to quarterly types) per DEC-038.1 clause (1)
// which enumerates `refresh-jobs/` as the canonical home for BOTH the
// "quarterly atomic job + continuous hard-exclusion job". Reconciliation
// landed in-cycle at ACT-109 after the initial nested placement at
// `hard-exclusions/refresh-jobs/` was identified as a Guardrail 1 violation.
//
// Consumed by the per-rule hard-exclusion refresh orchestrator and the
// `longshort-universe-hard-exclusion-refresh` one-dispatcher edge function
// handler (Surface 1 Option (a) at ACT-109).
// ============================================================================
import type { HardExclusionFiring } from '../hard-exclusions/types.ts';

/**
 * The four §3.3 rules that participate in continuous refresh per
 * DEC-038.1 clause (4). MIG-049 seeds one `job_registry` row per key.
 *
 * NOT in this set per §3.3 spec:
 *   3.3d HTB — pre-trade check at order-execution layer; not continuous refresh.
 *   3.3f / 3.3g / 3.3h — N/A v1.
 */
export type HardExclusionRuleKey = '3.3a' | '3.3b' | '3.3c' | '3.3e';

export const HARD_EXCLUSION_RULE_KEYS: ReadonlyArray<HardExclusionRuleKey> = [
  '3.3a',
  '3.3b',
  '3.3c',
  '3.3e',
];

/**
 * Per-rule outcome of one refresh invocation. `'completed'` indicates the
 * rule logic executed (firings array may be empty); `'skipped'` indicates
 * the rule was not exercised this invocation (e.g., cadence gate did not
 * fire, or universe-membership source not yet wired). `'failed'` reserved
 * for rule-fetcher error paths landing at later sub-steps.
 */
export type HardExclusionRefreshOutcome = 'completed' | 'skipped' | 'failed';

export interface HardExclusionRefreshResult {
  rule: HardExclusionRuleKey;
  as_of: string;
  outcome: HardExclusionRefreshOutcome;
  /** Number of tickers passed to the rule logic. Zero when input universe
   *  is absent (Surface 0 Option α stub-input path at sub-step 8.5). */
  tickers_considered: number;
  /** Firings produced by the rule. Empty until per-rule fetchers wire in. */
  firings: ReadonlyArray<HardExclusionFiring>;
  /** Populated when outcome !== 'completed'. Stable vocabulary:
   *  - 'awaiting_universe_membership_8_6' — body lacked `tickers`; universe
   *    source not yet plumbed.
   *  - 'awaiting_per_rule_fetcher_wiring' — per-rule data-source integration
   *    deferred to subsequent sub-steps.
   *  - 'not_short_interest_trigger_day' — §3.3e cadence gate did not fire
   *    (Option 2α handler-internal twice-monthly gating). */
  skipped_reason: string | null;
}

/**
 * Constructor-injected dependencies for the orchestrator. Per-rule fetchers
 * are NOT wired at sub-step 8.5; the context is intentionally narrow at this
 * sub-step and grows as later sub-steps stitch in `PolygonEarningsCalendarFetcher`
 * (3.3a), corporate-actions polling (3.3b), halt-feed (3.3c, gated by DW-058 B2),
 * and `FinraShortInterestFetcher` (3.3e).
 */
export interface HardExclusionRefreshContext {
  /** Caller-supplied trading-day clock. `as_of.toISOString()` is recorded
   *  in the result + audit metadata. */
  as_of: Date;
  /** Optional hard-exclusions persister — FP-008 sub-step 8.7 / ACT-113
   *  (Surface 4 Option b shared contract). Continuous-refresh handler
   *  wires the supabaseAdmin-backed persister; sub-step 8.5 + 8.7 tests
   *  may omit (orchestrator does NOT yet invoke pending per-rule fetcher
   *  wiring at later sub-steps). */
  hardExclusionsPersister?: HardExclusionsPersister;
}

export interface HardExclusionRefreshInput {
  rule: HardExclusionRuleKey;
  /** Eligible universe sourced by the handler. At sub-step 8.5 this is the
   *  POST-body `tickers` array (Surface 0 Option α). At sub-step 8.7 the
   *  handler swaps the source to a `universe_membership` query without
   *  changing the orchestrator signature. */
  tickers: ReadonlyArray<string>;
}