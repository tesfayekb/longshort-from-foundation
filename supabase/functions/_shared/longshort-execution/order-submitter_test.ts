/**
 * order-submitter_test — FP-056 E2 (DEC-068 clauses a–k).
 *
 * Mock-driven shell tests. The four fetcher/submitter interfaces are stubbed
 * with scripted responses; no live broker, no credentials, no network. Covers
 * the seven SubmissionResult kinds + provenance flow + BP bookkeeping
 * (decrement on open/increase acceptance, credit on close/decrease acceptance)
 * + clause-(k).1 ordering through the shell.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
  BrokerOrderAcceptanceFetcher,
  BrokerOrderAcceptanceResult,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
  BrokerOrderAcceptance,
  BrokerQuote,
  BrokerQuoteFetcher,
} from '../longshort-broker-interfaces.ts';
import type { ExecutionDelta, DeltaIntent } from './rebalance-planner.ts';
import {
  buildClientOrderId,
  submitRebalance,
  type SubmissionResult,
} from './order-submitter.ts';

const TS = new Date('2026-06-24T20:30:00Z');

function quoteAt(ageSeconds: number, bid = 100, ask = 100.05): BrokerQuote {
  return {
    symbol: 'X',
    bid,
    ask,
    last: (bid + ask) / 2,
    ts: new Date(TS.getTime() - ageSeconds * 1000),
    source: 'alpaca',
  };
}

function mkQuoteFetcher(quotesBySymbol: Record<string, BrokerQuote[]>): BrokerQuoteFetcher {
  const indices: Record<string, number> = {};
  return {
    async fetchQuote(symbol: string): Promise<BrokerQuote> {
      const arr = quotesBySymbol[symbol];
      if (!arr || arr.length === 0) throw new Error(`no quote scripted for ${symbol}`);
      const i = Math.min(indices[symbol] ?? 0, arr.length - 1);
      indices[symbol] = (indices[symbol] ?? 0) + 1;
      return { ...arr[i], symbol };
    },
  };
}

function mkBpFetcher(available_bp: number): BrokerBuyingPowerFetcher {
  return {
    async fetchBuyingPower(_ts: Date): Promise<BrokerBuyingPower> {
      return { available_bp, account_equity: available_bp, fetched_at: TS };
    },
  };
}

function mkSubmitter(behavior: Map<string, 'accept' | 'throw'>): {
  submitter: BrokerOrderSubmitter;
  submitted: BrokerOrderRequest[];
} {
  const submitted: BrokerOrderRequest[] = [];
  let n = 0;
  return {
    submitted,
    submitter: {
      async submitOrder(req: BrokerOrderRequest, _ts: Date): Promise<BrokerOrderAcceptance> {
        submitted.push(req);
        const action = behavior.get(req.symbol) ?? 'accept';
        if (action === 'throw') throw new Error(`AlpacaApiError 400 on /v2/orders: ${req.symbol} rejected`);
        n++;
        return {
          order_id: `order-${req.symbol}-${n}`,
          client_order_id: req.client_order_id,
          status: 'new',
          submitted_at: TS,
        };
      },
    },
  };
}

function mkAcceptance(by_order_id: Record<string, BrokerOrderAcceptanceResult['state']>): BrokerOrderAcceptanceFetcher {
  return {
    async fetchOrderAcceptance(order_id, _timeout_s, _ts): Promise<BrokerOrderAcceptanceResult> {
      const state = by_order_id[order_id] ?? 'accepted';
      return {
        order_id,
        symbol: null,
        state,
        rejection_reason: state === 'rejected' ? 'broker_rejected_for_test' : null,
        pending_elapsed_s: state === 'pending' ? 11 : 0,
        fetched_at: TS,
      };
    },
  };
}

function delta(
  symbol: string,
  side: 'long' | 'short',
  intent: DeltaIntent,
  delta_notional: number,
  current_market_value = 0,
): ExecutionDelta {
  return {
    symbol,
    side,
    intent,
    delta_notional,
    target_notional: intent === 'close' ? 0 : (side === 'long' ? Math.abs(delta_notional) : -Math.abs(delta_notional)),
    current_market_value,
    noop_band_usd: 50,
    selection_reason: 'primary',
    substituted_from_symbol: null,
    original_rank: 1,
    sector: 'Information Technology',
    computed_at: TS.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

Deno.test('submitRebalance — happy path: open accepted; BP decremented; provenance flows', async () => {
  const deltas = [delta('AAPL', 'long', 'open', 5000)];
  const { submitter, submitted } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas,
    quoteFetcher: mkQuoteFetcher({ AAPL: [quoteAt(1, 100, 100.05)] }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(results.length, 1);
  const r = results[0];
  assert(r.kind === 'accepted');
  if (r.kind !== 'accepted') return;
  assertEquals(r.symbol, 'AAPL');
  assertEquals(r.broker_side, 'buy');
  assertEquals(r.shares, Math.floor(5000 / 100.01)); // = 49
  assertEquals(r.limit_price, 100.01);
  assertEquals(r.offset_applied_usd, 0.01);
  assertEquals(submitted.length, 1);
  assertEquals(submitted[0].time_in_force, 'day');
  assertEquals(submitted[0].type, 'limit');
  assertEquals(submitted[0].client_order_id, buildClientOrderId('AAPL', 'open', TS));
  // Provenance flows first-class.
  assertEquals(r.provenance.selection_reason, 'primary');
  assertEquals(r.provenance.original_rank, 1);
  assertEquals(r.provenance.sector, 'Information Technology');
});

Deno.test('submitRebalance — broker throws → terminal `rejected` with status code parsed', async () => {
  const { submitter } = mkSubmitter(new Map([['BAD', 'throw']]));
  const results = await submitRebalance({
    deltas: [delta('BAD', 'long', 'open', 5000)],
    quoteFetcher: mkQuoteFetcher({ BAD: [quoteAt(1)] }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  const r = results[0];
  assert(r.kind === 'rejected');
  if (r.kind === 'rejected') {
    assertEquals(r.broker_status_code, 400);
    assert(r.reason.includes('BAD'));
  }
});

Deno.test('submitRebalance — broker `rejected` acceptance → terminal `rejected` carries reason', async () => {
  const { submitter } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas: [delta('REJ', 'long', 'open', 5000)],
    quoteFetcher: mkQuoteFetcher({ REJ: [quoteAt(1)] }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({ 'order-REJ-1': 'rejected' }),
    ts: TS,
  });
  const r = results[0];
  assert(r.kind === 'rejected');
  if (r.kind === 'rejected') assertEquals(r.reason, 'broker_rejected_for_test');
});

Deno.test('submitRebalance — Phase-1 pending → terminal `pending_timeout` (E3 routes; E2 does not cancel)', async () => {
  const { submitter } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas: [delta('PND', 'long', 'open', 5000)],
    quoteFetcher: mkQuoteFetcher({ PND: [quoteAt(1)] }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({ 'order-PND-1': 'pending' }),
    ts: TS,
  });
  const r = results[0];
  assert(r.kind === 'pending_timeout');
  if (r.kind === 'pending_timeout') {
    assertEquals(r.order_id, 'order-PND-1');
    assertEquals(r.pending_elapsed_s, 11);
  }
});

Deno.test('submitRebalance — stale quote: refetch once; still stale → quote_stale_skipped, no submit', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  const stale = quoteAt(30); // 30s old, well past max_age=5
  const results = await submitRebalance({
    deltas: [delta('STL', 'long', 'open', 5000)],
    quoteFetcher: mkQuoteFetcher({ STL: [stale, stale] }), // both fetches return stale
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.length, 0); // never POSTed
  const r = results[0];
  assert(r.kind === 'quote_stale_skipped');
  if (r.kind === 'quote_stale_skipped') {
    assertEquals(r.refetched_once, true);
    assertEquals(r.max_age_s, 5);
    assert(r.quote_age_s >= 30);
  }
});

Deno.test('submitRebalance — stale quote: refetch returns fresh → proceed to accepted', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas: [delta('REC', 'long', 'open', 5000)],
    quoteFetcher: mkQuoteFetcher({ REC: [quoteAt(30), quoteAt(1)] }), // first stale, second fresh
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.length, 1);
  const r = results[0];
  assert(r.kind === 'accepted');
});

Deno.test('submitRebalance — 0-share guard: small notional × high price → zero_share_skipped, no POST', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas: [delta('TINY', 'long', 'open', 50)], // $50 notional
    quoteFetcher: mkQuoteFetcher({ TINY: [quoteAt(1, 1500, 1500.20)] }), // $1500 stock
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.length, 0);
  const r = results[0];
  assert(r.kind === 'zero_share_skipped');
  if (r.kind === 'zero_share_skipped') assertEquals(r.reason, 'floor_to_zero');
});

Deno.test('submitRebalance — insufficient BP: open whose cost > remaining → insufficient_buying_power_skipped, no POST', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas: [delta('BIG', 'long', 'open', 50_000)],
    quoteFetcher: mkQuoteFetcher({ BIG: [quoteAt(1, 100, 100.05)] }),
    buyingPowerFetcher: mkBpFetcher(100), // only $100 BP
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.length, 0);
  const r = results[0];
  assert(r.kind === 'insufficient_buying_power_skipped');
});

Deno.test('submitRebalance — BP running decrement: second open reduces remainingBP', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  const results = await submitRebalance({
    // After ordering: opens are interleaved by |notional| desc → BIG, MED (both long).
    deltas: [
      delta('MED', 'long', 'open', 3000),
      delta('BIG', 'long', 'open', 8000),
    ],
    quoteFetcher: mkQuoteFetcher({
      MED: [quoteAt(1, 100, 100.05)],
      BIG: [quoteAt(1, 100, 100.05)],
    }),
    buyingPowerFetcher: mkBpFetcher(10_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  // BIG first (8000), MED second (3000). BIG costs ~8000 (79 shares × 100.01).
  // Remaining after BIG ≈ 2099. MED costs 29 × 100.01 ≈ 2900 → over budget,
  // becomes insufficient_buying_power_skipped.
  assertEquals(submitted.length, 1);
  assertEquals(submitted[0].symbol, 'BIG');
  const med = results.find((r) => 'symbol' in r && r.symbol === 'MED');
  assert(med && med.kind === 'insufficient_buying_power_skipped');
});

Deno.test('submitRebalance — close CREDITS BP: subsequent open finds increased remaining', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  await submitRebalance({
    // Close first (clause k order: closes precede opens).
    deltas: [
      delta('OPN', 'long', 'open', 8000),
      delta('CLS', 'long', 'close', -3000, 3000), // held $3000 long
    ],
    quoteFetcher: mkQuoteFetcher({
      OPN: [quoteAt(1, 100, 100.05)],
      CLS: [quoteAt(1, 100, 100.05)],
    }),
    buyingPowerFetcher: mkBpFetcher(5000), // not enough for open by itself
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  // Order: CLS (close) first → BP credited by 30 shares × 100.04 = 3001.20
  // → remaining ≈ 8001. Then OPN: cost = 79 × 100.01 ≈ 7900.79, fits → POSTed.
  assertEquals(submitted.length, 2);
  assertEquals(submitted[0].symbol, 'CLS');
  assertEquals(submitted[1].symbol, 'OPN');
});

Deno.test('submitRebalance — close uses EXACT |qty|: held $9900 @ last=$99 → 100 shares (not notional-derived)', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  await submitRebalance({
    deltas: [delta('CLS', 'long', 'close', -9900, 9900)],
    quoteFetcher: mkQuoteFetcher({ CLS: [{
      symbol: 'CLS', bid: 99.00, ask: 99.05, last: 99.00, ts: TS, source: 'alpaca',
    }] }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.length, 1);
  assertEquals(submitted[0].symbol, 'CLS');
  assertEquals(submitted[0].qty, 100); // exact |qty|: 9900 / 99 = 100
  assertEquals(submitted[0].side, 'sell'); // long close → sell
});

Deno.test('submitRebalance — noop intent → noop_skipped, never POSTed', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  const results = await submitRebalance({
    deltas: [delta('NOP', 'long', 'noop', 0)],
    quoteFetcher: mkQuoteFetcher({ NOP: [quoteAt(1)] }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.length, 0);
  assertEquals(results.length, 1);
  assertEquals(results[0].kind, 'noop_skipped');
});

Deno.test('submitRebalance — provenance flows to EVERY SubmissionResult kind', async () => {
  const { submitter } = mkSubmitter(new Map([['REJ', 'throw']]));
  const baseDelta = (s: string, intent: DeltaIntent, n: number, cmv = 0): ExecutionDelta => ({
    ...delta(s, 'long', intent, n, cmv),
    selection_reason: 'substitute',
    substituted_from_symbol: 'FAIL',
    original_rank: 22,
    sector: 'Financials',
  });
  const results = await submitRebalance({
    deltas: [
      baseDelta('OK', 'open', 5000),
      baseDelta('REJ', 'open', 5000),
      baseDelta('NOP', 'noop', 0),
      baseDelta('TIN', 'open', 30),
    ],
    quoteFetcher: mkQuoteFetcher({
      OK: [quoteAt(1)],
      REJ: [quoteAt(1)],
      NOP: [quoteAt(1)],
      TIN: [quoteAt(1, 1500, 1500.20)],
    }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  for (const r of results) {
    assertEquals(r.provenance.selection_reason, 'substitute', `${r.kind}: selection_reason`);
    assertEquals(r.provenance.substituted_from_symbol, 'FAIL', `${r.kind}: substituted_from`);
    assertEquals(r.provenance.original_rank, 22, `${r.kind}: original_rank`);
    assertEquals(r.provenance.sector, 'Financials', `${r.kind}: sector`);
  }
});

Deno.test('submitRebalance — ordering through shell: closes precede opens through submit pipeline', async () => {
  const { submitter, submitted } = mkSubmitter(new Map());
  await submitRebalance({
    deltas: [
      delta('OPN', 'long', 'open', 1000),
      delta('CLS', 'long', 'close', -2000, 2000),
    ],
    quoteFetcher: mkQuoteFetcher({
      OPN: [quoteAt(1, 100, 100.05)],
      CLS: [quoteAt(1, 100, 100.05)],
    }),
    buyingPowerFetcher: mkBpFetcher(100_000),
    orderSubmitter: submitter,
    acceptanceFetcher: mkAcceptance({}),
    ts: TS,
  });
  assertEquals(submitted.map((s) => s.symbol), ['CLS', 'OPN']);
});

// ── Gate-6 self-scan — order-submitter.ts is wall-clock-free ──

Deno.test('Gate-6 — order-submitter.ts contains no wall-clock leakage', async () => {
  const txt = await Deno.readTextFile(new URL('./order-submitter.ts', import.meta.url));
  assertEquals(/\bDate\.now\(\s*\)/.test(txt), false);
  assertEquals(/\bnew\s+Date\(\s*\)/.test(txt), false);
  assertEquals(/\bperformance\.now\(\s*\)/.test(txt), false);
});

Deno.test('Gate-6 — pricing.ts + ordering.ts contain no broker-client imports (purity)', async () => {
  const pricing = await Deno.readTextFile(new URL('./pricing.ts', import.meta.url));
  const ordering = await Deno.readTextFile(new URL('./ordering.ts', import.meta.url));
  for (const src of [pricing, ordering]) {
    assertEquals(/alpaca-paper-client/.test(src), false);
    assertEquals(/\bawait\s+fetch\b/.test(src), false);
  }
});