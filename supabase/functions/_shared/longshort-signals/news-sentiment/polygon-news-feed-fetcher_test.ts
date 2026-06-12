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
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) => {
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
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
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
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
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
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(jsonResponse({ results: [] }))) as unknown as HttpFetch);

  const r = await fetcher.fetchFeed(AS_OF);
  // empty first page = data_unavailable (typed, never silently)
  if (r.kind !== 'unavailable') throw new Error(`expected unavailable, got ${r.kind}`);
  assertStrictEquals(r.reason, 'data_unavailable');
});

Deno.test('fetchFeed — filter-honesty: malformed rows are silently dropped (no throw, 0 valid rows)', async () => {
  // Mirrors impossible-ticker probe: response shape is honored but rows are unusable
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
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
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
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
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(new Response('forbidden', { status: 403 }))) as unknown as HttpFetch);
  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(r.reason, 'subscription_gated');
});

Deno.test('fetchFeed — 404 on first page → data_unavailable', async () => {
  const fetcher = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(new Response('not found', { status: 404 }))) as unknown as HttpFetch);
  const r = await fetcher.fetchFeed(AS_OF);
  if (r.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(r.reason, 'data_unavailable');
});

// ── next_url pagination + key reattachment ────────────────────────────────

Deno.test('fetchFeed — follows next_url; reattaches apiKey when absent', async () => {
  let call = 0;
  const seenUrls: string[] = [];
  const fetcher = makeFetcher((async (url: string | URL, _init?: RequestInit) => {
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
  const fetcher = makeFetcher((async (url: string | URL, _init?: RequestInit) => {
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
  const f = new PolygonNewsFeedFetcher(KEY, ((async (_url: string | URL, _init?: RequestInit) =>
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
  const f = new PolygonNewsFeedFetcher(KEY, ((async (_url: string | URL, _init?: RequestInit) =>
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
  const f = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
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

// ────────────────────────────────────────────────────────────────────────
// FP-048 Phase 3b — fetchOnePage additive-surface tests.
// Byte-equivalence with fetchFeed is proven by the 13 tests above passing
// UNMODIFIED; the suite below exercises the per-page primitive directly so
// the sequential-feed engine wrapper has a regression fence on each
// behavioral facet the wrapper depends on.
// ────────────────────────────────────────────────────────────────────────

Deno.test('fetchOnePage — token threading across two calls (raw next_url out → cursorToken in)', async () => {
  const seenUrls: string[] = [];
  const f = makeFetcher((async (url: string | URL, _init?: RequestInit) => {
    seenUrls.push(String(url));
    if (seenUrls.length === 1) {
      return jsonResponse({
        results: [article({ id: 'a1' })],
        next_url: `${POLYGON_BASE_URL}/v2/reference/news?cursor=zzz`,
      });
    }
    return jsonResponse({ results: [article({ id: 'a2' })] });
  }) as unknown as HttpFetch);

  const p1 = await f.fetchOnePage({ cursorToken: null, asOf: AS_OF });
  if (p1.kind !== 'page') throw new Error(`expected page, got ${p1.kind}`);
  assertStrictEquals(p1.rows.length, 1);
  if (p1.nextToken === null) throw new Error('expected non-null nextToken');
  // Raw vendor next_url (NOT yet apiKey-attached) is what's returned.
  assertStrictEquals(p1.nextToken, `${POLYGON_BASE_URL}/v2/reference/news?cursor=zzz`);

  const p2 = await f.fetchOnePage({ cursorToken: p1.nextToken, asOf: AS_OF });
  if (p2.kind !== 'page') throw new Error(`expected page, got ${p2.kind}`);
  assertStrictEquals(p2.rows.length, 1);
  assertStrictEquals(p2.nextToken, null);

  // First call URL had apiKey; second URL had apiKey reattached by the fetcher.
  if (!seenUrls[0].includes('apiKey=')) throw new Error('first URL missing apiKey');
  if (!seenUrls[1].includes('apiKey=')) throw new Error('apiKey not reattached on second call');
});

Deno.test('fetchOnePage — per-page look-ahead gate drops future-dated rows on cursor-threaded page', async () => {
  const f = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(
      jsonResponse({
        results: [
          article({ id: 'past', published_utc: '2026-06-10T12:00:00Z' }),
          article({ id: 'future', published_utc: '2026-06-12T12:00:00Z' }),
        ],
      }),
    )) as unknown as HttpFetch);

  // Cursor-threaded page (not page 0) — the gate must still apply.
  const r = await f.fetchOnePage({
    cursorToken: `${POLYGON_BASE_URL}/v2/reference/news?cursor=mid`,
    asOf: AS_OF,
  });
  if (r.kind !== 'page') throw new Error(`expected page, got ${r.kind}`);
  assertStrictEquals(r.rows.length, 1);
  assertStrictEquals(r.rows[0].id, 'past');
});

Deno.test('fetchOnePage — per-page cutoff gate drops out-of-window rows on cursor-threaded page', async () => {
  const f = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(
      jsonResponse({
        results: [
          article({ id: 'fresh', published_utc: '2026-06-10T00:00:00Z' }),
          article({ id: 'stale', published_utc: '2026-06-01T00:00:00Z' }),
        ],
      }),
    )) as unknown as HttpFetch);

  const r = await f.fetchOnePage({
    cursorToken: `${POLYGON_BASE_URL}/v2/reference/news?cursor=mid`,
    asOf: AS_OF,
  });
  if (r.kind !== 'page') throw new Error('expected page');
  assertStrictEquals(r.rows.length, 1);
  assertStrictEquals(r.rows[0].id, 'fresh');
});

Deno.test('fetchOnePage — error taxonomy: first-page 401 → unavailable subscription_gated', async () => {
  const f = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(new Response('no', { status: 401 }))) as unknown as HttpFetch);
  const r = await f.fetchOnePage({ cursorToken: null, asOf: AS_OF });
  if (r.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(r.reason, 'subscription_gated');
});

Deno.test('fetchOnePage — error taxonomy: 429 → unavailable rate_limited', async () => {
  const f = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(new Response('slow down', { status: 429 }))) as unknown as HttpFetch);
  const r = await f.fetchOnePage({ cursorToken: null, asOf: AS_OF });
  if (r.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(r.reason, 'rate_limited');
});

Deno.test('fetchOnePage — error taxonomy: first-page 404 → unavailable data_unavailable; cursor-threaded 404 → end', async () => {
  const f404 = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(new Response('nope', { status: 404 }))) as unknown as HttpFetch);

  const first = await f404.fetchOnePage({ cursorToken: null, asOf: AS_OF });
  if (first.kind !== 'unavailable') throw new Error('expected unavailable');
  assertStrictEquals(first.reason, 'data_unavailable');

  const mid = await f404.fetchOnePage({
    cursorToken: `${POLYGON_BASE_URL}/v2/reference/news?cursor=mid`,
    asOf: AS_OF,
  });
  assertStrictEquals(mid.kind, 'end');
});

Deno.test('fetchOnePage — error taxonomy: first-page empty results → unavailable; cursor-threaded empty → end', async () => {
  const fEmpty = makeFetcher(((_url: string | URL, _init?: RequestInit) =>
    Promise.resolve(jsonResponse({ results: [] }))) as unknown as HttpFetch);

  const first = await fEmpty.fetchOnePage({ cursorToken: null, asOf: AS_OF });
  if (first.kind !== 'unavailable') throw new Error('expected unavailable on first page empty');
  assertStrictEquals(first.reason, 'data_unavailable');

  const mid = await fEmpty.fetchOnePage({
    cursorToken: `${POLYGON_BASE_URL}/v2/reference/news?cursor=mid`,
    asOf: AS_OF,
  });
  assertStrictEquals(mid.kind, 'end');
});

Deno.test('fetchOnePage — key masking: thrown SignalComputationError on non-ok status never leaks apiKey', async () => {
  const f = new PolygonNewsFeedFetcher(
    'SECRET-LIVE-KEY-DO-NOT-LEAK',
    ((_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(new Response('boom', { status: 502 }))) as unknown as HttpFetch,
    30_000,
    POLYGON_BASE_URL,
  );
  let caught: unknown = null;
  try {
    await f.fetchOnePage({ cursorToken: null, asOf: AS_OF });
  } catch (e) {
    caught = e;
  }
  if (!(caught instanceof Error)) throw new Error('expected throw on 502');
  // The error message must not include the api key.
  if (caught.message.includes('SECRET-LIVE-KEY-DO-NOT-LEAK')) {
    throw new Error(`apiKey leaked in error message: ${caught.message}`);
  }
});

Deno.test('fetchOnePage — latencyMs uses injected nowMs (no wall-clock); same value on success/unavailable/end', async () => {
  // Success path.
  {
    let t = 5_000;
    const f = new PolygonNewsFeedFetcher(KEY,
      ((async (_url: string | URL, _init?: RequestInit) =>
        jsonResponse({ results: [article({ id: 'p' })] })) as unknown as HttpFetch),
      30_000, POLYGON_BASE_URL,
      { nowMs: () => { const v = t; t += 333; return v; } });
    const r = await f.fetchOnePage({ cursorToken: null, asOf: AS_OF });
    if (r.kind !== 'page') throw new Error('expected page');
    assertStrictEquals(r.latencyMs, 333);
  }
  // Unavailable path.
  {
    let t = 5_000;
    const f = new PolygonNewsFeedFetcher(KEY,
      ((_url: string | URL, _init?: RequestInit) =>
        Promise.resolve(new Response('no', { status: 403 }))) as unknown as HttpFetch,
      30_000, POLYGON_BASE_URL,
      { nowMs: () => { const v = t; t += 100; return v; } });
    const r = await f.fetchOnePage({ cursorToken: null, asOf: AS_OF });
    if (r.kind !== 'unavailable') throw new Error('expected unavailable');
    assertStrictEquals(r.latencyMs, 100);
  }
  // End path.
  {
    let t = 5_000;
    const f = new PolygonNewsFeedFetcher(KEY,
      ((async (_url: string | URL, _init?: RequestInit) =>
        jsonResponse({ results: [] })) as unknown as HttpFetch),
      30_000, POLYGON_BASE_URL,
      { nowMs: () => { const v = t; t += 77; return v; } });
    const r = await f.fetchOnePage({
      cursorToken: `${POLYGON_BASE_URL}/v2/reference/news?cursor=x`,
      asOf: AS_OF,
    });
    if (r.kind !== 'end') throw new Error('expected end');
    assertStrictEquals(r.latencyMs, 77);
  }
});