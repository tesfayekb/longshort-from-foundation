/**
 * News Sentiment Momentum (Signal #8) per CROSSWIND §4.4.8.
 *
 * Formula (spec-literal, copied verbatim from
 * `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:522`):
 *
 *   For each article A about name N in trailing 7 days:
 *     sentiment_A = provider_sentiment(A)        // -1 to +1
 *     source_weight(A) = 1.0 (tier-1: Reuters, Bloomberg, WSJ, FT, Dow Jones)
 *                        0.7 (tier-2: CNBC, Forbes, Barron's, NYT business)
 *                        0.4 (tier-3: Yahoo Finance, MarketWatch, aggregators)
 *                        0.1 (tier-4: blogs, regional, low-quality)
 *     age_weight(A) = exp(-age_in_hours / 24)
 *   raw_signal_N = sum(sentiment_A × source_weight(A) × age_weight(A))
 *
 * Per-(article,ticker) attribution per FP-048 Phase-0 evidence: one
 * article contributes INDEPENDENTLY to every ticker its `insights[]`
 * covers (e.g., the WWDC fixture is neutral→0 for AAPL and positive→+1
 * for GOOG simultaneously). The orchestrator (Phase 3) is responsible
 * for grouping `(article × insight)` pairs by ticker before invoking
 * this compute; this module is pure per-ticker.
 *
 * ─── Term bindings (per DEC-056 — the governing decision) ──────────────
 *
 * Inputs per scored article A: a Phase-1 `ArticleClassification` (from
 * `./news-filters.ts → classifyArticle`) plus the article's
 * `publishedAtMs`. This compute TRUSTS the frozen `SENTIMENT_MAP` and
 * `PUBLISHER_TIER_TABLE` constants — it does NOT re-map. The classifier
 * is the single source of truth for the categorical→numeric translation
 * and for PR-wire exclusion (DEC-056 §(e)).
 *
 *   sentiment_A   = classification.sentimentScalar
 *                   (already in {-1.0, 0.0, +1.0}; mixed/neutral → 0.0
 *                   per DEC-056 §(a) — the anti-phantom mapping).
 *   source_weight = classification.tierWeight
 *                   (in {1.0, 0.7, 0.4, 0.1} or DEFAULT_TIER_WEIGHT 0.4
 *                   for unmapped publishers; the unmapped count
 *                   surfaces in `meta.unmappedPublisherCount`).
 *   age_hours     = (asOfMs − publishedAtMs) / 3.6e6
 *   age_weight    = exp(-age_hours / 24)
 *                   (24-hour exponential decay; ZERO wall-clock — `asOf`
 *                   is injected; this module is Gate-2 / Gate-6 clean.)
 *
 * ─── Window boundary (stated rule; test-pinned) ────────────────────────
 *
 * In-window: `0 ≤ age_hours ≤ 168` (INCLUSIVE on both ends). An article
 * exactly 168.0 hours old is IN-window; 168.0 + ε (one extra hour) is
 * OUT. Future-dated rows (age_hours < 0) are silently dropped (the
 * fetcher already enforces the `published_utc ≤ as_of` look-ahead gate
 * vendor-side AND client-side; this is defence in depth).
 *
 * ─── Skip semantics (FP-048 Phase-2 rulings, verbatim) ─────────────────
 *
 * (a) Articles present → ALWAYS a value, including 0.0. All-neutral /
 *     all-mixed in-window coverage is GENUINE INFORMATION (the market
 *     produced news and the provider classified it as inert) — NOT a
 *     skip. Contrast PEAD's `zero_dispersion`: there the formula's
 *     denominator collapses; here the formula evaluates cleanly to 0.
 *     A fabricated skip-on-zero would discard a real observation.
 *
 * (b) PR-excluded articles do NOT count toward presence. A name whose
 *     ONLY in-window items are PR-wire (DEC-056 §(e)) → typed skip
 *     `no_articles_in_window` (post-exclusion emptiness). The PR-wire
 *     count is preserved in `meta.prExcludedCount` for observability.
 *
 * (c) Per-(article,ticker): handled at the input layer (orchestrator
 *     fans out by insight ticker); compute treats each entry as one
 *     contribution.
 *
 * (d) Malformed entries — non-finite `publishedAtMs` OR a classification
 *     with `sentimentScalar === null` (unknown sentiment category) —
 *     are NEVER coerced to 0. They are counted as malformed; the
 *     all-malformed in-window case → `data_unavailable` skip with the
 *     malformed count in `detail`.
 *
 * NO sentinel numerics. NO fabricated decay. NO wall-clock.
 *
 * Owner: longshort (FP-048 Phase 2 — Signal #8)
 * Classification: shared infrastructure — pure compute, no I/O, no clock.
 */
import type { ArticleClassification } from './news-filters.ts';
import type { SignalSkipReason } from '../shared/signal-types.ts';

/** §4.4.8: trailing window in CALENDAR hours (inclusive on both ends). */
export const NEWS_WINDOW_HOURS = 168; // 7 days × 24h

/** §4.4.8: exp(-age_hours / 24) — 24-hour decay constant. */
export const NEWS_DECAY_TAU_HOURS = 24;

