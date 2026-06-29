// @ts-nocheck — Deno test file
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  AlpacaCorporateActionFetcher,
  BrokerPositionMissingForCAReconciliation,
  type LotBasisReaderClient,
} from './alpaca-corporate-action-fetcher.ts';
import { AlpacaPaperClient } from './alpaca-paper-client.ts';
import type {
  BrokerCorporateActionFetcher,
  BrokerCorporateActionSnapshot,
} from '../longshort-broker-interfaces.ts';

// Required by AlpacaPaperClient constructor; no real network is exercised
// (fetchImpl injected).
Deno.env.set('ALPACA_PAPER_KEY', 'test_key');
Deno.env.set('ALPACA_PAPER_SECRET', 'test_secret');

const TS = new Date('2026-06-29T15:00:00.000Z');
const ACTION_TS = new Date('2026-06-27T00:00:00.000Z');

function internalNoAction(): BrokerCorporateActionFetcher {
  return {
    fetchCorporateActionSnapshot: async (
      symbol: string,
      _lookback: number,
      ts: Date,
    ): Promise<BrokerCorporateActionSnapshot> => ({
      symbol,
      recent_action_within_lookback: false,
      action_type: null,
      action_ts: null,
      broker_basis_adjusted: false,
      hours_since_action: null,
      fetched_at: ts,
    }),
  };
}

function internalRecentAction(): BrokerCorporateActionFetcher {
  return {
    fetchCorporateActionSnapshot: async (
      symbol: string,
      _lookback: number,
      ts: Date,
    ): Promise<BrokerCorporateActionSnapshot> => ({
      symbol,
      recent_action_within_lookback: true,
      action_type: 'split',
      action_ts: ACTION_TS,
      broker_basis_adjusted: true, // internal proxy (applied_at IS NOT NULL)
      hours_since_action:
        (ts.getTime() - ACTION_TS.getTime()) / 3_600_000,
      fetched_at: ts,
    }),
  };
}

function fixedFetch(status: number, body: string): typeof fetch {
  return ((..._args: unknown[]) =>
    Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
}

function lotsClient(rows: Array<{ qty: number; cost_basis: number; status: string }>): LotBasisReaderClient {
  return {
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_c1: string, _v1: string) => ({
          eq: (_c2: string, _v2: string) =>
            Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

function makeClient(fetchImpl: typeof fetch): AlpacaPaperClient {
  return new AlpacaPaperClient({
    baseUrlOverride: 'https://paper-api.alpaca.markets',
    fetchImpl,
  });
}

Deno.test('(1) no recent action → internal passthrough, no broker call', async () => {
  let fetchCalls = 0;
  const client = makeClient(((..._a: unknown[]) => {
    fetchCalls += 1;
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch);
  const f = new AlpacaCorporateActionFetcher(client, internalNoAction(), {
    lotsClient: lotsClient([]),
  });
  const snap = await f.fetchCorporateActionSnapshot('AAPL', 5, TS);
  assertEquals(snap.recent_action_within_lookback, false);
  assertEquals(snap.broker_basis_adjusted, false);
  assertEquals(snap.fetched_at.getTime(), TS.getTime());
  assertEquals(fetchCalls, 0);
});

Deno.test('(2) recent action + broker basis matches internal (within 1¢) → adjusted=true', async () => {
  const body = JSON.stringify({
    symbol: 'AAPL', qty: '100', avg_entry_price: '150.005',
  });
  const client = makeClient(fixedFetch(200, body));
  const f = new AlpacaCorporateActionFetcher(client, internalRecentAction(), {
    // qty-weighted basis = (150.00 * 60 + 150.01 * 40) / 100 = 150.004
    lotsClient: lotsClient([
      { qty: 60, cost_basis: 150.00, status: 'open' },
      { qty: 40, cost_basis: 150.01, status: 'open' },
    ]),
  });
  const snap = await f.fetchCorporateActionSnapshot('AAPL', 5, TS);
  assertEquals(snap.recent_action_within_lookback, true);
  assertEquals(snap.action_type, 'split');
  assert(snap.broker_basis_adjusted, 'expected broker_basis_adjusted=true within 1¢');
  assertEquals(snap.fetched_at.getTime(), TS.getTime());
});

Deno.test('(3) recent action + broker basis mismatches internal (> 1¢) → adjusted=false', async () => {
  const body = JSON.stringify({
    symbol: 'AAPL', qty: '100', avg_entry_price: '150.50',
  });
  const client = makeClient(fixedFetch(200, body));
  const f = new AlpacaCorporateActionFetcher(client, internalRecentAction(), {
    lotsClient: lotsClient([
      { qty: 100, cost_basis: 150.00, status: 'open' },
    ]),
  });
  const snap = await f.fetchCorporateActionSnapshot('AAPL', 5, TS);
  assertEquals(snap.broker_basis_adjusted, false);
});

Deno.test('(4) recent action + broker 404 → typed throw, NO sentinel', async () => {
  const client = makeClient(fixedFetch(404, 'position not found'));
  const f = new AlpacaCorporateActionFetcher(client, internalRecentAction(), {
    lotsClient: lotsClient([
      { qty: 100, cost_basis: 150.00, status: 'open' },
    ]),
  });
  await assertRejects(
    () => f.fetchCorporateActionSnapshot('AAPL', 5, TS),
    BrokerPositionMissingForCAReconciliation,
  );
});

Deno.test('(5) recent action + broker 500 → non-404 error propagates (DEC-034 (3))', async () => {
  const client = makeClient(fixedFetch(500, 'broker outage'));
  const f = new AlpacaCorporateActionFetcher(client, internalRecentAction(), {
    lotsClient: lotsClient([{ qty: 100, cost_basis: 150.00, status: 'open' }]),
  });
  await assertRejects(() => f.fetchCorporateActionSnapshot('AAPL', 5, TS));
});

Deno.test('(6) recent action + no open lots → typed throw, NO synthetic default', async () => {
  const body = JSON.stringify({
    symbol: 'AAPL', qty: '100', avg_entry_price: '150.00',
  });
  const client = makeClient(fixedFetch(200, body));
  const f = new AlpacaCorporateActionFetcher(client, internalRecentAction(), {
    lotsClient: lotsClient([]), // no open lots
  });
  await assertRejects(
    () => f.fetchCorporateActionSnapshot('AAPL', 5, TS),
    BrokerPositionMissingForCAReconciliation,
  );
});

Deno.test('(7) closed lots excluded from basis aggregate', async () => {
  const body = JSON.stringify({
    symbol: 'AAPL', qty: '50', avg_entry_price: '200.00',
  });
  const client = makeClient(fixedFetch(200, body));
  const f = new AlpacaCorporateActionFetcher(client, internalRecentAction(), {
    lotsClient: lotsClient([
      { qty: 50, cost_basis: 200.00, status: 'open' },
      // closed lot at 100 must NOT enter the aggregate
      { qty: 50, cost_basis: 100.00, status: 'closed' },
    ]),
  });
  const snap = await f.fetchCorporateActionSnapshot('AAPL', 5, TS);
  assert(snap.broker_basis_adjusted, 'closed lots should be excluded');
});