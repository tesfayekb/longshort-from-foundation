// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PolygonForm4Fetcher,
  FORM4_OPERATION_ID,
  FORM4_WINDOW_DAYS,
} from './polygon-form4-fetcher.ts';
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

const AS_OF = new Date('2026-06-08T00:00:00Z');

Deno.test('(1) constructor throws on missing apiKey', () => {
  let threw = false;
  try {
    new PolygonForm4Fetcher('');
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(2) happy path — normalizes rows preserving all needed fields', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({
      results: [
        {
          record_type: 'transaction',
          transaction_code: 'P',
          aff_10b5_one: false,
          transaction_acquired_disposed: 'A',
          transaction_shares: 1000,
          transaction_price_per_share: 150,
          transaction_date: '2026-05-10',
          is_director: false,
          is_officer: true,
          is_ten_percent_owner: false,
          not_subject_to_section_16: false,
          officer_title: 'Chief Executive Officer',
          security_type: 'non-derivative',
        },
        { record_type: 'holding' /* no transaction fields */ },
      ],
    }),
  );
  const out = await fetcher.fetchForm4('AAPL', AS_OF);
  assertEquals(out.kind, 'rows');
  if (out.kind !== 'rows') throw new Error('unreachable');
  assertEquals(out.rows.length, 2);
  assertEquals(out.rows[0].record_type, 'transaction');
  assertEquals(out.rows[0].transaction_code, 'P');
  assertEquals(out.rows[0].aff_10b5_one, false);
  assertEquals(out.rows[0].transaction_acquired_disposed, 'A');
  assertEquals(out.rows[0].transaction_shares, 1000);
  assertEquals(out.rows[0].transaction_price_per_share, 150);
  assertEquals(out.rows[0].transaction_date, '2026-05-10');
  assertEquals(out.rows[0].officer_title, 'Chief Executive Officer');
  assertEquals(out.rows[1].record_type, 'holding');
  assertEquals(out.rows[1].transaction_code, undefined);
});

Deno.test('(3) HTTP 403 → subscription_gated, NOT a throw', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await fetcher.fetchForm4('AAPL', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) HTTP 404 → data_unavailable, NOT a throw', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchForm4('DELISTED', AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 401 throws SignalComputationError with ticker context', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({}, false, 401, 'Unauthorized'),
  );
  const err = await assertRejects(
    () => fetcher.fetchForm4('AAPL', AS_OF),
    SignalComputationError,
  );
  assertEquals((err as SignalComputationError).signal_id, FORM4_OPERATION_ID);
  assertEquals((err as SignalComputationError).ticker, 'AAPL');
});

Deno.test('(6) 200 with no results → kind=rows, rows=[] (empty 90-day window is NORMAL)', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({ results: [] }),
  );
  const out = await fetcher.fetchForm4('QUIET', AS_OF);
  assertEquals(out, { kind: 'rows', rows: [] });
});

Deno.test('(7) URL carries 90-day window + ticker + apiKey + date filters', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonForm4Fetcher('test-key', async (input) => {
    capturedUrl = input;
    return jsonResp({ results: [] });
  });
  await fetcher.fetchForm4('NVDA', AS_OF);
  assertStringIncludes(capturedUrl, '/stocks/filings/vX/form-4');
  assertStringIncludes(capturedUrl, 'ticker=NVDA');
  assertStringIncludes(capturedUrl, 'transaction_date.lte=2026-06-08');
  // 90 days before 2026-06-08 = 2026-03-10
  assertStringIncludes(capturedUrl, 'transaction_date.gte=2026-03-10');
  assertStringIncludes(capturedUrl, 'apiKey=test-key');
});

Deno.test('(8) FORM4_WINDOW_DAYS is 90 (spec-literal §4.4.4)', () => {
  assertEquals(FORM4_WINDOW_DAYS, 90);
});

Deno.test('(9) malformed (non-object) result rows are silently dropped', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({ results: [null, 'string', 42, { record_type: 'transaction', transaction_code: 'S' }] }),
  );
  const out = await fetcher.fetchForm4('AAPL', AS_OF);
  assertEquals(out.kind, 'rows');
  if (out.kind !== 'rows') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].transaction_code, 'S');
});

Deno.test('(10) fetcher does NOT pre-filter on record_type/transaction_code (compute owns filter)', async () => {
  // Discipline check: holding rows + M/C/A/G codes MUST pass through the
  // fetcher unmodified — the compute layer is the single filter authority.
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({
      results: [
        { record_type: 'holding' },
        { record_type: 'transaction', transaction_code: 'M' },
        { record_type: 'transaction', transaction_code: 'A' },
        { record_type: 'transaction', transaction_code: 'G' },
        { record_type: 'transaction', transaction_code: 'P', aff_10b5_one: false },
      ],
    }),
  );
  const out = await fetcher.fetchForm4('AAPL', AS_OF);
  assertEquals(out.kind, 'rows');
  if (out.kind !== 'rows') throw new Error('unreachable');
  assertEquals(out.rows.length, 5, 'fetcher dropped a row it should have preserved');
});

