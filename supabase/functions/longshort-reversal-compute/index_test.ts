/**
 * Deno test suite for `longshort-reversal-compute` cron edge function —
 * FP-040 / Signal #7 regression sentinel.
 *
 * Mirrors `longshort-momentum-compute/index_test.ts` (source-sentinel
 * pattern). Behavioral persistence assertions live in the shared
 * `persist-signal-compute-log_test.ts` (re-used as-is).
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
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('),
    'unexpected checkPermissionOrThrow on cron handler (INC-28 ban)');
});

Deno.test('(1a) cron auth-first ordering: verifyCronSecret returns before any other side-effect', () => {
  const cronIdx = HANDLER_SOURCE.indexOf('verifyCronSecret(req)');
  const productionClockIdx = HANDLER_SOURCE.indexOf('productionClock.getWallClockTs()');
  const auditIdx = HANDLER_SOURCE.indexOf('writeStrategyAuditEvent({');
  assert(cronIdx > 0 && cronIdx < productionClockIdx,
    'verifyCronSecret must precede productionClock read');
  assert(cronIdx < auditIdx, 'verifyCronSecret must precede any audit-event write');
});

Deno.test('(2) productionClock is the sole wall-clock source — no new Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs() call');
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

Deno.test('(4) createReversalOrchestrator invoked with 4-field SignalOrchestratorContext', () => {
  assert(HANDLER_SOURCE.includes('createReversalOrchestrator(ctx)'),
    'missing createReversalOrchestrator(ctx) call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('priceHistory: new PolygonPriceHistoryFetcher'),
    'missing priceHistory field with PolygonPriceHistoryFetcher');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('concurrency: DEFAULT_CONCURRENCY'), 'missing concurrency field');
});

Deno.test('(5) persistSignalComputeLog writes to signal_compute_log', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'missing persistSignalComputeLog call');
  assert(HANDLER_SOURCE.includes("'../_shared/persist-signal-compute-log.ts'"),
    'missing persist-signal-compute-log import');
});

Deno.test('(6) all three audit events wired (.started / .completed / .failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.reversal.compute.started'"),
    'missing .started audit event');
  assert(HANDLER_SOURCE.includes("'longshort.reversal.compute.completed'"),
    'missing .completed audit event');
  assert(HANDLER_SOURCE.includes("'longshort.reversal.compute.failed'"),
    'missing .failed audit event');
  // No manual_* events on the cron handler (those belong to the sibling).
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_triggered on cron handler');
});

Deno.test('(7) handler path matches MIG-074 handler_path registration', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-reversal-compute/index.ts'),
    true,
    `handler path drift — MIG-074 expects supabase/functions/longshort-reversal-compute/index.ts; got ${importPath}`,
  );
});

Deno.test('(8) signal_id locked to short_term_reversal_1w via orchestrator export', () => {
  // Cross-check that the handler imports SIGNAL_ID from the reversal
  // orchestrator (not momentum's). Catches any wrong-paste regression.
  assert(HANDLER_SOURCE.includes("from '../_shared/longshort-signals/short-term-reversal/reversal-orchestrator.ts'"),
    'must import from short-term-reversal/reversal-orchestrator.ts');
  assert(!HANDLER_SOURCE.includes('cross-sectional-momentum/'),
    'must NOT import from cross-sectional-momentum/');
});