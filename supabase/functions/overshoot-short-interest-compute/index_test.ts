/**
 * Deno source-sentinel test suite for `overshoot-short-interest-compute`
 * (FP-069 W3.3.b.i / ACT-460.b.i). Mirrors the shape used by
 * `longshort-short-interest-compute/index_test.ts` and
 * `overshoot-backfill-bars-manual` sentinels — asserts against the
 * committed source text so drift on the load-bearing invariants is
 * caught at deno-test time without spinning the edge runtime.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/`([^`\\]|\\.)*`/g, '``');
}
const CODE_ONLY = stripCommentsAndStrings(HANDLER_SOURCE);

Deno.test('(1) DEC-023 envelope: createHandler + apiSuccess + apiError wired', () => {
  assert(HANDLER_SOURCE.includes("from '../_shared/handler.ts'"), 'missing handler.ts import');
  assert(HANDLER_SOURCE.includes('createHandler(async'), 'missing createHandler wrapper');
  assert(HANDLER_SOURCE.includes('apiSuccess('), 'missing apiSuccess usage');
  assert(HANDLER_SOURCE.includes("from '../_shared/api-error.ts'"), 'missing api-error.ts import');
});

Deno.test('(2) RBAC: overshoot.manage via authenticateRequest + checkPermissionOrThrow', () => {
  assert(HANDLER_SOURCE.includes("from '../_shared/authenticate-request.ts'"),
    'missing authenticate-request import');
  assert(HANDLER_SOURCE.includes("from '../_shared/authorization.ts'"),
    'missing authorization import');
  assert(HANDLER_SOURCE.includes("await authenticateRequest(req)"), 'authenticateRequest not called');
  assert(HANDLER_SOURCE.includes("checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage')"),
    "missing checkPermissionOrThrow('overshoot.manage')");
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'),
    'unexpected verifyCronSecret on manual RBAC-gated handler');
});

Deno.test('(3) wall-clock discipline: productionClock is sole source; no new Date() / Date.now()', () => {
  assert(HANDLER_SOURCE.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs()');
  assert(HANDLER_SOURCE.includes("from '../_shared/longshort-clock.ts'"),
    'missing longshort-clock import (A3 allowlist)');
  assert(!/new\s+Date\s*\(\s*\)/.test(CODE_ONLY), 'wall-clock leak: new Date()');
  assert(!/Date\.now\s*\(/.test(CODE_ONLY), 'wall-clock leak: Date.now()');
  assert(!/performance\.now\s*\(/.test(CODE_ONLY), 'wall-clock leak: performance.now()');
});

Deno.test('(4) three skip gates: kill-switch + job-disarmed + probe modes', () => {
  assert(HANDLER_SOURCE.includes("KILL_SWITCH_ID = '__kill_switch__'"),
    'missing KILL_SWITCH_ID constant');
  assert(HANDLER_SOURCE.includes("JOB_REGISTRY_ID = 'overshoot.short_interest.compute'"),
    'missing JOB_REGISTRY_ID constant');
  assert(HANDLER_SOURCE.includes("isRowDisarmed(KILL_SWITCH_ID)"),
    'missing kill-switch gate call');
  assert(HANDLER_SOURCE.includes("isRowDisarmed(JOB_REGISTRY_ID)"),
    'missing job-disarmed gate call');
  assert(HANDLER_SOURCE.includes("reason: 'global_kill_switch_active'"),
    'missing global_kill_switch_active reason');
  assert(HANDLER_SOURCE.includes("reason: 'job_disarmed'"),
    'missing job_disarmed reason');
  assert(HANDLER_SOURCE.includes("body.probe === 'alpaca'"), 'missing alpaca probe branch');
  assert(HANDLER_SOURCE.includes("body.probe === 'polygon'"), 'missing polygon probe branch');
});

Deno.test('(4a) probe branches short-circuit BEFORE skip gates (probeable when disarmed)', () => {
  const alpacaIdx = HANDLER_SOURCE.indexOf("body.probe === 'alpaca'");
  const polygonIdx = HANDLER_SOURCE.indexOf("body.probe === 'polygon'");
  const killIdx = HANDLER_SOURCE.indexOf('isRowDisarmed(KILL_SWITCH_ID)');
  const disarmIdx = HANDLER_SOURCE.indexOf('isRowDisarmed(JOB_REGISTRY_ID)');
  assert(alpacaIdx > 0 && alpacaIdx < killIdx, 'alpaca probe must precede kill-switch gate');
  assert(polygonIdx > 0 && polygonIdx < killIdx, 'polygon probe must precede kill-switch gate');
  assert(killIdx < disarmIdx, 'kill-switch gate must precede job-disarmed gate');
});

Deno.test('(5) A3 derivation contract: si_pct_float = short_interest / shares byte-verbatim', () => {
  // Anchor to the exact expression from
  // _shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts:334
  assert(HANDLER_SOURCE.includes('r.short_interest / shares'),
    "missing byte-verbatim divide 'r.short_interest / shares' (A3 contract)");
  assert(HANDLER_SOURCE.includes('Number.isFinite(shares) && shares > 0'),
    'missing defensive shares>0 guard mirroring orchestrator.ts:320');
  assert(HANDLER_SOURCE.includes('si_pct_float = null'),
    'missing typed-null fallback when shares unavailable (anti-phantom denominator)');
});

Deno.test('(5a) SI-unavailable ⇒ NO row written (typed absence, never fabricated zero)', () => {
  // The unavailable branch increments the counter and `continue`s without an upsert.
  const marker = "if (siResult.kind === 'unavailable')";
  const idx = HANDLER_SOURCE.indexOf(marker);
  assert(idx > 0, 'missing SI-unavailable branch');
  const window = HANDLER_SOURCE.slice(idx, idx + 400);
  assert(window.includes('siUnavailableCount++'), 'missing siUnavailableCount++');
  assert(window.includes('continue'), 'missing continue (no row written)');
  assert(!window.includes('.upsert('), 'unexpected upsert in SI-unavailable branch');
});

Deno.test('(6) idempotent upsert on the A6 PK (as_of_date, ticker)', () => {
  assert(HANDLER_SOURCE.includes(".from('overshoot_short_interest')"),
    'missing overshoot_short_interest table target');
  assert(HANDLER_SOURCE.includes(".upsert(rows, { onConflict: 'as_of_date,ticker' })"),
    "missing onConflict='as_of_date,ticker' (A6 PK)");
});

Deno.test('(7) source_run_id: invocation UUID stamped on every row', () => {
  assert(HANDLER_SOURCE.includes('const runId = crypto.randomUUID()'),
    'missing per-invocation runId');
  assert(HANDLER_SOURCE.includes('source_run_id: runId'),
    'missing source_run_id: runId in row shape');
});

Deno.test('(8) audit envelope: started + completed + failed + skipped (four verbs)', () => {
  assert(HANDLER_SOURCE.includes("'overshoot.short_interest.compute.started'"));
  assert(HANDLER_SOURCE.includes("'overshoot.short_interest.compute.completed'"));
  assert(HANDLER_SOURCE.includes("'overshoot.short_interest.compute.failed'"));
  assert(HANDLER_SOURCE.includes("'overshoot.short_interest.compute.skipped'"));
  assert(HANDLER_SOURCE.includes("strategyKey: 'overshoot'"),
    'strategy-audit writer must target overshoot key (T4 audit-writer trap)');
  assert(!HANDLER_SOURCE.includes("from '../_shared/audit.ts'"),
    "must NOT import platform '_shared/audit.ts' (T4 audit-writer trap — DEC-033)");
  assert(HANDLER_SOURCE.includes("from '../_shared/strategy-audit.ts'"),
    'missing strategy-audit.ts import');
});

Deno.test('(9) alpaca probe response contract: last-4 only, paper:true, NO secret material', () => {
  const probeIdx = HANDLER_SOURCE.indexOf("body.probe === 'alpaca'");
  const nextGuard = HANDLER_SOURCE.indexOf("body.probe === 'polygon'", probeIdx);
  const alpacaBlock = HANDLER_SOURCE.slice(probeIdx, nextGuard);
  assert(alpacaBlock.includes('acct.slice(-4)'), 'missing last-4 derivation');
  assert(alpacaBlock.includes('account_last4'), 'missing account_last4 field');
  assert(alpacaBlock.includes('paper: true'), 'missing paper:true field');
  // NEVER emits account_number, key, secret, or full-account material.
  assert(!/account_number:\s/.test(alpacaBlock),
    'alpaca probe MUST NOT emit account_number field');
  assert(!/APCA-API-KEY/.test(alpacaBlock),
    'alpaca probe MUST NOT emit APCA-API-KEY material');
});

Deno.test('(10) polygon probe: no DB write; returns status + report_count when reports', () => {
  const polyIdx = HANDLER_SOURCE.indexOf("body.probe === 'polygon'");
  const nextGuard = HANDLER_SOURCE.indexOf('isRowDisarmed(KILL_SWITCH_ID)', polyIdx);
  const polyBlock = HANDLER_SOURCE.slice(polyIdx, nextGuard);
  assert(polyBlock.includes("status: 'reports'"), 'missing reports status');
  assert(polyBlock.includes('report_count: result.reports.length'), 'missing report_count');
  assert(!polyBlock.includes('.upsert('), 'polygon probe MUST NOT upsert');
  assert(!polyBlock.includes('.insert('), 'polygon probe MUST NOT insert');
});

Deno.test('(11) POLYGON_API_KEY missing → structured 500 with polygon_api_key_unset', () => {
  assert(HANDLER_SOURCE.includes("Deno.env.get('POLYGON_API_KEY')"),
    'missing POLYGON_API_KEY env read');
  assert(HANDLER_SOURCE.includes("'polygon_api_key_unset'"),
    'missing polygon_api_key_unset error code');
});

Deno.test('(12) batch caps (DEFECT-3 convention): default 40, max 80, explicit hard-cap 50', () => {
  assert(HANDLER_SOURCE.includes('DEFAULT_FULL_BATCH_SIZE = 40'), 'default batch != 40');
  assert(HANDLER_SOURCE.includes('MAX_FULL_BATCH_SIZE = 80'), 'max batch != 80');
  assert(HANDLER_SOURCE.includes('BATCH_HARD_CAP_EXPLICIT = 50'),
    'explicit-list hard cap != 50');
  assert(HANDLER_SOURCE.includes('resume_from'), 'missing resume_from support');
  assert(HANDLER_SOURCE.includes("body.resume_from"), 'resume_from not read from body');
});

Deno.test('(13) membrane: NO import from forbidden longshort subtrees', () => {
  // Fetchers under _shared/overshoot/* + broker under _shared/overshoot-broker/*
  // are OWNED by overshoot. The A3 allowlist covers only three leaf utils; none
  // of them require direct import in this handler beyond longshort-clock.
  assert(!HANDLER_SOURCE.includes("from '../_shared/longshort-signals/"),
    'forbidden: longshort-signals import');
  assert(!HANDLER_SOURCE.includes("from '../_shared/longshort-combiner/"),
    'forbidden: longshort-combiner import');
  assert(!HANDLER_SOURCE.includes("from '../_shared/longshort-broker/"),
    'forbidden: longshort-broker import');
  assert(!HANDLER_SOURCE.includes("from '../_shared/longshort-execution/"),
    'forbidden: longshort-execution import');
  assert(!HANDLER_SOURCE.includes("from '../_shared/longshort-universe/"),
    'forbidden: direct longshort-universe import');
});

Deno.test('(14) handler path matches job_registry.handler_path registration', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/overshoot-short-interest-compute/index.ts'),
    true,
  );
});

Deno.test('(15) POST-only method guard', () => {
  assert(HANDLER_SOURCE.includes("req.method !== 'POST'"), 'missing POST-only guard');
  assert(HANDLER_SOURCE.includes("'method_not_allowed'"), 'missing method_not_allowed code');
});