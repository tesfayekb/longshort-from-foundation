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
import {
  defaultEdgarFetchTelemetry,
  type EdgarFetchTelemetry,
} from './edgar-fetch-telemetry.ts';
import {
  fetchWithTimeoutAndRetry,
  type FetchWithRetryOptions,
  type MinimalHttpFetch,
} from '../../../longshort-universe/shared/fetch-with-timeout.ts';

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
  private readonly telemetry: EdgarFetchTelemetry;
  private readonly correlationId: string;
  private readonly retryOptions: FetchWithRetryOptions;

  constructor(
    contactEmail: string | null | undefined,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    moduleId = 'fp-050-insider/0.1',
    telemetry: EdgarFetchTelemetry = defaultEdgarFetchTelemetry,
    correlationId = '',
    retryOptions: FetchWithRetryOptions = {},
  ) {
    // buildEdgarUserAgent throws EdgarConfigurationError if email missing.
    this.userAgent = buildEdgarUserAgent(contactEmail, moduleId);
    this.telemetry = telemetry;
    this.correlationId = correlationId;
    this.retryOptions = retryOptions;
  }

  /** INC-73-family telemetry emit (ACT-199 F1.a) — never throws. */
  private emit(status: number): void {
    try {
      this.telemetry({
        op: CIK_MAPPER_OPERATION_ID,
        path_family: 'company_tickers',
        status,
        url: COMPANY_TICKERS_URL,
        correlation_id: this.correlationId,
        duration_ms: -1,
      });
    } catch {
      // Telemetry MUST NOT throw — swallow.
    }
  }

  /**
   * Fetch the SEC ticker→CIK snapshot, apply overrides, return the lookup
   * function bound over a normalized Map.
   *
   * ACT-219 hardening (surfaced by run `e5907bfb-...`, 1× HTTP 429 against
   * `company_tickers.json` mid-drain):
   *   (a) Polite-throttle + exponential backoff via
   *       `fetchWithTimeoutAndRetry` — the canonical retry helper used by
   *       `polygon-news-feed-fetcher.ts`, `polygon-dividends-fetcher.ts`,
   *       and `tradier-corporate-actions-fetcher.ts`. Adopting that
   *       fetcher's pattern verbatim (no reinvention) — defaults are
   *       3 attempts / [1s, 2s, 4s] backoff / 15s timeout. Retries fire
   *       on 429 / 5xx / AbortError / TypeError.
   *   (b) In-isolate memoization of the parsed snapshot keyed by the
   *       `httpFetch` reference — once `company_tickers.json` lands in a
   *       slice-worker isolate, the next 1000+ slices in that isolate
   *       reuse the same parsed map. Per-cold-start scope (no TTL — the
   *       Date.now/performance.now wall-clock surface is DEC-034 §(4)
   *       banned in this tree; cold-start churn is the natural refresh
   *       boundary, and daily isolate cycling keeps the snapshot
   *       fresh enough for §(f1) staleness purposes). Tests reset via
   *       `resetCikMapperMemo()`.
   *
   * The fetch-per-fire promise (§(f1)) is preserved for the FIRST call
   * in each isolate; subsequent calls in the same isolate hit the memo.
   */
  async loadMap(): Promise<(ticker: string) => CikLookupResult> {
    const memo = snapshotMemo;
    if (memo !== null && memo.httpFetch === this.httpFetch) {
      const snapshot = await memo.promise;
      return this.buildLookup(snapshot);
    }
    const promise = this.fetchAndParseSnapshot();
    snapshotMemo = { promise, httpFetch: this.httpFetch };
    let snapshot: Map<string, string>;
    try {
      snapshot = await promise;
    } catch (e) {
      // Don't poison the memo with a failed fetch — the next call
      // should be free to retry from scratch.
      if (snapshotMemo !== null && snapshotMemo.promise === promise) {
        snapshotMemo = null;
      }
      throw e;
    }
    return this.buildLookup(snapshot);
  }

  private async fetchAndParseSnapshot(): Promise<Map<string, string>> {
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await fetchWithTimeoutAndRetry(
        this.httpFetch as unknown as MinimalHttpFetch,
        COMPANY_TICKERS_URL,
        {
          method: 'GET',
          headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
        },
        this.retryOptions,
      );
    } catch (e) {
      this.emit(0);
      // `fetchWithTimeoutAndRetry` re-throws `HTTP 429 ...` as Error
      // after exhausting attempts — surface verbatim under our fetch-
      // error taxonomy.
      if (e instanceof Error && /^HTTP\s+\d+/.test(e.message)) {
        throw new EdgarFetchError(
          CIK_MAPPER_OPERATION_ID,
          `${e.message} on ${COMPANY_TICKERS_URL} (after retry exhaustion)`,
          e,
        );
      }
      throw new EdgarFetchError(
        CIK_MAPPER_OPERATION_ID,
        `network error fetching ${COMPANY_TICKERS_URL}`,
        e,
      );
    }
    this.emit(resp.status);
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
    return snapshot;
  }

  private buildLookup(snapshot: Map<string, string>): (ticker: string) => CikLookupResult {
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

/**
 * Module-level memo for the parsed ticker→CIK snapshot. Keyed by the
 * `httpFetch` reference so production callers (sharing the default
 * `fetch`) collapse to a single underlying request per isolate, while
 * tests injecting bespoke fetchers each get their own slot.
 */
interface SnapshotMemoEntry {
  readonly promise: Promise<Map<string, string>>;
  readonly httpFetch: HttpFetch;
}
let snapshotMemo: SnapshotMemoEntry | null = null;

/** Test helper — clear the in-isolate snapshot memo. Production code
 *  never calls this; the natural refresh boundary is cold-start. */
export function resetCikMapperMemo(): void {
  snapshotMemo = null;
}