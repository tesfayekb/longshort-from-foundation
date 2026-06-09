/**
 * Deno test suite for `longshort-pead-compute-manual` operator-trigger
 * edge function — FP-044 / Signal #2 regression sentinel.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(a) operator JWT wired via authenticateRequest (NOT cron-secret)', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'),
    'unexpected verifyCronSecret — cron-secret is for the cron-only sibling');
});

Deno.test('(b) checkPermissionOrThrow wired with longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes("'longshort.admin'"),
    "unexpected 'longshort.admin' — permission does not exist in live schema");
  assert(!HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.view')"));
});

Deno.test('(b1) POST-only: 405 on non-POST methods', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"));
});

Deno.test('(c) request-body validation: as_of required + format-checked + future-rejected', () => {
  assert(HANDLER_SOURCE.includes("'as_of_required'"));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
  assert(HANDLER_SOURCE.includes("'invalid_json_body'"));
  assert(HANDLER_SOURCE.includes('parseAsOfDate('));
});

Deno.test('(c1) parseAsOfDate accepts valid YYYY-MM-DD', () => {
  const d = parseAsOfDate('2026-05-31');
  assertEquals(d!.toISOString(), '2026-05-31T00:00:00.000Z');
});

Deno.test('(d) FINNHUB_API_KEY checked with structured error code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('FINNHUB_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'finnhub_api_key_unset'"));
  assert(!HANDLER_SOURCE.includes("Deno.env.get('FMP_API_KEY')"),
    'unexpected FMP_API_KEY — Signal #2 is Finnhub per DEC-053');
  assert(!HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'unexpected POLYGON_API_KEY — Signal #2 is Finnhub per DEC-053');
});

Deno.test('(e) dual audit envelope: manual_triggered BEFORE + manual_completed/manual_failed AFTER', () => {
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.manual_completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.pead.compute.manual_failed'"));

  const triggeredIdx = HANDLER_SOURCE.indexOf("'longshort.pead.compute.manual_triggered'");
  const completedIdx = HANDLER_SOURCE.indexOf("'longshort.pead.compute.manual_completed'");
  const failedIdx = HANDLER_SOURCE.indexOf("'longshort.pead.compute.manual_failed'");
  assert(triggeredIdx > 0 && triggeredIdx < completedIdx);
  assert(triggeredIdx < failedIdx);
});

Deno.test('(f) wall-clock discipline: productionClock only — no new Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
});

Deno.test('(g) orchestrator wiring: createPeadOrchestrator + both Finnhub fetchers + persistSignalComputeLog', () => {
  assert(HANDLER_SOURCE.includes('createPeadOrchestrator(ctx)'));
  assert(HANDLER_SOURCE.includes('FinnhubEpsEstimateFetcher'));
  assert(HANDLER_SOURCE.includes('FinnhubEarningsFetcher'));
  assert(HANDLER_SOURCE.includes('epsEstimate: new FinnhubEpsEstimateFetcher'));
  assert(HANDLER_SOURCE.includes('earnings: new FinnhubEarningsFetcher'));
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('));
  assert(!HANDLER_SOURCE.includes('cross-sectional-momentum/'));
  assert(!HANDLER_SOURCE.includes('short-term-reversal/'));
  assert(!HANDLER_SOURCE.includes('short-interest-change/'));
  assert(!HANDLER_SOURCE.includes('PolygonPriceHistoryFetcher'),
    'wrong fetcher leaked — PEAD is not a price signal');
});