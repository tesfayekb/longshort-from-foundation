// ACT-489 — overshoot-fill-sweep unit tests (pure helpers only; no
// Deno.serve import — matches parse-as-of-date_test convention so the
// suite runs without --allow-net / port binds).
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
  OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT,
  OVERSHOOT_FILL_SWEEP_VERSION,
  computeA5SymmetricDiff,
  discoverCandidateRowsForTest,
  shouldInvokePauseForA5Divergence,
  shouldSuppressPauseForDiscoveryShortfall,
  toEtSessionDate,
  allocateExitFillToLots,
  nextAvgExitPrice,
  realizedPnlDelta,
  OVERSHOOT_EXIT_CID_REGEX_STRING,
  classifyBrokerContinuation,
} from './pure.ts';

// SOURCE_VERSION single-constant rail-guard (mechanical mitigation — CI-RED
// 3c698a5). Every rail assertion here reads from ONE literal so future
// bumps are a one-line edit; half-misses are structurally impossible.
const EXPECTED_SOURCE_VERSION = 'fb5fdf13+fix2+inc148';
const FILL_SWEEP_SRC = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

Deno.test('SOURCE_VERSION rail: fill-sweep index.ts export matches expected literal', () => {
  assert(
    FILL_SWEEP_SRC.includes(`export const SOURCE_VERSION = '${EXPECTED_SOURCE_VERSION}'`),
    `fill-sweep SOURCE_VERSION drift — expected '${EXPECTED_SOURCE_VERSION}'`,
  );
});

Deno.test('toEtSessionDate: DST-safe YYYY-MM-DD for America/New_York', () => {
  // 2026-07-08 13:37:10 UTC = 09:37:10 ET (EDT summer).
  const d = new Date('2026-07-08T13:37:10.000Z');
  assertEquals(toEtSessionDate(d), '2026-07-08');
  // Winter regime: 2026-01-15 13:35:00 UTC = 08:35:00 EST.
  const w = new Date('2026-01-15T13:35:00.000Z');
  assertEquals(toEtSessionDate(w), '2026-01-15');
  // Late-night rollover: 2026-07-09 03:00:00 UTC = 2026-07-08 23:00:00 ET.
  const r = new Date('2026-07-09T03:00:00.000Z');
  assertEquals(toEtSessionDate(r), '2026-07-08');
});

Deno.test('A5 diff: empty when broker and ledger match exactly', () => {
  const broker = new Map([['CBOE|long', { side: 'long', qty: 9 }], ['OLN|long', { side: 'long', qty: 118 }]]);
  const ledger = new Map([['CBOE|long', { side: 'long', qty: 9 }], ['OLN|long', { side: 'long', qty: 118 }]]);
  assertEquals(computeA5SymmetricDiff(broker, ledger), []);
});

Deno.test('A5 diff: broker-only symbol surfaces as ledger_qty=null (broker>ledger)', () => {
  const broker = new Map([['XOM|long', { side: 'long', qty: 17 }]]);
  const ledger = new Map<string, { side: string; qty: number }>();
  const diff = computeA5SymmetricDiff(broker, ledger);
  assertEquals(diff.length, 1);
  assertEquals(diff[0].symbol, 'XOM');
  assertEquals(diff[0].broker_qty, 17);
  assertEquals(diff[0].ledger_qty, null);
});

Deno.test('A5 diff: ledger-only symbol surfaces as broker_qty=null (ledger>broker)', () => {
  const broker = new Map<string, { side: string; qty: number }>();
  const ledger = new Map([['APA|long', { side: 'long', qty: 71 }]]);
  const diff = computeA5SymmetricDiff(broker, ledger);
  assertEquals(diff.length, 1);
  assertEquals(diff[0].symbol, 'APA');
  assertEquals(diff[0].broker_qty, null);
  assertEquals(diff[0].ledger_qty, 71);
});

Deno.test('A5 diff: qty mismatch surfaces both sides', () => {
  const broker = new Map([['PLTR|long', { side: 'long', qty: 19 }]]);
  const ledger = new Map([['PLTR|long', { side: 'long', qty: 18 }]]);
  const diff = computeA5SymmetricDiff(broker, ledger);
  assertEquals(diff.length, 1);
  assertEquals(diff[0].broker_qty, 19);
  assertEquals(diff[0].ledger_qty, 18);
});

