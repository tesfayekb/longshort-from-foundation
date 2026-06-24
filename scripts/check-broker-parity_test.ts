/**
 * check-broker-parity_test — wraps the parity script as a Deno.test so it runs
 * under Gate 2 (`deno test scripts/`). The script itself is invokable directly
 * for local debugging; this test is the CI gate.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Re-import the scenario logic by re-using the script via dynamic execution.
// Simpler + more direct: replicate the 3 scenarios inline against both trees.
// (Keeping a single source of truth in check-broker-parity.ts as the
// operator-facing CLI; this test mirrors its scenarios for the CI assertion.)

import { AlpacaPaperClient as EdgeClient } from '../supabase/functions/_shared/longshort-broker/alpaca-paper-client.ts';
import { AlpacaOpenOrdersFetcher as EdgeOpenOrders } from '../supabase/functions/_shared/longshort-broker/alpaca-open-orders-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher as EdgeAcceptance } from '../supabase/functions/_shared/longshort-broker/alpaca-order-acceptance-fetcher.ts';
import { AlpacaFillFetcher as EdgeFill } from '../supabase/functions/_shared/longshort-broker/alpaca-fill-fetcher.ts';
// ACT-317 (E5.5 Phase-1) — placement-path parity gates.
import { AlpacaQuoteFetcher as EdgeQuote } from '../supabase/functions/_shared/longshort-broker/alpaca-quote-fetcher.ts';
import { AlpacaBuyingPowerFetcher as EdgeBP } from '../supabase/functions/_shared/longshort-broker/alpaca-buying-power-fetcher.ts';
import { AlpacaPositionFetcher as EdgePos } from '../supabase/functions/_shared/longshort-broker/alpaca-position-fetcher.ts';
import { AlpacaLocateFetcher as EdgeLocate } from '../supabase/functions/_shared/longshort-broker/alpaca-locate-fetcher.ts';
import { AlpacaHaltStatusFetcher as EdgeHalt } from '../supabase/functions/_shared/longshort-broker/alpaca-halt-status-fetcher.ts';

import { AlpacaPaperClient as SrcClient } from '../src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts';
import { AlpacaOpenOrdersFetcher as SrcOpenOrders } from '../src/features/longshort/services/broker/alpaca/alpaca-open-orders-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher as SrcAcceptance } from '../src/features/longshort/services/broker/alpaca/alpaca-order-acceptance-fetcher.ts';
import { AlpacaFillFetcher as SrcFill } from '../src/features/longshort/services/broker/alpaca/alpaca-fill-fetcher.ts';
import { AlpacaQuoteFetcher as SrcQuote } from '../src/features/longshort/services/broker/alpaca/alpaca-quote-fetcher.ts';
import { AlpacaBuyingPowerFetcher as SrcBP } from '../src/features/longshort/services/broker/alpaca/alpaca-buying-power-fetcher.ts';
import { AlpacaPositionFetcher as SrcPos } from '../src/features/longshort/services/broker/alpaca/alpaca-position-fetcher.ts';
import { AlpacaLocateFetcher as SrcLocate } from '../src/features/longshort/services/broker/alpaca/alpaca-locate-fetcher.ts';
import { AlpacaHaltStatusFetcher as SrcHalt } from '../src/features/longshort/services/broker/alpaca/alpaca-halt-status-fetcher.ts';

const TS = new Date('2026-06-24T20:30:00Z');
const SUBMITTED = '2026-06-24T20:29:50Z';
const SUBMITTED_MS = new Date(SUBMITTED).getTime();

function withCreds(): { restore: () => void } {
  const prevK = Deno.env.get('ALPACA_PAPER_KEY');
  const prevS = Deno.env.get('ALPACA_PAPER_SECRET');
  Deno.env.set('ALPACA_PAPER_KEY', 'k-test');
  Deno.env.set('ALPACA_PAPER_SECRET', 's-test');
  return {
    restore: () => {
      if (prevK !== undefined) Deno.env.set('ALPACA_PAPER_KEY', prevK); else Deno.env.delete('ALPACA_PAPER_KEY');
      if (prevS !== undefined) Deno.env.set('ALPACA_PAPER_SECRET', prevS); else Deno.env.delete('ALPACA_PAPER_SECRET');
    },
  };
}

function scriptedFetch(body: unknown): typeof fetch {
  const impl = async (_input: URL | RequestInfo, _init?: RequestInit): Promise<Response> => {
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return impl as unknown as typeof fetch;
}

function dateReplacer(_k: string, v: unknown): unknown {
  return v instanceof Date ? `__Date(${v.toISOString()})` : v;
}
function canon(v: unknown): string { return JSON.stringify(v, dateReplacer); }

Deno.test('parity: open-orders reconstruction (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    const fixture = [
      { id: 'O-1', client_order_id: `lse-AAPL-open-${SUBMITTED_MS}`, symbol: 'AAPL', qty: '10', side: 'buy', status: 'new', limit_price: '180.50', submitted_at: SUBMITTED },
      { id: 'O-2', client_order_id: 'manual-operator-order', symbol: 'TSLA', qty: '1', side: 'buy', status: 'new', limit_price: '200', submitted_at: SUBMITTED },
      { id: 'O-3', client_order_id: `lse-MSFT-open-${SUBMITTED_MS}`, symbol: 'MSFT', qty: '5', side: 'buy', status: 'filled', limit_price: '300', submitted_at: SUBMITTED },
      { id: 'O-4', client_order_id: `lse-NVDA-open-${SUBMITTED_MS}-step1`, symbol: 'NVDA', qty: '3', side: 'buy', status: 'accepted', limit_price: '500', submitted_at: SUBMITTED },
    ];
    const e = await new EdgeOpenOrders(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).listOpenInFlight(TS);
    const s = await new SrcOpenOrders(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).listOpenInFlight(TS);
    assertEquals(canon(e), canon(s));
  } finally { c.restore(); }
});

Deno.test('parity: order-acceptance tri-state mapping (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    for (const status of ['accepted', 'new', 'partially_filled', 'rejected', 'canceled', 'pending_new', 'pending_cancel']) {
      const fixture = { id: 'O-X', symbol: 'AAPL', status, rejected_reason: status === 'rejected' ? 'risk_rejected' : null, submitted_at: SUBMITTED };
      const e = await new EdgeAcceptance(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchOrderAcceptance('O-X', 30, TS);
      const s = await new SrcAcceptance(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchOrderAcceptance('O-X', 30, TS);
      assertEquals(canon(e), canon(s), `acceptance divergence at status=${status}`);
    }
  } finally { c.restore(); }
});

Deno.test('parity: fill semantics (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    for (const fixture of [
      { id: 'O-X', status: 'filled', qty: '10', filled_qty: '10', filled_avg_price: '180.51' },
      { id: 'O-X', status: 'partially_filled', qty: '10', filled_qty: '4', filled_avg_price: '180.40' },
      { id: 'O-X', status: 'new', qty: '10', filled_qty: '0', filled_avg_price: null },
      { id: 'O-X', status: 'filled', qty: '10', filled_qty: '10', filled_avg_price: '' },
    ]) {
      const e = await new EdgeFill(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchFill('O-X', TS);
      const s = await new SrcFill(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchFill('O-X', TS);
      assertEquals(canon(e), canon(s), `fill divergence at status=${fixture.status}`);
    }
  } finally { c.restore(); }
});

// ── ACT-317 (E5.5 Phase-1) parity gates — the 5 placement-path adapters. ──

Deno.test('parity: quote latest (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    const fixture = { quote: { bp: 180.50, ap: 180.52, bs: 100, as: 100, t: SUBMITTED }, symbol: 'AAPL' };
    const e = await new EdgeQuote(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchQuote('AAPL', TS);
    const s = await new SrcQuote(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchQuote('AAPL', TS);
    assertEquals(canon(e), canon(s));
  } finally { c.restore(); }
});

Deno.test('parity: buying-power account (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    const fixture = { buying_power: '100000.00', equity: '120000.00' };
    const e = await new EdgeBP(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchBuyingPower(TS);
    const s = await new SrcBP(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchBuyingPower(TS);
    assertEquals(canon(e), canon(s));
  } finally { c.restore(); }
});

Deno.test('parity: position single-symbol (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    const fixture = { symbol: 'AAPL', qty: '10', avg_entry_price: '180.10', side: 'long', market_value: '1805.20', current_price: '180.52' };
    const e = await new EdgePos(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchPosition('AAPL', TS);
    const s = await new SrcPos(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchPosition('AAPL', TS);
    // src/ position fetcher omits market_value/current_price; assert the
    // SHARED-shape fields agree (symbol, qty, avg_entry_price, fetched_at)
    // — edge-resident is a SUPERSET (additive E1 fields per BrokerPosition
    // optional shape). Behavior-parity is on the shared surface.
    const eShared = { symbol: e!.symbol, qty: e!.qty, avg_entry_price: e!.avg_entry_price, fetched_at: e!.fetched_at };
    assertEquals(canon(eShared), canon(s));
  } finally { c.restore(); }
});

Deno.test('parity: locate (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    for (const fixture of [
      { symbol: 'TSLA', available: true, locate_id: 'L-1', qty: 100 },
      { symbol: 'GME', available: false },
    ]) {
      const e = await new EdgeLocate(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchLocate(fixture.symbol, TS);
      const s = await new SrcLocate(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchLocate(fixture.symbol, TS);
      assertEquals(canon(e), canon(s), `locate divergence at symbol=${fixture.symbol}`);
    }
  } finally { c.restore(); }
});

Deno.test('parity: halt-status (edge-resident ≡ src/)', async () => {
  const c = withCreds();
  try {
    for (const fixture of [
      { symbol: 'AAPL', status: 'active', tradable: true },
      { symbol: 'XYZ', status: 'inactive', tradable: false },
      { symbol: 'ABC', status: 'active', tradable: false },
    ]) {
      const e = await new EdgeHalt(new EdgeClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchHaltStatus(fixture.symbol, TS);
      const s = await new SrcHalt(new SrcClient({ baseUrlOverride: 'http://localhost', fetchImpl: scriptedFetch(fixture) })).fetchHaltStatus(fixture.symbol, TS);
      assertEquals(canon(e), canon(s), `halt divergence at symbol=${fixture.symbol}`);
    }
  } finally { c.restore(); }
});