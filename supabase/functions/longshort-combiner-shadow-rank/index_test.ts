/**
 * Deno source-sentinel suite for `longshort-combiner-shadow-rank` cron
 * edge fn — FP-052 Phase 3.M-v / ACT-246 regression contract.
 *
 * Same pattern as `longshort-momentum-compute/index_test.ts`:
 * in-process source-string sentinels rather than HTTP roundtrip
 * (the `Deno.serve(createHandler(...))` harness coupling is out of
 * unit scope; full behavioral coverage lives in the orchestrator's
 * own test file).
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('(1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'), 'missing verifyCronSecret call');
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"), 'missing cron-auth import');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron handler — JWT is for the manual-trigger sibling');
});

Deno.test('(2) productionClock is the sole wall-clock source — no new Date() in handler', () => {
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

Deno.test('(3) shadow-rank cron does NOT check POLYGON_API_KEY (signal_observations only)', () => {
  const codeOnly = HANDLER_SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!codeOnly.includes('POLYGON_API_KEY'),
    'shadow-rank reads signal_observations — must NOT depend on Polygon');
  assert(!codeOnly.includes('PolygonPriceHistoryFetcher'),
    'shadow-rank must not import the Polygon fetcher');
});

Deno.test('(4) createShadowRankerOrchestrator invoked with {supabase, operator_id}', () => {
  assert(HANDLER_SOURCE.includes('createShadowRankerOrchestrator({'),
    'missing createShadowRankerOrchestrator call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('orch.run(as_of)'), 'missing orch.run(as_of) dispatch');
});

Deno.test('(5) audit envelope mirrors momentum-compute: .started / .completed / .failed with trigger:cron', () => {
  assert(HANDLER_SOURCE.includes("'longshort.combiner.shadow_rank.started'"), 'missing .started event');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.shadow_rank.completed'"), 'missing .completed event');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.shadow_rank.failed'"), 'missing .failed event');
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"), 'missing trigger:cron metadata tag');
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_* event on cron handler');
  assert(HANDLER_SOURCE.includes("stage: 'orchestrator_throw'"),
    'missing catch-path stage tag');
});

Deno.test('(6) failure-handling contract: 500 reserved for orchestrator throw', () => {
  assert(HANDLER_SOURCE.includes("'cron_combiner_shadow_rank_failed'"),
    'missing fatal-error code for orchestrator throw');
  // 200-on-failed: outcome==='failed' must still reach apiSuccess.
  assert(HANDLER_SOURCE.includes('apiSuccess('), 'missing apiSuccess for normal-completion path');
});