const MS_PER_HOUR = 3_600_000;

/**
 * One classified entry — one (article, ticker) pairing. The orchestrator
 * builds these from `PolygonNewsRow.insights[]`: each insight ticker
 * becomes one entry with the article's `publishedAtMs` and the result
 * of `classifyArticle({publisherName, sentimentCategory: insight.sentiment})`.
 */
export interface NewsArticleEntry {
  /** Article publish timestamp as epoch ms. Non-finite → malformed. */
  publishedAtMs: number;
  /** Phase-1 classifyArticle output (excluded or scored). */
  classification: ArticleClassification;
}

export interface NewsSentimentInputs {
  /**
   * Per-(article,ticker) entries for THIS ticker. May include
   * PR-excluded entries (their presence is observed but not scored) and
   * out-of-window entries (silently dropped). The compute filters
   * internally; the orchestrator does NOT need to pre-filter.
   */
  entries: ReadonlyArray<NewsArticleEntry>;
  /** Injected as-of timestamp. ZERO wall-clock. */
  asOf: Date;
}

export type NewsSentimentSkipReason = Extract<
  SignalSkipReason,
  'no_articles_in_window' | 'data_unavailable'
>;

export interface NewsSentimentMeta {
  /** In-window non-PR-excluded entries with a numeric sentiment scalar. */
  articleCount: number;
  /** In-window entries excluded as PR-wire per DEC-056 §(e). */
  prExcludedCount: number;
  /** Subset of `articleCount` whose publisher fell back to DEFAULT_TIER_WEIGHT. */
  unmappedPublisherCount: number;
}

export type NewsSentimentComputeResult =
  | { kind: 'value'; raw: number; meta: NewsSentimentMeta }
  | { kind: 'skip'; reason: NewsSentimentSkipReason; detail: string };

/**
 * Pure compute. Same inputs → same outputs. No clock, no I/O, no random.
 */
export function computeNewsSentiment(
  i: NewsSentimentInputs,
): NewsSentimentComputeResult {
  const asOfMs = i.asOf.getTime();
  if (!Number.isFinite(asOfMs)) {
    return { kind: 'skip', reason: 'data_unavailable', detail: 'asOf is not a valid Date' };
  }
  const windowFloorMs = asOfMs - NEWS_WINDOW_HOURS * MS_PER_HOUR;

  let raw = 0;
  let articleCount = 0;
  let prExcludedCount = 0;
  let unmappedPublisherCount = 0;
  let malformedCount = 0;

  for (const e of i.entries) {
    // (d) malformed timestamp guard — never coerce
    if (typeof e.publishedAtMs !== 'number' || !Number.isFinite(e.publishedAtMs)) {
      malformedCount++;
      continue;
    }
    // Look-ahead defence: drop future-dated entries entirely.
    if (e.publishedAtMs > asOfMs) continue;
    // In-window: age_hours ∈ [0, 168] inclusive ⇔ publishedAtMs ≥ windowFloorMs.
    if (e.publishedAtMs < windowFloorMs) continue;

    if (e.classification.excluded) {
      // (b) PR-excluded — observed but NOT counted toward presence.
      prExcludedCount++;
      continue;
    }
    if (e.classification.sentimentScalar === null) {
      // (d) unknown sentiment category — never coerced to 0.
      malformedCount++;
      continue;
    }
    const sentiment = e.classification.sentimentScalar;
    const tierWeight = e.classification.tierWeight;
    const ageHours = (asOfMs - e.publishedAtMs) / MS_PER_HOUR;
    const decay = Math.exp(-ageHours / NEWS_DECAY_TAU_HOURS);
    raw += sentiment * tierWeight * decay;
    articleCount++;
    if (!e.classification.tierMapped) unmappedPublisherCount++;
  }

  // Post-exclusion emptiness branch — (b) ruling.
  if (articleCount === 0) {
    // Routing precedence:
    //   PR-excluded present → (b) post-exclusion emptiness; the PR-only or
    //     PR+malformed case is the SEMANTIC absence of scorable coverage.
    //   Else malformed-only → (d) data_unavailable (data-quality class).
    //   Else truly zero in-window → no_articles_in_window (genuine absence).
    if (prExcludedCount > 0) {
      const malformedSuffix = malformedCount > 0
        ? ` + ${malformedCount} malformed`
        : '';
      return {
        kind: 'skip',
        reason: 'no_articles_in_window',
        detail: `${prExcludedCount} in-window article(s) PR-wire excluded (DEC-056 §(e))${malformedSuffix}; zero scorable`,
      };
    }
    if (malformedCount > 0) {
      return {
        kind: 'skip',
        reason: 'data_unavailable',
        detail: `${malformedCount} malformed entries (non-finite timestamp or unknown sentiment category); none scorable`,
      };
    }
    return {
      kind: 'skip',
      reason: 'no_articles_in_window',
      detail: `0 classified articles inside trailing ${NEWS_WINDOW_HOURS}h window`,
    };
  }

  // (a) articles present → ALWAYS a value, including raw === 0.0.
  return {
    kind: 'value',
    raw,
    meta: { articleCount, prExcludedCount, unmappedPublisherCount },
  };
}