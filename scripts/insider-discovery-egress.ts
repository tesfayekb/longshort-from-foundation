#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-run

/**
 * insider-discovery-egress — FP-050 Phase 4 F2.b producer.
 *
 * Off-Supabase-Edge discovery probe for Signal #4 (`insider_transactions_90d`).
 * Runs from a GitHub Actions egress (free IP family; SEC fair-access has
 * blocked the Supabase Edge `eu-central-1` egress on the daily-index family
 * since ACT-199 — two-observation §22.8.5 STOP-and-conclude bar met). Writes
 * qualifying Form-4 / Form-4/A accessions into `public.insider_accession_-`
 * `discovery_queue` (MIG-096 / ACT-202). The on-Supabase-Edge consumer
 * (F2.c — `seedWorkItems` switch) drains the queue and persists per-row
 * Form-4 data; per-accession `index.json` + Form-4 XML fetches stay on the
 * Supabase Edge egress (already 200 from `eu-central-1` per the ACT-197
 * path-probe matrix rows e + f).
 *
 * SINGLE-SOURCE-OF-PARSING-TRUTH (load-bearing invariant):
 *   This script imports `EdgarDailyIndexFetcher` from
 *   `supabase/functions/_shared/longshort-signals/insider-transactions/`
 *   `edgar-daily-index-fetcher.ts` — the F1 master.idx parser, unchanged.
 *   Both call sites (this producer + the existing on-edge fetcher) share
 *   the same drift sentinel (`assertNotMatch(/\/form\.\d{8}\.idx$/)` +
 *   `assertMatch(/\/master\.\d{8}\.idx$/)`) which fails if either side
 *   regresses to `form.YYYYMMDD.idx`.
 *
 * MODES (mutually exclusive — args validator rejects mixing):
 *   --as-of=YYYY-MM-DD                    GHA daily run (one trading day).
 *                                          `discovered_by` = `'gha-daily'`.
 *   --backfill-from=YYYY-MM-DD            One-shot bulk backfill.
 *   --backfill-to=YYYY-MM-DD              Iterates trading days inclusive.
 *                                          `discovered_by` = `'backfill-oneshot'`.
 *
 * §(h) IDEMPOTENCY: the natural PK
 *   `(as_of_date, issuer_cik, accession_number)`
 *   plus PostgREST `Prefer: resolution=ignore-duplicates` make every INSERT
 *   safely retry-able. Reseeding the same as_of_date is a no-op.
 *
 * R1 HEARTBEAT-AT-WRITE-SEAM: per the operator's F2 ratification R1, an
 *   empty trading day (zero qualifying Form 4 / 4-A accessions, OR a 404
 *   `kind:'unavailable'` from master.idx) writes ONE sentinel row with
 *   `issuer_cik = accession_number = '__heartbeat__'`. This makes
 *   "discovery ran with zero Form-4s" structurally distinguishable from
 *   "discovery did not run." The F2.c consumer's `seedWorkItems` will
 *   read the heartbeat row, mark it consumed, and proceed without seeding
 *   any work — a non-empty-day signal that consumes-and-skips. The
 *   heartbeat row uses `form_type='4'` (the CHECK constraint requires
 *   `'4'|'4/A'`); the `'__heartbeat__'` CIK + accession sentinel
 *   distinguishes it from any real row at consumer time.
 *
 * EXIT CODES:
 *   0 — success (all days processed and persisted)
 *   1 — SEC API failure (EdgarFetchError on any day; aborts the run with
 *       partial results unflushed — the §22.5.1 trace surfaces which day)
 *   2 — Supabase API failure (non-2xx from PostgREST on any insert)
 *   3 — arguments error (missing/invalid flags)
 *
 * NO DEPLOY GATE BINDS HERE (per F2-pre verifier contract): this script
 * is GitHub-Actions-only; no edge-function bundle changes. The
 * `check-deployed-sha` MATCH gate re-enters at F2.c when the consumer
 * edge-function changes.
 *
 * Owner: longshort (FP-050 Phase 4 F2.b; ACT-203).
 */

import {
  EdgarDailyIndexFetcher,
  type DailyIndexEntry,
} from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-daily-index-fetcher.ts';
import {
  EdgarCikMapper,
  EdgarFetchError,
  type CikLookupResult,
} from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-cik-mapper.ts';
import {
  EdgarSubmissionsFetcher,
  type EdgarSubmissionsResult,
  type SubmissionsRecentRow,
} from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-submissions-fetcher.ts';
import {
  isoDate,
  isTradingDay,
  parseIsoDate,
  tradingDaysBefore,
} from '../supabase/functions/_shared/longshort-universe/shared/trading-days.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscoveredBy = 'gha-daily' | 'backfill-oneshot';

export type Mode =
  | { kind: 'daily'; asOf: string }
  | { kind: 'backfill'; from: string; to: string };

export type ParsedArgs =
  | { kind: 'ok'; mode: Mode }
  | { kind: 'error'; reason: string };

/** Row shape persisted into `insider_accession_discovery_queue`. */
export interface DiscoveryRow {
  as_of_date: string;
  issuer_cik: string;
  accession_number: string;
  form_type: '4' | '4/A';
  company_name: string;
  filename: string;
  discovered_by: DiscoveredBy;
  discovery_correlation_id: string;
  /** ACT-215 / MIG-097: SEC `acceptanceDateTime` captured at discovery
   *  from the per-issuer submissions feed. NOT NULL on the queue
   *  column; producer-side §(b) enforcement (DEC-058 §(b) amendment).
   *  Heartbeat rows carry the Unix epoch sentinel (`EPOCH_ACCEPTANCE`). */
  acceptance_datetime: string;
  /** ACT-220 / MIG-098: universe ticker resolved at producer-time
   *  from `company_tickers.json` (loaded ONCE per fire — see
   *  `loadUniverseCikToTicker`). NOT NULL on the queue column;
   *  producer-side enforcement closes the runtime SEC dependency the
   *  consumer's CIK-mapper previously incurred per cron-spawned
   *  isolate (surfaced by runs `e5907bfb-…` and `937cc59c-…`).
   *  Heartbeat rows carry the `HEARTBEAT_TICKER` sentinel. */
  ticker: string;
}

/** Sentinel constants for the R1 heartbeat row. */
export const HEARTBEAT_ISSUER_CIK = '__heartbeat__';
export const HEARTBEAT_ACCESSION_NUMBER = '__heartbeat__';
export const HEARTBEAT_COMPANY_NAME = '__heartbeat__';
export const HEARTBEAT_FILENAME = '__heartbeat__';
/** ACT-220 / MIG-098: heartbeat ticker sentinel. Symmetric with the
 *  existing CIK + accession heartbeat sentinels; satisfies the new
 *  `ticker NOT NULL` queue invariant without inventing a universe
 *  ticker that would collide with a real symbol. The consumer's claim
 *  predicate is unchanged (issuer_cik + accession_number sentinel
 *  match drives the heartbeat exclusion); this constant lets the
 *  producer satisfy the column NOT NULL invariant on the empty-day
 *  heartbeat write. */
export const HEARTBEAT_TICKER = '__heartbeat__';
/** ACT-215: heartbeat acceptance sentinel — Unix epoch. The R1
 *  heartbeat row is structurally excluded by the consumer's
 *  `(issuer_cik='__heartbeat__', accession_number='__heartbeat__')`
 *  predicate; this epoch stamp is diagnostic-only and unreachable by
 *  any real-row code path. Carrying epoch satisfies the MIG-097
 *  NOT NULL invariant without inventing a future-shaped timestamp. */
