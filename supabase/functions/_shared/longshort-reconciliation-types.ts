/**
 * longshort-reconciliation-types — TypeScript type definitions for reconciliation engine.
 *
 * Owner: longshort (sub-step 6.2)
 *
 * These types MUST stay in lockstep with MIG-042 (longshort_reconciliation_state) and
 * MIG-043 (reconciliation_events) schemas. Schema drift is a §22.5 DRIFT class defect.
 *
 * The 17 verify_* call names per CROSSWIND §11.0.7 are encoded as a string literal union;
 * sub-step 6.3a/b/c/d implementations import this type and exhaustive-switch over it.
 */

/**
 * Canonical 17 verify_* call names per CROSSWIND §11.0.7 (verbatim ordering)
 * PLUS non-verify_* reconcile() call identifiers per FP-008 sub-step 8.8 / S6 Option I.
 *
 * Type-name vs scope discrepancy logged as DW-069: this union now includes a
 * non-verify_* identifier (`'universe_cross_check'`). Rename to `ReconcileCallName`
 * is the natural future-cleanup target but deferred per S6 Option I scope-discipline
 * (Option II rename touches 17+ verify_* implementations; out of 8.8 scope).
 */
export type VerifyCallName =
  | 'verify_position'              // #1
  | 'verify_quote'                 // #2
  | 'verify_quote_freshness'       // #3
  | 'verify_short_availability'    // #4
  | 'verify_ssr_status'            // #5 — tri-state
  | 'verify_halt_status'           // #6
  | 'verify_borrow_rate'           // #7
  | 'verify_borrow_persistence'    // #8 — expected-divergence-aware
  | 'verify_buying_power'          // #9
  | 'verify_universe_membership'   // #10
  | 'verify_corporate_action_clean'// #11 — expected-divergence-aware
  | 'verify_settlement_status'     // #12 — expected-divergence-aware
  | 'verify_order_acceptance'      // #13 — tri-state
  | 'verify_realized_pnl'          // #14
  | 'verify_lot_record'            // #15
  | 'verify_wash_sale_record'      // #16
  | 'verify_rebalance_aggregate'   // #17
  // Non-verify_* reconcile() call identifiers — added at FP-008 sub-step 8.8 / ACT-114.
  // Per S6 Option I (operator-locked): widen union to accommodate §11.0.5 ingestion-time
  // cross-check (distinct mechanism from §11.0.7 verify_* trade-decision pre-checks).
  // See DW-069 for naming-vs-scope discrepancy (type name remains 'VerifyCallName' but
  // scope now includes non-verify_* identifiers; future cleanup at FP-008 closure OR
  // FP-009+ refactor cycle).
  | 'universe_cross_check'         // FP-008 sub-step 8.8 / §11.0.5 ingestion-time cross-check
  // FP-008.4 Commit 9 / #11 second part — liveness-check job's own reconcile() call.
  // Same precedent as 'universe_cross_check': non-verify_* reconcile() identifier
  // (DW-069 future cleanup). The liveness-check writes its own system_bug event via
  // reconcile() through this call_name when the two-invocation-empty predicate fires.
  | 'liveness_check'
  // FP-056 E5.5 / ACT-326 — placement-trigger SubmissionResult disposition.
  // Same DW-069 precedent (non-verify_* reconcile() identifier; type-name
  // vs scope cleanup deferred). Centralized in
  // `_shared/longshort-execution/classify-submission-event.ts`
  // (`PLACEMENT_CALL_NAME`).
  | 'longshort.rebalance.placement';

/**
 * Provenance of the fetcher that produced a reconciliation_events row.
 * Encoded as data so the two-invocation liveness rule (FP-008.4 #11) can evaluate
 * "did this tick produce a real broker observation?" — which is otherwise indistinguishable
 * (a real broker with zero positions returns null identically to MOCK_POSITION_FETCHER).
 *
 *   'mock'    — mock fetcher; NOT-FOR-LIVE handler path
 *   'live'    — real broker / data-source fetcher
 *   'replay'  — replay framework (Phase 0B / sub-step 6.5); engine-live, not broker-live —
 *               INTENTIONALLY excluded from the liveness predicate
 *   'unknown' — pre-MIG-059 backfilled rows; provenance untracked at write-time
 *
 * Provenance is a property of the dispatch site (which fetcher the handler constructed),
 * NOT of the verify spec — it lives on reconcile() / verifier-wrapper signatures, not on
 * ReconcileCallSpec.
 */
export type FetcherSource = 'mock' | 'live' | 'replay' | 'unknown';

/** Outcome enum per CROSSWIND §11.0.10 verbatim — must match reconciliation_outcome enum in MIG-043. */
export type ReconciliationOutcome =
  | 'false_positive_within_tolerance'
  | 'failure_handled'
  | 'failure_escalated'
  | 'expected_divergence_handled'
  | 'system_bug';

