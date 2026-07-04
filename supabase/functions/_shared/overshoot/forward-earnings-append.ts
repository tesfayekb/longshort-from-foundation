// FP-069 W3.5.a (ACT-462.a) — forward-earnings-append orchestrator + staleness
// predicate.
//
// PURE MODULE. No DB, no network, no wall-clock. Given a
// `FmpEarningsCalendarFetcher` (bulk-range, one-request) plus the operator-
// ratified window params, produces the idempotent-upsert row set for
// `overshoot_earnings_calendar` covering the forward exclusion window at
// as_of, PLUS exports the pure `isEarningsCalendarStale` predicate the
// detector wires in at W3.5.b.
//
// OPERATOR-RATIFIED PARAMETERS (see ACT-462.a, do NOT drift):
//   (1) exclusionWidthDays: SOURCES FROM THE DETECTOR'S OWN NAMED-PARAMETER
//       CONFIG (ratified-priors home = 5, provenance cite: FP-069 W3 priors
//       ratification LONG/SHORT `exclusion_width = +/-5d`). NOT sourced from
//       overshoot_study_runs.params_jsonb — the study sweeps the grid
//       {0,3,5,7} and carries no single width. Forward-fetch and detector
//       MUST read the SAME config object so they cannot structurally diverge.
//   (2) marginDays: 2 CALENDAR days (unit-consistent with the calendar-day
//       exclusion arithmetic; membrane-clean, no trading-calendar import
//       needed; weekend overshoot accepted as costless).
//       -> forward window width in calendar days = width + margin = 7.
//   (3) capRows: 4000 (probe evidence 2026-07-04: `/stable/earnings-calendar`
//       returns exactly 4000 rows for a 30d window with no truncation flag
//       and no next_page; 14d peak-season = 2877 = 72% headroom; 14d quiet =
//       971 = 76% headroom). A response of exactly `capRows` throws
//       `EarningsCalendarCapBreachError` BEFORE any upsert; retry-with-
//       smaller-window is FORBIDDEN as silent narrowing (DW-208 class).
//
// STALENESS PREDICATE (`isEarningsCalendarStale`):
//   Pure function; no clock read inside; both `lastFetchedAt` and `asOf`
//   supplied by the caller. Default `thresholdHours = 26` — derivation:
//   the detection cron cadence is 24h, plus a 2h grace for cron drift +
//   boundary conditions. Matches the `si_stale` predicate cadence pattern
//   in the detector (symmetric per D1). Detector at W3.5.b will call this
//   per-ticker and emit the `earnings_calendar_stale` refusal.
//
// NAMING CAVEAT (recorded per ACT-462.a D2 ruling): the grouped fetcher
// binds POLYGON_API_KEY_PROD_PROBE, but this module binds FMP_API_KEY
// (bulk earnings) — no Polygon dependency here. Fetchers stay decoupled.
import {
  type EarningsRow,
  FmpEarningsCalendarFetcher,
} from './earnings-calendar-fetcher.ts';

/** DB row shape matches `overshoot_earnings_calendar` columns 1:1. */
export interface EarningsCalendarUpsertRow {
  ticker: string;
  announcement_date: string;
  source: 'fmp'; // this orchestrator only appends via FMP bulk range
  hour: null;    // FMP does not carry the session flag (typed absence)
  quarter: number | null;
  fiscal_year: number | null;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate: number | null;
  revenue_actual: number | null;
  source_run_id: string;
  fetched_as_of: string;
}

export class EarningsCalendarCapBreachError extends Error {
  constructor(
    public readonly fromIso: string,
    public readonly toIso: string,
    public readonly windowDays: number,
    public readonly rowsReturned: number,
    public readonly capRows: number,
  ) {
    super(
      `[earnings_calendar_cap_breach:${fromIso}..${toIso}] vendor returned ` +
      `${rowsReturned} rows (window=${windowDays}d, cap=${capRows}). ` +
      `Response indistinguishable from silent truncation — refuse the append; ` +
      `retry-with-smaller-window forbidden (silent narrowing = DW-208). ` +
      `Operator ratification required to raise cap or reduce window.`,
    );
    this.name = 'EarningsCalendarCapBreachError';
  }
}

export interface AppendForwardEarningsInput {
  fetcher: FmpEarningsCalendarFetcher;
  /** Detection as-of date (injected clock upstream). */
  asOf: Date;
  /** From detector config; DO NOT source from study params_jsonb. */
  exclusionWidthDays: number;
  /** Calendar days. Ratified default in caller = 2. */
  marginDays: number;
  /** FK to overshoot_backfill_runs(run_id). */
  sourceRunId: string;
  /** Injected clock; stamped onto every row. */
  fetchedAsOf: Date;
  /** Vendor row cap. Ratified default in caller = 4000. */
  capRows: number;
}

