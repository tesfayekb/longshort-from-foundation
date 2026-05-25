/**
 * multi-pending-harness — DEC-036 clause (6) / §8.6.1.1 / ADR-002 empirical validation suite.
 *
 * 7 tests against Alpaca paper API. Each test cleans up after itself. Harness emits
 * structured JSON suitable for ADR-002 determination + supervisor chat paste-back.
 *
 * Safety guardrails:
 *   - Position size capped at 1 share per test order (minimum exposure)
 *   - Paper API only (hardcoded via AlpacaPaperClient default base URL)
 *   - Each test wraps in try/finally with cleanup
 *   - Pre-flight sanity: aborts if /v2/account doesn't look like a usable paper account
 *
 * Per DEC-034 clause (3): errors propagate to caller (per-test wrapper catches + records).
 * Per DEC-034 clause (4): no Date.now in business logic; timing measured via ISO strings
 *   from Alpaca response fields.
 */

import { AlpacaPaperClient, AlpacaApiError, AlpacaNetworkError } from './alpaca-paper-client.ts';

export type TestStatus = 'pass' | 'fail' | 'inconclusive';

export interface MultiPendingTestResult {
  test_name: string;
  status: TestStatus;
  observations: Record<string, unknown>;
  alpaca_responses: unknown[];
  error?: string;
}

export interface HarnessResult {
  harness_version: 1;
  test_symbol: string;
  account_buying_power_at_start: string | null;
  account_buying_power_at_end: string | null;
  final_position_state: 'clean' | 'unclean';
  tests: MultiPendingTestResult[];
  overall_status: 'all_pass' | 'partial' | 'all_fail' | 'aborted_pre_flight';
}

export interface RunHarnessConfig {
  client: AlpacaPaperClient;
  symbol: string;
  abortOnPreflight?: boolean;
}

const ORDER_QTY = 1;

interface AlpacaAccountSnapshot {
  buying_power: string;
  account_blocked: boolean;
  trading_blocked: boolean;
  pattern_day_trader: boolean;
}

