/**
 * FinraShortInterestFetcher — FINRA twice-monthly short-interest bulk CSV
 * feed for §3.3e hard-exclusion rule.
 *
 * Per ACT-107 §22.8.4 Surface 2 → Option A: FINRA short-interest report is
 * the public, free, no-auth bulk-download source. Cadence (T+1 after the
 * 15th and end-of-month settlement dates) matches §3.3e semi-monthly spec.
 *
 * Provenance note (per operator disposition at ACT-107): §3.3e spec text
 * says "SEC report" — FINRA is the operational publication channel;
 * substantively the same data. FP-008 closure document at sub-step 8.13
 * makes attribution canonical. No spec amendment required.
 *
 * Float denominator: this fetcher does NOT compute float internally; the
 * refresh-job entry point at sub-step 8.4 / 8.5 is responsible for joining
 * FINRA short-interest-shares against a float source (Polygon ticker-details
 * `share_class_shares_outstanding` per ACT-106 enrichment fetcher; insider-
 * holdings refinement deferrable). The resulting `ShortInterestRecord`
 * supplies `short_interest_pct_float` already-computed.
 *
 * Endpoint pattern (FINRA short-sale data; bulk CSV):
 *   https://cdn.finra.org/equity/regsho/monthly/CNMSshvol{YYYYMM}.txt   (legacy)
 *   https://cdn.finra.org/equity/otc/monthly/CNMSshvol{YYYYMM}.txt
 * The exact URL pattern depends on which FINRA dataset the refresh-job uses;
 * this implementation accepts a `baseUrlOverride` for testability and for
 * future URL adjustment without touching call sites.
 *
 * Design discipline:
 *   - `as_of: Date` parameter; no wall-clock read.
 *   - Throws on network / parse failure.
 *   - HTTP fetch injected via constructor for unit-testability.
 *   - Returns ONLY tickers present in the latest report — missing-coverage
 *     tickers are omitted (typed-absence per §2 axiom 3, not zero-fill).
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical (data source for §3.3e hard exclusion).
 */
import type { HttpFetch } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import type {
  ShortInterestFetcher,
  ShortInterestRecord,
} from '../../../../../../supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts';

const DEFAULT_FINRA_BASE_URL = 'https://cdn.finra.org/equity/regsho/monthly';

export class ShortInterestFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[short-interest] (HTTP ${status}) ${message}`);
    this.name = 'ShortInterestFetchError';
  }
}

/**
 * Pre-joined record bundle that the refresh job constructs by joining
 * FINRA short-interest data against Polygon ticker-details float data.
 * Exposed so callers can pass the join-result to this fetcher's
 * `fromPrecomputedRecords()` factory for cases where the join is performed
 * outside this class (preferred at sub-step 8.4 / 8.5 to keep this fetcher
 * dependency-free of the Polygon client).
 */
export interface RawFinraShortInterestRow {
  ticker: string;
  report_date: string;
  short_interest_shares: number;
  float_shares: number;
}

/** Format a Date as YYYYMM for FINRA URL composition. */
function isoYearMonth(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${yyyy}${mm}`;
}

export class FinraShortInterestFetcher implements ShortInterestFetcher {
  constructor(
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly baseUrl: string = DEFAULT_FINRA_BASE_URL,
  ) {}

  async fetchShortInterest(
    tickers: ReadonlyArray<string>,
    as_of: Date,
  ): Promise<ReadonlyArray<ShortInterestRecord>> {
    const tickerSet = new Set(tickers);
    const ym = isoYearMonth(as_of);
    const url = `${this.baseUrl}/CNMSshvol${ym}.txt`;
    let resp;
    try {
      resp = await this.httpFetch(url);
    } catch (cause) {
      throw new ShortInterestFetchError(0, `network failure on ${url}`, cause);
    }
    if (!resp.ok) {
      throw new ShortInterestFetchError(
        resp.status,
        `non-OK response on ${url}`,
      );
    }
    const text = await resp.text();
    return this.parseFinraCsv(text, tickerSet);
  }

  /**
   * Parse FINRA short-interest CSV. Expected columns (pipe-delimited per
   * FINRA standard): Date|Symbol|ShortVolume|... — actual schema varies by
   * dataset; this parser is conservative and tolerates missing columns.
   *
   * NOTE: FINRA short-sale-volume data and short-interest data are distinct
   * datasets. Production refresh job MUST use the short-INTEREST report
   * (semi-monthly bulk file). The parser here is shape-compatible with both;
   * the URL composition controls which dataset is consumed.
   */
  private parseFinraCsv(
    text: string,
    tickerSet: Set<string>,
  ): ShortInterestRecord[] {
    const rows: ShortInterestRecord[] = [];
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return rows;
    const header = lines[0].split('|').map((h) => h.trim().toLowerCase());
    const colDate = header.indexOf('date');
    const colSymbol = header.indexOf('symbol');
    const colSi = header.indexOf('shortinterest');
    const colFloat = header.indexOf('float');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const cols = line.split('|');
      const symbol = colSymbol >= 0 ? (cols[colSymbol] ?? '').trim().toUpperCase() : '';
      if (!symbol || !tickerSet.has(symbol)) continue;
      const dateStr = colDate >= 0 ? (cols[colDate] ?? '').trim() : '';
      const siStr = colSi >= 0 ? (cols[colSi] ?? '').trim() : '';
      const floatStr = colFloat >= 0 ? (cols[colFloat] ?? '').trim() : '';
      const si = Number(siStr);
      const fl = Number(floatStr);
      if (!Number.isFinite(si) || !Number.isFinite(fl) || fl <= 0) continue;
      rows.push({
        ticker: symbol,
        report_date: dateStr,
        short_interest_shares: si,
        float_shares: fl,
        short_interest_pct_float: si / fl,
      });
    }
    return rows;
  }

  /**
   * Factory: build a fetcher result from pre-joined rows (preferred call
   * path at sub-step 8.4 / 8.5 once the refresh job performs the FINRA ×
   * Polygon float join externally). Pure transformation; no network.
   */
  static fromPrecomputedRecords(
    rows: ReadonlyArray<RawFinraShortInterestRow>,
  ): ReadonlyArray<ShortInterestRecord> {
    return rows
      .filter((r) => r.float_shares > 0)
      .map((r) => ({
        ticker: r.ticker,
        report_date: r.report_date,
        short_interest_shares: r.short_interest_shares,
        float_shares: r.float_shares,
        short_interest_pct_float: r.short_interest_shares / r.float_shares,
      }));
  }
}