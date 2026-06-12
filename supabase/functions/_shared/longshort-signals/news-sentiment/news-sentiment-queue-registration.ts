/**
 * News-sentiment queue-worker registration (FP-048 Phase 3b — Signal #8
 * consumer; first SEQUENTIAL-FEED consumer on the FP-045 engine).
 *
 * Side-effect import: importing this module registers Signal #8 into
 * `productionQueueRegistry`. The four queue edge handlers (init,
 * init-manual, slice, sweeper) all import the shared
 * `production-registrations.ts` aggregator (which in turn imports this
 * file) so registration happens exactly once per isolate boot.
 *
 * ─── Mode discipline — sequential-feed (FP-048 Phase 3a engine union) ──
 *
 * `mode: 'sequential-feed'` because Signal #8's work unit is a
 * vendor-paginated GLOBAL feed (Polygon `/v2/reference/news`), NOT a
 * pre-seedable per-ticker enumeration. The engine drains pages across
 * many slice ticks; the finalizer aggregates `signal_queue_feed_items`
 * rows by universe ticker via `computeFromItems`.
 *
 * Architecture provenance (DEC-056 cap-provenance addendum, operator
 * ratification 2026-06-11): Polygon `/v2/reference/news` rate cap reads
 * "unlimited" per the operator dashboard → SELF-IMPOSED engineering cap
 * of 10 req/s, recorded as such (anti-phantom: "unlimited" is not a
 * pacing parameter). Phase-0 evidence pinned 35–70 pages × 6.3 s/page
 * sequential = 220–441 s → single-invocation disqualified by the
 * 120 s STOP gate and 150 s HTTP wall; the queue-engine sequential-feed
 * variant is the ratified architecture (Option 1 in the Phase-3 fork).
 *
 * ─── Pre-flight arithmetic row (both-bounds discipline per Catalog #39) ─
 *
 *   pagesPerSlice            = 15
 *   OBSERVED_PAGE_LATENCY_S  = 6.3       (FP-048 Phase-0 row 17 — global
 *                                          1000-item probe, single page)
 *   → latency-bound per slice = 15 × 6.3 = 94.5 s
 *     vs the 120 s STOP gate ≈ 25.5 s headroom — SAFE.
 *     vs the 150 s HTTP wall ≈ 55.5 s headroom — SAFE.
 *
 *   ratePerSec               = 10 × 0.85 = 8.5 rps
 *                              (self-imposed 10 rps cap × 0.85 safety,
 *                              matches the FP-045 PEAD/options convention)
 *   → rate-bound per slice    = 15 pages / 8.5 rps ≈ 1.76 s
 *     The rate-bound is TRIVIALLY non-binding at this entitlement; the
 *     latency bound is the binding number (acknowledged here so the
 *     arithmetic row in the module doc is not silently lopsided).
 *
 *   maxPages                 = 100   (runaway guard; Phase-0 evidence
 *                                     said 35–70 pages observed → 100
 *                                     leaves ~1.4× headroom over the
 *                                     observed max before the engine
 *                                     fails the run with reason
 *                                     `max_pages_exceeded`).
 *
 * Full-run estimate (35–70 pages observed, 15 pages/slice, slice cron
 * every minute): ⌈70/15⌉ = 5 slices → ≈ 5 min worst-case drain;
 * optimistic ⌈35/15⌉ = 3 slices → ≈ 3 min. Both fit the
 * truth-in-telemetry cadence `"daily (after-close; queue-drained
 * ~3-6 min …)"` registered alongside.
 *
 * ─── Processed-count semantics (named per operator directive) ──────────
 *
 * In feed mode:
 *   - `signal_queue_runs.feed_pages_fetched` is the DRAIN counter — the
 *     number of vendor pages successfully fetched across all slices
 *     for this run. Stamped at finalize against the runaway guard.
 *   - `signal_compute_log.persisted_count` is the FINAL ticker count —
 *     number of universe names with a non-skip value. Stamped by the
 *     finalizer after `computeFromItems` per ticker. NEVER pages.
 *   - `meta.unmappedPublisherCount` per ticker is NOT recoverable from
 *     `signal_queue_feed_items` alone (the table stores `tier_weight`
 *     but not `tier_mapped`; at the current entitlement tier-3 = 0.4
 *     collides with DEFAULT_TIER_WEIGHT = 0.4). This is an explicit
 *     v1 limitation documented in `docs/04-modules/longshort/signals/
 *     news-sentiment.md`; the wrapper passes `tierMapped: true` to the
 *     compute, which preserves the `raw` value exactly and only loses
 *     the per-name observability count (the aggregate is recoverable
 *     from `signal_queue_feed_items` post-hoc if needed).
 *
 * ─── Heartbeat / staging-TTL sizing ───────────────────────────────────
 *
 * `heartbeatTimeoutSec = 600` — 10 minutes. A feed slice finishes in
 * ≤94.5 s under nominal pacing; a 600 s ceiling tolerates a 6× slowdown
 * (vendor 429-storm burning through every retry) before the sweeper
 * preempts. `stagingTtlSec = 86400` — 24 hours, parity with PEAD /
 * options-flow; the sweeper also prunes `signal_queue_feed_items` on
 * terminal-run cleanup per the Phase-3a sweeper TTL extension.
 *
 * Owner: longshort (FP-048 — Phase 3b / Signal #8 consumer).
 */

