// @ts-nocheck — Deno test file; integration test against live Alpaca paper. Deno.test.ignore by default.
//
// REQUIRES ALPACA_PAPER_KEY + ALPACA_PAPER_SECRET in env. Runs the full 7-test harness
// against live Alpaca paper API. Used to debug harness behavior post-implementation.
// Operator runs locally:
//   ALPACA_PAPER_KEY=... ALPACA_PAPER_SECRET=... deno test --allow-net --allow-env \
//       src/features/longshort/services/broker/alpaca/multi-pending-harness_integration_test.ts
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AlpacaPaperClient } from './alpaca-paper-client.ts';
import { runMultiPendingHarness } from './multi-pending-harness.ts';

Deno.test.ignore('[INTEGRATION] full 7-test harness completes against live Alpaca paper', async () => {
  const client = new AlpacaPaperClient();
  const result = await runMultiPendingHarness({ client, symbol: 'AAPL' });
  assert(result.tests.length === 7);
  assert(result.overall_status !== 'aborted_pre_flight');
  console.log(JSON.stringify(result, null, 2));
});