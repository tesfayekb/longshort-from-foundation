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
  EdgarSubmissionsFetcher,
  type EdgarSubmissionsResult,
} from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-submissions-fetcher.ts';
import {
  buildHeartbeatRow,
  EPOCH_ACCEPTANCE,
  HEARTBEAT_ACCESSION_NUMBER,
  HEARTBEAT_ISSUER_CIK,
  HEARTBEAT_TICKER,
  buildUniverseEntryPredicate,
  iterateTradingDays,
  loadUniverseCikToTicker,
  makeRestInserter,
  normalizeFilerCikForUniverse,
  parseArgs,
  rowFromEntry,
  runDiscoveryDay,
  runMode,
  runModeWithSummary,
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

/**
 * ACT-215: stub submissions fetcher. Returns a `resolved` result keyed
 * by accession_number — the producer cross-walks acceptance from this
 * map onto each `DiscoveryRow`. Per-issuer fetches are invoked once per
 * unique padded CIK; the stub is keyed by CIK and emits the rows
 * relevant to that CIK from `accessionToAcceptance`.
 */
function stubSubmissions(
  accessionToAcceptance: Record<string, { acceptance: string; primary: string; form: '4' | '4/A' }>,
  byCik?: Record<string, string[]>,
): EdgarSubmissionsFetcher {
  const fake = {
    async fetchSubmissions({ cik }: { cik: string | number }): Promise<EdgarSubmissionsResult> {
      const raw = typeof cik === 'number' ? String(cik) : cik;
      const padded = (raw.replace(/^0+/, '') || '0').padStart(10, '0');
      const accs = byCik?.[padded] ?? Object.keys(accessionToAcceptance);
      const rows = accs
        .filter((a) => accessionToAcceptance[a] !== undefined)
        .map((a) => ({
          accession_number: a,
          form: accessionToAcceptance[a].form,
          acceptance_datetime: accessionToAcceptance[a].acceptance,
          primary_document: accessionToAcceptance[a].primary,
        }));
      return { kind: 'resolved', cik10: padded, rows };
    },
  };
  return fake as unknown as EdgarSubmissionsFetcher;
}

/** A submissions stub that ALWAYS reports the issuer's feed as 404. */
function stubSubmissionsUnavailable(): EdgarSubmissionsFetcher {
  const fake = {
    async fetchSubmissions(): Promise<EdgarSubmissionsResult> {
      return { kind: 'unavailable', reason: 'data_unavailable' };
    },
  };
  return fake as unknown as EdgarSubmissionsFetcher;
}

function makeDeps(opts: {
  fetcher: EdgarDailyIndexFetcher;
  submissions?: EdgarSubmissionsFetcher;
  insertRows?: (r: readonly DiscoveryRow[]) => Promise<void>;
  discoveredBy?: 'gha-daily' | 'backfill-oneshot';
  tickerForPaddedCik?: (paddedCik: string) => string | null;
}): RunDeps {
  return {
    fetcher: opts.fetcher,
    submissions: opts.submissions ?? stubSubmissions({}, {}),
    insertRows: opts.insertRows ?? (() => Promise.resolve()),
    correlationId: 'corr-test-0001',
    discoveredBy: opts.discoveredBy ?? 'gha-daily',
    // ACT-220 default: every padded CIK gets a deterministic stub
    // ticker so legacy fixtures don't need a per-row update. Tests
    // that exercise the missing-ticker counter override this.
    tickerForPaddedCik: opts.tickerForPaddedCik ?? ((cik) => `T${cik.replace(/^0+/, '') || '0'}`),
    log: () => {}, // silence test output
  };
}

// ---------------------------------------------------------------------------
// (a) master.idx parse → REST payload shape
// ---------------------------------------------------------------------------

Deno.test('(a) parses master.idx and emits exactly the Form-4/4-A rows in the REST payload shape', async () => {
  const cap = captureInserter();
  const submissions = stubSubmissions({
    '0000320193-26-000077': { acceptance: '2026-06-12T20:01:00.000Z', primary: 'wk-form4_aapl.xml', form: '4' },
    '0000789019-26-000044': { acceptance: '2026-06-12T20:02:00.000Z', primary: 'wk-form4_msft.xml', form: '4/A' },
  }, {
    '0000320193': ['0000320193-26-000077'],
    '0000789019': ['0000789019-26-000044'],
  });
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureMasterBody()),
    insertRows: cap.insertRows,
    submissions,
    tickerForPaddedCik: (cik) => ({ '0000320193': 'AAPL', '0000789019': 'MSFT' }[cik] ?? null),
  });

  const outcome = await runDiscoveryDay('2026-06-12', deps);

  assertEquals(outcome.rows_inserted, 2, 'only Form 4 + Form 4/A survive the post-parse filter');
  assertEquals(outcome.heartbeat_inserted, false);
  assertEquals(outcome.accessions_missing_acceptance, 0);
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
    acceptance_datetime: '2026-06-12T20:01:00.000Z',
    ticker: 'AAPL',
  });
  // Form 4/A — MSFT
  assertEquals(payload[1].issuer_cik, '0000789019');
  assertEquals(payload[1].form_type, '4/A');
  assertEquals(payload[1].accession_number, '0000789019-26-000044');
  assertEquals(payload[1].acceptance_datetime, '2026-06-12T20:02:00.000Z');
  assertEquals(payload[1].ticker, 'MSFT');

  // Pure-helper parity (rowFromEntry produces the same shape — drift sentinel).
  const e = {
    form_type: '4' as const,
    filer_cik: '320193',
    company_name: 'APPLE INC',
    date_filed: '2026-06-12',
    filename: 'edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm',
    accession_number: '0000320193-26-000077',
  };
  assertEquals(
    rowFromEntry(e, '2026-06-12', 'gha-daily', 'corr-test-0001', '2026-06-12T20:01:00.000Z', 'AAPL'),
    payload[0],
  );
});

