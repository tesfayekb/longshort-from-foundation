/**
 * WikipediaConstituentFetcher — SECONDARY cross-check source for FP-008.2 Step C.
 *
 * Replaces iSharesConstituentFetcher in the universe cross-check pipeline.
 * iShares' holdings CSV endpoint server-side bot-blocks Deno's fetch from
 * Supabase Edge Functions (Task 0 probes); Wikipedia's static HTML pages
 * for the S&P 500 and S&P 400 are publicly accessible and survive as a
 * zero-cost automated cross-check signal against the operator-seeded primary.
 *
 * Endpoints:
 *   sp500: https://en.wikipedia.org/wiki/List_of_S%26P_500_companies
 *   sp400: https://en.wikipedia.org/wiki/List_of_S%26P_400_companies
 *
 * Parsing strategy: locate the first wikitable on the page, extract the
 * `Symbol` column from each row. Wikipedia tables are stable across edits;
 * column ordering has been the same for years. The parser is defensive —
 * it locates the symbol column by header text rather than fixed index, and
 * skips rows that lack a parsable symbol.
 *
 * Per ConstituentFetcher contract: throws on network / HTTP / parse failure;
 * returns null only if zero symbols extracted (typed-absence per §2 axiom 3).
 *
 * Owner: longshort (FP-008.2 Step C).
 * Classification: financial-critical (secondary cross-check signal).
 */
import {
  ConstituentFetchError,
  type ConstituentFetcher,
  type HttpFetch,
  type IndexId,
  type UniverseConstituent,
} from '../../longshort-universe-interfaces.ts';
import { fetchWithTimeoutAndRetry } from '../shared/fetch-with-timeout.ts';

const WIKIPEDIA_FETCH_TIMEOUT_MS = 30_000;

const WIKIPEDIA_URL: Readonly<Record<IndexId, string>> = {
  sp500: 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
  sp400: 'https://en.wikipedia.org/wiki/List_of_S%26P_400_companies',
} as const;

/**
 * Extract S&P constituent symbols from a Wikipedia "List of S&P NNN companies"
 * HTML page. Strategy:
 *   1. Find the first `<table class="wikitable ...">` block.
 *   2. Parse its header row to locate the column whose plaintext header is
 *      `Symbol` (sp500) or `Symbol`/`Ticker symbol` (sp400 — older revisions).
 *   3. For each data row, extract the first `<a>...</a>` inside the symbol
 *      cell (Wikipedia wraps tickers in links to the company page). Fall
 *      back to stripped cell text if no link found.
 *
 * Exported for testing.
 */
export function parseWikipediaConstituents(
  html: string,
  index: IndexId,
): string[] {
  // Grab the first wikitable. Wikipedia uses class="wikitable" possibly with
  // additional classes (sortable, jquery-tablesorter, etc.).
  const tableMatch = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    throw new ConstituentFetchError('wikipedia', index, 'no wikitable found in HTML');
  }
  const tableHtml = tableMatch[1];

  // Split rows on </tr>; first row is the header.
  const rowChunks = tableHtml.split(/<\/tr>/i);
  if (rowChunks.length < 2) {
    throw new ConstituentFetchError('wikipedia', index, 'wikitable contained no rows');
  }

  const headerCells = extractCells(rowChunks[0], 'th');
  if (headerCells.length === 0) {
    throw new ConstituentFetchError('wikipedia', index, 'header row contained no <th> cells');
  }

  const symbolCol = headerCells.findIndex((h) => {
    const t = stripHtml(h).trim().toLowerCase();
    return t === 'symbol' || t === 'ticker symbol' || t === 'ticker';
  });
  if (symbolCol < 0) {
    throw new ConstituentFetchError(
      'wikipedia',
      index,
      `Symbol column not found in header: [${headerCells.map((h) => stripHtml(h).trim()).join(', ')}]`,
    );
  }

  const out: string[] = [];
  for (let i = 1; i < rowChunks.length; i += 1) {
    const cells = extractCells(rowChunks[i], 'td');
    if (cells.length <= symbolCol) continue;
    const cell = cells[symbolCol];
    // Prefer the anchor text (Wikipedia wraps tickers in NYSE/Nasdaq links).
    const anchor = cell.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const raw = anchor ? stripHtml(anchor[1]) : stripHtml(cell);
    const ticker = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (ticker.length === 0) continue;
    // Wikipedia uses `.` for class-segregated tickers (e.g. BRK.B); leave as-is.
    // Skip obvious non-ticker noise (footnote markers, etc.).
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) continue;
    out.push(ticker);
  }
  return out;
}

/** Extract <td> or <th> cell innerHTML chunks from a row HTML fragment. */
function extractCells(rowHtml: string, tag: 'td' | 'th'): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export class WikipediaConstituentFetcher implements ConstituentFetcher {
  constructor(private readonly httpFetch: HttpFetch = fetch as HttpFetch) {}

  async fetchConstituents(
    index: IndexId,
    as_of: Date,
  ): Promise<UniverseConstituent[] | null> {
    const url = WIKIPEDIA_URL[index];

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch,
        url,
        {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            // Wikipedia requires a descriptive User-Agent per their robot policy.
            'User-Agent': 'longshort-from-foundation/1.0 (cross-check; contact: operator)',
          },
        },
        { timeoutMs: WIKIPEDIA_FETCH_TIMEOUT_MS },
      );
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      throw new ConstituentFetchError(
        'wikipedia',
        index,
        isTimeout ? `request timeout after ${WIKIPEDIA_FETCH_TIMEOUT_MS}ms` : 'network error',
        e,
      );
    }

    if (!resp.ok) {
      throw new ConstituentFetchError(
        'wikipedia',
        index,
        `HTTP ${resp.status} ${resp.statusText}`,
      );
    }

    let html: string;
    try {
      html = await resp.text();
    } catch (e) {
      throw new ConstituentFetchError('wikipedia', index, 'failed to read response body', e);
    }

    const tickers = parseWikipediaConstituents(html, index);
    if (tickers.length === 0) return null;

    return tickers.map((t) => ({
      index,
      ticker: t,
      name: t,
      source: 'wikipedia',
      fetched_at: as_of,
    }));
  }
}