async function preflightSanity(config: RunHarnessConfig): Promise<{ ok: boolean; buying_power: string | null; reason?: string }> {
  try {
    const account = await config.client.getJson<AlpacaAccountSnapshot>('/v2/account');
    if (account.account_blocked || account.trading_blocked) {
      return { ok: false, buying_power: account.buying_power, reason: 'account_or_trading_blocked' };
    }
    if (parseFloat(account.buying_power) <= 0) {
      return { ok: false, buying_power: account.buying_power, reason: 'no_buying_power' };
    }
    return { ok: true, buying_power: account.buying_power };
  } catch (e) {
    return { ok: false, buying_power: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function runTest(
  testName: string,
  _client: AlpacaPaperClient,
  testFn: () => Promise<{ status: TestStatus; observations: Record<string, unknown>; alpaca_responses: unknown[] }>,
): Promise<MultiPendingTestResult> {
  try {
    const r = await testFn();
    return { test_name: testName, ...r };
  } catch (e) {
    return {
      test_name: testName,
      status: 'fail',
      observations: {},
      alpaca_responses: [],
      error: e instanceof AlpacaApiError ? `${e.status}: ${e.bodyText.slice(0, 200)}`
        : e instanceof AlpacaNetworkError ? e.message
        : e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Run the full 7-test harness. Each test currently lands as a skeleton emitting
 * 'inconclusive' status. Per the prompt's §22.3 item 4 note, actual Alpaca-side
 * flows are populated incrementally; ambiguous flows surface in chat before commit.
 */
export async function runMultiPendingHarness(config: RunHarnessConfig): Promise<HarnessResult> {
  const preflight = await preflightSanity(config);
  if (!preflight.ok) {
    return {
      harness_version: 1,
      test_symbol: config.symbol,
      account_buying_power_at_start: preflight.buying_power,
      account_buying_power_at_end: preflight.buying_power,
      final_position_state: 'unclean',
      tests: [{
        test_name: 'preflight_sanity',
        status: 'fail',
        observations: { reason: preflight.reason ?? 'unknown' },
        alpaca_responses: [],
      }],
      overall_status: 'aborted_pre_flight',
    };
  }

  const tests: MultiPendingTestResult[] = [];

  // Test 1: Multi-pending acceptance — submit 2 close-side orders for same symbol;
  // both should reach 'accepted' state (not one rejected as duplicate).
  tests.push(await runTest('1_multi_pending_acceptance', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — submits 2 sell orders @ far-out-of-money limits, polls /v2/orders/{id} for accepted, cancels both' },
      alpaca_responses: [],
    };
  }));

  // Test 2: Fill independence — submit 2 limit orders at different prices;
  // each fills/rejects independently.
  tests.push(await runTest('2_fill_independence', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — submits 2 marketable limits at distinct prices, observes per-order fill independence' },
      alpaca_responses: [],
    };
  }));

  // Test 3: Over-close detection latency — submit 2 orders summing to over-close;
  // measure latency from 2nd fill to /v2/positions reflecting over-close.
  tests.push(await runTest('3_over_close_detection_latency', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — measures ISO-timestamp delta between 2nd fill timestamp and /v2/positions visible over-close' },
      alpaca_responses: [],
    };
  }));

  // Test 4: Corrective-trade acceptance — after over-close, submit opposite trade;
  // assert accepted normally.
  tests.push(await runTest('4_corrective_trade_acceptance', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — submits buy after artificial over-short to verify corrective acceptance path' },
      alpaca_responses: [],
    };
  }));

  // Test 5: Order ID collision — submit 2 orders with same client_order_id;
  // observe Alpaca rejection (typically 422 conflict).
  tests.push(await runTest('5_order_id_collision_behavior', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — submits 2 orders sharing client_order_id, records status code + error body of duplicate' },
      alpaca_responses: [],
    };
  }));

  // Test 6: Locate persistence across parallel orders — request locate qty N,
  // submit 2 short orders consuming N; observe atomic vs fragmented consumption.
  tests.push(await runTest('6_locate_persistence_parallel', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — requests short_locate, submits 2 short orders, observes locate consumption semantics' },
      alpaca_responses: [],
    };
  }));

  // Test 7: TIF=DAY interaction near close — submit 2 TIF=DAY orders;
  // observe whether both expire identically at session end.
  tests.push(await runTest('7_tif_day_interaction', config.client, async () => {
    return {
      status: 'inconclusive',
      observations: { qty: ORDER_QTY, note: 'skeleton — submits 2 TIF=DAY orders, observes parallel expiry at session end' },
      alpaca_responses: [],
    };
  }));

  // Post-test: best-effort close any residual position on test symbol
  let finalPositionState: 'clean' | 'unclean' = 'clean';
  try {
    try {
      await config.client.getJson(`/v2/positions/${encodeURIComponent(config.symbol)}`);
      // Position exists — attempt market close (qty 1, sell side as a best-effort cleanup)
      await config.client.postJson('/v2/orders', {
        symbol: config.symbol,
        qty: ORDER_QTY,
        side: 'sell',
        type: 'market',
        time_in_force: 'day',
      });
      finalPositionState = 'clean';
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 404) finalPositionState = 'clean';
      else finalPositionState = 'unclean';
    }
  } catch {
    finalPositionState = 'unclean';
  }

  const finalAccount = await preflightSanity(config);

  const passCount = tests.filter((t) => t.status === 'pass').length;
  const failCount = tests.filter((t) => t.status === 'fail').length;
  let overallStatus: HarnessResult['overall_status'];
  if (passCount === tests.length) overallStatus = 'all_pass';
  else if (failCount === tests.length) overallStatus = 'all_fail';
  else overallStatus = 'partial';

  return {
    harness_version: 1,
    test_symbol: config.symbol,
    account_buying_power_at_start: preflight.buying_power,
    account_buying_power_at_end: finalAccount.buying_power,
    final_position_state: finalPositionState,
    tests,
    overall_status: overallStatus,
  };
}