Deno.test('(a2) real master.idx NVDA row: File Name header + YYYYMMDD date parse, CIK normalized to universe 10-digit operand', async () => {
  const cap = captureInserter();
  const universeCik10 = new Set(['0001045810']);
  const submissions = stubSubmissions({
    '0001768670-26-000002': { acceptance: '2026-06-05T21:12:55.000Z', primary: 'wk-form4_nvda.xml', form: '4' },
  }, { '0001045810': ['0001768670-26-000002'] });
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureRealMasterNvdaBody()),
    insertRows: cap.insertRows,
    submissions,
    tickerForPaddedCik: (cik) => ({ '0001045810': 'NVDA' }[cik] ?? null),
  });
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
    acceptance_datetime: '2026-06-05T21:12:55.000Z',
    ticker: 'NVDA',
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
  // ACT-215: heartbeat carries epoch acceptance sentinel.
  assertEquals(cap.calls[0][0].acceptance_datetime, EPOCH_ACCEPTANCE);
});

// ---------------------------------------------------------------------------
// (a4) ACT-215 acceptance cross-walk: missing-acceptance drops + counter
// ---------------------------------------------------------------------------

Deno.test('(a4) ACT-215 — in-universe accession with NO acceptance in submissions feed is DROPPED + counted (MIG-097 §(b) enqueue gate)', async () => {
  const cap = captureInserter();
  // Submissions feed returns ZERO matching rows for the issuer →
  // accession→acceptance map is empty → the AAPL row is dropped.
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureMasterBody()),
    insertRows: cap.insertRows,
    submissions: stubSubmissions({}, {}),
  });
  const outcome = await runDiscoveryDay('2026-06-12', deps);
  assertEquals(outcome.entries_after_universe_filter, 2);
  assertEquals(outcome.rows_inserted, 0, 'rows dropped — no enqueue without acceptance');
  assertEquals(outcome.accessions_missing_acceptance, 2);
  // After-xwalk emptiness still inserts the heartbeat (a day with
  // in-universe entries but zero acceptance is a producer-visible
  // gap; the heartbeat keeps "discovery ran" structurally distinct
  // from "discovery did not run").
  assertEquals(outcome.heartbeat_inserted, true);
  assertEquals(cap.calls[0][0].issuer_cik, HEARTBEAT_ISSUER_CIK);
});

Deno.test('(a5) ACT-215 — submissions feed 404 surfaces in submissions_fetch_status counter; affected accessions drop', async () => {
  const cap = captureInserter();
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureMasterBody()),
    insertRows: cap.insertRows,
    submissions: stubSubmissionsUnavailable(),
  });
  const outcome = await runDiscoveryDay('2026-06-12', deps);
  assertEquals(outcome.rows_inserted, 0);
  assertEquals(outcome.accessions_missing_acceptance, 2);
  const status = outcome.submissions_fetch_status ?? {};
  // Two unique issuers (AAPL CIK + MSFT CIK) → two 404s recorded.
  assertEquals(status['404'], 2);
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
  const submissions = stubSubmissions({
    '0000320193-26-000077': { acceptance: '2026-06-10T20:01:00.000Z', primary: 'wk-form4_aapl.xml', form: '4' },
    '0000789019-26-000044': { acceptance: '2026-06-10T20:02:00.000Z', primary: 'wk-form4_msft.xml', form: '4/A' },
  });
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureMasterBody()),
    insertRows: cap.insertRows,
    discoveredBy: 'backfill-oneshot',
    submissions,
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
  // ACT-215: heartbeat carries the epoch acceptance sentinel so the
  // MIG-097 NOT NULL invariant is satisfied without inventing a
  // future-shaped timestamp.
  assertEquals(hb.acceptance_datetime, EPOCH_ACCEPTANCE);
  // ACT-220 / MIG-098: heartbeat carries the ticker sentinel so the
  // new `ticker NOT NULL` queue invariant is satisfied without
  // inventing a universe ticker that would collide with a real symbol.
  assertEquals(hb.ticker, HEARTBEAT_TICKER);
  assertEquals(hb.ticker, '__heartbeat__');
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
    }, '2026-06-05', 'gha-daily', 'corr-verify', '2026-06-05T21:12:55.000Z', 'NVDA')]);
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

