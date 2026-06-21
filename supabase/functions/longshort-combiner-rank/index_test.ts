/**
 * Deno source-sentinel suite for `longshort-combiner-rank` cron edge fn
 * — FP-052 Phase 3.0d / ACT-261 regression contract.
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

Deno.test('(3) createRankerOrchestrator invoked verbatim with {supabase, operator_id}', () => {
  assert(HANDLER_SOURCE.includes('createRankerOrchestrator({'),
    'missing orchestrator factory call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('orch.run(as_of)'), 'missing orch.run(as_of) dispatch');
});

Deno.test('(4) audit envelope — .started / .completed / .failed / .skipped all carry trigger:cron', () => {
  assert(HANDLER_SOURCE.includes("'longshort.combiner.rank.started'"), 'missing .started');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.rank.completed'"), 'missing .completed');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.rank.failed'"), 'missing .failed');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.rank.skipped'"), 'missing .skipped');
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"), 'missing trigger:cron metadata tag');
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_* event on cron handler');
  assert(HANDLER_SOURCE.includes("stage: 'orchestrator_throw'"),
    'missing catch-path stage tag');
});

Deno.test('(5) ALL THREE skip gates emit .skipped with typed reason AND precede the orchestrator (no write)', () => {
  assert(HANDLER_SOURCE.includes("'global_kill_switch_active'"), 'missing kill-switch reason');
  assert(HANDLER_SOURCE.includes("'job_disarmed'"), 'missing job-disarmed reason');
  assert(HANDLER_SOURCE.includes("'assemble_incomplete_for_as_of'"),
    'missing assemble-incomplete reason');
  assert(HANDLER_SOURCE.includes("'__kill_switch__'"),
    'missing kill-switch row id literal');
  const orchIdx = HANDLER_SOURCE.indexOf('createRankerOrchestrator({');
  for (const lit of [
    "'global_kill_switch_active'",
    "'job_disarmed'",
    "'assemble_incomplete_for_as_of'",
  ]) {
    const idx = HANDLER_SOURCE.indexOf(lit);
    assert(idx > 0 && idx < orchIdx, `${lit} gate must precede orchestrator call`);
  }
});

Deno.test('(6) assemble-completion gate uses audit-event marker keyed on as_of_date', () => {
  assert(HANDLER_SOURCE.includes('longshort_audit_logs'),
    'gate must query longshort_audit_logs');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.assemble.completed'"),
    'gate must accept cron .completed marker');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.assemble.manual_completed'"),
    'gate must accept manual_completed marker (manual-then-cron path)');
  assert(HANDLER_SOURCE.includes("'metadata->>as_of_date'"),
    'gate must filter by metadata->>as_of_date for per-as_of structural guarantee');
});

Deno.test('(7) failure-handling contract: 500 reserved for orchestrator throw', () => {
  assert(HANDLER_SOURCE.includes("'cron_combiner_rank_failed'"),
    'missing fatal-error code for orchestrator throw');
  assert(HANDLER_SOURCE.includes('apiSuccess('), 'missing apiSuccess for normal/skip paths');
});

Deno.test('(8) JOB_REGISTRY_ID matches MIG-106 seed id', () => {
  assert(HANDLER_SOURCE.includes("'longshort.combiner_rank.compute'"),
    'JOB_REGISTRY_ID drift vs MIG-106 seed');
});