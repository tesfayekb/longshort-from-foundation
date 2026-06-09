// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  TradierOptionsChainFetcher,
  TRADIER_CHAIN_OPERATION_ID,
  TRADIER_EXPIRATIONS_OPERATION_ID,
  type RawOptionContract,
} from './tradier-options-chain-fetcher.ts';
import { SignalComputationError } from './signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function chainBody(options: unknown) {
  return { options: { option: options } };
}

function makeContractWire(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'AAPL260617C00230000',
    underlying: 'AAPL',
    expiration_date: '2026-06-17',
    strike: 230,
    option_type: 'call',
    bid: 5.20,
    ask: 5.30,
    last: 5.25,
    volume: 1234,
    open_interest: 5678,
    bid_date: 1781019234000,
    ask_date: 1781019235000,
    trade_date: 1781019200000,
    greeks: {
      delta: 0.55,
      gamma: 0.012,
      theta: -0.04,
      vega: 0.18,
      rho: 0.07,
      phi: -0.01,
      bid_iv: 0.21,
      mid_iv: 0.22,
      ask_iv: 0.23,
      smv_vol: 0.22,
      updated_at: '2026-06-09T15:33:55',
    },
    ...overrides,
  };
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new TradierOptionsChainFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

// ─── fetchExpirations ────────────────────────────────────────────────────

Deno.test('(2) expirations happy path: ASC-sorted ISO dates', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({
      expirations: {
        // Tradier returns DESC sometimes, ASC other times — fetcher must sort.
        date: ['2026-07-17', '2026-06-17', '2026-06-24'],
      },
    }),
  );
  const out = await fetcher.fetchExpirations('AAPL');
  assertEquals(out.kind, 'expirations');
  if (out.kind !== 'expirations') throw new Error('unreachable');
  assertEquals(out.expirations, ['2026-06-17', '2026-06-24', '2026-07-17']);
});

Deno.test('(3) expirations single-result: Tradier returns bare string, normalized to 1-element array', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({ expirations: { date: '2026-06-17' } }),
  );
  const out = await fetcher.fetchExpirations('SMALLCAP');
  assertEquals(out.kind, 'expirations');
  if (out.kind !== 'expirations') throw new Error('unreachable');
  assertEquals(out.expirations, ['2026-06-17']);
});

Deno.test('(4) expirations empty/null → data_unavailable (anti-phantom — never fabricated)', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({ expirations: null }),
  );
  const out = await fetcher.fetchExpirations('NOOPTS');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) expirations 401 → subscription_gated, NOT a throw', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({}, false, 401, 'Unauthorized'),
  );
  const out = await fetcher.fetchExpirations('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(6) expirations 403 → subscription_gated, NOT a throw', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await fetcher.fetchExpirations('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(7) expirations 404 → data_unavailable, NOT a throw', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchExpirations('DELISTED');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(8) expirations carries Authorization: Bearer header + symbol param', async () => {
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> | undefined;
  const fetcher = new TradierOptionsChainFetcher('secret-token-xyz', async (input, init) => {
    capturedUrl = input;
    capturedHeaders = init?.headers;
    return jsonResp({ expirations: { date: ['2026-06-17'] } });
  });
  await fetcher.fetchExpirations('NVDA');
  assertStringIncludes(capturedUrl, 'api.tradier.com/v1/markets/options/expirations');
  assertStringIncludes(capturedUrl, 'symbol=NVDA');
  assertStringIncludes(capturedUrl, 'includeAllRoots=true');
  assertEquals(capturedHeaders?.Authorization, 'Bearer secret-token-xyz');
  assertEquals(capturedHeaders?.Accept, 'application/json');
});

// ─── fetchChain ──────────────────────────────────────────────────────────

Deno.test('(9) chain happy path: normalized contracts with bid/ask/greeks', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([makeContractWire(), makeContractWire({
      symbol: 'AAPL260617P00230000',
      option_type: 'put',
      strike: 230,
      greeks: { delta: -0.45 },
    })])),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  assertEquals(out.kind, 'chain');
  if (out.kind !== 'chain') throw new Error('unreachable');
  assertEquals(out.contracts.length, 2);
  assertEquals(out.contracts[0].option_type, 'call');
  assertEquals(out.contracts[0].bid, 5.20);
  assertEquals(out.contracts[0].ask, 5.30);
  assertEquals(out.contracts[0].greeks?.delta, 0.55);
  assertEquals(out.contracts[1].option_type, 'put');
  assertEquals(out.contracts[1].greeks?.delta, -0.45);
});

Deno.test('(10) chain single-result: bare object normalized to 1-element array', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody(makeContractWire())),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  assertEquals(out.kind, 'chain');
  if (out.kind !== 'chain') throw new Error('unreachable');
  assertEquals(out.contracts.length, 1);
});

