// @ts-nocheck — Deno test file; runs via `deno test`.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EdgarDailyIndexFetcher,
  dailyIndexUrl,
  parseAccessionFromFilename,
  parseDailyIndexBody,
  quarterOf,
} from './edgar-daily-index-fetcher.ts';
import { EdgarFetchError } from './edgar-cik-mapper.ts';

function textResp(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'ERR',
    text: async () => body,
    json: async () => ({}),
  };
}

// --- B2 fixture: shape mirrors the real form.20260611.idx (5 columns,
// header + delimiter + rows). Smaller than the 4527-row real one but
// structurally identical so the parser exercises the same column logic.
const FIXTURE_IDX = `Description:           Form Index
Last Data Received:    June 11, 2026
Comments:              webmaster@sec.gov
Anonymous FTP:         ftp://ftp.sec.gov/edgar/






Form Type   Company Name                                                  CIK         Date Filed   Filename
-----------------------------------------------------------------------------------------------------------------
4           AMAZON COM INC                                                1018724     2026-06-11   edgar/data/1018724/000101872426000123/0001018724-26-000123-index.htm
4           APPLE INC                                                     320193      2026-06-11   edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm
4/A         NEXTRACKER INC                                                1953967     2026-06-11   edgar/data/1953967/000195396726000045/0001953967-26-000045-index.htm
8-K         DELL TECHNOLOGIES INC                                         1571996     2026-06-11   edgar/data/1571996/000157199626000022/0001571996-26-000022-index.htm
10-K        NVIDIA CORP                                                   1045810     2026-06-11   edgar/data/1045810/000104581026000033/0001045810-26-000033-index.htm
4           FIRST CITIZENS BANCSHARES INC                                 798941      2026-06-11   edgar/data/798941/000079894126000008/0000798941-26-000008-index.htm
`;

Deno.test('(1) quarterOf maps months 1-3=Q1, 4-6=Q2, 7-9=Q3, 10-12=Q4', () => {
  assertEquals(quarterOf(new Date('2026-01-15T00:00:00Z')), 1);
  assertEquals(quarterOf(new Date('2026-03-31T00:00:00Z')), 1);
  assertEquals(quarterOf(new Date('2026-04-01T00:00:00Z')), 2);
  assertEquals(quarterOf(new Date('2026-06-30T00:00:00Z')), 2);
  assertEquals(quarterOf(new Date('2026-07-01T00:00:00Z')), 3);
  assertEquals(quarterOf(new Date('2026-09-30T00:00:00Z')), 3);
  assertEquals(quarterOf(new Date('2026-10-01T00:00:00Z')), 4);
  assertEquals(quarterOf(new Date('2026-12-31T00:00:00Z')), 4);
});

Deno.test('(2) dailyIndexUrl builds correct path with QTR + YYYYMMDD', () => {
  assertEquals(
    dailyIndexUrl(new Date('2026-06-11T12:00:00Z')),
    'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR2/form.20260611.idx',
  );
  // Quarter boundary
  assertEquals(
    dailyIndexUrl(new Date('2026-04-01T00:00:00Z')),
    'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR2/form.20260401.idx',
  );
  assertEquals(
    dailyIndexUrl(new Date('2026-03-31T23:00:00Z')),
    'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR1/form.20260331.idx',
  );
});

Deno.test('(3) parseAccessionFromFilename handles dashed and flat shapes', () => {
  assertEquals(
    parseAccessionFromFilename('edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm'),
    '0000320193-26-000077',
  );
  assertEquals(
    parseAccessionFromFilename('edgar/data/320193/000032019326000077/somefile.txt'),
    '0000320193-26-000077',
  );
  assertEquals(parseAccessionFromFilename('not-an-accession.htm'), null);
});

Deno.test('(4) parseDailyIndexBody filters to Form 4 / 4/A only and extracts accession', () => {
  const entries = parseDailyIndexBody(FIXTURE_IDX);
  assertEquals(entries.length, 4); // 3× "4" + 1× "4/A"; 8-K and 10-K skipped
  const types = entries.map((e) => e.form_type).sort();
  assertEquals(types, ['4', '4', '4', '4/A']);
  const amzn = entries.find((e) => e.filer_cik === '1018724');
  assert(amzn !== undefined);
  assertEquals(amzn.accession_number, '0001018724-26-000123');
  assertEquals(amzn.form_type, '4');
  assertEquals(amzn.date_filed, '2026-06-11');
  assertEquals(amzn.company_name, 'AMAZON COM INC');
});

Deno.test('(5) parseDailyIndexBody returns [] on a body lacking the expected header', () => {
  assertEquals(parseDailyIndexBody('garbage\nno header here\n'), []);
  assertEquals(parseDailyIndexBody(''), []);
});

Deno.test('(6) fetchDay happy path returns kind=rows with parsed entries', async () => {
  let calledUrl = '';
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    calledUrl = url;
    assert(init?.headers?.['User-Agent']?.includes('Lovable-Crosswind/'));
    assertEquals(init?.headers?.['Accept-Encoding'], 'identity');
    return textResp(FIXTURE_IDX);
  };
  const fetcher = new EdgarDailyIndexFetcher('ops@example.com', fetch);
  const result = await fetcher.fetchDay(new Date('2026-06-11T00:00:00Z'));
  assertStringIncludes(calledUrl, 'form.20260611.idx');
  assertEquals(result.kind, 'rows');
  if (result.kind === 'rows') {
    assertEquals(result.date, '2026-06-11');
    assertEquals(result.entries.length, 4);
  }
});

Deno.test('(7) fetchDay 404 (holiday / no-index) → kind=unavailable, never throws', async () => {
  const fetch = async () => textResp('', 404);
  const fetcher = new EdgarDailyIndexFetcher('ops@example.com', fetch);
  const result = await fetcher.fetchDay(new Date('2026-12-25T00:00:00Z'));
  assertEquals(result.kind, 'unavailable');
  if (result.kind === 'unavailable') {
    assertEquals(result.reason, 'data_unavailable');
    assertEquals(result.date, '2026-12-25');
  }
});

Deno.test('(8) fetchDay non-404/non-2xx → EdgarFetchError', async () => {
  const fetch = async () => textResp('blocked', 403);
  const fetcher = new EdgarDailyIndexFetcher('ops@example.com', fetch);
  await assertRejects(
    () => fetcher.fetchDay(new Date('2026-06-11T00:00:00Z')),
    EdgarFetchError,
    'HTTP 403',
  );
});

Deno.test('(9) fetchDay network throw wraps to EdgarFetchError', async () => {
  const fetch = async () => { throw new Error('socket reset'); };
  const fetcher = new EdgarDailyIndexFetcher('ops@example.com', fetch);
  await assertRejects(
    () => fetcher.fetchDay(new Date('2026-06-11T00:00:00Z')),
    EdgarFetchError,
    'network error',
  );
});