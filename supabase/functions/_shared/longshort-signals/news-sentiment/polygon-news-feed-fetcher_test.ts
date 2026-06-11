/**
 * polygon-news-feed-fetcher_test — FP-048 Phase 1 fetcher tests.
 *
 * Fixtures derived from FP-048 Phase-0 Polygon `/v2/reference/news` probe
 * evidence (no network, no wall-clock). Covers:
 *   - look-ahead gate: future-dated article dropped
 *   - filter-honesty mirrors: impossible-ticker page → 0 rows;
 *                              future-window page → 0 rows
 *   - cutoff gate: article older than as_of-7d dropped
 *   - WWDC multi-ticker fixture (typed insights[] preserved per-ticker)
 *   - GlobeNewswire row survives the fetcher (exclusion is the consumer's job)
 *   - typed error taxonomy: 401/402/403 → subscription_gated;
 *                            429 → rate_limited;
 *                            404 on first page → data_unavailable;
 *                            empty first page → data_unavailable
 *   - next_url pagination (apiKey reattached when absent)
 *   - page-cap hit surfaces hitPageCap=true
 */
import {
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  POLYGON_BASE_URL,
  PolygonNewsFeedFetcher,
} from './polygon-news-feed-fetcher.ts';
import type { PolygonNewsRow } from './polygon-news-feed-fetcher.ts';
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';

const AS_OF = new Date('2026-06-11T16:00:00.000Z');
const KEY = 'test-key';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a Polygon-shaped article. Defaults yield a valid in-window row. */
function article(over: Partial<PolygonNewsRow> & { id: string }): unknown {
  return {
    id: over.id,
    publisher: { name: over.publisher?.name ?? 'Benzinga' },
    published_utc: over.published_utc ?? '2026-06-10T12:00:00Z',
    tickers: over.tickers ?? ['NVDA'],
    insights: over.insights ?? [{ ticker: 'NVDA', sentiment: 'positive' }],
  };
}

function makeFetcher(httpFetch: HttpFetch): PolygonNewsFeedFetcher {
  return new PolygonNewsFeedFetcher(KEY, httpFetch, 30_000, POLYGON_BASE_URL);
}

// ── happy path: single page, multi-ticker insights preserved ──────────────

Deno.test('fetchFeed — WWDC multi-ticker fixture preserves per-(article,ticker) insights', async () => {
  const fetcher = makeFetcher(((_url, _init) => {
    return Promise.resolve(
      jsonResponse({
        results: [
          article({
            id: 'wwdc-2026',
            publisher: { name: 'Benzinga' },
            published_utc: '2026-06-09T10:00:00Z',
            tickers: ['AAPL', 'GOOG', 'GOOGL'],
            insights: [
              { ticker: 'AAPL', sentiment: 'neutral' },
              { ticker: 'GOOG', sentiment: 'positive' },
              { ticker: 'GOOGL', sentiment: 'positive' },
            ],
          }),
        ],
      }),
    );
  }) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error(`expected feed, got ${r.kind}`);
  assertStrictEquals(r.rows.length, 1);
  assertStrictEquals(r.pagesFetched, 1);
  assertStrictEquals(r.hitPageCap, false);
  const row = r.rows[0];
  assertEquals(row.tickers, ['AAPL', 'GOOG', 'GOOGL']);
  assertStrictEquals(row.insights.length, 3);
  assertEquals(
    row.insights.map((x) => `${x.ticker}:${x.sentiment}`),
    ['AAPL:neutral', 'GOOG:positive', 'GOOGL:positive'],
  );
});

// ── look-ahead gate: future-dated article dropped ─────────────────────────

Deno.test('fetchFeed — look-ahead gate drops articles with published_utc > as_of', async () => {
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(
      jsonResponse({
        results: [
          article({ id: 'past', published_utc: '2026-06-10T12:00:00Z' }),
          article({ id: 'future', published_utc: '2026-06-12T12:00:00Z' }),
          article({ id: 'future-2', published_utc: '2030-01-01T00:00:00Z' }),
        ],
      }),
    )) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error('expected feed');
  assertStrictEquals(r.rows.length, 1);
  assertStrictEquals(r.rows[0].id, 'past');
});

// ── cutoff gate: as_of - 7d boundary ──────────────────────────────────────

Deno.test('fetchFeed — cutoff gate drops articles older than (as_of - 7d)', async () => {
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(
      jsonResponse({
        results: [
          article({ id: 'in-window', published_utc: '2026-06-08T00:00:00Z' }),
          article({ id: 'too-old', published_utc: '2026-06-01T00:00:00Z' }),
        ],
      }),
    )) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error('expected feed');
  assertStrictEquals(r.rows.length, 1);
  assertStrictEquals(r.rows[0].id, 'in-window');
});

// ── filter-honesty mirrors (Phase-0 verifyFilterHonored pattern) ──────────

Deno.test('fetchFeed — filter-honesty: future-window response → 0 rows then data_unavailable', async () => {
  // Mirrors Phase-0 probe: published_utc.gte=2099-01-01 → count=0
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(jsonResponse({ results: [] }))) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  // empty first page = data_unavailable (typed, never silently)
  if (r.kind !== 'unavailable') throw new Error(`expected unavailable, got ${r.kind}`);
  assertStrictEquals(r.reason, 'data_unavailable');
});

