/**
 * overshoot-entry-run/index_test.ts — FP-069 W3.6.e-ii (ACT-464.e-ii).
 *
 * Source-sentinel testing pattern (parity with exit-run's index_test.ts):
 * the handler is DB + network dependent and cannot execute under Gate-11
 * shape. Tests ratchet the source against every operator-ratified clause.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
  OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
} from '../_shared/overshoot-execution/sizing.ts';
import {
  OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS,
  OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS,
} from '../_shared/overshoot-execution/entry-price-construction.ts';
import { OVERSHOOT_I5_REVERSION_TOLERANCE_PCT } from '../_shared/overshoot-execution/i5-recheck.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('DEC-023 envelope: createHandler + authenticateRequest + overshoot.manage RBAC', () => {
  assertStringIncludes(SRC, "import { createHandler, apiSuccess } from '../_shared/handler.ts'");
  assertStringIncludes(SRC, "import { authenticateRequest } from '../_shared/authenticate-request.ts'");
  assertStringIncludes(SRC, "checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage')");
  assertStringIncludes(SRC, 'Deno.serve(createHandler(');
});

Deno.test('injected clock: productionClock; Date.now() only in I6 window cutoff', () => {
  assertStringIncludes(SRC, "import { productionClock } from '../_shared/longshort-clock.ts'");
  const noComments = SRC.split('\n')
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  const dateNowCount = (noComments.match(/Date\.now\(\)/g) ?? []).length;
  assertEquals(dateNowCount, 1, 'exactly one Date.now(): the I6 manual-window cutoff');
  assertStringIncludes(SRC, 'OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS');
});

Deno.test('boot assertion + drift-canaries precede probe / skip gates / I6 / pipeline', () => {
  assertStringIncludes(SRC, 'RATIFIED_STUDY_RUN_ID');
  assertStringIncludes(SRC, 'boot_assertion_failed_priors_not_found');
  const idxBoot   = SRC.indexOf('boot_assertion_failed_priors_not_found');
  const idxCanary = SRC.indexOf('void OVERSHOOT_SIDE_ALLOCATION_PCT_LONG');
  const idxProbe  = SRC.indexOf('alpaca_probe_failed');
  const idxKS     = SRC.indexOf("strategy_key = 'overshoot'");
  const idxJR     = SRC.indexOf("id = 'overshoot.entry.run'");
  const idxI6     = SRC.indexOf('manual_confirm_token_missing_or_invalid');
  const idxPipe   = SRC.indexOf('(a) /v2/clock');
  assert(idxBoot > 0 && idxCanary > 0 && idxProbe > 0 && idxKS > 0 && idxJR > 0 && idxI6 > 0 && idxPipe > 0);
  assert(idxBoot < idxCanary, 'boot precedes drift-canary');
  assert(idxCanary < idxProbe, 'canary precedes probe');
  assert(idxProbe < idxKS,    'probe precedes kill-switch');
  assert(idxJR    < idxI6,    'disarmed precedes I6');
  assert(idxI6    < idxPipe,  'I6 precedes pipeline');
});

Deno.test('e-i drift canary: all five e-i constants imported AND void-referenced', () => {
  void OVERSHOOT_SIDE_ALLOCATION_PCT_LONG;
  void OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT;
  void OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS;
  void OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS;
  void OVERSHOOT_I5_REVERSION_TOLERANCE_PCT;
  assertStringIncludes(SRC, 'void OVERSHOOT_SIDE_ALLOCATION_PCT_LONG');
  assertStringIncludes(SRC, 'void OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT');
  assertStringIncludes(SRC, 'void OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS');
  assertStringIncludes(SRC, 'void OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS');
  assertStringIncludes(SRC, 'void OVERSHOOT_I5_REVERSION_TOLERANCE_PCT');
});

Deno.test('I6 second-confirm gate: manual path requires token + recent audit row', () => {
  assertStringIncludes(SRC, 'const OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS = 15 * 60 * 1000');
  assertStringIncludes(SRC, "action = 'overshoot.entry.manual_triggered'");
  assertStringIncludes(SRC, "metadata->>'confirm_token' = ${secondConfirmToken}");
  assertStringIncludes(SRC, "apiError(428, 'manual_confirm_token_missing_or_invalid'");
  assertStringIncludes(SRC, 'if (manualConfirm) {');
});

Deno.test('PIN-2 clock seam + market_closed refusal + minutes_to_close', () => {
  assertStringIncludes(SRC, "await client.getJson<AlpacaClockResponse>('/v2/clock')");
  assertStringIncludes(SRC, "reason: 'market_closed'");
  assertStringIncludes(SRC, 'minutes_to_close: minutesToClose');
});

Deno.test('run_already_exists idempotency gate (DUAL-SLOT DST collapse)', () => {
  assertStringIncludes(SRC, "action = 'overshoot.entry.session_marker'");
  assertStringIncludes(SRC, "metadata->>'session_date' = ${sessionDate}");
  assertStringIncludes(SRC, "reason: 'run_already_exists'");
  // Cron path only — manual re-fires are exempt.
  assertStringIncludes(SRC, 'if (!manualConfirm) {');
});

Deno.test('detection-linkage: three ratified typed refusals surfaced + audited', () => {
  assertStringIncludes(SRC, 'resolveDetectionRunForEntry');
  assertStringIncludes(SRC, 'overshoot.entry.detection_linkage_refusal.${linkage.refusal}');
  // The three ratified refusal codes are named in the linkage module and
  // reachable via the linkage.refusal template — asserted by presence of
  // the template audit action + the reason echo.
});

Deno.test('strategy_config_absent typed refusal on missing overshoot_strategy_config row', () => {
  assertStringIncludes(SRC, "action: 'overshoot.entry.strategy_config_absent'");
  assertStringIncludes(SRC, "reason: 'strategy_config_absent'");
  assertStringIncludes(SRC, "account_key = ${OVERSHOOT_ACCOUNT_KEY}");
});

Deno.test('equity_snapshot_unavailable typed refusal on account snapshot failure', () => {
  assertStringIncludes(SRC, 'OvershootAlpacaAccountFetcher');
  assertStringIncludes(SRC, "action: 'overshoot.entry.equity_snapshot_unavailable'");
  assertStringIncludes(SRC, 'sizingBase = accountSnapshot.equity * strategyAllocationPct * marginMultiplier');
});

Deno.test('I5 default-deny with INC-83 sentinel-persists-on-I5-refuse proof', () => {
  assertStringIncludes(SRC, 'evaluateI5PreOpenRecheck');
  assertStringIncludes(SRC, 'overshoot.entry.i5_refusal.${i5.refusal}');
  // Sentinel persistence: on !i5.ok the loop `continue`s BEFORE the UPSERT,
  // leaving the detection-time sentinel (0/0) in overshoot_target_positions.
  assertStringIncludes(SRC, 'inc83_sentinel_persists: true');
  const idxI5refuse = SRC.indexOf('if (!i5.ok) {');
  const idxUpsert   = SRC.indexOf('INSERT INTO overshoot_target_positions');
  assert(idxI5refuse > 0 && idxUpsert > 0 && idxI5refuse < idxUpsert);
});

Deno.test('INC-83 overwrites-on-commit proof: UPSERT with ON CONFLICT DO UPDATE', () => {
  assertStringIncludes(SRC, 'INSERT INTO overshoot_target_positions');
  assertStringIncludes(SRC, 'ON CONFLICT (run_id, ticker, side) DO UPDATE');
  assertStringIncludes(SRC, 'target_shares    = EXCLUDED.target_shares');
  assertStringIncludes(SRC, 'target_notional  = EXCLUDED.target_notional');
});

Deno.test('R-gamma cumulative BP guardrail BEFORE each submission', () => {
  assertStringIncludes(SRC, 'assertBuyingPowerCoversNotional({');
  assertStringIncludes(SRC, 'cumulativeIntendedNotional + sizing.slotNotional');
  assertStringIncludes(SRC, 'overshoot.entry.buying_power_refusal.${bpCheck.refusal}');
});

Deno.test('shortability gate: shorts only; not_shortable typed refusal', () => {
  assertStringIncludes(SRC, 'OvershootAlpacaShortabilityFetcher');
  assertStringIncludes(SRC, "if (sel.side === 'short') {");
  assertStringIncludes(SRC, "'overshoot.entry.shortability_refusal.not_shortable'");
});

Deno.test('entry-price all four typed-refusal counters present in tally', () => {
  assertStringIncludes(SRC, 'polygon_snapshot_unavailable: 0');
  assertStringIncludes(SRC, 'polygon_snapshot_stale: 0');
  assertStringIncludes(SRC, 'polygon_snapshot_malformed: 0');
  assertStringIncludes(SRC, 'polygon_snapshot_crossed: 0');
});

Deno.test('CID + intent contract (W3.6.a): entry intent + attempt run-scoped', () => {
  assertStringIncludes(SRC, "const intent = 'entry' as const");
  assertStringIncludes(SRC, 'buildOvershootClientOrderId({');
  assertStringIncludes(SRC, 'attempt: 0');
});

Deno.test('entry-order shape (A4): LIMIT + day-TIF; alpaca side buy for LONG, sell for SHORT', () => {
  assertStringIncludes(SRC, "type: 'limit'");
  assertStringIncludes(SRC, "time_in_force: 'day'");
  assertStringIncludes(SRC, 'limit_price: priced.limitPrice');
  assertStringIncludes(SRC, "sideUpper === 'LONG' ? 'buy' : 'sell'");
});

Deno.test('never-silent-drop: every named refusal writes to overshoot_audit_logs', () => {
  assertStringIncludes(SRC, "action: `overshoot.entry.i5_refusal.${i5.refusal}`");
  assertStringIncludes(SRC, "action: `overshoot.entry.sizing_refusal.${sizing.refusal}`");
  assertStringIncludes(SRC, "action: `overshoot.entry.buying_power_refusal.${bpCheck.refusal}`");
  assertStringIncludes(SRC, "action: `overshoot.entry.price_refusal.${priced.refusal}`");
  assertStringIncludes(SRC, "action: 'overshoot.entry.submit_failed'");
  assertStringIncludes(SRC, "action: `overshoot.entry.submitted.${intent}`");
});

Deno.test('accounting identity: response envelope carries targets_loaded + orders_submitted + refusal tally', () => {
  assertStringIncludes(SRC, 'targets_loaded:');
  assertStringIncludes(SRC, 'orders_submitted:');
  assertStringIncludes(SRC, 'refusals: tally');
  assertStringIncludes(SRC, 'fill_unfilled_no_lots');
});

Deno.test('dry_run: zero broker submissions (submitter guarded by !dryRun)', () => {
  const idxDryGuard = SRC.indexOf('if (dryRun) {');
  const idxSubmit   = SRC.indexOf('await submitter.submitOrder(');
  assert(idxDryGuard > 0 && idxSubmit > 0 && idxDryGuard < idxSubmit, 'dry-run guard precedes submitOrder');
});

Deno.test('lots on fill (partial-fill: lot written with filled qty; order remains tracked)', () => {
  assertStringIncludes(SRC, 'OvershootAlpacaFillFetcher');
  assertStringIncludes(SRC, 'INSERT INTO overshoot_lots');
  assertStringIncludes(SRC, 'fill.filled_qty > 0');
  assertStringIncludes(SRC, 'fill.avg_fill_price * fill.filled_qty');
});

Deno.test('kill-switch + disarmed skip gates present', () => {
  assertStringIncludes(SRC, "strategy_key = 'overshoot'");
  assertStringIncludes(SRC, "id = 'overshoot.entry.run'");
  assertStringIncludes(SRC, "reason: 'job_disarmed'");
});

Deno.test('POLYGON_API_KEY_PROD_PROBE single-key binding with zero fallback', () => {
  assertStringIncludes(SRC, "Deno.env.get('POLYGON_API_KEY_PROD_PROBE')");
  assertEquals(SRC.includes("|| Deno.env.get('POLYGON_API_KEY')"), false);
});

Deno.test('separation-guard: zero Alpaca market-data consumers (LIVE-PRICE SOURCE CONTRACT)', () => {
  assertEquals(/data\.alpaca\.markets/.test(SRC), false, 'no data.alpaca.markets consumer');
  assertEquals(/\/v2\/stocks\//.test(SRC),        false, 'no /v2/stocks/ consumer');
  assertEquals(/useDataUrl\s*=\s*true|,\s*true\s*\)/.test(SRC), false, 'no useDataUrl=true');
});

Deno.test('probe short-circuit taxonomy: alpaca / polygon only; else 400', () => {
  assertStringIncludes(SRC, 'probe_invalid_expected_alpaca_or_polygon');
  assertStringIncludes(SRC, 'alpaca_probe_failed');
  assertStringIncludes(SRC, 'polygon_probe_failed');
});

Deno.test('single account key ratified for v1 (A3)', () => {
  assertStringIncludes(SRC, "const OVERSHOOT_ACCOUNT_KEY = 'overshoot-paper-primary'");
});