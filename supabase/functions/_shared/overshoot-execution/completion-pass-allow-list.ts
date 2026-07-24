/**
 * completion-pass-allow-list — FIX-8 (DEC-083 §c).
 *
 * Pure classifier for pass-2 (completion-pass) terminal-skip decisions in
 * overshoot-entry-run. Zero I/O, zero clock, zero globals. Consumed at the
 * pre-loop filter seam in the handler and by unit tests.
 *
 * SPEC: docs/04-modules/overshoot/fix-8.md §5 (module surface).
 * OPERATOR RULINGS (2026-07-23): FLAG-A/B replacement set + pattern rule;
 * FLAG-C Option-2 (skip only on terminal-match); FLAG-D daily_budget_reached
 * is NOT terminal (primary re-eval trigger); FLAG-E drop
 * exclusion_earnings_proximity (detector-layer, zero emit-sites in
 * overshoot-entry-run); unknown-action default = non-terminal.
 *
 * §(3) VERIFICATION RULE (spec, verbatim):
 *   "any string with zero emit-sites is flagged, not silently kept."
 * Every literal below has been grep-anchored to a real emit-site in
 * `overshoot-entry-run/index.ts` or `snapshot-retry.ts` — see the spec
 * grep-verification tables in fix-8.md §2(3) and §2(4).
 */

// ── TRANSIENT ALLOW-SET (FLAG-A/B) ─────────────────────────────────────────
// Pattern rule: alpaca_api_5xx + 429 + network = transient.
//               alpaca_api_4xx (except 429) + alpaca_credential_missing =
//               TERMINAL (matched via TERMINAL_SUBMIT_FAILED_REASONS below).
// polygon_fetch_error DROPPED entirely (zero emit-sites).
export const OVERSHOOT_COMPLETION_TRANSIENT_ALLOW = [
  'polygon_snapshot_stale',
  'polygon_snapshot_unavailable',
  'alpaca_api_500',
  'alpaca_api_502',
  'alpaca_api_503',
  'alpaca_api_504',
  'alpaca_api_429',
  'alpaca_network_error',
] as const;

// ── TERMINAL_ACTIONS (FLAG-C, Option-2) ────────────────────────────────────
// Full-action-string set. Polarity: skip only on terminal-match.
// exclusion_earnings_proximity DROPPED (FLAG-E — detector-layer, zero
// emit-sites in entry-run).
export const OVERSHOOT_COMPLETION_TERMINAL_ACTIONS = [
  'overshoot.entry.i5_refusal.i5_reversion_exceeded',
  'overshoot.entry.allocation_cap_reached',
  'overshoot.entry.position_already_open',
  'overshoot.entry.shortability_refusal.not_shortable',
  // DEC-084 (2026-07-24): short-side daily budget is TERMINAL for the day.
  // The per-side pacing budget is a hard cadence gate — a short refused
  // in pass-1 for short_daily_budget_reached must NOT re-admit in pass-2
  // (same reasoning as the K=5 global budget: the ratified admission
  // rate is preserved regardless of pass count). Grep-anchored emit-site:
  // `overshoot.entry.short_daily_budget_reached` in overshoot-entry-run.
  'overshoot.entry.short_daily_budget_reached',
] as const;

// ── TERMINAL two-field match for submit_failed ─────────────────────────────
// Action = 'overshoot.entry.submit_failed'; matched via metadata.reason:
//   - Literal set below.
//   - PLUS predicate: /^alpaca_api_4\d\d$/ && reason !== 'alpaca_api_429'.
export const OVERSHOOT_COMPLETION_TERMINAL_SUBMIT_FAILED_REASONS = [
  'alpaca_credential_missing',
] as const;

const SUBMIT_FAILED_ACTION = 'overshoot.entry.submit_failed';
const ALPACA_API_4XX_RE = /^alpaca_api_4\d\d$/;

/**
 * Classify a prior pass-1 refusal (per ticker × action × reason) into one of
 * three buckets:
 *   - 'terminal'             → pass-2 skips the symbol (typed skip audit)
 *   - 'transient'            → pass-2 re-evaluates the symbol
 *   - 'non_terminal_default' → pass-2 re-evaluates the symbol (unknown action)
 *
 * Guardrail unchanged: the pre-loop double-count lookup (§4 in the spec) is
 * the hard gate — a mis-classed refusal can never double-admit, only
 * skip-or-consider.
 */
export function classifyPass1Refusal(
  action: string,
  reason: string | null,
): 'terminal' | 'transient' | 'non_terminal_default' {
  // Two-field terminal match on submit_failed.
  if (action === SUBMIT_FAILED_ACTION) {
    if (reason !== null) {
      if ((OVERSHOOT_COMPLETION_TERMINAL_SUBMIT_FAILED_REASONS as readonly string[]).includes(reason)) {
        return 'terminal';
      }
      // alpaca_api_4xx non-transient predicate.
      if (ALPACA_API_4XX_RE.test(reason) && reason !== 'alpaca_api_429') {
        return 'terminal';
      }
      if ((OVERSHOOT_COMPLETION_TRANSIENT_ALLOW as readonly string[]).includes(reason)) {
        return 'transient';
      }
    }
    // submit_failed with unknown/absent reason → non-terminal default
    // (conservative — assume re-eligibility; the double-count guard is the
    // backstop).
    return 'non_terminal_default';
  }

  // Pure action-string terminal match.
  if ((OVERSHOOT_COMPLETION_TERMINAL_ACTIONS as readonly string[]).includes(action)) {
    return 'terminal';
  }

  // Transient action-only match (polygon_snapshot_* land here when the
  // refusal is emitted with the class as the action tail; kept for future
  // symmetry — none currently emitted this way in entry-run).
  const actionTail = action.split('.').pop() ?? '';
  if ((OVERSHOOT_COMPLETION_TRANSIENT_ALLOW as readonly string[]).includes(actionTail)) {
    return 'transient';
  }

  // FLAG-D: daily_budget_reached and all other unknown actions default
  // NON-terminal (re-eligible). This is the FIX-8 raison d'être — a
  // budget-truncated candidate must be reachable in pass-2.
  return 'non_terminal_default';
}