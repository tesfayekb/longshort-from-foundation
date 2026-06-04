/**
 * outcome-display — shared UI helper for rendering the two longshort outcome
 * enums (`reconciliation_outcome` + `refresh_outcome`) consistently across all
 * operator surfaces.
 *
 * FP-008.4 #17: prior to this util the same enums rendered four different ways
 * (cross-check card binary clean/amber, dashboard events list 3-way with raw
 * labels, ReconciliationEventsPage 3-way with a dead fallback + raw labels,
 * UniverseRefreshHistoryPage human labels). The cross-check card collapsed
 * `system_bug` + `failure_escalated` (ABORT-class) into the same amber as
 * `failure_handled` (recoverable) — the most-severe misalignment.
 *
 * Severity tiers are BACKEND-DERIVED — they must stay consistent with backend
 * escalation semantics:
 *   - CROSSWIND §11.0.10 / §11.0.11 reconciliation outcome enum semantics
 *     (`failure_escalated` + `system_bug` → ABORT + root-cause mandatory)
 *   - DEC-038 clause (2) cross-check outcome assignments
 *     (`expected_divergence_handled` + `false_positive_within_tolerance` are
 *     documented noise; do NOT count toward escalation per §11.0.10)
 *   - FP-008.4 Commit 3.5 `STREAK_FAILURE_OUTCOMES = {'failed',
 *     'circuit_breaker_open'}` (refresh outcomes that converge a breaker trip)
 *
 * This module is the SINGLE SOURCE OF UI OUTCOME SEVERITY. All four operator
 * surfaces (LongShortDashboard cross-check card + events list,
 * ReconciliationEventsPage, UniverseRefreshHistoryPage) MUST route their
 * outcome rendering through these helpers; ad-hoc inline mappings are a
 * regression.
 *
 * Both Records are exhaustively typed (`Record<Outcome, …>`); adding a new
 * enum value is a compile-time error until the helper handles it — same
 * pattern as FP-008.4 #13 `SANITY_BOUNDS` and #16 `STALENESS_BADGE_*` maps.
 */

import type { ReconciliationOutcome } from '@/features/longshort/services/baseline/baseline-query-helpers';
import type { RefreshOutcome } from '@/features/longshort/utils/universe-staleness';

/** Canonical UI severity tier. Backend-derived; see file header. */
export type Severity = 'clean' | 'handled' | 'severe' | 'neutral';

/** StatusBadge status values (from `src/components/dashboard/StatusBadge.tsx`). */
export type StatusBadgeStatus = 'active' | 'pending' | 'deactivated' | 'info';

/** Bare-Badge variant values (from `src/components/ui/badge.tsx`). */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface OutcomeDisplay {
  readonly label: string;
  readonly severity: Severity;
}

/**
 * Reconciliation-event outcome display — exhaustive over the 5-value enum.
 *
 * Severity assignments (per CROSSWIND §11.0.10 + DEC-038 clause (2)):
 *   - `clean`   — noise floor, no action (§11.0.10: "does NOT count toward escalation")
 *   - `handled` — counts toward escalation, standard procedure resolved (DEC-038)
 *   - `severe`  — ABORT-class, operator action mandatory (§11.0.11)
 */
export const RECONCILIATION_OUTCOME_DISPLAY: Record<ReconciliationOutcome, OutcomeDisplay> = {
  false_positive_within_tolerance: { label: 'Within Tolerance',   severity: 'clean' },
  expected_divergence_handled:     { label: 'Expected Divergence', severity: 'clean' },
  failure_handled:                 { label: 'Failure Handled',     severity: 'handled' },
  failure_escalated:               { label: 'Failure Escalated',   severity: 'severe' },
  system_bug:                      { label: 'System Bug',          severity: 'severe' },
};

/** Refresh-log outcome key — `null` (in-flight / no record yet) collapses to `'pending'`. */
export type RefreshOutcomeKey = Exclude<RefreshOutcome, null> | 'pending';

/**
 * Refresh-log outcome display — exhaustive over the 4 terminal outcomes + `pending`.
 *
 * Severity assignments (per FP-008.4 Commit 3.5 `STREAK_FAILURE_OUTCOMES`):
 *   - `clean`   — `completed`
 *   - `handled` — `partial` (some rows persisted, others failed — caution)
 *   - `severe`  — `failed` + `circuit_breaker_open` (the breaker-streak set)
 *   - `neutral` — `pending` (no terminal outcome yet)
 */
export const REFRESH_OUTCOME_DISPLAY: Record<RefreshOutcomeKey, OutcomeDisplay> = {
  completed:            { label: 'Completed',    severity: 'clean' },
  partial:              { label: 'Partial',      severity: 'handled' },
  failed:               { label: 'Failed',       severity: 'severe' },
  circuit_breaker_open: { label: 'Circuit Open', severity: 'severe' },
  pending:              { label: 'Pending',      severity: 'neutral' },
};

/** Reconciliation outcome → human label. */
export function reconciliationOutcomeLabel(outcome: ReconciliationOutcome): string {
  return RECONCILIATION_OUTCOME_DISPLAY[outcome].label;
}

/** Reconciliation outcome → canonical UI severity. */
export function reconciliationOutcomeSeverity(outcome: ReconciliationOutcome): Severity {
  return RECONCILIATION_OUTCOME_DISPLAY[outcome].severity;
}

/** Refresh outcome (incl. `null` → pending) → human label. */
export function refreshOutcomeLabel(outcome: RefreshOutcome | null): string {
  return REFRESH_OUTCOME_DISPLAY[outcome ?? 'pending'].label;
}

/** Refresh outcome (incl. `null` → pending) → canonical UI severity. */
export function refreshOutcomeSeverity(outcome: RefreshOutcome | null): Severity {
  return REFRESH_OUTCOME_DISPLAY[outcome ?? 'pending'].severity;
}

/**
 * Severity → StatusBadge status. Used by the rich cross-check card (and any
 * future surface that wants the semantic `StatusBadge` shell with its
 * design-token-driven colour classes).
 */
export function severityToStatusBadge(severity: Severity): StatusBadgeStatus {
  switch (severity) {
    case 'clean':   return 'active';      // green
    case 'handled': return 'pending';     // amber
    case 'severe':  return 'deactivated'; // red
    case 'neutral': return 'info';        // muted
  }
}

/**
 * Severity → bare `Badge` variant. Used by dense table surfaces that prefer
 * the compact bare badge over the `StatusBadge` shell.
 *
 * `clean → outline` is intentional: the survey flagged that `default` (high-
 * contrast filled primary) reads as attention-grabbing, not calm. A clean
 * outcome should be visually quiet; the outline variant on the design-token
 * `foreground` colour achieves that without competing with severe badges.
 */
export function severityToBadgeVariant(severity: Severity): BadgeVariant {
  switch (severity) {
    case 'clean':   return 'outline';
    case 'handled': return 'secondary';
    case 'severe':  return 'destructive';
    case 'neutral': return 'outline';
  }
}