/**
 * PolygonForm4Fetcher — Form 4 (insider transaction) report fetch for the
 * Phase 2.4 signal (FP-042 / Signal #4).
 *
 * Sibling to `polygon-short-interest-fetcher.ts` (FP-041) and follows the
 * exact same entitlement-aware contract:
 *   - HTTP 403 → `{ kind: 'unavailable', reason: 'subscription_gated' }`
 *   - HTTP 404 → `{ kind: 'unavailable', reason: 'data_unavailable' }`
 *   - All other failures (401 / 5xx after retries / parse / timeout) throw
 *     `SignalComputationError` carrying ticker context.
 *
 * Endpoint (live-probe-verified 2026-06-08, RBRK/NTRA/DELL sample on
 * Stocks Advanced):
 *
 *   GET /stocks/filings/vX/form-4
 *     ?ticker=<T>
 *     &transaction_date.gte=<YYYY-MM-DD>
 *     &transaction_date.lte=<YYYY-MM-DD>
 *     &limit=<N>
 *
 * The response contains BOTH `record_type='transaction'` rows (actual
 * trades) AND `record_type='holding'` rows (holding-only disclosures with
 * no transaction_code/transaction_date). The compute layer filters to
 * transactions; this fetcher returns the raw rows untouched (other than
 * dropping rows missing fields the compute layer would crash on) so the
 * filtering discipline lives in a single, testable place.
 *
 * Wall-clock discipline (DEC-034 clause 4): `as_of: Date` is the sole time
 * input. No `Date.now()` / `new Date()` outside arithmetic on the injected
 * `as_of`.
 *
 * Secret: POLYGON_API_KEY (shared with price / enrichment / short-interest /
 * shares-outstanding fetchers).
 *
 * Owner: longshort (FP-042 — Signal #4 / Phase 2.4)
 * Classification: shared infrastructure — consumed by insider-orchestrator.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Operation identifier surfaced in `SignalComputationError.signal_id` when
 * this fetcher throws.
 */
export const FORM4_OPERATION_ID = 'polygon_form4';

/** §4.4.4 trailing-window length in calendar days. */
export const FORM4_WINDOW_DAYS = 90;

/** Per-call row cap. Most names have <50 insider rows in a 90-day window;
 *  500 is well above the realistic upper bound (heavy insider activity at
 *  large issuers around earnings windows) and Polygon's per-page max. If a
 *  ticker ever exceeds this, the fetcher returns the most recent 500 by
 *  the endpoint's default ordering, which is acceptable for v1. */
export const DEFAULT_FORM4_LIMIT = 500;

/**
 * A single normalized Form 4 row. Carries every field the compute layer
 * needs to filter, classify the role, and contribute to the weighted sum.
 * Raw boolean fields preserved verbatim — the deterministic classifier
 * (`compute-insider.ts`) is the single authority that turns the booleans
 * + `officer_title` into a role weight.
 */
export interface Form4Row {
  /** 'transaction' or 'holding'. Compute layer drops 'holding'. */
  record_type: 'transaction' | 'holding' | string;
  /** SEC transaction code (P/S/M/C/A/G/...). Undefined for holding rows. */
  transaction_code?: string;
  /** True if the transaction was made under a 10b5-1 plan. Per §4.4.4
   *  this is the load-bearing flag for excluding planned sales. */
  aff_10b5_one?: boolean;
  /** Acquired ('A') = +1 sign (purchase); Disposed ('D') = −1 sign (sale). */
  transaction_acquired_disposed?: 'A' | 'D' | string;
  transaction_shares?: number;
  transaction_price_per_share?: number;
  /** ISO YYYY-MM-DD. Used for decay (age_days = as_of − transaction_date). */
  transaction_date?: string;
  /** Role booleans. Multiple may be true for the same insider. */
  is_director?: boolean;
  is_officer?: boolean;
  is_ten_percent_owner?: boolean;
  not_subject_to_section_16?: boolean;
  /** Free-text — the title-heuristic classifier parses this. */
  officer_title?: string;
  /** Derivative vs non-derivative security; not currently used by the
   *  compute layer (M/C codes are already excluded by transaction_code),
   *  but preserved for diagnostics. */
  security_type?: string;
}

