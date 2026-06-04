import { describe, it, expect } from 'vitest';
import {
  RECONCILIATION_OUTCOME_DISPLAY,
  REFRESH_OUTCOME_DISPLAY,
  reconciliationOutcomeLabel,
  reconciliationOutcomeSeverity,
  refreshOutcomeLabel,
  refreshOutcomeSeverity,
  severityToStatusBadge,
  severityToBadgeVariant,
  type Severity,
} from './outcome-display';
import type { ReconciliationOutcome } from '@/features/longshort/services/baseline/baseline-query-helpers';
import type { RefreshOutcome } from '@/features/longshort/utils/universe-staleness';

// The exhaustive enum lists used to assert "every value maps". These are
// duplicated here on purpose: if the source enums add a value, the
// `Record<…>` type on the helper fails to compile AND this list goes stale
// — two-sided drift detection.
const ALL_RECONCILIATION_OUTCOMES: readonly ReconciliationOutcome[] = [
  'false_positive_within_tolerance',
  'expected_divergence_handled',
  'failure_handled',
  'failure_escalated',
  'system_bug',
] as const;

const ALL_REFRESH_OUTCOMES: readonly (RefreshOutcome | null)[] = [
  'completed',
  'partial',
  'failed',
  'circuit_breaker_open',
  null,
] as const;

describe('outcome-display — exhaustive coverage', () => {
  it('maps every reconciliation outcome to a label + severity', () => {
    for (const o of ALL_RECONCILIATION_OUTCOMES) {
      const entry = RECONCILIATION_OUTCOME_DISPLAY[o];
      expect(entry, `missing entry for ${o}`).toBeDefined();
      expect(entry.label.length).toBeGreaterThan(0);
      expect(['clean', 'handled', 'severe', 'neutral']).toContain(entry.severity);
    }
  });

  it('maps every refresh outcome (incl. null → pending) to a label + severity', () => {
    for (const o of ALL_REFRESH_OUTCOMES) {
      const label = refreshOutcomeLabel(o);
      const severity = refreshOutcomeSeverity(o);
      expect(label.length).toBeGreaterThan(0);
      expect(['clean', 'handled', 'severe', 'neutral']).toContain(severity);
    }
  });
});

describe('outcome-display — backend-derived severity tiers (lock-in)', () => {
  // These assertions encode the canonical backend tiers (CROSSWIND §11.0.10/11,
  // DEC-038 clause (2), FP-008.4 Commit 3.5 STREAK_FAILURE_OUTCOMES). A
  // future edit that diverges the UI mapping from backend escalation
  // semantics MUST fail this test.

  it('reconciliation: FPwT + EDH are clean (documented noise floor)', () => {
    expect(reconciliationOutcomeSeverity('false_positive_within_tolerance')).toBe('clean');
    expect(reconciliationOutcomeSeverity('expected_divergence_handled')).toBe('clean');
  });

  it('reconciliation: failure_handled is handled (counts toward escalation, standard procedure)', () => {
    expect(reconciliationOutcomeSeverity('failure_handled')).toBe('handled');
  });

  it('reconciliation: failure_escalated is severe (ABORT-class, operator escalation required)', () => {
    expect(reconciliationOutcomeSeverity('failure_escalated')).toBe('severe');
  });

  // Regression guard: the cross-check card's pre-#17 binary mapping rendered
  // system_bug as amber-warning. system_bug is the §11.0.11 ABORT +
  // root-cause-mandatory outcome (Commit 7 infra-failure outcome / Commit 9
  // liveness STOP outcome) — it MUST render severe, never clean or handled.
  it('reconciliation: system_bug is severe (NOT clean, NOT handled) — REGRESSION GUARD', () => {
    expect(reconciliationOutcomeSeverity('system_bug')).toBe('severe');
    expect(reconciliationOutcomeSeverity('system_bug')).not.toBe('clean');
    expect(reconciliationOutcomeSeverity('system_bug')).not.toBe('handled');
  });

  it('refresh: completed is clean', () => {
    expect(refreshOutcomeSeverity('completed')).toBe('clean');
  });

  it('refresh: partial is handled (some rows persisted, others failed)', () => {
    expect(refreshOutcomeSeverity('partial')).toBe('handled');
  });

  it('refresh: failed is severe (STREAK_FAILURE_OUTCOMES member)', () => {
    expect(refreshOutcomeSeverity('failed')).toBe('severe');
  });

  // Regression guard: circuit_breaker_open is the Commit-3/8 disarm signal —
  // a tripped breaker that requires operator intervention to clear. It MUST
  // render severe, never handled, never neutral.
  it('refresh: circuit_breaker_open is severe (STREAK_FAILURE_OUTCOMES member, operator disarm) — REGRESSION GUARD', () => {
    expect(refreshOutcomeSeverity('circuit_breaker_open')).toBe('severe');
    expect(refreshOutcomeSeverity('circuit_breaker_open')).not.toBe('handled');
    expect(refreshOutcomeSeverity('circuit_breaker_open')).not.toBe('neutral');
  });

  it('refresh: null collapses to pending (neutral — no terminal outcome yet)', () => {
    expect(refreshOutcomeSeverity(null)).toBe('neutral');
    expect(refreshOutcomeLabel(null)).toBe('Pending');
  });
});

