// @ts-nocheck — Deno test file; runs via `deno test`.
import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EdgarDailyIndexFetcher,
  DAILY_INDEX_OPERATION_ID,
  MASTER_INDEX_OPERATION_ID,
  dailyIndexUrl,
  parseAccessionFromFilename,
  parseDailyIndexBody,
  quarterOf,
} from './edgar-daily-index-fetcher.ts';
import { EdgarFetchError } from './edgar-cik-mapper.ts';
import type { EdgarFetchTelemetryEvent } from './edgar-fetch-telemetry.ts';

function textResp(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'ERR',
    text: async () => body,
    json: async () => ({}),
  };
}

// --- F1.a master.idx fixtures (ACT-199): pipe-delimited 5-column
// rows shaped from the real master.20260611.idx envelope (header text
// + dashed delimiter + data). Two fixtures — one mixed-form-type that
// proves the post-parse Form 4 / 4/A filter; one Form-4-only that
// proves filter-identity (no row dropped when every input row already
// passes).

const FIXTURE_MASTER_MIXED = `Description:           Master Index of EDGAR Dissemination Feed by Filing Date
Last Data Received:    June 11, 2026
Comments:              webmaster@sec.gov
Anonymous FTP:         ftp://ftp.sec.gov/edgar/




CIK|Company Name|Form Type|Date Filed|Filename
--------------------------------------------------------------------------------
1018724|AMAZON COM INC|4|2026-06-11|edgar/data/1018724/000101872426000123/0001018724-26-000123-index.htm
320193|APPLE INC|4|2026-06-11|edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm
1953967|NEXTRACKER INC|4/A|2026-06-11|edgar/data/1953967/000195396726000045/0001953967-26-000045-index.htm
1571996|DELL TECHNOLOGIES INC|8-K|2026-06-11|edgar/data/1571996/000157199626000022/0001571996-26-000022-index.htm
1045810|NVIDIA CORP|10-K|2026-06-11|edgar/data/1045810/000104581026000033/0001045810-26-000033-index.htm
798941|FIRST CITIZENS BANCSHARES INC|4|2026-06-11|edgar/data/798941/000079894126000008/0000798941-26-000008-index.htm
1326801|META PLATFORMS INC|3|2026-06-11|edgar/data/1326801/000132680126000099/0001326801-26-000099-index.htm
`;

