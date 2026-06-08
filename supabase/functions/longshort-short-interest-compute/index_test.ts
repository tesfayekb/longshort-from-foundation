/**
 * Deno test suite for `longshort-short-interest-compute` cron edge function
 * — FP-041 / Signal #5 regression sentinel.
 *
 * Mirrors `longshort-reversal-compute/index_test.ts` (source-sentinel
 * pattern).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'), 'missing verifyCronSecret call');
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"), 'missing cron-auth import');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron handler');
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('),
    'unexpected checkPermissionOrThrow on cron handler (INC-28 ban)');
});

Deno.test('(1a) cron auth-first ordering: verifyCronSecret returns before any other side-effect', () => {
  const cronIdx = HANDLER_SOURCE.indexOf('verifyCronSecret(req)');
  const productionClockIdx = HANDLER_SOURCE.indexOf('const as_of = productionClock.getWallClockTs()');
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
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly), 'wall-clock leak: new Date()');
  assert(!/Date\.now\s*\(/.test(codeOnly), 'wall-clock leak: Date.now()');
  assert(!/performance\.now\s*\(/.test(codeOnly), 'wall-clock leak: performance.now()');
});

Deno.test('(3) POLYGON_API_KEY checked with structured error code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'missing POLYGON_API_KEY env read');
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"),
    'missing polygon_api_key_unset error code');
});

Deno.test('(4) createShortInterestOrchestrator invoked with new fetcher', () => {
  assert(HANDLER_SOURCE.includes('createShortInterestOrchestrator(ctx)'),
    'missing createShortInterestOrchestrator(ctx) call');
  assert(HANDLER_SOURCE.includes('shortInterest: new PolygonShortInterestFetcher'),
    'missing shortInterest field with PolygonShortInterestFetcher');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('concurrency: DEFAULT_CONCURRENCY'), 'missing concurrency field');
  // No price-history fetcher should leak in — this is a non-price signal.
  assert(!HANDLER_SOURCE.includes('PolygonPriceHistoryFetcher'),
    'unexpected PolygonPriceHistoryFetcher import — wrong fetcher for short interest');
});

Deno.test('(5) persistSignalComputeLog writes to signal_compute_log', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'missing persistSignalComputeLog call');
  assert(HANDLER_SOURCE.includes("'../_shared/persist-signal-compute-log.ts'"),
    'missing persist-signal-compute-log import');
});

Deno.test('(6) all three audit events wired (.started / .completed / .failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.short_interest.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.short_interest.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.short_interest.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_triggered on cron handler');
});

Deno.test('(7) handler path matches MIG-076 handler_path registration', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-short-interest-compute/index.ts'),
    true,
  );
});

Deno.test('(8) signal_id locked via short-interest-orchestrator import (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "from '../_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts'",
  ));
  assert(!HANDLER_SOURCE.includes('cross-sectional-momentum/'),
    'must NOT import from cross-sectional-momentum/');
  assert(!HANDLER_SOURCE.includes('short-term-reversal/'),
    'must NOT import from short-term-reversal/');
});