// ─────────────────────────────────────────────────────────────────────
// ACT-220 / Path-Y producer-relocation: drift sentinels
// ─────────────────────────────────────────────────────────────────────

/**
 * Drift sentinel: a single `EdgarCikMapper.loadMap()` call services
 * the entire producer fire — the underlying `company_tickers.json`
 * fetch is issued ONCE per CLI entry, not per day or per issuer.
 * Re-introduction of a per-day or per-issuer mapper construction
 * would silently re-establish the per-cron-isolate SEC dependency
 * the relocation eliminates.
 */
Deno.test('(p1) ACT-220 producer-relocation: loadUniverseCikToTicker triggers exactly ONE underlying mapper.loadMap() call regardless of universe size', async () => {
  let loadMapCalls = 0;
  const stubMapper = {
    async loadMap() {
      loadMapCalls += 1;
      return (ticker: string) => {
        const t = ticker.toUpperCase();
        const cikByTicker: Record<string, number> = { AAPL: 320193, MSFT: 789019, NVDA: 1045810 };
        const cik = cikByTicker[t];
        if (cik === undefined) return { kind: 'unresolved' as const, ticker: t };
        return {
          kind: 'resolved' as const,
          ticker: t,
          cik10: String(cik).padStart(10, '0'),
          source: 'snapshot' as const,
        };
      };
    },
  };
  const map = await loadUniverseCikToTicker(
    ['AAPL', 'MSFT', 'NVDA', 'NOT_IN_SEC'],
    stubMapper as never,
  );
  assertEquals(loadMapCalls, 1, 'loadUniverseCikToTicker MUST call mapper.loadMap() exactly once');
  assertEquals(map.size, 3, 'three resolved tickers; the unresolved one is dropped');
  assertEquals(map.get('0000320193'), 'AAPL');
  assertEquals(map.get('0000789019'), 'MSFT');
  assertEquals(map.get('0001045810'), 'NVDA');
});

/**
 * Drift sentinel: tickerForPaddedCik resolver is consulted per row.
 * An in-universe entry whose padded CIK is absent from the resolver
 * is DROPPED + counted under `tickers_missing_for_cik` (defense-in-
 * depth against producer-time isUniverseEntry / tickerForPaddedCik
 * divergence).
 */
Deno.test('(p2) ACT-220 producer-relocation: missing-ticker entry is dropped + counted (not enqueued with empty ticker)', async () => {
  const cap = captureInserter();
  const submissions = stubSubmissions({
    '0000320193-26-000077': { acceptance: '2026-06-12T20:01:00.000Z', primary: 'p.xml', form: '4' },
    '0000789019-26-000044': { acceptance: '2026-06-12T20:02:00.000Z', primary: 'p.xml', form: '4/A' },
  });
  const deps = makeDeps({
    fetcher: fetcherReturning(fixtureMasterBody()),
    insertRows: cap.insertRows,
    submissions,
    // AAPL has a ticker; MSFT does NOT — should be dropped, not enqueued.
    tickerForPaddedCik: (cik) => (cik === '0000320193' ? 'AAPL' : null),
  });
  const outcome = await runDiscoveryDay('2026-06-12', deps);
  assertEquals(outcome.rows_inserted, 1, 'AAPL enqueued, MSFT dropped (missing ticker)');
  assertEquals(cap.calls[0][0].ticker, 'AAPL');
});

/**
 * ACT-221 pacing sentinel: the per-issuer submissions-feed loop MUST
 * sleep ≥ SUBMISSIONS_PACING_FLOOR_MS (1100ms) between consecutive
 * calls. Surfaced by the post-ACT-220-B repopulation drain
 * (2026-06-14 GHA run; 88% 429-rate on `data.sec.gov/submissions/`
 * — 3939/4451 calls). The pacing call sites is the first call fires
 * immediately; every subsequent call sleeps `pacingMs` BEFORE issuing.
 *
 * Test contract: with 3 unique issuer CIKs the loop MUST issue exactly
 * 2 sleep calls (between calls 1↔2 and 2↔3), each ≥ 1100 ms.
 */
