/**
 * Deno test suite for `longshort-momentum-compute` cron edge function —
 * FP-009 Bucket C Commit C1 regression sentinel.
 *
 * Coverage shape mirrors `longshort-universe-quarterly-refresh/index_test.ts`
 * — in-process source-sentinel tests rather than deployed HTTP calls (the
 * `Deno.serve(createHandler(...))` harness coupling is out of unit-test
 * scope; same precedent as ACT-108 + DW-082 edge-function-behavioral-test).
 *
 * Full behavioral assertions on the persistence + aggregation logic live
 * in `persist-signal-compute-log_test.ts` (the testable helper module).
 * This file pins the handler-shape contract:
 *
 *  (1) cron auth wired via verifyCronSecret (NOT operator JWT)
 *  (2) productionClock.getWallClockTs() is the SOLE time source — no
 *      new Date() / Date.now() / performance.now() in handler-derived
 *      timestamps (DEC-034 clause 4)
 *  (3) POLYGON_API_KEY is checked, with 'polygon_api_key_unset' error code
 *  (4) createMomentumOrchestrator is invoked with the 4-field context
 *  (5) persistSignalComputeLog writes to signal_compute_log
 *  (6) all three audit events wired (.started / .completed / .failed)
 *  (7) handler_path in MIG-066 matches this file's actual path
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'), 'missing verifyCronSecret call');
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"), 'missing cron-auth import');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron handler — operator JWT is for the manual-trigger sibling');
});

Deno.test('(2) productionClock is the sole wall-clock source — no new Date() in handler', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs() call');
  // Reject any wall-clock leak — DEC-034 clause 4 ban. Strip comments first
  // (block comments + line comments) so doc-commentary about "no new Date()"
  // is not flagged as a leak.
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly),
    'wall-clock leak: new Date() found in cron handler (DEC-034 clause 4 ban)');
  assert(!/Date\.now\s*\(/.test(codeOnly),
    'wall-clock leak: Date.now() found in cron handler');
  assert(!/performance\.now\s*\(/.test(codeOnly),
    'wall-clock leak: performance.now() found in cron handler');
});

Deno.test('(3) POLYGON_API_KEY checked with structured error code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'missing POLYGON_API_KEY env read');
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"),
    'missing polygon_api_key_unset error code');
});

Deno.test('(4) createMomentumOrchestrator invoked with 4-field SignalOrchestratorContext', () => {
  assert(HANDLER_SOURCE.includes('createMomentumOrchestrator(ctx)'),
    'missing createMomentumOrchestrator(ctx) call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('priceHistory: new PolygonPriceHistoryFetcher'),
    'missing priceHistory field with PolygonPriceHistoryFetcher');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('concurrency: DEFAULT_CONCURRENCY'), 'missing concurrency field');
});

Deno.test('(5) persistSignalComputeLog writes to signal_compute_log', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'missing persistSignalComputeLog call');
  assert(HANDLER_SOURCE.includes("'./persist-signal-compute-log.ts'"),
    'missing persist-signal-compute-log import');
});

Deno.test('(6) all three audit events wired (.started / .completed / .failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.momentum.compute.started'"),
    'missing .started audit event');
  assert(HANDLER_SOURCE.includes("'longshort.momentum.compute.completed'"),
    'missing .completed audit event');
  assert(HANDLER_SOURCE.includes("'longshort.momentum.compute.failed'"),
    'missing .failed audit event');
  // No manual_* events on the cron handler (those belong to the sibling).
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_triggered on cron handler');
});

Deno.test('(7) handler path matches MIG-066 handler_path registration', () => {
  // MIG-066 records handler_path='supabase/functions/longshort-momentum-compute/index.ts'.
  // This test pins the file location so the Gate-15 sentinel can resolve it.
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-momentum-compute/index.ts'),
    true,
    `handler path drift — MIG-066 expects supabase/functions/longshort-momentum-compute/index.ts; got ${importPath}`,
  );
});