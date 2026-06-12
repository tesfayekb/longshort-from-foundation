/**
 * FmpEarningsCalendarFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(b)+(d).
 *
 * Authority: DEC-057 §(b) — FMP `/stable/earnings-calendar` is the
 * STRUCTURED, AUTHORITATIVE source for the `earnings` event type at v1.
 *
 * ─── Endpoint (Phase-0 §B2 probe-validated) ───────────────────────────
 *   GET https://financialmodelingprep.com/stable/earnings-calendar
 *       ?from=YYYY-MM-DD&to=YYYY-MM-DD&apikey=<KEY>
 *
 * Returns an array of rows shaped like:
 *   { symbol, date, epsActual, epsEstimated, revenueActual,
 *     revenueEstimated, lastUpdated }
 *
 * ─── DEC-057 §(d) OCCURRED-ONLY binding ───────────────────────────────
 * v1 BINDING: rows with `date > as_of` (vendor returns both past + future
 * dates per the §B2 evidence) are DROPPED with a counted
 * `future_event_excluded` meta — NEVER an error, never silently kept.
 * The "upcoming-within-2-trading-days anticipation" alternative is
 * REJECTED for v1 (operator sharpening 2026-06-12; recorded as a possible
 * future enhancement-arc FP, NOT a deferred rider).
 *
 * ─── DEC-057 §(d) `event_at` precision binding ────────────────────────
 * FMP earnings-calendar rows carry a date-only `date` field (no
 * session-anchor hour). DEC-057 §(d) names Finnhub `hour` as the
 * Tier-1 enrichment when the FMP row lacks time — but the brief
 * (Part B commit 1a) bars silent cross-vendor enrichment per event
 * row. v1 ruling for this fetcher: assign the documented per-vendor
 * session-anchor default `12:00 ET` (the §(d) "blank" branch — neutral
 * mid-session anchor) when the FMP row carries no time, AND surface
 * the Finnhub-hour enrichment as a NAMED FOLLOW-UP if Phase-7 IC
 * ablation evidence shows session-anchor precision materially shifts
 * the catalyst-decay arithmetic. Recording the binding here so the
 * decision is auditable rather than buried in the orchestrator.
 *
 * 12:00 ET = 16:00 UTC during EDT, 17:00 UTC during EST. v1 uses
 * 16:00 UTC year-round (the 1h EDT/EST drift is well inside the §(a)
 * 48h earnings half-life — `exp(-1/48)` ≈ 0.979, a 2% age-weight shift
 * that the within-sector z-score absorbs).
 *
 * ─── Typed error taxonomy ─────────────────────────────────────────────
 *   401 / 402 / 403          → subscription_gated
 *   429 (post-retry)         → rate_limited
 *   404 OR empty array       → data_unavailable
 *   network / 5xx / parse    → throws SignalComputationError
 *
 * Secret: FMP_API_KEY. NEVER logged; URL key masked in error messages.
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9 commit 1a)
 * Classification: shared infrastructure — first FMP catalyst fetcher.
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

export const FMP_BASE_URL = 'https://financialmodelingprep.com';
export const FMP_EARNINGS_CALENDAR_OPERATION_ID = 'fmp_earnings_calendar';

/** Mid-session anchor for FMP date-only rows — see header §(d) ruling. */
const FMP_DEFAULT_SESSION_ANCHOR_UTC = 'T16:00:00Z';

interface FmpEarningsCalendarWire {
  symbol?: unknown;
  date?: unknown;
  epsActual?: unknown;
  epsEstimated?: unknown;
  revenueActual?: unknown;
  revenueEstimated?: unknown;
  lastUpdated?: unknown;
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function normalizeRow(
  w: FmpEarningsCalendarWire,
): RawCatalystEventInput | null {
  if (!isNonEmptyString(w.symbol)) return null;
  if (!isIsoDate(w.date)) return null;
  const event_at = `${w.date}${FMP_DEFAULT_SESSION_ANCHOR_UTC}`;
  const meta: Record<string, string | number | boolean> = {
    session_anchor: 'mid_session_default',
  };
  if (typeof w.epsActual === 'number' && Number.isFinite(w.epsActual)) {
    meta.has_eps_actual = true;
  }
  return {
    ticker: w.symbol,
    event_type: 'earnings',
    event_at,
    source: 'structured',
    vendor: 'fmp',
    meta,
  };
}

export class FmpEarningsCalendarFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FMP_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FmpEarningsCalendarFetcher: apiKey is required (FMP_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch earnings-calendar rows for the [window_start_at, as_of] window.
   * All returned rows satisfy `event_at <= as_of` (look-ahead gate,
   * client-re-checked even though the vendor `to=` parameter is sent).
   *
   * Window is converted to date-only strings on the FMP side. The
   * client-side gate then enforces sub-day precision against `as_of`.
   */
  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const from = window.window_start_at.toISOString().slice(0, 10);
    const to = window.as_of.toISOString().slice(0, 10);
    const url =
      `${this.baseUrl}/stable/earnings-calendar` +
      `?from=${encodeURIComponent(from)}` +
      `&to=${encodeURIComponent(to)}` +
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
      const isHttpAfterRetries =
        e instanceof Error && /^HTTP 429/.test(e.message);
      if (isHttpAfterRetries) {
        return { kind: 'unavailable', reason: 'rate_limited' };
      }
      const message = isTimeout
        ? `request timeout after ${this.timeoutMs}ms on earnings-calendar [${from}..${to}]`
        : `network error on earnings-calendar [${from}..${to}]`;
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID,
        '*',
        `[${FMP_EARNINGS_CALENDAR_OPERATION_ID}] ${message}`,
        e,
      );
    }

    if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 429) {
      return { kind: 'unavailable', reason: 'rate_limited' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID,
        '*',
        `[${FMP_EARNINGS_CALENDAR_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText} [${from}..${to}]`,
      );
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID,
        '*',
        `[${FMP_EARNINGS_CALENDAR_OPERATION_ID}] JSON parse error [${from}..${to}]`,
        e,
      );
    }

    if (!Array.isArray(body)) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID,
        '*',
        `[${FMP_EARNINGS_CALENDAR_OPERATION_ID}] unexpected response shape: expected array, got ${typeof body}`,
      );
    }
    if (body.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const candidates: RawCatalystEventInput[] = [];
    for (const r of body) {
      const norm = normalizeRow(r as FmpEarningsCalendarWire);
      if (norm !== null) candidates.push(norm);
    }

    const gated = applyLookAheadGate(candidates, window.as_of);
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return {
      kind: 'events',
      rows,
      future_event_excluded: gated.future_event_excluded,
    };
  }
}