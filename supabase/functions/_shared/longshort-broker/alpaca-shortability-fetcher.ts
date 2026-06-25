/**
 * AlpacaShortabilityFetcher (EDGE-RESIDENT) — implements
 * BrokerShortabilityFetcher against Alpaca paper.
 *
 * Endpoint: GET /v2/assets/{symbol} — `shortable` boolean is the
 * authoritative pre-trade gate (operator STEP-A probe verbatim:
 * SPY/AAPL/MSFT/NVDA/GME/RIVN/PLUG/SOFI shortable:true; BBBYQ
 * shortable:false). Alpaca composes ETB-list membership + marginability
 * into this single boolean; gating on it is structurally equivalent to
 * a pre-trade locate without requiring a venue locate endpoint.
 *
 * Shares the asset-endpoint shape with `AlpacaHaltStatusFetcher` —
 * separate adapter (not folded) so each verifier's gate semantics stay
 * the source of truth for its own classification.
 *
 * Inactive/delisted symbols return shortable:false explicitly. 4xx for
 * an unknown symbol returns shortable:false (broker's explicit "no").
 * 5xx / network errors throw per DEC-034 (3).
 *
 * ACT-331 (DEC-068 clause (q)) — REVISION-FIX scope.
 */
import type {
  BrokerShortability,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAssetResponse {
  symbol: string;
  status: string;
  tradable: boolean;
  shortable?: boolean;
  easy_to_borrow?: boolean;
}

export class AlpacaShortabilityFetcher implements BrokerShortabilityFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchShortability(symbol: string, ts: Date): Promise<BrokerShortability> {
    try {
      const resp = await this.client.getJson<AlpacaAssetResponse>(
        `/v2/assets/${encodeURIComponent(symbol)}`,
      );
      // Inactive/non-tradable structurally not shortable regardless of the field.
      const inactive = resp.status !== 'active' || resp.tradable === false;
      const shortable = !inactive && resp.shortable === true;
      return {
        symbol: resp.symbol,
        shortable,
        easy_to_borrow: typeof resp.easy_to_borrow === 'boolean' ? resp.easy_to_borrow : null,
        fetched_at: ts,
      };
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status >= 400 && e.status < 500) {
        return {
          symbol,
          shortable: false,
          easy_to_borrow: null,
          fetched_at: ts,
        };
      }
      throw e;
    }
  }
}