export const EPOCH_ACCEPTANCE = '1970-01-01T00:00:00.000Z';
export const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * ACT-221: minimum inter-call pacing for the per-issuer submissions-feed
 * fetch loop. Surfaced by GHA run 2026-06-14 (88% 429-rate on
 * `data.sec.gov/submissions/CIK*.json` — 3939/4451 calls), the
 * post-ACT-220-B repopulation drain. SEC's published rate ceiling on
 * data.sec.gov is 10 req/sec; observed throttle behavior under burst is
 * much tighter. 1100ms matches the SEC-acceptable floor already
 * exercised by the master.idx call cadence (one fetch per day; ~1 day per
 * trading day in a backfill).
 *
 * Pacing + `fetchWithTimeoutAndRetry` (added to `EdgarSubmissionsFetcher`
 * in the same commit) together absorb both the steady rate ceiling AND
 * transient burst rejections.
 *
 * Per Catalog #48 forward-binding rule (amended ACT-221): moving a SEC
 * dependency from consumer-runtime to producer-time eliminates the
 * cross-isolate concurrency problem but does NOT eliminate the
 * rate-ceiling problem; producer-side fetches that target the same
 * rate-limited vendor MUST honor the vendor's documented pacing floor.
 */
export const SUBMISSIONS_PACING_FLOOR_MS = 1100;

/** Default sleep primitive — injectable via `RunDeps.sleep` for hermetic tests. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Outcome per day — surfaced into the run summary for forensics. */
export interface DayOutcome {
  as_of_date: string;
  entries_parsed: number;
  entries_after_universe_filter: number;
  rows_inserted: number;
  heartbeat_inserted: boolean;
  /** master.idx returned 404 (kind:'unavailable'). Still writes a heartbeat. */
  data_unavailable: boolean;
  /** ACT-215: per-issuer submissions-feed status counter (status code →
   *  count). 200 = resolved; 404 = unavailable; 429 = rate_limited;
   *  -1 = malformed (parallel-array shape); 0 = thrown EdgarFetchError. */
  submissions_fetch_status?: Record<string, number>;
  /** ACT-215: count of in-universe Form-4 entries that could NOT be
   *  cross-walked to a `(accession_number → acceptance_datetime)` from
   *  the submissions feed. These rows are DROPPED (the §(b) NOT NULL
   *  schema invariant on MIG-097 makes enqueue impossible without
   *  acceptance). Non-zero counts surface a producer-side gap
   *  (issuer feed lagging master.idx, or accession too fresh to be
   *  in `filings.recent`); operator-visible at run-complete. */
  accessions_missing_acceptance?: number;
}

