/**
 * insider-discovery-egress_test — F2.b producer hermetic suite.
 *
 * No network. No real EDGAR. No Supabase. Every IO surface is injected via
 * `RunDeps` or the constructor of `EdgarDailyIndexFetcher` (`HttpFetch`
 * shape). Covers the operator's five fixtures from the F2.b greenlight:
 *   (a) master.idx parse → REST payload shape
 *   (b) multi-day backfill weekday iteration (skips weekends + NYSE holidays)
 *   (c) empty-day heartbeat insert (both empty-entries and 404 unavailable)
 *   (d) SEC-API failure surfacing (EdgarFetchError → caller maps to exit 1)
 *   (e) arg validation (exit 3 surface)
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  EdgarDailyIndexFetcher,
} from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-daily-index-fetcher.ts';
import { EdgarFetchError } from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-cik-mapper.ts';
import {
  buildHeartbeatRow,
  HEARTBEAT_ACCESSION_NUMBER,
  HEARTBEAT_ISSUER_CIK,
  buildUniverseEntryPredicate,
  iterateTradingDays,
  makeRestInserter,
  normalizeFilerCikForUniverse,
  parseArgs,
  rowFromEntry,
  runDiscoveryDay,
  runMode,
  type DiscoveryRow,
  type RunDeps,
} from './insider-discovery-egress.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Verbatim master.idx body shape: header, dashed delimiter, 5-col pipe rows. */
function fixtureMasterBody(): string {
  return [
    'Description: Master Index of EDGAR Dissemination Feed',
    '',
    'CIK|Company Name|Form Type|Date Filed|Filename',
    '----------------------------------------------------',
    '320193|APPLE INC|4|2026-06-12|edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm',
    '789019|MICROSOFT CORP|4/A|2026-06-12|edgar/data/789019/000078901926000044/0000789019-26-000044-index.htm',
    '1000045|NICHOLAS FINANCIAL INC|10-K|2026-06-12|edgar/data/1000045/000100004526000099/0001000045-26-000099-index.htm',
    '1018724|AMAZON COM INC|8-K|2026-06-12|edgar/data/1018724/000101872426000111/0001018724-26-000111-index.htm',
  ].join('\n');
}

/** Real SEC master.20260605.idx row shape: `File Name` header + compact date. */
function fixtureRealMasterNvdaBody(): string {
  return [
    'Description:           Daily Index of EDGAR Dissemination Feed',
    'Last Data Received:    Jun 5, 2026',
    'Comments:              webmaster@sec.gov',
    'Anonymous FTP:         ftp://ftp.sec.gov/edgar/',
    ' ',
    'CIK|Company Name|Form Type|Date Filed|File Name',
    '--------------------------------------------------------------------------------',
    '1045810|NVIDIA CORP|4|20260605|edgar/data/1045810/0001768670-26-000002.txt',
    '320193|APPLE INC|8-K|20260605|edgar/data/320193/0000320193-26-000099.txt',
  ].join('\n');
}

/** Build an `EdgarDailyIndexFetcher` with an injected `fetch` returning `body`. */
function fetcherReturning(body: string, status = 200): EdgarDailyIndexFetcher {
  const httpFetch = (_url: string, _init?: unknown) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'NOT FOUND',
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({}),
    });
  return new EdgarDailyIndexFetcher('test@example.com', httpFetch);
}

/** Capture-everything inserter. */
function captureInserter(): { insertRows: (r: readonly DiscoveryRow[]) => Promise<void>; calls: DiscoveryRow[][] } {
  const calls: DiscoveryRow[][] = [];
  return {
    insertRows: (rows) => {
      calls.push([...rows]);
      return Promise.resolve();
    },
    calls,
  };
}

function makeDeps(opts: {
  fetcher: EdgarDailyIndexFetcher;
  insertRows?: (r: readonly DiscoveryRow[]) => Promise<void>;
  discoveredBy?: 'gha-daily' | 'backfill-oneshot';
}): RunDeps {
  return {
    fetcher: opts.fetcher,
    insertRows: opts.insertRows ?? (() => Promise.resolve()),
    correlationId: 'corr-test-0001',
    discoveredBy: opts.discoveredBy ?? 'gha-daily',
    log: () => {}, // silence test output
  };
}

