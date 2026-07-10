// ACT-489 — overshoot-fill-sweep unit tests (pure helpers only; no
// Deno.serve import — matches parse-as-of-date_test convention so the
// suite runs without --allow-net / port binds).
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
  OVERSHOOT_FILL_SWEEP_VERSION,
  computeA5SymmetricDiff,
  discoverCandidateRowsForTest,
  shouldInvokePauseForA5Divergence,
  shouldSuppressPauseForDiscoveryShortfall,
  toEtSessionDate,
} from './pure.ts';

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