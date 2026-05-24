#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * broker-spot-check — Pre-built broker-API spot-check helper per §11.0.13.
 *
 * Per ADR-001 §8 + CLAUDE.md §8 E3 (Ground-Truth Spot Check) — the E3 tooling.
 *
 * Sub-step 6.4: mock-mode only; --provider=alpaca surfaces deferred-to-6.7 error.
 * CLI: `deno run --allow-net --allow-env scripts/broker-spot-check.ts --check=<verify_* name> --symbol=<sym> [--provider=mock|alpaca]`
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';

const SUPPORTED_CHECKS = [
  'verify_position', 'verify_quote', 'verify_short_availability', 'verify_ssr_status',
] as const;
type SpotCheckName = (typeof SUPPORTED_CHECKS)[number];

export interface SpotCheckArgs {
  check: string;
  symbol: string;
  provider: 'mock' | 'alpaca';
}

export interface SpotCheckResult {
  check: string;
  symbol: string;
  provider: string;
  result: Record<string, unknown> | null;
  message: string;
}

export function parseArguments(argv: string[]): SpotCheckArgs {
  const parsed = parseArgs(argv, {
    string: ['check', 'symbol', 'provider'],
    default: { provider: 'mock' },
  });
  return {
    check: parsed.check as string,
    symbol: parsed.symbol as string,
    provider: parsed.provider as 'mock' | 'alpaca',
  };
}

export function runSpotCheck(args: SpotCheckArgs): SpotCheckResult {
  if (!args.check || !args.symbol) {
    throw new Error('runSpotCheck: --check and --symbol are required');
  }
  if (!SUPPORTED_CHECKS.includes(args.check as SpotCheckName)) {
    throw new Error(`runSpotCheck: unsupported check name '${args.check}'. Supported: ${SUPPORTED_CHECKS.join(', ')}`);
  }
  if (args.provider === 'alpaca') {
    return {
      check: args.check,
      symbol: args.symbol,
      provider: 'alpaca',
      result: null,
      message: 'broker-spot-check: --provider=alpaca not yet implemented (sub-step 6.7 Alpaca paper integration)',
    };
  }
  const mockResults: Record<SpotCheckName, Record<string, unknown>> = {
    verify_position: { symbol: args.symbol, qty: 0, avg_entry_price: 0 },
    verify_quote: { symbol: args.symbol, bid: 150.00, ask: 150.05, last: 150.02 },
    verify_short_availability: { symbol: args.symbol, available: true, qty_available: 1000 },
    verify_ssr_status: { symbol: args.symbol, state: 'not_active' },
  };
  return {
    check: args.check,
    symbol: args.symbol,
    provider: 'mock',
    result: mockResults[args.check as SpotCheckName],
    message: `broker-spot-check: mock response for ${args.check}(${args.symbol})`,
  };
}

if (import.meta.main) {
  const args = parseArguments(Deno.args);
  try {
    const result = runSpotCheck(args);
    console.log(JSON.stringify(result, null, 2));
    Deno.exit(result.provider === 'alpaca' ? 1 : 0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    Deno.exit(1);
  }
}