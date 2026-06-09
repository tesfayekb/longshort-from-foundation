/**
 * FinnhubEpsEstimateFetcher — historical + forward EPS-estimate consensus
 * fetch for the Phase 2.6 signal (FP-044 / Signal #2: PEAD, §4.4.6).
 *
 * Sibling to `polygon-short-interest-fetcher.ts` (the closest daily-feed
 * sibling — entitlement-aware, typed-absence on unavailable, never
 * fabricates). First Finnhub-sourced fetcher in the signal stack.
 *
 * ─── Why Finnhub (and not FMP) for Signal #2 ───────────────────────────
 * Per the DEC-049 amendment (ACT-160 reconciliation probe — chat-labeled
 * "ACT-164"): FMP `/stable/analyst-estimates?period=quarter` returns
 * FUTURE-ONLY rows — every already-reported quarter is gone from the
 * endpoint by the time SUE is computed. FMP cannot supply the σ_proxy
 * inputs (`epsHigh`, `epsLow`) or the N≥2 floor input (`numAnalystsEps`)
 * for reported quarters. Finnhub `/stock/eps-estimate?freq=quarterly`
 * retains historical quarters with all four fields (`epsAvg`, `epsHigh`,
 * `epsLow`, `numberAnalysts`) and — verified live on a 10-name AAPL/MSFT/
 * NVDA/AMZN/GOOGL/META/TSLA/JPM/WMT/COST set during the ACT-160 LOOK-
 * AHEAD GATE — the historical `epsAvg` is FROZEN at the at-report
 * snapshot (matches `/stock/earnings.estimate` to 4 decimal places across
 * every reported quarter, never drifts toward `actual`). Point-in-time
 * CLEAN: not contaminated by post-report revisions.
 *
 * ─── Endpoint ──────────────────────────────────────────────────────────
 *   GET https://finnhub.io/api/v1/stock/eps-estimate
 *         ?symbol=<T>&freq=quarterly&token=<KEY>
 *
 * Returns `{ data: [ { epsAvg, epsHigh, epsLow, numberAnalysts,
 *                       period: "YYYY-MM-DD", quarter, year } ] }`.
 * `period` is the FISCAL-PERIOD-END date (e.g. AAPL Q1 fiscal 2026 ends
 * 2026-03-31), NOT the report date. The orchestrator joins this row to
 * the matching `/stock/earnings` row (same `period`) to recover the
 * actual REPORT date for the SUE-decay arithmetic. Keeping the join on
 * `period` rather than on a fuzzy date-window avoids the off-by-one-
 * quarter risk a "closest date" join would create for names whose
 * fiscal calendar is offset from calendar quarters.
 *
 * ─── Pacing ────────────────────────────────────────────────────────────
 * Finnhub Estimate-1 is rate-limited at 300 req/min. With 839 names and
 * one fetch per signal-compute, sequential takes ~2.8 min — already well
 * under any sensible cadence-window. Bounded-concurrency via the shared
 * `pLimitedMap` keeps a small headroom (default 5 — see orchestrator)
 * under the per-second limit (~5/sec). A token-bucket import is NOT
 * needed (deliberate contrast with the FP-043 Tradier path, where the
 * per-second cap was the binding constraint and Token Bucket was the
 * right hammer). This fetcher therefore has no rate-limit primitive of
 * its own — the orchestrator's `pLimitedMap` concurrency cap is the
 * single chokepoint.
 *
 * ─── Entitlement awareness (mirrors PolygonShortInterestFetcher) ───────
 *   - HTTP 401 / 403 → `{ kind: 'unavailable', reason: 'subscription_gated' }`.
 *     Finnhub gates premium endpoints (eps-estimate is on Estimate-1 +
 *     above); a free-tier key receives 401/403 here. Never throws.
 *   - HTTP 404 → `{ kind: 'unavailable', reason: 'data_unavailable' }`.
 *     A symbol with no analyst coverage receives 404 (or an empty `data`
 *     array — both collapse to `data_unavailable`).
 *   - HTTP 429 is RETRIED by `fetchWithTimeoutAndRetry` (exponential
 *     backoff). Persistent 429 after retries throws `SignalComputationError`
 *     — surfacing the rate-limit pressure rather than silently degrading.
 *   - All other non-2xx (5xx after retries, 4xx other than 401/403/404,
 *     timeout, parse error, network) → throws `SignalComputationError`
 *     preserving ticker context per INC-24.
 *
 * ─── Wall-clock discipline (DEC-034 clause 4) ──────────────────────────
 * This fetcher reads NO clock. The endpoint itself is point-in-time
 * "now" — the orchestrator passes `as_of` to filter rows downstream
 * (`period <= as_of`); this fetcher returns ALL rows the endpoint
 * yields (forward + historical) and the consumer filters. Keeping the
 * filter at the consumer keeps replay-safe semantics: a future
 * deterministic-replay harness can re-derive any historical `as_of`
 * from the same fetched payload.
 *
 * ─── Anti-phantom: typed-absence on every uncertain branch ─────────────
 * Missing `epsAvg` / `epsHigh` / `epsLow` / `numberAnalysts` on a row
 * → row is DROPPED (not defaulted to 0). A zero default would silently:
 *   - turn `numberAnalysts` into `<2` → DEC-052 floor would trip on a
 *     phantom "insufficient analysts" reason, but the true cause is a
 *     vendor field-shape regression, not a small-cap coverage cliff;
 *   - turn `epsHigh - epsLow = 0` → DEC-051 σ_proxy would divide by
 *     zero (handled), but the true cause is a vendor field-shape
 *     regression, not "all analysts agree exactly".
 * Both diagnostics matter; collapsing them to a single skip would
 * destroy observability per the FP-041 si_pct_float lesson.
 *
 * Secret: FINNHUB_API_KEY.
 *
 * Owner: longshort (FP-044 — Signal #2 / Phase 2.6)
 * Classification: shared infrastructure — first Finnhub-sourced fetcher.
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeoutAndRetry,
} from '../../longshort-universe/shared/fetch-with-timeout.ts';
import { SignalComputationError } from './signal-types.ts';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/** Operation id surfaced in `SignalComputationError.signal_id` when this
 *  fetcher throws. Mirrors `SHORT_INTEREST_OPERATION_ID`. */