Deno.test('A5 diff: side mismatch (long vs short) surfaces', () => {
  const broker = new Map([['STLD|long', { side: 'long', qty: 10 }]]);
  const ledger = new Map([['STLD|short', { side: 'short', qty: 10 }]]);
  const diff = computeA5SymmetricDiff(broker, ledger);
  // Different keys → both surfaced as one-sided diffs.
  assertEquals(diff.length, 2);
});

Deno.test('INC-90 artifact guard: discovery shortfall suppresses pause branch', () => {
  const discoveryShortfall = shouldSuppressPauseForDiscoveryShortfall({
    candidatesDiscovered: 0,
    brokerCount: 18,
    ledgerCount: 0,
  });
  assertEquals(discoveryShortfall, true);
  assertEquals(shouldInvokePauseForA5Divergence({
    diffCount: 18,
    dryRun: false,
    discoveryShortfall,
  }), false);
});

Deno.test('INC-90 A5: genuine post-adoption mismatch still invokes pause branch on live run', () => {
  const discoveryShortfall = shouldSuppressPauseForDiscoveryShortfall({
    candidatesDiscovered: 18,
    brokerCount: 18,
    ledgerCount: 17,
  });
  assertEquals(discoveryShortfall, false);
  assertEquals(shouldInvokePauseForA5Divergence({
    diffCount: 1,
    dryRun: false,
    discoveryShortfall,
  }), true);
});

Deno.test('INC-90 A5: dry-run never invokes pause branch even for genuine mismatch', () => {
  assertEquals(shouldInvokePauseForA5Divergence({
    diffCount: 1,
    dryRun: true,
    discoveryShortfall: false,
  }), false);
});

Deno.test('INC-90 discovery contract: real run 3ab99ad5 submitted.entry shape is discovered without session_date metadata', () => {
  const rows = discoverCandidateRowsForTest([
    {
      action: 'overshoot.entry.submitted.entry',
      created_at: '2026-07-08T13:40:43.631109+00:00',
      metadata: {
        attempt: 0,
        capacity_per_side: 36,
        client_order_id: 'ovs-3ab99ad5-WFRD-L-entry-0',
        correlation_id: '50768d6d-6dcf-4dad-8560-866d11bc2de2',
        i5_reversion_pct: 0.29113924050633316,
        intent: 'entry',
        limit_price: 83.23,
        margin_multiplier: 1,
        minutes_to_close: 379,
        orderSide_semantic: 'buy',
        order_id: 'a0838196-5f5c-4e4d-b73f-c177ae036f26',
        qty: 30,
        regime: 'BULL',
        run_id: '3ab99ad5-a3a6-411e-a9c4-b9f19a75bd4a',
        side: 'long',
        sizingBase: 100000,
        slippage_bps: 50,
        snapshot_age_ms: 2007,
        strategy_allocation_pct: 1,
        ticker: 'WFRD',
        tier: 'T2',
      },
    },
  ], '2026-07-08', new Set());

  assertEquals(rows, [{
    order_id: 'a0838196-5f5c-4e4d-b73f-c177ae036f26',
    ticker: 'WFRD',
    side: 'long',
    client_order_id: 'ovs-3ab99ad5-WFRD-L-entry-0',
    run_id: '3ab99ad5-a3a6-411e-a9c4-b9f19a75bd4a',
  }]);
});

Deno.test('ACT-489 sentinel: fill-sweep never imports exit-timing consumers', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // Exit-clock source of truth is overshoot_lots.entry_ts via
  // computeSessionAge in overshoot-exit-run. Fill-sweep MUST NOT import
  // session-age (would make it a second home for exit timing) and MUST
  // NOT write the T+10 clock into audit metadata.
  if (src.includes("from '../_shared/overshoot-execution/session-age.ts'")) {
    throw new Error('fill-sweep must not import session-age (T+10 clock single-home rule)');
  }
  if (/expected_exit_session/i.test(src)) {
    throw new Error('fill-sweep must not stamp expected_exit_session (single-home: lots.entry_ts)');
  }
  if (!/observability_only_never_consumed_for_exit_timing/.test(src)) {
    throw new Error('fill-sweep must carry the observability_only sentinel in overshoot.lot.opened metadata');
  }
});

Deno.test('ACT-489 sentinel: idempotency uses ON CONFLICT on source_order_id', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  if (!/ON CONFLICT \(source_order_id\) DO NOTHING/.test(src)) {
    throw new Error('fill-sweep must use ON CONFLICT (source_order_id) DO NOTHING for idempotency');
  }
});

