/**
 * PolygonDividendsFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(b)+(e).
 *
 * Authority: DEC-057 §(b) — Polygon `/v3/reference/dividends` is the
 * STRUCTURED, AUTHORITATIVE source for the `dividend_change` event type
 * at v1. §(e) BINDING: decay-origin = `declaration_date` (NEVER
 * ex-date substitution). Rows with empty/missing `declaration_date`
 * surface as the typed counter `declaration_date_unavailable`
 * (counted, not silently dropped) so the Phase-3 orchestrator can
 * observe the §(e) skip-rate.
 *
 * ─── Endpoint (Phase-0 §B2 probe-validated) ───────────────────────────
 *   GET https://api.polygon.io/v3/reference/dividends
 *       ?declaration_date.gte=YYYY-MM-DD&declaration_date.lte=YYYY-MM-DD
 *       &limit=1000&apiKey=<KEY>
 * Rows: { ticker, ex_dividend_date, declaration_date, record_date,
 *         pay_date, cash_amount, frequency, dividend_type }
 *
 * `dividend_type === 'SC'` (special cash) is preserved in meta so the
 * Phase-1b classifier can route special dividends to the §4.4.9 Tier-2
 * "stock split / special dividend" path; ordinary dividends remain the
 * Tier-2 "buyback/dividend change" path.
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
import { POLYGON_BASE_URL } from './polygon-splits-fetcher.ts';

export const POLYGON_DIVIDENDS_OPERATION_ID = 'polygon_dividends';
const ANCHOR_UTC = 'T16:00:00Z';

interface PolygonDividendsResponse { results?: unknown; }
interface PolygonDividendWire {
  ticker?: unknown;
  ex_dividend_date?: unknown;
  declaration_date?: unknown;
  cash_amount?: unknown;
  frequency?: unknown;
  dividend_type?: unknown;
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

type NormalizeOut =
  | { kind: 'row'; row: RawCatalystEventInput }
  | { kind: 'declaration_missing' }
  | { kind: 'drop' };

function normalizeRow(w: PolygonDividendWire): NormalizeOut {
  if (!isNonEmptyString(w.ticker)) return { kind: 'drop' };
  if (!isIsoDate(w.declaration_date)) {
    // DEC-057 §(e) — NEVER substitute ex-date; surface as a counted skip.
    return { kind: 'declaration_missing' };
  }
  const meta: Record<string, string | number | boolean> = { session_anchor: 'mid_session_default' };
  if (typeof w.cash_amount === 'number' && Number.isFinite(w.cash_amount)) meta.cash_amount = w.cash_amount;
  if (isNonEmptyString(w.frequency)) meta.frequency = w.frequency;
  if (typeof w.frequency === 'number') meta.frequency = w.frequency;
  if (isNonEmptyString(w.dividend_type)) {
    meta.dividend_type = w.dividend_type;
    if (w.dividend_type === 'SC') meta.special = true;
  }
  return {
    kind: 'row',
    row: {
      ticker: w.ticker,
      event_type: 'dividend_change',
      event_at: `${w.declaration_date}${ANCHOR_UTC}`,
      source: 'structured',
      vendor: 'polygon',
      meta,
    },
  };
}

export class PolygonDividendsFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = POLYGON_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('PolygonDividendsFetcher: apiKey is required (POLYGON_API_KEY secret missing).');
    }
  }

  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const from = window.window_start_at.toISOString().slice(0, 10);
    const to = window.as_of.toISOString().slice(0, 10);
    const url =
      `${this.baseUrl}/v3/reference/dividends` +
      `?declaration_date.gte=${from}&declaration_date.lte=${to}` +
      `&limit=1000&apiKey=${encodeURIComponent(this.apiKey)}`;

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
        `[${POLYGON_DIVIDENDS_OPERATION_ID}] network error [${from}..${to}]`, e,
      );
    }

    if (resp.status === 401 || resp.status === 402 || resp.status === 403) {
      return { kind: 'unavailable', reason: 'subscription_gated' };
    }
    if (resp.status === 429) return { kind: 'unavailable', reason: 'rate_limited' };
    if (resp.status === 404) return { kind: 'unavailable', reason: 'data_unavailable' };
    if (!resp.ok) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${POLYGON_DIVIDENDS_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText} [${from}..${to}]`,
      );
    }

    let body: unknown;
    try { body = await resp.json(); } catch (e) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${POLYGON_DIVIDENDS_OPERATION_ID}] JSON parse error [${from}..${to}]`, e,
      );
    }
    const wrapped = body as PolygonDividendsResponse;
    if (typeof wrapped !== 'object' || wrapped === null || !Array.isArray(wrapped.results)) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${POLYGON_DIVIDENDS_OPERATION_ID}] unexpected response shape [${from}..${to}]`,
      );
    }
    if (wrapped.results.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const candidates: RawCatalystEventInput[] = [];
    let declarationMissing = 0;
    for (const r of wrapped.results) {
      const out = normalizeRow(r as PolygonDividendWire);
      if (out.kind === 'row') candidates.push(out.row);
      else if (out.kind === 'declaration_missing') declarationMissing += 1;
    }
    const gated = applyLookAheadGate(candidates, window.as_of);
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return {
      kind: 'events',
      rows,
      future_event_excluded: gated.future_event_excluded,
      declaration_date_unavailable: declarationMissing,
    };
  }
}