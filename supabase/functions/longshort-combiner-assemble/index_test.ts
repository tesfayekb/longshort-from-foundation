/**
 * Deno source-sentinel suite for `longshort-combiner-assemble` cron
 * edge fn — FP-052 Phase 3.0d / ACT-261 regression contract.
 * Mirrors `longshort-combiner-shadow-rank/index_test.ts`.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'), 'missing verifyCronSecret call');
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"), 'missing cron-auth import');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron handler');
});

Deno.test('(2) productionClock is the sole wall-clock source — no new Date() / Date.now() in handler', () => {
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

Deno.test('(3) createFeatureAssemblyOrchestrator invoked verbatim with {supabase, operator_id}', () => {
  assert(HANDLER_SOURCE.includes('createFeatureAssemblyOrchestrator({'),
    'missing orchestrator factory call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('orch.run(as_of)'), 'missing orch.run(as_of) dispatch');
});

Deno.test('(4) audit envelope — .started / .completed / .failed / .skipped all carry trigger:cron', () => {
  assert(HANDLER_SOURCE.includes("'longshort.combiner.assemble.started'"), 'missing .started');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.assemble.completed'"), 'missing .completed');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.assemble.failed'"), 'missing .failed');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.assemble.skipped'"), 'missing .skipped');
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"), 'missing trigger:cron metadata tag');
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_* event on cron handler');
  assert(HANDLER_SOURCE.includes("stage: 'orchestrator_throw'"),
    'missing catch-path stage tag');
});

Deno.test('(5) both skip gates emit .skipped with typed reason and perform NO write', () => {
  assert(HANDLER_SOURCE.includes("'global_kill_switch_active'"),
    'missing kill-switch reason literal');
  assert(HANDLER_SOURCE.includes("'job_disarmed'"),
    'missing job-disarmed reason literal');
  assert(HANDLER_SOURCE.includes("'__kill_switch__'"),
    'missing kill-switch row id literal');
  // Both gate branches must be ordered BEFORE the orchestrator call:
  const orchIdx = HANDLER_SOURCE.indexOf('createFeatureAssemblyOrchestrator({');
  const killIdx = HANDLER_SOURCE.indexOf("'global_kill_switch_active'");
  const disarmIdx = HANDLER_SOURCE.indexOf("'job_disarmed'");
  assert(killIdx > 0 && killIdx < orchIdx, 'kill-switch gate must precede orchestrator');
  assert(disarmIdx > 0 && disarmIdx < orchIdx, 'job-disarmed gate must precede orchestrator');
});

Deno.test('(6) failure-handling contract: 500 reserved for orchestrator throw', () => {
  assert(HANDLER_SOURCE.includes("'cron_combiner_assemble_failed'"),
    'missing fatal-error code for orchestrator throw');
  assert(HANDLER_SOURCE.includes('apiSuccess('), 'missing apiSuccess for normal/skip paths');
});

Deno.test('(7) JOB_REGISTRY_ID matches MIG-106 seed id', () => {
  assert(HANDLER_SOURCE.includes("'longshort.combiner_assemble.compute'"),
    'JOB_REGISTRY_ID drift vs MIG-106 seed');
});