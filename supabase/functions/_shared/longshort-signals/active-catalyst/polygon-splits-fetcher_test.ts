// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PolygonSplitsFetcher } from './polygon-splits-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, text: async () => JSON.stringify(body), json: async () => body };
}

const PAYLOAD = {
  results: [
    { ticker: 'AAPL', execution_date: '2026-06-08', split_from: 1, split_to: 4, id: 'E:AAPL-2026-06-08' },
    { ticker: 'TSLA', execution_date: '2026-06-11', split_from: 1, split_to: 3, id: 'E:TSLA-2026-06-11' }, // future
    { ticker: 'OLD',  execution_date: '2026-05-30', split_from: 1, split_to: 2, id: 'E:OLD-2026-05-30' }, // before window
  ],
};
const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) happy-path: look-ahead drops TSLA, window-floor drops OLD', async () => {
  const f = new PolygonSplitsFetcher('k', async () => jsonResp(PAYLOAD));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, 'AAPL');
  assertEquals(out.rows[0].event_type, 'splits');
  assertEquals(out.rows[0].vendor, 'polygon');
  assertEquals(out.future_event_excluded, 1);
  assertEquals(out.rows[0].meta?.split_from, 1);
  assertEquals(out.rows[0].meta?.split_to, 4);
});

Deno.test('(2) HTTP 403 → subscription_gated', async () => {
  const f = new PolygonSplitsFetcher('k', async () => jsonResp({}, false, 403, 'Forbidden'));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(3) HTTP 404 → data_unavailable', async () => {
  const f = new PolygonSplitsFetcher('k', async () => jsonResp({}, false, 404, 'Not Found'));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(4) empty results → data_unavailable', async () => {
  const f = new PolygonSplitsFetcher('k', async () => jsonResp({ results: [] }));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(5) unwrapped response shape throws', async () => {
  const f = new PolygonSplitsFetcher('k', async () => jsonResp(PAYLOAD.results));
  await assertRejects(() => f.fetch(WINDOW), SignalComputationError);
});

Deno.test('(6) constructor throws on missing apiKey', () => {
  let threw = false; try { new PolygonSplitsFetcher(''); } catch { threw = true; } assert(threw);
});