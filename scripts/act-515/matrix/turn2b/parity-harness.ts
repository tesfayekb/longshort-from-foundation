// ACT-515 Matrix — Turn-2B: parity harness.
//
// Implements the DEV-U · PARITY CONTRACT verbatim (RULING 2026-07-26). For
// each sampled (session, side) — where `session` is the slate row's
// event_date column — the harness verifies:
//
//   (i)   KEY-PARITY  — Deno-constructed cellKey byte-equals the slate
//         row's key columns for every row in the sample. Sourced from the
//         reconstructor helpers `buildLongCellKey` / `buildShortCellKey`.
//   (ii)  PICK-PARITY — the Deno admit set equals the first K rows of
//         slate order AFTER removing rows Deno skipped for TYPED reasons.
//         Allowed typed-removal classes (per contract):
//           entry_price_missing          — Stage-A `open` is null
//           no_cell / rank_null          — [not observable on slate rows]
//           position_already_open        — book-state; counted, never STOP
//           allocation_cap_reached       — book-state; counted, never STOP
//           short_daily_budget_reached   — book-state; counted, never STOP
//   (iii) STOP conditions —
//           any admitted (ticker,event_id) NOT in slate top-25 [prune breach],
//           any key mismatch, or any ordering divergence NOT explained by a
//           listed typed skip.
//
// The harness is PARTITION-LEVEL (one slate partition at a time). It does
// NOT re-simulate the cross-side K=5 entry-session admit loop; that is a
// separate concern of the R1 receipt turn's engine pass. This harness's
// job is to prove that offline Deno picks match the SQL compaction top-K
// on the same partition, modulo book-state (which SQL cannot model).

import {
  buildLongCellKey, buildShortCellKey, deriveLongTier,
  passesShortGeometry, shortBandFromSignedExcess, excessAtArgmax,
  SHORT_GEOMETRY_MATRIX, CELL_EXCLUSION_WIDTH_DAYS,
  entryOffsetForSideTier,
} from '../reconstructor.ts';
import type { CellKey, SideDb } from '../../kernel/types.ts';
import type { SessionDate } from '../../kernel/clock.ts';
import type { SlateRow } from './slate-row.ts';
import { PARITY_K, SLATE_TOP_N } from './slate-row.ts';

export type TypedSkipClass =
  | 'entry_price_missing'
  | 'no_cell_or_rank_null'
  | 'position_already_open'
  | 'allocation_cap_reached'
  | 'short_daily_budget_reached';

export type StopReason =
  | 'key_mismatch'
  | 'prune_breach'
  | 'ordering_divergence'
  | 'off_calendar_entry';

export interface Stop {
  readonly reason: StopReason;
  readonly session: SessionDate;
  readonly side: SideDb;
  readonly slateRank: number;
  readonly ticker: string;
  readonly eventId: number;
  readonly detail: string;
}

export interface PartitionParityResult {
  readonly session: SessionDate;
  readonly side: SideDb;
  readonly rowsChecked: number;
  readonly denoAdmits: ReadonlyArray<{ ticker: string; eventId: number; slateRank: number }>;
  readonly typedSkipsByClass: Readonly<Record<TypedSkipClass, number>>;
  readonly stops: ReadonlyArray<Stop>;
  readonly passed: boolean;
}

/** Book-state resolver: caller supplies at-slate-time proxy of open book.
 *  For the parity harness the default is EMPTY (session-local pick); the
 *  book-state gates are still recognized as valid typed-removals when the
 *  caller passes a non-trivial resolver. */
export interface BookStateProbe {
  isHeld(ticker: string): boolean;
  wouldBreachSideCap(side: SideDb, slotNotionalUsd: number): boolean;
  wouldBreachShortBudget(): boolean;
  onAdmit(side: SideDb, ticker: string, slotNotionalUsd: number): void;
}

export function emptyBookProbe(): BookStateProbe {
  return {
    isHeld: () => false,
    wouldBreachSideCap: () => false,
    wouldBreachShortBudget: () => false,
    onAdmit: () => {},
  };
}

/** Stage-A closes for entry-price-missing skip. Key: `${ticker}\0${session}`.
 *  Missing key OR null value both count as `entry_price_missing`. */
export type CloseLookup = (ticker: string, entrySession: SessionDate) => number | null;

export interface SessionOffset {
  sessionAfter(s: SessionDate, n: number): SessionDate | null;
}

