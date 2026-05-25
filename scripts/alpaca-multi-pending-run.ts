#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * alpaca-multi-pending-run — CLI to run the §8.6.1.1 multi-pending validation harness.
 *
 * Usage:
 *   ALPACA_PAPER_KEY=... ALPACA_PAPER_SECRET=... \
 *     deno run --allow-net --allow-env scripts/alpaca-multi-pending-run.ts [--symbol=AAPL]
 *
 * Output: JSON HarnessResult to stdout; suitable for paste into supervisor chat for
 * ADR-002 follow-on prompt determination.
 *
 * Exit 0 if all 7 tests pass; 1 if any fail / inconclusive; 2 if pre-flight aborts.
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';
import { AlpacaPaperClient } from '../src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts';
import { runMultiPendingHarness } from '../src/features/longshort/services/broker/alpaca/multi-pending-harness.ts';

export interface RunArgs {
  symbol: string;
}

export function parseRunArguments(argv: string[]): RunArgs {
  const parsed = parseArgs(argv, { string: ['symbol'] });
  return { symbol: (parsed.symbol as string | undefined) ?? 'AAPL' };
}

if (import.meta.main) {
  const args = parseRunArguments(Deno.args);
  const client = new AlpacaPaperClient();
  const result = await runMultiPendingHarness({ client, symbol: args.symbol });
  console.log(JSON.stringify(result, null, 2));
  if (result.overall_status === 'aborted_pre_flight') Deno.exit(2);
  Deno.exit(result.overall_status === 'all_pass' ? 0 : 1);
}