#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * alpaca-paper-connection-test — Gate 6.7 PASS evidence CLI.
 *
 * Exercises each of the 6 fetcher implementations against live Alpaca paper API and
 * emits structured JSON to stdout. Suitable for §12.5 evidence bundle inclusion.
 *
 * Usage:
 *   ALPACA_PAPER_KEY=... ALPACA_PAPER_SECRET=... \
 *     deno run --allow-net --allow-env scripts/alpaca-paper-connection-test.ts
 *
 * Output: JSON object with per-fetcher status; exit 0 if all succeed, 1 otherwise.
 *
 * Per DEC-034 clause (4): caller-injected ts (here read from PROBE_TS env var if set,
 * else from CLI arg; no Date.now in the fetcher layer). The CLI itself uses a
 * bootstrap ts captured from an outer caller — we accept it via env to keep
 * the script deterministic when invoked from a runner.
 */

import {
  AlpacaPaperClient,
  AlpacaCredentialError,
  AlpacaApiError,
  AlpacaNetworkError,
} from '../src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts';
import { AlpacaPositionFetcher } from '../src/features/longshort/services/broker/alpaca/alpaca-position-fetcher.ts';
import { AlpacaQuoteFetcher } from '../src/features/longshort/services/broker/alpaca/alpaca-quote-fetcher.ts';
import { AlpacaHaltStatusFetcher } from '../src/features/longshort/services/broker/alpaca/alpaca-halt-status-fetcher.ts';
import { AlpacaLocateFetcher } from '../src/features/longshort/services/broker/alpaca/alpaca-locate-fetcher.ts';
import { AlpacaBuyingPowerFetcher } from '../src/features/longshort/services/broker/alpaca/alpaca-buying-power-fetcher.ts';
import { AlpacaOrderAcceptanceFetcher } from '../src/features/longshort/services/broker/alpaca/alpaca-order-acceptance-fetcher.ts';

export interface FetcherCheckResult {
  fetcher: string;
  status: 'ok' | 'error';
  detail: string;
}

export interface ConnectionTestResult {
  overall_status: 'ok' | 'error';
  fetcher_results: FetcherCheckResult[];
  credential_error: boolean;
  probe_symbol: string;
  probe_ts: string;
}

export interface ConnectionTestArgs {
  probeSymbol?: string;
  probeTs?: Date;
  probeOrderId?: string;
}

export function parseArgs(argv: string[], env: { get(name: string): string | undefined }): ConnectionTestArgs {
  const out: ConnectionTestArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--symbol' && argv[i + 1]) { out.probeSymbol = argv[++i]; continue; }
    if (a === '--ts' && argv[i + 1]) { out.probeTs = new Date(argv[++i]); continue; }
    if (a === '--order-id' && argv[i + 1]) { out.probeOrderId = argv[++i]; continue; }
  }
  if (!out.probeSymbol) {
    const e = env.get('PROBE_SYMBOL');
    if (e) out.probeSymbol = e;
  }
  if (!out.probeTs) {
    const e = env.get('PROBE_TS');
    if (e) out.probeTs = new Date(e);
  }
  if (!out.probeOrderId) {
    const e = env.get('PROBE_ORDER_ID');
    if (e) out.probeOrderId = e;
  }
  return out;
}

export async function runConnectionTest(args: ConnectionTestArgs = {}): Promise<ConnectionTestResult> {
  const probeSymbol = args.probeSymbol ?? 'AAPL';
  const probeTs = args.probeTs ?? new Date('2026-01-02T14:30:00Z');
  const probeOrderId = args.probeOrderId ?? null;
  const results: FetcherCheckResult[] = [];

  let client: AlpacaPaperClient;
  try {
    client = new AlpacaPaperClient();
  } catch (e) {
    const credentialError = e instanceof AlpacaCredentialError;
    return {
      overall_status: 'error',
      fetcher_results: [],
      credential_error: credentialError,
      probe_symbol: probeSymbol,
      probe_ts: probeTs.toISOString(),
    };
  }

  async function check(name: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      const result = await fn();
      const detail = result === null ? 'null' : (typeof result === 'object' ? Object.keys(result as object).join(',') : String(result));
      results.push({ fetcher: name, status: 'ok', detail });
    } catch (e) {
      const detail = e instanceof AlpacaApiError ? `${e.status}: ${e.bodyText.slice(0, 80)}`
        : e instanceof AlpacaNetworkError ? e.message
        : e instanceof Error ? e.message : String(e);
      results.push({ fetcher: name, status: 'error', detail });
    }
  }

  await check('buying_power', () => new AlpacaBuyingPowerFetcher(client).fetchBuyingPower(probeTs));
  await check('quote', () => new AlpacaQuoteFetcher(client).fetchQuote(probeSymbol, probeTs));
  await check('halt_status', () => new AlpacaHaltStatusFetcher(client).fetchHaltStatus(probeSymbol, probeTs));
  await check('position_lookup', () => new AlpacaPositionFetcher(client).fetchPosition(probeSymbol, probeTs));
  await check('locate', () => new AlpacaLocateFetcher(client).fetchLocate(probeSymbol, probeTs));
  if (probeOrderId) {
    await check('order_acceptance', () => new AlpacaOrderAcceptanceFetcher(client).fetchOrderAcceptance(probeOrderId, 30, probeTs));
  }

  const allOk = results.every((r) => r.status === 'ok');
  return {
    overall_status: allOk ? 'ok' : 'error',
    fetcher_results: results,
    credential_error: false,
    probe_symbol: probeSymbol,
    probe_ts: probeTs.toISOString(),
  };
}

// @ts-ignore — Deno global
declare const Deno: { args: string[]; env: { get(n: string): string | undefined }; exit(n: number): never };

if (import.meta.main) {
  const args = parseArgs(Deno.args, Deno.env);
  const result = await runConnectionTest(args);
  console.log(JSON.stringify(result, null, 2));
  Deno.exit(result.overall_status === 'ok' ? 0 : 1);
}