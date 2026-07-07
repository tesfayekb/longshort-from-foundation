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
  OVERSHOOT_CAPACITY_LONG,
  OVERSHOOT_CAPACITY_SHORT,
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
  const idxPipe   = SRC.indexOf('// (a) /v2/clock');
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

// ─────────────────────────────────────────────────────────────────────────
// T3b (ACT-480) source-sentinels — INC-87 fix + regime governor + MIG-157
// persistence + tier plumbing + detector_version probe echo.
// ─────────────────────────────────────────────────────────────────────────

Deno.test('T3b drift canary: capacity constants imported AND void-referenced', () => {
  void OVERSHOOT_CAPACITY_LONG;
  void OVERSHOOT_CAPACITY_SHORT;
  assertStringIncludes(SRC, 'OVERSHOOT_CAPACITY_LONG');
  assertStringIncludes(SRC, 'OVERSHOOT_CAPACITY_SHORT');
  assertStringIncludes(SRC, 'void OVERSHOOT_CAPACITY_LONG');
  assertStringIncludes(SRC, 'void OVERSHOOT_CAPACITY_SHORT');
  assertEquals(OVERSHOOT_CAPACITY_LONG, 36);
  assertEquals(OVERSHOOT_CAPACITY_SHORT, 4);
});

Deno.test('T3b INC-87 STRUCTURAL FIX: capacityPerSide reads ratified capacity constants, NEVER .length of a selections array', () => {
  // Positive: the wiring uses OVERSHOOT_CAPACITY_LONG / _SHORT verbatim.
  assertStringIncludes(
    SRC,
    "const capacityPerSide = sideUpper === 'LONG'\n        ? OVERSHOOT_CAPACITY_LONG\n        : OVERSHOOT_CAPACITY_SHORT;",
  );
  // Negative source-sentinel (INC-87 test-migration guidance): the
  // capacityPerSide assignment MUST NOT read `.length` off any selections
  // array. Strip comments so docstring mentions do not spuriously match,
  // then assert the historical .length denominator is absent from the
  // sizing path.
  const noComments = SRC.split('\n')
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  assertEquals(/capacityPerSide\s*=\s*[^;]*Selections\.length/.test(noComments), false,
    'INC-87 denominator regression: capacityPerSide must NEVER read .length of a selections array (T3b — ACT-480)');
  assertEquals(/longSelections\.length\s*:\s*shortSelections\.length/.test(noComments), false,
    'INC-87 ternary regression: pre-fix per-side .length ternary must be gone from the sizing path');
});

Deno.test('T3b: e.tier selected on the events query + typed on SelectionRow', () => {
  assertStringIncludes(SRC, 'e.tier');
  assertStringIncludes(SRC, "tier: 'T1' | 'T2' | null;");
});

Deno.test('T3b regime governor: computeRegime + shouldThrottleUnderRegime imported; regime_throttled_t2 counter present', () => {
  assertStringIncludes(SRC, "from '../_shared/overshoot/regime.ts'");
  assertStringIncludes(SRC, 'computeRegime,');
  assertStringIncludes(SRC, 'shouldThrottleUnderRegime,');
  assertStringIncludes(SRC, 'regime_throttled_t2: number;');
  assertStringIncludes(SRC, 'regime_throttled_t2: 0,');
});

Deno.test('T3b regime governor: SPY closes fetched from overshoot_daily_bars (ascending after reverse); no fabricated series', () => {
  assertStringIncludes(SRC, "WHERE ticker = 'SPY'");
  assertStringIncludes(SRC, 'ORDER BY trade_date DESC');
  assertStringIncludes(SRC, 'LIMIT 60');
  assertStringIncludes(SRC, '.reverse()');
  assertStringIncludes(SRC, 'computeRegime({ spyClosesAscending })');
});