export type Form4FetchResult =
  | { kind: 'rows'; rows: Form4Row[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface PolygonForm4Response {
  results?: unknown[];
  status?: string;
  next_url?: string;
}

function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Coerce an arbitrary Polygon row into a `Form4Row` shape. Drops rows that
 * are not objects. Preserves missing fields as `undefined` (compute layer
 * is the filter authority — fetcher does NOT pre-filter on
 * `record_type`/`transaction_code` so a single test surface owns those
 * rules).
 */
function normalizeRow(raw: unknown): Form4Row | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: Form4Row = {
    record_type: typeof r.record_type === 'string' ? r.record_type : 'unknown',
  };
  if (typeof r.transaction_code === 'string') out.transaction_code = r.transaction_code;
  if (typeof r.aff_10b5_one === 'boolean') out.aff_10b5_one = r.aff_10b5_one;
  if (typeof r.transaction_acquired_disposed === 'string') {
    out.transaction_acquired_disposed = r.transaction_acquired_disposed;
  }
  if (typeof r.transaction_shares === 'number' && Number.isFinite(r.transaction_shares)) {
    out.transaction_shares = r.transaction_shares;
  }
  if (
    typeof r.transaction_price_per_share === 'number' &&
    Number.isFinite(r.transaction_price_per_share)
  ) {
    out.transaction_price_per_share = r.transaction_price_per_share;
  }
  if (typeof r.transaction_date === 'string' && r.transaction_date.length >= 10) {
    out.transaction_date = r.transaction_date.slice(0, 10);
  }
  if (typeof r.is_director === 'boolean') out.is_director = r.is_director;
  if (typeof r.is_officer === 'boolean') out.is_officer = r.is_officer;
  if (typeof r.is_ten_percent_owner === 'boolean') {
    out.is_ten_percent_owner = r.is_ten_percent_owner;
  }
  if (typeof r.not_subject_to_section_16 === 'boolean') {
    out.not_subject_to_section_16 = r.not_subject_to_section_16;
  }
  if (typeof r.officer_title === 'string') out.officer_title = r.officer_title;
  if (typeof r.security_type === 'string') out.security_type = r.security_type;
  return out;
}

export class PolygonForm4Fetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonForm4Fetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch all Form 4 rows for `ticker` with
   * `transaction_date ∈ [as_of − windowDays, as_of]`. Returns an empty
   * `rows: []` array when the endpoint returns 200 but no matching rows —
   * this is the EXPECTED case for most names (most stocks have no insider
   * activity in any 90-day window). The orchestrator distinguishes
   * "fetched-but-empty" from "data_unavailable" (404).
   */
  async fetchForm4(
    ticker: string,
    as_of: Date,
    windowDays: number = FORM4_WINDOW_DAYS,
    limit: number = DEFAULT_FORM4_LIMIT,
  ): Promise<Form4FetchResult> {
    const to = isoDate(as_of);
    const from = isoDate(new Date(as_of.getTime() - windowDays * MS_PER_DAY));
    const url =
      `${POLYGON_BASE_URL}/stocks/filings/vX/form-4` +
      `?ticker=${encodeURIComponent(ticker)}` +
      `&transaction_date.gte=${from}` +
      `&transaction_date.lte=${to}` +
      `&limit=${limit}` +
      `&apiKey=${encodeURIComponent(this.apiKey)}`;

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
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP \d{3}/.test(e.message);
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on form-4 for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on form-4 for ${ticker}`
        : `network error on form-4 for ${ticker}`;
      throw new SignalComputationError(FORM4_OPERATION_ID, ticker, message, e);
    }

    if (resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        FORM4_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on form-4 for ${ticker}`,
      );
    }

    let body: PolygonForm4Response;
    try {
      body = (await resp.json()) as PolygonForm4Response;
    } catch (e) {
      throw new SignalComputationError(
        FORM4_OPERATION_ID,
        ticker,
        `JSON parse error on form-4 for ${ticker}`,
        e,
      );
    }

    const raw = body.results ?? [];
    const rows: Form4Row[] = [];
    for (const r of raw) {
      const norm = normalizeRow(r);
      if (norm !== null) rows.push(norm);
    }
    return { kind: 'rows', rows };
  }
}