Deno.test('(11) chain empty/null → data_unavailable', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({ options: null }),
  );
  const out = await fetcher.fetchChain('NOOPTS', '2026-06-17');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(12) chain 401/403 → subscription_gated', async () => {
  for (const status of [401, 403]) {
    const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
      jsonResp({}, false, status, status === 401 ? 'Unauthorized' : 'Forbidden'),
    );
    const out = await fetcher.fetchChain('AAPL', '2026-06-17');
    assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
  }
});

Deno.test('(13) chain 404 → data_unavailable', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(14) chain 400 throws SignalComputationError with operation-id + ticker', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp({}, false, 400, 'Bad Request'),
  );
  const err = await assertRejects(
    () => fetcher.fetchChain('AAPL', '2026-06-17'),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, TRADIER_CHAIN_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
  assertStringIncludes((err as Error).message, 'AAPL');
});

Deno.test('(15) chain parse error throws SignalComputationError', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => 'not json',
    json: async () => { throw new Error('invalid json'); },
  }));
  await assertRejects(
    () => fetcher.fetchChain('AAPL', '2026-06-17'),
    SignalComputationError,
  );
});

Deno.test('(16) chain invalid expiration format throws (caller bug, not vendor)', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([makeContractWire()])),
  );
  await assertRejects(
    () => fetcher.fetchChain('AAPL', '06/17/2026'),
    SignalComputationError,
    'invalid expiration format',
  );
});

Deno.test('(17) chain trade_date=0 normalized to null (Tradier "never traded" idiom)', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([makeContractWire({ trade_date: 0, last: null, volume: 0 })])),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  if (out.kind !== 'chain') throw new Error('unreachable');
  assertEquals(out.contracts[0].trade_date, null);
  assertEquals(out.contracts[0].last, null);
  assertEquals(out.contracts[0].volume, 0);  // 0 volume IS valid (genuine zero)
});

Deno.test('(18) chain bid/ask missing → null (anti-phantom — NEVER fabricated 0)', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([makeContractWire({ bid: null, ask: undefined })])),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  if (out.kind !== 'chain') throw new Error('unreachable');
  assertEquals(out.contracts[0].bid, null);
  assertEquals(out.contracts[0].ask, null);
});

Deno.test('(19) chain greeks.delta missing → entire greeks set to null (smart-money filter cannot run)', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([makeContractWire({ greeks: { gamma: 0.01 } })])),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  if (out.kind !== 'chain') throw new Error('unreachable');
  // Without delta, the OTM/ATM strike filter cannot run — typed-absence,
  // NEVER defaulted to delta=0 which would silently mis-classify everything
  // as ATM and break the smart-money filter.
  assertEquals(out.contracts[0].greeks, null);
});

Deno.test('(20) chain rows with invalid strike are dropped (anti-phantom)', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([
      makeContractWire(),
      makeContractWire({ symbol: 'BAD', strike: -1 }),                  // invalid
      makeContractWire({ symbol: 'BAD2', strike: 0 }),                  // invalid
      makeContractWire({ symbol: 'BAD3', option_type: 'warrant' }),     // invalid
    ])),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  if (out.kind !== 'chain') throw new Error('unreachable');
  assertEquals(out.contracts.length, 1);
});

Deno.test('(21) chain all rows dropped → data_unavailable, not an empty array', async () => {
  const fetcher = new TradierOptionsChainFetcher('test-key', async () =>
    jsonResp(chainBody([makeContractWire({ strike: -1 })])),
  );
  const out = await fetcher.fetchChain('AAPL', '2026-06-17');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(22) chain URL composition: greeks=true + expiration in path', async () => {
  let capturedUrl = '';
  const fetcher = new TradierOptionsChainFetcher('k', async (input) => {
    capturedUrl = input;
    return jsonResp(chainBody([makeContractWire()]));
  });
  await fetcher.fetchChain('SPY', '2026-06-17');
  assertStringIncludes(capturedUrl, '/markets/options/chains');
  assertStringIncludes(capturedUrl, 'symbol=SPY');
  assertStringIncludes(capturedUrl, 'expiration=2026-06-17');
  assertStringIncludes(capturedUrl, 'greeks=true');
});

// ─── verifyFilterHonored (INC-70 dual-axis #1) ───────────────────────────

