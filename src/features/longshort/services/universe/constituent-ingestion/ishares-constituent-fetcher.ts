/**
 * iSharesConstituentFetcher — SECONDARY cross-check source for FP-008 Phase 1
 * universe construction per AC-05 (iShares ETF holdings selected via Lovable
 * Finding 3 / Option B evaluation at sub-step 8.1).
 *
 * Owner: longshort (FP-008 sub-step 8.1)
 * Classification: financial-critical (cross-check signal; disagreement with
 * primary source per DEC-038 clause (2) blocks the ingest transaction).
 *
 * iShares publishes daily holdings CSVs for each US-listed fund at well-known
 * URLs. We use:
 *   - IVV — iShares Core S&P 500 ETF — tracks S&P 500
 *   - IJH — iShares Core S&P Mid-Cap ETF — tracks S&P 400
 *
 * Canonical holdings-CSV endpoints (publicly accessible; no auth):
 *   IVV: https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund
 *   IJH: https://www.ishares.com/us/products/239763/ishares-core-sp-midcap-etf/1467271812596.ajax?fileType=csv&fileName=IJH_holdings&dataType=fund
 *
 * The CSV has a multi-line preamble (fund metadata; ~10 lines) followed by a
 * single header row and then one row per holding. Columns of interest:
 *   "Ticker"  — security ticker (may be empty for cash / FX rows; skipped)
 *   "Name"    — issuer name
 *   "Asset Class" — used to exclude non-equity rows ("Equity" only)
 *
 * Note: iShares occasionally adjusts column ordering / casing; the parser
 * locates columns by header name (case-insensitive) rather than fixed index.
 *
 * Design discipline:
 *   - `as_of: Date` parameter per DEC-034 clause (4) + DEC-035 clause (2) —
 *     no wall-clock read in this file.
 *   - Throws `ConstituentFetchError` on network / HTTP / parse failure per
 *     DEC-034 clauses (2)+(3) — no silent sentinels.
 *   - Returns `null` only if the parsed CSV legitimately contains zero equity
 *     holdings (typed-absence per §2 axiom 3); in practice always returns a
 *     populated list for IVV / IJH.
 */
import {
  ConstituentFetchError,
  ISHARES_ETF_FOR_INDEX,
  type ConstituentFetcher,
  type HttpFetch,
  type IndexId,
  type UniverseConstituent,
} from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';

const ISHARES_HOLDINGS_URL: Readonly<Record<IndexId, string>> = {
  sp500:
    'https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf/1467271812596.ajax?fileType=csv&fileName=IVV_holdings&dataType=fund',
  sp400:
    'https://www.ishares.com/us/products/239763/ishares-core-sp-midcap-etf/1467271812596.ajax?fileType=csv&fileName=IJH_holdings&dataType=fund',
} as const;

/**
 * Parse a single CSV line, honoring double-quote escapes per RFC 4180.
 * Returns an array of field values with surrounding quotes stripped.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/**
 * Locate the header row in an iShares holdings CSV. The first ~10 lines are
 * fund-level metadata (Fund Holdings as of, Inception Date, etc.). The
 * header row is the first line that contains a column literally named
 * `Ticker` (case-insensitive, possibly quoted).
 *
 * Returns the zero-based line index of the header row, or `null` if not found.
 *
 * Per DEC-034 clause (2) typed-absence discipline: explicit `null` for the
 * not-found case (instead of an in-band `-1` sentinel) — caller pattern-matches
 * on `null` rather than range-checking. Refactored in CI-FIX-01 / ACT-121 to
 * satisfy Gate 5 (sentinel-patterns ban).
 */
export function findHeaderRowIndex(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]).map((f) => f.toLowerCase());
    if (fields.includes('ticker')) return i;
  }
  return null;
}

/** Parse iShares CSV body into raw rows. Exported for testing. */
export function parseISharesCsv(
  csv: string,
  index: IndexId,
  as_of: Date,
): UniverseConstituent[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const headerIdx = findHeaderRowIndex(lines);
  if (headerIdx === null) {
    throw new ConstituentFetchError(
      'ishares',
      index,
      'header row containing "Ticker" not found in CSV',
    );
  }

  const header = parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const tickerCol = header.indexOf('ticker');
  const nameCol = header.indexOf('name');
  const assetClassCol = header.indexOf('asset class');
  if (tickerCol < 0) {
    throw new ConstituentFetchError('ishares', index, 'Ticker column missing from header');
  }

  const out: UniverseConstituent[] = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    if (row.length <= tickerCol) continue;
    const rawTicker = row[tickerCol] ?? '';
    const ticker = rawTicker.trim().toUpperCase();
    if (ticker.length === 0 || ticker === '-') continue;

    // Skip non-equity rows when the column is present (cash, futures, FX).
    if (assetClassCol >= 0 && row.length > assetClassCol) {
      const assetClass = (row[assetClassCol] ?? '').toLowerCase();
      if (assetClass.length > 0 && assetClass !== 'equity') continue;
    }

    const name = nameCol >= 0 && row.length > nameCol ? row[nameCol] : '';
    out.push({
      index,
      ticker,
      name,
      source: 'ishares',
      fetched_at: as_of,
    });
  }
  return out;
}

export class iSharesConstituentFetcher implements ConstituentFetcher {
  constructor(private readonly httpFetch: HttpFetch = fetch as HttpFetch) {
    // No API key — iShares holdings CSVs are public.
    // Reference the symbol-table mapping at construction time as a sanity check.
    void ISHARES_ETF_FOR_INDEX;
  }

  async fetchConstituents(
    index: IndexId,
    as_of: Date,
  ): Promise<UniverseConstituent[] | null> {
    const url = ISHARES_HOLDINGS_URL[index];

    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await this.httpFetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/csv, */*;q=0.1' },
      });
    } catch (e) {
      throw new ConstituentFetchError('ishares', index, 'network error', e);
    }

    if (!resp.ok) {
      throw new ConstituentFetchError(
        'ishares',
        index,
        `HTTP ${resp.status} ${resp.statusText}`,
      );
    }

    let csv: string;
    try {
      csv = await resp.text();
    } catch (e) {
      throw new ConstituentFetchError('ishares', index, 'failed to read response body', e);
    }

    const rows = parseISharesCsv(csv, index, as_of);
    if (rows.length === 0) return null;
    return rows;
  }
}