export interface AppendForwardEarningsResult {
  fromIso: string;
  toIso: string;
  windowDays: number;
  rows: EarningsCalendarUpsertRow[];
  vendorRowCount: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Fetch + decode forward-window earnings via FMP bulk range. Idempotent at
 * the DB layer via `overshoot_earnings_calendar` PK (ticker, announcement_date,
 * source). THROWS on cap breach — caller MUST NOT persist partial rows.
 */
export async function appendForwardEarnings(
  input: AppendForwardEarningsInput,
): Promise<AppendForwardEarningsResult> {
  const {
    fetcher, asOf, exclusionWidthDays, marginDays, sourceRunId, fetchedAsOf, capRows,
  } = input;

  if (!sourceRunId || sourceRunId.length === 0) {
    throw new Error('appendForwardEarnings: sourceRunId is required.');
  }
  if (!Number.isFinite(exclusionWidthDays) || exclusionWidthDays < 0) {
    throw new Error('appendForwardEarnings: exclusionWidthDays must be a non-negative finite number.');
  }
  if (!Number.isFinite(marginDays) || marginDays < 0) {
    throw new Error('appendForwardEarnings: marginDays must be a non-negative finite number.');
  }
  if (!Number.isInteger(capRows) || capRows <= 0) {
    throw new Error('appendForwardEarnings: capRows must be a positive integer.');
  }

  // Forward window: as_of + 1 calendar day .. as_of + exclusionWidthDays + marginDays.
  const from = new Date(asOf.getTime() + 1 * MS_PER_DAY);
  const to   = new Date(asOf.getTime() + (exclusionWidthDays + marginDays) * MS_PER_DAY);
  const fromIso = isoDate(from);
  const toIso   = isoDate(to);
  const windowDays = exclusionWidthDays + marginDays;

  const vendorRows: EarningsRow[] = await fetcher.fetchRange(fromIso, toIso);

  if (vendorRows.length >= capRows) {
    throw new EarningsCalendarCapBreachError(
      fromIso, toIso, windowDays, vendorRows.length, capRows,
    );
  }

  const fetchedAsOfIso = fetchedAsOf.toISOString();
  const rows: EarningsCalendarUpsertRow[] = vendorRows.map((r) => ({
    ticker: r.ticker,
    announcement_date: r.announcement_date,
    source: 'fmp',
    hour: null,
    quarter: r.quarter,
    fiscal_year: r.fiscal_year,
    eps_estimate: r.eps_estimate,
    eps_actual: r.eps_actual,
    revenue_estimate: r.revenue_estimate,
    revenue_actual: r.revenue_actual,
    source_run_id: sourceRunId,
    fetched_as_of: fetchedAsOfIso,
  }));
  // Deterministic order (observability + test stability).
  rows.sort((a, b) => {
    const d = a.announcement_date.localeCompare(b.announcement_date);
    return d !== 0 ? d : a.ticker.localeCompare(b.ticker);
  });

  return { fromIso, toIso, windowDays, rows, vendorRowCount: vendorRows.length };
}

// ---------- Staleness predicate ----------

/** Default staleness threshold; see module header for derivation (24h cron
 *  + 2h grace, symmetric with si_stale cadence). */
export const DEFAULT_EARNINGS_CALENDAR_STALENESS_HOURS = 26;

export interface IsEarningsCalendarStaleInput {
  /** When the calendar was last successfully appended (typed absence => stale). */
  lastFetchedAt: Date | null;
  /** Detection as-of instant (injected clock upstream). */
  asOf: Date;
  /** Threshold in hours; caller supplies for override, otherwise use default. */
  thresholdHours?: number;
}

/**
 * Pure predicate. `lastFetchedAt === null` (never fetched) => stale.
 * `(asOf - lastFetchedAt) > threshold` => stale. Otherwise fresh.
 * The detector at W3.5.b calls this once per detection run (not per-ticker
 * — the whole calendar is a single artifact) and, on stale, emits the
 * `earnings_calendar_stale` refusal for every candidate that would otherwise
 * have passed the earnings-exclusion filter — symmetric with `si_stale`.
 */
export function isEarningsCalendarStale(input: IsEarningsCalendarStaleInput): boolean {
  const {
    lastFetchedAt, asOf,
    thresholdHours = DEFAULT_EARNINGS_CALENDAR_STALENESS_HOURS,
  } = input;
  if (lastFetchedAt === null) return true;
  if (!Number.isFinite(thresholdHours) || thresholdHours < 0) {
    throw new Error('isEarningsCalendarStale: thresholdHours must be a non-negative finite number.');
  }
  const ageMs = asOf.getTime() - lastFetchedAt.getTime();
  return ageMs > thresholdHours * 60 * 60 * 1000;
}