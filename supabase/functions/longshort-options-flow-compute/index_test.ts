/**
 * Source-sentinel test for `longshort-options-flow-compute` cron handler.
 * Mirrors `longshort-insider-compute/index_test.ts` (FP-041/042 pattern).
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

Deno.test('(3) CRON_SECRET and SUPABASE_URL checked with structured error codes', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('CRON_SECRET')"));
  assert(HANDLER_SOURCE.includes("'cron_secret_unset'"));
  assert(HANDLER_SOURCE.includes("Deno.env.get('SUPABASE_URL')"));
  assert(HANDLER_SOURCE.includes("'supabase_url_unset'"));
});

Deno.test('(4) runOptionsFlowCoordinator wired with worker URL + cron secret', () => {
  assert(HANDLER_SOURCE.includes('runOptionsFlowCoordinator('));
  assert(HANDLER_SOURCE.includes('/functions/v1/longshort-options-flow-worker'));
  assert(HANDLER_SOURCE.includes('cronSecret,'));
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'));
});

Deno.test('(5) persistSignalComputeLog wired', () => {
  assert(HANDLER_SOURCE.includes('persistSignalComputeLog('));
});

Deno.test('(6) all three audit events wired (.started/.completed/.failed)', () => {
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.options_flow.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'));
});

Deno.test('(7) no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
});