Deno.test('ACT-489 sentinel: broker-truth adoption (no self-computed qty/price)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // The INSERT must consume fill.filled_qty and fill.avg_fill_price
  // verbatim — not a limit_price, not our submitted qty.
  if (!/fill\.filled_qty/.test(src) || !/fill\.avg_fill_price/.test(src)) {
    throw new Error('fill-sweep must consume broker fill.filled_qty and fill.avg_fill_price verbatim');
  }
  if (/limit_price\s*\*/.test(src)) {
    throw new Error('fill-sweep must not use limit_price as a cost-basis source');
  }
});

Deno.test('INC-90 sentinel: response envelope carries bundle-content version echo and discovery fingerprint', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(OVERSHOOT_FILL_SWEEP_VERSION.length > 0, 'sweep version must be non-empty');
  assert(OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT.startsWith('sha256:'), 'fingerprint must be labeled');
  if (!/sweep_version:\s*OVERSHOOT_FILL_SWEEP_VERSION/.test(src)) {
    throw new Error('fill-sweep response envelope must echo sweep_version');
  }
  if (!/discovery_query_fingerprint:\s*OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT/.test(src)) {
    throw new Error('fill-sweep response envelope must echo discovery_query_fingerprint');
  }
});

Deno.test('INC-90 sentinel: discovery-shortfall audit exists and kill-switch pause is guarded away', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const shortfallIdx = src.indexOf("action: 'overshoot.fill_sweep.discovery_shortfall'");
  const pauseIdx = src.indexOf('SELECT public.kill_switch_system_pause(');
  assert(shortfallIdx > 0, 'missing discovery_shortfall audit action');
  assert(pauseIdx > 0, 'missing kill_switch_system_pause call for genuine divergence');
  if (!src.includes('shouldInvokePauseForA5Divergence({ diffCount: diffs.length, dryRun, discoveryShortfall })')) {
    throw new Error('kill_switch_system_pause must be gated by discoveryShortfall-aware predicate');
  }
});

Deno.test('INC-97 sentinel: cron secret is authenticated before manual JWT/RBAC', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const cronBranch = src.indexOf("req.headers.has('X-Cron-Secret')");
  const cronVerify = src.indexOf('verifyCronSecret(req)');
  const manualAuth = src.indexOf('authenticateRequest(req)');
  assert(cronBranch > 0, 'missing X-Cron-Secret branch');
  assert(cronVerify > cronBranch, 'cron branch must verify X-Cron-Secret');
  assert(manualAuth > cronVerify, 'manual JWT auth must follow the cron-secret branch');
  if (!src.includes("actorId = CRON_OPERATOR_ID")) {
    throw new Error('cron writes must use the canonical system operator identity');
  }
});

Deno.test('INC-97 sentinel: every live sweep writes its own watchdog heartbeat artifact', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  if (!src.includes("action: 'overshoot.fill_sweep.tick'")) {
    throw new Error('live sweep must write overshoot.fill_sweep.tick');
  }
  if (!src.includes('if (!dryRun) {')) {
    throw new Error('sweep heartbeat must remain live-only');
  }
});

// ─────────────────────────────────────────────────────────────────────
// ACT-493 v1 Turn 3B canaries — M7 exit-fill adoption + overfill safety.
// ─────────────────────────────────────────────────────────────────────

Deno.test('ACT-493 T3B: allocateExitFillToLots — clean partial fill distributes FIFO', () => {
  const r = allocateExitFillToLots({
    brokerFilledQty: 7,
    lots: [
      { lot_id: 'A', qty: 5, filled_qty: 0, remaining_qty: 5 },
      { lot_id: 'B', qty: 5, filled_qty: 0, remaining_qty: 5 },
    ],
  });
  assertEquals(r.overflow, false);
  assertEquals(r.delta_to_apply, 7);
  assertEquals(r.per_lot_deltas.length, 2);
  assertEquals(r.per_lot_deltas[0], { lot_id: 'A', delta_qty: 5, will_close: true });
  assertEquals(r.per_lot_deltas[1], { lot_id: 'B', delta_qty: 2, will_close: false });
});

Deno.test('ACT-493 T3B: allocateExitFillToLots — idempotent when broker cumulative equals prior applied', () => {
  const r = allocateExitFillToLots({
    brokerFilledQty: 5,
    lots: [{ lot_id: 'A', qty: 5, filled_qty: 5, remaining_qty: 0 }],
  });
  assertEquals(r.overflow, false);
  assertEquals(r.delta_to_apply, 0);
  assertEquals(r.per_lot_deltas.length, 0);
});

