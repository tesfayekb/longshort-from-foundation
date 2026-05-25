/**
 * PolygonConstituentFetcher — PRIMARY source for FP-008 Phase 1 universe
 * construction per AC-04 (Polygon reference data API).
 *
 * Owner: longshort (FP-008 sub-step 8.1)
 * Classification: financial-critical (upstream of every strategy decision)
 *
 * Polygon's reference-data API exposes index constituents via:
 *   GET https://api.polygon.io/v3/reference/tickers
 *     ?market=stocks
 *     &active=true
 *     &index=<INDEX_ID>     // I:SPX for S&P 500; I:MID for S&P 400
 *     &limit=1000
 *     &apiKey=<POLYGON_API_KEY>
 *
 * The endpoint paginates via `next_url`; we follow until exhausted. The full
 * S&P 500 + S&P 400 universe (~900 names) fits in 2 pages per index.
 *
 * Secret: POLYGON_API_KEY must be configured (Supabase Edge Functions secrets)
 * before the quarterly-refresh job at sub-step 8.4 invokes this fetcher in
 * production. Until then this module is dead code (DEC-038 clause (5):
 * `universe.enabled=false` feature flag gates all live invocation).
 *
 * Design discipline:
 *   - `as_of: Date` parameter per DEC-034 clause (4) + DEC-035 clause (2)
 *     injected-clock contract — no wall-clock read in this file.
 *   - `Promise<UniverseConstituent[] | null>` return per §2 axiom 3 typed-
 *     absence idiom; throws `ConstituentFetchError` on network / auth / parse
 *     failure (per DEC-034 clauses (2)+(3); no silent sentinels).
 *   - HTTP fetch injected as constructor dep — unit-testable without network.
 */
import type {
  ConstituentFetcher,
  HttpFetch,
  IndexId,
  UniverseConstituent,
} from '../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import { ConstituentFetchError } from '../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';

/** Polygon ticker-set codes per their public reference-data taxonomy. */
const POLYGON_INDEX_CODE: Readonly<Record<IndexId, string>> = {
  sp500: 'I:SPX',
  sp400: 'I:MID',
} as const;

const POLYGON_BASE_URL = 'https://api.polygon.io';
const PAGE_LIMIT = 1000;
/** Hard cap on pagination follows to avoid runaway in case of API bug. */
const MAX_PAGES = 10;

interface PolygonTickerRow {
  ticker?: string;
  name?: string;
  active?: boolean;
}

interface PolygonTickersResponse {
  results?: PolygonTickerRow[];
  next_url?: string;
  status?: string;
}

export class PolygonConstituentFetcher implements ConstituentFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonConstituentFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  async fetchConstituents(
    index: IndexId,
    as_of: Date,
  ): Promise<UniverseConstituent[] | null> {
    const code = POLYGON_INDEX_CODE[index];
    const initialUrl =
      `${POLYGON_BASE_URL}/v3/reference/tickers` +
      `?market=stocks&active=true&index=${encodeURIComponent(code)}&limit=${PAGE_LIMIT}`;

    const collected: UniverseConstituent[] = [];
    let url: string | null = initialUrl;
    let page = 0;

    while (url !== null) {
      if (page >= MAX_PAGES) {
        throw new ConstituentFetchError(
          'polygon',
          index,
          `pagination cap exceeded (${MAX_PAGES} pages); refusing to follow further`,
        );
      }
      page += 1;

      // Polygon accepts apiKey via query param OR Authorization header.
      // Header form keeps the key out of any URL logs.
      const sep = url.includes('?') ? '&' : '?';
      const requestUrl = url.includes('apiKey=') ? url : `${url}${sep}apiKey=${encodeURIComponent(this.apiKey)}`;

      let resp: Awaited<ReturnType<HttpFetch>>;
      try {
        resp = await this.httpFetch(requestUrl, { method: 'GET' });
      } catch (e) {
        throw new ConstituentFetchError('polygon', index, `network error on page ${page}`, e);
      }

      if (!resp.ok) {
        throw new ConstituentFetchError(
          'polygon',
          index,
          `HTTP ${resp.status} ${resp.statusText} on page ${page}`,
        );
      }

      let body: PolygonTickersResponse;
      try {
        body = (await resp.json()) as PolygonTickersResponse;
      } catch (e) {
        throw new ConstituentFetchError('polygon', index, `JSON parse error on page ${page}`, e);
      }

      const rows = body.results ?? [];
      for (const row of rows) {
        if (!row.ticker || typeof row.ticker !== 'string') continue;
        if (row.active === false) continue;
        collected.push({
          index,
          ticker: row.ticker.trim().toUpperCase(),
          name: typeof row.name === 'string' ? row.name : '',
          source: 'polygon',
          fetched_at: as_of,
        });
      }

      url = typeof body.next_url === 'string' && body.next_url.length > 0 ? body.next_url : null;
    }

    if (collected.length === 0) {
      // Polygon explicitly returned zero constituents — typed-absence per §2 axiom 3.
      return null;
    }
    return collected;
  }
}