export const EPS_ESTIMATE_OPERATION_ID = 'finnhub_eps_estimate';

/**
 * A single quarterly EPS-estimate row normalized from Finnhub's
 * `/stock/eps-estimate` endpoint. All four numeric fields are REQUIRED
 * (typed-absence guard in `normalizeRow` drops any row missing them).
 *
 * Fields:
 *   - `period`: fiscal-period-END date (ISO YYYY-MM-DD). NOT the report
 *     date — the orchestrator joins on this to `/stock/earnings.period`
 *     to recover the actual report date.
 *   - `epsAvg`: consensus mean EPS estimate. PRE-REPORT consensus on
 *     historical rows (verified frozen-at-report by ACT-160).
 *   - `epsHigh` / `epsLow`: range bounds across the analyst panel.
 *     Inputs to DEC-051's `σ_proxy = (epsHigh − epsLow) / 2.698`.
 *   - `numberAnalysts`: panel size. Input to DEC-052's N≥2 floor.
 */
export interface RawEpsEstimateRow {
  period: string;
  epsAvg: number;
  epsHigh: number;
  epsLow: number;
  numberAnalysts: number;
}

export type EpsEstimateFetchResult =
  | { kind: 'estimates'; rows: RawEpsEstimateRow[] }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' };

interface FinnhubEpsEstimateWire {
  epsAvg?: number;
  epsHigh?: number;
  epsLow?: number;
  numberAnalysts?: number;
  period?: string;
  quarter?: number;
  year?: number;
}