// ── Market-wide fetch (FP-042 / ACT-155 CPU-limit fix) ─────────────────

Deno.test('(11) market-wide: single page → grouped Map<ticker, rows[]>', async () => {
  let capturedUrl = '';
  const fetcher = new PolygonForm4Fetcher('test-key', async (input) => {
    capturedUrl = input;
    return jsonResp({
      results: [
        { record_type: 'transaction', tickers: ['AAPL'], transaction_code: 'P' },
        { record_type: 'transaction', tickers: ['AAPL'], transaction_code: 'S', aff_10b5_one: false },
        { record_type: 'transaction', tickers: ['MSFT'], transaction_code: 'P' },
        { record_type: 'holding', tickers: ['NVDA'] },
      ],
    });
  });
  const out = await fetcher.fetchForm4MarketWide(AS_OF);
  assertEquals(out.kind, 'rows');
  if (out.kind !== 'rows') throw new Error('unreachable');
  // URL: NO ticker= filter, but DOES carry date window + apiKey
  assert(!capturedUrl.includes('ticker='));
  assertStringIncludes(capturedUrl, 'transaction_date.gte=2026-03-10');
  assertStringIncludes(capturedUrl, 'transaction_date.lte=2026-06-08');
  assertStringIncludes(capturedUrl, 'apiKey=test-key');
  assertEquals(out.rowsByTicker.get('AAPL')?.length, 2);
  assertEquals(out.rowsByTicker.get('MSFT')?.length, 1);
  assertEquals(out.rowsByTicker.get('NVDA')?.length, 1);
});

Deno.test('(12) market-wide: paginates via next_url and merges rows across pages', async () => {
  const pages = [
    {
      results: [
        { record_type: 'transaction', tickers: ['AAPL'], transaction_code: 'P' },
      ],
      next_url: 'https://api.polygon.io/stocks/filings/vX/form-4?cursor=PAGE2',
    },
    {
      results: [
        { record_type: 'transaction', tickers: ['AAPL'], transaction_code: 'S', aff_10b5_one: false },
        { record_type: 'transaction', tickers: ['MSFT'], transaction_code: 'P' },
      ],
      next_url: 'https://api.polygon.io/stocks/filings/vX/form-4?cursor=PAGE3',
    },
    {
      results: [
        { record_type: 'transaction', tickers: ['NVDA'], transaction_code: 'P' },
      ],
      // no next_url → end
    },
  ];
  let i = 0;
  const urls: string[] = [];
  const fetcher = new PolygonForm4Fetcher('test-key', async (input) => {
    urls.push(input);
    return jsonResp(pages[i++]);
  });
  const out = await fetcher.fetchForm4MarketWide(AS_OF);
  assertEquals(out.kind, 'rows');
  if (out.kind !== 'rows') throw new Error('unreachable');
  assertEquals(urls.length, 3);
  // Pages 2 + 3 follow the next_url cursor (apiKey appended)
  assertStringIncludes(urls[1], 'cursor=PAGE2');
  assertStringIncludes(urls[1], 'apiKey=test-key');
  assertEquals(out.rowsByTicker.get('AAPL')?.length, 2);
  assertEquals(out.rowsByTicker.get('MSFT')?.length, 1);
  assertEquals(out.rowsByTicker.get('NVDA')?.length, 1);
});

Deno.test('(13) market-wide HTTP 403 → subscription_gated (not a throw)', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({}, false, 403, 'Forbidden'),
  );
  const out = await fetcher.fetchForm4MarketWide(AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(14) market-wide HTTP 404 → data_unavailable (not a throw)', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({}, false, 404, 'Not Found'),
  );
  const out = await fetcher.fetchForm4MarketWide(AS_OF);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(15) market-wide: rows without tickers[] are dropped (no fabricated attribution)', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({
      results: [
        { record_type: 'transaction', transaction_code: 'P' /* no tickers */ },
        { record_type: 'transaction', tickers: [], transaction_code: 'P' },
        { record_type: 'transaction', tickers: ['AAPL'], transaction_code: 'P' },
      ],
    }),
  );
  const out = await fetcher.fetchForm4MarketWide(AS_OF);
  assertEquals(out.kind, 'rows');
  if (out.kind !== 'rows') throw new Error('unreachable');
  assertEquals(out.rowsByTicker.size, 1);
  assertEquals(out.rowsByTicker.get('AAPL')?.length, 1);
});

Deno.test('(16) market-wide: attributes to tickers[0] (primary issuer) on multi-ticker rows', async () => {
  const fetcher = new PolygonForm4Fetcher('test-key', async () =>
    jsonResp({
      results: [
        { record_type: 'transaction', tickers: ['GOOG', 'GOOGL'], transaction_code: 'P' },
      ],
    }),
  );
  const out = await fetcher.fetchForm4MarketWide(AS_OF);
  if (out.kind !== 'rows') throw new Error('unreachable');
  assertEquals(out.rowsByTicker.get('GOOG')?.length, 1);
  assertEquals(out.rowsByTicker.get('GOOGL'), undefined);
});