import {
  productionQueueRegistry,
  type FeedItemRecord,
  type FeedPageResult,
  type TickerComputeResult,
} from '../shared/queue-worker/queue-config.ts';
import {
  PolygonNewsFeedFetcher,
  type NewsFeedPageOutcome,
} from './polygon-news-feed-fetcher.ts';
import {
  classifyArticle,
  mapSentiment,
} from './news-filters.ts';
import {
  computeNewsSentiment,
  type NewsArticleEntry,
} from './compute-news-sentiment.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

/** Stable signal id — matches `signal_observations.signal_id` and DEC-056. */
export const NEWS_SIGNAL_ID = 'news_sentiment_7d';

/** `job_registry.id` for the init cron. Follows the longshort.<name>.compute family. */
export const NEWS_QUEUE_JOB_ID = 'longshort.news.compute';

/**
 * Phase-0 observed per-page latency (FP-048 Phase-0 row 17 — global
 * 1000-item probe, 6.3 s wall). Hard-coded here so the structural
 * arithmetic test (`news-sentiment-queue-registration_test.ts`) can
 * derive the slice latency mechanically and surface drift as a typed
 * assertion failure rather than a hand-edited number going stale.
 */
export const OBSERVED_PAGE_LATENCY_S = 6.3;

/** Self-imposed engineering rate cap per DEC-056 cap-provenance addendum. */
export const SELF_IMPOSED_RATE_CAP_RPS = 10;

/** Safety multiplier shared with PEAD/options-flow per FP-045 convention. */
export const RATE_SAFETY_MULTIPLIER = 0.85;

export const NEWS_QUEUE_CONFIG = {
  signalId: NEWS_SIGNAL_ID,
  jobId: NEWS_QUEUE_JOB_ID,
  ratePerSec: SELF_IMPOSED_RATE_CAP_RPS * RATE_SAFETY_MULTIPLIER, // 8.5
  heartbeatTimeoutSec: 600,
  stagingTtlSec: 86_400,
  mode: 'sequential-feed' as const,
  pagesPerSlice: 15,
  maxPages: 100,
} as const;

/**
 * Idempotent registration — guarded so duplicate side-effect imports
 * (e.g. two handlers re-importing the aggregator) no-op cleanly.
 * The fetcher is constructed lazily from `Deno.env.get('POLYGON_API_KEY')`
 * at first slice invocation; import-time has no env dependency (keeps the
 * registry constructable in unit tests where the secret is unset).
 */