/** Tier enum per CROSSWIND §11.0.10 verbatim — must match reconciliation_tier enum in MIG-043. */
export type ReconciliationTier =
  | 'strong_plus'
  | 'strong'
  | 'medium'
  | 'weak';

/** Tolerance class per CROSSWIND §11.0.9. */
export type ToleranceClass =
  | 'zero_tolerance'   // single firing escalates immediately
  | 'low_tolerance'    // three firings within rolling window escalates
  | 'noise_tolerant';  // five firings within rolling window escalates

/**
 * Specification for a verify_* call. Sub-step 6.3a-d implementations construct one of these
 * per verify_* and pass it to `reconcile()` along with the actual broker-invocation function.
 *
 * Per DEC-034.1 clause (4) 6-step lifecycle: the engine accepts the spec + invoke function
 * + ts, runs steps (a) through (f), and returns ReconcileResult.
 */
export interface ReconcileCallSpec<TExpected = unknown, TObserved = unknown> {
  /** Call identity for events + state surface keying */
  call_name: VerifyCallName;
  operator_id: string;
  symbol: string | null;  // null for system-level calls (e.g., verify_buying_power, verify_rebalance_aggregate)

  /** Classification for retention + escalation routing */
  tier: ReconciliationTier;
  tolerance_class: ToleranceClass;

  /** Tolerance configuration (call-specific shape; jsonb-serializable) */
  tolerance: Record<string, unknown>;

  /**
   * Divergence computation — pure function from (expected, observed) to a jsonb-serializable
   * divergence record. Must be deterministic for replay-test PASS per DEC-035 clause (1).
   */
  compute_divergence: (expected: TExpected, observed: TObserved) => Record<string, unknown>;

  /**
   * Classification rule — given divergence + tolerance, returns the outcome enum.
   * Must be deterministic + total over the call's divergence space.
   * Sub-step 6.3 verify_*'s typically wrap a generic classifier with call-specific logic.
   */
  classify_outcome: (
    divergence: Record<string, unknown>,
    tolerance: Record<string, unknown>,
  ) => ReconciliationOutcome;

  /**
   * Failure action — invoked when outcome ∈ {failure_handled, failure_escalated, system_bug}
   * per CROSSWIND §11.0.8 ("Action is specific to the call and the failure mode, not generic;
   * defined before the call site is built, not invented at runtime").
   * Implementations: skip-this-tick / refuse-short-entry / operator-alert / mark-MTM-stale / etc.
   * Must NOT throw — failure action's own errors are caught and recorded in event notes.
   */
  failure_action: (ctx: {
    ts: Date;
    outcome: ReconciliationOutcome;
    divergence: Record<string, unknown>;
    expected: TExpected;
    observed: TObserved;
  }) => Promise<{ action_taken: string; action_metadata?: Record<string, unknown> }>;
}

/** Result returned by `reconcile()` — given to callers for caller-side handling. */
export interface ReconcileResult {
  ts: Date;
  call_name: VerifyCallName;
  symbol: string | null;
  outcome: ReconciliationOutcome;
  divergence: Record<string, unknown>;
  event_id: string;  // uuid of the row written to reconciliation_events
  action_taken: string | null;  // null when outcome ∈ {false_positive_within_tolerance, expected_divergence_handled}
}

/** Row shape for `longshort_reconciliation_state` (matches MIG-042 columns 1:1). */
export interface ReconciliationStateRow {
  operator_id: string;
  symbol: string;
  call_name: VerifyCallName;
  rolling_window_count: number;
  rolling_window_start: Date;
  last_firing_ts: Date | null;
  cooldown_until: Date | null;
  escalation_active: boolean;
  escalation_count_24h: number;
  updated_at: Date;
}

/** Row shape for `reconciliation_events` (matches MIG-043 columns 1:1). */
export interface ReconciliationEventRow {
  event_id: string;
  operator_id: string;
  ts: Date;
  engine_version: string;
  call_name: VerifyCallName | string;  // string fallback for future ingestion-time calls per §11.0.5
  tier: ReconciliationTier;
  symbol: string | null;
  expected_value: Record<string, unknown> | null;
  observed_value: Record<string, unknown> | null;
  divergence: Record<string, unknown> | null;
  tolerance: Record<string, unknown> | null;
  outcome: ReconciliationOutcome;
  failure_action: string | null;
  phase_0b_run_id: string | null;
  pr_evidence_ref: string | null;
  notes: string | null;
  resolved_at: Date | null;
  resolution_pr_ref: string | null;
  /** FP-008.4 Commit 9 / MIG-059 — dispatch-site provenance tag. */
  fetcher_source: FetcherSource;
}

/** Engine version for the current build — bumped per CROSSWIND §11.0.10 audit traceability. */
export const ENGINE_VERSION = '0.1.0';  // sub-step 6.2 initial scaffold; advances at significant lifecycle changes