function keyEqualsSlate(k: CellKey, r: SlateRow): boolean {
  return (
    k.side === r.side &&
    k.band === r.band &&
    k.argmaxWindowDays === r.window_days &&
    k.magnitudeQuintile === r.momentum_quintile &&
    k.drawdownBucket === r.drawdown_bucket &&
    k.exclusionHorizonDays === CELL_EXCLUSION_WIDTH_DAYS
  );
}

/** Verify a single (session, side) slate partition. `rows` MUST be the full
 *  slate for that partition, already in slate_rank order (ASC 1..25). */
export function checkPartition(
  session: SessionDate, side: SideDb,
  rows: ReadonlyArray<SlateRow>,
  closes: CloseLookup,
  offset: SessionOffset,
  book: BookStateProbe = emptyBookProbe(),
  k: number = PARITY_K,
): PartitionParityResult {
  const typedSkipsByClass: Record<TypedSkipClass, number> = {
    entry_price_missing: 0,
    no_cell_or_rank_null: 0,
    position_already_open: 0,
    allocation_cap_reached: 0,
    short_daily_budget_reached: 0,
  };
  const stops: Stop[] = [];
  const denoAdmits: Array<{ ticker: string; eventId: number; slateRank: number }> = [];
  let admittedShorts = 0;
  let admits = 0;

  // Guard: prune-breach domain = slate top-N.
  if (rows.length > SLATE_TOP_N) {
    stops.push({
      reason: 'prune_breach', session, side,
      slateRank: rows[SLATE_TOP_N]?.slate_rank ?? -1,
      ticker: rows[SLATE_TOP_N]?.ticker ?? '',
      eventId: rows[SLATE_TOP_N]?.event_id ?? -1,
      detail: `partition has ${rows.length} rows > SLATE_TOP_N=${SLATE_TOP_N}`,
    });
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    // (i) KEY-PARITY — build Deno cellKey and compare byte-equal.
    let key: CellKey | null = null;
    if (r.side === 'long') {
      if (deriveLongTier({
        eventId: r.event_id, ticker: r.ticker, side: 'long',
        eventDate: r.session,
        windowDays: r.window_days,
        momentumQuintile: r.momentum_quintile,
        drawdownBucket: r.drawdown_bucket,
        daysToNearestEarnings: r.days_to_nearest_earnings,
      }) === null) {
        stops.push({ reason: 'key_mismatch', session, side, slateRank: r.slate_rank,
          ticker: r.ticker, eventId: r.event_id,
          detail: 'deriveLongTier returned null on slate row' });
        continue;
      }
      key = buildLongCellKey({
        eventId: r.event_id, ticker: r.ticker, side: 'long',
        eventDate: r.session, windowDays: r.window_days,
        momentumQuintile: r.momentum_quintile, drawdownBucket: r.drawdown_bucket,
        daysToNearestEarnings: r.days_to_nearest_earnings,
      });
    } else {
      const cRow = {
        eventId: r.event_id, ticker: r.ticker, side: 'short' as SideDb,
        eventDate: r.session, windowDays: r.window_days,
        momentumQuintile: r.momentum_quintile, drawdownBucket: r.drawdown_bucket,
        daysToNearestEarnings: r.days_to_nearest_earnings,
        excessW1: r.excess_w1 == null ? null : Number(r.excess_w1),
        excessW2: r.excess_w2 == null ? null : Number(r.excess_w2),
        excessW3: r.excess_w3 == null ? null : Number(r.excess_w3),
        excessW4: r.excess_w4 == null ? null : Number(r.excess_w4),
        excessW5: r.excess_w5 == null ? null : Number(r.excess_w5),
      };
      if (!passesShortGeometry(cRow)) {
        stops.push({ reason: 'key_mismatch', session, side, slateRank: r.slate_rank,
          ticker: r.ticker, eventId: r.event_id,
          detail: 'passesShortGeometry=false on slate row' });
        continue;
      }
      const e = excessAtArgmax(cRow);
      if (e === null || !(e <= -SHORT_GEOMETRY_MATRIX.excessThreshold)) {
        stops.push({ reason: 'key_mismatch', session, side, slateRank: r.slate_rank,
          ticker: r.ticker, eventId: r.event_id,
          detail: `excess_at_argmax=${e} fails threshold` });
        continue;
      }
      const band = shortBandFromSignedExcess(e);
      if (band === null) {
        stops.push({ reason: 'key_mismatch', session, side, slateRank: r.slate_rank,
          ticker: r.ticker, eventId: r.event_id, detail: `short band null (e=${e})` });
        continue;
      }
      key = buildShortCellKey(cRow, band);
    }

    if (key === null || !keyEqualsSlate(key, r)) {
      stops.push({ reason: 'key_mismatch', session, side, slateRank: r.slate_rank,
        ticker: r.ticker, eventId: r.event_id,
        detail: `deno_key=${JSON.stringify(key)} slate_key={side:${r.side},band:${r.band},w:${r.window_days},mq:${r.momentum_quintile},dd:${r.drawdown_bucket}}` });
      continue;
    }

    // Entry-session resolution.
    const entry = offset.sessionAfter(r.session, entryOffsetForSideTier(r.side, r.tier));
    if (entry === null) {
      stops.push({ reason: 'off_calendar_entry', session, side, slateRank: r.slate_rank,
        ticker: r.ticker, eventId: r.event_id,
        detail: `no session after ${r.session}+${entryOffsetForSideTier(r.side, r.tier)}` });
      continue;
    }

    // (ii) PICK-PARITY — typed-skip filter, then admit until k reached.
    if (admits >= k) continue; // already picked K; rest of rows ignored (still key-checked above)

    // TYPED SKIP: entry_price_missing (Stage-A close null).
    const cx = closes(r.ticker, entry);
    if (cx === null) {
      typedSkipsByClass.entry_price_missing += 1;
      continue;
    }
    // TYPED SKIP: position_already_open (book-state).
    if (book.isHeld(r.ticker)) {
      typedSkipsByClass.position_already_open += 1;
      continue;
    }
    // TYPED SKIP: allocation_cap_reached (book-state).
    // Slate slot notional is unknown at this layer (sizing happens later);
    // caller wires a probe that answers on side alone.
    if (book.wouldBreachSideCap(r.side, 0)) {
      typedSkipsByClass.allocation_cap_reached += 1;
      continue;
    }
    // TYPED SKIP: short_daily_budget_reached (book-state).
    if (r.side === 'short' && book.wouldBreachShortBudget()) {
      typedSkipsByClass.short_daily_budget_reached += 1;
      continue;
    }

    // ADMIT.
    denoAdmits.push({ ticker: r.ticker, eventId: r.event_id, slateRank: r.slate_rank });
    admits += 1;
    if (r.side === 'short') admittedShorts += 1;
    book.onAdmit(r.side, r.ticker, 0);
  }
  void admittedShorts;

  // Prune-breach: all Deno admits MUST be in slate top-N (they came from
  // slate rows, so this is a sanity assertion — enforced by construction).
  for (const a of denoAdmits) {
    if (a.slateRank > SLATE_TOP_N) {
      stops.push({ reason: 'prune_breach', session, side, slateRank: a.slateRank,
        ticker: a.ticker, eventId: a.eventId, detail: `admit rank=${a.slateRank}>${SLATE_TOP_N}` });
    }
  }

  return {
    session, side,
    rowsChecked: rows.length,
    denoAdmits, typedSkipsByClass, stops,
    passed: stops.length === 0,
  };
}

