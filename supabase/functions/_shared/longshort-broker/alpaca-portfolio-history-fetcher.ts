/**
 * AlpacaPortfolioHistoryFetcher — FP-068 W3 (ACT-442).
 *
 * GET /v2/account/portfolio/history on the AlpacaPaperClient. Read-only,
 * money-path UNTOUCHED. Inherits the INC-77 paper-only URL allow-list
 * (DEC-068 (f)+(k).8) via AlpacaPaperClient construction — a new fetcher
 * on this client is guarded, it cannot be pointed at the live host.
 *
 * Alpaca returns parallel arrays keyed by index:
 *   { timestamp: number[] (epoch seconds), equity: (number|null)[],
 *     profit_loss: (number|null)[], base_value: number, timeframe: string }
 *
 * We reshape to typed-absence rows: entries where `equity` is null or the
 * broker omitted a sample are dropped rather than fabricated as 0.
 *
 * Per DEC-034 (4): no wall-clock read here; caller injects nothing (the
 * broker computes ts server-side).
 */
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

export interface PortfolioHistoryParams {
  /** Alpaca "period": e.g. '1D', '7D', '1M', '3M', '6M', '1A', 'all'. */
  period: string;
  /** Alpaca "timeframe": '1Min' | '5Min' | '15Min' | '1H' | '1D'. */
  timeframe: string;
}

export interface PortfolioHistoryPoint {
  /** Epoch milliseconds (converted from Alpaca's epoch-seconds). */
  ts_ms: number;
  equity: number;
  profit_loss: number | null;
}

export interface PortfolioHistorySeries {
  base_value: number | null;
  timeframe: string;
  points: PortfolioHistoryPoint[];
}

interface AlpacaPortfolioHistoryResponse {
  timestamp?: number[];
  equity?: (number | null)[];
  profit_loss?: (number | null)[];
  base_value?: number;
  timeframe?: string;
}

export class AlpacaPortfolioHistoryFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetch(params: PortfolioHistoryParams): Promise<PortfolioHistorySeries> {
    const qs = new URLSearchParams({
      period: params.period,
      timeframe: params.timeframe,
    });
    const resp = await this.client.getJson<AlpacaPortfolioHistoryResponse>(
      `/v2/account/portfolio/history?${qs.toString()}`,
    );
    const ts = resp.timestamp ?? [];
    const eq = resp.equity ?? [];
    const pl = resp.profit_loss ?? [];
    const points: PortfolioHistoryPoint[] = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const e = eq[i];
      // typed-absence: skip samples where equity is null (broker gap).
      if (typeof t !== 'number' || typeof e !== 'number') continue;
      points.push({
        ts_ms: t * 1000,
        equity: e,
        profit_loss: typeof pl[i] === 'number' ? (pl[i] as number) : null,
      });
    }
    return {
      base_value: typeof resp.base_value === 'number' ? resp.base_value : null,
      timeframe: resp.timeframe ?? params.timeframe,
      points,
    };
  }
}