Deno.test('T3b regime governor: regime_indeterminate fail-open audit is the ONLY branch on !regime.ok — no silent BEAR-gate', () => {
  assertStringIncludes(SRC, "action: 'overshoot.entry.regime_indeterminate'");
  assertStringIncludes(SRC, 'if (regime.ok !== true) {');
  // Structural source-sentinel: the throttle call is guarded by
  // shouldThrottleUnderRegime, which enforces regime.ok===true internally
  // (locked by the phantom-BEAR pin in regime_test.ts). Confirm the
  // engine has NO local BEAR-check that could bypass the helper.
  const noComments = SRC.split('\n')
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  assertEquals(/regime\s*===\s*['"]BEAR['"]/.test(noComments), false,
    'engine must delegate BEAR admission to shouldThrottleUnderRegime — no inline BEAR literal in engine bytes');
});

Deno.test('T3b regime governor: regime_throttled_t2 refusal audits with full signal context + tier + rank_score', () => {
  assertStringIncludes(SRC, 'action: `overshoot.entry.${admission.reason}`');
  assertStringIncludes(SRC, 'tier: sel.tier');
  assertStringIncludes(SRC, 'regime: regimeLabel, regime_signal_context: regimeSignalContext');
});

Deno.test('T3b: submitted audit metadata carries tier + regime + capacity_per_side (sizing echoes)', () => {
  assertStringIncludes(SRC, 'tier: sel.tier, qty: sizing.shares');
  assertStringIncludes(SRC, 'regime: regimeLabel, capacity_per_side: capacityPerSide');
});

Deno.test('T3b MIG-157 persistence: INSERT INTO overshoot_entry_runs after loop end; non-blocking on failure', () => {
  assertStringIncludes(SRC, 'INSERT INTO overshoot_entry_runs');
  assertStringIncludes(SRC, 'regime,\n             regime_signal_context, dry_run)');
  assertStringIncludes(SRC, 'overshoot_entry_runs_insert_failed');
  // Persistence happens AFTER the per-target loop (does not block money-
  // path decisions).
  const idxLoop = SRC.indexOf('for (const sel of selections) {');
  const idxInsert = SRC.indexOf('INSERT INTO overshoot_entry_runs');
  assert(idxLoop > 0 && idxInsert > 0 && idxLoop < idxInsert,
    'MIG-157 INSERT must follow the per-target loop (non-blocking additive persistence)');
});

Deno.test('T3b INC-84 §5 generalization: RATIFIED_DETECTOR_VERSION boot format assert + echo in BOTH probe envelopes', () => {
  assertStringIncludes(SRC, 'RATIFIED_DETECTOR_VERSION');
  assertStringIncludes(SRC, 'boot_assertion_failed_detector_version_malformed');
  const alpacaProbeStart = SRC.indexOf("probe: 'alpaca'");
  const polygonProbeStart = SRC.indexOf("probe: 'polygon'");
  assert(alpacaProbeStart > 0 && polygonProbeStart > 0);
  const alpacaBlock = SRC.slice(alpacaProbeStart, alpacaProbeStart + 800);
  const polygonBlock = SRC.slice(polygonProbeStart, polygonProbeStart + 800);
  assertStringIncludes(alpacaBlock, 'detector_version: RATIFIED_DETECTOR_VERSION');
  assertStringIncludes(polygonBlock, 'detector_version: RATIFIED_DETECTOR_VERSION');
});

Deno.test('T3b response envelope carries regime + regime_signal_context + detector_version + capacity constants', () => {
  assertStringIncludes(SRC, 'regime: regimeLabel,');
  assertStringIncludes(SRC, 'regime_signal_context: regimeSignalContext,');
  assertStringIncludes(SRC, 'detector_version: RATIFIED_DETECTOR_VERSION,');
  assertStringIncludes(SRC, 'capacity_long: OVERSHOOT_CAPACITY_LONG,');
  assertStringIncludes(SRC, 'capacity_short: OVERSHOOT_CAPACITY_SHORT,');
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

// ─────────────────────────────────────────────────────────────────────────
// ACT-466 position_already_open entry gate (money-path).
// Source-sentinel tests: assert the gate exists, is placed correctly, uses
// both sources (open lots + broker positions), refuses on either side, and
// carries full signal context per operator ratification.
// ─────────────────────────────────────────────────────────────────────────

Deno.test('ACT-466: position_already_open counter present in RefusalTally + newTally', () => {
  assertStringIncludes(SRC, 'position_already_open: number;');
  assertStringIncludes(SRC, 'position_already_open: 0,');
});

Deno.test('ACT-466: gate sources BOTH open lots AND broker positions (position-fetcher sibling)', () => {
  assertStringIncludes(SRC, "import { OvershootAlpacaPositionFetcher } from '../_shared/overshoot-broker/alpaca-position-fetcher.ts'");
  assertStringIncludes(SRC, "SELECT symbol, side FROM overshoot_lots WHERE status = 'open'");
  assertStringIncludes(SRC, 'positionFetcher.listOpenPositions(nowTs)');
  assertStringIncludes(SRC, 'const heldTickers = new Set<string>()');
});

Deno.test('ACT-466: same-side open lot → refused (heldTickers set is side-agnostic)', () => {
  // The Set is populated from openLotRows regardless of side, so a same-side
  // open lot triggers the gate. Assert the population loop + the gate check.
  assertStringIncludes(SRC, 'for (const r of openLotRows');
  assertStringIncludes(SRC, 'heldTickers.add(r.symbol)');
  assertStringIncludes(SRC, 'if (heldTickers.has(sel.ticker)) {');
});

Deno.test('ACT-466: opposite-side open lot → refused (either side blocks)', () => {
  // Same Set feed → opposite-side hit is identical control flow. Ratchet the
  // audit-metadata field that records the observed lot sides so W5 can
  // reconstruct which side was already held.
  assertStringIncludes(SRC, 'open_lot_sides: lotHit.map((r) => r.side)');
});

Deno.test('ACT-466: broker-position-no-lot (manual position) → refused', () => {
  // Broker positions populate heldTickers via a separate loop; manual
  // positions (no matching lot) are flagged in metadata.
  assertStringIncludes(SRC, 'for (const p of brokerPositions) if (p.qty !== 0) heldTickers.add(p.symbol)');
  assertStringIncludes(SRC, 'manual_broker_position: lotHit.length === 0 && brokerHit.length > 0');
});

Deno.test('ACT-466: no-position → gate does NOT continue (falls through to Polygon snapshot)', () => {
  // The gate is a guarded `continue`; when the ticker is absent from
  // heldTickers, control flows into fetchPolygonSnapshot (the next line
  // in-source). Assert placement: gate precedes snapshot fetch, snapshot
  // fetch precedes I5.
  const idxGate     = SRC.indexOf('if (heldTickers.has(sel.ticker)) {');
  const idxSnap     = SRC.indexOf('await fetchPolygonSnapshot(env.polygonKey, sel.ticker)');
  const idxI5eval   = SRC.indexOf('evaluateI5PreOpenRecheck({');
  assert(idxGate > 0 && idxSnap > 0 && idxI5eval > 0);
  assert(idxGate < idxSnap, 'position_already_open gate precedes Polygon snapshot');
  assert(idxSnap < idxI5eval, 'Polygon snapshot precedes I5 evaluation');
});

Deno.test('ACT-466: refusal carries full signal context (rank_score + side + ticker)', () => {
  assertStringIncludes(SRC, "action: 'overshoot.entry.position_already_open'");
  // T3b (ACT-480) extended the same metadata line with tier + regime so
  // W5 can slice position_already_open refusals by tier/regime too.
  assertStringIncludes(SRC, 'ticker: sel.ticker, side: sel.side, tier: sel.tier, rank_score: sel.rank_score');
});

Deno.test('ACT-466: gate placement — AFTER detection-linkage / config / equity / session-marker, BEFORE per-target vendor calls', () => {
  const idxLinkage = SRC.indexOf('resolveDetectionRunForEntry');
  const idxMarker  = SRC.indexOf("action: 'overshoot.entry.session_marker'");
  const idxPrefetch = SRC.indexOf('const openLotRows = await sql');
  const idxLoop    = SRC.indexOf('for (const sel of selections) {');
  const idxGate    = SRC.indexOf('if (heldTickers.has(sel.ticker)) {');
  const idxI5      = SRC.indexOf('const i5 = evaluateI5PreOpenRecheck');
  assert(idxLinkage > 0 && idxMarker > 0 && idxPrefetch > 0 && idxLoop > 0 && idxGate > 0 && idxI5 > 0);
  assert(idxLinkage < idxPrefetch, 'detection-linkage precedes prefetch');
  assert(idxMarker  < idxPrefetch, 'session marker precedes prefetch');
  assert(idxPrefetch < idxLoop,    'prefetch precedes per-target loop');
  assert(idxGate    < idxI5,       'position_already_open gate precedes I5');
});