Deno.test('(p3) ACT-221 — per-issuer submissions loop paces consecutive calls at SUBMISSIONS_PACING_FLOOR_MS (1100ms)', async () => {
  const cap = captureInserter();
  const sleepCalls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    sleepCalls.push(ms);
    return Promise.resolve();
  };
  // Three unique issuer CIKs → three submissions calls → exactly 2 sleeps.
  const masterBody = [
    'Description: Master Index',
    '',
    'CIK|Company Name|Form Type|Date Filed|Filename',
    '----------------------------------------------------',
    '320193|APPLE INC|4|2026-06-12|edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm',
    '789019|MICROSOFT CORP|4|2026-06-12|edgar/data/789019/000078901926000044/0000789019-26-000044-index.htm',
    '1045810|NVIDIA CORP|4|2026-06-12|edgar/data/1045810/0001768670-26-000002-index.htm',
  ].join('\n');
  const submissions = stubSubmissions({
    '0000320193-26-000077': { acceptance: '2026-06-12T20:01:00.000Z', primary: 'p.xml', form: '4' },
    '0000789019-26-000044': { acceptance: '2026-06-12T20:02:00.000Z', primary: 'p.xml', form: '4' },
    '0001768670-26-000002': { acceptance: '2026-06-12T20:03:00.000Z', primary: 'p.xml', form: '4' },
  }, {
    '0000320193': ['0000320193-26-000077'],
    '0000789019': ['0000789019-26-000044'],
    '0001045810': ['0001768670-26-000002'],
  });
  const deps: RunDeps = {
    ...makeDeps({
      fetcher: fetcherReturning(masterBody),
      insertRows: cap.insertRows,
      submissions,
      tickerForPaddedCik: (cik) => ({
        '0000320193': 'AAPL',
        '0000789019': 'MSFT',
        '0001045810': 'NVDA',
      }[cik] ?? null),
    }),
    sleep,
  };
  const outcome = await runDiscoveryDay('2026-06-12', deps);
  assertEquals(outcome.rows_inserted, 3, 'all three issuers enqueued');
  // Pacing contract: N-1 sleeps for N unique issuers, each ≥ 1100 ms.
  assertEquals(sleepCalls.length, 2, 'exactly 2 inter-call sleeps for 3 unique issuers');
  assert(sleepCalls[0] >= 1100, `sleep[0]=${sleepCalls[0]} must be >= 1100ms (SEC rate-ceiling floor)`);
  assert(sleepCalls[1] >= 1100, `sleep[1]=${sleepCalls[1]} must be >= 1100ms (SEC rate-ceiling floor)`);
});

/** ACT-221 zero-pacing override: when `submissionsPacingMs=0` the loop
 *  fires back-to-back (test-only escape hatch; production never sets 0). */
Deno.test('(p4) ACT-221 — submissionsPacingMs=0 disables pacing (escape hatch for hermetic suites)', async () => {
  const cap = captureInserter();
  const sleepCalls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    sleepCalls.push(ms);
    return Promise.resolve();
  };
  const submissions = stubSubmissions({
    '0000320193-26-000077': { acceptance: '2026-06-12T20:01:00.000Z', primary: 'p.xml', form: '4' },
    '0000789019-26-000044': { acceptance: '2026-06-12T20:02:00.000Z', primary: 'p.xml', form: '4/A' },
  }, {
    '0000320193': ['0000320193-26-000077'],
    '0000789019': ['0000789019-26-000044'],
  });
  const deps: RunDeps = {
    ...makeDeps({
      fetcher: fetcherReturning(fixtureMasterBody()),
      insertRows: cap.insertRows,
      submissions,
      tickerForPaddedCik: (cik) => ({ '0000320193': 'AAPL', '0000789019': 'MSFT' }[cik] ?? null),
    }),
    sleep,
    submissionsPacingMs: 0,
  };
  await runDiscoveryDay('2026-06-12', deps);
  assertEquals(sleepCalls.length, 0, 'no sleeps when pacing disabled');
});

// ─────────────────────────────────────────────────────────────────────
// ACT-222 / Path-Q producer-side per-issuer submissions DEDUPLICATION
// ─────────────────────────────────────────────────────────────────────

/** Build an `EdgarDailyIndexFetcher` whose response varies by master.idx
 *  URL date suffix (`master.YYYYMMDD.idx`). Keyed by compact YYYYMMDD. */
function fetcherByDay(bodyByYmd: Record<string, string>): EdgarDailyIndexFetcher {
  const httpFetch = (url: string, _init?: unknown) => {
    const m = String(url).match(/master\.(\d{8})\.idx/);
    const ymd = m?.[1] ?? '';
    const body = bodyByYmd[ymd] ?? '';
    const status = body.length > 0 ? 200 : 404;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'NOT FOUND',
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({}),
    });
  };
  return new EdgarDailyIndexFetcher('test@example.com', httpFetch);
}

