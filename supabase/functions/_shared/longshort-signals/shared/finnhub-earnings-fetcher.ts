/**
 * FinnhubEarningsFetcher — historical earnings actuals + at-report
 * consensus snapshot fetch for the Phase 2.6 signal (FP-044 / Signal #2:
 * PEAD, §4.4.6).
 *
 * Sibling to `finnhub-eps-estimate-fetcher.ts`. Together the two
 * supply the full SUE input set:
 *
 *   eps-estimate → epsAvg (consensus mean), epsHigh / epsLow (DEC-051
 *                  σ_proxy inputs), numberAnalysts (DEC-052 N≥2 floor),
 *                  ALL frozen at the at-report snapshot per the ACT-160
 *                  LOOK-AHEAD GATE — point-in-time CLEAN.
 *   earnings     → actual (epsActual), at-report estimate (corroborator
 *                  for the eps-estimate.epsAvg point-in-time-safety
 *                  assertion), report date (drives SUE-decay arithmetic).
 *
 * ─── Endpoint ──────────────────────────────────────────────────────────
 *   GET https://finnhub.io/api/v1/stock/earnings?symbol=<T>&token=<KEY>
 *
 * Returns a BARE ARRAY (not wrapped — distinct from the eps-estimate
 * `{ data: [...] }` shape) of rows:
 *   { actual, estimate, period: "YYYY-MM-DD", quarter, year,
 *     surprise, surprisePercent, symbol }
 *
 * `period` is the fiscal-period-END date (matches the eps-estimate join
 * key). `actual` is null for unreported (future) quarters. The endpoint
 * does NOT carry the actual report date as a separate field — Finnhub
 * returns the same `period` for both endpoints. The orchestrator derives
 * the SUE-decay window from `as_of - period`, with `period` standing in
 * for the report date (the conscious approximation is that fiscal
 * period-end and report date are typically 30-60 calendar days apart;
 * v1 of this signal uses the period-end as the anchor and v2 may
 * refine via `/stock/earnings-calendar` if the timing slip materially
 * affects backtest results — flagged in the §4.4.6 follow-up notes).
 *
 * NB: a higher-fidelity report-date source exists in
 * `/calendar/earnings?symbol=...` and could replace the period-end
 * anchor in a future revision. Not pulled into v1 because:
 *   (a) one less endpoint to rate-limit + monitor;
 *   (b) DEC-049's vendor-cost ceiling argument is per-vendor calls,
 *       not per-name calls — adding a third endpoint per name doubles
 *       the budget for marginal precision (≤2 trading-day shift).
 *
 * ─── Entitlement / pacing / wall-clock / anti-phantom ──────────────────
 * Identical discipline to `FinnhubEpsEstimateFetcher`. Read that header
 * for the rationale; the deltas here are endpoint-shape:
 *   - response is BARE ARRAY, not `{ data: [...] }`;
 *   - `actual` is OPTIONAL (null for future quarters — typed-absence,
 *     never defaulted; consumer filters `actual !== null` to pick
 *     reported quarters);
 *   - `estimate` is the AT-REPORT consensus snapshot, distinct from the
 *     eps-estimate `epsAvg` (the point-in-time-frozen rolling consensus).
 *     The two SHOULD match to ~4 decimal places on historical rows;
 *     when they don't, the post-report revision diagnostic is
 *     `|epsAvg - estimate| / |estimate| > 0.01` (1% drift — flagged but
 *     not blocking; the orchestrator records it as a future-replay
 *     observability hook, not a skip reason).
 *
 * Secret: FINNHUB_API_KEY (shared with `FinnhubEpsEstimateFetcher`).
 *
 * Owner: longshort (FP-044 — Signal #2 / Phase 2.6)
 * Classification: shared infrastructure — second Finnhub-sourced fetcher.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export const EARNINGS_OPERATION_ID = 'finnhub_earnings';

/**
 * A single quarterly earnings row normalized from Finnhub's
 * `/stock/earnings` endpoint.
 *
 * `actual` is `number | null` — null = future / unreported quarter
 * (typed-absence). `estimate` is the at-report consensus snapshot
 * (typically non-null even for future quarters, since the consensus
 * exists before the report happens).
 */
export interface RawEarningsRow {
  period: string;
  actual: number | null;
  estimate: number | null;
}