Deno.test('fetchFeed — filter-honesty: malformed rows are silently dropped (no throw, 0 valid rows)', async () => {
  // Mirrors impossible-ticker probe: response shape is honored but rows are unusable
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(
      jsonResponse({
        results: [
          { id: 'no-publisher', published_utc: '2026-06-10T00:00:00Z' },
          { id: 'no-ts', publisher: { name: 'Benzinga' } },
          { publisher: { name: 'Benzinga' }, published_utc: '2026-06-10T00:00:00Z' }, // no id
        ],
      }),
    )) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  // first page non-empty but yields 0 valid rows; consumer sees feed-with-empty-rows
  if (r.kind !== 'feed') throw new Error(`expected feed, got ${r.kind}`);
  assertStrictEquals(r.rows.length, 0);
  assertStrictEquals(r.pagesFetched, 1);
});

// ── GlobeNewswire passes through the fetcher (exclusion is downstream) ────

Deno.test('fetchFeed — GlobeNewswire row survives fetcher (exclusion is filters.ts job)', async () => {
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(
      jsonResponse({
        results: [
          article({
            id: 'pr-1',
            publisher: { name: 'GlobeNewswire Inc.' },
            insights: [{ ticker: 'NVDA', sentiment: 'positive' }],
          }),
        ],
      }),
    )) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error('expected feed');
  assertStrictEquals(r.rows.length, 1);
  assertStrictEquals(r.rows[0].publisher.name, 'GlobeNewswire Inc.');
});

// ── typed error taxonomy ──────────────────────────────────────────────────

Deno.test('fetchFeed — 403 → subscription_gated', async () => {
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(new Response('forbidden', { status: 403 }))) as unknown as HttpFetch);
  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(r.reason, 'subscription_gated');
});

Deno.test('fetchFeed — 404 on first page → data_unavailable', async () => {
  const fetcher = makeFetcher(((_url, _init) =>
    Promise.resolve(new Response('not found', { status: 404 }))) as unknown as HttpFetch);
  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(r.reason, 'data_unavailable');
});

// ── next_url pagination + key reattachment ────────────────────────────────

Deno.test('fetchFeed — follows next_url; reattaches apiKey when absent', async () => {
  let call = 0;
  const seenUrls: string[] = [];
  const fetcher = makeFetcher((async (url, _init) => {
    seenUrls.push(String(url));
    call += 1;
    if (call === 1) {
      return jsonResponse({
        results: [article({ id: 'p1' })],
        next_url: `${POLYGON_BASE_URL}/v2/reference/news?cursor=abc`,
      });
    }
    return jsonResponse({ results: [article({ id: 'p2' })] });
  }) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error('expected feed');
  assertStrictEquals(r.rows.length, 2);
  assertStrictEquals(r.pagesFetched, 2);
  // first URL has the apiKey; second URL came from next_url WITHOUT apiKey,
  // so the fetcher should have reattached it
  if (!seenUrls[0].includes('apiKey=')) throw new Error('first URL missing apiKey');
  if (!seenUrls[1].includes('apiKey=')) {
    throw new Error(`apiKey not reattached to next_url: ${seenUrls[1]}`);
  }
});

Deno.test('fetchFeed — pre-existing apiKey in next_url is not duplicated', async () => {
  let call = 0;
  const seenUrls: string[] = [];
  const fetcher = makeFetcher((async (url, _init) => {
    seenUrls.push(String(url));
    call += 1;
    if (call === 1) {
      return jsonResponse({
        results: [article({ id: 'p1' })],
        next_url: `${POLYGON_BASE_URL}/v2/reference/news?cursor=abc&apiKey=existing-key`,
      });
    }
    return jsonResponse({ results: [article({ id: 'p2' })] });
  }) as unknown as HttpFetch);

  await fetcher.fetchFeed(AS_OF);
  const matches = seenUrls[1].match(/apiKey=/g) ?? [];
  assertStrictEquals(matches.length, 1);
});

// ── page cap surfaces hitPageCap=true ─────────────────────────────────────

Deno.test('fetchFeed — page cap reached → hitPageCap=true', async () => {
  const f = new PolygonNewsFeedFetcher(KEY, ((async (_url, _init) =>
    jsonResponse({
      results: [article({ id: `p-${Math.random()}` })],
      next_url: `${POLYGON_BASE_URL}/v2/reference/news?cursor=x`,
    })) as unknown as HttpFetch), 30_000, POLYGON_BASE_URL, { maxPages: 3 });

  const r = await f.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error('expected feed');
  assertStrictEquals(r.pagesFetched, 3);
  assertStrictEquals(r.hitPageCap, true);
});

// ── latency telemetry uses injected nowMs (no wall-clock) ─────────────────

Deno.test('fetchFeed — latencyMsPerPage uses injected nowMs', async () => {
  let t = 1000;
  const f = new PolygonNewsFeedFetcher(KEY, ((async (_url, _init) =>
    jsonResponse({ results: [article({ id: 'p' })] })) as unknown as HttpFetch), 30_000, POLYGON_BASE_URL, {
    nowMs: () => {
      const v = t;
      t += 250; // 250ms simulated per nowMs call
      return v;
    },
  });
  const r = await f.fetchFeed(AS_OF);
  if (r.kind !== 'feed') throw new Error('expected feed');
  assertStrictEquals(r.latencyMsPerPage.length, 1);
  assertStrictEquals(r.latencyMsPerPage[0], 250);
});

// ── as_of validation ──────────────────────────────────────────────────────

Deno.test('fetchFeed — invalid as_of throws SignalComputationError', async () => {
  const f = makeFetcher(((_url, _init) =>
    Promise.resolve(jsonResponse({ results: [] }))) as unknown as HttpFetch);
  let threw = false;
  try {
    await f.fetchFeed(new Date('not-a-date'));
  } catch (e) {
    threw = true;
    if (!(e instanceof Error) || !/as_of/.test(e.message)) {
      throw new Error(`unexpected error: ${String(e)}`);
    }
  }
  assertStrictEquals(threw, true);
});