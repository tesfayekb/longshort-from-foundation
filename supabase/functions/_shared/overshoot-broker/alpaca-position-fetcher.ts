/**
 * OvershootAlpacaPositionFetcher (EDGE-RESIDENT) — implements BrokerPositionFetcher
 * (overshoot surface) against Alpaca paper.
 *   - `fetchPosition`: GET /v2/positions/{symbol} (404 → null per interface)
 *   - `listOpenPositions`: GET /v2/positions (returns every open row)
 *
 * FP-069 W3.2.c (ACT-459.c) — overshoot-owned sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-position-fetcher.ts
 * Behavior byte-equivalent to the longshort copy (transcription, not
 * redesign). The longshort copy remains untouched. Broker-truth surface —
 * no persisted projection semantics altered by this file. Downstream
 * consumers (overshoot reconciliation / planner analogs, W3.4+) apply
 * their own domain interpretation.
 *
 * OVERSHOOT-SPECIFIC REBINDINGS (only differences vs longshort copy):
 *   1. Type imports — from '../overshoot-broker-interfaces.ts' (owned tree).
 *   2. Client + error-class imports — Overshoot* from './alpaca-paper-client.ts'.
 *   3. Class name — OvershootAlpacaPositionFetcher.
 *
 * FP-068 W1 additive fields (unrealized_pl / unrealized_intraday_pl /
 * lastday_price) are preserved verbatim — Alpaca /v2/positions surfaces
 * them natively, and typed-absence is enforced (NEVER fabricated 0). If a
 * downstream overshoot consumer needs a value it MUST branch on presence.
 *
 * Per DEC-034 (3): non-404 errors propagate typed.
 * Per DEC-034 (4): broker-stamped `fetched_at` derived from injected `ts`.
 */
import type {
  BrokerPosition,
  BrokerPositionFetcher,
} from '../overshoot-broker-interfaces.ts';
import { OvershootAlpacaApiError, type OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaPositionResponse {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  side: 'long' | 'short';
  market_value?: string;
  current_price?: string;
  // FP-068 W1 additive — surfaced by Alpaca /v2/positions natively.
  unrealized_pl?: string;
  unrealized_intraday_pl?: string;
  lastday_price?: string;
}

export class OvershootAlpacaPositionFetcher implements BrokerPositionFetcher {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

  async fetchPosition(symbol: string, ts: Date): Promise<BrokerPosition | null> {
    try {
      const resp = await this.client.getJson<AlpacaPositionResponse>(
        `/v2/positions/${encodeURIComponent(symbol)}`,
      );
      return mapPosition(resp, ts);
    } catch (e) {
      if (e instanceof OvershootAlpacaApiError && e.status === 404) return null;
      throw e;
    }
  }

  async listOpenPositions(ts: Date): Promise<BrokerPosition[]> {
    const resp = await this.client.getJson<AlpacaPositionResponse[]>('/v2/positions');
    return resp.map((r) => mapPosition(r, ts));
  }
}

function mapPosition(resp: AlpacaPositionResponse, ts: Date): BrokerPosition {
  const out: BrokerPosition = {
    symbol: resp.symbol,
    qty: parseFloat(resp.qty), // allow-bare-parsefloat: DW-058-B1 parity
    avg_entry_price: parseFloat(resp.avg_entry_price), // allow-bare-parsefloat: DW-058-B1 parity
    fetched_at: ts,
  };
  if (typeof resp.market_value === 'string' && resp.market_value.length > 0) {
    out.market_value = parseFloat(resp.market_value); // allow-bare-parsefloat: DW-058-B1 parity
  }
  if (typeof resp.current_price === 'string' && resp.current_price.length > 0) {
    out.current_price = parseFloat(resp.current_price); // allow-bare-parsefloat: DW-058-B1 parity
  }
  // FP-068 W1 additive — typed-absence (never fabricated 0).
  if (typeof resp.unrealized_pl === 'string' && resp.unrealized_pl.length > 0) {
    out.unrealized_pl = parseFloat(resp.unrealized_pl); // allow-bare-parsefloat: DW-058-B1 parity
  }
  if (typeof resp.unrealized_intraday_pl === 'string' && resp.unrealized_intraday_pl.length > 0) {
    out.unrealized_intraday_pl = parseFloat(resp.unrealized_intraday_pl); // allow-bare-parsefloat: DW-058-B1 parity
  }
  if (typeof resp.lastday_price === 'string' && resp.lastday_price.length > 0) {
    out.lastday_price = parseFloat(resp.lastday_price); // allow-bare-parsefloat: DW-058-B1 parity
  }
  return out;
}