/**
 * PolygonSplitsFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(b)+(e).
 *
 * Authority: DEC-057 §(b) — Polygon `/v3/reference/splits` is the
 * STRUCTURED, AUTHORITATIVE source for the `splits` event type at v1.
 * Tradier corporate-actions backup (DEC-057 §(i)) is consulted ONLY on
 * `unavailable` — invocation logic lives in the Phase-3 orchestrator;
 * this file is the primary fetcher only.
 *
 * ─── DEC-057 §(e) decay-origin ────────────────────────────────────────
 * For splits the catalyst event-at IS `execution_date` (the spec
 * announcement-vs-ex-date distinction in §(e) primarily targets
 * dividends; split announcements typically lack a separate
 * announcement-date field on Polygon's response). Mid-session UTC
 * anchor (16:00 UTC) is applied to date-only rows.
 *
 * ─── Endpoint (Phase-0 §B2 probe-validated) ───────────────────────────
 *   GET https://api.polygon.io/v3/reference/splits
 *       ?execution_date.gte=YYYY-MM-DD&execution_date.lte=YYYY-MM-DD
 *       &limit=1000&apiKey=<KEY>
 * Rows: { ticker, execution_date, split_from, split_to, id }
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

export const POLYGON_BASE_URL = 'https://api.polygon.io';
export const POLYGON_SPLITS_OPERATION_ID = 'polygon_splits';
const ANCHOR_UTC = 'T16:00:00Z';

interface PolygonSplitsResponse { results?: unknown; }
interface PolygonSplitWire {
  ticker?: unknown;
  execution_date?: unknown;
  split_from?: unknown;
  split_to?: unknown;
  id?: unknown;
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function normalizeRow(w: PolygonSplitWire): RawCatalystEventInput | null {
  if (!isNonEmptyString(w.ticker)) return null;
  if (!isIsoDate(w.execution_date)) return null;
  const meta: Record<string, string | number | boolean> = { session_anchor: 'mid_session_default' };
  if (typeof w.split_from === 'number') meta.split_from = w.split_from;
  if (typeof w.split_to === 'number') meta.split_to = w.split_to;
  if (isNonEmptyString(w.id)) meta.polygon_id = w.id;
  return {
    ticker: w.ticker,
    event_type: 'splits',
    event_at: `${w.execution_date}${ANCHOR_UTC}`,
    source: 'structured',
    vendor: 'polygon',
    meta,
  };
}

export class PolygonSplitsFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = POLYGON_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('PolygonSplitsFetcher: apiKey is required (POLYGON_API_KEY secret missing).');
    }
  }

  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const from = window.window_start_at.toISOString().slice(0, 10);
    const to = window.as_of.toISOString().slice(0, 10);
    const url =
      `${this.baseUrl}/v3/reference/splits` +
      `?execution_date.gte=${from}&execution_date.lte=${to}` +
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
        `[${POLYGON_SPLITS_OPERATION_ID}] network error [${from}..${to}]`, e,
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
        `[${POLYGON_SPLITS_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText} [${from}..${to}]`,
      );
    }

    let body: unknown;
    try { body = await resp.json(); } catch (e) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${POLYGON_SPLITS_OPERATION_ID}] JSON parse error [${from}..${to}]`, e,
      );
    }
    const wrapped = body as PolygonSplitsResponse;
    if (typeof wrapped !== 'object' || wrapped === null || !Array.isArray(wrapped.results)) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${POLYGON_SPLITS_OPERATION_ID}] unexpected response shape [${from}..${to}]`,
      );
    }
    if (wrapped.results.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const candidates: RawCatalystEventInput[] = [];
    for (const r of wrapped.results) {
      const norm = normalizeRow(r as PolygonSplitWire);
      if (norm !== null) candidates.push(norm);
    }
    const gated = applyLookAheadGate(candidates, window.as_of);
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return { kind: 'events', rows, future_event_excluded: gated.future_event_excluded };
  }
}