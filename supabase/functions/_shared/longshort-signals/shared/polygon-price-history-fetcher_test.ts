// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS,
  PRICE_HISTORY_OPERATION_ID,
  PolygonPriceHistoryFetcher,
} from './polygon-price-history-fetcher.ts';
import { SignalComputationError } from './signal-types.ts';

const AS_OF = new Date('2026-05-25T14:30:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText: ok ? statusText : statusText === 'OK' ? 'ERR' : statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

/** Build `n` ascending daily bars ending at `as_of` (one bar per calendar day). */
function bars(n: number, close: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Oldest bar is (n - 1) days before as_of; newest bar is at as_of.
    out.push({ c: close, t: AS_OF.getTime() - (n - 1 - i) * MS_PER_DAY });
  }
  return out;
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonPriceHistoryFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy-path: returns ascending DailyBar[] with adjusted closes threaded through', async () => {
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () =>
    jsonResp({ results: bars(280, 150.25) }),
  );
  const out = await fetcher.fetchPriceHistory('AAPL', AS_OF);
  assert(out !== null);
  assertEquals(out!.length, 280);
  assertEquals(out![0].close, 150.25);
  assertEquals(out![279].close, 150.25);
  // Ascending sort: each ts >= previous ts
  for (let i = 1; i < out!.length; i++) {
    assert(out![i].ts >= out![i - 1].ts, `out-of-order at index ${i}`);
  }
  // Last bar ts is the as_of date (UTC)
  assertEquals(out![279].ts, '2026-05-25');
});

Deno.test('(3) HTTP 404 returns null (typed-absence, not throw)', async () => {
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchPriceHistory('DELISTED', AS_OF);
  assertEquals(out, null);
});

Deno.test('(4) HTTP 401 throws SignalComputationError with ticker context', async () => {
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () =>
    jsonResp({}, false, 401, 'Unauthorized'),
  );
  const err = await assertRejects(
    () => fetcher.fetchPriceHistory('AAPL', AS_OF),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, PRICE_HISTORY_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
  assertStringIncludes((err as Error).message, 'AAPL');
  assertStringIncludes((err as Error).message, '401');
});

Deno.test('(5) HTTP 500 throws after retries exhausted (status context preserved per INC-24)', async () => {
  let calls = 0;
  const fetcher = new PolygonPriceHistoryFetcher(
    'test-key',
    async () => {
      calls += 1;
      return jsonResp({}, false, 500, 'Internal Server Error');
    },
    1_000,
  );
  const err = await assertRejects(
    () => fetcher.fetchPriceHistory('AAPL', AS_OF),
    SignalComputationError,
  );
  // fetchWithTimeoutAndRetry default schedule is 3 attempts on 5xx.
  assert(calls >= 2, `expected retries on 500; got ${calls} call(s)`);
  assertStringIncludes((err as Error).message, 'AAPL');
  assertStringIncludes((err as Error).message, '500');
});

Deno.test('(6) timeout (AbortError) throws SignalComputationError with timeout message', async () => {
  const fetcher = new PolygonPriceHistoryFetcher(
    'test-key',
    async (_url, init) => {
      // Honor the abort signal: throw an AbortError as soon as it fires.
      return await new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const e = new Error('aborted');
            (e as Error & { name: string }).name = 'AbortError';
            reject(e);
          });
        }
      });
    },
    50, // 50ms timeout
  );
  const err = await assertRejects(
    () => fetcher.fetchPriceHistory('AAPL', AS_OF),
    SignalComputationError,
  );
  assertStringIncludes((err as Error).message, 'AAPL');
  assertStringIncludes((err as Error).message, 'timeout');
});

Deno.test('(7) JSON parse error throws SignalComputationError', async () => {
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '{not json',
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  }));
  const err = await assertRejects(
    () => fetcher.fetchPriceHistory('AAPL', AS_OF),
    SignalComputationError,
  );
  assertStringIncludes((err as Error).message, 'JSON parse');
  assertStringIncludes((err as Error).message, 'AAPL');
});

Deno.test('(8) empty results array → returns [] (NOT null — 404 is "missing", empty is "no bars in window")', async () => {
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () =>
    jsonResp({ results: [] }),
  );
  const out = await fetcher.fetchPriceHistory('NEWLY_LISTED', AS_OF);
  assert(out !== null, 'empty results must be [], not null');
  assertEquals(out!.length, 0);
});

Deno.test('(9) lookbackDays parameter is reflected in URL date range', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async (url) => {
    capturedUrl = url;
    return jsonResp({ results: bars(10, 100) });
  });
  await fetcher.fetchPriceHistory('AAPL', AS_OF, 100);
  // 100 calendar days back from 2026-05-25 → 2026-02-14
  assertStringIncludes(capturedUrl, '/range/1/day/2026-02-14/2026-05-25');
  assertStringIncludes(capturedUrl, 'adjusted=true');
  assertStringIncludes(capturedUrl, 'sort=asc');
});

Deno.test('(10) default lookbackDays is 400', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async (url) => {
    capturedUrl = url;
    return jsonResp({ results: bars(400, 100) });
  });
  await fetcher.fetchPriceHistory('AAPL', AS_OF);
  // 400 calendar days back from 2026-05-25 → 2025-04-20
  assertStringIncludes(capturedUrl, '/range/1/day/2025-04-20/2026-05-25');
  assertEquals(DEFAULT_PRICE_HISTORY_LOOKBACK_DAYS, 400);
});

Deno.test('(11) determinism: same fixed-response fetch returns identical results across calls', async () => {
  const fixture = { results: bars(50, 99.99) };
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () => jsonResp(fixture));
  const a = await fetcher.fetchPriceHistory('AAPL', AS_OF);
  const b = await fetcher.fetchPriceHistory('AAPL', AS_OF);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test('(12) malformed bars (missing c or t) are dropped, not thrown', async () => {
  const fetcher = new PolygonPriceHistoryFetcher('test-key', async () =>
    jsonResp({
      results: [
        { c: 100, t: AS_OF.getTime() - 2 * MS_PER_DAY },
        { c: undefined, t: AS_OF.getTime() - 1 * MS_PER_DAY }, // dropped
        { c: 102, t: undefined }, // dropped
        { c: 103, t: AS_OF.getTime() },
      ],
    }),
  );
  const out = await fetcher.fetchPriceHistory('AAPL', AS_OF);
  assert(out !== null);
  assertEquals(out!.length, 2);
  assertEquals(out!.map((b) => b.close), [100, 103]);
});