export function registerNewsSentimentQueueConsumer(): void {
  if (productionQueueRegistry.has(NEWS_SIGNAL_ID)) return;

  let fetcherSingleton: PolygonNewsFeedFetcher | null = null;
  const getFetcher = (): PolygonNewsFeedFetcher => {
    if (fetcherSingleton !== null) return fetcherSingleton;
    const key = Deno.env.get('POLYGON_API_KEY');
    if (!key) {
      throw new SignalComputationError(
        'news_sentiment_queue_consumer',
        '__feed__',
        'POLYGON_API_KEY is unset — required by the news-sentiment fetcher',
      );
    }
    fetcherSingleton = new PolygonNewsFeedFetcher(key);
    return fetcherSingleton;
  };

  productionQueueRegistry.register({
    signalId: NEWS_QUEUE_CONFIG.signalId,
    jobId: NEWS_QUEUE_CONFIG.jobId,
    ratePerSec: NEWS_QUEUE_CONFIG.ratePerSec,
    heartbeatTimeoutSec: NEWS_QUEUE_CONFIG.heartbeatTimeoutSec,
    stagingTtlSec: NEWS_QUEUE_CONFIG.stagingTtlSec,
    mode: NEWS_QUEUE_CONFIG.mode,
    pagesPerSlice: NEWS_QUEUE_CONFIG.pagesPerSlice,
    maxPages: NEWS_QUEUE_CONFIG.maxPages,
    fetchPage: async ({ cursorToken, asOf }): Promise<FeedPageResult> => {
      const outcome: NewsFeedPageOutcome = await getFetcher().fetchOnePage({
        cursorToken,
        asOf,
      });
      if (outcome.kind === 'unavailable') {
        // The engine has no `unavailable` discriminator on FeedPageResult;
        // throw a typed SignalComputationError so the slice-worker records
        // a fail-loud `fetch_error` rather than silently appearing as
        // "feed exhausted" via nextToken=null.
        throw new SignalComputationError(
          'news_sentiment_fetch_page',
          '__feed__',
          `news feed unavailable: ${outcome.reason}`,
        );
      }
      if (outcome.kind === 'end') {
        // Mid-walk exhaustion (vendor signaled "no more pages"). Drain
        // is clean — return zero items and a null cursor so the engine
        // finalizes the run normally.
        return { items: [], nextToken: null };
      }
      // outcome.kind === 'page' — classify each row's per-(article,ticker)
      // insight into a feed_items row. The classify call is per-INSIGHT
      // (not per-article) because per-(article,ticker) sentiment is what
      // DEC-056 §(b) preserves; tier_weight + PR-exclusion are per-article
      // (one publisher per article) but evaluated alongside each insight.
      const items: FeedItemRecord[] = [];
      for (const row of outcome.rows) {
        for (const insight of row.insights) {
          const cls = classifyArticle({
            publisherName: row.publisher.name,
            sentimentCategory: insight.sentiment,
          });
          if (cls.excluded) continue; // DEC-056 §(e) PR-wire — drop pre-stage.
          const sentimentNum = mapSentiment(insight.sentiment);
          if (sentimentNum === null) continue; // unknown sentiment — drop pre-stage.
          items.push({
            articleId: row.id,
            ticker: insight.ticker,
            sentimentNum,
            tierWeight: cls.tierWeight,
            publishedUtc: row.published_utc,
          });
        }
      }
      return { items, nextToken: outcome.nextToken };
    },
    computeFromItems: ({ items, asOf }): TickerComputeResult => {
      // Reconstruct NewsArticleEntry[] from the feed_items shape. The
      // computeNewsSentiment kernel handles zero-item names via its
      // typed `no_articles_in_window` skip — the mass-balance ruling
      // 839 (every universe name accounted for: value OR typed skip)
      // is the consumer's contract, not the engine's.
      const entries: NewsArticleEntry[] = items.map((it) => ({
        publishedAtMs: Date.parse(it.publishedUtc),
        classification: {
          excluded: false,
          tierWeight: it.tierWeight,
          // tierMapped is NOT recoverable from feed_items alone (see the
          // module-header `unmappedPublisherCount` note). Passing `true`
          // preserves raw exactly; the only loss is the per-name
          // observability count.
          tierMapped: true,
          normalizedPublisher: '',
          sentimentScalar: it.sentimentNum,
          sentimentCategory: null,
        },
      }));
      return computeNewsSentiment({ entries, asOf });
    },
  });
}