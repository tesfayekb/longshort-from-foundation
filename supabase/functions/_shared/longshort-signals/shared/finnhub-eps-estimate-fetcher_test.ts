// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EPS_ESTIMATE_OPERATION_ID,
  FinnhubEpsEstimateFetcher,
  type RawEpsEstimateRow,
} from './finnhub-eps-estimate-fetcher.ts';
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

const SAMPLE_DATA = [
  { period: '2026-09-30', epsAvg: 2.0467, epsHigh: 2.247, epsLow: 1.8228, numberAnalysts: 32, quarter: 4, year: 2026 },
  { period: '2026-06-30', epsAvg: 1.9304, epsHigh: 2.0895, epsLow: 1.7934, numberAnalysts: 33, quarter: 3, year: 2026 },
  { period: '2026-03-31', epsAvg: 1.9884, epsHigh: 2.1525, epsLow: 1.81006, numberAnalysts: 31, quarter: 2, year: 2026 },
];

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new FinnhubEpsEstimateFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy-path: returns ASC-sorted rows', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({ data: SAMPLE_DATA, freq: 'quarterly', symbol: 'AAPL' }),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out.kind, 'estimates');
  if (out.kind !== 'estimates') throw new Error('unreachable');
  assertEquals(out.rows.length, 3);
  for (let i = 1; i < out.rows.length; i++) {
    assert(out.rows[i].period > out.rows[i - 1].period);
  }
  assertEquals(out.rows[0].period, '2026-03-31');
  assertEquals(out.rows[2].period, '2026-09-30');
  assertEquals(out.rows[0].numberAnalysts, 31);
});

Deno.test('(3) HTTP 401 → typed unavailable (subscription_gated)', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({}, false, 401, 'Unauthorized'),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(3a) HTTP 403 → typed unavailable (subscription_gated)', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) HTTP 404 → typed unavailable (data_unavailable)', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchEpsEstimates('DELISTED');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 500 throws SignalComputationError with ticker context', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () => {
    // The retry layer wraps repeated 5xx as `HTTP 500` Error after the
    // backoff schedule exhausts; simulate the final-throw shape directly
    // by throwing the same Error from the http layer.
    throw new Error('HTTP 500 Server Error');
  });
  const err = await assertRejects(
    () => fetcher.fetchEpsEstimates('AAPL'),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, EPS_ESTIMATE_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
  assertStringIncludes((err as Error).message, 'AAPL');
});

Deno.test('(6) rows missing a required field are dropped (anti-phantom — no fabricated 0)', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({
      data: [
        SAMPLE_DATA[0],
        // numberAnalysts missing → drop
        { period: '2026-06-30', epsAvg: 1.9304, epsHigh: 2.0895, epsLow: 1.7934, quarter: 3, year: 2026 },
        SAMPLE_DATA[2],
      ],
    }),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out.kind, 'estimates');
  if (out.kind !== 'estimates') throw new Error('unreachable');
  assertEquals(out.rows.length, 2);
  for (const r of out.rows) {
    assert(r.numberAnalysts > 0, 'fabricated-zero leak on numberAnalysts');
  }
});

Deno.test('(6a) numberAnalysts=0 is dropped (anti-phantom — vendor regression vs zero-coverage 404)', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({
      data: [
        SAMPLE_DATA[0],
        { period: '2026-06-30', epsAvg: 1.9304, epsHigh: 2.0895, epsLow: 1.7934, numberAnalysts: 0 },
      ],
    }),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out.kind, 'estimates');
  if (out.kind !== 'estimates') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
});

Deno.test('(7) empty data[] → data_unavailable (not an empty estimates result)', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({ data: [] }),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7a) all-rows-dropped (vendor regression) → data_unavailable', async () => {
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async () =>
    jsonResp({
      data: [
        { period: '2026-06-30', quarter: 3, year: 2026 }, // every numeric missing
      ],
    }),
  );
  const out = await fetcher.fetchEpsEstimates('AAPL');
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(8) URL carries the token, symbol, and freq=quarterly', async () => {
  let capturedUrl = '';
  const fetcher = new FinnhubEpsEstimateFetcher('test-key', async (input) => {
    capturedUrl = input;
    return jsonResp({ data: SAMPLE_DATA });
  });
  await fetcher.fetchEpsEstimates('NVDA');
  assertStringIncludes(capturedUrl, '/stock/eps-estimate');
  assertStringIncludes(capturedUrl, 'symbol=NVDA');
  assertStringIncludes(capturedUrl, 'freq=quarterly');
  assertStringIncludes(capturedUrl, 'token=test-key');
});

Deno.test('(9) verifyFilterHonored: unavailable on impossible symbol → honored=true', () => {
  const out = FinnhubEpsEstimateFetcher.verifyFilterHonored(
    'ZZZZZZZZ',
    { kind: 'unavailable', reason: 'data_unavailable' },
  );
  assertEquals(out.honored, true);
  assertEquals(out.rows_returned, 0);
});

Deno.test('(9a) verifyFilterHonored: rows returned on impossible symbol → honored=false (filter bleed)', () => {
  const out = FinnhubEpsEstimateFetcher.verifyFilterHonored(
    'ZZZZZZZZ',
    { kind: 'estimates', rows: [SAMPLE_DATA[0] as RawEpsEstimateRow] },
  );
  assertEquals(out.honored, false);
  assertEquals(out.rows_returned, 1);
  assertStringIncludes(out.reason, 'FILTER BLEED');
});

Deno.test('(10) verifyFieldsPresent counts populated fields including n_ge_2', () => {
  const out = FinnhubEpsEstimateFetcher.verifyFieldsPresent(SAMPLE_DATA as RawEpsEstimateRow[]);
  assertEquals(out.total, 3);
  assertEquals(out.populated.epsAvg, 3);
  assertEquals(out.populated.epsHigh, 3);
  assertEquals(out.populated.epsLow, 3);
  assertEquals(out.populated.numberAnalysts, 3);
  assertEquals(out.populated.n_ge_2, 3);
});