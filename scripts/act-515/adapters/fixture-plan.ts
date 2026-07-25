// ACT-515 Fixture Plan Reconstructor.
//
// Parses `fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl` (per PIN
// (b) of Module 1) and rebuilds a `PipelinePlan` suitable for `runPipeline`.
//
// SCOPE — TURN-1 (fixture-i):
//   · Reads the header comment line + `# ---` separator + JSON data lines.
//   · Maps detector-layer uppercase side → DB lowercase via `sideDetectorToDb`.
//   · Reconstructs a session grid from the fixture's own event/entry/exit
//     dates (fixture-i is a single event day; sessions = the set of dates
//     appearing in the rows, sorted ascending). This keeps the reconstructor
//     honest — it invents no calendar knowledge.
//   · Emits a `MapBarSource` seeded from the rows' `entry_open` (at
//     `entry_date`) and `exit_close` (at `exit_date`) — the only bars the
//     LAYER-1 gate needs, because the equity walk touches only those two
//     sessions and the fixture pnl_rule is "raw entry_open → raw exit_close".
//
// ANTI-PHANTOM: no wall-clock, no date-constructor, no RNG. Pure functions
// only.

import {
  type HandTruthFixture, type HandTruthFixtureHeader, type HandTruthFixtureRow,
  type SideDb,
  sideDetectorToDb, money, price, shares as sharesBrand,
} from '../kernel/types.ts';
import type { SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import type { PipelinePlan, PipelineLot } from '../kernel/runner.ts';

// -----------------------------------------------------------------------------
// Parser — hand-truth fixture (.jsonl with `#`-prefixed header + separator)
// -----------------------------------------------------------------------------

export function parseHandTruthFixture(source: string): HandTruthFixture {
  const lines = source.split('\n').filter((l) => l.length > 0);
  if (lines.length < 3) {
    throw new Error(`fixture: expected header + separator + ≥1 row, got ${lines.length} lines`);
  }
  const headerLine = lines[0];
  const separator = lines[1];
  if (!headerLine.startsWith('# ')) {
    throw new Error(`fixture: line 1 must start with '# ' (got: ${headerLine.slice(0, 20)}…)`);
  }
  if (separator.trim() !== '# ---') {
    throw new Error(`fixture: line 2 must be '# ---' (got: ${separator})`);
  }
  const header = JSON.parse(headerLine.slice(2)) as HandTruthFixtureHeader;
  const rows: HandTruthFixtureRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('#')) continue;
    rows.push(JSON.parse(l) as HandTruthFixtureRow);
  }
  return { header, rows };
}

// -----------------------------------------------------------------------------
// Session-grid derivation — fixture-i is entry-day + exit-day only.
// -----------------------------------------------------------------------------

export function deriveSessionsFromFixture(rows: ReadonlyArray<HandTruthFixtureRow>): SessionDate[] {
  const s = new Set<SessionDate>();
  for (const r of rows) {
    s.add(r.entry_date);
    s.add(r.exit_date);
  }
  return [...s].sort();
}

// -----------------------------------------------------------------------------
// Session calendar — the fixture's event_date + all session dates it touches.
// For fixture-i, the ordinal-10 exit for T2 requires that the calendar can
// return `sessionAfter(event_date, 10) = exit_date`. Since fixture-i's rows
// only carry entry+exit dates, we build the calendar from the KNOWN 2024
// NYSE sessions between the event date and the exit date (inclusive).
// This calendar is DECLARED (not derived from a live source) — it is a
// property of the fixture epoch and is pinned here so the LAYER-1 gate is
// self-contained.
// -----------------------------------------------------------------------------

/** NYSE trading sessions from 2024-05-02 through 2024-05-16 inclusive.
 *  Verified against the standard NYSE 2024 holiday calendar (no holidays
 *  fall in this range; weekends are 5/4, 5/5, 5/11, 5/12).
 *  Grep-anchor: fixture-i entry_date=2024-05-03 (ord-1 after 5/2) and
 *  exit_date=2024-05-16 (ord-10 after 5/2). */
export const FIXTURE_I_SESSIONS_2024_05: ReadonlyArray<SessionDate> = Object.freeze([
  '2024-05-02',   // event day
  '2024-05-03',   // ord-1  (entry)
  '2024-05-06',   // ord-2
  '2024-05-07',   // ord-3
  '2024-05-08',   // ord-4
  '2024-05-09',   // ord-5
  '2024-05-10',   // ord-6
  '2024-05-13',   // ord-7
  '2024-05-14',   // ord-8
  '2024-05-15',   // ord-9
  '2024-05-16',   // ord-10 (exit)
]);

// -----------------------------------------------------------------------------
// Reconstructor — fixture → PipelinePlan + BarSource + hand-truth expectations
// -----------------------------------------------------------------------------

export interface FixtureIReconstructed {
  readonly plan: PipelinePlan;
  readonly barSource: MapBarSource;
  /** Per-row hand-computed expectations (integer cents where applicable). */
  readonly expected: ReadonlyArray<{
    readonly lotId: string;
    readonly ticker: string;
    readonly sharesCount: number;
    readonly entryCashOutCents: number;  // shares × entry_open
    readonly exitCashInCents: number;    // shares × exit_close
    readonly realizedCents: number;      // round(pnl_usd × 100)
  }>;
  readonly startingEquityUsd: number;
  readonly endingEquityExpectedUsd: number;   // start + Σ realized
}