/** Submissions fetcher that COUNTS calls per padded CIK. */
function countingSubmissions(
  accessionToAcceptance: Record<string, { acceptance: string; primary: string; form: '4' | '4/A' }>,
  byCik: Record<string, string[]>,
): { fetcher: EdgarSubmissionsFetcher; callsByCik: Map<string, number> } {
  const callsByCik = new Map<string, number>();
  const fake = {
    async fetchSubmissions({ cik }: { cik: string | number }): Promise<EdgarSubmissionsResult> {
      const raw = typeof cik === 'number' ? String(cik) : cik;
      const padded = (raw.replace(/^0+/, '') || '0').padStart(10, '0');
      callsByCik.set(padded, (callsByCik.get(padded) ?? 0) + 1);
      const accs = byCik[padded] ?? [];
      const rows = accs
        .filter((a) => accessionToAcceptance[a] !== undefined)
        .map((a) => ({
          accession_number: a,
          form: accessionToAcceptance[a].form,
          acceptance_datetime: accessionToAcceptance[a].acceptance,
          primary_document: accessionToAcceptance[a].primary,
        }));
      return { kind: 'resolved', cik10: padded, rows };
    },
  };
  return { fetcher: fake as unknown as EdgarSubmissionsFetcher, callsByCik };
}

/**
 * (p5) ACT-222 dedup sentinel — within a backfill envelope where issuer
 * CIK 0001045810 (NVDA exemplar) appears in 3 distinct day partitions
 * driven by `runModeWithSummary({kind:'backfill',...})`, the producer
 * fetches `submissions/CIK0001045810.json` EXACTLY ONCE.
 *
 * SCOPE NOTE (ACT-223 docstring correction): (p5) exercises the
 * cross-day dedup ONLY inasmuch as the test entry point is the
 * backfill orchestrator. The narrower per-call dedup-within-a-single-
 * `runDiscoveryDay`-invocation contract is no longer the failure mode
 * Catalog #48 (subsequent firing #2/#3) binds; the architectural
 * contract is the GLOBAL unique-issuer set across the entire fire
 * envelope. (p7) and (p8) are the canonical regression sentinels for
 * that wider contract per ACT-223 / Catalog #43 fixture-scope-mismatch
 * subsequent firing: a "fetch once" contract MUST be exercised at the
 * contract's WIDEST scope, not its narrowest. (p5) is retained as a
 * thin smoke check on the orchestrator dispatch path.
 */
Deno.test('(p5) ACT-222 — NVDA in 3 day partitions ⇒ submissions/CIK0001045810.json fetched EXACTLY ONCE', async () => {
  const cap = captureInserter();
  // Three trading days; NVDA filed on each (3 distinct accession numbers,
  // same issuer CIK). Wed/Thu/Fri 2026-06-10..12.
  const nvdaDay = (ymd: string, acc: string): string =>
    [
      'Description: Daily Index',
      '',
      'CIK|Company Name|Form Type|Date Filed|File Name',
      '----------------------------------------------------',
      `1045810|NVIDIA CORP|4|${ymd}|edgar/data/1045810/${acc}.txt`,
    ].join('\n');
  const fetcher = fetcherByDay({
    '20260610': nvdaDay('20260610', '0001768670-26-000010'),
    '20260611': nvdaDay('20260611', '0001768670-26-000011'),
    '20260612': nvdaDay('20260612', '0001768670-26-000012'),
  });
  const { fetcher: submissions, callsByCik } = countingSubmissions(
    {
      '0001768670-26-000010': { acceptance: '2026-06-10T20:01:00.000Z', primary: 'p.xml', form: '4' },
      '0001768670-26-000011': { acceptance: '2026-06-11T20:01:00.000Z', primary: 'p.xml', form: '4' },
      '0001768670-26-000012': { acceptance: '2026-06-12T20:01:00.000Z', primary: 'p.xml', form: '4' },
    },
    {
      '0001045810': [
        '0001768670-26-000010',
        '0001768670-26-000011',
        '0001768670-26-000012',
      ],
    },
  );
  const deps: RunDeps = {
    ...makeDeps({
      fetcher,
      insertRows: cap.insertRows,
      submissions,
      discoveredBy: 'backfill-oneshot',
      tickerForPaddedCik: (cik) => (cik === '0001045810' ? 'NVDA' : null),
    }),
    sleep: () => Promise.resolve(),
    submissionsPacingMs: 0,
  };
  deps.isUniverseEntry = buildUniverseEntryPredicate(new Set(['0001045810']));

  const summary = await runModeWithSummary(
    { kind: 'backfill', from: '2026-06-10', to: '2026-06-12' },
    deps,
  );

  // Dedup contract: ONE submissions fetch for the single unique CIK,
  // not three (one-per-day).
  assertEquals(callsByCik.get('0001045810'), 1, 'NVDA submissions fetched EXACTLY ONCE across 3 day partitions');
  assertEquals(summary.unique_issuers_fetched, 1);
  assertEquals(summary.total_accessions_processed, 3);
  assertEquals(summary.dedup_ratio, 3, 'dedup_ratio = total_accessions / unique_issuers = 3/1');
  assertEquals(summary.acceptance_xwalk_misses, 0);
  assertEquals(summary.submissions_fetch_status['200'], 1);
});