// ---------------------------------------------------------------------------
// (a) master.idx parse → REST payload shape
// ---------------------------------------------------------------------------

Deno.test('(a) parses master.idx and emits exactly the Form-4/4-A rows in the REST payload shape', async () => {
  const cap = captureInserter();
  const deps = makeDeps({ fetcher: fetcherReturning(fixtureMasterBody()), insertRows: cap.insertRows });

  const outcome = await runDiscoveryDay('2026-06-12', deps);

  assertEquals(outcome.rows_inserted, 2, 'only Form 4 + Form 4/A survive the post-parse filter');
  assertEquals(outcome.heartbeat_inserted, false);
  assertEquals(cap.calls.length, 1, 'exactly one batch INSERT');
  const payload = cap.calls[0];
  assertEquals(payload.length, 2);

  // Form 4 — AAPL
  assertEquals(payload[0], {
    as_of_date: '2026-06-12',
    issuer_cik: '0000320193',
    accession_number: '0000320193-26-000077',
    form_type: '4',
    company_name: 'APPLE INC',
    filename: 'edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm',
    discovered_by: 'gha-daily',
    discovery_correlation_id: 'corr-test-0001',
  });
  // Form 4/A — MSFT
  assertEquals(payload[1].issuer_cik, '0000789019');
  assertEquals(payload[1].form_type, '4/A');
  assertEquals(payload[1].accession_number, '0000789019-26-000044');

  // Pure-helper parity (rowFromEntry produces the same shape — drift sentinel).
  const e = {
    form_type: '4' as const,
    filer_cik: '320193',
    company_name: 'APPLE INC',
    date_filed: '2026-06-12',
    filename: 'edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm',
    accession_number: '0000320193-26-000077',
  };
  assertEquals(rowFromEntry(e, '2026-06-12', 'gha-daily', 'corr-test-0001'), payload[0]);
});

Deno.test('(a2) real master.idx NVDA row: File Name header + YYYYMMDD date parse, CIK normalized to universe 10-digit operand', async () => {
  const cap = captureInserter();
  const universeCik10 = new Set(['0001045810']);
  const deps = makeDeps({ fetcher: fetcherReturning(fixtureRealMasterNvdaBody()), insertRows: cap.insertRows });
  deps.isUniverseEntry = buildUniverseEntryPredicate(universeCik10);

  const outcome = await runDiscoveryDay('2026-06-05', deps);

  assertEquals(outcome.entries_parsed, 1);
  assertEquals(outcome.entries_after_universe_filter, 1);
  assertEquals(outcome.rows_inserted, 1);
  assertEquals(cap.calls[0][0], {
    as_of_date: '2026-06-05',
    issuer_cik: '0001045810',
    accession_number: '0001768670-26-000002',
    form_type: '4',
    company_name: 'NVIDIA CORP',
    filename: 'edgar/data/1045810/0001768670-26-000002.txt',
    discovered_by: 'gha-daily',
    discovery_correlation_id: 'corr-test-0001',
  });
  assertEquals(normalizeFilerCikForUniverse('1045810'), '0001045810');
});

Deno.test('(a3) in-universe predicate compares padded master.idx filer CIK to padded universe CIKs', async () => {
  const cap = captureInserter();
  const deps = makeDeps({ fetcher: fetcherReturning(fixtureRealMasterNvdaBody()), insertRows: cap.insertRows });
  deps.isUniverseEntry = buildUniverseEntryPredicate(new Set(['0000320193']));

  const outcome = await runDiscoveryDay('2026-06-05', deps);

  assertEquals(outcome.entries_parsed, 1);
  assertEquals(outcome.entries_after_universe_filter, 0);
  assertEquals(outcome.rows_inserted, 0);
  assertEquals(outcome.heartbeat_inserted, true);
  assertEquals(cap.calls[0][0].issuer_cik, HEARTBEAT_ISSUER_CIK);
});

// ---------------------------------------------------------------------------
// (b) multi-day backfill weekday iteration — skips weekends AND NYSE holidays
// ---------------------------------------------------------------------------

