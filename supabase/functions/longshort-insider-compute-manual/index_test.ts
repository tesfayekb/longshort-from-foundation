/**
 * Source-sentinel test for `longshort-insider-compute-manual` operator handler.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(a) operator JWT wired via authenticateRequest (NOT cron-secret)', () => {
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'));
});

Deno.test('(b) checkPermissionOrThrow with longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes("'longshort.admin'"));
});

Deno.test('(b1) POST-only: 405 on non-POST', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"));
});

Deno.test('(c) body validation: as_of required + format-checked + future-rejected', () => {
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

Deno.test('(d) POLYGON_API_KEY checked with structured code', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"));
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"));
});

Deno.test('(e) dual audit envelope: manual_triggered BEFORE + manual_completed/manual_failed AFTER', () => {
  assert(HANDLER_SOURCE.includes("'longshort.insider.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes("'longshort.insider.compute.manual_completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.insider.compute.manual_failed'"));
  const t = HANDLER_SOURCE.indexOf("'longshort.insider.compute.manual_triggered'");
  const c = HANDLER_SOURCE.indexOf("'longshort.insider.compute.manual_completed'");
  const f = HANDLER_SOURCE.indexOf("'longshort.insider.compute.manual_failed'");
  assert(t > 0 && t < c);
  assert(t < f);
});

Deno.test('(f) wall-clock discipline — productionClock only', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
});

Deno.test('(g) orchestrator wiring: createInsiderOrchestrator + 3 fetchers + persist', () => {
  assert(HANDLER_SOURCE.includes('createInsiderOrchestrator(ctx)'));
  assert(HANDLER_SOURCE.includes('PolygonForm4Fetcher'));
  assert(HANDLER_SOURCE.includes('PolygonSharesOutstandingFetcher'));
  assert(HANDLER_SOURCE.includes('PolygonPriceHistoryFetcher'));
  assert(HANDLER_SOURCE.includes('form4: new PolygonForm4Fetcher'));
  assert(HANDLER_SOURCE.includes('sharesOutstanding: new PolygonSharesOutstandingFetcher'));
  assert(HANDLER_SOURCE.includes('priceHistory: new PolygonPriceHistoryFetcher'));
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('));
  assert(!HANDLER_SOURCE.includes('PolygonShortInterestFetcher'));
});