export type EarningsFetchResult =
  | { kind: 'earnings'; rows: RawEarningsRow[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface FinnhubEarningsWire {
  actual?: number | null;
  estimate?: number | null;
  period?: string;
  quarter?: number;
  year?: number;
  surprise?: number | null;
  surprisePercent?: number | null;
  symbol?: string;
}

function isFiniteNumberOrNull(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function normalizeRow(row: FinnhubEarningsWire): RawEarningsRow | null {
  const period = row.period;
  if (typeof period !== 'string' || period.length < 10) return null;
  // actual + estimate are both optional (future quarters lack actual);
  // a row with NEITHER is useless to the consumer, so drop it.
  const actual = isFiniteNumberOrNull(row.actual);
  const estimate = isFiniteNumberOrNull(row.estimate);
  if (actual === null && estimate === null) return null;
  return { period: period.slice(0, 10), actual, estimate };
}

export class FinnhubEarningsFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FINNHUB_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FinnhubEarningsFetcher: apiKey is required (FINNHUB_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch all quarterly earnings rows Finnhub has for `ticker`. Returns
   * rows sorted ASCENDING by `period` (oldest first). Consumer filters
   * `actual !== null && period <= as_of` to pick reported quarters.
   */
  async fetchEarnings(ticker: string): Promise<EarningsFetchResult> {
    const url =
      `${this.baseUrl}/stock/earnings` +
      `?symbol=${encodeURIComponent(ticker)}` +
      `&token=${encodeURIComponent(this.apiKey)}`;

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
        ? `request timeout after ${this.timeoutMs}ms on earnings for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on earnings for ${ticker}`
        : `network error on earnings for ${ticker}`;
      throw new SignalComputationError(
        EARNINGS_OPERATION_ID,
        ticker,
        message,
        e,
      );
    }

    if (resp.status === 401 || resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 404) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    if (!resp.ok) {
      throw new SignalComputationError(
        EARNINGS_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on earnings for ${ticker}`,
      );
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch (e) {
      throw new SignalComputationError(
        EARNINGS_OPERATION_ID,
        ticker,
        `JSON parse error on earnings for ${ticker}`,
        e,
      );
    }

    // Finnhub returns a bare array. Defensive shape-check rather than
    // trusting the cast — a vendor regression to a wrapped shape would
    // silently turn into `rows.length === 0` without this guard.
    if (!Array.isArray(body)) {
      throw new SignalComputationError(
        EARNINGS_OPERATION_ID,
        ticker,
        `unexpected response shape: expected array, got ${typeof body} on earnings for ${ticker}`,
      );
    }
    if (body.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    const rows: RawEarningsRow[] = [];
    for (const r of body) {
      const norm = normalizeRow(r as FinnhubEarningsWire);
      if (norm !== null) rows.push(norm);
    }
    if (rows.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    rows.sort((a, b) =>
      a.period < b.period ? -1 : a.period > b.period ? 1 : 0,
    );
    return { kind: 'earnings', rows };
  }

  // ── Dual-axis verify (dev-probe helpers; not in production hot path) ──

  /**
   * INC-70 axis — filter honesty. Same shape as the eps-estimate helper.
   */
  static verifyFilterHonored(
    requestedSymbol: string,
    result: EarningsFetchResult,
  ): { honored: boolean; rows_returned: number; reason: string } {
    if (result.kind === 'unavailable') {
      return {
        honored: true,
        rows_returned: 0,
        reason: `unavailable:${result.reason} — symbol="${requestedSymbol}" yielded zero rows (filter honored)`,
      };
    }
    return {
      honored: result.rows.length === 0,
      rows_returned: result.rows.length,
      reason: result.rows.length === 0
        ? `filter honored (empty array on impossible symbol "${requestedSymbol}")`
        : `FILTER BLEED: ${result.rows.length} rows returned for impossible symbol "${requestedSymbol}"`,
    };
  }

  /**
   * INC-71 axis — field presence. Counts how many rows populate `actual`
   * (REPORTED quarters only — future quarters lack actual by design) and
   * how many populate `estimate`. The probe-policy threshold is applied
   * by the caller (typically: estimate populated on ≥95% of all rows,
   * actual populated on ≥95% of past-dated rows).
   */
  static verifyFieldsPresent(rows: ReadonlyArray<RawEarningsRow>): {
    total: number;
    populated: {
      actual_any: number;
      estimate: number;
    };
  } {
    let actualAny = 0, estimate = 0;
    for (const r of rows) {
      if (r.actual !== null) actualAny += 1;
      if (r.estimate !== null) estimate += 1;
    }
    return {
      total: rows.length,
      populated: { actual_any: actualAny, estimate },
    };
  }
}

export { FINNHUB_BASE_URL };