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
import { EdgarFetchError } from '../supabase/functions/_shared/longshort-signals/insider-transactions/edgar-cik-mapper.ts';
import {
  isoDate,
  isTradingDay,
  parseIsoDate,
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
}

/** Sentinel constants for the R1 heartbeat row. */
export const HEARTBEAT_ISSUER_CIK = '__heartbeat__';
export const HEARTBEAT_ACCESSION_NUMBER = '__heartbeat__';
export const HEARTBEAT_COMPANY_NAME = '__heartbeat__';
export const HEARTBEAT_FILENAME = '__heartbeat__';

/** Outcome per day — surfaced into the run summary for forensics. */
export interface DayOutcome {
  as_of_date: string;
  rows_inserted: number;
  heartbeat_inserted: boolean;
  /** master.idx returned 404 (kind:'unavailable'). Still writes a heartbeat. */
  data_unavailable: boolean;
}

/** Injectable deps — every IO surface goes through here so the test suite is hermetic. */
export interface RunDeps {
  fetcher: EdgarDailyIndexFetcher;
  insertRows: (rows: readonly DiscoveryRow[]) => Promise<void>;
  correlationId: string;
  discoveredBy: DiscoveredBy;
  /** Single source of truth for the trading-day iterator (NYSE holidays via shared/). */
  isTradingDay?: (d: Date) => boolean;
  /** Stamp emitted on every structured-log line so reconciliation can join the GHA run URL. */
  log?: (event: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let asOf: string | null = null;
  let backfillFrom: string | null = null;
  let backfillTo: string | null = null;
  for (const a of argv) {
    if (a.startsWith('--as-of=')) {
      asOf = a.slice('--as-of='.length).trim();
    } else if (a.startsWith('--backfill-from=')) {
      backfillFrom = a.slice('--backfill-from='.length).trim();
    } else if (a.startsWith('--backfill-to=')) {
      backfillTo = a.slice('--backfill-to='.length).trim();
    } else if (a.length > 0) {
      return { kind: 'error', reason: `unknown argument: ${a}` };
    }
  }
  const daily = asOf !== null;
  const backfill = backfillFrom !== null || backfillTo !== null;
  if (daily && backfill) {
    return {
      kind: 'error',
      reason: '--as-of is mutually exclusive with --backfill-from/--backfill-to',
    };
  }
  if (daily) {
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

/** Build a `DiscoveryRow` from a parsed `DailyIndexEntry`. */
export function rowFromEntry(
  e: DailyIndexEntry,
  asOf: string,
  discoveredBy: DiscoveredBy,
  correlationId: string,
): DiscoveryRow {
  return {
    as_of_date: asOf,
    issuer_cik: e.filer_cik,
    accession_number: e.accession_number,
    form_type: e.form_type,
    company_name: e.company_name,
    filename: e.filename,
    discovered_by: discoveredBy,
    discovery_correlation_id: correlationId,
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
  };
}

// ---------------------------------------------------------------------------
// Core engine — pure modulo `RunDeps`
// ---------------------------------------------------------------------------

/**
 * Process one trading day: fetch master.idx, transform to rows, insert into
 * the queue. Empty-day → heartbeat row. 404 → heartbeat row + data_unavailable.
 * SEC failure → throws `EdgarFetchError` (caller maps to exit 1).
 * Supabase failure → throws `Error` (caller maps to exit 2).
 */
export async function runDiscoveryDay(asOf: string, deps: RunDeps): Promise<DayOutcome> {
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
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
    return { as_of_date: asOf, rows_inserted: 0, heartbeat_inserted: true, data_unavailable: true };
  }
  if (result.entries.length === 0) {
    const heartbeat = buildHeartbeatRow(asOf, deps.discoveredBy, deps.correlationId);
    await deps.insertRows([heartbeat]);
    log({
      event: 'insider_discovery_day_empty',
      as_of: asOf,
      discovered_by: deps.discoveredBy,
      correlation_id: deps.correlationId,
      rows_inserted: 0,
      heartbeat_inserted: true,
    });
    return { as_of_date: asOf, rows_inserted: 0, heartbeat_inserted: true, data_unavailable: false };
  }
  const rows = result.entries.map((e) =>
    rowFromEntry(e, asOf, deps.discoveredBy, deps.correlationId),
  );
  await deps.insertRows(rows);
  log({
    event: 'insider_discovery_day_complete',
    as_of: asOf,
    discovered_by: deps.discoveredBy,
    correlation_id: deps.correlationId,
    rows_inserted: rows.length,
    heartbeat_inserted: false,
  });
  return {
    as_of_date: asOf,
    rows_inserted: rows.length,
    heartbeat_inserted: false,
    data_unavailable: false,
  };
}

/** Top-level dispatcher: drive one or many trading days through `runDiscoveryDay`. */
export async function runMode(mode: Mode, deps: RunDeps): Promise<DayOutcome[]> {
  const days =
    mode.kind === 'daily'
      ? [mode.asOf]
      : iterateTradingDays(mode.from, mode.to, deps.isTradingDay);
  const outcomes: DayOutcome[] = [];
  for (const d of days) {
    outcomes.push(await runDiscoveryDay(d, deps));
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Supabase REST insert (real-IO path; replaced in tests via RunDeps)
// ---------------------------------------------------------------------------

export interface SupabaseRestEnv {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/**
 * Insert rows into `public.insider_accession_discovery_queue` via the
 * Supabase REST API. `Prefer: resolution=ignore-duplicates` implements the
 * `ON CONFLICT DO NOTHING` semantic at the natural PK
 * `(as_of_date, issuer_cik, accession_number)`.
 */
export function makeRestInserter(env: SupabaseRestEnv) {
  const url = `${env.supabaseUrl.replace(/\/+$/, '')}/rest/v1/insider_accession_discovery_queue`;
  return async function insertRows(rows: readonly DiscoveryRow[]): Promise<void> {
    if (rows.length === 0) return;
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
    if (!resp.ok) {
      const body = await resp.text().catch(() => '<body unreadable>');
      throw new Error(
        `supabase REST insert failed: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 512)}`,
      );
    }
    // Drain body so Deno releases the response resource (return=minimal → empty).
    await resp.text().catch(() => undefined);
  };
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
  const fetcher = new EdgarDailyIndexFetcher(contactEmail);
  const deps: RunDeps = {
    fetcher,
    insertRows: makeRestInserter(env),
    correlationId,
    discoveredBy,
  };
  console.log(
    JSON.stringify({
      event: 'insider_discovery_run_start',
      mode: parsed.mode,
      discovered_by: discoveredBy,
      correlation_id: correlationId,
    }),
  );
  try {
    const outcomes = await runMode(parsed.mode, deps);
    const rowsTotal = outcomes.reduce((s, o) => s + o.rows_inserted, 0);
    const heartbeats = outcomes.filter((o) => o.heartbeat_inserted).length;
    const unavailable = outcomes.filter((o) => o.data_unavailable).length;
    console.log(
      JSON.stringify({
        event: 'insider_discovery_run_complete',
        correlation_id: correlationId,
        days: outcomes.length,
        rows_inserted: rowsTotal,
        heartbeats_inserted: heartbeats,
        days_unavailable: unavailable,
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