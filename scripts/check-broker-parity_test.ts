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

import { AlpacaPaperClient as SrcClient } from '../src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts';
import { AlpacaOpenOrdersFetcher as SrcOpenOrders } from '../src/features/longshort/services/broker/alpaca/alpaca-open-orders-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher as SrcAcceptance } from '../src/features/longshort/services/broker/alpaca/alpaca-order-acceptance-fetcher.ts';
import { AlpacaFillFetcher as SrcFill } from '../src/features/longshort/services/broker/alpaca/alpaca-fill-fetcher.ts';

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