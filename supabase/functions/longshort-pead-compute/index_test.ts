/**
 * Deno test suite for `longshort-pead-compute` cron edge function
 * — FP-044 / Signal #2 regression sentinel.
 *
 * Mirrors `longshort-short-interest-compute/index_test.ts` (source-sentinel
 * pattern). Vendor swap to Finnhub (DEC-053 split-vendor lock).
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

Deno.test('(3) FINNHUB_API_KEY checked with structured error code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('FINNHUB_API_KEY')"),
    'missing FINNHUB_API_KEY env read');
  assert(HANDLER_SOURCE.includes("'finnhub_api_key_unset'"),
    'missing finnhub_api_key_unset error code');
  // DEC-053 split-vendor lock: PEAD must NOT read FMP/Polygon keys.
  assert(!HANDLER_SOURCE.includes("Deno.env.get('FMP_API_KEY')"),
    'unexpected FMP_API_KEY — Signal #2 is Finnhub per DEC-053');
  assert(!HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'unexpected POLYGON_API_KEY — Signal #2 is Finnhub per DEC-053');
});

Deno.test('(4) createPeadOrchestrator invoked with both Finnhub fetchers', () => {
  assert(HANDLER_SOURCE.includes('createPeadOrchestrator(ctx)'),
    'missing createPeadOrchestrator(ctx) call');
  assert(HANDLER_SOURCE.includes('epsEstimate: new FinnhubEpsEstimateFetcher'),
    'missing epsEstimate field with FinnhubEpsEstimateFetcher');
  assert(HANDLER_SOURCE.includes('earnings: new FinnhubEarningsFetcher'),
    'missing earnings field with FinnhubEarningsFetcher');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('concurrency: DEFAULT_CONCURRENCY'), 'missing concurrency field');
  // No price-history fetcher should leak — PEAD has no price input.
  assert(!HANDLER_SOURCE.includes('PolygonPriceHistoryFetcher'),
    'unexpected PolygonPriceHistoryFetcher — wrong fetcher for PEAD');
});

Deno.test('(5) persistSignalComputeLog writes to signal_compute_log', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('),
    'missing persistSignalComputeLog call');
  assert(HANDLER_SOURCE.includes("'../_shared/persist-signal-compute-log.ts'"),
    'missing persist-signal-compute-log import');
});

Deno.test('(6) all three audit events wired (.started / .completed / .failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_triggered on cron handler');
});

Deno.test('(7) handler path matches MIG-081 handler_path registration', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-pead-compute/index.ts'),
    true,
  );
});

Deno.test('(8) signal_id locked via pead-orchestrator import (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "from '../_shared/longshort-signals/pead/pead-orchestrator.ts'",
  ));
  assert(!HANDLER_SOURCE.includes('cross-sectional-momentum/'),
    'must NOT import from cross-sectional-momentum/');
  assert(!HANDLER_SOURCE.includes('short-term-reversal/'),
    'must NOT import from short-term-reversal/');
  assert(!HANDLER_SOURCE.includes('short-interest-change/'),
    'must NOT import from short-interest-change/');
});

Deno.test('(9) DEC-048 interim-cadence acknowledgement present in header (cadence is not end-state)', () => {
  // Three-place discipline (handler header + module doc + DEC-048): the
  // daily cron schedule is INTERIM, not the spec end-state.
  assert(/DEC-048/.test(HANDLER_SOURCE), 'missing DEC-048 reference in handler header');
  assert(/INTERIM|interim/.test(HANDLER_SOURCE),
    'missing interim-cadence language in handler header');
});