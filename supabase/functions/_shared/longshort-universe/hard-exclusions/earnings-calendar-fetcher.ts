/**
 * PolygonEarningsCalendarFetcher — Polygon-backed earnings calendar feed for
 * §3.3a hard-exclusion rule.
 *
 * Per ACT-107 §22.8.4 Surface 1 → Option A: reuses POLYGON_API_KEY (already
 * provisioned at ACT-105 / env-var-index.md). Zero marginal cost; same auth
 * model as constituent ingestion + enrichment.
 *
 * Contingency per operator disposition: "if Polygon earnings endpoint is not
 * on current plan tier, fall through to 1B per §22.8.4 STOP discipline."
 * Implementation surfaces the missing-endpoint condition as a thrown
 * `EarningsCalendarFetchError` with HTTP status; the refresh-job entry point
 * (sub-step 8.4 / 8.5) is responsible for STOP-and-surface on this signal.
 * The 1B fallback (FMP / mid-tier feed) would be a NEW fetcher class
 * implementing the same `EarningsCalendarFetcher` interface — no orchestrator
 * change required.
 *
 * Polygon endpoint:
 *   GET https://api.polygon.io/vX/reference/tickers/{ticker}/events
 *     ?types=earnings&apiKey=<POLYGON_API_KEY>
 *
 * BMO / AMC / intraday timing flag is inferred from the event timestamp:
 *   - hour < 9  (Eastern) → BMO
 *   - hour >= 16 (Eastern) → AMC
 *   - otherwise → intraday
 * If Polygon supplies an explicit `time_of_day` field on the event payload,
 * the explicit value wins.
 *
 * Design discipline:
 *   - `as_of: Date` parameter per DEC-034 clause (4); no wall-clock read.
 *   - HTTP fetch is injected via constructor for unit-testability.
 *   - Throws on network / auth / parse failure (no silent fallback to empty).
 *   - No `reconcile()` coupling; no DB writes; no `logAuditEvent` import.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical (data source for §3.3a hard exclusion).
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import type {
  EarningsCalendarFetcher,
  EarningsCalendarSnapshot,
  EarningsTimeOfDay,
  ScheduledEarnings,
} from '../../longshort-hard-exclusion-interfaces.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';

export class EarningsCalendarFetchError extends Error {
  constructor(
    public readonly ticker: string,
    public readonly status: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[earnings-calendar:${ticker}] (HTTP ${status}) ${message}`);
    this.name = 'EarningsCalendarFetchError';
  }
}

interface PolygonEarningsEvent {
  ticker?: string;
  type?: string;
  date?: string;          // ISO date or datetime
  time_of_day?: string;   // optional explicit flag
}

interface PolygonEventsResponse {
  results?: { events?: PolygonEarningsEvent[] };
  status?: string;
}

function inferTimeOfDay(date: string, explicit?: string): EarningsTimeOfDay {
  const e = (explicit ?? '').toLowerCase();
  if (e === 'bmo' || e.includes('pre')) return 'BMO';
  if (e === 'amc' || e.includes('post') || e.includes('after')) return 'AMC';
  if (e === 'intraday' || e === 'during') return 'intraday';
  // Fall back to time-of-day inference from the date string if it includes time.
  // Polygon returns Eastern-aligned dates; UTC hour approx: 9am ET ≈ 13/14 UTC.
  if (date.includes('T')) {
    const d = new Date(date);
    const hourUtc = d.getUTCHours();
    if (hourUtc < 13) return 'BMO';
    if (hourUtc >= 20) return 'AMC';
    return 'intraday';
  }
  // Date-only → assume AMC (most conservative cutoff).
  return 'AMC';
}

function isoDatePart(s: string): string {
  const t = s.indexOf('T');
  return t === -1 ? s : s.slice(0, t);
}

export class PolygonEarningsCalendarFetcher implements EarningsCalendarFetcher {
  constructor(
    private readonly apiKey: string,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonEarningsCalendarFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
  }

  async fetchUpcomingEarnings(
    tickers: ReadonlyArray<string>,
    as_of: Date,
  ): Promise<EarningsCalendarSnapshot> {
    const entries: ScheduledEarnings[] = [];
    for (const ticker of tickers) {
      const events = await this.fetchTickerEvents(ticker);
      for (const evt of events) {
        if (evt.type !== 'earnings' || !evt.date) continue;
        entries.push({
          ticker,
          scheduled_date: isoDatePart(evt.date),
          time_of_day: inferTimeOfDay(evt.date, evt.time_of_day),
        });
      }
    }
    return { entries, fetched_at: as_of };
  }

  private async fetchTickerEvents(ticker: string): Promise<PolygonEarningsEvent[]> {
    const url = `${POLYGON_BASE_URL}/vX/reference/tickers/${encodeURIComponent(ticker)}/events?types=earnings&apiKey=${this.apiKey}`;
    let resp;
    try {
      resp = await this.httpFetch(url);
    } catch (cause) {
      throw new EarningsCalendarFetchError(ticker, 0, 'network failure', cause);
    }
    if (resp.status === 404) {
      // No events for ticker — typed-absence; not a failure.
      return [];
    }
    if (!resp.ok) {
      const body = await resp.text().catch(() => '<no body>');
      throw new EarningsCalendarFetchError(
        ticker,
        resp.status,
        `non-OK response: ${body.slice(0, 200)}`,
      );
    }
    let parsed: PolygonEventsResponse;
    try {
      parsed = (await resp.json()) as PolygonEventsResponse;
    } catch (cause) {
      throw new EarningsCalendarFetchError(ticker, resp.status, 'parse failure', cause);
    }
    return parsed.results?.events ?? [];
  }
}