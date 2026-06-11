/**
 * news-filters — DEC-056 bindings (ratified 2026-06-11) for Signal #8
 * (`news_sentiment_7d`, CROSSWIND §4.4.8). FP-048 Phase 1.
 *
 * This module owns the three DEC-056 static tables and the per-article
 * classifier. Every constant here corresponds verbatim to a DEC-056 clause:
 *
 *   §(a) SENTIMENT_MAP — frozen categorical→numeric map
 *        { positive: +1.0, neutral: 0.0, negative: −1.0, mixed: 0.0 }
 *   §(c) PUBLISHER_TIER_TABLE — static publisher→tier weight lookup
 *        (tier-1/2 seeded for forward-compat per the §(k) honest-semantics
 *        rider; at our current entitlement only tier-3 weights activate)
 *   §(d) DEFAULT_TIER_WEIGHT — 0.4 fallback for unmapped publishers
 *        (Bayesian-prior choice; surfaces via news.unmapped_publisher_count)
 *   §(e) PRESS_RELEASE_DENY_SET — normalized wire-publisher exclusion list
 *
 * Normalization rule (§(c)/(e) verbatim):
 *   norm(s) = s.toLowerCase().replace(/[^a-z0-9]/g, "")
 *
 * `classifyArticle()` is the single per-article entry point that the
 * Phase-2 compute kernel will consume. It returns a typed discriminated
 * shape — never a sentinel scalar; missing data is `null`, exclusion is
 * an explicit `excluded:true` branch with a typed reason.
 *
 * Wall-clock: NONE. This module is pure data + pure functions; clock
 * injection happens at the orchestrator boundary (DEC-034 clause 4).
 *
 * Owner: longshort (FP-048 Phase 1 — Signal #8)
 * Classification: shared infrastructure — first Polygon-news consumer.
 */

/* ──────────────────────────────────────────────────────────────────────
 * §(a) — Sentiment map
 * Frozen object; consumers MUST treat as readonly. The "mixed" → 0.0
 * mapping is the conservative anti-phantom choice per DEC-056 §(a)
 * rationale (avoids fabricating a sign on ambiguous articles).
 * ────────────────────────────────────────────────────────────────────── */
export type SentimentCategory = 'positive' | 'neutral' | 'negative' | 'mixed';

export const SENTIMENT_MAP: Readonly<Record<SentimentCategory, number>> =
  Object.freeze({
    positive: 1.0,
    neutral: 0.0,
    negative: -1.0,
    mixed: 0.0,
  });

/**
 * Map a categorical string to its numeric sentiment scalar.
 * Returns `null` for any value not in the frozen map (the typed-absence
 * branch — never a sentinel; orchestrator counts via
 * `news.unmapped_sentiment_value_count` if non-zero).
 */
