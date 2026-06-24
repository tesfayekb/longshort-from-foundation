/**
 * stub-capital-fetcher — Step G dry-run capital source.
 *
 * Used by the longshort-targets-compute edge fns ONLY while
 * `ALPACA_PAPER_KEY` / `ALPACA_PAPER_SECRET` are absent from the
 * runtime environment. Returns a fixed `account_equity = 100000`
 * dollar value so the kernel can produce shape-correct target rows
 * against the LIVE combiner_book without a broker round-trip.
 *
 * EVERY target row computed via this fetcher carries
 * `sizing_basis='account_equity'` and `sizing_basis_value=100000` —
 * the audit trail makes the stub origin queryable. The downstream
 * Phase-5 paper-exec DEC must REFUSE to act on rows whose
 * `sizing_basis_value` matches the stub literal without operator
 * acknowledgement (a guard hook for the future execution layer; the
 * current Step A surface has zero execution path).
 *
 * Removed once the operator provisions Alpaca paper secrets and the
 * edge fn switches to `AlpacaBuyingPowerFetcher` — see DW-137.
 */
import type {
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
} from '../longshort-broker-interfaces.ts';

export const STUB_ACCOUNT_EQUITY = 100_000 as const;

export class StubCapitalFetcher implements BrokerBuyingPowerFetcher {
  fetchBuyingPower(ts: Date): Promise<BrokerBuyingPower> {
    return Promise.resolve({
      available_bp: STUB_ACCOUNT_EQUITY * 2,
      account_equity: STUB_ACCOUNT_EQUITY,
      fetched_at: ts,
    });
  }
}

// @ts-ignore — Deno global; consumed by edge runtime.
declare const Deno: { env: { get(name: string): string | undefined } };

/**
 * Step A always returns the stub. The Alpaca-presence check is logged
 * via the returned `source` literal — `stub_100k` is the only outcome
 * here; live wiring is the post-secret-provision follow-up (DW-137),
 * intentionally NOT exercised by Step A's deploy (per STOP condition:
 * "the dry-run uses the LIVE Alpaca fetcher … → STOP").
 */
export function selectCapitalFetcher(): {
  fetcher: BrokerBuyingPowerFetcher;
  source: 'stub_100k';
  alpaca_secrets_present: boolean;
} {
  const alpaca_secrets_present =
    !!Deno.env.get('ALPACA_PAPER_KEY') && !!Deno.env.get('ALPACA_PAPER_SECRET');
  return {
    fetcher: new StubCapitalFetcher(),
    source: 'stub_100k',
    alpaca_secrets_present,
  };
}