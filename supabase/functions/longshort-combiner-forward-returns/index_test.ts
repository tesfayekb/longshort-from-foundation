/**
 * Deno source-sentinel suite for `longshort-combiner-forward-returns`
 * cron edge fn — FP-052 Phase 3.M-v / ACT-246 regression contract.
 *
 * Same pattern as `longshort-momentum-compute/index_test.ts` —
 * in-process source-string sentinels. Full behavioral coverage lives
 * in `forward-return-orchestrator_test.ts` (incl. (forch-6) maturation
 * retry contract from ACT-245).
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

Deno.test('(3) POLYGON_API_KEY checked with polygon_api_key_unset 500', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'missing POLYGON_API_KEY env read');
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"),
    'missing polygon_api_key_unset error code');
});

Deno.test('(4) createForwardReturnOrchestrator invoked with {supabase, operator_id, priceHistory}', () => {
  assert(HANDLER_SOURCE.includes('createForwardReturnOrchestrator({'),
    'missing createForwardReturnOrchestrator call');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'), 'missing supabase field');
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'), 'missing operator_id field');
  assert(HANDLER_SOURCE.includes('priceHistory'), 'missing priceHistory field');
  assert(HANDLER_SOURCE.includes('new PolygonPriceHistoryFetcher(polygonApiKey)'),
    'missing PolygonPriceHistoryFetcher construction');
  assert(HANDLER_SOURCE.includes('orch.run(as_of)'), 'missing orch.run(as_of) dispatch');
});

Deno.test('(5) audit envelope mirrors momentum-compute: .started / .completed / .failed with trigger:cron', () => {
  assert(HANDLER_SOURCE.includes("'longshort.combiner.forward_returns.started'"), 'missing .started');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.forward_returns.completed'"), 'missing .completed');
  assert(HANDLER_SOURCE.includes("'longshort.combiner.forward_returns.failed'"), 'missing .failed');
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"), 'missing trigger:cron metadata tag');
  assert(!HANDLER_SOURCE.includes('manual_triggered'),
    'unexpected manual_* event on cron handler');
  assert(HANDLER_SOURCE.includes("stage: 'orchestrator_throw'"),
    'missing catch-path stage tag');
});

Deno.test('(6) failure-handling contract: 200 on partial-fetch (typed-absence is normal); 500 reserved for orchestrator throw', () => {
  assert(HANDLER_SOURCE.includes("'cron_combiner_forward_returns_failed'"),
    'missing fatal-error code for orchestrator throw');
  // 200-on-failed (typed failure_reason) AND 200-on-completed both flow through apiSuccess.
  assert(HANDLER_SOURCE.includes('apiSuccess('), 'missing apiSuccess for normal-completion path');
  // Per-ticker fetch_error rows are reported in by_status metadata, not as a 500.
  assert(HANDLER_SOURCE.includes('by_status'),
    'missing by_status metadata (per-ticker fetch_error / polygon_404 typed-absence reporting)');
});