/** Fixture-i reconstruction. `startingEquityUsd` is a runner-injected
 *  parameter — the fixture header states per-lot sizing_usd=$2,500 but is
 *  silent on portfolio starting equity; a $100k rail (matching Module 4's
 *  KERNEL_CONST_BASE_EQUITY_USD) is the ratified default. */
export function reconstructFixtureI(
  fixture: HandTruthFixture,
  startingEquityUsd = 100_000,
): FixtureIReconstructed {
  const eventDate: SessionDate = fixture.header.as_of_event_date;

  const lots: PipelineLot[] = [];
  const expected: FixtureIReconstructed['expected'][number][] = [];
  const barEntries: Array<[string, SessionDate, number]> = [];

  let sumRealizedCents = 0;

  for (const r of fixture.rows) {
    const side = sideDetectorToDb(r.side);
    if (r.tier !== 'T1' && r.tier !== 'T2') {
      throw new Error(`fixture row ${r.ticker}: unknown tier ${r.tier}`);
    }
    const lotId = `fixI-${r.ticker}`;
    lots.push({
      lotId, ticker: r.ticker, side, tier: r.tier as 'T1' | 'T2',
      shares: sharesBrand(r.shares),
      entryPrice: price(r.entry_open),
      slotNotionalUsd: money(r.notional_usd),
      entryDate: r.entry_date,
      eventDate,
    });
    barEntries.push([r.ticker, r.entry_date, r.entry_open]);
    barEntries.push([r.ticker, r.exit_date, r.exit_close]);

    const sharesN = r.shares;
    const entryCashOutCents = Math.round(sharesN * r.entry_open * 100);
    const exitCashInCents = Math.round(sharesN * r.exit_close * 100);
    const realizedCents = Math.round(r.pnl_usd * 100);
    sumRealizedCents += realizedCents;
    expected.push({
      lotId, ticker: r.ticker,
      sharesCount: sharesN,
      entryCashOutCents, exitCashInCents, realizedCents,
    });
  }

  const barMap = new Map<string, ReturnType<typeof price>>();
  for (const [t, d, px] of barEntries) barMap.set(MapBarSource.key(t, d), price(px));
  const barSource = new MapBarSource(barMap);

  // CALENDAR keeps the full session grid so the ord-10 exit resolves
  // to 2024-05-16 (event_date=5/2 + 10 sessions). The EQUITY-WALK grid
  // is deliberately reduced to just {entry_date, exit_date}: the fixture
  // carries bars only at those two boundaries (pnl_rule: raw entry_open →
  // raw exit_close, with no intermediate marks). Walking the equity path
  // over interior sessions would trip `mark_gap_in_open_book` — honestly,
  // because those interior bars aren't in the fixture. Fixture-ii (TURN-2)
  // will exercise the interior-mark path with hand-computed checkpoints.
  const calendar = new ArraySessionCalendar(FIXTURE_I_SESSIONS_2024_05);
  const sessions = deriveSessionsFromFixture(fixture.rows);

  const plan: PipelinePlan = {
    startingEquityUsd: money(startingEquityUsd),
    sessions,
    calendar,
    lots,
  };

  const endingEquityExpectedUsd = startingEquityUsd + sumRealizedCents / 100;

  return {
    plan, barSource, expected,
    startingEquityUsd,
    endingEquityExpectedUsd,
  };
}

// =============================================================================
// FIXTURE-II SUPPORT (TURN-2 — landed 2026-07-25 gate half-2)
// -----------------------------------------------------------------------------
// Fixture-ii has FOUR files (hand-truth, bars, calendar, checkpoints) and
// carries pre-computed integer-cent expectations per lot + checkpoint rows.
// Row shape (see build-fixture-2023q2.ts::serializeHandTruth):
//   { lot_id, ticker, side ('long'|'short'), tier ('T1'|'T2'),
//     event_date, entry_date, exit_date,
//     entry_open, exit_close, shares,
//     entry_cash_out_cents (SIGNED — long: +, short: −),
//     exit_cash_in_cents   (SIGNED — long: +, short: −),
//     realized_cents       (SIGNED — long-natural, short-natural) }
// =============================================================================

export interface HandTruthIIRow {
  readonly lot_id: string;
  readonly ticker: string;
  readonly side: 'long' | 'short';
  readonly tier: 'T1' | 'T2';
  readonly event_date: SessionDate;
  readonly entry_date: SessionDate;
  readonly exit_date: SessionDate;
  readonly entry_open: number;
  readonly exit_close: number;
  readonly shares: number;
  readonly entry_cash_out_cents: number;
  readonly exit_cash_in_cents: number;
  readonly realized_cents: number;
}

export interface HandTruthIIFixture {
  readonly header: Record<string, unknown>;
  readonly rows: ReadonlyArray<HandTruthIIRow>;
}