Deno.test('(23) verifyFilterHonored — all contracts match requested symbol → honored=true', () => {
  const contracts: RawOptionContract[] = [
    {
      symbol: 'AAPL260617C00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'call',
      bid: 1, ask: 2, last: 1.5, volume: 100, open_interest: 50,
      bid_date: 1, ask_date: 1, trade_date: 1, greeks: null,
    },
    {
      symbol: 'AAPL260617P00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'put',
      bid: 1, ask: 2, last: 1.5, volume: 100, open_interest: 50,
      bid_date: 1, ask_date: 1, trade_date: 1, greeks: null,
    },
  ];
  const r = TradierOptionsChainFetcher.verifyFilterHonored('AAPL', contracts);
  assertEquals(r.honored, true);
  assertEquals(r.mismatched, 0);
  assertEquals(r.total, 2);
});

Deno.test('(24) verifyFilterHonored — filter-bleed: foreign underlying flagged', () => {
  const contracts: RawOptionContract[] = [
    {
      symbol: 'AAPL260617C00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'call',
      bid: 1, ask: 2, last: 1.5, volume: 100, open_interest: 50,
      bid_date: 1, ask_date: 1, trade_date: 1, greeks: null,
    },
    {
      symbol: 'MSFT260617C00400000', underlying: 'MSFT',
      expiration_date: '2026-06-17', strike: 400, option_type: 'call',
      bid: 1, ask: 2, last: 1.5, volume: 100, open_interest: 50,
      bid_date: 1, ask_date: 1, trade_date: 1, greeks: null,
    },
  ];
  const r = TradierOptionsChainFetcher.verifyFilterHonored('AAPL', contracts);
  assertEquals(r.honored, false);
  assertEquals(r.mismatched, 1);
  assertEquals(r.sample_mismatched, ['MSFT260617C00400000']);
});

// ─── verifyFieldsPresent (INC-71 dual-axis #2) ───────────────────────────

Deno.test('(25) verifyFieldsPresent — full population (production-tier) counts every field', () => {
  const contracts: RawOptionContract[] = [
    {
      symbol: 'AAPL260617C00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'call',
      bid: 1.0, ask: 1.1, last: 1.05, volume: 100, open_interest: 50,
      bid_date: 1, ask_date: 1, trade_date: 1,
      greeks: { delta: 0.5 },
    },
    {
      symbol: 'AAPL260617P00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'put',
      bid: 0.5, ask: 0.6, last: 0.55, volume: 80, open_interest: 30,
      bid_date: 1, ask_date: 1, trade_date: 1,
      greeks: { delta: -0.4 },
    },
  ];
  const r = TradierOptionsChainFetcher.verifyFieldsPresent(contracts);
  assertEquals(r.total, 2);
  assertEquals(r.populated.bid, 2);
  assertEquals(r.populated.ask, 2);
  assertEquals(r.populated.last, 2);
  assertEquals(r.populated.volume, 2);
  assertEquals(r.populated.open_interest, 2);
  assertEquals(r.populated.greeks, 2);
  assertEquals(r.populated.numeric_bid_ask, 2);
});

Deno.test('(26) verifyFieldsPresent — Polygon-tier shape (no bid/ask, no greeks) is correctly diagnosed', () => {
  // Simulates the INC-71 condition: chain returned, fields missing.
  const contracts: RawOptionContract[] = [
    {
      symbol: 'AAPL260617C00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'call',
      bid: null, ask: null, last: 1.05, volume: 100, open_interest: 50,
      bid_date: null, ask_date: null, trade_date: 1, greeks: null,
    },
  ];
  const r = TradierOptionsChainFetcher.verifyFieldsPresent(contracts);
  assertEquals(r.populated.bid, 0);
  assertEquals(r.populated.ask, 0);
  assertEquals(r.populated.greeks, 0);
  assertEquals(r.populated.numeric_bid_ask, 0);
  // `last` and `volume` still populated — important distinction; the
  // INC-71 failure isn't "no data at all", it's "no NBBO data".
  assertEquals(r.populated.last, 1);
  assertEquals(r.populated.volume, 1);
});

Deno.test('(27) verifyFieldsPresent — numeric_bid_ask only counts truly-quoted (>0) contracts', () => {
  // bid=0 and ask=0 (a contract with no live market) should NOT count
  // as a "real NBBO" sample.
  const contracts: RawOptionContract[] = [
    {
      symbol: 'AAPL260617C00230000', underlying: 'AAPL',
      expiration_date: '2026-06-17', strike: 230, option_type: 'call',
      bid: 0, ask: 0, last: null, volume: 0, open_interest: 0,
      bid_date: 1, ask_date: 1, trade_date: null, greeks: null,
    },
  ];
  const r = TradierOptionsChainFetcher.verifyFieldsPresent(contracts);
  assertEquals(r.populated.bid, 1);              // bid IS populated (=0)
  assertEquals(r.populated.ask, 1);              // ask IS populated (=0)
  assertEquals(r.populated.numeric_bid_ask, 0);  // but NEITHER is >0
});