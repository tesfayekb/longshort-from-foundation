/**
 * compute-news-sentiment_test — FP-048 Phase 2 (Signal #8).
 *
 * Fixture-only (zero wall-clock, zero network). Pins:
 *   - decay constant @ 0h / 24h / 168h vs e^(0) / e^(-1) / e^(-7)
 *   - window boundary 7d-inclusive in / 7d+1h out
 *   - WWDC multi-ticker per-(article,ticker): AAPL neutral→0, GOOG +1×0.4×decay
 *   - multi-article mixed-sign exact sum
 *   - all-neutral coverage → value 0.0 (NOT skip) — FP-048 ruling (a)
 *   - only-PR-wire articles → no_articles_in_window — FP-048 ruling (b)
 *   - unmapped publisher contributes + surfaces in meta.unmappedPublisherCount
 *   - purity: same input twice → identical output (deep-equal + bit-equal raw)
 *   - malformed timestamp / unknown sentiment → never coerced
 */
import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyArticle,
  type ArticleClassification,
} from './news-filters.ts';
import {
  computeNewsSentiment,
  NEWS_DECAY_TAU_HOURS,
  NEWS_WINDOW_HOURS,
  type NewsArticleEntry,
  type NewsSentimentInputs,
} from './compute-news-sentiment.ts';

/** Deterministic anchor — Wed 2026-06-10 21:00:00 UTC (cron-fire wall-time). */
const AS_OF_MS = Date.UTC(2026, 5, 10, 21, 0, 0, 0);
const AS_OF = new Date(AS_OF_MS);
const MS_PER_HOUR = 3_600_000;

function entryAt(
  ageHours: number,
  classification: ArticleClassification,
): NewsArticleEntry {
  return {
    publishedAtMs: AS_OF_MS - ageHours * MS_PER_HOUR,
    classification,
  };
}

// ── §4.4.8 constants ──────────────────────────────────────────────────────

Deno.test('constants match §4.4.8 verbatim', () => {
  assertStrictEquals(NEWS_WINDOW_HOURS, 168); // 7 × 24
  assertStrictEquals(NEWS_DECAY_TAU_HOURS, 24);
});

// ── decay pins ────────────────────────────────────────────────────────────

Deno.test('decay @ 0h → 1.0 exact (sentiment×tier×1.0)', () => {
  const cls = classifyArticle({ publisherName: 'Reuters', sentimentCategory: 'positive' });
  const inputs: NewsSentimentInputs = { entries: [entryAt(0, cls)], asOf: AS_OF };
  const r = computeNewsSentiment(inputs);
  if (r.kind !== 'value') throw new Error(`expected value, got ${r.kind}`);
  // +1.0 × 1.0 × exp(0) = 1.0 exact
  assertStrictEquals(r.raw, 1.0);
  assertStrictEquals(r.meta.articleCount, 1);
  assertStrictEquals(r.meta.prExcludedCount, 0);
  assertStrictEquals(r.meta.unmappedPublisherCount, 0);
});

Deno.test('decay @ 24h → e^(-1) to 4dp (Benzinga tier 0.4)', () => {
  const cls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'positive' });
  const r = computeNewsSentiment({ entries: [entryAt(24, cls)], asOf: AS_OF });
  if (r.kind !== 'value') throw new Error('expected value');
  // +1.0 × 0.4 × e^(-1) = 0.4 × 0.36787944117 ≈ 0.14715
  assertAlmostEquals(r.raw, 0.4 * Math.exp(-1), 1e-4);
});

Deno.test('decay @ 168h (7d, in-window inclusive) → e^(-7) to 4dp', () => {
  const cls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'positive' });
  const r = computeNewsSentiment({ entries: [entryAt(168, cls)], asOf: AS_OF });
  if (r.kind !== 'value') throw new Error('expected value');
  // +1.0 × 0.4 × e^(-7) ≈ 0.4 × 9.1188e-4 ≈ 3.6475e-4
  assertAlmostEquals(r.raw, 0.4 * Math.exp(-7), 1e-4);
  assertStrictEquals(r.meta.articleCount, 1);
});

// ── window boundary ───────────────────────────────────────────────────────

