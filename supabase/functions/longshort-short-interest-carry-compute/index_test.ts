/**
 * Deno test suite for `longshort-short-interest-carry-compute` cron edge
 * function — FP-053 / DW-106-c-ii regression sentinel.
 *
 * Source-sentinel pattern (mirrors
 * `longshort-short-interest-compute/index_test.ts`). The behavioral
 * `heal_date` stamp gating is asserted by source-text patterning rather
 * than DB roundtrip (DB-level idempotency is `ON CONFLICT (key) DO
 * NOTHING` inside `stampHealDateIfFirst` — exercised live at deploy time).
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

Deno.test('(3) NO POLYGON_API_KEY / NO Polygon fetcher import (carry is pure-DB)', () => {
  assert(!HANDLER_SOURCE.includes('POLYGON_API_KEY'),
    'unexpected POLYGON_API_KEY env read — carry path is pure-DB');
  assert(!HANDLER_SOURCE.includes('Polygon'),
    'unexpected Polygon import — carry path must not fetch externally');
});

Deno.test('(4) createCarryOrchestrator invoked with pure-DB context (no Polygon ctx fields)', () => {
  assert(HANDLER_SOURCE.includes('createCarryOrchestrator(ctx)'),
    'missing createCarryOrchestrator(ctx) call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(!HANDLER_SOURCE.includes('shortInterest:'),
    'unexpected shortInterest fetcher on carry context');
  assert(!HANDLER_SOURCE.includes('sharesOutstanding:'),
    'unexpected sharesOutstanding fetcher on carry context');
  assert(!HANDLER_SOURCE.includes('priceHistory:'),
    'unexpected priceHistory fetcher on carry context');
});

Deno.test('(5) all three audit events wired (.started / .completed / .failed), all trigger:cron', () => {
  assert(HANDLER_SOURCE.includes("'longshort.short_interest_carry.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.short_interest_carry.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.short_interest_carry.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_triggered on cron handler');
  assert(!HANDLER_SOURCE.includes('manual_completed'),
    'unexpected manual_completed on cron handler');
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"),
    "missing trigger: 'cron' metadata");
});

Deno.test('(6) NO persistSignalComputeLog (carry result is a custom shape; telemetry rides the audit envelope)', () => {
  assert(!HANDLER_SOURCE.includes('persistSignalComputeLog'),
    'unexpected persistSignalComputeLog call — carry result is CarryOrchestratorResult');
  assert(!HANDLER_SOURCE.includes('persist-signal-compute-log'),
    'unexpected persist-signal-compute-log import');
});

Deno.test('(7) handler path matches the registered job_registry handler_path', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-short-interest-carry-compute/index.ts'),
    true,
  );
});

Deno.test('(8) signal_id locked via carry-orchestrator import (no drift)', () => {
  assert(HANDLER_SOURCE.includes(
    "from '../_shared/longshort-signals/short-interest-change/carry-orchestrator.ts'",
  ));
  assert(!HANDLER_SOURCE.includes('short-interest-orchestrator'),
    'must NOT import the native short-interest orchestrator (carry path only)');
  assert(!HANDLER_SOURCE.includes('cross-sectional-momentum/'),
    'must NOT import from cross-sectional-momentum/');
});

Deno.test('(9) stampHealDateIfFirst helper exists, exports key constant, uses INSERT (ON CONFLICT DO NOTHING via DB)', () => {
  assert(HANDLER_SOURCE.includes('export async function stampHealDateIfFirst('),
    'missing exported stampHealDateIfFirst helper');
  assert(HANDLER_SOURCE.includes("HEAL_DATE_CONFIG_KEY = 'dw_106_short_interest_heal_date'"),
    'missing/wrong HEAL_DATE_CONFIG_KEY constant');
  assert(HANDLER_SOURCE.includes(".from('system_config')"),
    'stamp helper must write system_config');
  assert(HANDLER_SOURCE.includes('.insert({ key: HEAL_DATE_CONFIG_KEY'),
    'stamp helper must use plain INSERT (never UPSERT/UPDATE — never overwrite)');
  assert(!HANDLER_SOURCE.includes('.upsert(') || !HANDLER_SOURCE.match(/upsert\([^)]*HEAL_DATE/),
    'stamp helper must NOT upsert the heal_date row (DEC-060 §(iii) permanence)');
  assert(HANDLER_SOURCE.includes("'23505'"),
    'stamp helper must treat unique_violation as already-stamped (ON CONFLICT DO NOTHING analog)');
});

Deno.test('(10) heal_date stamp is GATED on outcome==completed AND carried_count >= 1', () => {
  assert(
    /carried_count\s*>=\s*1/.test(HANDLER_SOURCE),
    'missing carried_count >= 1 gate on heal_date stamp',
  );
  assert(
    /result\.outcome\s*===\s*'completed'\s*&&\s*result\.carried_count\s*>=\s*1/.test(HANDLER_SOURCE),
    "heal_date stamp must be gated on both outcome==='completed' AND carried_count>=1",
  );
  // Stamp call must occur AFTER orchestrator returns and BEFORE the
  // completed/failed audit event so the audit can record stamping outcome.
  const runIdx = HANDLER_SOURCE.indexOf('await orch.run(as_of)');
  const stampIdx = HANDLER_SOURCE.indexOf('stampHealDateIfFirst(supabaseAdmin');
  const completedAuditIdx = HANDLER_SOURCE.indexOf(
    "'longshort.short_interest_carry.compute.completed'",
  );
  assert(runIdx > 0 && stampIdx > runIdx, 'stamp call must follow orchestrator.run');
  assert(stampIdx < completedAuditIdx, 'stamp call must precede the completed audit write');
});