/**
 * Source-sentinel test for `longshort-options-flow-compute-manual` handler.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) POST + operator JWT + longshort.manage', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"));
  assert(HANDLER_SOURCE.includes('authenticateRequest(req)'));
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret('));
});

Deno.test('(2) parseAsOfDate + future-date guard wired', () => {
  assert(HANDLER_SOURCE.includes('parseAsOfDate(asOfRaw)'));
  assert(HANDLER_SOURCE.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(HANDLER_SOURCE.includes("'as_of_in_future'"));
});

Deno.test('(3) productionClock-only — no Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'));
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly));
  assert(!/Date\.now\s*\(/.test(codeOnly));
});

Deno.test('(4) CRON_SECRET + SUPABASE_URL checked (coordinator → worker hop)', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('CRON_SECRET')"));
  assert(HANDLER_SOURCE.includes("Deno.env.get('SUPABASE_URL')"));
  assert(HANDLER_SOURCE.includes('/functions/v1/longshort-options-flow-worker'));
});

Deno.test('(5) dual audit envelope (manual_triggered + manual_completed/_failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.manual_triggered'"));
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.manual_completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.manual_failed'"));
});

Deno.test('(6) no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
});