Deno.test('window boundary — 168h (7d) inclusive IN, 169h OUT', () => {
  const cls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'positive' });
  const inAtEdge = computeNewsSentiment({ entries: [entryAt(168, cls)], asOf: AS_OF });
  assertStrictEquals(inAtEdge.kind, 'value');

  const outBeyond = computeNewsSentiment({ entries: [entryAt(169, cls)], asOf: AS_OF });
  if (outBeyond.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(outBeyond.reason, 'no_articles_in_window');
});

// ── per-(article,ticker) WWDC fixture ─────────────────────────────────────

Deno.test('WWDC fixture — same article, AAPL neutral→0 + GOOG positive→+1×0.4×decay', () => {
  // The orchestrator fans out by insight ticker; here we simulate the two
  // per-ticker computes that come out of a single Polygon article carrying
  // insights[{AAPL: neutral}, {GOOG: positive}] from publisher "Benzinga".
  const ageHours = 12;
  const aaplCls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'neutral' });
  const googCls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'positive' });

  const aapl = computeNewsSentiment({ entries: [entryAt(ageHours, aaplCls)], asOf: AS_OF });
  const goog = computeNewsSentiment({ entries: [entryAt(ageHours, googCls)], asOf: AS_OF });

  if (aapl.kind !== 'value' || goog.kind !== 'value') {
    throw new Error('both per-ticker computes must yield values');
  }
  // AAPL: 0.0 × 0.4 × decay = 0.0 (presence-yes, raw-zero per ruling (a))
  assertStrictEquals(aapl.raw, 0.0);
  assertStrictEquals(aapl.meta.articleCount, 1);
  // GOOG: +1.0 × 0.4 × exp(-12/24) = 0.4 × e^(-0.5)
  assertAlmostEquals(goog.raw, 0.4 * Math.exp(-0.5), 1e-6);
  assertStrictEquals(goog.meta.articleCount, 1);
});

// ── multi-article mixed-sign exact sum ────────────────────────────────────

Deno.test('multi-article mixed-sign sum is exact superposition', () => {
  const e1 = entryAt(0, classifyArticle({ publisherName: 'Reuters', sentimentCategory: 'positive' }));    // +1 × 1.0 × 1
  const e2 = entryAt(24, classifyArticle({ publisherName: 'CNBC', sentimentCategory: 'negative' }));      // -1 × 0.7 × e^(-1)
  const e3 = entryAt(48, classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'positive' }));  // +1 × 0.4 × e^(-2)
  const expected = 1.0 + (-1.0 * 0.7 * Math.exp(-1)) + (1.0 * 0.4 * Math.exp(-2));

  const r = computeNewsSentiment({ entries: [e1, e2, e3], asOf: AS_OF });
  if (r.kind !== 'value') throw new Error('expected value');
  assertAlmostEquals(r.raw, expected, 1e-12);
  assertStrictEquals(r.meta.articleCount, 3);
});

// ── ruling (a): all-neutral → value 0.0, NOT skip ─────────────────────────

Deno.test('all-neutral in-window coverage → value 0.0 (NOT skip per ruling (a))', () => {
  const cls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'neutral' });
  const entries: NewsArticleEntry[] = [
    entryAt(2, cls),
    entryAt(30, cls),
    entryAt(120, cls),
  ];
  const r = computeNewsSentiment({ entries, asOf: AS_OF });
  if (r.kind !== 'value') {
    throw new Error(`all-neutral must yield value, got skip: ${(r as { reason: string }).reason}`);
  }
  assertStrictEquals(r.raw, 0.0);
  assertStrictEquals(r.meta.articleCount, 3);
  assertStrictEquals(r.meta.prExcludedCount, 0);
});

Deno.test('all-mixed in-window coverage → value 0.0 (NOT skip; DEC-056 §(a))', () => {
  const cls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'mixed' });
  const r = computeNewsSentiment({ entries: [entryAt(5, cls), entryAt(50, cls)], asOf: AS_OF });
  if (r.kind !== 'value') throw new Error('mixed must yield value');
  assertStrictEquals(r.raw, 0.0);
  assertStrictEquals(r.meta.articleCount, 2);
});

// ── ruling (b): only PR-wire → no_articles_in_window ──────────────────────

