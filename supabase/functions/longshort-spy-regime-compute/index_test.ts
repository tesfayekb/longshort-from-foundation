/**
 * Source-sentinel test suite for `longshort-spy-regime-compute` cron edge
 * function (FP-052.2 / 3.2-b). Mirrors the
 * `longshort-short-interest-carry-compute/index_test.ts` discipline:
 * behavioral assertions rest on source-text patterning (NOT DB roundtrip)
 * since this commit must not touch live data.
 *
 * Pins:
 *   - cron-auth wired + auth-first ordering
 *   - productionClock sole wall-clock source; no `new Date()` / `Date.now()`
 *   - typed-fail-loud DISTINCT reasons forwarded into the `.failed` audit
 *     event (DEC-066 §(e))
 *   - NO FEATURE_ORDER / lgbm-inference / feature_contract touch
 *   - NO assembler edit
 *   - sentinel ticker `__MARKET__` is the persistence target
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
}

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
  const polygonIdx = HANDLER_SOURCE.indexOf("Deno.env.get('POLYGON_API_KEY')");
  const productionClockIdx = HANDLER_SOURCE.indexOf('productionClock.getWallClockTs()');
  const auditIdx = HANDLER_SOURCE.indexOf('writeStrategyAuditEvent({');
  assert(cronIdx > 0);
  assert(cronIdx < polygonIdx, 'verifyCronSecret must precede POLYGON_API_KEY read');
  assert(cronIdx < productionClockIdx, 'verifyCronSecret must precede productionClock read');
  assert(cronIdx < auditIdx, 'verifyCronSecret must precede any audit-event write');
});

Deno.test('(2) productionClock is the SOLE wall-clock source — no Date.now() / new Date() leak', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs() call');
  const code = codeOnly(HANDLER_SOURCE);
  assert(!/new\s+Date\s*\(\s*\)/.test(code), 'wall-clock leak: new Date()');
  assert(!/Date\.now\s*\(/.test(code), 'wall-clock leak: Date.now()');
  assert(!/performance\.now\s*\(/.test(code), 'wall-clock leak: performance.now()');
});

Deno.test('(3) POLYGON_API_KEY required (SPY fetch is Polygon-backed)', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'missing POLYGON_API_KEY env read');
  assert(HANDLER_SOURCE.includes('polygon_api_key_missing'),
    'missing typed 500 on missing POLYGON_API_KEY');
});

Deno.test('(4) createRegimeOrchestrator invoked with priceHistory + supabase + operator_id', () => {
  assert(HANDLER_SOURCE.includes('createRegimeOrchestrator(ctx).run(as_of)'),
    'orchestrator must be driven by injected as_of');
  assert(HANDLER_SOURCE.includes('supabase: supabaseAdmin'));
  assert(HANDLER_SOURCE.includes('operator_id: DEFAULT_OPERATOR_ID'));
  assert(HANDLER_SOURCE.includes('priceHistory: new PolygonPriceHistoryFetcher('));
});

Deno.test('(5) all three cron audit events wired (.started / .completed / .failed), all trigger:cron', () => {
  assert(HANDLER_SOURCE.includes("'longshort.spy_regime.compute.started'"));
  assert(HANDLER_SOURCE.includes("'longshort.spy_regime.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'longshort.spy_regime.compute.failed'"));
  assert(!HANDLER_SOURCE.includes('manual_triggered'), 'unexpected manual_* event on cron handler');
  assert(HANDLER_SOURCE.includes("trigger: 'cron'"), "missing trigger: 'cron' metadata");
});

Deno.test('(6) typed-fail-loud reasons forwarded verbatim into failed-audit metadata (DEC-066 §(e))', () => {
  // The handler does not hardcode the strings — it forwards
  // `result.failure_reason` from the orchestrator. Pin the forwarding wiring.
  assert(HANDLER_SOURCE.includes('failure_reason: result.failure_reason'),
    'failed audit must carry orchestrator.failure_reason verbatim');
  // And the orchestrator MUST be the source of the distinct typed strings;
  // re-read that file to confirm both reasons exist as DISTINCT literals.
  const orchSrc = Deno.readTextFileSync(
    new URL('../_shared/longshort-signals/market-regime/regime-orchestrator.ts', import.meta.url),
  );
  assert(orchSrc.includes("'regime_data_missing_current_bar'"),
    'orchestrator missing typed regime_data_missing_current_bar');
  assert(orchSrc.includes("'regime_data_insufficient_history'"),
    'orchestrator missing typed regime_data_insufficient_history');
});

Deno.test('(7) NO FEATURE_ORDER / lgbm-inference / feature_contract / EXPECTED_FEATURE_KEY_COUNT touch (3.2-d work, not 3.2-b)', () => {
  const code = codeOnly(HANDLER_SOURCE);
  assert(!code.includes('FEATURE_ORDER'), 'unexpected FEATURE_ORDER reference in 3.2-b handler');
  assert(!code.includes('lgbm-inference'), 'unexpected lgbm-inference import');
  assert(!code.includes('feature_contract'), 'unexpected feature_contract import');
  assert(!code.includes('EXPECTED_FEATURE_KEY_COUNT'),
    'unexpected EXPECTED_FEATURE_KEY_COUNT reference');
  assert(!code.includes('feature_order_hash'),
    'unexpected feature_order_hash reference (hash MUST NOT flip in 3.2-b)');
});

Deno.test('(8) NO assembler / combiner-feature-vectors / shadow-ranker touch', () => {
  const code = codeOnly(HANDLER_SOURCE);
  assert(!code.includes('feature-assembler'),
    'unexpected feature-assembler import (3.2-c work)');
  assert(!code.includes('combiner_feature_vectors'),
    'unexpected combiner_feature_vectors write (3.2-c work)');
  assert(!code.includes('shadow-ranker'), 'unexpected shadow-ranker import');
});

Deno.test('(9) sentinel ticker __MARKET__ is the persistence target (NOT SPY, NOT NULL)', () => {
  const orchSrc = Deno.readTextFileSync(
    new URL('../_shared/longshort-signals/market-regime/regime-orchestrator.ts', import.meta.url),
  );
  assert(orchSrc.includes("export const MARKET_SENTINEL_TICKER = '__MARKET__'"),
    'sentinel ticker constant missing or wrong literal');
  assert(orchSrc.includes("ticker: MARKET_SENTINEL_TICKER"),
    'orchestrator must write rows with ticker=MARKET_SENTINEL_TICKER');
  // Handler references the same constant in telemetry (forensic stability).
  assert(HANDLER_SOURCE.includes('MARKET_SENTINEL_TICKER'),
    'handler must surface MARKET_SENTINEL_TICKER in audit envelope');
});

Deno.test('(10) handler path matches the registered job_registry handler_path', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-spy-regime-compute/index.ts'),
    true,
  );
});

Deno.test('(11) cron_last_fire telemetry wired (success + failed branches both stamp)', () => {
  assert(HANDLER_SOURCE.includes('persistCronLastFire('),
    'missing persistCronLastFire wiring');
  assert(HANDLER_SOURCE.includes("JOB_REGISTRY_ID = 'longshort.spy_regime.compute'"),
    'JOB_REGISTRY_ID must match MIG-117 job_registry.id');
});

Deno.test('(12) NO heal_date / DEC-059 / DEC-060 carry-forward stamping (regime is per-day fresh)', () => {
  const code = codeOnly(HANDLER_SOURCE);
  assert(!code.includes('heal_date'), 'unexpected heal_date stamp on regime handler');
  assert(!code.includes('stampHealDateIfFirst'),
    'unexpected stampHealDateIfFirst import (carry pattern; not regime)');
  assert(!code.includes('carried_forward: true'),
    'regime rows are NEVER carry-forward');
});