export function mapSentiment(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const v = raw.toLowerCase();
  if (v === 'positive' || v === 'neutral' || v === 'negative' || v === 'mixed') {
    return SENTIMENT_MAP[v as SentimentCategory];
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────────────
 * Normalization helper — §(c)/(e) verbatim rule.
 * ────────────────────────────────────────────────────────────────────── */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ──────────────────────────────────────────────────────────────────────
 * §(c) — Static publisher → tier-weight table.
 * Keys are pre-normalized via `norm()`. Tier weights match §4.4.8 verbatim:
 * tier-1 = 1.0, tier-2 = 0.7, tier-3 = 0.4, tier-4 = 0.1.
 * ────────────────────────────────────────────────────────────────────── */
export const PUBLISHER_TIER_TABLE: Readonly<Record<string, number>> =
  Object.freeze({
    // tier-1 (1.0) — seeded for forward-compat per §(k); not observed in v1 feed
    reuters: 1.0,
    bloomberg: 1.0,
    wsj: 1.0,
    wallstreetjournal: 1.0,
    ft: 1.0,
    financialtimes: 1.0,
    dowjones: 1.0,
    // tier-2 (0.7) — seeded for forward-compat
    cnbc: 0.7,
    forbes: 0.7,
    barrons: 0.7,
    nytimes: 0.7,
    washingtonpost: 0.7,
    // tier-3 (0.4) — current Polygon-entitlement pool
    benzinga: 0.4,
    investingcom: 0.4,
    themotleyfool: 0.4,
    fool: 0.4,
    yahoofinance: 0.4,
    marketwatch: 0.4,
    seekingalpha: 0.4,
    // tier-4 (0.1) — seeded empty per DEC-056 §(c); grown by Phase-7 evidence only
  });

/** §(d) — Unmapped-publisher fallback weight. */
export const DEFAULT_TIER_WEIGHT = 0.4;

export interface TierLookup {
  /** Tier weight in {1.0, 0.7, 0.4, 0.1} or DEFAULT_TIER_WEIGHT. */
  weight: number;
  /** false when norm(publisher) is absent from PUBLISHER_TIER_TABLE. */
  mapped: boolean;
  /** The normalized key used for the lookup (surfaces for observability). */
  normalizedKey: string;
}

export function lookupTierWeight(publisherName: string): TierLookup {
  const normalizedKey = norm(publisherName);
  const hit = PUBLISHER_TIER_TABLE[normalizedKey];
  if (typeof hit === 'number') {
    return { weight: hit, mapped: true, normalizedKey };
  }
  return { weight: DEFAULT_TIER_WEIGHT, mapped: false, normalizedKey };
}

/* ──────────────────────────────────────────────────────────────────────
 * §(e) — Press-release wire deny-list. Normalized via `norm()`.
 * ────────────────────────────────────────────────────────────────────── */
export const PRESS_RELEASE_DENY_SET: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    'globenewswire',
    'globenewswireinc',
    'prnewswire',
    'businesswire',
    'accesswire',
    'accessnewswire',
    'newsfilecorp',
    'marketwired',
    'einpresswire',
    'openpr',
  ]),
);

export function isPressReleaseWire(publisherName: string): boolean {
  return PRESS_RELEASE_DENY_SET.has(norm(publisherName));
}

/* ──────────────────────────────────────────────────────────────────────
 * Per-article classifier — the single entry point for Phase-2 compute.
 * Returns a discriminated union: either `excluded` (PR wire) or the
 * scored payload (tier weight + sentiment scalar + observability flags).
 * ────────────────────────────────────────────────────────────────────── */
export interface ArticleClassificationInput {
  publisherName: string;
  sentimentCategory: unknown;
}

export type ArticleClassification =
  | {
      excluded: true;
      reason: 'press_release';
      normalizedPublisher: string;
    }
  | {
      excluded: false;
      tierWeight: number;
      tierMapped: boolean;
      normalizedPublisher: string;
      sentimentScalar: number | null;
      sentimentCategory: SentimentCategory | null;
    };

export function classifyArticle(
  input: ArticleClassificationInput,
): ArticleClassification {
  const normalizedPublisher = norm(input.publisherName);

  if (PRESS_RELEASE_DENY_SET.has(normalizedPublisher)) {
    return {
      excluded: true,
      reason: 'press_release',
      normalizedPublisher,
    };
  }

  const tier = lookupTierWeight(input.publisherName);
  const sentimentScalar = mapSentiment(input.sentimentCategory);
  const sentimentCategory: SentimentCategory | null =
    typeof input.sentimentCategory === 'string' &&
    (input.sentimentCategory === 'positive' ||
      input.sentimentCategory === 'neutral' ||
      input.sentimentCategory === 'negative' ||
      input.sentimentCategory === 'mixed')
      ? input.sentimentCategory
      : null;

  return {
    excluded: false,
    tierWeight: tier.weight,
    tierMapped: tier.mapped,
    normalizedPublisher,
    sentimentScalar,
    sentimentCategory,
  };
}