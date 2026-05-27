/**
 * PolygonEnrichmentFetcher — Polygon-backed enrichment tier for FP-008 Phase 1
 * universe construction per AC-06 path.
 *
 * Owner: longshort (FP-008 sub-step 8.2)
 * Classification: financial-critical (enrichment produces the §3.2 filter-input
 * data layer; per DEC-038.1 clause (1) folder-pattern accommodation; AC-06).
 *
 * Polygon endpoints consumed:
 *   GET https://api.polygon.io/v3/reference/tickers/{ticker}
 *     → market_cap + list_date + type (ADR detection) + sic_description (REIT detection)
 *   GET https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
 *     → daily aggregates for last 60 trading days
 *       avg_daily_dollar_volume = mean(close × volume)
 *       share_price             = most recent close
 *
 * Secret: POLYGON_API_KEY (registered at ACT-105 / env-var-index.md).
 *
 * Design discipline:
 *   - `as_of: Date` parameter per DEC-034 clause (4) + DEC-035 clause (2) +
 *     DEC-038 clause (6) injected-clock contract — no `Date.now()` /
 *     `new Date()` outside the sanctioned `as_of` chokepoint.
 *   - `null` typed-absence per §2 axiom 3 + DEC-038 clause (6) — when Polygon
 *     omits a field (market_cap / list_date), the resulting field is `null`,
 *     NOT a silent default to zero.
 *   - Network / auth / parse failures throw `ConstituentFetchError` (per
 *     DEC-034 clauses (2)+(3)); ticker-level 404 is treated as "ticker not
 *     enrichable" and the row is omitted from the output (debug-level audit
 *     left to the calling job at sub-step 8.4).
 *   - HTTP fetch is injected via constructor for unit-testability.
 *   - iShares constituents are NOT enriched per ACT-106 Guardrail 2; callers
 *     pass ONLY the Polygon-sourced membership list to `enrich()`.
 *   - No `reconcile()` coupling (cross-check at 8.8); no DB writes
 *     (persistence at 8.6); no `logAuditEvent` import (DEC-033 v4.1).
 */
import type {
  HttpFetch,
  UniverseConstituent,
} from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import { ConstituentFetchError } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import type { EnrichedConstituent, UniverseEnrichmentFetcher } from './types.ts';
import { fetchWithTimeoutAndRetry, DEFAULT_FETCH_TIMEOUT_MS } from '../shared/fetch-with-timeout.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
/** Trading-day lookback window for avg-daily-dollar-volume + share_price. */
const AGGREGATE_LOOKBACK_DAYS = 60;
/**
 * Calendar-day lookback used when requesting the aggregates window. We request
 * a generous window (~90 calendar days) to ensure ≥60 trading-day prints land,
 * then truncate to the last 60 trading days in-memory.
 */
const AGGREGATE_CALENDAR_LOOKBACK_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Polygon `type` codes that indicate an American Depositary Receipt. */
const ADR_TYPE_CODES: ReadonlyArray<string> = ['ADRC', 'ADRP', 'ADRR', 'ADRW'];
/** Substrings (case-insensitive) in `sic_description` that indicate a REIT. */
const REIT_SIC_SUBSTRINGS: ReadonlyArray<string> = ['REIT', 'REAL ESTATE INVESTMENT TRUST'];

interface PolygonTickerDetailsResponse {
  results?: {
    market_cap?: number;
    list_date?: string;
    type?: string;
    sic_description?: string;
  };
}

interface PolygonAggBar {
  c?: number; // close
  v?: number; // volume (shares)
  t?: number; // timestamp (ms) — accepted but not relied on for clock semantics
}

interface PolygonAggsResponse {
  results?: PolygonAggBar[];
  resultsCount?: number;
  status?: string;
}