Deno.test('ACT-493 T3B: OVERFILL HALT — broker over-fills beyond total order intent', () => {
  // Total lot qty is 5, but broker reports filled_qty=6 — double-submit
  // signature. HALT, do not clamp.
  const r = allocateExitFillToLots({
    brokerFilledQty: 6,
    lots: [{ lot_id: 'A', qty: 5, filled_qty: 0, remaining_qty: 5 }],
  });
  assertEquals(r.overflow, true);
  assert(r.overflow_reason && r.overflow_reason.includes('broker_over_filled_order'));
  // Critical: NO per-lot delta emitted on overflow.
  assertEquals(r.per_lot_deltas.length, 0);
  assertEquals(r.unallocated_residual, 1);
});

Deno.test('ACT-493 T3B: OVERFILL HALT — cumulative would push filled_qty past qty', () => {
  // Lot already has 3/5 filled; broker cumulative reports 8 — that would
  // push this lot to 8 filled on a 5-qty lot. Halt.
  const r = allocateExitFillToLots({
    brokerFilledQty: 8,
    lots: [{ lot_id: 'A', qty: 5, filled_qty: 3, remaining_qty: 2 }],
  });
  assertEquals(r.overflow, true);
  assert(r.overflow_reason);
  assertEquals(r.per_lot_deltas.length, 0);
});

Deno.test('ACT-493 T3B: nextAvgExitPrice — weighted average across partials', () => {
  const p1 = nextAvgExitPrice({
    prevFilledQty: 0, prevAvgExitPrice: null,
    deltaQty: 3, brokerAvgFillPrice: 100,
  });
  assertEquals(p1, 100);
  const p2 = nextAvgExitPrice({
    prevFilledQty: 3, prevAvgExitPrice: 100,
    deltaQty: 2, brokerAvgFillPrice: 110,
  });
  // (100*3 + 110*2) / 5 = 520/5 = 104
  assertEquals(p2, 104);
});

Deno.test('ACT-493 T3B: realizedPnlDelta — sign flips for short side', () => {
  const longPnl = realizedPnlDelta({
    side: 'long', deltaQty: 10, brokerAvgFillPrice: 110, entryAvgPrice: 100,
  });
  assertEquals(longPnl, 100);
  const shortPnl = realizedPnlDelta({
    side: 'short', deltaQty: 10, brokerAvgFillPrice: 110, entryAvgPrice: 100,
  });
  assertEquals(shortPnl, -100);
  const shortWin = realizedPnlDelta({
    side: 'short', deltaQty: 10, brokerAvgFillPrice: 90, entryAvgPrice: 100,
  });
  assertEquals(shortWin, 100);
});

Deno.test('ACT-493 T3B: exit CID regex string byte-matches the exit-run handler', async () => {
  // Byte-identical to overshoot-exit-run's OVERSHOOT_EXIT_CID_REGEX.
  // Any drift causes discovery-side + handler-side to disagree.
  const src = await Deno.readTextFile(
    new URL('../overshoot-exit-run/index.ts', import.meta.url),
  );
  // The handler declares the regex as a JS literal; extract its body.
  const m = src.match(/OVERSHOOT_EXIT_CID_REGEX\s*=\s*\/([^/]+)\//);
  assert(m, 'exit-run must declare OVERSHOOT_EXIT_CID_REGEX literal');
  // JS regex body → normalize the doubled backslash form used in a TS
  // string constant.
  const expected = OVERSHOOT_EXIT_CID_REGEX_STRING.replace(/\\\\/g, '\\');
  assertEquals(m![1], expected);
});

Deno.test('ACT-493 T3B sentinel: fill-sweep has M7 exit-fill loop + overflow HALT + A5 uses remaining_qty', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // M7 loop present.
  assert(
    src.includes("overshoot.exit.submitted.%'"),
    'M7 must discover exit orders via overshoot.exit.submitted.% audit action prefix',
  );
  assert(
    src.includes('allocateExitFillToLots'),
    'M7 must delegate allocation to the pure helper',
  );
  // Overflow → HIGH-severity typed audit, no silent clamp.
  assert(
    src.includes("action: 'overshoot.exit_fill_overflow'"),
    'overflow must emit overshoot.exit_fill_overflow typed audit',
  );
  assert(
    src.includes("severity: 'high'"),
    'exit_fill_overflow audit must be severity=high',
  );
  assert(
    src.includes('halted_no_clamp'),
    'overflow must halt without clamping — silent clamp is forbidden',
  );
  // exit_attempts resets on ANY fill (partial included) per M4a intent.
  assert(
    src.includes('exit_attempts         = 0'),
    'exit_attempts must reset to 0 on any per-lot fill (M4a intent)',
  );
  assert(
    src.includes('exit_attempts_reset_to_zero: true'),
    'exit_attempts_reset_to_zero must be recorded in the applied-audit metadata',
  );
  // A5 semantics: SUM(remaining_qty) not SUM(qty).
  assert(
    src.includes('SUM(remaining_qty)::float8 AS qty'),
    'A5 reconcile must SUM(remaining_qty), not SUM(qty)',
  );
  // Exit discovery fingerprint threaded into response.
  assert(
    src.includes('exit_discovery_query_fingerprint'),
    'response must expose exit_discovery_query_fingerprint for arm-time evidence',
  );
});

