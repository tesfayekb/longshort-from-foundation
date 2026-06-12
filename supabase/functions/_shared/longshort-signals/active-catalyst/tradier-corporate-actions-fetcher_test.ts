// @ts-nocheck — Deno test file.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  TradierCorporateActionsFetcher,
  TRADIER_MAX_SYMBOLS_PER_CALL,
} from './tradier-corporate-actions-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, text: async () => JSON.stringify(body), json: async () => body };
}

const PAYLOAD = {
  securities: {
    security: [
      {
        symbol: 'AAPL',
        corporate_actions: {
          cash_dividend: [
            { announcement_date: '2026-06-08', ex_date: '2026-06-15', cash_amount: 0.25 },
            { announcement_date: '',           ex_date: '2026-06-22', cash_amount: 0.26 }, // declaration missing
          ],
          stock_split: { announcement_date: '2026-06-09', to_factor: 4, for_factor: 1 },
          merger_acquisition: { announcement_date: '2026-06-11', acquirer_symbol: 'BIG' }, // future
        },
      },
      {
        symbol: 'NVDA',
        corporate_actions: { cash_dividend: [], stock_split: [], merger_acquisition: [] },
      },
    ],
  },
};
const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) normalizes cash_dividend + stock_split into events; counts §(e) declaration-missing', async () => {
  const f = new TradierCorporateActionsFetcher('t', async () => jsonResp(PAYLOAD));
  const out = await f.fetch(WINDOW, ['AAPL', 'NVDA']);
  if (out.kind !== 'events') throw new Error('unreachable');
  // AAPL dividend (announce 06-08) + AAPL split (announce 06-09); ma 06-11 future
  assertEquals(out.rows.length, 2);
  assertEquals(out.future_event_excluded, 1);
  assertEquals(out.declaration_date_unavailable, 1);
  const types = out.rows.map((r) => r.event_type).sort();
  assertEquals(types, ['dividend_change', 'splits']);
  assertEquals(out.rows.every((r) => r.vendor === 'tradier'), true);
  assertEquals(out.rows.every((r) => r.meta?.tradier_backup === true), true);
});

Deno.test('(2) empty tickers list → data_unavailable (no network call)', async () => {
  let called = false;
  const f = new TradierCorporateActionsFetcher('t', async () => { called = true; return jsonResp({}); });
  const out = await f.fetch(WINDOW, []);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
  assertEquals(called, false);
});

Deno.test('(3) ticker chunk over cap throws (caller MUST chunk)', async () => {
  const f = new TradierCorporateActionsFetcher('t', async () => jsonResp(PAYLOAD));
  const overcap = new Array(TRADIER_MAX_SYMBOLS_PER_CALL + 1).fill('AAPL');
  let threw = false;
  try { await f.fetch(WINDOW, overcap); } catch (e) {
    threw = true; assertStringIncludes((e as Error).message, 'chunk');
  }
  assert(threw);
});

Deno.test('(4) Bearer auth header attached; symbols CSV upper-cased', async () => {
  let capturedUrl = ''; let capturedAuth = '';
  const f = new TradierCorporateActionsFetcher('SECRET-TR', async (input, init) => {
    capturedUrl = input; capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? '';
    return jsonResp(PAYLOAD);
  });
  await f.fetch(WINDOW, ['aapl', 'nvda']);
  assertStringIncludes(capturedUrl, 'symbols=AAPL%2CNVDA');
  assertEquals(capturedAuth, 'Bearer SECRET-TR');
});

Deno.test('(5) HTTP 401 → subscription_gated', async () => {
  const f = new TradierCorporateActionsFetcher('t', async () => jsonResp({}, false, 401, 'Unauthorized'));
  const out = await f.fetch(WINDOW, ['AAPL']);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(6) missing `securities` block → data_unavailable (not a throw)', async () => {
  const f = new TradierCorporateActionsFetcher('t', async () => jsonResp({}));
  const out = await f.fetch(WINDOW, ['AAPL']);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7) HTTP 500 throws SignalComputationError', async () => {
  const f = new TradierCorporateActionsFetcher('t', async () => { throw new Error('HTTP 500 X'); });
  await assertRejects(() => f.fetch(WINDOW, ['AAPL']), SignalComputationError);
});

Deno.test('(8) constructor throws on missing apiKey', () => {
  let threw = false; try { new TradierCorporateActionsFetcher(''); } catch { threw = true; } assert(threw);
});