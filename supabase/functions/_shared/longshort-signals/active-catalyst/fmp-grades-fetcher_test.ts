// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FmpGradesFetcher } from './fmp-grades-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, text: async () => JSON.stringify(body), json: async () => body };
}

const SAMPLE = [
  { symbol: 'AAPL', publishedDate: '2026-06-09T13:30:00.000Z', newGrade: 'Buy',     previousGrade: 'Hold', gradingCompany: 'BofA',   action: 'upgrade'   },
  { symbol: 'NVDA', publishedDate: '2026-06-08T12:00:00.000Z', newGrade: 'Buy',     previousGrade: 'Buy',  gradingCompany: 'JPM',    action: 'reiterate' },
  { symbol: 'TSLA', publishedDate: '2026-06-11T15:00:00.000Z', newGrade: 'Hold',    previousGrade: 'Buy',  gradingCompany: 'MS',     action: 'downgrade' }, // future
];
const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) preserves action in meta so classifier can pick Tier-2 vs Tier-3', async () => {
  const f = new FmpGradesFetcher('k', async () => jsonResp(SAMPLE));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 2);
  assertEquals(out.future_event_excluded, 1);
  const aapl = out.rows.find((r) => r.ticker === 'AAPL');
  const nvda = out.rows.find((r) => r.ticker === 'NVDA');
  assert(aapl && nvda);
  assertEquals(aapl!.meta?.action, 'upgrade');
  assertEquals(nvda!.meta?.action, 'reiterate');
  assertEquals(aapl!.event_type, 'analyst_rating');
  assertEquals(aapl!.source, 'structured');
  assertEquals(aapl!.vendor, 'fmp');
});

Deno.test('(2) HTTP 403 first page → subscription_gated', async () => {
  const f = new FmpGradesFetcher('k', async () => jsonResp({}, false, 403, 'Forbidden'));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(3) HTTP 429 → rate_limited', async () => {
  const f = new FmpGradesFetcher('k', async () => { throw new Error('HTTP 429 Too Many Requests'); });
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'rate_limited' });
});

Deno.test('(4) HTTP 500 throws SignalComputationError', async () => {
  const f = new FmpGradesFetcher('k', async () => { throw new Error('HTTP 500 X'); });
  await assertRejects(() => f.fetch(WINDOW), SignalComputationError);
});

Deno.test('(5) unknown action preserved (classifier routes conservatively)', async () => {
  const f = new FmpGradesFetcher('k', async () =>
    jsonResp([{ symbol: 'X', publishedDate: '2026-06-08T12:00:00Z', action: 'mystery-action' }]),
  );
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows[0].meta?.action, 'mystery-action');
});

Deno.test('(6) empty first page → data_unavailable', async () => {
  const f = new FmpGradesFetcher('k', async () => jsonResp([]));
  const out = await f.fetch(WINDOW);
  assertEquals(out, { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(7) constructor throws on missing apiKey', () => {
  let threw = false; try { new FmpGradesFetcher(''); } catch { threw = true; } assert(threw);
});