Deno.test('ACT-493 T3B sentinel: entry-run INSERT overshoot_lots writes tier + remaining_qty at INSERT forward (M8)', async () => {
  const src = await Deno.readTextFile(
    new URL('../overshoot-entry-run/index.ts', import.meta.url),
  );
  assert(
    src.includes('tier, tier_source_event_run_id, tier_source_as_of_date'),
    'entry-run INSERT must include tier + provenance columns',
  );
  assert(
    src.includes('remaining_qty, filled_qty, exit_attempts'),
    'entry-run INSERT must include remaining_qty/filled_qty/exit_attempts at creation',
  );
  assert(
    src.includes('event_run_id: linkage.runId'),
    'entry submitted.entry audit must carry event_run_id for fill-sweep single-homing',
  );
});

Deno.test('ACT-493 T3B sentinel: exit-fill fingerprint is exported and non-empty', () => {
  assert(
    typeof OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT === 'string',
    'fingerprint must be a string',
  );
  assert(
    OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT.startsWith('sha256:'),
    'fingerprint must be sha256-prefixed',
  );
});

// ─────────────────────────────────────────────────────────────────────
// INC-148 — broker-truth continuation reconciliation fixtures.
// Covers BOTH live shapes seen 2026-07-27 with today's real order_ids
// PLUS one arm-B partial mock. Includes a through-sizer assertion that
// the UPDATE'd AMKR lot's corrected qty/cost_basis propagates into
// allocateExitFillToLots (the exit sizer path) — the true-up must
// affect the exit math, not just sit in the row.
// ─────────────────────────────────────────────────────────────────────

Deno.test('INC-148 fixture (live shape): CIEN adopt-if-missing — no existing lot, broker=6 → INSERT', () => {
  // Real order_id captured from overshoot_audit_logs at 2026-07-27.
  const _CIEN_ORDER_ID = '7f1db7f7-61ef-4ccf-a64f-0d188112e4a2';
  const _CIEN_CID = 'ovs-2d51744e-CIEN-L-entry-0';
  const a = classifyBrokerContinuation({
    brokerFilledQty: 6,
    brokerAvgFillPrice: 84.10,
    existingLot: null,
  });
  assertEquals(a.kind, 'adopt_new');
  if (a.kind === 'adopt_new') {
    assertEquals(a.qty, 6);
    // cost_basis = 6 * 84.10 = 504.60
    assertEquals(Math.round(a.cost_basis * 100) / 100, 504.60);
  }
});