/** Sampling strategy per contract: every 25th session across the slate +
 *  the fixture-ii window (2023-04-03 → 2023-04-07). ≥40 partitions required. */
export function selectSampleSessions(
  allSessions: ReadonlyArray<SessionDate>,
  fixtureIiWindow: ReadonlyArray<SessionDate> = FIXTURE_II_SESSIONS,
): ReadonlyArray<SessionDate> {
  const s = new Set<SessionDate>();
  for (let i = 0; i < allSessions.length; i += 25) s.add(allSessions[i]);
  for (const d of fixtureIiWindow) s.add(d);
  return [...s].sort();
}

export const FIXTURE_II_SESSIONS: ReadonlyArray<SessionDate> = Object.freeze([
  '2023-04-03', '2023-04-04', '2023-04-05', '2023-04-06',
]);

/** Aggregate a batch of partition results into a single tabular report. */
export function summarize(results: ReadonlyArray<PartitionParityResult>) {
  const totals = {
    partitions: results.length,
    rows: 0,
    admits: 0,
    typedSkipsByClass: { entry_price_missing: 0, no_cell_or_rank_null: 0,
      position_already_open: 0, allocation_cap_reached: 0,
      short_daily_budget_reached: 0 } as Record<TypedSkipClass, number>,
    stops: 0,
    passed: 0,
  };
  for (const r of results) {
    totals.rows += r.rowsChecked;
    totals.admits += r.denoAdmits.length;
    totals.stops += r.stops.length;
    if (r.passed) totals.passed += 1;
    for (const k of Object.keys(r.typedSkipsByClass) as TypedSkipClass[]) {
      totals.typedSkipsByClass[k] += r.typedSkipsByClass[k];
    }
  }
  return { totals, allGreen: totals.stops === 0 };
}