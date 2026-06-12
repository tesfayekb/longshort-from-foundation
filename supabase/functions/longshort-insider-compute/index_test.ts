/**
 * Source-sentinel test for `longshort-insider-compute` cron handler.
 * Mirrors `longshort-short-interest-compute/index_test.ts` (FP-041 pattern).
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'));
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"));
  assert(!HANDLER_SOURCE.includes('authenticateRequest('));
  assert(!HANDLER_SOURCE.includes('checkPermissionOrThrow('));
});

Deno.test('(1a) auth-first ordering: verifyCronSecret precedes clock/audit', () => {
  const cronIdx = HANDLER_SOURCE.indexOf('verifyCronSecret(req)');
  const clockIdx = HANDLER_SOURCE.indexOf('productionClock.getWallClockTs()');
  const auditIdx = HANDLER_SOURCE.indexOf('writeStrategyAuditEvent({');
  assert(cronIdx > 0 && cronIdx < clockIdx);
  assert(cronIdx < auditIdx);
});

Deno.test('(2) productionClock is sole wall-clock — no Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
  assert(!/performance\.now\s*\(/.test(codeOnly));
});

Deno.test('(3) POLYGON_API_KEY + EDGAR_CONTACT_EMAIL checked with structured error codes', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"));
  assert(HANDLER_SOURCE.includes("Deno.env.get('EDGAR_CONTACT_EMAIL')"));
  assert(HANDLER_SOURCE.includes("'edgar_contact_email_unset'"));
});

Deno.test('(4) createInsiderOrchestrator wired with EDGAR pipeline + TokenBucket + Polygon side-inputs', () => {
  assert(HANDLER_SOURCE.includes('createInsiderOrchestrator(ctx)'));
  assert(HANDLER_SOURCE.includes('cikMapper: new EdgarCikMapper'));
  assert(HANDLER_SOURCE.includes('dailyIndex: new EdgarDailyIndexFetcher'));
  assert(HANDLER_SOURCE.includes('accessionIndex: new EdgarAccessionIndexFetcher'));
  assert(HANDLER_SOURCE.includes('form4Edgar: new EdgarForm4Fetcher'));
  assert(HANDLER_SOURCE.includes('bucket: new TokenBucket'));
  assert(HANDLER_SOURCE.includes('ratePerSec: DEFAULT_EDGAR_RPS'));
  assert(HANDLER_SOURCE.includes('sharesOutstanding: new PolygonSharesOutstandingFetcher'));
  assert(HANDLER_SOURCE.includes('priceHistory: new PolygonPriceHistoryFetcher'));
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'));
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'));
  assert(HANDLER_SOURCE.includes('concurrency: DEFAULT_CONCURRENCY'));
  // No legacy Polygon Form-4 leak in.
  assert(!HANDLER_SOURCE.includes('PolygonForm4Fetcher'));
  assert(!HANDLER_SOURCE.includes('PolygonShortInterestFetcher'));
});

Deno.test('(5) persistSignalComputeLog wired', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('));
  assert(HANDLER_SOURCE.includes("'../_shared/persist-signal-compute-log.ts'"));
});

Deno.test('(6) all three audit events wired (.started/.completed/.failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.insider.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.insider.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.insider.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'));
});