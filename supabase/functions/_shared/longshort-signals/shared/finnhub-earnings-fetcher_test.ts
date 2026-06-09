// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EARNINGS_OPERATION_ID,
  FinnhubEarningsFetcher,
  type RawEarningsRow,
} from './finnhub-earnings-fetcher.ts';
import { SignalComputationError } from './signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText: ok ? statusText : statusText === 'OK' ? 'ERR' : statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

// Finnhub returns a BARE ARRAY (not wrapped in { data: [...] }).
const SAMPLE_EARNINGS = [
  { actual: 2.01, estimate: 1.9884, period: '2026-03-31', quarter: 2, surprise: 0.0216, surprisePercent: 1.0863, symbol: 'AAPL', year: 2026 },
  { actual: 2.84, estimate: 2.7257, period: '2025-12-31', quarter: 1, surprise: 0.1143, surprisePercent: 4.1934, symbol: 'AAPL', year: 2026 },
  { actual: 1.85, estimate: 1.8075, period: '2025-09-30', quarter: 4, surprise: 0.0425, surprisePercent: 2.3513, symbol: 'AAPL', year: 2025 },
  { actual: null, estimate: 1.86, period: '2026-06-30', quarter: 3, surprise: null, surprisePercent: null, symbol: 'AAPL', year: 2026 },
];

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new FinnhubEarningsFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy-path: returns ASC-sorted rows including future (actual=null)', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () =>
    jsonResp(SAMPLE_EARNINGS),
  );
  const out = await fetcher.fetchEarnings('AAPL');
  assertEquals(out.kind, 'earnings');
  if (out.kind !== 'earnings') throw new Error('unreachable');
  assertEquals(out.rows.length, 4);
  for (let i = 1; i < out.rows.length; i++) {
    assert(out.rows[i].period > out.rows[i - 1].period);
  }
  // Last row is the future quarter with actual=null retained as typed-absence.
  const last = out.rows[out.rows.length - 1];
  assertEquals(last.period, '2026-06-30');
  assertEquals(last.actual, null);
  assertEquals(last.estimate, 1.86);
});

Deno.test('(3) HTTP 401 → typed unavailable (subscription_gated)', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () =>
    jsonResp([], false, 401, 'Unauthorized'),
  );
  const out = await fetcher.fetchEarnings('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) HTTP 404 → typed unavailable (data_unavailable)', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () =>
    jsonResp([], false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchEarnings('DELISTED');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 500 throws SignalComputationError with ticker context', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () => {
    throw new Error('HTTP 500 Server Error');
  });
  const err = await assertRejects(
    () => fetcher.fetchEarnings('AAPL'),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, EARNINGS_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
});

Deno.test('(5a) unexpected response shape (object not array) throws', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () =>
    jsonResp({ data: SAMPLE_EARNINGS }), // wrong shape — would silently be empty without the guard
  );
  const err = await assertRejects(
    () => fetcher.fetchEarnings('AAPL'),
    SignalComputationError,
  );
  assertStringIncludes((err as Error).message, 'unexpected response shape');
});

Deno.test('(6) row with NEITHER actual NOR estimate is dropped (useless to consumer)', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () =>
    jsonResp([
      SAMPLE_EARNINGS[0],
      { period: '2025-06-30', quarter: 3, year: 2025 }, // no actual, no estimate
      SAMPLE_EARNINGS[2],
    ]),
  );
  const out = await fetcher.fetchEarnings('AAPL');
  assertEquals(out.kind, 'earnings');
  if (out.kind !== 'earnings') throw new Error('unreachable');
  assertEquals(out.rows.length, 2);
});

Deno.test('(7) empty array → data_unavailable', async () => {
  const fetcher = new FinnhubEarningsFetcher('test-key', async () =>
    jsonResp([]),
  );
  const out = await fetcher.fetchEarnings('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(8) URL carries token + symbol', async () => {
  let capturedUrl = '';
  const fetcher = new FinnhubEarningsFetcher('test-key', async (input) => {
    capturedUrl = input;
    return jsonResp(SAMPLE_EARNINGS);
  });
  await fetcher.fetchEarnings('NVDA');
  assertStringIncludes(capturedUrl, '/stock/earnings');
  assertStringIncludes(capturedUrl, 'symbol=NVDA');
  assertStringIncludes(capturedUrl, 'token=test-key');
});

Deno.test('(9) verifyFilterHonored: unavailable on impossible symbol → honored=true', () => {
  const out = FinnhubEarningsFetcher.verifyFilterHonored(
    'ZZZZZZZZ',
    { kind: 'unavailable', reason: 'data_unavailable' },
  );
  assertEquals(out.honored, true);
  assertEquals(out.rows_returned, 0);
});

Deno.test('(9a) verifyFilterHonored: rows returned on impossible symbol → honored=false', () => {
  const out = FinnhubEarningsFetcher.verifyFilterHonored(
    'ZZZZZZZZ',
    { kind: 'earnings', rows: [{ period: '2025-09-30', actual: 1.85, estimate: 1.8075 } as RawEarningsRow] },
  );
  assertEquals(out.honored, false);
  assertEquals(out.rows_returned, 1);
  assertStringIncludes(out.reason, 'FILTER BLEED');
});

Deno.test('(10) verifyFieldsPresent counts actual_any + estimate', () => {
  const rows: RawEarningsRow[] = [
    { period: '2025-09-30', actual: 1.85, estimate: 1.8075 },
    { period: '2025-12-31', actual: 2.84, estimate: 2.7257 },
    { period: '2026-06-30', actual: null, estimate: 1.86 },
  ];
  const out = FinnhubEarningsFetcher.verifyFieldsPresent(rows);
  assertEquals(out.total, 3);
  assertEquals(out.populated.actual_any, 2);
  assertEquals(out.populated.estimate, 3);
});