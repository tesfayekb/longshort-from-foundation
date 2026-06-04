/**
 * longshort-reconciliation-liveness-check_test — pure-predicate unit tests for
 * the FP-008.4 Commit 9 / #11 two-invocation liveness rule.
 *
 * These tests exercise `evaluateLivenessPredicate` (pure function over fixture
 * ExecutionWindowSummary[]). The handler's IO layer (job_executions read +
 * reconciliation_events count + reconcile() write + job_registry disarm) is
 * covered at the integration-DB level — out of scope here per the "validate the
 * detector before the thing it detects is hot" discipline (the predicate is the
 * detector; IO is the wiring).
 *
 * Positive test (CRITICAL): mirrors today's all-mock state — every periodic-sweep
 * tick produces zero live broker-observation rows. The rule MUST fire on this
 * fixture (this is the predicate validating that it would catch the current
 * defect class if the sweep were re-enabled today).
 *
 * Negative test: when 'live' rows exist in either of the two most-recent windows,
 * the rule MUST be silent.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  evaluateLivenessPredicate,
  type ExecutionWindowSummary,
} from './index.ts';

function win(count: number, idSuffix: string): ExecutionWindowSummary {
  return {
    execution_id: `00000000-0000-0000-0000-00000000${idSuffix}`,
    started_at: '2026-06-04T10:00:00Z',
    completed_at: '2026-06-04T10:00:30Z',
    live_periodic_sweep_event_count: count,
  };
}

Deno.test('liveness rule: insufficient history (zero completed executions) → no stop', () => {
  const v = evaluateLivenessPredicate([]);
  assertEquals(v.stop, false);
  assertEquals(v.reason, 'insufficient_history');
});

Deno.test('liveness rule: insufficient history (one completed execution) → no stop', () => {
  const v = evaluateLivenessPredicate([win(0, '01')]);
  assertEquals(v.stop, false);
  assertEquals(v.reason, 'insufficient_history');
});

Deno.test('POSITIVE: two consecutive empty windows (today\'s all-mock state) → STOP', () => {
  // Today every periodic-sweep tick produces zero fetcher_source=\'live\' rows because
  // the handler is 100% mock (FP-008.4 Commit 9). The rule MUST fire on this state —
  // exactly the defect class it exists to detect.
  const v = evaluateLivenessPredicate([win(0, '02'), win(0, '01')]);
  assertEquals(v.stop, true);
  assertEquals(v.reason, 'two_consecutive_empty');
});

Deno.test('NEGATIVE: most-recent window has live rows → no stop', () => {
  const v = evaluateLivenessPredicate([win(3, '02'), win(0, '01')]);
  assertEquals(v.stop, false);
  assertEquals(v.reason, 'live_rows_observed');
});

Deno.test('NEGATIVE: prior window has live rows (most recent empty) → no stop', () => {
  // A single empty tick is not a STOP — the rule requires two consecutive empties.
  const v = evaluateLivenessPredicate([win(0, '02'), win(1, '01')]);
  assertEquals(v.stop, false);
  assertEquals(v.reason, 'live_rows_observed');
});

Deno.test('NEGATIVE: both windows have live rows → no stop', () => {
  const v = evaluateLivenessPredicate([win(5, '02'), win(7, '01')]);
  assertEquals(v.stop, false);
  assertEquals(v.reason, 'live_rows_observed');
});

Deno.test('rule scope: only the most-recent 2 windows are inspected', () => {
  // If older windows showed live rows but the most recent 2 are empty, STOP.
  // The query layer LIMIT 2's the result; this asserts the predicate doesn't
  // accidentally widen the window if more rows are passed in.
  const v = evaluateLivenessPredicate([win(0, '03'), win(0, '02'), win(10, '01')]);
  assertEquals(v.stop, true);
  assertEquals(v.reason, 'two_consecutive_empty');
});
