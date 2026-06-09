// @ts-nocheck — Deno test file.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runOptionsFlowChunk } from './options-flow-chunk-runner.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  OptionChainResult,
  OptionExpirationsResult,
  RawOptionContract,
} from '../shared/tradier-options-chain-fetcher.ts';

const AS_OF = new Date('2026-06-09T20:00:00Z');

function makeContract(opts: Partial<RawOptionContract> & { strike: number; option_type: 'call' | 'put' }): RawOptionContract {
  const ts = AS_OF.getTime() - 60 * 60 * 1000; // 1 hour ago
  return {
    symbol: `T${opts.strike}${opts.option_type === 'call' ? 'C' : 'P'}`,
    underlying: 'AAPL',
    expiration_date: '2026-07-17',
    strike: opts.strike,
    option_type: opts.option_type,
    bid: opts.bid ?? 1.0,
    ask: opts.ask ?? 1.1,
    last: opts.last ?? 1.1, // at-ask → aggressive buy
    volume: opts.volume ?? 150,
    open_interest: 1000,
    bid_date: ts,
    ask_date: ts,
    trade_date: ts,
    greeks: { delta: opts.option_type === 'call' ? 0.45 : -0.45 },
  };
}

function makeFetcher(opts: {
  expirations?: Record<string, OptionExpirationsResult>;
  chains?: Record<string, OptionChainResult>;
  throwOn?: Set<string>;
}) {
  return {
    fetchExpirations: async (t: string) => {
      if (opts.throwOn?.has(t)) {
        throw new SignalComputationError('tradier_options_expirations', t, 'simulated outage');
      }
      return opts.expirations?.[t] ?? { kind: 'unavailable', reason: 'data_unavailable' as const };
    },
    fetchChain: async (t: string) => {
      return opts.chains?.[t] ?? { kind: 'unavailable', reason: 'data_unavailable' as const };
    },
  };
}

Deno.test('chunk runner: happy path returns raw_signal value', async () => {
  const contracts = [
    makeContract({ strike: 200, option_type: 'call' }),
    makeContract({ strike: 205, option_type: 'call' }),
    makeContract({ strike: 210, option_type: 'call' }),
    makeContract({ strike: 215, option_type: 'call' }),
    makeContract({ strike: 220, option_type: 'call' }),
    makeContract({ strike: 225, option_type: 'call' }),
  ];
  const tradier = makeFetcher({
    expirations: { AAPL: { kind: 'expirations', expirations: ['2026-07-17'] } },
    chains: { AAPL: { kind: 'chain', contracts } },
  });
  const result = await runOptionsFlowChunk(
    { tradier },
    [{ ticker: 'AAPL', gics_sector: 'Information Technology' }],
    AS_OF,
  );
  assertEquals(result.values.length, 1);
  assertEquals(result.values[0].ticker, 'AAPL');
  assertEquals(result.values[0].gics_sector, 'Information Technology');
  assertEquals(result.skips.length, 0);
});

Deno.test('chunk runner: subscription_gated skip on 401', async () => {
  const tradier = makeFetcher({
    expirations: { AAPL: { kind: 'unavailable', reason: 'subscription_gated' } },
  });
  const result = await runOptionsFlowChunk(
    { tradier },
    [{ ticker: 'AAPL', gics_sector: 'X' }],
    AS_OF,
  );
  assertEquals(result.values.length, 0);
  assertEquals(result.skips.length, 1);
  assertEquals(result.skips[0].reason, 'subscription_gated');
});

Deno.test('chunk runner: data_unavailable skip on empty expirations', async () => {
  const tradier = makeFetcher({});
  const result = await runOptionsFlowChunk(
    { tradier },
    [{ ticker: 'NOPE', gics_sector: 'X' }],
    AS_OF,
  );
  assertEquals(result.skips[0].reason, 'data_unavailable');
});

Deno.test('chunk runner: fetch_error skip on thrown error (no fabricated value)', async () => {
  const tradier = makeFetcher({ throwOn: new Set(['BOOM']) });
  const result = await runOptionsFlowChunk(
    { tradier },
    [{ ticker: 'BOOM', gics_sector: 'X' }],
    AS_OF,
  );
  assertEquals(result.values.length, 0);
  assertEquals(result.skips.length, 1);
  assertEquals(result.skips[0].reason, 'fetch_error');
});

Deno.test('chunk runner: no_qualifying_flow when contracts present but none qualify', async () => {
  // single small-volume contract → fails volume filter → < MIN_QUALIFYING_PRINTS
  const tiny = makeContract({ strike: 200, option_type: 'call', volume: 1 });
  const tradier = makeFetcher({
    expirations: { TINY: { kind: 'expirations', expirations: ['2026-07-17'] } },
    chains: { TINY: { kind: 'chain', contracts: [tiny] } },
  });
  const result = await runOptionsFlowChunk(
    { tradier },
    [{ ticker: 'TINY', gics_sector: 'X' }],
    AS_OF,
  );
  assertEquals(result.skips[0].reason, 'no_qualifying_flow');
});

Deno.test('chunk runner: processes multiple tickers in order', async () => {
  const tradier = makeFetcher({
    expirations: {
      A: { kind: 'unavailable', reason: 'subscription_gated' },
      B: { kind: 'unavailable', reason: 'data_unavailable' },
    },
  });
  const result = await runOptionsFlowChunk(
    { tradier },
    [
      { ticker: 'A', gics_sector: 'X' },
      { ticker: 'B', gics_sector: 'Y' },
    ],
    AS_OF,
  );
  assertEquals(result.skips.length, 2);
  assertEquals(result.skips[0].ticker, 'A');
  assertEquals(result.skips[1].ticker, 'B');
});