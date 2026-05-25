// @ts-nocheck — Deno test file
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AlpacaPaperClient } from './alpaca-paper-client.ts';
import { runMultiPendingHarness } from './multi-pending-harness.ts';

function setEnv() {
  Deno.env.set('ALPACA_PAPER_KEY', 'k');
  Deno.env.set('ALPACA_PAPER_SECRET', 's');
}

function okPreflightFetch(): typeof fetch {
  return async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith('/v2/account')) {
      return new Response(JSON.stringify({
        buying_power: '50000',
        account_blocked: false,
        trading_blocked: false,
        pattern_day_trader: false,
      }), { status: 200 });
    }
    if (url.includes('/v2/positions/')) return new Response('not found', { status: 404 });
    return new Response('{}', { status: 200 });
  };
}

Deno.test('(1) harness aborts on preflight when account_blocked=true', async () => {
  setEnv();
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    buying_power: '50000', account_blocked: true, trading_blocked: false, pattern_day_trader: false,
  }), { status: 200 });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assertEquals(result.overall_status, 'aborted_pre_flight');
});

Deno.test('(2) harness aborts on preflight when buying_power=0', async () => {
  setEnv();
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({
    buying_power: '0', account_blocked: false, trading_blocked: false, pattern_day_trader: false,
  }), { status: 200 });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assertEquals(result.overall_status, 'aborted_pre_flight');
});

Deno.test('(3) harness aborts on preflight when /v2/account 401', async () => {
  setEnv();
  const fetchImpl: typeof fetch = async () => new Response('unauthorized', { status: 401 });
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assertEquals(result.overall_status, 'aborted_pre_flight');
});

Deno.test('(4) harness returns harness_version=1 + 7 tests when preflight ok (skeletons)', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: okPreflightFetch() });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assertEquals(result.harness_version, 1);
  assertEquals(result.tests.length, 7);
  assertEquals(result.test_symbol, 'AAPL');
});

Deno.test('(5) all 7 test names present + in canonical order', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: okPreflightFetch() });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  const names = result.tests.map((t) => t.test_name);
  assertEquals(names, [
    '1_multi_pending_acceptance',
    '2_fill_independence',
    '3_over_close_detection_latency',
    '4_corrective_trade_acceptance',
    '5_order_id_collision_behavior',
    '6_locate_persistence_parallel',
    '7_tif_day_interaction',
  ]);
});

Deno.test('(6) final_position_state recorded', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: okPreflightFetch() });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assert(result.final_position_state === 'clean' || result.final_position_state === 'unclean');
});

Deno.test('(7) buying_power captured at start + end', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: okPreflightFetch() });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assertEquals(result.account_buying_power_at_start, '50000');
  assertEquals(result.account_buying_power_at_end, '50000');
});

Deno.test('(8) overall_status is partial when all skeletons return inconclusive', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: okPreflightFetch() });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assertEquals(result.overall_status, 'partial');
});

Deno.test('(9) each test result carries alpaca_responses array', async () => {
  setEnv();
  const client = new AlpacaPaperClient({ baseUrlOverride: 'https://test', fetchImpl: okPreflightFetch() });
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  for (const t of result.tests) {
    assert(Array.isArray(t.alpaca_responses), `test ${t.test_name} missing alpaca_responses array`);
  }
});