export function parseHandTruthFixtureII(source: string): HandTruthIIFixture {
  const lines = source.split('\n').filter((l) => l.length > 0);
  if (lines.length < 3) throw new Error(`fixture-ii: expected header + separator + ≥1 row, got ${lines.length} lines`);
  const header = JSON.parse(lines[0].slice(2)) as Record<string, unknown>;
  const rows: HandTruthIIRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('#')) continue;
    rows.push(JSON.parse(l) as HandTruthIIRow);
  }
  return { header, rows };
}

export interface BarLine {
  readonly ticker: string;
  readonly trade_date: SessionDate;
  readonly close: number;
}
export function parseBars(source: string): BarLine[] {
  const lines = source.split('\n').filter((l) => l.length > 0);
  const out: BarLine[] = [];
  for (const l of lines) {
    if (l.startsWith('#')) continue;
    out.push(JSON.parse(l) as BarLine);
  }
  return out;
}

export interface CalendarPayload {
  readonly full_calendar: ReadonlyArray<SessionDate>;
  readonly equity_walk_sessions: ReadonlyArray<SessionDate>;
}
export function parseCalendar(source: string): CalendarPayload {
  const lines = source.split('\n').filter((l) => l.length > 0);
  let full: ReadonlyArray<SessionDate> = [];
  let walk: ReadonlyArray<SessionDate> = [];
  for (const l of lines) {
    if (l.startsWith('#')) continue;
    const obj = JSON.parse(l) as { kind: string; dates: SessionDate[] };
    if (obj.kind === 'full_calendar') full = obj.dates;
    else if (obj.kind === 'equity_walk_sessions') walk = obj.dates;
  }
  if (full.length === 0 || walk.length === 0) {
    throw new Error(`calendar: missing full_calendar or equity_walk_sessions kind`);
  }
  return { full_calendar: full, equity_walk_sessions: walk };
}

export interface CheckpointRow {
  readonly checkpoint: string;
  readonly sessionDate: SessionDate;
  readonly cashCents: number;
  readonly longMvCents: number;
  readonly shortMvCents: number;
  readonly equityCents: number;
  readonly openLotIds?: ReadonlyArray<string>;
  readonly sumRealizedCents_module6?: number;
  readonly cashWalker_delta_cents?: number;
  readonly cent_drift_cents?: number;
}
export function parseCheckpoints(source: string): CheckpointRow[] {
  const lines = source.split('\n').filter((l) => l.length > 0);
  const rows: CheckpointRow[] = [];
  for (const l of lines) {
    if (l.startsWith('#')) continue;
    rows.push(JSON.parse(l) as CheckpointRow);
  }
  return rows;
}

export interface FixtureIIExpected {
  readonly lotId: string;
  readonly ticker: string;
  readonly sharesCount: number;
  readonly entryCashOutCents: number;
  readonly exitCashInCents: number;
  readonly realizedCents: number;
}

export interface FixtureIIReconstructed {
  readonly plan: PipelinePlan;
  readonly barSource: MapBarSource;
  readonly expected: ReadonlyArray<FixtureIIExpected>;
  readonly startingEquityUsd: number;
}

/** Fixture-ii reconstruction. `startingEquityUsd` = 100_000 (fixture header
 *  `starting_equity_usd`). Bars, calendar and hand-truth rows are all passed
 *  through untouched — the reconstructor invents no data, only shape-adapts. */
export function reconstructFixtureII(
  fixture: HandTruthIIFixture,
  bars: ReadonlyArray<BarLine>,
  calendarPayload: CalendarPayload,
  startingEquityUsd = 100_000,
): FixtureIIReconstructed {
  const lots: PipelineLot[] = fixture.rows.map((r) => ({
    lotId: r.lot_id,
    ticker: r.ticker,
    side: r.side as SideDb,
    tier: r.tier,
    shares: sharesBrand(r.shares),
    entryPrice: price(r.entry_open),
    // Fixture sizing_rule: floor($10,000 / entry_open). The nominal slot
    // notional passed to `cashRequired` is $10,000; kernel then re-floors
    // to the same share count.
    slotNotionalUsd: money(10_000),
    entryDate: r.entry_date,
    eventDate: r.event_date,
  }));

  const expected: FixtureIIExpected[] = fixture.rows.map((r) => ({
    lotId: r.lot_id,
    ticker: r.ticker,
    sharesCount: r.shares,
    entryCashOutCents: r.entry_cash_out_cents,
    exitCashInCents: r.exit_cash_in_cents,
    realizedCents: r.realized_cents,
  }));

  const barMap = new Map<string, ReturnType<typeof price>>();
  for (const b of bars) barMap.set(MapBarSource.key(b.ticker, b.trade_date), price(b.close));
  const barSource = new MapBarSource(barMap);

  const calendar = new ArraySessionCalendar(calendarPayload.full_calendar);

  const plan: PipelinePlan = {
    startingEquityUsd: money(startingEquityUsd),
    sessions: calendarPayload.equity_walk_sessions,
    calendar,
    lots,
  };

  return { plan, barSource, expected, startingEquityUsd };
}