/**
 * (p6) ACT-222 cross-walk hit-all sentinel: the global acceptance map
 * built in Pass 2 cross-walks correctly across ALL day partitions —
 * each of the 3 NVDA accessions lands in its own day's insert batch
 * with the correct acceptance_datetime stamped on it.
 */
Deno.test('(p6) ACT-222 — cross-walk hits all 3 NVDA accessions across 3 day partitions; each row stamped with correct acceptance', async () => {
  const cap = captureInserter();
  const nvdaDay = (ymd: string, acc: string): string =>
    [
      'Description: Daily Index',
      '',
      'CIK|Company Name|Form Type|Date Filed|File Name',
      '----------------------------------------------------',
      `1045810|NVIDIA CORP|4|${ymd}|edgar/data/1045810/${acc}.txt`,
    ].join('\n');
  const fetcher = fetcherByDay({
    '20260610': nvdaDay('20260610', '0001768670-26-000010'),
    '20260611': nvdaDay('20260611', '0001768670-26-000011'),
    '20260612': nvdaDay('20260612', '0001768670-26-000012'),
  });
  const { fetcher: submissions } = countingSubmissions(
    {
      '0001768670-26-000010': { acceptance: '2026-06-10T20:01:00.000Z', primary: 'p.xml', form: '4' },
      '0001768670-26-000011': { acceptance: '2026-06-11T20:02:00.000Z', primary: 'p.xml', form: '4' },
      '0001768670-26-000012': { acceptance: '2026-06-12T20:03:00.000Z', primary: 'p.xml', form: '4' },
    },
    {
      '0001045810': [
        '0001768670-26-000010',
        '0001768670-26-000011',
        '0001768670-26-000012',
      ],
    },
  );
  const deps: RunDeps = {
    ...makeDeps({
      fetcher,
      insertRows: cap.insertRows,
      submissions,
      discoveredBy: 'backfill-oneshot',
      tickerForPaddedCik: (cik) => (cik === '0001045810' ? 'NVDA' : null),
    }),
    sleep: () => Promise.resolve(),
    submissionsPacingMs: 0,
  };
  deps.isUniverseEntry = buildUniverseEntryPredicate(new Set(['0001045810']));

  await runModeWithSummary(
    { kind: 'backfill', from: '2026-06-10', to: '2026-06-12' },
    deps,
  );

  // 3 insert batches, one per day, each a single NVDA row stamped with
  // the day's correct acceptance_datetime (no cross-day contamination).
  assertEquals(cap.calls.length, 3, '3 per-day insert batches');
  const byAccession = new Map<string, DiscoveryRow>();
  for (const batch of cap.calls) {
    assertEquals(batch.length, 1);
    byAccession.set(batch[0].accession_number, batch[0]);
  }
  assertEquals(byAccession.get('0001768670-26-000010')?.acceptance_datetime, '2026-06-10T20:01:00.000Z');
  assertEquals(byAccession.get('0001768670-26-000010')?.as_of_date, '2026-06-10');
  assertEquals(byAccession.get('0001768670-26-000011')?.acceptance_datetime, '2026-06-11T20:02:00.000Z');
  assertEquals(byAccession.get('0001768670-26-000011')?.as_of_date, '2026-06-11');
  assertEquals(byAccession.get('0001768670-26-000012')?.acceptance_datetime, '2026-06-12T20:03:00.000Z');
  assertEquals(byAccession.get('0001768670-26-000012')?.as_of_date, '2026-06-12');
  // Ticker stamped on every row.
  for (const r of byAccession.values()) assertEquals(r.ticker, 'NVDA');
});

// ─────────────────────────────────────────────────────────────────────
// ACT-223 / cross-day cross-call dedup correction (Catalog #43
// fixture-scope-mismatch subsequent firing; Catalog #48 subsequent
// firing #3). The shipped Path-Q architecture in `runBackfillDedup`
// collects the GLOBAL unique-issuer set across all days BEFORE Pass 2
// fires; (p7) and (p8) lock that contract at the orchestrator's
// widest scope so a future regression to a per-day or per-iteration
// unique set fails at the test gate rather than at the next GHA fire.
// ─────────────────────────────────────────────────────────────────────