const FIXTURE_MASTER_FORM4_ONLY = `Description:           Master Index of EDGAR Dissemination Feed by Filing Date
Last Data Received:    June 12, 2026
Comments:              webmaster@sec.gov
Anonymous FTP:         ftp://ftp.sec.gov/edgar/




CIK|Company Name|Form Type|Date Filed|Filename
--------------------------------------------------------------------------------
320193|APPLE INC|4|2026-06-12|edgar/data/320193/000032019326000078/0000320193-26-000078-index.htm
1018724|AMAZON COM INC|4|2026-06-12|edgar/data/1018724/000101872426000124/0001018724-26-000124-index.htm
1953967|NEXTRACKER INC|4/A|2026-06-12|edgar/data/1953967/000195396726000046/0001953967-26-000046-index.htm
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

Deno.test('(2) dailyIndexUrl builds master.{YYYYMMDD}.idx path with QTR (F1.a pivot)', () => {
  assertEquals(
    dailyIndexUrl(new Date('2026-06-11T12:00:00Z')),
    'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR2/master.20260611.idx',
  );
  // Quarter boundary
  assertEquals(
    dailyIndexUrl(new Date('2026-04-01T00:00:00Z')),
    'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR2/master.20260401.idx',
  );
  assertEquals(
    dailyIndexUrl(new Date('2026-03-31T23:00:00Z')),
    'https://www.sec.gov/Archives/edgar/daily-index/2026/QTR1/master.20260331.idx',
  );
});

Deno.test('(2b) DRIFT SENTINEL — dailyIndexUrl MUST emit master.{8-digit}.idx, NEVER form.* (F1.a regression pin, ACT-199)', () => {
  // The Phase-4 F1 blocker was scoped to `form.{YYYYMMDD}.idx` only;
  // master.{YYYYMMDD}.idx in the same path family returns 200. A
  // regression that reverts the URL to `form.` would re-open the
  // blocker. Pin both invariants: master-required AND form-forbidden.
  const samples = [
    new Date('2026-01-02T00:00:00Z'),
    new Date('2026-03-31T23:59:59Z'),
    new Date('2026-06-11T12:00:00Z'),
    new Date('2026-09-30T00:00:00Z'),
    new Date('2026-12-31T00:00:00Z'),
  ];
  for (const d of samples) {
    const url = dailyIndexUrl(d);
    assertMatch(url, /\/master\.\d{8}\.idx$/,
      `F1.a drift: URL must end in /master.{YYYYMMDD}.idx — got ${url}`);
    assertNotMatch(url, /\/form\.\d{8}\.idx$/,
      `F1.a regression: URL must NOT use /form.{YYYYMMDD}.idx — got ${url}`);
    assertStringIncludes(url, '/daily-index/');
  }
});

Deno.test('(2c) operation id alias — MASTER_INDEX_OPERATION_ID is canonical; DAILY_INDEX_OPERATION_ID is back-compat alias', () => {
  assertEquals(MASTER_INDEX_OPERATION_ID, 'edgar_master_index');
  // Back-compat alias must point to the same value (one source of truth).
  assertEquals(DAILY_INDEX_OPERATION_ID, MASTER_INDEX_OPERATION_ID);
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

Deno.test('(4) parseDailyIndexBody (mixed-form fixture) filters to Form 4 / 4/A only via post-parse filter (F1.a master.idx)', () => {
  const entries = parseDailyIndexBody(FIXTURE_MASTER_MIXED);
  // 3× "4" + 1× "4/A"; 8-K + 10-K + 3 are all dropped post-parse.
  assertEquals(entries.length, 4);
  const types = entries.map((e) => e.form_type).sort();
  assertEquals(types, ['4', '4', '4', '4/A']);
  const amzn = entries.find((e) => e.filer_cik === '1018724');
  assert(amzn !== undefined);
  assertEquals(amzn.accession_number, '0001018724-26-000123');
  assertEquals(amzn.form_type, '4');
  assertEquals(amzn.date_filed, '2026-06-11');
  assertEquals(amzn.company_name, 'AMAZON COM INC');
});

Deno.test('(4b) parseDailyIndexBody (Form-4-only fixture) — filter identity: every input row survives', () => {
  const entries = parseDailyIndexBody(FIXTURE_MASTER_FORM4_ONLY);
  // 3 input rows, all Form 4 / 4/A; filter-identity surface.
  assertEquals(entries.length, 3);
  const types = entries.map((e) => e.form_type).sort();
  assertEquals(types, ['4', '4', '4/A']);
  // Spot-check ordering preserved (parser is stable wrt input order).
  assertEquals(entries[0].filer_cik, '320193');
  assertEquals(entries[1].filer_cik, '1018724');
  assertEquals(entries[2].filer_cik, '1953967');
  assertEquals(entries[2].accession_number, '0001953967-26-000046');
});

Deno.test('(5) parseDailyIndexBody returns [] on a body lacking the expected header', () => {
  assertEquals(parseDailyIndexBody('garbage\nno header here\n'), []);
  assertEquals(parseDailyIndexBody(''), []);
  // Body with the OLD form.idx fixed-width header must also return []
  // — the master.idx parser does not silently misread the legacy shape.
  const legacyHeader = [
    'Form Type   Company Name   CIK   Date Filed   Filename',
    '------------------------------------------------------',
    '4           APPLE INC      320193   2026-06-11   edgar/data/320193/000032019326000077/x.htm',
  ].join('\n');
  assertEquals(parseDailyIndexBody(legacyHeader), []);
});

Deno.test('(6) fetchDay happy path hits master.{YYYYMMDD}.idx and returns kind=rows', async () => {
  let calledUrl = '';
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    calledUrl = url;
    assert(init?.headers?.['User-Agent']?.includes('Lovable-Crosswind/'));
    assertEquals(init?.headers?.['Accept-Encoding'], 'identity');
    return textResp(FIXTURE_MASTER_MIXED);
  };
  const fetcher = new EdgarDailyIndexFetcher('ops@example.com', fetch);
  const result = await fetcher.fetchDay(new Date('2026-06-11T00:00:00Z'));
  assertStringIncludes(calledUrl, 'master.20260611.idx');
  assertNotMatch(calledUrl, /\/form\.\d{8}\.idx$/);
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

Deno.test('(10) INC-73-family telemetry — fetchDay emits structured event with status + path_family + correlation_id (F1.a, ACT-199)', async () => {
  const events: EdgarFetchTelemetryEvent[] = [];
  const telemetry = (e: EdgarFetchTelemetryEvent) => { events.push(e); };
  const fetch = async () => textResp(FIXTURE_MASTER_FORM4_ONLY);
  const fetcher = new EdgarDailyIndexFetcher(
    'ops@example.com',
    fetch,
    'fp-050-insider/0.1',
    telemetry,
    'corr-abc-123',
  );
  const result = await fetcher.fetchDay(new Date('2026-06-12T00:00:00Z'));
  assertEquals(result.kind, 'rows');
  assertEquals(events.length, 1);
  assertEquals(events[0].op, MASTER_INDEX_OPERATION_ID);
  assertEquals(events[0].path_family, 'master_index');
  assertEquals(events[0].status, 200);
  assertEquals(events[0].correlation_id, 'corr-abc-123');
  assertStringIncludes(events[0].url, '/master.20260612.idx');
});

Deno.test('(11) INC-73-family telemetry — 403 path also emits event with status=403 (path-family-tag enables F1-class pivot evidence)', async () => {
  const events: EdgarFetchTelemetryEvent[] = [];
  const fetch = async () => textResp('blocked', 403);
  const fetcher = new EdgarDailyIndexFetcher(
    'ops@example.com',
    fetch,
    'fp-050-insider/0.1',
    (e) => { events.push(e); },
    'corr-403-test',
  );
  await assertRejects(() => fetcher.fetchDay(new Date('2026-06-11T00:00:00Z')), EdgarFetchError);
  assertEquals(events.length, 1);
  assertEquals(events[0].status, 403);
  assertEquals(events[0].path_family, 'master_index');
  assertEquals(events[0].correlation_id, 'corr-403-test');
});

Deno.test('(12) INC-73-family telemetry — network throw emits event with status=0 (zero-status sentinel for pre-response failures)', async () => {
  const events: EdgarFetchTelemetryEvent[] = [];
  const fetch = async () => { throw new Error('socket reset'); };
  const fetcher = new EdgarDailyIndexFetcher(
    'ops@example.com',
    fetch,
    'fp-050-insider/0.1',
    (e) => { events.push(e); },
    'corr-net-fail',
  );
  await assertRejects(() => fetcher.fetchDay(new Date('2026-06-11T00:00:00Z')), EdgarFetchError);
  assertEquals(events.length, 1);
  assertEquals(events[0].status, 0);
  assertEquals(events[0].path_family, 'master_index');
});

Deno.test('(13) telemetry callback throwing MUST NOT break fetchDay (defensive swallow)', async () => {
  const fetch = async () => textResp(FIXTURE_MASTER_FORM4_ONLY);
  const fetcher = new EdgarDailyIndexFetcher(
    'ops@example.com',
    fetch,
    'fp-050-insider/0.1',
    () => { throw new Error('telemetry exploded'); },
    'corr-explode',
  );
  const result = await fetcher.fetchDay(new Date('2026-06-12T00:00:00Z'));
  assertEquals(result.kind, 'rows');
});