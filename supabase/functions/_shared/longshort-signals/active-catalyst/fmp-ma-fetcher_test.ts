// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FmpMaFetcher } from './fmp-ma-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, text: async () => JSON.stringify(body), json: async () => body };
}

// Phase-0 §B2 evidence shape — one in-window deal, one future deal.
const PAGE0 = [
  { symbol: 'BIG', companyName: 'BigCo', targetedCompanyName: 'SmallCo', targetedSymbol: 'SML', transactionDate: '2026-06-08', acceptedDate: '2026-06-08' },
  { symbol: 'ACQ', companyName: 'AcqCo', targetedSymbol: '',          transactionDate: '2026-06-11', acceptedDate: '2026-06-11' }, // future
];
const PAGE1 = [
  { symbol: 'OLD', companyName: 'OldCo', targetedSymbol: 'OTG', transactionDate: '2026-05-20' }, // before window — stops paging
];

const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) two-sided emission: acquirer + target both surface as rows', async () => {
  const pages: unknown[][] = [PAGE0, PAGE1];
  let i = 0;
  const f = new FmpMaFetcher('k', async () => jsonResp(pages[i++] ?? []));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  // BIG + SML emit from PAGE0 row 1; ACQ from PAGE0 row 2 dropped by look-ahead.
  const tickers = out.rows.map((r) => r.ticker).sort();
  assertEquals(tickers, ['BIG', 'SML']);
  assertEquals(out.future_event_excluded, 1); // ACQ future
  const sides = out.rows.map((r) => r.meta?.side).sort();
  assertEquals(sides, ['acquirer', 'target']);
});

Deno.test('(2) pagination stops once a page is entirely below window floor', async () => {
  let callCount = 0;
  const f = new FmpMaFetcher('k', async () => {
    callCount += 1;
    // Page 0 has in-window row → continue; Page 1 all-old → stop.
    return jsonResp(callCount === 1 ? [PAGE0[0]] : PAGE1);
  });
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(callCount, 2);
  assertEquals(out.rows.length, 2);
});

Deno.test('(3) HTTP 403 first page → subscription_gated', async () => {
  const f = new FmpMaFetcher('k', async () => jsonResp({}, false, 403, 'Forbidden'));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(4) empty array first page → data_unavailable', async () => {
  const f = new FmpMaFetcher('k', async () => jsonResp([]));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) HTTP 500 throws SignalComputationError', async () => {
  const f = new FmpMaFetcher('k', async () => { throw new Error('HTTP 500 X'); });
  await assertRejects(() => f.fetch(WINDOW), SignalComputationError);
});

Deno.test('(6) rows missing both symbol AND targetedSymbol are dropped (no phantom events)', async () => {
  const f = new FmpMaFetcher('k', async () =>
    jsonResp([{ transactionDate: '2026-06-08', symbol: '', targetedSymbol: '' }]),
  );
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 0);
});

Deno.test('(7) constructor throws on missing apiKey', () => {
  let threw = false;
  try { new FmpMaFetcher(''); } catch { threw = true; }
  assert(threw);
});