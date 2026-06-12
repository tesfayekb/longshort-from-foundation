/**
 * edgar-cik-mapper.ts — FP-050 Phase 1 / DEC-058 §(f).
 *
 * Maps universe tickers → 10-digit zero-padded SEC CIKs by fetching
 * `company_tickers.json` from SEC.gov per fire (§(f1) fetch-per-fire for
 * staleness safety; the 800 KB snapshot is negligible against the daily
 * cadence and removes any "snapshot stale" failure mode).
 *
 * Hard-frozen `INSIDER_CIK_OVERRIDES` resolves known ticker conflicts.
 * Phase-0 evidence seed: `NXT` resolves to Nextpower (CIK 1852131) in the
 * SEC snapshot, but the S&P-500 NXT is Nextracker (CIK 1953967) — without
 * this override the firehose silently mapped to the wrong issuer.
 * Overrides ALWAYS win against the raw snapshot map.
 *
 * Unresolved tickers → `kind:'unresolved'` (typed; counted by the
 * orchestrator as `ticker_to_cik_unresolved` — never silent / never
 * fabricated). This closes the INC-70 silent-ticker-mismatch failure
 * shape at the mapping layer.
 *
 * UA discipline (§(g)): every request carries the
 * `Lovable-Crosswind/<module> (contact: <EDGAR_CONTACT_EMAIL>)` UA built
 * at construction from the operator-set secret. Absent env =
 * `EdgarConfigurationError` at construction (fail-loud, never a fake
 * default).
 *
 * Owner: longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';

/** SEC ticker→CIK snapshot endpoint. */
export const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

/** Operation identifier surfaced on thrown errors. */
export const CIK_MAPPER_OPERATION_ID = 'edgar_cik_mapper';

/**
 * Operator-curated override map. Keyed by uppercase ticker; value is the
 * raw (non-padded) CIK integer. Overrides ALWAYS win against the raw
 * snapshot. Seeded with the NXT conflict surfaced at Phase 0
 * (Nextracker, the S&P-500 NXT). Additions MUST cite Phase-0 evidence.
 */
export const INSIDER_CIK_OVERRIDES: Readonly<Record<string, number>> = Object.freeze({
  // FP-050 Phase 0 finding: SEC company_tickers.json maps NXT → Nextpower
  // (CIK 1852131), but the S&P-500 NXT is Nextracker (CIK 1953967).
  NXT: 1953967,
});

export class EdgarConfigurationError extends Error {
  constructor(message: string) {
    super(`[edgar_config] ${message}`);
    this.name = 'EdgarConfigurationError';
  }
}

export class EdgarFetchError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[${operation}] ${message}`);
    this.name = 'EdgarFetchError';
  }
}

export type CikLookupResult =
  | { kind: 'resolved'; ticker: string; cik10: string; source: 'override' | 'snapshot' }
  | { kind: 'unresolved'; ticker: string };

/** Zero-pad an integer CIK to the 10-character form EDGAR demands. */
export function padCik(cik: number): string {
  if (!Number.isInteger(cik) || cik <= 0) {
    throw new EdgarConfigurationError(`padCik: invalid cik integer ${String(cik)}`);
  }
  return cik.toString().padStart(10, '0');
}

interface CompanyTickersRow {
  cik_str: number | string;
  ticker: string;
  title?: string;
}

/**
 * Build the SEC fair-access User-Agent. The contact email is the secret
 * `EDGAR_CONTACT_EMAIL` (set in Supabase secrets, NOT a credential — an
 * SEC fair-access identifier). Absent env = fail-loud configuration
 * error; the fetcher must NEVER fall back to a fake default UA (would
 * trigger SEC 403s silently).
 */
export function buildEdgarUserAgent(
  contactEmail: string | null | undefined,
  module: string,
): string {
  if (contactEmail === null || contactEmail === undefined || contactEmail.trim().length === 0) {
    throw new EdgarConfigurationError(
      'EDGAR_CONTACT_EMAIL secret missing / empty — required for SEC fair-access (§(g)). No fake default.',
    );
  }
  return `Lovable-Crosswind/${module} (contact: ${contactEmail.trim()})`;
}

export class EdgarCikMapper {
  private readonly userAgent: string;

  constructor(
    contactEmail: string | null | undefined,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    moduleId = 'fp-050-insider/0.1',
  ) {
    // buildEdgarUserAgent throws EdgarConfigurationError if email missing.
    this.userAgent = buildEdgarUserAgent(contactEmail, moduleId);
  }

  /**
   * Fetch the SEC ticker→CIK snapshot, apply overrides, return the lookup
   * function bound over a normalized Map. Fetch-per-fire (§(f1)).
   */
  async loadMap(): Promise<(ticker: string) => CikLookupResult> {
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await this.httpFetch(COMPANY_TICKERS_URL, {
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
      });
    } catch (e) {
      throw new EdgarFetchError(
        CIK_MAPPER_OPERATION_ID,
        `network error fetching ${COMPANY_TICKERS_URL}`,
        e,
      );
    }
    if (!resp.ok) {
      // 403 here = UA rejected; surface as fetch error (operator-actionable).
      throw new EdgarFetchError(
        CIK_MAPPER_OPERATION_ID,
        `HTTP ${resp.status} ${resp.statusText} on ${COMPANY_TICKERS_URL}`,
      );
    }
    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new EdgarFetchError(
        CIK_MAPPER_OPERATION_ID,
        `JSON parse error on company_tickers.json`,
        e,
      );
    }
    if (body === null || typeof body !== 'object') {
      throw new EdgarFetchError(
        CIK_MAPPER_OPERATION_ID,
        'malformed company_tickers.json — expected an object map',
      );
    }

    // SEC ships an object whose values are { cik_str, ticker, title }.
    const snapshot = new Map<string, string>();
    const obj = body as Record<string, unknown>;
    for (const v of Object.values(obj)) {
      if (v === null || typeof v !== 'object') continue;
      const row = v as Partial<CompanyTickersRow>;
      if (typeof row.ticker !== 'string') continue;
      const t = row.ticker.toUpperCase();
      let cikInt: number;
      if (typeof row.cik_str === 'number') cikInt = row.cik_str;
      else if (typeof row.cik_str === 'string') cikInt = parseInt(row.cik_str, 10);
      else continue;
      if (!Number.isInteger(cikInt) || cikInt <= 0) continue;
      snapshot.set(t, padCik(cikInt));
    }

    return (rawTicker: string): CikLookupResult => {
      const ticker = (rawTicker ?? '').toUpperCase().trim();
      if (ticker.length === 0) return { kind: 'unresolved', ticker: rawTicker ?? '' };
      const override = INSIDER_CIK_OVERRIDES[ticker];
      if (override !== undefined) {
        return { kind: 'resolved', ticker, cik10: padCik(override), source: 'override' };
      }
      const cik10 = snapshot.get(ticker);
      if (cik10 !== undefined) {
        return { kind: 'resolved', ticker, cik10, source: 'snapshot' };
      }
      return { kind: 'unresolved', ticker };
    };
  }
}