/**
 * OvershootAlpacaShortabilityFetcher (EDGE-RESIDENT) — implements
 * BrokerShortabilityFetcher (overshoot surface) against Alpaca paper.
 *
 * Endpoint: GET /v2/assets/{symbol} — `shortable` boolean is the
 * authoritative pre-trade gate. Alpaca composes ETB-list membership +
 * marginability into this single boolean; gating on it is structurally
 * equivalent to a pre-trade locate.
 *
 * FP-069 W3.2.c (ACT-459.c) — overshoot-owned sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-shortability-fetcher.ts
 * Behavior byte-equivalent to the longshort copy (transcription, not
 * redesign). The longshort copy remains untouched.
 *
 * OVERSHOOT-SPECIFIC REBINDINGS:
 *   1. Type imports — from '../overshoot-broker-interfaces.ts' (owned tree).
 *   2. Client + error-class imports — Overshoot* from './alpaca-paper-client.ts'.
 *   3. Class name — OvershootAlpacaShortabilityFetcher.
 *
 * TYPED HANDLING (verbatim from longshort semantics):
 *   - Inactive / non-tradable → shortable:false structurally (never trust
 *     stale `shortable:true` on a delisted asset).
 *   - 4xx (asset-not-found / unknown symbol) → shortable:false EXPLICIT —
 *     the broker's explicit "no". NEVER a fabricated `true` fallback.
 *   - 5xx / network errors PROPAGATE typed (DEC-034 (3)) — server-side
 *     unknown-state must not be silently degraded to a trading decision.
 *   - `easy_to_borrow` absent → `null` typed absence (not `false`).
 */
import type {
  BrokerShortability,
  BrokerShortabilityFetcher,
} from '../overshoot-broker-interfaces.ts';
import { OvershootAlpacaApiError, type OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaAssetResponse {
  symbol: string;
  status: string;
  tradable: boolean;
  shortable?: boolean;
  easy_to_borrow?: boolean;
}

export class OvershootAlpacaShortabilityFetcher implements BrokerShortabilityFetcher {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

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
      if (e instanceof OvershootAlpacaApiError && e.status >= 400 && e.status < 500) {
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