/** Injectable deps — every IO surface goes through here so the test suite is hermetic. */
export interface RunDeps {
  fetcher: EdgarDailyIndexFetcher;
  /** ACT-215: per-issuer submissions-feed fetcher (acceptance source-of-truth). */
  submissions: EdgarSubmissionsFetcher;
  insertRows: (rows: readonly DiscoveryRow[]) => Promise<unknown>;
  correlationId: string;
  discoveredBy: DiscoveredBy;
  /** Single source of truth for the trading-day iterator (NYSE holidays via shared/). */
  isTradingDay?: (d: Date) => boolean;
  /** Optional in-universe predicate; real CLI supplies the SEC ticker→CIK map inverse. */
  isUniverseEntry?: (entry: DailyIndexEntry) => boolean;
  /** ACT-220: padded-CIK → universe ticker resolver. The CLI builds
   *  this from `loadUniverseCikToTicker` (one `company_tickers.json`
   *  fetch per fire, NOT per day) and threads it here; tests inject
   *  a hermetic map. Entries whose padded CIK is absent from the map
   *  are DROPPED with a `tickers_missing_for_cik` counter — the
   *  isUniverseEntry filter and this resolver MUST agree by
   *  construction in production (built from the same map). */
  tickerForPaddedCik?: (paddedCik: string) => string | null;
  /** Stamp emitted on every structured-log line so reconciliation can join the GHA run URL. */
  log?: (event: Record<string, unknown>) => void;
  /** ACT-221: sleep primitive injected so tests can assert paced timing
   *  without paying the wall-clock cost. Production uses `defaultSleep`. */
  sleep?: (ms: number) => Promise<void>;
  /** ACT-221: inter-call pacing floor (ms) for the per-issuer
   *  submissions-feed loop. Override at test-time to assert the
   *  paced-loop contract; production reads `SUBMISSIONS_PACING_FLOOR_MS`. */
  submissionsPacingMs?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * DW-107 date-fix: daily mode now computes `asOf` as the last completed
 * NYSE trading day (D-1, calendar-aware) at parse-time. The `--daily`
 * flag is the canonical entrypoint from .github/workflows/insider-
 * discovery.yml; an explicit `--as-of=YYYY-MM-DD` remains valid for
 * operator override and hermetic tests. `now` is injectable so the
 * test suite can pin the wall clock.
 *
 * Single-variable lockstep is preserved: the resolved asOf flows
 * unchanged into `runDiscoveryDay`, which feeds it to BOTH the
 * `master.<asOf>.idx` fetch URL AND the row tag `as_of_date`.
 */
export function parseArgs(
  argv: readonly string[],
  now: Date = new Date(),
): ParsedArgs {
  let asOf: string | null = null;
  let backfillFrom: string | null = null;
  let backfillTo: string | null = null;
  let dailyFlag = false;
  for (const a of argv) {
    if (a === '--daily') {
      dailyFlag = true;
    } else if (a.startsWith('--as-of=')) {
      asOf = a.slice('--as-of='.length).trim();
    } else if (a.startsWith('--backfill-from=')) {
      backfillFrom = a.slice('--backfill-from='.length).trim();
    } else if (a.startsWith('--backfill-to=')) {
      backfillTo = a.slice('--backfill-to='.length).trim();
    } else if (a.length > 0) {
      return { kind: 'error', reason: `unknown argument: ${a}` };
    }
  }
  const daily = asOf !== null || dailyFlag;
  const backfill = backfillFrom !== null || backfillTo !== null;
  if (daily && backfill) {
    return {
      kind: 'error',
      reason: '--daily/--as-of is mutually exclusive with --backfill-from/--backfill-to',
    };
  }
  if (daily) {
    if (asOf === null && dailyFlag) {
      // DW-107: daily flag with no explicit --as-of → compute last
      // completed NYSE trading day (D-1) from `now`. This is the
      // GHA-cron path; at 20:15 UTC of D the producer fetches
      // master.<D-1>.idx (reliably published by SEC after the D-1
      // close, ~22:00 UTC of D-1) and tags rows as_of_date=D-1.
      asOf = isoDate(tradingDaysBefore(now, 1));
    }
    if (asOf === null || !ISO_DATE_RE.test(asOf)) {
      return { kind: 'error', reason: `--as-of must be YYYY-MM-DD (got: ${asOf ?? '<missing>'})` };
    }
    return { kind: 'ok', mode: { kind: 'daily', asOf } };
  }
  if (backfillFrom === null || backfillTo === null) {
    return {
      kind: 'error',
      reason: 'either --as-of=YYYY-MM-DD OR both --backfill-from=YYYY-MM-DD --backfill-to=YYYY-MM-DD are required',
    };
  }
  if (!ISO_DATE_RE.test(backfillFrom) || !ISO_DATE_RE.test(backfillTo)) {
    return { kind: 'error', reason: '--backfill-from / --backfill-to must be YYYY-MM-DD' };
  }
  if (backfillFrom > backfillTo) {
    return {
      kind: 'error',
      reason: `--backfill-from (${backfillFrom}) must be <= --backfill-to (${backfillTo})`,
    };
  }
  return { kind: 'ok', mode: { kind: 'backfill', from: backfillFrom, to: backfillTo } };
}

/**
 * Iterate trading days inclusive of both endpoints. Reuses the shared NYSE
 * holiday calendar (`isTradingDay` from `longshort-universe/shared/`).
 * Returns ISO YYYY-MM-DD strings.
 *
 * NOTE: explicitly DOES NOT re-implement weekday logic — the shared module
 * is the single source of truth (NYSE holidays through 2027 hard-coded;
 * tracked under DW-063 for full multi-year table).
 */
export function iterateTradingDays(
  fromIso: string,
  toIso: string,
  isTrading: (d: Date) => boolean = isTradingDay,
): string[] {
  const out: string[] = [];
  let cursor = parseIsoDate(fromIso);
  const end = parseIsoDate(toIso);
  while (cursor.getTime() <= end.getTime()) {
    if (isTrading(cursor)) out.push(isoDate(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}

export function normalizeFilerCikForUniverse(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return trimmed.padStart(10, '0');
}

export function buildUniverseEntryPredicate(universeCik10: ReadonlySet<string>) {
  return (entry: DailyIndexEntry): boolean => {
    const padded = normalizeFilerCikForUniverse(entry.filer_cik);
    return padded !== null && universeCik10.has(padded);
  };
}

/** Build a `DiscoveryRow` from a parsed `DailyIndexEntry`. */
export function rowFromEntry(
  e: DailyIndexEntry,
  asOf: string,
  discoveredBy: DiscoveredBy,
  correlationId: string,
  acceptanceDatetime: string,
  ticker: string,
): DiscoveryRow {
  const padded = normalizeFilerCikForUniverse(e.filer_cik);
  return {
    as_of_date: asOf,
    issuer_cik: padded ?? e.filer_cik,
    accession_number: e.accession_number,
    form_type: e.form_type,
    company_name: e.company_name,
    filename: e.filename,
    discovered_by: discoveredBy,
    discovery_correlation_id: correlationId,
    acceptance_datetime: acceptanceDatetime,
    ticker,
  };
}

/** Build the R1 heartbeat row for an empty (or unavailable) trading day. */
export function buildHeartbeatRow(
  asOf: string,
  discoveredBy: DiscoveredBy,
  correlationId: string,
): DiscoveryRow {
  return {
    as_of_date: asOf,
    issuer_cik: HEARTBEAT_ISSUER_CIK,
    accession_number: HEARTBEAT_ACCESSION_NUMBER,
    // CHECK form_type IN ('4','4/A') — pick the canonical form-4 literal.
    // The '__heartbeat__' CIK + accession sentinels distinguish the row
    // from any real entry; the consumer at F2.c reads on (issuer_cik,
    // accession_number) == ('__heartbeat__','__heartbeat__') and skips.
    form_type: '4',
    company_name: HEARTBEAT_COMPANY_NAME,
    filename: HEARTBEAT_FILENAME,
    discovered_by: discoveredBy,
    discovery_correlation_id: correlationId,
    // ACT-215: epoch sentinel — see EPOCH_ACCEPTANCE doc.
    acceptance_datetime: EPOCH_ACCEPTANCE,
    // ACT-220 / MIG-098: heartbeat ticker sentinel — satisfies the
    // new `ticker NOT NULL` queue invariant without inventing a
    // universe ticker that would collide with a real symbol.
    ticker: HEARTBEAT_TICKER,
  };
}

export async function loadCurrentUniverseTickers(env: SupabaseRestEnv): Promise<string[]> {
  const base = env.supabaseUrl.replace(/\/+$/, '');
  const latestUrl = `${base}/rest/v1/universe_membership?select=as_of_date&operator_id=eq.${DEFAULT_OPERATOR_ID}&order=as_of_date.desc&limit=1`;
  const headers = {
    'apikey': env.serviceRoleKey,
    'Authorization': `Bearer ${env.serviceRoleKey}`,
  };
  const latestResp = await fetch(latestUrl, { method: 'GET', headers });
  if (!latestResp.ok) {
    const body = await latestResp.text().catch(() => '<body unreadable>');
    throw new Error(`supabase REST universe latest-date read failed: HTTP ${latestResp.status} ${latestResp.statusText} — ${body.slice(0, 512)}`);
  }
  const latest = await latestResp.json().catch(() => null) as Array<{ as_of_date?: string }> | null;
  const asOfDate = latest?.[0]?.as_of_date;
  if (typeof asOfDate !== 'string' || asOfDate.length === 0) return [];
  const rowsUrl = `${base}/rest/v1/universe_membership?select=ticker&operator_id=eq.${DEFAULT_OPERATOR_ID}&as_of_date=eq.${asOfDate}`;
  const rowsResp = await fetch(rowsUrl, { method: 'GET', headers });
  if (!rowsResp.ok) {
    const body = await rowsResp.text().catch(() => '<body unreadable>');
    throw new Error(`supabase REST universe_membership read failed: HTTP ${rowsResp.status} ${rowsResp.statusText} — ${body.slice(0, 512)}`);
  }
  const rows = await rowsResp.json().catch(() => null) as Array<{ ticker?: string }> | null;
  return (rows ?? [])
    .map((r) => r.ticker)
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.toUpperCase().trim());
}

export async function loadUniverseCikSet(tickers: readonly string[], mapper: EdgarCikMapper): Promise<Set<string>> {
  const lookup = await mapper.loadMap();
  const out = new Set<string>();
  for (const ticker of tickers) {
    const r: CikLookupResult = lookup(ticker);
    if (r.kind === 'resolved') out.add(r.cik10);
  }
  return out;
}

/**
 * ACT-220 / Path-Y producer-relocation: build the padded-CIK → ticker
 * inverse of the universe map. Loaded ONCE per fire (the mapper itself
 * issues a SINGLE `company_tickers.json` fetch under
 * `EdgarCikMapper.loadMap()` — see the cik-mapper module doc).
 *
 * Drift sentinel (codified in the producer-test suite): production
 * callers MUST invoke this ONCE per CLI entry, not per day or per
 * issuer. The returned map is passed into `RunDeps.tickerForPaddedCik`
 * and read per-row inside `runDiscoveryDay` — the per-row cost is a
 * pure Map lookup, never a fresh fetch.
 */
export async function loadUniverseCikToTicker(
  tickers: readonly string[],
  mapper: EdgarCikMapper,
): Promise<Map<string, string>> {
  const lookup = await mapper.loadMap();
  const out = new Map<string, string>();
  for (const ticker of tickers) {
    const r: CikLookupResult = lookup(ticker);
    if (r.kind === 'resolved') out.set(r.cik10, r.ticker);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core engine — pure modulo `RunDeps`
// ---------------------------------------------------------------------------

/**
 * Process one trading day: fetch master.idx, transform to rows, insert into
 * the queue. Empty-day → heartbeat row. 404 → heartbeat row + data_unavailable.
 * SEC failure → throws `EdgarFetchError` (caller maps to exit 1).
 * Supabase failure → throws `Error` (caller maps to exit 2).
 *
 * ACT-215 acceptance cross-walk: after the in-universe filter, the entries
 * are batched by `issuer_cik` and one `EdgarSubmissionsFetcher` fetch is
 * issued per unique issuer; the parallel-array members
 * `filings.recent.{accessionNumber, acceptanceDateTime}` are folded into a
 * `Map<accession_number, acceptance_datetime>` and stamped onto each
 * `DiscoveryRow`. Entries whose accession is absent from the feed (issuer
 * feed lagging master.idx, or a fresh-enough accession) are DROPPED with
 * an `accessions_missing_acceptance` counter — MIG-097's NOT NULL queue
 * column makes enqueue impossible without acceptance.
 */
export async function runDiscoveryDay(asOf: string, deps: RunDeps): Promise<DayOutcome> {
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const isUniverseEntry = deps.isUniverseEntry ?? (() => true);
  const date = parseIsoDate(asOf);
  log({
    event: 'insider_discovery_day_start',
    as_of: asOf,
    discovered_by: deps.discoveredBy,
    correlation_id: deps.correlationId,
  });
  const result = await deps.fetcher.fetchDay(date);
  if (result.kind === 'unavailable') {
    const heartbeat = buildHeartbeatRow(asOf, deps.discoveredBy, deps.correlationId);
    await deps.insertRows([heartbeat]);
    log({
      event: 'insider_discovery_day_unavailable',
      as_of: asOf,
      discovered_by: deps.discoveredBy,
      correlation_id: deps.correlationId,
    });
    return { as_of_date: asOf, entries_parsed: 0, entries_after_universe_filter: 0, rows_inserted: 0, heartbeat_inserted: true, data_unavailable: true };
  }
  const inUniverseEntries = result.entries.filter((entry) => isUniverseEntry(entry));
  if (inUniverseEntries.length === 0) {
    const heartbeat = buildHeartbeatRow(asOf, deps.discoveredBy, deps.correlationId);
    await deps.insertRows([heartbeat]);
    log({
      event: 'insider_discovery_day_empty',
      as_of: asOf,
      discovered_by: deps.discoveredBy,
      correlation_id: deps.correlationId,
      entries_parsed: result.entries.length,
      entries_after_universe_filter: 0,
      rows_inserted: 0,
      heartbeat_inserted: true,
    });
    return { as_of_date: asOf, entries_parsed: result.entries.length, entries_after_universe_filter: 0, rows_inserted: 0, heartbeat_inserted: true, data_unavailable: false };
  }

  // ── ACT-215 acceptance cross-walk ───────────────────────────────────
  // Group entries by padded issuer CIK; one submissions fetch per
  // unique issuer (rate-budget: ~14× cheaper than the alternative
  // per-accession `index.json` re-fetch architecture).
  const submissionsStatus: Record<string, number> = {};
  const acceptanceByAccession = new Map<string, string>();
  const uniqueIssuerCiks = new Set<string>();
  for (const e of inUniverseEntries) {
    const padded = normalizeFilerCikForUniverse(e.filer_cik);
    if (padded !== null) uniqueIssuerCiks.add(padded);
  }
  // ACT-221: pace consecutive submissions calls at SEC's documented
  // rate-ceiling floor. The first call fires immediately; every
  // subsequent call sleeps `pacingMs` BEFORE issuing. Combined with
  // `EdgarSubmissionsFetcher`'s `fetchWithTimeoutAndRetry` integration
  // (same commit), this absorbs both the steady rate ceiling AND
  // transient burst rejections that the retry helper cannot prevent
  // on its own (a backoff'd retry against an already-throttled bucket
  // re-hits the throttle).
  const sleep = deps.sleep ?? defaultSleep;
  const pacingMs = deps.submissionsPacingMs ?? SUBMISSIONS_PACING_FLOOR_MS;
  let submissionsCallIndex = 0;
  for (const cik10 of uniqueIssuerCiks) {
    if (submissionsCallIndex > 0 && pacingMs > 0) {
      await sleep(pacingMs);
    }
    submissionsCallIndex += 1;
    let sub: EdgarSubmissionsResult;
    try {
      sub = await deps.submissions.fetchSubmissions({ cik: cik10 });
    } catch (e) {
      // EdgarFetchError or network throw — surface in counter, leave
      // accession→acceptance map empty for this issuer (its accessions
      // will be dropped + counted, NOT enqueued).
      submissionsStatus['0'] = (submissionsStatus['0'] ?? 0) + 1;
      log({
        event: 'insider_discovery_submissions_error',
        as_of: asOf,
        cik10,
        message: (e as Error).message,
        correlation_id: deps.correlationId,
      });
      continue;
    }
    if (sub.kind === 'unavailable') {
      submissionsStatus['404'] = (submissionsStatus['404'] ?? 0) + 1;
      continue;
    }
    if (sub.kind === 'rate_limited') {
      submissionsStatus['429'] = (submissionsStatus['429'] ?? 0) + 1;
      continue;
    }
    if (sub.kind === 'malformed') {
      submissionsStatus['-1'] = (submissionsStatus['-1'] ?? 0) + 1;
      log({
        event: 'insider_discovery_submissions_malformed',
        as_of: asOf,
        cik10,
        reason: sub.reason,
        correlation_id: deps.correlationId,
      });
      continue;
    }
    submissionsStatus['200'] = (submissionsStatus['200'] ?? 0) + 1;
    for (const r of sub.rows as SubmissionsRecentRow[]) {
      acceptanceByAccession.set(r.accession_number, r.acceptance_datetime);
    }
  }

  let accessionsMissingAcceptance = 0;
  let tickersMissingForCik = 0;
  const rows: DiscoveryRow[] = [];
  for (const e of inUniverseEntries) {
    const acceptance = acceptanceByAccession.get(e.accession_number);
    if (acceptance === undefined) {
      accessionsMissingAcceptance += 1;
      continue;
    }
    // ACT-220: resolve ticker at producer-time from the pre-loaded
    // padded-CIK → ticker map. By construction in production, an
    // entry that passed `isUniverseEntry` (built from the same map)
    // ALWAYS resolves here — the missing-counter is a defense-in-
    // depth diagnostic against a future divergence between the two
    // map-derived predicates.
    const padded = normalizeFilerCikForUniverse(e.filer_cik) ?? e.filer_cik;
    const ticker = deps.tickerForPaddedCik?.(padded) ?? null;
    if (ticker === null || ticker.length === 0) {
      tickersMissingForCik += 1;
      continue;
    }
    rows.push(rowFromEntry(e, asOf, deps.discoveredBy, deps.correlationId, acceptance, ticker));
  }
  if (rows.length === 0) {
    const heartbeat = buildHeartbeatRow(asOf, deps.discoveredBy, deps.correlationId);
    await deps.insertRows([heartbeat]);
    log({
      event: 'insider_discovery_day_empty_after_acceptance_xwalk',
      as_of: asOf,
      discovered_by: deps.discoveredBy,
      correlation_id: deps.correlationId,
      entries_parsed: result.entries.length,
      entries_after_universe_filter: inUniverseEntries.length,
      submissions_fetch_status: submissionsStatus,
      accessions_missing_acceptance: accessionsMissingAcceptance,
      tickers_missing_for_cik: tickersMissingForCik,
      rows_inserted: 0,
      heartbeat_inserted: true,
    });
    return {
      as_of_date: asOf,
      entries_parsed: result.entries.length,
      entries_after_universe_filter: inUniverseEntries.length,
      rows_inserted: 0,
      heartbeat_inserted: true,
      data_unavailable: false,
      submissions_fetch_status: submissionsStatus,
      accessions_missing_acceptance: accessionsMissingAcceptance,
    };
  }
  await deps.insertRows(rows);
  log({
    event: 'insider_discovery_day_complete',
    as_of: asOf,
    discovered_by: deps.discoveredBy,
    correlation_id: deps.correlationId,
    entries_parsed: result.entries.length,
    entries_after_universe_filter: inUniverseEntries.length,
    rows_inserted: rows.length,
    heartbeat_inserted: false,
    submissions_fetch_status: submissionsStatus,
    accessions_missing_acceptance: accessionsMissingAcceptance,
    tickers_missing_for_cik: tickersMissingForCik,
  });
  return {
    as_of_date: asOf,
    entries_parsed: result.entries.length,
    entries_after_universe_filter: inUniverseEntries.length,
    rows_inserted: rows.length,
    heartbeat_inserted: false,
    data_unavailable: false,
    submissions_fetch_status: submissionsStatus,
    accessions_missing_acceptance: accessionsMissingAcceptance,
  };
}

/** Top-level dispatcher: drive one or many trading days through `runDiscoveryDay`. */
export async function runMode(mode: Mode, deps: RunDeps): Promise<DayOutcome[]> {
  const s = await runModeWithSummary(mode, deps);
  return s.outcomes;
}

// ---------------------------------------------------------------------------
// ACT-222 / Path-Q — two-pass per-issuer submissions dedup orchestrator.
//
// Background: the post-ACT-220-B repopulation drain (GHA run 27504513965,
// cancelled at ~1h45m with `Error: The operation was canceled` after
// status-200 across all observed fetches — pacing held). Queue state at
// cancel: 4,697 real rows + 55 heartbeats + 0 null_acceptance + 0
// null_ticker across as_of_dates 2026-03-16 → 2026-04-22 (~33% of the
// intended 63-day window). ACT-215 acceptance contract and ACT-220 ticker
// contract both held under load; the surfaced defect is the producer's
// ITERATION SHAPE — day-then-accession-within-day refetched each issuer's
// submissions feed once per day the issuer filed, ~14× redundant fetches
// across the backfill window (4,451 fetches against ~700 unique issuers
// → ~6× redundancy by the dedup-ratio arithmetic below; the operator's
// estimate of ~20× was based on the upper-bound 14k-row population, not
// the 4,451-call cancelled drain).
//
// Path-Q restructures `runMode` for backfill as TWO sequential passes:
//   Pass 1 — Discovery enumeration: iterate days, parse master.idx, filter
//            in-universe entries. NO submissions-feed fetches.
//   Pass 2 — Per-issuer submissions enrichment: collect the UNIQUE set of
//            issuer CIKs across all days; fetch submissions ONCE per CIK
//            (paced + retried per ACT-219 / ACT-221 disciplines).
//   Pass 3 — Cross-walk + insert per day, against the global acceptance map.
//
// Daily mode (single day) delegates to `runDiscoveryDay` unchanged — the
// dedup ratio is structurally 1.0 for a single-day fire and the existing
// per-day path is the right shape there.
//
// Catalog #48 (subsequent firing #2; ACT-222 amendment): producer-side
// fetches against rate-limited vendor reference data MUST deduplicate by
// the natural primary key of the upstream resource (issuer_cik for
// submissions feeds; ticker for universe; etc.). Fetching the same
// resource N times across a backfill window is a Catalog #48 violation
// regardless of pacing being honored — pacing is necessary but not
// sufficient; the additional rule is fetch-once-per-unique-resource-per-fire.
// ---------------------------------------------------------------------------

export interface RunModeSummary {
  outcomes: DayOutcome[];
  /** Sum of in-universe entries across all parsed days (the denominator
   *  the producer would have fetched per-accession under the legacy
   *  per-day shape; the numerator of dedup_ratio). */
  total_accessions_processed: number;
  /** Count of UNIQUE padded issuer CIKs across all parsed days for which
   *  the producer issued exactly one submissions-feed fetch. */
  unique_issuers_fetched: number;
  /** total_accessions_processed / unique_issuers_fetched (0 if no
   *  issuers). The producer's burst reduction vs. the legacy per-day
   *  shape. */
  dedup_ratio: number;
  /** Count of in-universe accessions whose issuer's submissions feed
   *  did NOT return an `acceptanceDateTime` for that accession
   *  (Catalog #44 §(b) gate firing at xwalk time). Sum across days. */
  acceptance_xwalk_misses: number;
  /** Global per-issuer submissions-fetch status histogram across the
   *  entire fire (not per-day). 200/404/429/-1/0 buckets as in
   *  `DayOutcome.submissions_fetch_status`. */
  submissions_fetch_status: Record<string, number>;
}

export async function runModeWithSummary(mode: Mode, deps: RunDeps): Promise<RunModeSummary> {
  if (mode.kind === 'daily') {
    const outcome = await runDiscoveryDay(mode.asOf, deps);
    const status = outcome.submissions_fetch_status ?? {};
    const uniq = Object.values(status).reduce((a, b) => a + b, 0);
    const totalAcc = outcome.entries_after_universe_filter;
    return {
      outcomes: [outcome],
      total_accessions_processed: totalAcc,
      unique_issuers_fetched: uniq,
      dedup_ratio: uniq > 0 ? Number((totalAcc / uniq).toFixed(2)) : 0,
      acceptance_xwalk_misses: outcome.accessions_missing_acceptance ?? 0,
      submissions_fetch_status: status,
    };
  }
  return runBackfillDedup(mode, deps);
}

/** ACT-222 backfill orchestrator — Pass 1 (parse) → Pass 2 (per-issuer
 *  dedup'd submissions) → Pass 3 (xwalk + insert per day). */
async function runBackfillDedup(
  mode: { kind: 'backfill'; from: string; to: string },
  deps: RunDeps,
): Promise<RunModeSummary> {
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const isUniverseEntry = deps.isUniverseEntry ?? (() => true);
  const days = iterateTradingDays(mode.from, mode.to, deps.isTradingDay);

  // ── Pass 1: discovery enumeration ────────────────────────────────
  // ACT-223 cross-day-dedup contract (Catalog #48 subsequent firing #3
  // / Catalog #43 fixture-scope-mismatch subsequent firing): the
  // `uniqueIssuerCiks` Set is the GLOBAL accumulator across every day
  // in [from..to]. Pass 1 issues ZERO submissions-feed fetches and
  // simply collects the in-universe entries + the global unique-CIK
  // set. Pass 2 then iterates that single global set once. ANY future
  // refactor that re-scopes this Set to per-day (or re-fetches inside
  // a per-day inner loop) is a Catalog #48 violation by construction;
  // sentinels (p7) and (p8) in `insider-discovery-egress_test.ts`
  // bind this contract at the test gate.
  type DayParsed =
    | { asOf: string; kind: 'unavailable' }
    | { asOf: string; kind: 'parsed'; entriesParsed: number; inUniverseEntries: DailyIndexEntry[] };
  const parsedDays: DayParsed[] = [];
  const uniqueIssuerCiks = new Set<string>();
  for (const asOf of days) {
    const date = parseIsoDate(asOf);
    log({
      event: 'insider_discovery_day_start',
      as_of: asOf,
      discovered_by: deps.discoveredBy,
      correlation_id: deps.correlationId,
      pass: 1,
    });
    const result = await deps.fetcher.fetchDay(date);
    if (result.kind === 'unavailable') {
      parsedDays.push({ asOf, kind: 'unavailable' });
      continue;
    }
    const inUniverse = result.entries.filter((e) => isUniverseEntry(e));
    parsedDays.push({
      asOf,
      kind: 'parsed',
      entriesParsed: result.entries.length,
      inUniverseEntries: inUniverse,
    });
    for (const e of inUniverse) {
      const padded = normalizeFilerCikForUniverse(e.filer_cik);
      if (padded !== null) uniqueIssuerCiks.add(padded);
    }
  }

  // ── Pass 2: per-issuer submissions enrichment (deduplicated) ─────
  const sleep = deps.sleep ?? defaultSleep;
  const pacingMs = deps.submissionsPacingMs ?? SUBMISSIONS_PACING_FLOOR_MS;
  const acceptanceByAccession = new Map<string, string>();
  const submissionsStatus: Record<string, number> = {};
  let submissionsCallIndex = 0;
  log({
    event: 'insider_discovery_dedup_pass2_start',
    unique_issuers: uniqueIssuerCiks.size,
    pacing_ms: pacingMs,
    correlation_id: deps.correlationId,
  });
  for (const cik10 of uniqueIssuerCiks) {
    if (submissionsCallIndex > 0 && pacingMs > 0) {
      await sleep(pacingMs);
    }
    submissionsCallIndex += 1;
    let sub: EdgarSubmissionsResult;
    try {
      sub = await deps.submissions.fetchSubmissions({ cik: cik10 });
    } catch (e) {
      submissionsStatus['0'] = (submissionsStatus['0'] ?? 0) + 1;
      log({
        event: 'insider_discovery_submissions_error',
        cik10,
        message: (e as Error).message,
        correlation_id: deps.correlationId,
      });
      continue;
    }
    if (sub.kind === 'unavailable') {
      submissionsStatus['404'] = (submissionsStatus['404'] ?? 0) + 1;
      continue;
    }
    if (sub.kind === 'rate_limited') {
      submissionsStatus['429'] = (submissionsStatus['429'] ?? 0) + 1;
      continue;
    }
    if (sub.kind === 'malformed') {
      submissionsStatus['-1'] = (submissionsStatus['-1'] ?? 0) + 1;
      log({
        event: 'insider_discovery_submissions_malformed',
        cik10,
        reason: sub.reason,
        correlation_id: deps.correlationId,
      });
      continue;
    }
    submissionsStatus['200'] = (submissionsStatus['200'] ?? 0) + 1;
    for (const r of sub.rows as SubmissionsRecentRow[]) {
      acceptanceByAccession.set(r.accession_number, r.acceptance_datetime);
    }
  }

  // ── Pass 3: cross-walk + insert per day ──────────────────────────
  const outcomes: DayOutcome[] = [];
  let totalAccessions = 0;
  let totalXwalkMisses = 0;
  for (const p of parsedDays) {
    if (p.kind === 'unavailable') {
      const hb = buildHeartbeatRow(p.asOf, deps.discoveredBy, deps.correlationId);
      await deps.insertRows([hb]);
      log({
        event: 'insider_discovery_day_unavailable',
        as_of: p.asOf,
        discovered_by: deps.discoveredBy,
        correlation_id: deps.correlationId,
      });
      outcomes.push({
        as_of_date: p.asOf,
        entries_parsed: 0,
        entries_after_universe_filter: 0,
        rows_inserted: 0,
        heartbeat_inserted: true,
        data_unavailable: true,
      });
      continue;
    }
    if (p.inUniverseEntries.length === 0) {
      const hb = buildHeartbeatRow(p.asOf, deps.discoveredBy, deps.correlationId);
      await deps.insertRows([hb]);
      log({
        event: 'insider_discovery_day_empty',
        as_of: p.asOf,
        discovered_by: deps.discoveredBy,
        correlation_id: deps.correlationId,
        entries_parsed: p.entriesParsed,
        entries_after_universe_filter: 0,
        rows_inserted: 0,
        heartbeat_inserted: true,
      });
      outcomes.push({
        as_of_date: p.asOf,
        entries_parsed: p.entriesParsed,
        entries_after_universe_filter: 0,
        rows_inserted: 0,
        heartbeat_inserted: true,
        data_unavailable: false,
      });
      continue;
    }
    totalAccessions += p.inUniverseEntries.length;
    let missingAcc = 0;
    let missingTicker = 0;
    const rows: DiscoveryRow[] = [];
    for (const e of p.inUniverseEntries) {
      const acceptance = acceptanceByAccession.get(e.accession_number);
      if (acceptance === undefined) {
        missingAcc += 1;
        continue;
      }
      const padded = normalizeFilerCikForUniverse(e.filer_cik) ?? e.filer_cik;
      const ticker = deps.tickerForPaddedCik?.(padded) ?? null;
      if (ticker === null || ticker.length === 0) {
        missingTicker += 1;
        continue;
      }
      rows.push(rowFromEntry(e, p.asOf, deps.discoveredBy, deps.correlationId, acceptance, ticker));
    }
    totalXwalkMisses += missingAcc;
    if (rows.length === 0) {
      const hb = buildHeartbeatRow(p.asOf, deps.discoveredBy, deps.correlationId);
      await deps.insertRows([hb]);
      log({
        event: 'insider_discovery_day_empty_after_acceptance_xwalk',
        as_of: p.asOf,
        discovered_by: deps.discoveredBy,
        correlation_id: deps.correlationId,
        entries_parsed: p.entriesParsed,
        entries_after_universe_filter: p.inUniverseEntries.length,
        accessions_missing_acceptance: missingAcc,
        tickers_missing_for_cik: missingTicker,
        rows_inserted: 0,
        heartbeat_inserted: true,
      });
      outcomes.push({
        as_of_date: p.asOf,
        entries_parsed: p.entriesParsed,
        entries_after_universe_filter: p.inUniverseEntries.length,
        rows_inserted: 0,
        heartbeat_inserted: true,
        data_unavailable: false,
        accessions_missing_acceptance: missingAcc,
      });
      continue;
    }
    await deps.insertRows(rows);
    log({
      event: 'insider_discovery_day_complete',
      as_of: p.asOf,
      discovered_by: deps.discoveredBy,
      correlation_id: deps.correlationId,
      entries_parsed: p.entriesParsed,
      entries_after_universe_filter: p.inUniverseEntries.length,
      rows_inserted: rows.length,
      heartbeat_inserted: false,
      accessions_missing_acceptance: missingAcc,
      tickers_missing_for_cik: missingTicker,
    });
    outcomes.push({
      as_of_date: p.asOf,
      entries_parsed: p.entriesParsed,
      entries_after_universe_filter: p.inUniverseEntries.length,
      rows_inserted: rows.length,
      heartbeat_inserted: false,
      data_unavailable: false,
      accessions_missing_acceptance: missingAcc,
    });
  }

  const dedupRatio = uniqueIssuerCiks.size > 0
    ? Number((totalAccessions / uniqueIssuerCiks.size).toFixed(2))
    : 0;
  return {
    outcomes,
    total_accessions_processed: totalAccessions,
    unique_issuers_fetched: uniqueIssuerCiks.size,
    dedup_ratio: dedupRatio,
    acceptance_xwalk_misses: totalXwalkMisses,
    submissions_fetch_status: submissionsStatus,
  };
}

// ---------------------------------------------------------------------------
// Supabase REST insert (real-IO path; replaced in tests via RunDeps)
// ---------------------------------------------------------------------------

export interface SupabaseRestEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface RestInsertResult {
  attempted: number;
  status: number;
  preferenceApplied: string | null;
}

/**
 * Insert rows into `public.insider_accession_discovery_queue` via the
 * Supabase REST API. `Prefer: resolution=ignore-duplicates` implements the
 * `ON CONFLICT DO NOTHING` semantic at the natural PK
 * `(as_of_date, issuer_cik, accession_number)`.
 */
export function makeRestInserter(env: SupabaseRestEnv) {
  const url = `${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/insider_accession_discovery_queue`;
  return async function insertRows(rows: readonly DiscoveryRow[]): Promise<RestInsertResult | undefined> {
    if (rows.length === 0) return undefined;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.serviceRoleKey,
        'Authorization': `Bearer ${env.serviceRoleKey}`,
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    const preferenceApplied = resp.headers.get('Preference-Applied');
    if (!resp.ok) {
      const body = await resp.text().catch(() => '<body unreadable>');
      throw new Error(
        `supabase REST insert failed: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 512)}`,
      );
    }
    // Drain body so Deno releases the response resource (return=minimal → empty).
    await resp.text().catch(() => undefined);
    console.log(JSON.stringify({
      event: 'insider_discovery_supabase_insert',
      table: 'insider_accession_discovery_queue',
      rest_path: '/rest/v1/insider_accession_discovery_queue',
      attempted_rows: rows.length,
      status: resp.status,
      preference_applied: preferenceApplied,
      correlation_id: rows[0]?.discovery_correlation_id ?? '',
      as_of_date: rows[0]?.as_of_date ?? '',
    }));
    return { attempted: rows.length, status: resp.status, preferenceApplied };
  };
}

export async function verifyPersistedCount(env: SupabaseRestEnv, correlationId: string): Promise<number> {
  const url = `${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/insider_accession_discovery_queue?select=discovery_correlation_id&discovery_correlation_id=eq.${encodeURIComponent(correlationId)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': env.serviceRoleKey,
      'Authorization': `Bearer ${env.serviceRoleKey}`,
      'Prefer': 'count=exact',
      'Range': '0-0',
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '<body unreadable>');
    throw new Error(
      `supabase REST post-write verification failed: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 512)}`,
    );
  }
  const range = resp.headers.get('Content-Range');
  await resp.text().catch(() => undefined);
  const m = range?.match(/\/(\d+)$/);
  if (m === null || m === undefined) {
    throw new Error(`supabase REST post-write verification missing Content-Range exact count (got ${range ?? '<absent>'})`);
  }
  return Number(m[1]);
}

// ---------------------------------------------------------------------------
// PK-triple post-write verification (the correct predicate)
//
// Background — 2026-06-18 red, Hypothesis A reconciled live-DB-confirmed:
// the old `verifyPersistedCount` queried by THIS run's
// `discovery_correlation_id`. With `resolution=ignore-duplicates,
// return=minimal`, a benign idempotent re-run (all PK-triples already
// present from a prior run) returns 201 with an empty body and writes
// zero new rows — leaving zero rows tagged with this run's id even
// though every accession the run discovered IS present in the table
// (under the prior run's id). The old predicate threw on that case,
// reporting a "post-write verification found zero rows" failure for
// data that was fully persisted.
//
// The correct predicate asserts the run's INTENDED PROPERTY: the
// `(as_of_date, issuer_cik, accession_number)` PK-triples this run
// submitted are PRESENT in the table — regardless of which
// `discovery_correlation_id` labels them. The natural PK is the
// authoritative identity of a discovery row; a prior run's label on the
// same triple is the same row.
//
// Implementation shape: per submitted `as_of_date`, page the live
// `(issuer_cik, accession_number)` set for that day from PostgREST and
// intersect with the submitted triples for that day. This avoids URL-
// length problems that an `or=(and(...),and(...),...)` composite filter
// would hit at ~180+ rows/day, and bounds the read volume by the
// per-day row count (already small: ~180/day in production).
// ---------------------------------------------------------------------------

export interface PkTriple {
  as_of_date: string;
  issuer_cik: string;
  accession_number: string;
}

export interface PkVerificationResult {
  submitted: number;
  present: number;
  missing: PkTriple[];
}

/** PostgREST default page size; we explicitly page via Range to be safe. */
const VERIFY_PAGE_SIZE = 1000;

/** Fetch every `(issuer_cik, accession_number)` for a given `as_of_date`. */
async function fetchPkPairsForDay(
  env: SupabaseRestEnv,
  asOfDate: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/insider_accession_discovery_queue?select=issuer_cik,accession_number&as_of_date=eq.${encodeURIComponent(asOfDate)}&order=issuer_cik.asc,accession_number.asc`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': env.serviceRoleKey,
        'Authorization': `Bearer ${env.serviceRoleKey}`,
        'Range-Unit': 'items',
        'Range': `${offset}-${offset + VERIFY_PAGE_SIZE - 1}`,
      },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '<body unreadable>');
      throw new Error(
        `supabase REST post-write PK-triple verification failed for ${asOfDate}: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 512)}`,
      );
    }
    const rows = await resp.json().catch(() => []) as Array<{ issuer_cik: string; accession_number: string }>;
    for (const r of rows) {
      out.add(`${r.issuer_cik}\u0000${r.accession_number}`);
    }
    if (rows.length < VERIFY_PAGE_SIZE) break;
    offset += VERIFY_PAGE_SIZE;
  }
  return out;
}

/**
 * Verify that every submitted PK-triple is present in
 * `public.insider_accession_discovery_queue`. SUCCESS iff every
 * submitted `(as_of_date, issuer_cik, accession_number)` triple is
 * present — whether newly written by this run or pre-existing from a
 * prior idempotent run. Returns the breakdown for telemetry; callers
 * decide whether `missing.length > 0` is a failure.
 */
export async function verifyPersistedPkTriples(
  env: SupabaseRestEnv,
  submitted: readonly PkTriple[],
): Promise<PkVerificationResult> {
  if (submitted.length === 0) {
    return { submitted: 0, present: 0, missing: [] };
  }
  // Group submitted by as_of_date, dedup'd by (cik|accession) within the day.
  const byDay = new Map<string, Set<string>>();
  for (const t of submitted) {
    let s = byDay.get(t.as_of_date);
    if (s === undefined) {
      s = new Set<string>();
      byDay.set(t.as_of_date, s);
    }
    s.add(`${t.issuer_cik}\u0000${t.accession_number}`);
  }
  let submittedDistinct = 0;
  let present = 0;
  const missing: PkTriple[] = [];
  for (const [day, expected] of byDay) {
    submittedDistinct += expected.size;
    const actual = await fetchPkPairsForDay(env, day);
    for (const key of expected) {
      if (actual.has(key)) {
        present += 1;
      } else {
        const idx = key.indexOf('\u0000');
        missing.push({
          as_of_date: day,
          issuer_cik: key.slice(0, idx),
          accession_number: key.slice(idx + 1),
        });
      }
    }
  }
  return { submitted: submittedDistinct, present, missing };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function readRequiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (v === undefined || v.trim().length === 0) {
    throw new Error(`missing required env var: ${name}`);
  }
  return v;
}

if (import.meta.main) {
  const parsed = parseArgs(Deno.args);
  if (parsed.kind === 'error') {
    console.error(JSON.stringify({ event: 'insider_discovery_args_error', reason: parsed.reason }));
    Deno.exit(3);
  }
  let env: SupabaseRestEnv;
  let contactEmail: string;
  try {
    env = {
      supabaseUrl: readRequiredEnv('SUPABASE_URL'),
      serviceRoleKey: readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    };
    contactEmail = readRequiredEnv('EDGAR_CONTACT_EMAIL');
  } catch (e) {
    console.error(JSON.stringify({ event: 'insider_discovery_env_error', reason: (e as Error).message }));
    Deno.exit(3);
  }
  const correlationId = crypto.randomUUID();
  const discoveredBy: DiscoveredBy = parsed.mode.kind === 'daily' ? 'gha-daily' : 'backfill-oneshot';
  try {
    const fetcher = new EdgarDailyIndexFetcher(contactEmail);
    // ACT-215: per-issuer submissions feed — acceptance source-of-truth.
    const submissions = new EdgarSubmissionsFetcher(contactEmail);
    const cikMapper = new EdgarCikMapper(contactEmail);
    const universeTickers = await loadCurrentUniverseTickers(env);
    // ACT-220 / Path-Y: load the padded-CIK → ticker map ONCE per CLI
    // entry (the underlying `company_tickers.json` fetch is issued
    // exactly once via the mapper's in-isolate memo). Both the
    // in-universe filter and the producer-time ticker stamp derive
    // from this single map — no second fetch, no per-day re-load.
    const cikToTicker = await loadUniverseCikToTicker(universeTickers, cikMapper);
    const universeCik10 = new Set(cikToTicker.keys());
    console.log(JSON.stringify({
      event: 'insider_discovery_universe_loaded',
      operator_id: DEFAULT_OPERATOR_ID,
      universe_tickers: universeTickers.length,
      universe_cik10_resolved: universeCik10.size,
      correlation_id: correlationId,
    }));
    if (universeTickers.length === 0 || universeCik10.size === 0) {
      throw new Error(
        `universe filter unavailable: universe_tickers=${universeTickers.length}, universe_cik10_resolved=${universeCik10.size}`,
      );
    }
    // ACT-298: capture every submitted PK-triple so post-write
    // verification can assert presence by `(as_of_date, issuer_cik,
    // accession_number)` — the correct identity — rather than by this
    // run's `discovery_correlation_id`, which `ignore-duplicates`
    // legitimately drops on a benign idempotent re-run.
    const submittedPkTriples: PkTriple[] = [];
    const baseInserter = makeRestInserter(env);
    const capturingInserter = async (rows: readonly DiscoveryRow[]) => {
      for (const r of rows) {
        submittedPkTriples.push({
          as_of_date: r.as_of_date,
          issuer_cik: r.issuer_cik,
          accession_number: r.accession_number,
        });
      }
      return baseInserter(rows);
    };
    const deps: RunDeps = {
      fetcher,
      submissions,
      insertRows: capturingInserter,
      correlationId,
      discoveredBy,
      isUniverseEntry: buildUniverseEntryPredicate(universeCik10),
      tickerForPaddedCik: (paddedCik) => cikToTicker.get(paddedCik) ?? null,
    };
    console.log(
      JSON.stringify({
        event: 'insider_discovery_run_start',
        mode: parsed.mode,
        discovered_by: discoveredBy,
        correlation_id: correlationId,
      }),
    );
    const summary = await runModeWithSummary(parsed.mode, deps);
    const outcomes = summary.outcomes;
    const entriesParsed = outcomes.reduce((s, o) => s + o.entries_parsed, 0);
    const entriesAfterUniverseFilter = outcomes.reduce((s, o) => s + o.entries_after_universe_filter, 0);
    const rowsTotal = outcomes.reduce((s, o) => s + o.rows_inserted, 0);
    const heartbeats = outcomes.filter((o) => o.heartbeat_inserted).length;
    const unavailable = outcomes.filter((o) => o.data_unavailable).length;
    const accessionsMissingAcceptanceTotal = outcomes.reduce(
      (s, o) => s + (o.accessions_missing_acceptance ?? 0),
      0,
    );
    // ACT-222: per-issuer fetch status is now a single global counter
    // emitted at Pass-2 (dedup'd) for backfill, or aggregated from the
    // single day's outcome for daily mode. The legacy per-day-aggregation
    // path is preserved as a defense-in-depth fallback that simply sums
    // to the same total for daily mode.
    const submissionsFetchStatusTotal: Record<string, number> = {
      ...summary.submissions_fetch_status,
    };
    const persistedByCorrelation = await verifyPersistedCount(env, correlationId);
    const expectedWrites = rowsTotal + heartbeats;
    if (entriesParsed > 0 && entriesAfterUniverseFilter === 0) {
      throw new Error(
        `semantic-success verification failed: entries_parsed=${entriesParsed} but entries_after_universe_filter=0; refusing green exit with structural-only success`,
      );
    }
    // ACT-298: PK-triple verification is the correct predicate.
    // SUCCESS iff every submitted (as_of_date, issuer_cik,
    // accession_number) triple is present — whether newly written by
    // this run OR pre-existing from a prior idempotent run (the
    // `ignore-duplicates` semantic). FAILURE only when a submitted
    // triple is genuinely MISSING from the table after the insert
    // (the real write-hole / Hypothesis-B case).
    const pkVerification = await verifyPersistedPkTriples(env, submittedPkTriples);
    const idempotentRerun = expectedWrites > 0
      && pkVerification.missing.length === 0
      && persistedByCorrelation === 0;
    if (idempotentRerun) {
      // Positively identify the benign re-run path so the next
      // operator does not have to infer it from log contradictions.
      console.log(JSON.stringify({
        event: 'insider_discovery_idempotent_rerun',
        correlation_id: correlationId,
        submitted_pk_triples: pkVerification.submitted,
        present_after_verify: pkVerification.present,
        persisted_rows_by_correlation_id: persistedByCorrelation,
        note: 'all submitted PK-triples were already present under a prior run; ignore-duplicates correctly suppressed every insert; data is intact',
      }));
    }
    if (pkVerification.missing.length > 0) {
      throw new Error(
        `post-write PK-triple verification found ${pkVerification.missing.length} of ${pkVerification.submitted} submitted (as_of_date,issuer_cik,accession_number) triples MISSING after insert (correlation_id=${correlationId}); first missing: ${JSON.stringify(pkVerification.missing[0])}`,
      );
    }
    console.log(
      JSON.stringify({
        event: 'insider_discovery_run_complete',
        correlation_id: correlationId,
        days: outcomes.length,
        entries_parsed: entriesParsed,
        entries_after_universe_filter: entriesAfterUniverseFilter,
        // ACT-298: relabelled — PostgREST `return=minimal` gives no
        // server-confirmed inserted-count signal, so this is the
        // SUBMITTED count (rows handed to the inserter), NOT a
        // verified inserted count. The verified count is
        // `present_after_verify` below.
        rows_submitted: rowsTotal,
        heartbeats_inserted: heartbeats,
        days_unavailable: unavailable,
        // ACT-215: per-issuer submissions-feed status histogram + the
        // count of in-universe accessions dropped because the feed did
        // not surface their acceptance value (operator-visible).
        submissions_fetch_status: submissionsFetchStatusTotal,
        accessions_missing_acceptance: accessionsMissingAcceptanceTotal,
        // ACT-222: dedup telemetry. `unique_issuers_fetched` is the
        // count of distinct padded issuer CIKs fetched ONCE in Pass 2
        // (vs. the legacy per-day-per-issuer shape that surfaced the
        // ~6× redundancy under the cancelled 2026-06-14 drain).
        // Forward-binding: any future signal whose producer iterates a
        // rate-limited reference resource MUST surface its dedup ratio
        // here (Catalog #48 amendment, subsequent firing #2).
        total_accessions_processed: summary.total_accessions_processed,
        unique_issuers_fetched: summary.unique_issuers_fetched,
        dedup_ratio: summary.dedup_ratio,
        acceptance_xwalk_misses: summary.acceptance_xwalk_misses,
        // ACT-298: PK-triple verification telemetry (the correct
        // predicate). `present_after_verify` is the count of submitted
        // triples found in the table by `(as_of_date, issuer_cik,
        // accession_number)`. `persisted_rows_by_correlation_id` is
        // retained as a diagnostic — zero with present_after_verify ==
        // submitted means a benign idempotent re-run.
        submitted_pk_triples: pkVerification.submitted,
        present_after_verify: pkVerification.present,
        missing_after_verify: pkVerification.missing.length,
        idempotent_rerun: idempotentRerun,
        persisted_rows_by_correlation_id: persistedByCorrelation,
      }),
    );
    Deno.exit(0);
  } catch (e) {
    if (e instanceof EdgarFetchError) {
      console.error(
        JSON.stringify({
          event: 'insider_discovery_sec_failure',
          correlation_id: correlationId,
          operation: e.operation,
          message: e.message,
        }),
      );
      Deno.exit(1);
    }
    console.error(
      JSON.stringify({
        event: 'insider_discovery_supabase_failure',
        correlation_id: correlationId,
        message: (e as Error).message,
      }),
    );
    Deno.exit(2);
  }
}