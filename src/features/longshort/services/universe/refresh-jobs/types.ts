/**
 * Quarterly refresh-job types — FP-008 sub-step 8.4 / ACT-108.
 *
 * Per v0.6.2 §22.3 (c) minimum-coupling: types-only module; no runtime
 * dependencies. Consumed by the quarterly-refresh orchestrator and the
 * `longshort-universe-quarterly-refresh` edge function handler.
 *
 * Owner: longshort (FP-008 sub-step 8.4)
 */
import type { UniverseConstituent } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import type { EligibleConstituent } from '../hard-exclusions/types.ts';
import type { ExclusionInputData } from '../hard-exclusions/types.ts';
import type { ConstituentFetcher } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import type { UniverseEnrichmentFetcher } from '../enrichment/types.ts';

/** Per CROSSWIND §3.4 LOCKED: quarterly cadence Jan/Apr/Jul/Oct. */
export type RefreshOutcome = 'completed' | 'failed' | 'partial';

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
}

/**
 * Persistence sink contract — keeps the orchestrator decoupled from
 * supabase-js + RLS specifics. Per §22.5.3 INC-20 precedent: orchestrator is
 * stateless transformation; persistence is a side effect at the boundary.
 */
export interface RefreshLogPersister {
  insertStart(row: RefreshLogStartRow): Promise<{ refresh_id: string }>;
  finalize(refresh_id: string, patch: RefreshLogFinalizePatch): Promise<void>;
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
}

export interface HardExclusionRefreshInput {
  rule: HardExclusionRuleKey;
  /** Eligible universe sourced by the handler. At sub-step 8.5 this is the
   *  POST-body `tickers` array (Surface 0 Option α). At sub-step 8.7 the
   *  handler swaps the source to a `universe_membership` query without
   *  changing the orchestrator signature. */
  tickers: ReadonlyArray<string>;
}