/**
 * (p7) ACT-223 — cross-day cross-call dedup proof. `runBackfillDedup`
 * fans Pass 1 across N distinct days; each day surfaces the SAME issuer
 * CIK with a DIFFERENT accession. Pass 2 MUST issue exactly ONE
 * submissions fetch for that CIK (not N, not "once per day"); Pass 3
 * MUST cross-walk all N accessions onto their respective per-day insert
 * batches from the single fetched feed.
 *
 * Failure mode this catches: a regression that re-scopes Pass-2 dedup
 * to per-day (or to within a single `runDiscoveryDay` invocation)
 * would issue N submissions calls and would surface as the cancelled-
 * GHA-run class the live evidence trail in the ACT-223 ledger entry
 * documents.
 */
Deno.test('(p7) ACT-223 — cross-day cross-call dedup: ONE submissions fetch across N runDiscoveryDay-equivalent passes inside a single runBackfill envelope', async () => {
  const cap = captureInserter();
  const nvdaDay = (ymd: string, acc: string): string =>
    [
      'Description: Daily Index',
      '',
      'CIK|Company Name|Form Type|Date Filed|File Name',
      '----------------------------------------------------',
      `1045810|NVIDIA CORP|4|${ymd}|edgar/data/1045810/${acc}.txt`,
    ].join('\n');
  const fetcher = fetcherByDay({
    '20260610': nvdaDay('20260610', '0001045810-26-000001'),
    '20260611': nvdaDay('20260611', '0001045810-26-000002'),
    '20260612': nvdaDay('20260612', '0001045810-26-000003'),
  });
  const { fetcher: submissions, callsByCik } = countingSubmissions(
    {
      '0001045810-26-000001': { acceptance: '2026-06-10T20:01:00.000Z', primary: 'p.xml', form: '4' },
      '0001045810-26-000002': { acceptance: '2026-06-11T20:02:00.000Z', primary: 'p.xml', form: '4' },
      '0001045810-26-000003': { acceptance: '2026-06-12T20:03:00.000Z', primary: 'p.xml', form: '4' },
    },
    {
      '0001045810': [
        '0001045810-26-000001',
        '0001045810-26-000002',
        '0001045810-26-000003',
      ],
    },
  );
  const deps: RunDeps = {
    ...makeDeps({
      fetcher,
      insertRows: cap.insertRows,
      submissions,
      discoveredBy: 'backfill-oneshot',
      tickerForPaddedCik: (cik) => (cik === '0001045810' ? 'NVDA' : null),
    }),
    sleep: () => Promise.resolve(),
    submissionsPacingMs: 0,
  };
  deps.isUniverseEntry = buildUniverseEntryPredicate(new Set(['0001045810']));

  const summary = await runModeWithSummary(
    { kind: 'backfill', from: '2026-06-10', to: '2026-06-12' },
    deps,
  );

  // Architectural invariant: ONE fetch for the single global unique CIK,
  // NOT three (one-per-day) — the cross-day cross-call dedup contract.
  assertEquals(
    callsByCik.get('0001045810'),
    1,
    'cross-day cross-call dedup: submissions fetcher MUST be invoked exactly ONCE across all 3 day partitions',
  );
  assertEquals(callsByCik.size, 1, 'no spurious fetches against any other CIK');
  assertEquals(summary.unique_issuers_fetched, 1);
  assertEquals(summary.total_accessions_processed, 3);
  assertEquals(summary.dedup_ratio, 3);

  // All 3 accessions land in their respective day's insert batch with
  // the correct per-day acceptance value drawn from the single feed.
  const seenByAccession = new Map<string, DiscoveryRow>();
  for (const batch of cap.calls) {
    for (const r of batch) seenByAccession.set(r.accession_number, r);
  }
  assertEquals(seenByAccession.size, 3);
  assertEquals(seenByAccession.get('0001045810-26-000001')?.acceptance_datetime, '2026-06-10T20:01:00.000Z');
  assertEquals(seenByAccession.get('0001045810-26-000002')?.acceptance_datetime, '2026-06-11T20:02:00.000Z');
  assertEquals(seenByAccession.get('0001045810-26-000003')?.acceptance_datetime, '2026-06-12T20:03:00.000Z');
});

