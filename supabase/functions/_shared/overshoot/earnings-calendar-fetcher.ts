/**
 * EarningsCalendarFetcher — overshoot-owned dual-source earnings calendar
 * fetcher (FP-069 W1a).
 *
 * Sources (per reconciled dual-investigation):
 *   - PRIMARY: Finnhub `/api/v1/calendar/earnings?symbol=&from=&to=` — per-ticker,
 *     ≤60/min pacing, RETURNS the load-bearing `hour: 'bmo' | 'amc' | ''` flag.
 *     Empty string → NULL in DB (typed absence; NEVER coerced to a session).
 *   - CROSS-AUDIT: FMP `/stable/earnings-calendar?from=&to=` — bulk range,
 *     no session flag, used only for date-agreement checks.
 *
 * Design discipline:
 *   - as_of / from / to are ISO YYYY-MM-DD strings supplied by caller (injected
 *     clock upstream); no `new Date()` inside this module.
 *   - Constructor-injected apiKey + httpFetch for testability.
 *   - Errors throw OvershootFetchError with source+ticker(+scope) context.
 *   - Deduplication is caller-side (DB PK); this fetcher returns raw rows.
 */
import type { HttpFetch } from './http-fetch.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../longshort-universe/shared/fetch-with-timeout.ts';
import { OvershootFetchError } from './polygon-daily-ohlcv-fetcher.ts';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FMP_BASE_URL = 'https://financialmodelingprep.com';

export interface EarningsRow {
  ticker: string;
  /** ISO YYYY-MM-DD announcement date. */
  announcement_date: string;
  source: 'finnhub' | 'fmp';
  /** 'bmo' | 'amc' | null — Finnhub only; FMP always null. */
  hour: 'bmo' | 'amc' | null;
  quarter: number | null;
  fiscal_year: number | null;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
}

// ---------- Finnhub ----------

interface FinnhubEarningsRow {
  date?: string;
  symbol?: string;
  hour?: string;        // 'bmo' | 'amc' | ''
  quarter?: number;
  year?: number;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
}
interface FinnhubEarningsResponse {
  earningsCalendar?: FinnhubEarningsRow[];
}

function normalizeFinnhubHour(raw: string | undefined): 'bmo' | 'amc' | null {
  if (raw === 'bmo' || raw === 'amc') return raw;
  // Empty string, 'dmh' (during market hours), unknown → typed NULL.
  return null;
}

export class FinnhubEarningsFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('FinnhubEarningsFetcher: apiKey required (FINNHUB_API_KEY unset).');
    }
  }

  async fetchForTicker(
    ticker: string,
    fromIso: string,
    toIso: string,
  ): Promise<EarningsRow[]> {
    const url =
      `${FINNHUB_BASE_URL}/calendar/earnings` +
      `?symbol=${encodeURIComponent(ticker)}` +
      `&from=${fromIso}&to=${toIso}` +
      `&token=${encodeURIComponent(this.apiKey)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        { method: 'GET' },
        { timeoutMs: this.timeoutMs },
      );
    } catch (e) {
      throw new OvershootFetchError('finnhub_earnings', ticker,
        (e instanceof Error ? e.message : 'network error') + ` on ${ticker}`, e);
    }

    if (!resp.ok) {
      throw new OvershootFetchError('finnhub_earnings', ticker,
        `HTTP ${resp.status} ${resp.statusText}`);
    }

    let body: FinnhubEarningsResponse;
    try {
      body = (await resp.json()) as FinnhubEarningsResponse;
    } catch (e) {
      throw new OvershootFetchError('finnhub_earnings', ticker,
        'JSON parse error', e);
    }

    const rows = body.earningsCalendar ?? [];
    const out: EarningsRow[] = [];
    for (const r of rows) {
      if (typeof r.date !== 'string' || typeof r.symbol !== 'string') continue;
      out.push({
        ticker: r.symbol.toUpperCase(),
        announcement_date: r.date,
        source: 'finnhub',
        hour: normalizeFinnhubHour(r.hour),
        quarter: typeof r.quarter === 'number' ? r.quarter : null,
        fiscal_year: typeof r.year === 'number' ? r.year : null,
        eps_estimate: typeof r.epsEstimate === 'number' ? r.epsEstimate : null,
        eps_actual: typeof r.epsActual === 'number' ? r.epsActual : null,
        revenue_estimate: typeof r.revenueEstimate === 'number' ? r.revenueEstimate : null,
        revenue_actual: typeof r.revenueActual === 'number' ? r.revenueActual : null,
      });
    }
    return out;
  }
}

// ---------- FMP (bulk range, cross-audit only) ----------

interface FmpEarningsRow {
  date?: string;
  symbol?: string;
  // FMP /stable/earnings-calendar (verified 2026-07-04 live probe) returns
  // `epsActual`/`revenueActual` — the earlier `eps`/`revenue` field names
  // used by this reader silently null-ed all 355,184 historical actuals
  // (source='fmp', 2021-07-06..2026-07-03). Detector selection is
  // date-only, so no gating/refusal drift; forensic completeness only.
  // Estimates use `epsEstimated`/`revenueEstimated` (unchanged).
  epsActual?: number | null;
  epsEstimated?: number | null;
  revenueActual?: number | null;
  revenueEstimated?: number | null;
}

export class FmpEarningsCalendarFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('FmpEarningsCalendarFetcher: apiKey required (FMP_API_KEY unset).');
    }
  }

  /**
   * Fetch bulk earnings calendar for [fromIso, toIso] range. Chunk by ≤3-month
   * windows caller-side if the range is longer (FMP caps the response window).
   */
  async fetchRange(fromIso: string, toIso: string): Promise<EarningsRow[]> {
    const url =
      `${FMP_BASE_URL}/stable/earnings-calendar` +
      `?from=${fromIso}&to=${toIso}` +
      `&apikey=${encodeURIComponent(this.apiKey)}`;

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        { method: 'GET' },
        { timeoutMs: this.timeoutMs },
      );
    } catch (e) {
      throw new OvershootFetchError('fmp_earnings', `[${fromIso}..${toIso}]`,
        (e instanceof Error ? e.message : 'network error'), e);
    }

    if (!resp.ok) {
      throw new OvershootFetchError('fmp_earnings', `[${fromIso}..${toIso}]`,
        `HTTP ${resp.status} ${resp.statusText}`);
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new OvershootFetchError('fmp_earnings', `[${fromIso}..${toIso}]`,
        'JSON parse error', e);
    }

    const rows = Array.isArray(body) ? (body as FmpEarningsRow[]) : [];
    const out: EarningsRow[] = [];
    for (const r of rows) {
      if (typeof r.date !== 'string' || typeof r.symbol !== 'string') continue;
      out.push({
        ticker: r.symbol.toUpperCase(),
        announcement_date: r.date,
        source: 'fmp',
        hour: null, // FMP does not carry session flag
        quarter: null,
        fiscal_year: null,
        eps_estimate: typeof r.epsEstimated === 'number' ? r.epsEstimated : null,
        eps_actual: typeof r.epsActual === 'number' ? r.epsActual : null,
        revenue_estimate: typeof r.revenueEstimated === 'number' ? r.revenueEstimated : null,
        revenue_actual: typeof r.revenueActual === 'number' ? r.revenueActual : null,
      });
    }
    return out;
  }
}