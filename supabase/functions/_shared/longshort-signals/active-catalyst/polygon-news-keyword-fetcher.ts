/**
 * PolygonNewsKeywordFetcher — Signal #9 / FP-049 Phase 1 commit 1b
 * (revision per supervisor ruling 2026-06-12, ACT-174).
 *
 * Authority: DEC-057 §(b) keyword + verb-gate matching; §(d) look-ahead
 * gate (OCCURRED-ONLY); §(f) trailing-5-trading-day floor; §(j) frozen
 * CATALYST_KEYWORDS + CATALYST_VERB_GATE maps; §(h) cross-vendor dedup
 * (performed downstream by `classify-catalyst-event.ts`).
 *
 * ─── Architecture (supervisor-ruled Option B) ─────────────────────────
 * Consumes FP-048's `PolygonNewsFeedFetcher.fetchOnePage` directly via
 * composition: this fetcher constructs an inner FP-048 instance with
 * `{ lookbackDays: 10 }` (over-fetch a 10-calendar-day window so the
 * §4.4.9 5-TRADING-DAY floor is always inside the vendor-fetched range
 * even across double-holiday weeks — Thanksgiving + 4-day market closure,
 * Christmas+New-Year overlap. Bumped from 7 at Phase 1 footnote-fix:
 * worst-case 5-trading-day span = ~9 calendar days (e.g., trading-week
 * with two early-close holidays), 7 left zero margin and risked truncating
 * the 5th trading day; 10 restores +1 day safety). The §(f) trading-day
 * floor is then applied CLIENT-SIDE here via `applyWindowLowerBound` —
 * the calendar-vs-trading-day discrepancy is resolved at this layer, NOT
 * deferred to Phase 2.
 *
 * Title/description availability: FP-048 was widened additively in the
 * same commit (PolygonNewsRow gained optional `title` + `description`;
 * the wire normalizer populates them only when the vendor row carries
 * them; absence is `undefined`, not a sentinel). Every existing FP-048
 * Phase-1 test passes UNMODIFIED — that suite is the byte-equivalence
 * fence (FP-048 Phase 3b precedent).
 *
 * Multi-ticker fan-out: Polygon news rows carry `tickers: string[]`.
 * On a positive keyword+verb match, this fetcher emits ONE
 * `RawCatalystEventInput` per ticker; downstream `classifyCatalystEvents`
 * (§(h) 1h-bucket dedup) collapses cross-vendor duplicates.
 *
 * Source provenance: every emitted row carries `source: 'keyword'` +
 * `meta.keyword_misclassification_risk: true` per DEC-057 §(b) — the
 * named v1 misclassification flag that Phase-7 IC ablation arbitrates.
 *
 * NO wall-clock; NO sentinel numerics; typed-absence only.
 *
 * Owner: longshort (FP-049 Phase 1 commit 1b — Signal #9)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../../longshort-universe/shared/fetch-with-timeout.ts';
import {
  POLYGON_BASE_URL,
  PolygonNewsFeedFetcher,
  type PolygonNewsRow,
} from '../news-sentiment/polygon-news-feed-fetcher.ts';
import {
  applyLookAheadGate,
  applyWindowLowerBound,
  type CatalystFetchResult,
  type CatalystFetchWindow,
  type RawCatalystEventInput,
} from './catalyst-types.ts';
import { matchKeywordEvent } from './classify-catalyst-event.ts';

export const POLYGON_NEWS_KEYWORD_OPERATION_ID = 'polygon_news_keyword';

/**
 * §(f) — over-fetch a 10-calendar-day window so the 5-TRADING-DAY floor
 * is ALWAYS inside the vendor range, including double-holiday weeks
 * (Thanksgiving-week and Christmas+New-Year overlaps push the 5-trading-
 * day span out to ~9 calendar days; +1 day margin keeps the 5th trading
 * day strictly inside the fetched window). Bumped from 7 at the FP-049
 * Phase 1 footnote-fix — the 7-day under-fetch eliminated. The
 * `applyWindowLowerBound` call below trims to `window.window_start_at`,
 * which the orchestrator computes from the trading-calendar. Floor logic
 * unchanged — only the over-fetch ceiling moved.
 */
export const POLYGON_NEWS_KEYWORD_LOOKBACK_DAYS = 10;