/**
 * (p8) ACT-223 — global unique-set ceiling proof. Across an N-day
 * backfill where M distinct issuer CIKs appear (with heavy day-over-day
 * overlap), `unique_issuers_fetched` MUST equal the set-cardinality of
 * actually-stubbed CIKs (proving Pass 2 iterates the GLOBAL set, not a
 * per-day set), AND MUST NOT exceed the configured universe-size ceiling
 * (proving the in-universe filter built the same map both predicates
 * derive from — Catalog #48 SEC-Dependency Producer-Relocation rule).
 *
 * Fixture: 5 day partitions, 30 distinct CIKs total, each issuer filing
 * on multiple days (so per-day-scoped dedup would over-count). Universe
 * cap set to 40 (≥ 30 — the cap is structural, not numeric).
 */
Deno.test('(p8) ACT-223 — global unique-set ceiling: unique_issuers_fetched === |distinct stubbed CIKs| AND ≤ universe.size', async () => {
  const cap = captureInserter();
  // Build 30 padded CIKs: 0000010001..0000010030.
  const cikSet: string[] = [];
  for (let i = 1; i <= 30; i++) {
    cikSet.push(String(i + 10000).padStart(10, '0'));
  }
  // Universe cap of 40 distinct padded CIKs (30 used + 10 unused — the
  // ceiling-not-floor proof: unique_issuers_fetched must be ≤ this).
  const universeCik10 = new Set<string>(cikSet);
  for (let i = 31; i <= 40; i++) {
    universeCik10.add(String(i + 10000).padStart(10, '0'));
  }
  // 5 day partitions; each day filings come from a heavily-overlapping
  // subset of the 30 CIKs so per-day-scoped dedup would over-count.
  const days: Array<{ ymd: string; iso: string }> = [
    { ymd: '20260608', iso: '2026-06-08' },
    { ymd: '20260609', iso: '2026-06-09' },
    { ymd: '20260610', iso: '2026-06-10' },
    { ymd: '20260611', iso: '2026-06-11' },
    { ymd: '20260612', iso: '2026-06-12' },
  ];
  const bodyByYmd: Record<string, string> = {};
  const accessionToAcceptance: Record<string, { acceptance: string; primary: string; form: '4' | '4/A' }> = {};
  const byCik: Record<string, string[]> = {};
  for (const { ymd, iso } of days) {
    const lines: string[] = [
      'Description: Daily Index',
      '',
      'CIK|Company Name|Form Type|Date Filed|File Name',
      '----------------------------------------------------',
    ];
    for (const padded of cikSet) {
      const cikInt = padded.replace(/^0+/, '');
      // Each (cik, day) gets a unique accession so per-day batches are distinct.
      const acc = `${padded}-${ymd}`;
      lines.push(`${cikInt}|TESTCO ${cikInt}|4|${ymd}|edgar/data/${cikInt}/${acc}.txt`);
      accessionToAcceptance[acc] = {
        acceptance: `${iso}T20:00:00.000Z`,
        primary: 'p.xml',
        form: '4',
      };
      (byCik[padded] ??= []).push(acc);
    }
    bodyByYmd[ymd] = lines.join('\n');
  }
  const fetcher = fetcherByDay(bodyByYmd);
  const { fetcher: submissions, callsByCik } = countingSubmissions(accessionToAcceptance, byCik);
  const deps: RunDeps = {
    ...makeDeps({
      fetcher,
      insertRows: cap.insertRows,
      submissions,
      discoveredBy: 'backfill-oneshot',
      tickerForPaddedCik: (cik) =>
        universeCik10.has(cik) ? `T${cik.replace(/^0+/, '') || '0'}` : null,
    }),
    sleep: () => Promise.resolve(),
    submissionsPacingMs: 0,
  };
  deps.isUniverseEntry = buildUniverseEntryPredicate(universeCik10);

  const summary = await runModeWithSummary(
    { kind: 'backfill', from: '2026-06-08', to: '2026-06-12' },
    deps,
  );

  // Ceiling proof — Pass 2 iterates the GLOBAL unique-issuer set, never
  // exceeding the universe size and never doubling on per-day overlap.
  assertEquals(
    summary.unique_issuers_fetched,
    cikSet.length,
    'unique_issuers_fetched MUST equal the set-cardinality of actually-stubbed CIKs (proves Pass 2 iterates the GLOBAL set)',
  );
  assert(
    summary.unique_issuers_fetched <= universeCik10.size,
    `unique_issuers_fetched (${summary.unique_issuers_fetched}) MUST NOT exceed universe.size (${universeCik10.size})`,
  );
  // Each CIK was fetched exactly ONCE across the entire backfill envelope.
  for (const padded of cikSet) {
    assertEquals(
      callsByCik.get(padded),
      1,
      `cross-day cross-call dedup: CIK ${padded} fetched exactly once across 5 day partitions`,
    );
  }
  // Total accessions = 30 CIKs × 5 days = 150; dedup_ratio = 150/30 = 5.
  assertEquals(summary.total_accessions_processed, cikSet.length * days.length);
  assertEquals(summary.dedup_ratio, days.length);
});