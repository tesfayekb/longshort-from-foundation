/**
 * completion-pass-allow-list_test — FIX-8 (DEC-083 §c).
 * Grep-anchored allow-list + terminal-set classifier boundary tests.
 * SPEC: docs/04-modules/overshoot/fix-8.md §6 tests 1-11.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OVERSHOOT_COMPLETION_TRANSIENT_ALLOW,
  OVERSHOOT_COMPLETION_TERMINAL_ACTIONS,
  OVERSHOOT_COMPLETION_TERMINAL_SUBMIT_FAILED_REASONS,
  classifyPass1Refusal,
} from './completion-pass-allow-list.ts';

// (1) FLAG-C REGRESSION: budget-refused-in-pass1 ADMITS in pass-2.
Deno.test('FIX-8: daily_budget_reached is NON-terminal (FLAG-D, primary re-eval trigger)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.daily_budget_reached', null), 'non_terminal_default');
});

// (2) alpaca_api_403 terminal-skip (4xx-non-transient predicate).
Deno.test('FIX-8: alpaca_api_403 → terminal via submit_failed two-field predicate', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_403'), 'terminal');
});
Deno.test('FIX-8: alpaca_api_422 → terminal', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_422'), 'terminal');
});

// (3) Unknown-action non-terminal default.
Deno.test('FIX-8: unknown action → non_terminal_default (conservative)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.some_future_class', null), 'non_terminal_default');
});

// (4)/(5) transient allow-set positives.
Deno.test('FIX-8: alpaca_api_500 → transient (5xx rule)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_500'), 'transient');
});
Deno.test('FIX-8: alpaca_api_502 → transient', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_502'), 'transient');
});
Deno.test('FIX-8: alpaca_api_503 → transient', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_503'), 'transient');
});
Deno.test('FIX-8: alpaca_api_504 → transient', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_504'), 'transient');
});
Deno.test('FIX-8: alpaca_api_429 → transient (rate-limit, not 4xx-terminal)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_api_429'), 'transient');
});
Deno.test('FIX-8: alpaca_network_error → transient', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_network_error'), 'transient');
});

// (6) alpaca_credential_missing terminal (two-field).
Deno.test('FIX-8: alpaca_credential_missing → terminal (two-field submit_failed match)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'alpaca_credential_missing'), 'terminal');
});

// (7) i5_reversion_exceeded terminal (alpha-window moved).
Deno.test('FIX-8: i5_reversion_exceeded → terminal (market-moved, alpha window closed)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.i5_refusal.i5_reversion_exceeded', null), 'terminal');
});

// (8) position_already_open terminal (double-count belt-and-suspenders).
Deno.test('FIX-8: position_already_open → terminal (double-count belt-and-suspenders)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.position_already_open', null), 'terminal');
});

// (9)/(10) additional canonical cases.
Deno.test('FIX-8: allocation_cap_reached → terminal (alpha exhausted on side)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.allocation_cap_reached', null), 'terminal');
});
Deno.test('FIX-8: shortability_refusal.not_shortable → terminal', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.shortability_refusal.not_shortable', null), 'terminal');
});

// Sizing/BP/price refusals default NON-terminal (conservative unknown).
Deno.test('FIX-8: sizing_refusal.* → non_terminal_default (re-eligible)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.sizing_refusal.some_class', null), 'non_terminal_default');
});
Deno.test('FIX-8: buying_power_refusal.* → non_terminal_default (re-eligible; BP may recover)', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.buying_power_refusal.some_class', null), 'non_terminal_default');
});
Deno.test('FIX-8: regime_indeterminate → non_terminal_default', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.regime_indeterminate', null), 'non_terminal_default');
});
Deno.test('FIX-8: submit_failed with unknown reason → non_terminal_default', () => {
  assertEquals(classifyPass1Refusal('overshoot.entry.submit_failed', 'submit_unexpected'), 'non_terminal_default');
});

// (11) Grep-anchor regression.
Deno.test('FIX-8: transient allow-set enumeration is stable (grep-anchor guard)', () => {
  assertEquals([...OVERSHOOT_COMPLETION_TRANSIENT_ALLOW].sort(), [
    'alpaca_api_429','alpaca_api_500','alpaca_api_502','alpaca_api_503','alpaca_api_504',
    'alpaca_network_error','polygon_snapshot_stale','polygon_snapshot_unavailable',
  ]);
});
Deno.test('FIX-8: TERMINAL_ACTIONS enumeration is stable (FLAG-E-dropped exclusion_earnings_proximity)', () => {
  assertEquals([...OVERSHOOT_COMPLETION_TERMINAL_ACTIONS].sort(), [
    'overshoot.entry.allocation_cap_reached',
    'overshoot.entry.i5_refusal.i5_reversion_exceeded',
    'overshoot.entry.position_already_open',
    'overshoot.entry.shortability_refusal.not_shortable',
  ]);
});
Deno.test('FIX-8: TERMINAL_SUBMIT_FAILED_REASONS stable', () => {
  assertEquals([...OVERSHOOT_COMPLETION_TERMINAL_SUBMIT_FAILED_REASONS], ['alpaca_credential_missing']);
});
