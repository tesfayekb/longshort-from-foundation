// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FinnhubFdaAdvisoryFetcher } from './finnhub-fda-advisory-fetcher.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

function jsonResp(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, text: async () => JSON.stringify(body), json: async () => body };
}

const SAMPLE = [
  { fromDate: '2026-06-09', toDate: '2026-06-09', eventDescription: 'Oncologic Drugs Advisory Committee', url: 'https://fda/x' },
  { fromDate: '2026-06-12', toDate: '2026-06-12', eventDescription: 'PDUFA — DrugX',                       url: 'https://fda/y' }, // future
  { fromDate: '2026-05-29', toDate: '2026-05-29', eventDescription: 'old',                                  url: 'https://fda/z' }, // before window
];
const WINDOW = {
  as_of: new Date('2026-06-10T20:00:00Z'),
  window_start_at: new Date('2026-06-05T00:00:00Z'),
};

Deno.test('(1) universe-wide emission with sentinel ticker `*`; OCCURRED-ONLY enforced', async () => {
  const f = new FinnhubFdaAdvisoryFetcher('k', async () => jsonResp(SAMPLE));
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(out.rows.length, 1);
  assertEquals(out.rows[0].ticker, '*');
  assertEquals(out.rows[0].event_type, 'fda_advisory');
  assertEquals(out.rows[0].vendor, 'finnhub');
  assertEquals(out.rows[0].meta?.universe_wide, true);
  assertEquals(out.future_event_excluded, 1);
});

Deno.test('(2) HTTP 401 → subscription_gated', async () => {
  const f = new FinnhubFdaAdvisoryFetcher('k', async () => jsonResp({}, false, 401, 'Unauthorized'));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'subscription_gated' });
});

Deno.test('(3) empty array → data_unavailable', async () => {
  const f = new FinnhubFdaAdvisoryFetcher('k', async () => jsonResp([]));
  assertEquals(await f.fetch(WINDOW), { kind: 'unavailable', reason: 'data_unavailable' });
});

Deno.test('(4) wrapped (non-array) response throws', async () => {
  const f = new FinnhubFdaAdvisoryFetcher('k', async () => jsonResp({ data: SAMPLE }));
  await assertRejects(() => f.fetch(WINDOW), SignalComputationError);
});

Deno.test('(5) description bounded to 240 chars in meta (log-safe)', async () => {
  const long = 'x'.repeat(500);
  const f = new FinnhubFdaAdvisoryFetcher('k', async () =>
    jsonResp([{ fromDate: '2026-06-08', eventDescription: long }]),
  );
  const out = await f.fetch(WINDOW);
  if (out.kind !== 'events') throw new Error('unreachable');
  assertEquals(typeof out.rows[0].meta?.description, 'string');
  assertEquals((out.rows[0].meta!.description as string).length, 240);
});

Deno.test('(6) constructor throws on missing apiKey', () => {
  let threw = false; try { new FinnhubFdaAdvisoryFetcher(''); } catch { threw = true; } assert(threw);
});