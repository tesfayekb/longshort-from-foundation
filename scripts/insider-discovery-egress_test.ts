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