// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  iSharesConstituentFetcher,
  findHeaderRowIndex,
  parseCsvLine,
  parseISharesCsv,
} from './ishares-constituent-fetcher.ts';
import { ConstituentFetchError } from '../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';

const AS_OF = new Date('2026-05-25T14:30:00Z');

const SAMPLE_CSV = [
  'iShares Core S&P 500 ETF',
  'Fund Holdings as of,"May 22, 2026"',
  'Inception Date,"May 15, 2000"',
  '',
  '',
  '"Ticker","Name","Sector","Asset Class","Market Value","Weight (%)"',
  '"AAPL","APPLE INC","Information Technology","Equity","$500,000,000","7.12"',
  '"MSFT","MICROSOFT CORP","Information Technology","Equity","$450,000,000","6.40"',
  '"-","USD CASH","--","Cash","$1,000,000","0.01"',
  '"GOOGL","ALPHABET INC CLASS A","Communication","Equity","$200,000,000","2.85"',
  '"FUT","S&P FUTURE JUN26","--","Futures","$0","0.00"',
  '',
].join('\n');

Deno.test('(1) parseCsvLine handles quoted fields with embedded commas', () => {
  const fields = parseCsvLine('"AAPL","APPLE, INC","Equity"');
  assertEquals(fields, ['AAPL', 'APPLE, INC', 'Equity']);
});

Deno.test('(2) parseCsvLine handles escaped quotes', () => {
  const fields = parseCsvLine('"FOO","She said ""hi""","Equity"');
  assertEquals(fields[1], 'She said "hi"');
});

Deno.test('(3) findHeaderRowIndex locates the Ticker header past the preamble', () => {
  const lines = SAMPLE_CSV.split('\n').filter((l) => l.length > 0);
  const idx = findHeaderRowIndex(lines);
  assert(idx > 0);
  assert(lines[idx].toLowerCase().includes('ticker'));
});

Deno.test('(4) parseISharesCsv extracts equity rows + skips cash/futures/non-equity', () => {
  const rows = parseISharesCsv(SAMPLE_CSV, 'sp500', AS_OF);
  const tickers = rows.map((r) => r.ticker);
  assertEquals(tickers, ['AAPL', 'MSFT', 'GOOGL']);
  assert(rows.every((r) => r.source === 'ishares'));
  assert(rows.every((r) => r.index === 'sp500'));
  assert(rows.every((r) => r.fetched_at.getTime() === AS_OF.getTime()));
  assertEquals(rows[0].name, 'APPLE INC');
});

Deno.test('(5) parseISharesCsv throws ConstituentFetchError when header missing', () => {
  let threw = false;
  try {
    parseISharesCsv('Just\nrandom\ntext\nno header here', 'sp500', AS_OF);
  } catch (e) {
    threw = true;
    assert(e instanceof ConstituentFetchError);
    assertEquals(e.source, 'ishares');
  }
  assert(threw, 'expected ConstituentFetchError');
});

Deno.test('(6) fetcher throws ConstituentFetchError on non-2xx HTTP', async () => {
  const fetcher = new iSharesConstituentFetcher(async () => ({
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: async () => '',
    json: async () => ({}),
  }));
  await assertRejects(
    () => fetcher.fetchConstituents('sp500', AS_OF),
    ConstituentFetchError,
    'HTTP 503',
  );
});

Deno.test('(7) fetcher returns null when CSV parses to zero equity rows', async () => {
  const emptyCsv = [
    'Some preamble',
    '"Ticker","Name","Asset Class"',
    '"-","CASH","Cash"',
  ].join('\n');
  const fetcher = new iSharesConstituentFetcher(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => emptyCsv,
    json: async () => ({}),
  }));
  const result = await fetcher.fetchConstituents('sp500', AS_OF);
  assertEquals(result, null);
});

Deno.test('(8) fetcher returns parsed rows on success and stamps as_of from caller', async () => {
  const fetcher = new iSharesConstituentFetcher(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => SAMPLE_CSV,
    json: async () => ({}),
  }));
  const result = await fetcher.fetchConstituents('sp500', AS_OF);
  assert(result !== null);
  assertEquals(result!.length, 3);
  assertEquals(result![0].fetched_at.getTime(), AS_OF.getTime());
});