Deno.test('(b) iterateTradingDays skips weekends and the 2026-05-25 Memorial Day holiday', () => {
  // Mon 2026-05-25 (Memorial Day, NYSE-closed) ... Sun 2026-05-31
  // Expected trading days: Tue 26, Wed 27, Thu 28, Fri 29.
  const days = iterateTradingDays('2026-05-25', '2026-05-31');
  assertEquals(days, ['2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29']);
});

Deno.test('(b) backfill mode drives runDiscoveryDay per iterated trading day', async () => {
  const cap = captureInserter();
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureMasterBody()),
    insertRows: cap.insertRows,
    discoveredBy: 'backfill-oneshot',
  });
  // Wed 2026-06-10 → Fri 2026-06-12 (three trading days, no holiday).
  const outcomes = await runMode(
    { kind: 'backfill', from: '2026-06-10', to: '2026-06-12' },
    deps,
  );
  assertEquals(outcomes.length, 3);
  assertEquals(outcomes.map((o) => o.as_of_date), ['2026-06-10', '2026-06-11', '2026-06-12']);
  assertEquals(cap.calls.length, 3);
  // discovered_by is stamped per-row at the producer side.
  assertEquals(cap.calls[0][0].discovered_by, 'backfill-oneshot');
});

// ---------------------------------------------------------------------------
// (c) empty-day heartbeat insert — both empty-entries AND 404 unavailable
// ---------------------------------------------------------------------------

Deno.test('(c1) empty Form-4 day inserts exactly one heartbeat sentinel row', async () => {
  const emptyBody = [
    'CIK|Company Name|Form Type|Date Filed|Filename',
    '----------------------------------------------------',
    '1000045|FILER INC|10-K|2026-06-12|edgar/data/1000045/000100004526000099/0001000045-26-000099-index.htm',
  ].join('\n');
  const cap = captureInserter();
  const deps = makeDeps({ fetcher: fetcherReturning(emptyBody), insertRows: cap.insertRows });

  const outcome = await runDiscoveryDay('2026-06-12', deps);
  assertEquals(outcome.rows_inserted, 0);
  assertEquals(outcome.heartbeat_inserted, true);
  assertEquals(outcome.data_unavailable, false);
  assertEquals(cap.calls.length, 1);
  assertEquals(cap.calls[0].length, 1, 'exactly ONE heartbeat row, not a batch');
  const hb = cap.calls[0][0];
  assertEquals(hb.issuer_cik, HEARTBEAT_ISSUER_CIK);
  assertEquals(hb.accession_number, HEARTBEAT_ACCESSION_NUMBER);
  assertEquals(hb.form_type, '4', 'heartbeat uses CHECK-valid form_type');
  assertEquals(hb.as_of_date, '2026-06-12');
  assertEquals(hb.discovery_correlation_id, 'corr-test-0001');
});

Deno.test('(c2) 404 unavailable day inserts heartbeat and marks data_unavailable', async () => {
  const cap = captureInserter();
  const deps = makeDeps({ fetcher: fetcherReturning('', 404), insertRows: cap.insertRows });
  const outcome = await runDiscoveryDay('2026-06-12', deps);
  assertEquals(outcome.rows_inserted, 0);
  assertEquals(outcome.heartbeat_inserted, true);
  assertEquals(outcome.data_unavailable, true);
  assertEquals(cap.calls[0][0].issuer_cik, HEARTBEAT_ISSUER_CIK);
});

Deno.test('(c3) buildHeartbeatRow shape — sentinels + CHECK-valid form_type', () => {
  const hb = buildHeartbeatRow('2026-06-12', 'backfill-oneshot', 'corr-xyz');
  assertEquals(hb.as_of_date, '2026-06-12');
  assertEquals(hb.issuer_cik, '__heartbeat__');
  assertEquals(hb.accession_number, '__heartbeat__');
  assertEquals(hb.form_type, '4');
  assertEquals(hb.discovered_by, 'backfill-oneshot');
  assertEquals(hb.discovery_correlation_id, 'corr-xyz');
  // The CHECK constraint allows only '4' | '4/A' — assert literal-typed.
  assert(hb.form_type === '4' || hb.form_type === '4/A');
});

