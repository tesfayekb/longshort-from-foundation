/**
 * FinnhubFdaAdvisoryFetcher — Signal #9 / FP-049 Phase 1 / DEC-057 §(b)+(g).
 *
 * Authority: DEC-057 §(b) — Finnhub `/fda-advisory-committee-calendar`
 * is the STRUCTURED, AUTHORITATIVE source for the `fda_advisory` event
 * type at v1. §(g) IN-set: advisory-COMMITTEE meetings only — actual
 * FDA approval / rejection OUTCOMES remain in the OUT-set (named
 * deferral; no structured source at our four-vendor entitlement).
 *
 * ─── DEC-057 §(d) OCCURRED-ONLY ───────────────────────────────────────
 * Despite advisory meetings being calendar items (forward-looking by
 * nature), the §4.4.9 active-catalyst frame is OCCURRED-IN-WINDOW per
 * the operator sharpening — meetings scheduled AFTER `as_of` are
 * dropped (counted as `future_event_excluded`). Phase-7 ablation may
 * arbitrate whether advisory anticipation is its own enhancement-arc
 * FP per the §(d) sharpening notes.
 *
 * ─── Endpoint (Phase-0 §B2 probe-validated) ───────────────────────────
 *   GET https://finnhub.io/api/v1/fda-advisory-committee-calendar
 *       ?token=<KEY>
 * Returns 585 rows shape: { fromDate, toDate, eventDescription, url }
 *
 * NB the Finnhub FDA-advisory endpoint does NOT carry a per-event
 * `symbol` field — events are drug-name / committee-name keyed. v1
 * emission: this fetcher returns a "universe-wide event" by emitting
 * one row with a sentinel ticker `*` per advisory meeting; the
 * Phase-1b classifier + Phase-2 compute will fan these out to the
 * affected names via a secondary drug-name → ticker mapping (deferred
 * to Phase 2 per DEC-057 §(g) — until that mapping lands, fda_advisory
 * events contribute to the universe-wide presence count but NOT to
 * per-name z-scores; the named limitation is recorded here).
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

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
export const FINNHUB_FDA_ADVISORY_OPERATION_ID = 'finnhub_fda_advisory';
const ANCHOR_UTC = 'T14:00:00Z'; // ~10am ET — FDA advisory meetings typically morning sessions

interface FinnhubFdaWire {
  fromDate?: unknown;
  toDate?: unknown;
  eventDescription?: unknown;
  url?: unknown;
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0;
}

function normalizeRow(w: FinnhubFdaWire): RawCatalystEventInput | null {
  // Use fromDate as the event-at (the meeting start date).
  if (!isIsoDate(w.fromDate)) return null;
  const meta: Record<string, string | number | boolean> = {
    universe_wide: true,
    session_anchor: 'morning_default',
  };
  if (isNonEmptyString(w.eventDescription)) {
    meta.description = w.eventDescription.slice(0, 240); // bounded for log safety
  }
  if (isNonEmptyString(w.url)) meta.url = w.url;
  return {
    ticker: '*', // universe-wide; drug-name → ticker fan-out is Phase 2
    event_type: 'fda_advisory',
    event_at: `${w.fromDate}${ANCHOR_UTC}`,
    source: 'structured',
    vendor: 'finnhub',
    meta,
  };
}

export class FinnhubFdaAdvisoryFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    private readonly timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    private readonly baseUrl: string = FINNHUB_BASE_URL,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('FinnhubFdaAdvisoryFetcher: apiKey is required (FINNHUB_API_KEY secret missing).');
    }
  }

  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const url =
      `${this.baseUrl}/fda-advisory-committee-calendar` +
      `?token=${encodeURIComponent(this.apiKey)}`;

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
        `[${FINNHUB_FDA_ADVISORY_OPERATION_ID}] network error`, e,
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
        `[${FINNHUB_FDA_ADVISORY_OPERATION_ID}] HTTP ${resp.status} ${resp.statusText}`,
      );
    }

    let body: unknown;
    try { body = await resp.json(); } catch (e) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${FINNHUB_FDA_ADVISORY_OPERATION_ID}] JSON parse error`, e,
      );
    }
    if (!Array.isArray(body)) {
      throw new SignalComputationError(
        ACTIVE_CATALYST_SIGNAL_ID, '*',
        `[${FINNHUB_FDA_ADVISORY_OPERATION_ID}] unexpected response shape (expected array)`,
      );
    }
    if (body.length === 0) {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    }

    const candidates: RawCatalystEventInput[] = [];
    for (const r of body) {
      const norm = normalizeRow(r as FinnhubFdaWire);
      if (norm !== null) candidates.push(norm);
    }
    const gated = applyLookAheadGate(candidates, window.as_of);
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return { kind: 'events', rows, future_event_excluded: gated.future_event_excluded };
  }
}