interface FinnhubEpsEstimateResponse {
  data?: FinnhubEpsEstimateWire[];
  freq?: string;
  symbol?: string;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function normalizeRow(row: FinnhubEpsEstimateWire): RawEpsEstimateRow | null {
  const period = row.period;
  if (typeof period !== 'string' || period.length < 10) return null;
  if (!isFiniteNumber(row.epsAvg)) return null;
  if (!isFiniteNumber(row.epsHigh)) return null;
  if (!isFiniteNumber(row.epsLow)) return null;
  if (!isFiniteNumber(row.numberAnalysts)) return null;
  // numberAnalysts MUST be a positive integer; a 0 / negative would be a
  // vendor regression, not "zero analysts cover this name" (the latter
  // would be a 404 / empty-data, handled at the response level).
  if (row.numberAnalysts <= 0) return null;
  return {
    period: period.slice(0, 10),
    epsAvg: row.epsAvg,
    epsHigh: row.epsHigh,
    epsLow: row.epsLow,
    numberAnalysts: row.numberAnalysts,
  };
}

export class FinnhubEpsEstimateFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FINNHUB_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'FinnhubEpsEstimateFetcher: apiKey is required (FINNHUB_API_KEY secret missing).',
      );
    }
  }

  /**
   * Fetch all quarterly EPS estimates Finnhub has for `ticker` (both
   * forward and historical). Returns rows sorted ASCENDING by `period`
   * (oldest first). Consumer (orchestrator) filters by `period <= as_of`
   * to pick the just-reported quarter for SUE.
   *
   * `as_of` is intentionally NOT plumbed into the URL — Finnhub's
   * endpoint has no point-in-time filter and a client-side filter at the
   * fetcher boundary would hide raw payload from a future replay
   * harness. The orchestrator owns the as_of-relative filter.
   */
  async fetchEpsEstimates(ticker: string): Promise<EpsEstimateFetchResult> {
    const url =
      `${this.baseUrl}/stock/eps-estimate` +
      `?symbol=${encodeURIComponent(ticker)}` +
      `&freq=quarterly` +
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
        ? `request timeout after ${this.timeoutMs}ms on eps-estimate for ${ticker}`
        : isHttpAfterRetries
        ? `${(e as Error).message} on eps-estimate for ${ticker}`
        : `network error on eps-estimate for ${ticker}`;
      throw new SignalComputationError(
        EPS_ESTIMATE_OPERATION_ID,
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
        EPS_ESTIMATE_OPERATION_ID,
        ticker,
        `HTTP ${resp.status} ${resp.statusText} on eps-estimate for ${ticker}`,
      );
    }

    let body: FinnhubEpsEstimateResponse;
    try {
      body = (await resp.json()) as FinnhubEpsEstimateResponse;
    } catch (e) {
      throw new SignalComputationError(
        EPS_ESTIMATE_OPERATION_ID,
        ticker,
        `JSON parse error on eps-estimate for ${ticker}`,
        e,
      );
    }

    const raw = body.data ?? [];
    if (raw.length === 0) {
      // Empty payload is typed-absence: ticker has no analyst coverage.
      // Surfaced as data_unavailable so the skip ledger can distinguish
      // "no coverage" from "fetch failed".
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    const rows: RawEpsEstimateRow[] = [];
    for (const r of raw) {
      const norm = normalizeRow(r);
      if (norm !== null) rows.push(norm);
    }
    if (rows.length === 0) {
      // All rows dropped by anti-phantom guard (missing one of the four
      // required numeric fields). Diagnosable: probably a vendor field-
      // shape regression. Surface as data_unavailable so the skip
      // ledger records it.
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }
    rows.sort((a, b) =>
      a.period < b.period ? -1 : a.period > b.period ? 1 : 0,
    );
    return { kind: 'estimates', rows };
  }

  // ── Dual-axis verify (dev-probe helpers; not in production hot path) ──
  //
  // Mirrors the discipline in `_pattern-vendor-fetcher-filter-honesty.md`
  // (INC-70 + INC-71). Static signatures keep them composable with an
  // already-fetched payload — the probe edge function fetches once and
  // runs both verifications without spending another rate-limit token.

  /**
   * INC-70 axis — filter honesty. For Finnhub's `?symbol=` filter, an
   * impossible-symbol probe (e.g. `ZZZZZZZZ`) should return either
   * `{ data: [] }` or 404. If it returns a populated `data[]` from
   * SOME OTHER symbol, the filter is silently ignored. Returns a
   * typed diagnostic; the probe asserts `honored=true`.
   */
  static verifyFilterHonored(
    requestedSymbol: string,
    result: EpsEstimateFetchResult,
  ): { honored: boolean; rows_returned: number; reason: string } {
    if (result.kind === 'unavailable') {
      // 404 / empty on impossible symbol = filter honored.
      return {
        honored: true,
        rows_returned: 0,
        reason: `unavailable:${result.reason} — symbol="${requestedSymbol}" yielded zero rows (filter honored)`,
      };
    }
    // Any row returned on an impossible symbol = filter silently ignored.
    return {
      honored: result.rows.length === 0,
      rows_returned: result.rows.length,
      reason: result.rows.length === 0
        ? `filter honored (empty data[] on impossible symbol "${requestedSymbol}")`
        : `FILTER BLEED: ${result.rows.length} rows returned for impossible symbol "${requestedSymbol}"`,
    };
  }

  /**
   * INC-71 axis — field presence. Counts how many rows populate each of
   * the four §4.4.6 / DEC-051 / DEC-052 fields. A production-tier key
   * with Estimate-1 entitlement should populate all four on ~100% of
   * rows. The ACT-160 probe saw 10/10 for AAPL/MSFT/NVDA/.../COST.
   * Returns raw counts; the probe applies the policy threshold
   * (≥90% per the FP-043 reference pattern) without baking it in.
   */
  static verifyFieldsPresent(rows: ReadonlyArray<RawEpsEstimateRow>): {
    total: number;
    populated: {
      epsAvg: number;
      epsHigh: number;
      epsLow: number;
      numberAnalysts: number;
      n_ge_2: number;
    };
  } {
    let epsAvg = 0, epsHigh = 0, epsLow = 0, numberAnalysts = 0, nGe2 = 0;
    for (const r of rows) {
      // Rows reach here only after normalizeRow's typed-absence guard,
      // so all four are finite by construction. Counts still computed
      // for symmetry with the FP-043 helper shape.
      if (Number.isFinite(r.epsAvg)) epsAvg += 1;
      if (Number.isFinite(r.epsHigh)) epsHigh += 1;
      if (Number.isFinite(r.epsLow)) epsLow += 1;
      if (Number.isFinite(r.numberAnalysts)) numberAnalysts += 1;
      if (r.numberAnalysts >= 2) nGe2 += 1;
    }
    return {
      total: rows.length,
      populated: { epsAvg, epsHigh, epsLow, numberAnalysts, n_ge_2: nGe2 },
    };
  }
}

export { FINNHUB_BASE_URL };