Deno.test('only-PR-wire articles in window → no_articles_in_window (post-exclusion)', () => {
  const pr = classifyArticle({ publisherName: 'GlobeNewswire Inc.', sentimentCategory: 'positive' });
  const r = computeNewsSentiment({ entries: [entryAt(2, pr), entryAt(40, pr)], asOf: AS_OF });
  if (r.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(r.reason, 'no_articles_in_window');
  // Detail must mention PR-wire exclusion and the count.
  assert(r.detail.includes('PR-wire') || r.detail.includes('PR'));
  assert(r.detail.includes('2'));
});

Deno.test('PR-wire-only WITH out-of-window scorable → still no_articles_in_window', () => {
  const pr = classifyArticle({ publisherName: 'PR Newswire', sentimentCategory: 'positive' });
  const farPast = classifyArticle({ publisherName: 'Reuters', sentimentCategory: 'positive' });
  const r = computeNewsSentiment({
    entries: [entryAt(10, pr), entryAt(500, farPast)], // 500h ≫ 168h window
    asOf: AS_OF,
  });
  if (r.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(r.reason, 'no_articles_in_window');
});

// ── unmapped publisher meta ───────────────────────────────────────────────

Deno.test('unmapped publisher contributes + surfaces in meta.unmappedPublisherCount', () => {
  const unmapped = classifyArticle({
    publisherName: 'Some Obscure Tip Sheet',
    sentimentCategory: 'positive',
  });
  const mapped = classifyArticle({ publisherName: 'Reuters', sentimentCategory: 'positive' });
  const r = computeNewsSentiment({
    entries: [entryAt(0, unmapped), entryAt(0, mapped)],
    asOf: AS_OF,
  });
  if (r.kind !== 'value') throw new Error('expected value');
  // unmapped uses DEFAULT_TIER_WEIGHT (0.4); mapped Reuters tier-1 (1.0)
  assertAlmostEquals(r.raw, 0.4 + 1.0, 1e-12);
  assertStrictEquals(r.meta.articleCount, 2);
  assertStrictEquals(r.meta.unmappedPublisherCount, 1);
});

// ── ruling (d): malformed never coerced ───────────────────────────────────

Deno.test('non-finite timestamp counted as malformed, never coerced to 0', () => {
  const cls = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'positive' });
  const bad: NewsArticleEntry = { publishedAtMs: Number.NaN, classification: cls };
  // Only malformed → data_unavailable.
  const onlyBad = computeNewsSentiment({ entries: [bad], asOf: AS_OF });
  if (onlyBad.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(onlyBad.reason, 'data_unavailable');

  // Mixed with a valid one → value, malformed dropped silently from sum.
  const r = computeNewsSentiment({ entries: [bad, entryAt(0, cls)], asOf: AS_OF });
  if (r.kind !== 'value') throw new Error('expected value');
  assertStrictEquals(r.raw, 0.4); // single contribution from the good entry
  assertStrictEquals(r.meta.articleCount, 1);
});

Deno.test('unknown sentiment category counted as malformed (in-window), never coerced', () => {
  // classifyArticle with an unknown category yields sentimentScalar:null
  const unknown = classifyArticle({ publisherName: 'Benzinga', sentimentCategory: 'bullish-leaning' });
  const r = computeNewsSentiment({ entries: [entryAt(2, unknown)], asOf: AS_OF });
  if (r.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(r.reason, 'data_unavailable');
  assert(r.detail.includes('1'));
});

Deno.test('invalid asOf Date → data_unavailable skip', () => {
  const r = computeNewsSentiment({ entries: [], asOf: new Date(Number.NaN) });
  if (r.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(r.reason, 'data_unavailable');
});

Deno.test('empty entries → no_articles_in_window', () => {
  const r = computeNewsSentiment({ entries: [], asOf: AS_OF });
  if (r.kind !== 'skip') throw new Error('expected skip');
  assertStrictEquals(r.reason, 'no_articles_in_window');
});

// ── purity ────────────────────────────────────────────────────────────────

Deno.test('purity: same input twice → identical output (bit-equal raw)', () => {
  const cls1 = classifyArticle({ publisherName: 'Reuters', sentimentCategory: 'positive' });
  const cls2 = classifyArticle({ publisherName: 'CNBC', sentimentCategory: 'negative' });
  const inputs: NewsSentimentInputs = {
    entries: [entryAt(3, cls1), entryAt(72, cls2)],
    asOf: AS_OF,
  };
  const a = computeNewsSentiment(inputs);
  const b = computeNewsSentiment(inputs);
  assertEquals(a, b);
  if (a.kind === 'value' && b.kind === 'value') {
    assertStrictEquals(a.raw, b.raw); // bit-equal
  } else {
    throw new Error('both must be values');
  }
});