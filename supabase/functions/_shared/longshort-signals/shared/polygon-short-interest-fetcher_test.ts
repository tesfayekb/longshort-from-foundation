// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  DEFAULT_SHORT_INTEREST_LIMIT,
  PolygonShortInterestFetcher,
  SHORT_INTEREST_OPERATION_ID,
} from './polygon-short-interest-fetcher.ts';
import { SignalComputationError } from './signal-types.ts';

const AS_OF = new Date('2026-06-08T20:00:00Z');

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return {
    ok,
    status,
    statusText: ok ? statusText : statusText === 'OK' ? 'ERR' : statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonShortInterestFetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy-path: returns ASC-sorted reports (Polygon DESC reversed)', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({
      results: [
        { settlement_date: '2026-05-31', short_interest: 80_000_000 },
        { settlement_date: '2026-05-15', short_interest: 90_000_000 },
        { settlement_date: '2026-04-30', short_interest: 100_000_000 },
      ],
    }),
  );
  const out = await fetcher.fetchShortInterest('AAPL', AS_OF);
  assertEquals(out.kind, 'reports');
  if (out.kind !== 'reports') throw new Error('unreachable');
  assertEquals(out.reports.length, 3);
  // ASC order asserted.
  for (let i = 1; i < out.reports.length; i++) {
    assert(out.reports[i].report_date > out.reports[i - 1].report_date);
  }
  assertEquals(out.reports[0].report_date, '2026-04-30');
  assertEquals(out.reports[2].report_date, '2026-05-31');
  assertEquals(out.reports[2].short_interest, 80_000_000);
});

Deno.test('(3) HTTP 403 → typed unavailable (subscription_gated), NOT a throw', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await fetcher.fetchShortInterest('AAPL', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) HTTP 404 → typed unavailable (data_unavailable), NOT a throw', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchShortInterest('DELISTED', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 401 throws SignalComputationError with ticker context', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({}, false, 401, 'Unauthorized'),
  );
  const err = await assertRejects(
    () => fetcher.fetchShortInterest('AAPL', AS_OF),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, SHORT_INTEREST_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
  assertStringIncludes((err as Error).message, 'AAPL');
});

Deno.test('(6) rows without short_interest are dropped (anti-phantom — no fabricated zero)', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({
      results: [
        { settlement_date: '2026-05-31', short_interest: 80_000_000 },
        // No short_interest → must be dropped, NOT defaulted to 0.
        { settlement_date: '2026-05-15', avg_daily_volume: 1_234_567 },
        { settlement_date: '2026-04-30', short_interest: 100_000_000 },
      ],
    }),
  );
  const out = await fetcher.fetchShortInterest('AAPL', AS_OF);
  assertEquals(out.kind, 'reports');
  if (out.kind !== 'reports') throw new Error('unreachable');
  assertEquals(out.reports.length, 2);
  // None of the surviving rows should be the dropped one.
  for (const rep of out.reports) {
    assert(rep.short_interest > 0, 'fabricated-zero leak');
  }
});

Deno.test('(6a) negative short_interest is dropped (anti-phantom — no fabricated value)', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({
      results: [
        { settlement_date: '2026-05-31', short_interest: 80_000_000 },
        { settlement_date: '2026-05-15', short_interest: -5 },
        { settlement_date: '2026-04-30', short_interest: 100_000_000 },
      ],
    }),
  );
  const out = await fetcher.fetchShortInterest('AAPL', AS_OF);
  assertEquals(out.kind, 'reports');
  if (out.kind !== 'reports') throw new Error('unreachable');
  assertEquals(out.reports.length, 2);
});

Deno.test('(6b) zero short_interest is VALID (genuinely no shorts) — kept, not dropped', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({
      results: [
        { settlement_date: '2026-05-31', short_interest: 0 },
        { settlement_date: '2026-05-15', short_interest: 5_000_000 },
        { settlement_date: '2026-04-30', short_interest: 10_000_000 },
      ],
    }),
  );
  const out = await fetcher.fetchShortInterest('AAPL', AS_OF);
  assertEquals(out.kind, 'reports');
  if (out.kind !== 'reports') throw new Error('unreachable');
  assertEquals(out.reports.length, 3);
});

Deno.test('(7) empty results returns kind=reports with empty array', async () => {
  const fetcher = new PolygonShortInterestFetcher('test-key', async () =>
    jsonResp({ results: [] }),
  );
  const out = await fetcher.fetchShortInterest('AAPL', AS_OF);
  assertEquals(out, { kind: 'reports', reports: [] });
});

Deno.test('(8) URL carries the apiKey, ticker, and settlement_date.lte=as_of', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonShortInterestFetcher('test-key', async (input) => {
    capturedUrl = input;
    return jsonResp({ results: [] });
  });
  await fetcher.fetchShortInterest('NVDA', AS_OF);
  assertStringIncludes(capturedUrl, '/stocks/v1/short-interest');
  assertStringIncludes(capturedUrl, 'ticker=NVDA');
  assertStringIncludes(capturedUrl, 'settlement_date.lte=2026-06-08');
  assertStringIncludes(capturedUrl, `limit=${DEFAULT_SHORT_INTEREST_LIMIT}`);
  assertStringIncludes(capturedUrl, 'apiKey=test-key');
});