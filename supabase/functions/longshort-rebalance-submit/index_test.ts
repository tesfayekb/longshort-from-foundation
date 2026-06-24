/**
 * longshort-rebalance-submit index_test — FP-056 E5.5 PHASE-2 (ACT-322).
 *
 * The placement-trigger drove via the exported `runRebalanceSubmit`. NO live
 * broker call (fully fake BrokerInterfaces with capturing stubs). Covers:
 *
 *   (a) FULL_REBALANCE end-to-end: rankings → composer → planRebalance →
 *       submitRebalance → POST /v2/orders calls + SubmissionResults; the
 *       Guardrail-2 SSR fields populate as expected.
 *   (b) SPOT_CHECK long-only: ONE long delta → submitRebalance → one POST;
 *       ssr fields present; shorts list empty.
 *   (c) Load-bearing wiring source-text assertion: the index.ts file imports
 *       and invokes planRebalance + submitRebalance + composePreflightResults
 *       — the WHOLE POINT of Phase 2 is that the orphans are wired.
 *   (d) Reconciliation events are emitted per SubmissionResult.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  runRebalanceSubmit,
  computeEquitySnapshotComponents,
  type EquitySnapshotInput,
  type EquitySnapshotWriter,
  type RebalanceSubmitDeps,
} from './index.ts';
import type { BrokerInterfaces } from '../_shared/longshort-execution/broker-bootstrap.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from '../_shared/longshort-execution/lifecycle-orchestrator.ts';
import type {
  BrokerOrderAcceptance,
  BrokerOrderRequest,
  BrokerPosition,
  BrokerQuote,
} from '../_shared/longshort-broker-interfaces.ts';
import type { RankingRow } from '../_shared/longshort-execution/rebalance-planner.ts';

const TS = new Date('2026-06-24T19:30:00Z');
const OP = '00000000-0000-0000-0000-000000000001';
const CID = 'test-corr-1';

// ── Fake broker layer (capturing stubs; NO network). ─────────────────────

function makeFakeBroker(opts: {
  positions?: BrokerPosition[];
  account_equity?: number;
  available_bp?: number;
  quoteFor?: (sym: string) => BrokerQuote;
  acceptOrder?: boolean;
} = {}): { interfaces: BrokerInterfaces; orders: BrokerOrderRequest[] } {
  const orders: BrokerOrderRequest[] = [];
  const positions = opts.positions ?? [];
  const accept = opts.acceptOrder ?? true;
  const ifaces: BrokerInterfaces = {
    acceptanceFetcher: {
      async fetchOrderAcceptance(order_id, _t, ts) {
        return {
          order_id, symbol: null,
          state: accept ? 'accepted' : 'rejected',
          rejection_reason: accept ? null : 'fake_rejected',
          pending_elapsed_s: 0,
          fetched_at: ts,
        };
      },
    },
    fillFetcher: {
      async fetchFill(order_id, ts) {
        return { order_id, filled: false, filled_qty: 0, avg_fill_price: null, fetched_at: ts };
      },
    },
    submitter: {
      async submitOrder(req: BrokerOrderRequest, ts: Date): Promise<BrokerOrderAcceptance> {
        orders.push(req);
        return {
          order_id: `ord-${orders.length}`,
          client_order_id: req.client_order_id,
          status: 'accepted',
          submitted_at: ts,
        };
      },
    },
    canceller: { async cancelOrder(_o, _t) {} },
    reconstructInFlight: async (_ts) => [],
    quoteFetcher: {
      async fetchQuote(symbol, ts): Promise<BrokerQuote> {
        if (opts.quoteFor) return opts.quoteFor(symbol);
        return {
          symbol, bid: 99.95, ask: 100.05, last: 100, ts, source: 'fake',
        };
      },
    },
    buyingPowerFetcher: {
      async fetchBuyingPower(ts) {
        return {
          available_bp: opts.available_bp ?? 1_000_000,
          account_equity: opts.account_equity ?? 1_000_000,
          fetched_at: ts,
        };
      },
    },
    positionFetcher: {
      async fetchPosition(_s, _t) { return null; },
      async listOpenPositions(_t) { return positions; },
    },
    locateFetcher: {
      async fetchLocate(symbol, ts) {
        return { symbol, available: true, locate_id: 'loc', qty_available: 100_000, fetched_at: ts };
      },
    },
    haltStatusFetcher: {
      async fetchHaltStatus(symbol, ts) {
        return { symbol, halted: false, halt_reason: null, fetched_at: ts };
      },
    },
  };
  return { interfaces: ifaces, orders };
}

function makeCapturingEventWriter(): { writer: ReconciliationEventWriter; events: EmittedExecutionEvent[] } {
  const events: EmittedExecutionEvent[] = [];
  return {
    events,
    writer: { async emit(e, _ts) { events.push(e); } },
  };
}

// ── (a) FULL_REBALANCE end-to-end ────────────────────────────────────────

Deno.test('FULL_REBALANCE drives rankings → composer → planRebalance → submitRebalance', async () => {
  // 2-name book: one long (AAA) + one short (BBB). Single-sided rankings.
  const rankings: RankingRow[] = [
    { ticker: 'AAA', long_rank: 1, short_rank: 999, long_score: 1.0, short_score: -1.0, gics_sector: 'Tech', ranker_source: 'test' },
    { ticker: 'BBB', long_rank: 999, short_rank: 1, long_score: -1.0, short_score: 1.0, gics_sector: 'Health', ranker_source: 'test' },
  ];

  const { interfaces, orders } = makeFakeBroker({});
  const { writer, events } = makeCapturingEventWriter();

  const deps: RebalanceSubmitDeps = {
    brokerFactory: () => interfaces,
    eventWriter: writer,
    rankingsReader: async (_op) => rankings,
    ts: TS,
  };

  const out = await runRebalanceSubmit(
    { mode: 'full_rebalance', operator_id: OP },
    deps,
    CID,
  );

  assertEquals(out.status, 'ok');
  assertEquals(out.mode, 'full_rebalance');
  assertEquals(out.operator_id, OP);
  // Two POSTs — one long + one short.
  assertEquals(orders.length, 2);
  const longOrd = orders.find((o) => o.side === 'buy');
  const shortOrd = orders.find((o) => o.side === 'sell');
  assert(longOrd, 'long buy order placed');
  assert(shortOrd, 'short sell order placed');
  assertEquals(longOrd!.symbol, 'AAA');
  assertEquals(shortOrd!.symbol, 'BBB');

  // Guardrail 2 — clause (n) BINDING fields present.
  assertEquals(out.ssr_unavailable, true);
  assertEquals(out.shorts_placed_without_ssr_check, ['BBB']);
  assert(out.preflight_summary !== undefined, 'preflight summary surfaced');
  assertEquals(out.preflight_summary!.ssr_unavailable, true);

  // One reconciliation_events emission per SubmissionResult.
  assertEquals(events.length, out.submissions.length);
  for (const e of events) assertEquals(e.call_name, 'longshort.rebalance.placement');
});

// ── (b) SPOT_CHECK long-only ─────────────────────────────────────────────

Deno.test('SPOT_CHECK places one LONG-only order; shorts list empty', async () => {
  const { interfaces, orders } = makeFakeBroker({});
  const { writer, events } = makeCapturingEventWriter();

  const out = await runRebalanceSubmit(
    { mode: 'spot_check', symbol: 'SPY', qty: 1, operator_id: OP },
    {
      brokerFactory: () => interfaces,
      eventWriter: writer,
      // Should NOT be called in spot_check — but provide a stub that throws
      // so any accidental invocation is loud.
      rankingsReader: async () => { throw new Error('rankings_should_not_be_read_in_spot_check'); },
      ts: TS,
    },
    CID,
  );

  assertEquals(out.mode, 'spot_check');
  assertEquals(orders.length, 1);
  assertEquals(orders[0].symbol, 'SPY');
  assertEquals(orders[0].side, 'buy', 'long-only');
  assertEquals(orders[0].qty, 1, 'sized to qty=1');

  // No planner consumed → no preflight_summary; the clause-(n) bits still surface.
  assertEquals(out.preflight_summary, undefined);
  assertEquals(out.ssr_unavailable, true);
  assertEquals(out.shorts_placed_without_ssr_check, []);

  assertEquals(events.length, 1);
});

// ── (c) Load-bearing wiring assertion (source-text) ──────────────────────

Deno.test('END-TO-END WIRING: index.ts imports + invokes planRebalance + submitRebalance + composePreflightResults', async () => {
  const src = await Deno.readTextFile(
    new URL('./index.ts', import.meta.url),
  );
  // Import declarations.
  assertStringIncludes(src, "from '../_shared/longshort-execution/preflight-composer.ts'");
  assertStringIncludes(src, "from '../_shared/longshort-execution/rebalance-planner.ts'");
  assertStringIncludes(src, "from '../_shared/longshort-execution/order-submitter.ts'");
  // Named imports.
  assertStringIncludes(src, 'composePreflightResults');
  assertStringIncludes(src, 'planRebalance');
  assertStringIncludes(src, 'submitRebalance');
  // Actual invocations (parens prove the kernels are CALLED, not just imported).
  assertStringIncludes(src, 'composePreflightResults(');
  assertStringIncludes(src, 'planRebalance({');
  assertStringIncludes(src, 'submitRebalance({');
  // Permission gate is the money-path gate.
  assertStringIncludes(src, "checkPermissionOrThrow(authCtx.user.id, 'longshort.execute')");
  // Diagnostic-503 pre-flight.
  assertStringIncludes(src, 'broker_credentials_not_provisioned');
  // SSR posture per clause (n): NO ssrStatusFetcher injected.
  assertStringIncludes(src, '// ssrStatusFetcher: undefined');
});

// ── (d) Guardrail-2 contract: ssr_unavailable + shorts_placed_without_ssr_check
//        live at the TOP level of the response (NOT under a debug flag). ──

Deno.test('GUARDRAIL 2: response carries ssr_unavailable + shorts_placed_without_ssr_check at top level', async () => {
  const rankings: RankingRow[] = [
    { ticker: 'XYZ', long_rank: 999, short_rank: 1, long_score: -1, short_score: 1, gics_sector: 'Tech', ranker_source: 'test' },
  ];
  const { interfaces } = makeFakeBroker({});
  const { writer } = makeCapturingEventWriter();
  const out = await runRebalanceSubmit(
    { mode: 'full_rebalance', operator_id: OP },
    { brokerFactory: () => interfaces, eventWriter: writer, rankingsReader: async () => rankings, ts: TS },
    CID,
  );
  // Top-level fields, not buried in summary or debug.
  assert(Object.prototype.hasOwnProperty.call(out, 'ssr_unavailable'));
  assert(Object.prototype.hasOwnProperty.call(out, 'shorts_placed_without_ssr_check'));
  assertEquals(out.ssr_unavailable, true);
  assertEquals(out.shorts_placed_without_ssr_check, ['XYZ']);
});

// ── (e) Gate-6 wall-clock self-scan (the trigger MUST NOT introduce a
//        wall-clock read — `ts` is injected at the boundary). ────────────

Deno.test('Gate-6: index.ts contains no banned wall-clock reads in business logic', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // The SOLE sanctioned wall-clock site is productionClock.getWallClockTs()
  // at the Deno.serve handler root, per DEC-034 (4). Anything else is a
  // violation. Strip the import + the sanctioned call site before scanning.
  const stripped = src
    .replace(/productionClock\.getWallClockTs\(\)/g, '/*SANCTIONED*/')
    .replace(/from\s+'\.\.\/_shared\/longshort-clock\.ts'/g, "/*import*/");
  assertEquals(/\bDate\.now\s*\(/.test(stripped), false, 'no Date.now()');
  assertEquals(/\bperformance\.now\s*\(/.test(stripped), false, 'no performance.now()');
  // `new Date()` with no args is banned; `new Date(...)` with args is fine.
  assertEquals(/\bnew\s+Date\s*\(\s*\)/.test(stripped), false, 'no no-arg new Date()');
});