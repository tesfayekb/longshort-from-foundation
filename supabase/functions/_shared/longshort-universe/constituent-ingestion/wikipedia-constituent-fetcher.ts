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
 * Per-index plausible ticker-count bounds — structural sanity guards for the
 * Wikipedia HTML parser (FP-008.4 #13 defense-in-depth).
 *
 * Intentionally wider than the cross-check's jaccard tolerance: these catch
 * layout-break / partial-fetch (returned count radically off vs. index size),
 * NOT composition drift between primary and secondary (that is the cross-
 * check's job, with its jaccard + safety-floor/ceiling thresholds).
 *
 * Margins:
 *   sp500 nominal ~503 (dual-class tickers: GOOG/GOOGL, FOX/FOXA, etc.) →
 *     [490, 520] = ±~3% envelope.
 *   sp400 nominal ~400 (negligible dual-class noise) → [385, 415] = ±~4%.
 *
 * Using `Record<IndexId, …>` makes adding a new IndexId without bounds a
 * compile-time error — a future sp600 (or similar) MUST extend this table.
 */
const SANITY_BOUNDS: Readonly<Record<IndexId, { min: number; max: number }>> = {
  sp500: { min: 490, max: 520 },
  sp400: { min: 385, max: 415 },
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
 * After the per-row loop, asserts the final ticker count falls within
 * SANITY_BOUNDS[index]; throws ConstituentFetchError with a skip-breakdown
 * forensic message otherwise. Fail-fast-at-parse is the point — a short list
 * silently feeding the cross-check is worse than a thrown fetch error (which
 * the orchestrator catches and finalizes as a failed refresh, naming the
 * actual cause: "layout likely changed").
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
  // Skip-reason counters — fold into the bounds-throw message for forensics.
  // Without these, a "40 of 500" mystery has no on-error breadcrumb to the
  // silent per-row continue path that actually drained the list.
  let raggedRows = 0;
  let emptyTickers = 0;
  let regexRejected = 0;
  for (let i = 1; i < rowChunks.length; i += 1) {
    const cells = extractCells(rowChunks[i], 'td');
    if (cells.length <= symbolCol) {
      raggedRows += 1;
      continue;
    }
    const cell = cells[symbolCol];
    // Prefer the anchor text (Wikipedia wraps tickers in NYSE/Nasdaq links).
    const anchor = cell.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const raw = anchor ? stripHtml(anchor[1]) : stripHtml(cell);
    const ticker = raw.trim().toUpperCase().replace(/\s+/g, '');
    if (ticker.length === 0) {
      emptyTickers += 1;
      continue;
    }
    // Wikipedia uses `.` for class-segregated tickers (e.g. BRK.B); leave as-is.
    // Skip obvious non-ticker noise (footnote markers, etc.).
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
      regexRejected += 1;
      continue;
    }
    out.push(ticker);
  }

  // Sanity-bounds assertion — defense-in-depth on top of the downstream
  // cross-check's sym-diff ceiling. Earlier, more diagnosable failure than
  // a downstream "system_bug" with a 460-ticker symmetric-difference jsonb.
  const bounds = SANITY_BOUNDS[index];
  if (out.length < bounds.min || out.length > bounds.max) {
    const totalSkipped = raggedRows + emptyTickers + regexRejected;
    throw new ConstituentFetchError(
      'wikipedia',
      index,
      `wikipedia parse for ${index} returned ${out.length} tickers, ` +
        `expected ${bounds.min}-${bounds.max} ` +
        `(skipped ${totalSkipped}: ${raggedRows} ragged, ${emptyTickers} empty, ${regexRejected} regex-rejected); ` +
        `table layout likely changed`,
    );
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
      // fetchWithTimeoutAndRetry throws a plain Error('HTTP <status> <statusText>')
      // after exhausting retries on 429/5xx. Without this branch the post-retry
      // HTTP context is silently collapsed into the generic "network error" label,
      // losing the status code downstream health-monitoring and test assertions
      // depend on. See INC-24 (ishares canonical fix) for the sibling replication
      // rationale.
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP \d{3}/.test(e.message);
      const message = isTimeout
        ? `request timeout after ${WIKIPEDIA_FETCH_TIMEOUT_MS}ms`
        : isHttpAfterRetries
        ? e.message
        : 'network error';
      throw new ConstituentFetchError('wikipedia', index, message, e);
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