export interface PolygonNewsKeywordOptions {
  /** Forwarded to the inner FP-048 fetcher (default 200 — FP-048 default). */
  maxPages?: number;
  /** Forwarded to the inner FP-048 fetcher (default 1000 — FP-048 default). */
  pageLimit?: number;
}

export class PolygonNewsKeywordFetcher {
  private readonly inner: PolygonNewsFeedFetcher;

  constructor(
    apiKey: string,
    httpFetch: HttpFetch = fetch as HttpFetch,
    timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
    baseUrl: string = POLYGON_BASE_URL,
    options: PolygonNewsKeywordOptions = {},
  ) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error(
        'PolygonNewsKeywordFetcher: apiKey is required (POLYGON_API_KEY secret missing).',
      );
    }
    this.inner = new PolygonNewsFeedFetcher(apiKey, httpFetch, timeoutMs, baseUrl, {
      lookbackDays: POLYGON_NEWS_KEYWORD_LOOKBACK_DAYS,
      maxPages: options.maxPages,
      pageLimit: options.pageLimit,
    });
  }

  async fetch(window: CatalystFetchWindow): Promise<CatalystFetchResult> {
    const candidates: RawCatalystEventInput[] = [];
    let cursorToken: string | null = null;
    let firstPage = true;
    // INC-75 fix: count gate-drop volume + scanned articles at the
    // FETCHER stage (this is where pre-gate text exists). The classifier
    // never sees these rows downstream — without these counters the
    // meta surface structurally reads 0 for keyword-derived noise.
    let verb_gate_drops = 0;
    let numeric_gate_drops = 0;
    let articles_scanned = 0;

    // Walk the FP-048 cursor surface. Unavailable on the first page is
    // a typed catalyst-fetch unavailability; mid-walk unavailability is
    // propagated identically (matches FP-048 `fetchFeed` semantics —
    // rate_limited mid-walk is a real signal, not silently swallowed).
    for (;;) {
      const outcome = await this.inner.fetchOnePage({
        cursorToken,
        asOf: window.as_of,
      });
      if (outcome.kind === 'unavailable') {
        if (firstPage) {
          return { kind: 'unavailable', reason: outcome.reason };
        }
        return { kind: 'unavailable', reason: outcome.reason };
      }
      firstPage = false;
      if (outcome.kind === 'end') break;

      for (const r of outcome.rows) {
        const text = composeText(r);
        if (text.length === 0) continue;
        articles_scanned += 1;
        const m = matchKeywordEvent(text);
        if (m.family === null) {
          if (m.drop_reason === 'verb_gate') verb_gate_drops += 1;
          else if (m.drop_reason === 'numeric_gate') numeric_gate_drops += 1;
          continue;
        }
        // Multi-ticker fan-out — one event per attributed ticker.
        for (const ticker of r.tickers) {
          if (typeof ticker !== 'string' || ticker.length === 0) continue;
          candidates.push({
            ticker,
            event_type: m.family,
            event_at: r.published_utc,
            source: 'keyword',
            vendor: 'polygon',
            meta: {
              keyword_family: m.family,
              keyword_misclassification_risk: true,
              article_id: r.id,
            },
          });
        }
      }

      cursorToken = outcome.nextToken;
      if (cursorToken === null) break;
    }

    // §(d) look-ahead gate (defence-in-depth — inner fetchOnePage already
    // applies it; recount here so the catalyst-fetcher counter is honest).
    const gated = applyLookAheadGate(candidates, window.as_of);
    // §(f) trading-day floor — the calendar/trading discrepancy resolves HERE.
    const rows = applyWindowLowerBound(gated.rows, window.window_start_at);
    return {
      kind: 'events',
      rows,
      future_event_excluded: gated.future_event_excluded,
      verb_gate_drops,
      numeric_gate_drops,
      articles_scanned,
    };
  }
}

/**
 * Concatenate `title` + `description` into the classifier's `text` input.
 * Both fields are optional on `PolygonNewsRow` (FP-048 widened additively
 * per ACT-174). Empty-string when neither is present — the caller drops
 * such rows without ever matching.
 */
function composeText(r: PolygonNewsRow): string {
  const t = typeof r.title === 'string' ? r.title : '';
  const d = typeof r.description === 'string' ? r.description : '';
  return `${t} ${d}`.trim();
}