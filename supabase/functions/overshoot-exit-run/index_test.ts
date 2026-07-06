/**
 * overshoot-exit-run/index_test.ts — FP-069 W3.6.d-ii (ACT-463.d-ii).
 *
 * Source-sentinel testing pattern (same posture as detection-run's
 * index_test.ts): the handler is DB + network dependent and cannot execute
 * under Gate-11's no-network / no-DB shape. Tests here ratchet the source
 * against every operator-ratified contract clause:
 *   - DEC-023 envelope + overshoot.manage RBAC + productionClock (no
 *     Date.now() in the kernel path — Date.now() appears ONLY in the I6
 *     manual-window cutoff, which is non-money, non-decision, and
 *     documented at the call site).
 *   - Boot assertion (RATIFIED_STUDY_RUN_ID) BEFORE probe short-circuit
 *     BEFORE the two skip gates BEFORE the I6 gate BEFORE the pipeline.
 *   - The three W3.6.d-i exported constants are IMPORTED and referenced
 *     (drift-canary) so an export rename lands at deploy, not first fire.
 *   - I6 manual-confirm gate: 428 when token missing/invalid; cron path
 *     exempt (manualConfirm branch only).
 *   - Every named refusal has an audit-write path (never-silent-drop).
 *   - Accounting identity in the response envelope.
 *   - Separation-guard: zero data.alpaca.markets / /v2/stocks/ consumers
 *     in this file (W3.6.d/e enforcement per the standing directive).
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS,
} from '../_shared/overshoot-execution/session-age.ts';
import {
  OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS,
  OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS,
} from '../_shared/overshoot-execution/exit-price-construction.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('DEC-023 envelope: createHandler + authenticateRequest + overshoot.manage RBAC', () => {
  assertStringIncludes(SRC, "import { createHandler, apiSuccess } from '../_shared/handler.ts'");
  assertStringIncludes(SRC, "import { authenticateRequest } from '../_shared/authenticate-request.ts'");
  assertStringIncludes(SRC, "checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage')");
  assertStringIncludes(SRC, 'Deno.serve(createHandler(');
});

Deno.test('injected clock: productionClock; Date.now() only in I6 window cutoff (documented)', () => {
  assertStringIncludes(SRC, "import { productionClock } from '../_shared/longshort-clock.ts'");
  // Strip line-/block-comments before counting Date.now() references so
  // docstring mentions do not spuriously match.
  const noComments = SRC.split('\n')
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  const dateNowCount = (noComments.match(/Date\.now\(\)/g) ?? []).length;
  assertEquals(dateNowCount, 1, 'exactly one Date.now(): the I6 manual-window cutoff (non-money, non-decision)');
  assertStringIncludes(SRC, 'OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS');
});

Deno.test('boot assertion: BEFORE probe short-circuit AND before skip gates AND before I6 gate', () => {
  assertStringIncludes(SRC, 'RATIFIED_STUDY_RUN_ID');
  assertStringIncludes(SRC, 'RATIFIED_PARAM_GRID_HASH_PREFIX');
  assertStringIncludes(SRC, 'boot_assertion_failed_priors_not_found');
  const idxBoot   = SRC.indexOf('boot_assertion_failed_priors_not_found');
  const idxProbe  = SRC.indexOf('alpaca_probe_failed');
  const idxKS     = SRC.indexOf("strategy_key = 'overshoot'");
  const idxJR     = SRC.indexOf("id = 'overshoot.exit.run'");
  const idxI6     = SRC.indexOf('manual_confirm_token_missing_or_invalid');
  const idxPipe   = SRC.indexOf('(a) /v2/clock');
  assert(idxBoot > 0 && idxProbe > 0 && idxKS > 0 && idxJR > 0 && idxI6 > 0 && idxPipe > 0);
  assert(idxBoot < idxProbe, 'boot precedes probe');
  assert(idxBoot < idxKS,    'boot precedes kill-switch');
  assert(idxBoot < idxJR,    'boot precedes disarmed gate');
  assert(idxProbe < idxKS,   'probe short-circuit precedes kill-switch');
  assert(idxProbe < idxJR,   'probe short-circuit precedes disarmed gate');
  assert(idxJR    < idxI6,   'disarmed gate precedes I6');
  assert(idxI6    < idxPipe, 'I6 precedes pipeline');
});

Deno.test('d-i drift canary: the three exported constants are imported AND referenced', () => {
  // Trigger evaluation so the linter proves imports are load-bearing.
  void OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS;
  void OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS;
  void OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS;
  assertStringIncludes(SRC, 'OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS');
  assertStringIncludes(SRC, 'OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS');
  assertStringIncludes(SRC, 'OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS');
  // Each constant is `void`-referenced in the boot block.
  assertStringIncludes(SRC, 'void OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS');
  assertStringIncludes(SRC, 'void OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS');
  assertStringIncludes(SRC, 'void OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS');
});

Deno.test('I6 second-confirm gate: manual path requires token + recent audit row (15-min window)', () => {
  assertStringIncludes(SRC, 'const OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS = 15 * 60 * 1000');
  assertStringIncludes(SRC, "action = 'overshoot.exit.manual_triggered'");
  assertStringIncludes(SRC, "metadata->>'confirm_token' = ${secondConfirmToken}");
  assertStringIncludes(SRC, "apiError(428, 'manual_confirm_token_missing_or_invalid'");
  // Cron path (manualConfirm !== true) is exempt: the I6 block is guarded
  // by `if (manualConfirm)`.
  assertStringIncludes(SRC, 'if (manualConfirm) {');
});

Deno.test('never-silent-drop: every named refusal writes to overshoot_audit_logs', () => {
  assertStringIncludes(SRC, "action: `overshoot.exit.reconciliation_refusal.${r.status}`");
  assertStringIncludes(SRC, "action: `overshoot.exit.price_refusal.${priced.refusal}`");
  assertStringIncludes(SRC, "action: 'overshoot.exit.submit_failed'");
  assertStringIncludes(SRC, "action: `overshoot.exit.submitted.${intent}`");
});

Deno.test('accounting identity: response envelope carries positions_examined + exits_submitted + refusal tally', () => {
  assertStringIncludes(SRC, 'positions_examined:');
  assertStringIncludes(SRC, 'exits_submitted:');
  assertStringIncludes(SRC, 'refusals: tally');
  assertStringIncludes(SRC, 'session_age_no_fire');
  assertStringIncludes(SRC, 'submissions_failed');
});

Deno.test('dry_run: zero broker submissions (submitter guarded by !dryRun)', () => {
  // The submitter POST lives after `if (dryRun) { ... continue; }`.
  const idxDryGuard = SRC.indexOf('if (dryRun) {');
  const idxSubmit   = SRC.indexOf('await submitter.submitOrder(');
  assert(idxDryGuard > 0 && idxSubmit > 0 && idxDryGuard < idxSubmit, 'dry-run guard precedes submitOrder');
});

Deno.test('CID + intent contract (W3.6.a): exit_time on cron, exit_manual on manual', () => {
  assertStringIncludes(SRC, "const intent = manualConfirm ? 'exit_manual' : 'exit_time'");
  assertStringIncludes(SRC, 'buildOvershootClientOrderId({');
  assertStringIncludes(SRC, 'attempt: 0');
});

Deno.test('exit-order shape (A4): LIMIT + day-TIF via order submitter', () => {
  assertStringIncludes(SRC, "type: 'limit'");
  assertStringIncludes(SRC, "time_in_force: 'day'");
  assertStringIncludes(SRC, 'limit_price: priced.limitPrice');
});

Deno.test('PIN-2 clock seam: /v2/clock consumed + market_closed refusal + minutes_to_close recorded', () => {
  assertStringIncludes(SRC, "await client.getJson<AlpacaClockResponse>('/v2/clock')");
  assertStringIncludes(SRC, "reason: 'market_closed'");
  assertStringIncludes(SRC, 'minutes_to_close: clockSnap.minutesToClose');
});

Deno.test('kill-switch + disarmed skip gates present', () => {
  assertStringIncludes(SRC, "strategy_key = 'overshoot'");
  assertStringIncludes(SRC, "id = 'overshoot.exit.run'");
  assertStringIncludes(SRC, "reason: 'job_disarmed'");
});

Deno.test('POLYGON_API_KEY_PROD_PROBE single-key binding with zero fallback', () => {
  assertStringIncludes(SRC, "Deno.env.get('POLYGON_API_KEY_PROD_PROBE')");
  assertEquals(SRC.includes("|| Deno.env.get('POLYGON_API_KEY')"), false);
});

Deno.test('separation-guard: zero Alpaca market-data consumers (standing price directive)', () => {
  // No `/v2/stocks/` or `data.alpaca.markets` reads in this file. The
  // W3.6.d/e enforcement clause per the LIVE-PRICE SOURCE CONTRACT.
  // The paper-client's URL allow-list mentions data.alpaca.markets, but
  // this handler does NOT construct a client with useDataUrl=true, does
  // NOT hit /v2/stocks/, and does NOT hit data.alpaca.markets directly.
  assertEquals(/data\.alpaca\.markets/.test(SRC), false, 'no data.alpaca.markets consumer');
  assertEquals(/\/v2\/stocks\//.test(SRC),        false, 'no /v2/stocks/ consumer');
  // useDataUrl=true is FORBIDDEN in overshoot execution paths.
  assertEquals(/useDataUrl\s*=\s*true|,\s*true\s*\)/.test(SRC), false, 'no useDataUrl=true');
});

Deno.test('reconciliation: all four A5 refusal classes surfaced in tally', () => {
  assertStringIncludes(SRC, 'lot_without_broker_position: 0');
  assertStringIncludes(SRC, 'unknown_broker_position: 0');
  assertStringIncludes(SRC, 'side_mismatch: 0');
  assertStringIncludes(SRC, 'qty_mismatch: 0');
});

Deno.test('exit-price: all four typed-refusal counters present in tally', () => {
  assertStringIncludes(SRC, 'polygon_snapshot_unavailable: 0');
  assertStringIncludes(SRC, 'polygon_snapshot_stale: 0');
  assertStringIncludes(SRC, 'polygon_snapshot_malformed: 0');
  assertStringIncludes(SRC, 'polygon_snapshot_crossed: 0');
});

// ── ACT-468 H0: per-lot error isolation ─────────────────────────────────
// The handler is DB + network dependent (see file header). These tests
// prove the isolation contract via source-sentinels: the per-lot body is
// wrapped, the catch classifies via a stage tag, both new typed audit
// actions are emitted, the tally carries the new counters, and the run-
// level boundary is stated explicitly.

Deno.test('ACT-468 H0: per-lot try wraps the for-body immediately after loop header', () => {
  const idxFor  = SRC.indexOf('for (const m of report.matched)');
  const idxTry  = SRC.indexOf('try {', idxFor);
  const idxCase = SRC.indexOf("perLotStage: 'session_age_query'", idxFor);
  assert(idxFor > 0 && idxTry > 0 && idxCase > 0);
  assert(idxCase < idxTry || idxTry - idxFor < 800, 'try appears near top of for-body');
  // The catch classifies via stage tag, not by parsing error messages.
  assertStringIncludes(SRC, "perLotStage === 'session_age_query' ? 'session_age_query_failed'");
  assertStringIncludes(SRC, "perLotStage === 'snapshot_fetch'  ? 'snapshot_fetch_failed'");
  assertStringIncludes(SRC, "'per_lot_unexpected'");
});

Deno.test('ACT-468 H0: catch continues the loop (never abandons remaining lots)', () => {
  // The per-lot catch block MUST end with `continue;` — proves that a
  // failure on lot N does not abort lots N+1..end.
  const idxCatch = SRC.indexOf('} catch (perLotErr) {');
  assert(idxCatch > 0, 'per-lot catch exists');
  const catchBody = SRC.slice(idxCatch, idxCatch + 2400);
  assertStringIncludes(catchBody, 'continue;');
  // Tally increment happens BEFORE the audit write so a failing audit
  // still records the event.
  assertStringIncludes(catchBody, 'tally.session_age_query_failed += 1');
  assertStringIncludes(catchBody, 'tally.snapshot_fetch_failed += 1');
  assertStringIncludes(catchBody, 'tally.per_lot_unexpected += 1');
});

Deno.test('ACT-468 H0: typed per-lot failure audit actions emitted for both new classes', () => {
  assertStringIncludes(SRC, 'overshoot.exit.${cls}');
  // Both new class strings appear as tally keys + classification literals.
  assertStringIncludes(SRC, "'session_age_query_failed'");
  assertStringIncludes(SRC, "'snapshot_fetch_failed'");
});

Deno.test('ACT-468 H0: new tally counters wired in newTally() and RefusalTally', () => {
  assertStringIncludes(SRC, 'session_age_query_failed: number');
  assertStringIncludes(SRC, 'snapshot_fetch_failed: number');
  assertStringIncludes(SRC, 'per_lot_unexpected: number');
  assertStringIncludes(SRC, 'session_age_query_failed: 0');
  assertStringIncludes(SRC, 'snapshot_fetch_failed: 0');
  assertStringIncludes(SRC, 'per_lot_unexpected: 0');
});

Deno.test('ACT-468 H0: run-level failures NOT per-lot-wrapped — boundary stated explicitly', () => {
  assertStringIncludes(SRC, 'PER-LOT ERROR ISOLATION BOUNDARY');
  assertStringIncludes(SRC, 'RUN-LEVEL failures');
  // Run-level failures still return via the outer catch (500 unhandled).
  assertStringIncludes(SRC, "return apiError(500, 'exit_run_unhandled_error'");
  // Boot / clock / positions / open-lots calls remain OUTSIDE the per-lot
  // for-loop — proven by their source-order position preceding the loop.
  const idxFor       = SRC.indexOf('for (const m of report.matched)');
  const idxClock     = SRC.indexOf("await client.getJson<AlpacaClockResponse>('/v2/clock')");
  const idxPositions = SRC.indexOf('positionFetcher.listOpenPositions');
  const idxOpenLots  = SRC.indexOf('WHERE status = \'open\'');
  assert(idxClock > 0 && idxClock < idxFor,     'clock fetch is run-level');
  assert(idxPositions > 0 && idxPositions < idxFor, 'positions fetch is run-level');
  assert(idxOpenLots > 0 && idxOpenLots < idxFor,   'open-lots SELECT is run-level');
});

Deno.test('ACT-468 H0: accounting identity docstring lists new refusal classes', () => {
  assertStringIncludes(SRC, '+ session_age_query_failed');
  assertStringIncludes(SRC, '+ snapshot_fetch_failed');
  assertStringIncludes(SRC, '+ per_lot_unexpected');
});

Deno.test('session-age (PIN-1): SPY prior-session query strictly > entry_ts::date; earliest lot anchors', () => {
  assertStringIncludes(SRC, "WHERE ticker = 'SPY'");
  assertStringIncludes(SRC, 'trade_date > (');
  assertStringIncludes(SRC, 'SELECT MIN(entry_ts)::date FROM overshoot_lots');
  assertStringIncludes(SRC, 'computeSessionAge({');
  assertStringIncludes(SRC, 'shouldFireTimeExit');
});

Deno.test('probe short-circuit taxonomy: alpaca / polygon only; else 400', () => {
  assertStringIncludes(SRC, 'probe_invalid_expected_alpaca_or_polygon');
  assertStringIncludes(SRC, 'alpaca_probe_failed');
  assertStringIncludes(SRC, 'polygon_probe_failed');
});