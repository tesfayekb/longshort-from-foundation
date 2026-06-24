/**
 * AlpacaLocateFetcher (EDGE-RESIDENT) — implements BrokerLocateFetcher against
 * Alpaca paper. Endpoint: POST /v2/short_locates body { symbol, qty }.
 *
 * E5.5 Phase-1 (ACT-317) — transcription of src/.../alpaca-locate-fetcher.ts.
 * Byte-identical logic. Consumed by the §7 preflight composer's
 * verify_short_availability leg — invoked AFTER the htb-cache pre-flight
 * consult (E4 load-bearing wiring: consult the htb record BEFORE the
 * broker locate; this adapter is only reached when the consult misses).
 *
 * Per §11.0.7 #4: locate absence returns `available: false` explicitly
 * (NOT default-on-failure). 4xx → explicit unavailable; 5xx + network → throw.
 * Per DEC-034 (3): typed throws preserved.
 */
import type {
  BrokerLocateResult,
  BrokerLocateFetcher,
} from '../longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaLocateResponse {
  symbol: string;
  locate_id?: string;
  qty?: number;
  available: boolean;
}

const DEFAULT_LOCATE_PROBE_QTY = 1 as const;

export class AlpacaLocateFetcher implements BrokerLocateFetcher {
  constructor(
    private readonly client: AlpacaPaperClient,
    private readonly probeQty: number = DEFAULT_LOCATE_PROBE_QTY,
  ) {}

  async fetchLocate(symbol: string, ts: Date): Promise<BrokerLocateResult> {
    try {
      const resp = await this.client.postJson<{ symbol: string; qty: number }, AlpacaLocateResponse>(
        `/v2/short_locates`,
        { symbol, qty: this.probeQty },
      );
      return {
        symbol: resp.symbol,
        available: resp.available === true,
        locate_id: resp.available && resp.locate_id ? resp.locate_id : null,
        qty_available: resp.available && typeof resp.qty === 'number' ? resp.qty : null,
        fetched_at: ts,
      };
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status >= 400 && e.status < 500) {
        return {
          symbol,
          available: false,
          locate_id: null,
          qty_available: null,
          fetched_at: ts,
        };
      }
      throw e;
    }
  }
}