/** Format a Date as YYYY-MM-DD in UTC. */
function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export class PolygonEnrichmentFetcher implements UniverseEnrichmentFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonEnrichmentFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  async enrich(
    constituents: UniverseConstituent[],
    as_of: Date,
  ): Promise<EnrichedConstituent[]> {
    const out: EnrichedConstituent[] = [];
    for (const c of constituents) {
      if (c.source !== 'polygon') {
        // Guardrail 2: only the Polygon-sourced primary path is enriched.
        // iShares constituents flow through the cross-check at sub-step 8.8,
        // not through the filter pipeline. Defensive skip; not a hard error.
        continue;
      }
      const details = await this.fetchTickerDetails(c.ticker);
      if (details === null) continue; // ticker not enrichable (e.g., 404)
      const aggs = await this.fetchDailyAggregates(c.ticker, as_of);
      out.push({
        ...c,
        avg_daily_dollar_volume: aggs.avg_daily_dollar_volume,
        share_price: aggs.share_price,
        market_cap: details.market_cap,
        listing_date: details.list_date,
        is_adr: details.is_adr,
        is_reit: details.is_reit,
      });
    }
    return out;
  }

  private async fetchTickerDetails(ticker: string): Promise<{
    market_cap: number | null;
    list_date: string | null;
    is_adr: boolean;
    is_reit: boolean;
  } | null> {
    const url =
      `${POLYGON_BASE_URL}/v3/reference/tickers/${encodeURIComponent(ticker)}` +
      `?apiKey=${encodeURIComponent(this.apiKey)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(this.httpFetch, url, { method: 'GET' });
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      throw new ConstituentFetchError(
        'polygon',
        'sp500',
        isTimeout
          ? `request timeout after ${DEFAULT_FETCH_TIMEOUT_MS}ms on ticker-details for ${ticker}`
          : `network error on ticker-details for ${ticker}`,
        e,
      );
    }

    if (resp.status === 404) {
      return null; // ticker not present in Polygon reference; skip enrichment
    }
    if (!resp.ok) {
      throw new ConstituentFetchError(
        'polygon',
        'sp500',
        `HTTP ${resp.status} ${resp.statusText} on ticker-details for ${ticker}`,
      );
    }

    let body: PolygonTickerDetailsResponse;
    try {
      body = (await resp.json()) as PolygonTickerDetailsResponse;
    } catch (e) {
      throw new ConstituentFetchError('polygon', 'sp500', `JSON parse error on ticker-details for ${ticker}`, e);
    }

    const r = body.results ?? {};
    const typeCode = typeof r.type === 'string' ? r.type.toUpperCase() : '';
    const sicDesc = typeof r.sic_description === 'string' ? r.sic_description.toUpperCase() : '';

    return {
      market_cap: typeof r.market_cap === 'number' ? r.market_cap : null,
      list_date: typeof r.list_date === 'string' && r.list_date.length > 0 ? r.list_date : null,
      is_adr: ADR_TYPE_CODES.includes(typeCode),
      is_reit: REIT_SIC_SUBSTRINGS.some((s) => sicDesc.includes(s)),
    };
  }

  private async fetchDailyAggregates(
    ticker: string,
    as_of: Date,
  ): Promise<{ avg_daily_dollar_volume: number | null; share_price: number | null }> {
    // `as_of` is the sanctioned wall-clock chokepoint per DEC-038 clause (6);
    // derive the lookback window arithmetically without reading any other clock.
    const fromMs = as_of.getTime() - AGGREGATE_CALENDAR_LOOKBACK_DAYS * MS_PER_DAY;
    const from = isoDate(new Date(fromMs));
    const to = isoDate(as_of);
    const url =
      `${POLYGON_BASE_URL}/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
      `/range/1/day/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=5000&apiKey=${encodeURIComponent(this.apiKey)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(this.httpFetch, url, { method: 'GET' });
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      throw new ConstituentFetchError(
        'polygon',
        'sp500',
        isTimeout
          ? `request timeout after ${DEFAULT_FETCH_TIMEOUT_MS}ms on aggregates for ${ticker}`
          : `network error on aggregates for ${ticker}`,
        e,
      );
    }

    if (!resp.ok) {
      throw new ConstituentFetchError(
        'polygon',
        'sp500',
        `HTTP ${resp.status} ${resp.statusText} on aggregates for ${ticker}`,
      );
    }

    let body: PolygonAggsResponse;
    try {
      body = (await resp.json()) as PolygonAggsResponse;
    } catch (e) {
      throw new ConstituentFetchError('polygon', 'sp500', `JSON parse error on aggregates for ${ticker}`, e);
    }

    const bars = body.results ?? [];
    if (bars.length < AGGREGATE_LOOKBACK_DAYS) {
      // Fewer than 60 trading days of prints — typed-absence per §2 axiom 3.
      // The most recent close is still surfaced when available so callers can
      // distinguish "no aggregates at all" from "insufficient history".
      const last = bars[bars.length - 1];
      const sharePrice = last && typeof last.c === 'number' ? last.c : null;
      return { avg_daily_dollar_volume: null, share_price: sharePrice };
    }

    const window = bars.slice(bars.length - AGGREGATE_LOOKBACK_DAYS);
    let sumDollarVolume = 0;
    let valid = 0;
    for (const bar of window) {
      if (typeof bar.c === 'number' && typeof bar.v === 'number') {
        sumDollarVolume += bar.c * bar.v;
        valid += 1;
      }
    }
    if (valid < AGGREGATE_LOOKBACK_DAYS) {
      const last = window[window.length - 1];
      const sharePrice = last && typeof last.c === 'number' ? last.c : null;
      return { avg_daily_dollar_volume: null, share_price: sharePrice };
    }

    const avg = sumDollarVolume / AGGREGATE_LOOKBACK_DAYS;
    const sharePrice = typeof window[window.length - 1].c === 'number'
      ? (window[window.length - 1].c as number)
      : null;
    return { avg_daily_dollar_volume: avg, share_price: sharePrice };
  }
}