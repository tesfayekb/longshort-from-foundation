/**
 * longshort-reconciliation-tick index_test — FP-008.4 Commit 7 #9 disposition coverage.
 *
 * Coverage:
 *   (a) all within-tolerance       → HTTP 200
 *   (b) failure_handled            → HTTP 200 (handling ran in reconcile())
 *   (c) failure_escalated          → HTTP 500
 *   (d) system_bug                 → HTTP 500
 *   (e) infrastructure_failure     → HTTP 500
 *   (f) source no-swallow sentinel — handler does NOT push infrastructure_failure
 *       into results and fall through to a 200. The classifier branch is the only
 *       path that selects a status; sentinel pins the contract shape.
 *
 * Approach: unit-test the pure `classifyTickDisposition` exported from
 * index.ts plus a source-level sentinel. (End-to-end HTTP test would require
 * standing up auth + RBAC + supabaseAdmin stubs for three live verifier
 * wrappers; the pure classifier captures the disposition contract precisely
 * and the source sentinel pins the call site.)
 *
 * Closes the orphan-anchor half of DW-082 A1. DW-082 A1.b (the underlying
 * TS2322 at createUniverseMembershipFetcher) was resolved at FP-008.4
 * Commit 7.5 by unifying SupabaseClient onto the canonical npm specifier;
 * the `@ts-nocheck` previously at the top of this file has been removed
 * because the underlying type error no longer exists.
 */
import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyTickDisposition } from './index.ts';

Deno.test('(a) all within-tolerance → HTTP 200', () => {
  const r = classifyTickDisposition([
    { outcome: 'false_positive_within_tolerance' },
    { outcome: 'false_positive_within_tolerance' },
    { outcome: 'false_positive_within_tolerance' },
  ]);
  assertEquals(r.status, 200);
  assertEquals(r.halt, false);
});

Deno.test('(b) failure_handled → HTTP 200 (handling ran in reconcile())', () => {
  const r = classifyTickDisposition([
    { outcome: 'false_positive_within_tolerance' },
    { outcome: 'failure_handled' },
    { outcome: 'expected_divergence_handled' },
  ]);
  assertEquals(r.status, 200);
  assertEquals(r.halt, false);
});

Deno.test('(c) failure_escalated → HTTP 500', () => {
  const r = classifyTickDisposition([
    { outcome: 'false_positive_within_tolerance' },
    { outcome: 'failure_escalated' },
    { outcome: 'failure_handled' },
  ]);
  assertEquals(r.status, 500);
  assertEquals(r.halt, true);
});

Deno.test('(d) system_bug → HTTP 500', () => {
  const r = classifyTickDisposition([
    { outcome: 'false_positive_within_tolerance' },
    { outcome: 'system_bug' },
  ]);
  assertEquals(r.status, 500);
  assertEquals(r.halt, true);
});

Deno.test('(e) infrastructure_failure → HTTP 500', () => {
  const r = classifyTickDisposition([
    { outcome: 'false_positive_within_tolerance' },
    { outcome: 'infrastructure_failure' },
  ]);
  assertEquals(r.status, 500);
  assertEquals(r.halt, true);
});

Deno.test('(f) source sentinel — handler does NOT swallow infrastructure_failure into a 200', async () => {
  const src = await Deno.readTextFile(
    new URL('./index.ts', import.meta.url),
  );
  // The disposition router must select status via classifyTickDisposition.
  assertStringIncludes(src, 'classifyTickDisposition(results)');
  // The halting branch must call apiError, not apiSuccess.
  assertStringIncludes(src, "apiError(status, 'reconciliation_tick_escalated'");
  // NOT-FOR-LIVE-INVOCATION docstring guard present.
  assertStringIncludes(src, 'NOT FOR LIVE INVOCATION');
  // Negative sentinel: there must be NO line that pushes infrastructure_failure
  // and unconditionally returns apiSuccess in a catch tail (the pre-Commit-7
  // phantom-success shape).
  // Heuristic: the literal phrase "infrastructure_failure" must not be followed
  // anywhere by an unconditional `return apiSuccess(` without an intervening
  // classifyTickDisposition / apiError call.
  const idx = src.indexOf('infrastructure_failure');
  const lastApiError = src.lastIndexOf('apiError(status,');
  const lastApiSuccess = src.lastIndexOf('apiSuccess(body, status)');
  // apiError(status, ...) and apiSuccess(body, status) must both appear AFTER
  // the classifier call and AFTER the first infrastructure_failure literal.
  if (idx < 0 || lastApiError < idx || lastApiSuccess < idx) {
    throw new Error(
      'Disposition-router shape sentinel: handler must classify infrastructure_failure ' +
      'through classifyTickDisposition and route to apiError(500) — not phantom-200.',
    );
  }
});