/**
 * news-filters_test — DEC-056 binding tests (FP-048 Phase 1).
 *
 * Tests are fixture-only (zero wall-clock, zero network). Fixtures derive
 * from the FP-048 Phase-0 probe evidence (Polygon `/v2/reference/news`):
 *   - WWDC multi-ticker article (AAPL→neutral, GOOG→positive)
 *   - GlobeNewswire PR-wire article (must be excluded)
 *   - An unmapped publisher (must fall back to 0.4 with mapped=false)
 *   - A "mixed" sentiment article (must map to 0.0, NOT skipped)
 */
import {
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyArticle,
  DEFAULT_TIER_WEIGHT,
  isPressReleaseWire,
  lookupTierWeight,
  mapSentiment,
  norm,
  PRESS_RELEASE_DENY_SET,
  PUBLISHER_TIER_TABLE,
  SENTIMENT_MAP,
} from './news-filters.ts';

// §(a) — categorical → numeric round-trip ----------------------------------

Deno.test('SENTIMENT_MAP — frozen constant matches DEC-056 §(a) verbatim', () => {
  assertStrictEquals(SENTIMENT_MAP.positive, 1.0);
  assertStrictEquals(SENTIMENT_MAP.neutral, 0.0);
  assertStrictEquals(SENTIMENT_MAP.negative, -1.0);
  assertStrictEquals(SENTIMENT_MAP.mixed, 0.0);
  // frozen — mutation throws in strict mode or silently no-ops
  assertEquals(Object.isFrozen(SENTIMENT_MAP), true);
});

Deno.test('mapSentiment — categorical strings map to scalars (case-insensitive)', () => {
  assertStrictEquals(mapSentiment('positive'), 1.0);
  assertStrictEquals(mapSentiment('Positive'), 1.0);
  assertStrictEquals(mapSentiment('NEGATIVE'), -1.0);
  assertStrictEquals(mapSentiment('neutral'), 0.0);
  assertStrictEquals(mapSentiment('mixed'), 0.0); // DEC-056 §(a) — NOT skipped
});

Deno.test('mapSentiment — unknown values typed-absent (null), not sentinel', () => {
  assertStrictEquals(mapSentiment('bullish'), null);
  assertStrictEquals(mapSentiment(''), null);
  assertStrictEquals(mapSentiment(null), null);
  assertStrictEquals(mapSentiment(undefined), null);
  assertStrictEquals(mapSentiment(0), null); // non-string
  assertStrictEquals(mapSentiment(1), null);
});

// §(c)/(d) — publisher tier lookup -----------------------------------------

Deno.test('norm — matches DEC-056 §(c)/(e) verbatim rule', () => {
  assertEquals(norm('GlobeNewswire Inc.'), 'globenewswireinc');
  assertEquals(norm('The Motley Fool'), 'themotleyfool');
  assertEquals(norm("Barron's"), 'barrons');
  assertEquals(norm('Investing.com'), 'investingcom');
  assertEquals(norm('  WSJ  '), 'wsj');
});

Deno.test('PUBLISHER_TIER_TABLE — frozen, contains tier-1/2/3 seed entries', () => {
  assertEquals(Object.isFrozen(PUBLISHER_TIER_TABLE), true);
  assertStrictEquals(PUBLISHER_TIER_TABLE.reuters, 1.0);
  assertStrictEquals(PUBLISHER_TIER_TABLE.cnbc, 0.7);
  assertStrictEquals(PUBLISHER_TIER_TABLE.benzinga, 0.4);
});

Deno.test('lookupTierWeight — mapped tier returns weight + mapped:true', () => {
  const r = lookupTierWeight('Benzinga');
  assertEquals(r, { weight: 0.4, mapped: true, normalizedKey: 'benzinga' });
  const r2 = lookupTierWeight('Bloomberg');
  assertStrictEquals(r2.weight, 1.0);
  assertStrictEquals(r2.mapped, true);
});

Deno.test('lookupTierWeight — unmapped publisher falls back to 0.4 with mapped:false', () => {
  const r = lookupTierWeight('Some Unknown Wire Service');
  assertEquals(r, {
    weight: DEFAULT_TIER_WEIGHT,
    mapped: false,
    normalizedKey: 'someunknownwireservice',
  });
  assertStrictEquals(DEFAULT_TIER_WEIGHT, 0.4); // §(d) verbatim
});

