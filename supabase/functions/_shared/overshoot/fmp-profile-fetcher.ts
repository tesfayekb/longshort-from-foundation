/**
 * FmpProfileFetcher — overshoot-owned sector/industry metadata fetcher.
 *
 * ACT-515(e) Sector Ingest, Turn 2 of 3 (charter §4 recommended path).
 * Feeds `overshoot_universe.gics_sector / sector_source / sector_asof`
 * for the sector-concentration cap engine variant. Column substrate
 * landed in Turn 1 (sql/44_overshoot_universe_sector.sql); the
 * `overshoot-sector-ingest` edge function is the caller.
 *
 * Endpoint:
 *
 *     GET https://financialmodelingprep.com/stable/profile?symbol=<T>
 *
 * Returns a JSON array (usually length 1). The load-bearing fields are
 * `sector` (FMP taxonomy — close to GICS; treated as GICS-equivalent per
 * charter §2) and `industry` (informational).
 *
 * Design discipline (mirrors sibling overshoot fetchers verbatim):
 *   - Constructor-injected apiKey + httpFetch for testability.
 *   - No wall-clock inside the fetcher (as_of is stamped by the caller
 *     from the injected Clock at the edge-function entry point — DEC-034
 *     clause 4; MIG Turn-1 comments enforce the same on the DB side).
 *   - Typed-absence union: `subscription_gated` (403) /
 *     `data_unavailable` (404, empty array, missing/blank `sector`).
 *     A blank sector is NOT written to the substrate — the MIG-Turn-1
 *     provenance CHECK constraint refuses NULL sector with non-NULL
 *     source, and per DEC-038 + INC-71 the substrate never carries a
 *     fabricated GICS label.
 *   - Non-403/404 non-2xx, timeout, or parse errors THROW
 *     `OvershootFetchError` with ticker context (INC-24 discipline).
 *
 * Secret: `FMP_API_KEY` (already configured; shared with the FMP earnings
 * calendar cross-audit fetcher).
 *
 * Owner: overshoot (ACT-515(e) Sector Ingest Turn 2).
 * Classification: shared infrastructure — consumed by
 *   `supabase/functions/overshoot-sector-ingest`.
 */
import type { HttpFetch } from './http-fetch.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from './csv-fetch-primitives.ts';
import { OvershootFetchError } from './polygon-daily-ohlcv-fetcher.ts';

const FMP_BASE_URL = 'https://financialmodelingprep.com';

/** Operation identifier surfaced on `OvershootFetchError.operation`. */
export const FMP_PROFILE_OPERATION_ID = 'fmp_profile';

export type FmpProfileFetchResult =
  | {
      kind: 'profile';
      /** Verbatim FMP `sector` string. Non-empty, trimmed. */
      sector: string;
      /** Verbatim FMP `industry` string, or `null` if absent/blank. */
      industry: string | null;
      /** Verbatim FMP `symbol` echo (upper-cased, trimmed) for cross-check. */
      symbol_echo: string;
    }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface FmpProfileRow {
  symbol?: string;
  sector?: string;
  industry?: string;
  // FMP `/stable/profile` returns many more fields (price, mktCap, beta,
  // ipoDate, ...); we deliberately ignore them here. This fetcher's
  // single purpose is sector/industry metadata for ACT-515(e).
}

/**
 * Field-presence guard. Used by the fetcher AND surfaced for the edge
 * function's `probe` mode so the operator can see, verbatim, which
 * expected fields the FMP payload carried on a live sample.
 *
 * Returns the subset of `required` that is present-and-non-empty in
 * `row`. A field is "present" iff it is a string with length > 0 after
 * trim. Numeric fields (price, mktCap, ...) are out of scope for this
 * fetcher; the sector-ingest lane only reads string metadata.
 */
export function verifyFieldsPresent(
  row: unknown,
  required: readonly string[],
): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];
  if (row === null || typeof row !== 'object') {
    return { present, missing: [...required] };
  }
  const obj = row as Record<string, unknown>;
  for (const f of required) {
    const v = obj[f];
    if (typeof v === 'string' && v.trim().length > 0) {
      present.push(f);
    } else {
      missing.push(f);
    }
  }
  return { present, missing };
}

export class FmpProfileFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FmpProfileFetcher: apiKey is required (FMP_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch the FMP profile row for a single ticker.
   *
   * @param ticker — upper-case symbol; caller normalizes.
   * @returns typed union — `profile` on success, `unavailable` on 403/404
   *          or missing/blank `sector`. Throws `OvershootFetchError` on
   *          any other transport/parse failure.
   */
  async fetchProfile(ticker: string): Promise<FmpProfileFetchResult> {
    const url =
      `${FMP_BASE_URL}/stable/profile` +
      `?symbol=${encodeURIComponent(ticker)}` +
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
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on fmp-profile for ${ticker}`
        : `${(e instanceof Error ? e.message : 'network error')} on fmp-profile for ${ticker}`;
      throw new OvershootFetchError(FMP_PROFILE_OPERATION_ID, ticker, message, e);
    }

    if (resp.status === 403) {
      // Drain body (Deno resource-leak discipline).
      try { await resp.text(); } catch { /* ignore */ }
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      try { await resp.text(); } catch { /* ignore */ }
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new OvershootFetchError(
        FMP_PROFILE_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on fmp-profile for ${ticker}`,
      );
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new OvershootFetchError(
        FMP_PROFILE_OPERATION_ID,
        ticker,
        `JSON parse error on fmp-profile for ${ticker}`,
        e,
      );
    }

    // FMP returns [] for unknown symbols (in addition to 404 in some code
    // paths). Treat as typed-absent, not a throw.
    if (!Array.isArray(body) || body.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const row = body[0] as FmpProfileRow;
    const sectorRaw = typeof row.sector === 'string' ? row.sector.trim() : '';
    if (sectorRaw.length === 0) {
      // Missing / blank sector → typed absence. NEVER fabricate a label.
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    const industryRaw = typeof row.industry === 'string' ? row.industry.trim() : '';
    const symbolEcho = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : ticker;

    return {
      kind: 'profile',
      sector: sectorRaw,
      industry: industryRaw.length > 0 ? industryRaw : null,
      symbol_echo: symbolEcho,
    };
  }
}