describe('outcome-display — human labels (consistency with UniverseRefreshHistoryPage style)', () => {
  it('reconciliation labels are human (not raw snake_case enum strings)', () => {
    expect(reconciliationOutcomeLabel('false_positive_within_tolerance')).toBe('Within Tolerance');
    expect(reconciliationOutcomeLabel('expected_divergence_handled')).toBe('Expected Divergence');
    expect(reconciliationOutcomeLabel('failure_handled')).toBe('Failure Handled');
    expect(reconciliationOutcomeLabel('failure_escalated')).toBe('Failure Escalated');
    expect(reconciliationOutcomeLabel('system_bug')).toBe('System Bug');
    // Confirm no label is the raw enum value (the bug being fixed):
    for (const o of ALL_RECONCILIATION_OUTCOMES) {
      expect(reconciliationOutcomeLabel(o)).not.toBe(o);
    }
  });

  it('refresh labels are human and match the pre-#17 UniverseRefreshHistoryPage labels', () => {
    expect(refreshOutcomeLabel('completed')).toBe('Completed');
    expect(refreshOutcomeLabel('partial')).toBe('Partial');
    expect(refreshOutcomeLabel('failed')).toBe('Failed');
    expect(refreshOutcomeLabel('circuit_breaker_open')).toBe('Circuit Open');
  });
});

describe('outcome-display — severity → badge component mappings', () => {
  const ALL_SEVERITIES: readonly Severity[] = ['clean', 'handled', 'severe', 'neutral'];

  it('severityToStatusBadge: clean→active, handled→pending, severe→deactivated, neutral→info', () => {
    expect(severityToStatusBadge('clean')).toBe('active');
    expect(severityToStatusBadge('handled')).toBe('pending');
    expect(severityToStatusBadge('severe')).toBe('deactivated');
    expect(severityToStatusBadge('neutral')).toBe('info');
  });

  it('severityToBadgeVariant: clean→outline (calm, NOT default-filled), handled→secondary, severe→destructive, neutral→outline', () => {
    // The "clean ≠ default" assertion encodes the survey finding: default
    // (high-contrast filled primary) reads as attention-grabbing, not calm.
    expect(severityToBadgeVariant('clean')).toBe('outline');
    expect(severityToBadgeVariant('clean')).not.toBe('default');
    expect(severityToBadgeVariant('handled')).toBe('secondary');
    expect(severityToBadgeVariant('severe')).toBe('destructive');
    expect(severityToBadgeVariant('neutral')).toBe('outline');
  });

  it('every severity produces a defined StatusBadge status + Badge variant', () => {
    for (const s of ALL_SEVERITIES) {
      expect(severityToStatusBadge(s)).toBeTruthy();
      expect(severityToBadgeVariant(s)).toBeTruthy();
    }
  });
});