Deno.test('INC-148 fixture (live shape): AMKR UPDATE-to-broker — ledger qty=2 → broker=38, true-up propagates', () => {
  // Real order_id captured from overshoot_audit_logs at 2026-07-27.
  // Live ledger row (overshoot_lots, source_order_id=<AMKR order>):
  //   qty=2, cost_basis=127.78, filled_qty=0, remaining_qty=2.
  const _AMKR_ORDER_ID = '672533ee-6913-471b-bdfb-d9abeb8b1ce8';
  const _AMKR_CID = 'ovs-2d51744e-AMKR-L-entry-0';
  const brokerFilledQty = 38;
  const brokerAvg = 63.89; // representative broker average fill price
  const a = classifyBrokerContinuation({
    brokerFilledQty,
    brokerAvgFillPrice: brokerAvg,
    existingLot: { qty: 2, cost_basis: 127.78, filled_qty: 0, remaining_qty: 2 },
  });
  assertEquals(a.kind, 'update_to_broker');
  if (a.kind !== 'update_to_broker') throw new Error('unreachable');
  assertEquals(a.new_qty, 38);
  // cost_basis = 38 * 63.89 = 2427.82
  assertEquals(Math.round(a.new_cost_basis * 100) / 100, 2427.82);
  // remaining_qty = 38 - filled_qty(0) = 38
  assertEquals(a.new_remaining_qty, 38);
  // delta_qty = 38 - 2 = 36 (magnitude of the true-up)
  assertEquals(a.delta_qty, 36);

  // ── THROUGH-SIZER ASSERTION (operator addition, item 4) ────────────
  // Post-UPDATE, feed the corrected lot state into the exit sizer.
  // If the true-up did NOT propagate (stale qty=2), an exit for 5 shares
  // would look like overflow. Under the corrected qty=38, the same 5
  // allocates cleanly to remaining=38 with room to spare — proving the
  // update reached the exit math, not just the row.
  const updatedLot = {
    lot_id: 'AMKR-lot',
    qty: a.new_qty,                    // 38
    filled_qty: 0,
    remaining_qty: a.new_remaining_qty, // 38
  };
  const alloc = allocateExitFillToLots({
    brokerFilledQty: 5,
    lots: [updatedLot],
  });
  assertEquals(alloc.overflow, false);
  assertEquals(alloc.per_lot_deltas.length, 1);
  assertEquals(alloc.per_lot_deltas[0].delta_qty, 5);
  assertEquals(alloc.per_lot_deltas[0].will_close, false);

  // Contrapositive: same 5-share exit against the STALE (pre-fix) qty=2
  // must OVERFLOW-HALT — this is what would have happened if the fix
  // did not propagate.
  const staleAlloc = allocateExitFillToLots({
    brokerFilledQty: 5,
    lots: [{ lot_id: 'AMKR-lot', qty: 2, filled_qty: 0, remaining_qty: 2 }],
  });
  assertEquals(staleAlloc.overflow, true);
});

Deno.test('INC-148 fixture (arm-B partial mock): broker=4 of 10 with existing lot qty=10, filled=0 → update remaining to 4', () => {
  // Arm-B (L-01 randomization within the covered pathway) mock partial-
  // fill continuation: broker cumulative filled_qty is less than the
  // original submitted qty, and the ledger row still reflects the full
  // submitted qty from the initial adoption. The classifier must UPDATE
  // to broker truth (qty=4, remaining=4, cost=4*avg), not silently pass.
  const brokerFilledQty = 4;
  const brokerAvg = 25.00;
  const a = classifyBrokerContinuation({
    brokerFilledQty,
    brokerAvgFillPrice: brokerAvg,
    existingLot: { qty: 10, cost_basis: 250.00, filled_qty: 0, remaining_qty: 10 },
  });
  assertEquals(a.kind, 'update_to_broker');
  if (a.kind !== 'update_to_broker') throw new Error('unreachable');
  assertEquals(a.new_qty, 4);
  assertEquals(a.new_cost_basis, 100);
  assertEquals(a.new_remaining_qty, 4);
  assertEquals(a.delta_qty, -6);
});

Deno.test('INC-148 classifier: exact broker match → no_change (idempotent)', () => {
  const a = classifyBrokerContinuation({
    brokerFilledQty: 10,
    brokerAvgFillPrice: 100,
    existingLot: { qty: 10, cost_basis: 1000, filled_qty: 0, remaining_qty: 10 },
  });
  assertEquals(a.kind, 'no_change');
});

Deno.test('INC-148 sentinel: index.ts discovery removes NOT-IN filter (sanctioned pathway captures continuation)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // The pre-fix NOT-IN clause hid partial-fill continuation from every
  // subsequent sweep tick. It MUST be gone.
  if (/NOT IN \(\s*SELECT source_order_id::text\s+FROM overshoot_lots/.test(src)) {
    throw new Error('INC-148: discovery query still excludes existing source_order_ids via NOT IN — continuation invisible');
  }
  // The reconciliation branch MUST be present.
  assert(
    src.includes('classifyBrokerContinuation'),
    'INC-148: fill-sweep must invoke classifyBrokerContinuation',
  );
  assert(
    src.includes("action: 'overshoot.lot.updated_by_partial_continuation'"),
    'INC-148: update branch must emit typed audit overshoot.lot.updated_by_partial_continuation',
  );
  assert(
    src.includes('lots_updated_by_partial_continuation'),
    'INC-148: response envelope must expose lots_updated_by_partial_continuation',
  );
});