// §(e) — press-release deny-list -------------------------------------------

Deno.test('PRESS_RELEASE_DENY_SET — contains the documented wire services', () => {
  for (const k of [
    'globenewswire',
    'globenewswireinc',
    'prnewswire',
    'businesswire',
    'accesswire',
  ]) {
    assertEquals(PRESS_RELEASE_DENY_SET.has(k), true, `missing: ${k}`);
  }
});

Deno.test('isPressReleaseWire — GlobeNewswire (37 % of feed) excluded', () => {
  assertEquals(isPressReleaseWire('GlobeNewswire Inc.'), true);
  assertEquals(isPressReleaseWire('GLOBENEWSWIRE'), true);
  assertEquals(isPressReleaseWire('Globe Newswire'), true);
  assertEquals(isPressReleaseWire('PR Newswire'), true);
  assertEquals(isPressReleaseWire('Business Wire'), true);
});

Deno.test('isPressReleaseWire — non-PR publishers pass', () => {
  assertEquals(isPressReleaseWire('Benzinga'), false);
  assertEquals(isPressReleaseWire('The Motley Fool'), false);
  assertEquals(isPressReleaseWire('Investing.com'), false);
  assertEquals(isPressReleaseWire('CNBC'), false);
});

// classifyArticle — Phase-0 fixture round-trips ----------------------------

Deno.test('classifyArticle — WWDC multi-ticker fixture: per-(article,ticker) preserved', () => {
  // Same article, two tickers, two independent sentiments
  const aapl = classifyArticle({
    publisherName: 'Benzinga',
    sentimentCategory: 'neutral',
  });
  const goog = classifyArticle({
    publisherName: 'Benzinga',
    sentimentCategory: 'positive',
  });
  if (aapl.excluded || goog.excluded) {
    throw new Error('WWDC fixture must not be excluded');
  }
  assertStrictEquals(aapl.sentimentScalar, 0.0);
  assertStrictEquals(aapl.sentimentCategory, 'neutral');
  assertStrictEquals(goog.sentimentScalar, 1.0);
  assertStrictEquals(goog.sentimentCategory, 'positive');
  // tier weight is the same for both (publisher is constant per article)
  assertStrictEquals(aapl.tierWeight, 0.4);
  assertStrictEquals(goog.tierWeight, 0.4);
  assertStrictEquals(aapl.tierMapped, true);
});

Deno.test('classifyArticle — GlobeNewswire fixture: excluded with reason=press_release', () => {
  const r = classifyArticle({
    publisherName: 'GlobeNewswire Inc.',
    sentimentCategory: 'positive', // sentiment is IGNORED on exclusion
  });
  assertEquals(r, {
    excluded: true,
    reason: 'press_release',
    normalizedPublisher: 'globenewswireinc',
  });
});

Deno.test('classifyArticle — unmapped-publisher fixture: weight 0.4, mapped:false', () => {
  const r = classifyArticle({
    publisherName: 'Tiny Independent Newsroom',
    sentimentCategory: 'positive',
  });
  if (r.excluded) throw new Error('unmapped publisher must not be excluded');
  assertStrictEquals(r.tierWeight, 0.4);
  assertStrictEquals(r.tierMapped, false);
  assertStrictEquals(r.sentimentScalar, 1.0);
});

Deno.test('classifyArticle — mixed sentiment maps to 0.0 (NOT skipped, NOT sentinel)', () => {
  const r = classifyArticle({
    publisherName: 'Benzinga',
    sentimentCategory: 'mixed',
  });
  if (r.excluded) throw new Error('mixed must not be excluded');
  assertStrictEquals(r.sentimentScalar, 0.0);
  assertStrictEquals(r.sentimentCategory, 'mixed');
});

Deno.test('classifyArticle — unknown sentiment scalar is null, category null', () => {
  const r = classifyArticle({
    publisherName: 'Benzinga',
    sentimentCategory: 'bullish-leaning', // not in the 4-case map
  });
  if (r.excluded) throw new Error('unmapped sentiment must not exclude article');
  assertStrictEquals(r.sentimentScalar, null);
  assertStrictEquals(r.sentimentCategory, null);
});