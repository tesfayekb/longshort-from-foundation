/**
 * classify-submission-event — ACT-326 (REVISION-FIX).
 *
 * Maps a `SubmissionResult` (from `order-submitter.ts`) onto the decomposed
 * MIG-043 `reconciliation_events` contract per Option (a) of the corr-
 * `bb3810bf` investigation:
 *
 *   expected_value (jsonb) ← the INTENT: { symbol, side, intent, shares?,
 *                            limit_price?, selection_reason, original_rank,
 *                            substituted_from_symbol, sector, computed_at }
 *
 *   observed_value (jsonb) ← the BROKER DISPOSITION: { kind, order_id?,
 *                            client_order_id?, accepted_at?, observed_at?,
 *                            shares?, limit_price?, reason?,
 *                            broker_status_code?, ... } per kind.
 *
 *   divergence (jsonb)     ← null for `accepted` + the four *_skipped kinds
 *                            (no expectation gap — the placement either
 *                            matched intent or was deliberately deferred).
 *                            For `rejected` / `pending_timeout` the broker
 *                            disposition contradicts the intent — the
 *                            divergence record names which invariant broke.
 *
 *   tier (kernel vocab)    ← tier1 for accepted + skip kinds;
 *                            tier2 for rejected + pending_timeout
 *                            (the writer maps to the reconciliation_tier
 *                            enum per DEC-068 addendum (o)).
 *
 *   outcome (MIG-043 enum) ← 'false_positive_within_tolerance' for accepted
 *                            + skip kinds (the canonical non-divergent value
 *                            per `longshort-reconciliation-lifecycle.ts`);
 *                            'failure_handled' for rejected + pending_timeout
 *                            (matching the prior writer's outcome routing —
 *                            tier-3 escalation lives on the orchestrator's
 *                            in-flight emit path, not placement).
 *
 *   call_name              ← 'longshort.rebalance.placement' (registered in
 *                            `VerifyCallName` per DW-069 precedent).
 */

import type { SubmissionResult } from './order-submitter.ts';
import type { EmittedExecutionEvent } from './lifecycle-orchestrator.ts';

export const PLACEMENT_CALL_NAME = 'longshort.rebalance.placement' as const;

/**
 * Build the `expected_value` projection — the INTENT side of the contract.
 * Common across every SubmissionResult kind (all carry provenance).
 */
function expectedFromResult(r: SubmissionResult): Record<string, unknown> {
  const base: Record<string, unknown> = {
    symbol: r.symbol,
    side: r.side,
    intent: 'intent' in r ? r.intent : null,
    selection_reason: r.provenance.selection_reason,
    substituted_from_symbol: r.provenance.substituted_from_symbol,
    original_rank: r.provenance.original_rank,
    sector: r.provenance.sector,
    computed_at: r.provenance.computed_at,
  };
  if ('shares' in r) base.shares = r.shares;
  if ('limit_price' in r) base.limit_price = r.limit_price;
  return base;
}

/**
 * Build the `observed_value` projection — the BROKER DISPOSITION side.
 * Kind-specific; fields populated per the SubmissionResult union shape.
 */
function observedFromResult(r: SubmissionResult): Record<string, unknown> {
  switch (r.kind) {
    case 'accepted':
      return {
        kind: r.kind,
        order_id: r.order_id,
        client_order_id: r.client_order_id,
        shares: r.shares,
        limit_price: r.limit_price,
        offset_applied_usd: r.offset_applied_usd,
        tier_selection_mid_usd: r.tier_selection_mid_usd,
        accepted_at: r.accepted_at,
      };
    case 'rejected':
      return {
        kind: r.kind,
        client_order_id: r.client_order_id,
        shares: r.shares,
        limit_price: r.limit_price,
        reason: r.reason,
        broker_status_code: r.broker_status_code,
        rejected_at: r.rejected_at,
      };
    case 'pending_timeout':
      return {
        kind: r.kind,
        order_id: r.order_id,
        client_order_id: r.client_order_id,
        shares: r.shares,
        limit_price: r.limit_price,
        timeout_s: r.timeout_s,
        pending_elapsed_s: r.pending_elapsed_s,
        observed_at: r.observed_at,
      };
    case 'zero_share_skipped':
      return {
        kind: r.kind,
        reason: r.reason,
        limit_price: r.limit_price,
        observed_at: r.observed_at,
      };
    case 'quote_stale_skipped':
      return {
        kind: r.kind,
        quote_age_s: r.quote_age_s,
        max_age_s: r.max_age_s,
        refetched_once: r.refetched_once,
        observed_at: r.observed_at,
      };
    case 'insufficient_buying_power_skipped':
      return {
        kind: r.kind,
        shares: r.shares,
        limit_price: r.limit_price,
        proposed_cost_usd: r.proposed_cost_usd,
        remaining_buying_power_usd: r.remaining_buying_power_usd,
        observed_at: r.observed_at,
      };
    case 'noop_skipped':
      return {
        kind: r.kind,
        observed_at: r.observed_at,
      };
  }
}

/**
 * For rejected / pending_timeout: name which intent invariant the broker
 * disposition contradicted. `null` for accepted + skip kinds (no gap).
 */
function divergenceFromResult(
  r: SubmissionResult,
): Record<string, unknown> | null {
  switch (r.kind) {
    case 'rejected':
      return {
        broke: 'intent_acceptance',
        reason: r.reason,
        broker_status_code: r.broker_status_code,
      };
    case 'pending_timeout':
      return {
        broke: 'intent_acceptance_within_timeout',
        timeout_s: r.timeout_s,
        pending_elapsed_s: r.pending_elapsed_s,
      };
    default:
      return null;
  }
}

/**
 * The ratified mapping — see DEC-068 clause (o) for the binding kernel-tier
 * ↔ outcome semantics for placement events. Centralized HERE so both
 * writers consume the same decomposition.
 */
export function classifySubmissionEvent(
  r: SubmissionResult,
): EmittedExecutionEvent {
  const expected = expectedFromResult(r);
  const observed = observedFromResult(r);
  const divergence = divergenceFromResult(r);

  let tier: EmittedExecutionEvent['tier'];
  let outcome: EmittedExecutionEvent['outcome'];
  switch (r.kind) {
    case 'accepted':
    case 'zero_share_skipped':
    case 'quote_stale_skipped':
    case 'insufficient_buying_power_skipped':
    case 'noop_skipped':
      tier = 'tier1';
      outcome = 'false_positive_within_tolerance';
      break;
    case 'rejected':
    case 'pending_timeout':
      tier = 'tier2';
      outcome = 'failure_handled';
      break;
  }

  return {
    call_name: PLACEMENT_CALL_NAME,
    tier,
    outcome,
    symbol: r.symbol,
    expected_value: expected,
    observed_value: observed,
    divergence,
    tolerance: null,
    // payload is kept for back-compat with consumers that still read it;
    // the writer prefers the decomposed fields.
    payload: { expected, observed, divergence },
  };
}