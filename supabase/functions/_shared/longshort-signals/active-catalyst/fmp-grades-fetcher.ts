/**
 * FmpGradesFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(b)+(c).
 *
 * Authority: DEC-057 §(b) — FMP `/stable/grades-latest-news` is the
 * STRUCTURED, AUTHORITATIVE source for the `analyst_rating` event type
 * at v1. The `action` field (`initialise`/`upgrade`/`downgrade`/
 * `reiterate`) is preserved in `meta.action` so the Phase-1b classifier
 * can pick §4.4.9 Tier-2 ("major analyst rating") vs Tier-3 ("minor
 * analyst rating change") per the spec verbatim table.
 *
 * ─── DEC-057 §(c) cross-signal independence (CRITICAL) ────────────────
 * Signal #1 (`analyst_revision_drift`, §4.4.5) consumes the SAME FMP
 * grades-latest-news endpoint via its own fetcher
 * (`_shared/longshort-signals/analyst-revisions/`). This file is a
 * DELIBERATE thin parallel fetcher per the brief's "if reuse of their
 * plumbing is tempting, surface per §22.8.4 instead of coupling" —
 * tight coupling between #1 and #9 would silently break #9 the day
 * #1's fetcher is refactored. The duplication cost is one short file;
 * the DECOUPLING benefit is #9's vendor contract is independently
 * tested + independently observable.
 *
 * ─── Endpoint (Phase-0 §B2 probe-validated) ───────────────────────────
 *   GET https://financialmodelingprep.com/stable/grades-latest-news
 *       ?page=N&limit=100&apikey=<KEY>
 * Returns rows: { symbol, publishedDate (ISO-8601 to-the-minute),
 *                 newGrade, previousGrade, gradingCompany, action,
 *                 priceWhenPosted }
 *
 * Pagination ceiling: 3 pages × 100 rows = 300 most-recent ratings
 * actions (trailing-5d realistic ceiling per the FP-047 plumbing).
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9 commit 1a)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import {
  ACTIVE_CATALYST_SIGNAL_ID,
  applyLookAheadGate,
  applyWindowLowerBound,
  type CatalystFetchResult,
  type CatalystFetchWindow,
  type RawCatalystEventInput,
} from './catalyst-types.ts';
import { FMP_BASE_URL } from './fmp-earnings-calendar-fetcher.ts';

export const FMP_GRADES_OPERATION_ID = 'fmp_grades_latest_news';
export const FMP_GRADES_DEFAULT_MAX_PAGES = 3;
const FMP_GRADES_PAGE_LIMIT = 100;

/** Vendor `action` values seen in Phase-0 §B2 evidence. */
const VALID_GRADE_ACTIONS: ReadonlySet<string> = new Set([
  'initialise', 'initialize', 'upgrade', 'downgrade', 'reiterate', 'hold',
]);

interface FmpGradesWire {
  symbol?: unknown;
  publishedDate?: unknown;
  newGrade?: unknown;
  previousGrade?: unknown;
  gradingCompany?: unknown;
  action?: unknown;
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function normalizeRow(w: FmpGradesWire): RawCatalystEventInput | null {
  if (!isNonEmptyString(w.symbol)) return null;
  if (!isNonEmptyString(w.publishedDate)) return null;
  const t = Date.parse(w.publishedDate);
  if (!Number.isFinite(t)) return null;
  const action = isNonEmptyString(w.action) ? w.action.toLowerCase() : 'unknown';
  if (!VALID_GRADE_ACTIONS.has(action)) {
    // Unknown action surfaces in meta but the row is preserved — the
    // classifier will route it to the conservative Tier-3 bucket per
    // DEC-057 §(b) "minimum-keyword set + action-verb gate" discipline.
  }
  const meta: Record<string, string | number | boolean> = { action };
  if (isNonEmptyString(w.gradingCompany)) meta.grading_company = w.gradingCompany;
  if (isNonEmptyString(w.newGrade)) meta.new_grade = w.newGrade;
  if (isNonEmptyString(w.previousGrade)) meta.previous_grade = w.previousGrade;
  return {
    ticker: w.symbol,
    event_type: 'analyst_rating',
    event_at: new Date(t).toISOString(),
    source: 'structured',
    vendor: 'fmp',
    meta,
  };
}

export interface FmpGradesFetcherOptions {
  maxPages?: number;
}

export class FmpGradesFetcher {
  private readonly maxPages: number;

  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FMP_BASE_URL,
    options: FmpGradesFetcherOptions = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('FmpGradesFetcher: apiKey is required (FMP_API_KEY secret missing).');
    }
    this.maxPages = options.maxPages ?? FMP_GRADES_DEFAULT_MAX_PAGES;
  }

  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const candidates: RawCatalystEventInput[] = [];
    const startMs = window.window_start_at.getTime();

    for (let page = 0; page < this.maxPages; page += 1) {
      const url =
        `${this.baseUrl}/stable/grades-latest-news` +
        `?page=${page}&limit=${FMP_GRADES_PAGE_LIMIT}` +
        `&apikey=${encodeURIComponent(this.apiKey)}`;

      let resp: Awaited<ReturnType<HttpFetch>>;
      try {
        resp = await fetchWithTimeoutAndRetry(
          this.httpFetch, url, { method: 'GET' }, { timeoutMs: this.timeoutMs },
        );
      } catch (e) {
        if (e instanceof Error && /^HTTP 429/.test(e.message)) {
          return { kind: 'unavailable', reason: 'rate_limited' };
        }
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID, '*',
          `[${FMP_GRADES_OPERATION_ID}] network error on page ${page}`, e,
        );
      }

      if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
        return { kind: 'unavailable', reason: 'subscription_gated' };
      }
      if (resp.status === 429) return { kind: 'unavailable', reason: 'rate_limited' };
      if (resp.status === 404) {
        if (page === 0) return { kind: 'unavailable', reason: 'data_unavailable' };
        break;
      }
      if (!resp.ok) {
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID, '*',
          `[${FMP_GRADES_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText} on page ${page}`,
        );
      }

      let body: unknown;
      try { body = await resp.json(); } catch (e) {
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID, '*',
          `[${FMP_GRADES_OPERATION_ID}] JSON parse error on page ${page}`, e,
        );
      }
      if (!Array.isArray(body)) {
        throw new SignalComputationError(
          ACTIVE_CATALYST_SIGNAL_ID, '*',
          `[${FMP_GRADES_OPERATION_ID}] unexpected response shape on page ${page}`,
        );
      }
      if (body.length === 0) {
        if (page === 0) return { kind: 'unavailable', reason: 'data_unavailable' };
        break;
      }

      let allBelowWindow = true;
      for (const r of body) {
        const norm = normalizeRow(r as FmpGradesWire);
        if (norm === null) continue;
        const t = Date.parse(norm.event_at);
        if (Number.isFinite(t) && t >= startMs) allBelowWindow = false;
        candidates.push(norm);
      }
      if (allBelowWindow) break;
    }

    const gated = applyLookAheadGate(candidates, window.as_of);
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return { kind: 'events', rows, future_event_excluded: gated.future_event_excluded };
  }
}