Deno.test('(c4) makeRestInserter logs and returns structural write evidence for external-write verification', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const logs: string[] = [];
  console.log = (line: string) => { logs.push(line); };
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    assertEquals(init?.method, 'POST');
    assertEquals((init?.headers as Record<string, string>)?.Prefer, 'resolution=ignore-duplicates,return=minimal');
    return Promise.resolve(new Response('', {
      status: 201,
      headers: { 'Preference-Applied': 'resolution=ignore-duplicates, return=minimal' },
    }));
  }) as never;
  try {
    const insertRows = makeRestInserter({ supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'service-role' });
    const result = await insertRows([rowFromEntry({
      form_type: '4',
      filer_cik: '1045810',
      company_name: 'NVIDIA CORP',
      date_filed: '2026-06-05',
      filename: 'edgar/data/1045810/0001768670-26-000002.txt',
      accession_number: '0001768670-26-000002',
    }, '2026-06-05', 'gha-daily', 'corr-verify')]);
    assertEquals(result, {
      attempted: 1,
      status: 201,
      preferenceApplied: 'resolution=ignore-duplicates, return=minimal',
    });
    assertEquals(JSON.parse(logs[0]).event, 'insider_discovery_supabase_insert');
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

// ---------------------------------------------------------------------------
// (d) SEC-API failure surfacing — EdgarFetchError bubbles unchanged
// ---------------------------------------------------------------------------

Deno.test('(d) SEC HTTP 403 throws EdgarFetchError (caller maps to exit 1)', async () => {
  const fetcher = fetcherReturning('access denied', 403);
  const cap = captureInserter();
  const deps = makeDeps({ fetcher, insertRows: cap.insertRows });
  await assertRejects(
    () => runDiscoveryDay('2026-06-12', deps),
    EdgarFetchError,
    'HTTP 403',
  );
  assertEquals(cap.calls.length, 0, 'no Supabase insert when SEC fetch fails');
});

Deno.test('(d) SEC network throw bubbles as EdgarFetchError', async () => {
  const httpFetch = () => Promise.reject(new Error('ENETUNREACH'));
  const fetcher = new EdgarDailyIndexFetcher('test@example.com', httpFetch as never);
  const deps = makeDeps({ fetcher });
  await assertRejects(
    () => runDiscoveryDay('2026-06-12', deps),
    EdgarFetchError,
    'network error',
  );
});

// ---------------------------------------------------------------------------
// (e) argument validation — exit-3 surface
// ---------------------------------------------------------------------------

Deno.test('(e) parseArgs — daily mode happy path', () => {
  const r = parseArgs(['--as-of=2026-06-12']);
  assertEquals(r.kind, 'ok');
  if (r.kind === 'ok') assertEquals(r.mode, { kind: 'daily', asOf: '2026-06-12' });
});

Deno.test('(e) parseArgs — backfill mode happy path', () => {
  const r = parseArgs(['--backfill-from=2026-03-15', '--backfill-to=2026-06-13']);
  assertEquals(r.kind, 'ok');
  if (r.kind === 'ok') {
    assertEquals(r.mode, { kind: 'backfill', from: '2026-03-15', to: '2026-06-13' });
  }
});

Deno.test('(e) parseArgs rejects mode mixing (--as-of with --backfill-*)', () => {
  const r = parseArgs(['--as-of=2026-06-12', '--backfill-from=2026-03-15', '--backfill-to=2026-06-13']);
  assertEquals(r.kind, 'error');
});

Deno.test('(e) parseArgs rejects missing flags', () => {
  assertEquals(parseArgs([]).kind, 'error');
  assertEquals(parseArgs(['--backfill-from=2026-03-15']).kind, 'error');
});

Deno.test('(e) parseArgs rejects malformed dates and inverted ranges', () => {
  assertEquals(parseArgs(['--as-of=2026/06/12']).kind, 'error');
  assertEquals(parseArgs(['--as-of=not-a-date']).kind, 'error');
  assertEquals(parseArgs(['--backfill-from=2026-06-13', '--backfill-to=2026-03-15']).kind, 'error');
});

Deno.test('(e) parseArgs rejects unknown args', () => {
  const r = parseArgs(['--as-of=2026-06-12', '--unknown=x']);
  assertEquals(r.kind, 'error');
});