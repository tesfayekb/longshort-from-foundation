// ACT-515 Kernel — Module 5: Mark.
//
// SCOPE: pure per-day mark-to-close for the open book. Injected `BarSource`
// supplies each (ticker, sessionDate) close as `Price | null` — no fetch,
// no wall-clock, no fabrication. Missing bars follow the DECLARED
// carry-forward policy (see estimator-assumptions.md §9); beyond
// `maxCarryDays` the lot-day propagates typed `mark_unavailable`.
//
// FIVE PINS (per ruling 2026-07-25):
//
//   (a) BAR SOURCE INJECTED — the `BarSource` interface below returns
//       `Price | null`; the kernel never fetches. The matrix runner will
//       back it with `public.overshoot_daily_bars`, but the kernel does
//       not know that.
//
//   (b) SIGN CONVENTIONS anchored to the LIVE snapshot writer:
//         long  unrealized = (mark − entry) × shares
//         short unrealized = (entry − mark) × shares
//         market_value_long  = mark × shares      (POSITIVE)
//         market_value_short = −(mark × shares)   (NEGATIVE)
//         gross_exposure     = long_mv + |short_mv|
//       Grep-anchor (verbatim, one dialect between kernel and prod):
//         supabase/functions/overshoot-equity-snapshot/index.ts:83-89
//         (`if (mv >= 0) longMv += mv; else shortMv += mv;`) — i.e.
//         `short_market_value` in `overshoot_equity_snapshots` is the
//         signed NEGATIVE sum of short-lot market values.
//
//   (c) MISSING-BAR POLICY, DECLARED not silent:
//       Carry-forward-last-close IS allowed but every carried mark stamps
//       `stalenessDays >= 1` on the lot-day; `maxCarryDays` is INJECTED
//       (default 5). Beyond it, `mark_unavailable` (typed, see
//       `MarkRefusalCode` in `types.ts`) propagates and the lot-day is
//       flagged — never invisibly priced. Full policy is duplicated
//       verbatim in `scripts/act-515/estimator-assumptions.md §9`; a
//       docs-as-code test in `mark_test.ts` asserts the two copies stay
//       in sync (same pattern as Module 3 §7 / Module 4 §8).
//       Policy summary line (docs-as-code anchor — do not edit without
//       also editing estimator-assumptions.md §9):
//         Carry-forward-last-close is allowed up to `maxCarryDays`
//         (default 5); beyond that the lot-day propagates typed
//         `mark_unavailable`.
//
//   (d) OUTPUT SHAPE — `markBook(lots, sessionDate, barSource, opts?)`
//       returns per-lot marks (fresh / carry / unavailable) + book
//       aggregates {longMv, shortMv, grossExposureUsd, netExposureUsd,
//       unrealizedTotalUsd, pricedLots, unavailableLots} + a
//       `nextPriorMarks` map ready to be threaded into the following
//       session's call. Pure; branded math throughout.
//
//   (e) TESTS — long/short sign symmetry (mirror positions → negated
//       unrealized); carry-forward staleness ladder (0→1..5→refuse at 6);
//       entry-day null bar yields `mark_unavailable`, not entry echo;
//       aggregates foot to per-lot sums to the cent.
//
// ANTI-PHANTOM: no `Date.now`, no `new Date(`, no `Math.random`. Enforced
// by a lint test in `mark_test.ts` (rule (d) discipline).

import {
  type Money, type Price, type Shares, type SideDb,
  type MarkRefusalCode,
  money, price,
} from './types.ts';
import type { SessionDate } from './clock.ts';

// -----------------------------------------------------------------------------
// Injected BarSource
// -----------------------------------------------------------------------------

/** Injected daily-close source. Returns `null` when the bar is absent for
 *  the requested (ticker, sessionDate) — never a fabricated zero. */
export interface BarSource {
  close(ticker: string, sessionDate: SessionDate): Price | null;
}

// -----------------------------------------------------------------------------
// I/O shapes
// -----------------------------------------------------------------------------

/** An open lot presented to the mark module. `lotId` is the stable key
 *  across sessions (used to thread carry state); multiple lots per
 *  ticker are permitted (INC-138 leaves this open at the kernel layer). */
export interface OpenLot {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly shares: Shares;
  readonly entryPrice: Price;
}

/** Prior-session carry state for one lot, threaded from the previous
 *  `markBook` call's `nextPriorMarks`. */
export interface PriorMark {
  readonly price: Price;
  readonly asOf: SessionDate;
  readonly stalenessDays: number;   // stalenessDays of the LAST recorded mark
}

export interface MarkOptions {
  /** Max consecutive carry-forward days before a lot-day is refused.
   *  Default 5 (estimator-assumptions.md §9). */
  readonly maxCarryDays?: number;
  /** Per-lot prior state. Absent lots have no carry history. */
  readonly priorMarks?: ReadonlyMap<string, PriorMark>;
}

export type LotMark =
  | {
      readonly ok: true;
      readonly lotId: string;
      readonly ticker: string;
      readonly side: SideDb;
      readonly mark: Price;
      readonly source: 'fresh' | 'carry';
      readonly stalenessDays: number;     // 0 when source='fresh'
      readonly unrealizedUsd: Money;
      readonly marketValueUsd: Money;     // signed: long positive, short negative
    }
  | {
      readonly ok: false;
      readonly lotId: string;
      readonly ticker: string;
      readonly side: SideDb;
      readonly refusal: MarkRefusalCode;
      readonly reason: string;
      readonly stalenessDays: number;     // last known staleness (0 if never priced)
    };

export interface BookAggregate {
  readonly longMv: Money;                 // POSITIVE sum of long market values
  readonly shortMv: Money;                // NEGATIVE sum of short market values
  readonly grossExposureUsd: Money;       // longMv + |shortMv|
  readonly netExposureUsd: Money;         // longMv + shortMv (signed)
  readonly unrealizedTotalUsd: Money;
  readonly pricedLots: number;
  readonly staleLots: number;             // priced via carry-forward
  readonly unavailableLots: number;
}

export interface MarkBookResult {
  readonly sessionDate: SessionDate;
  readonly perLot: ReadonlyArray<LotMark>;
  readonly book: BookAggregate;
  /** Feed into the next session's `MarkOptions.priorMarks`. */
  readonly nextPriorMarks: ReadonlyMap<string, PriorMark>;
}

// -----------------------------------------------------------------------------
// Integer-cent helpers (PIN (d) — branded math throughout)
// -----------------------------------------------------------------------------

function toCents(usd: number): number {
  const cents = Math.round(usd * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`mark: cent overflow (${usd})`);
  }
  return cents;
}
function fromCents(cents: number): number {
  return cents / 100;
}

const DEFAULT_MAX_CARRY_DAYS = 5;

// -----------------------------------------------------------------------------
// markBook — pure entry point
// -----------------------------------------------------------------------------

export function markBook(
  lots: ReadonlyArray<OpenLot>,
  sessionDate: SessionDate,
  barSource: BarSource,
  opts: MarkOptions = {},
): MarkBookResult {
  const maxCarry = opts.maxCarryDays ?? DEFAULT_MAX_CARRY_DAYS;
  if (!Number.isInteger(maxCarry) || maxCarry < 0) {
    throw new Error(`markBook: maxCarryDays must be a non-negative integer (got ${maxCarry})`);
  }
  const prior = opts.priorMarks ?? new Map<string, PriorMark>();

  const perLot: LotMark[] = [];
  const nextPrior = new Map<string, PriorMark>();

  let longCents = 0;
  let shortCents = 0;        // NEGATIVE-accumulator
  let unrealCents = 0;
  let pricedLots = 0;
  let staleLots = 0;
  let unavailableLots = 0;

  for (const lot of lots) {
    const fresh = barSource.close(lot.ticker, sessionDate);
    let markPx: Price | null = null;
    let source: 'fresh' | 'carry' = 'fresh';
    let staleness = 0;

    if (fresh !== null) {
      markPx = fresh;
      source = 'fresh';
      staleness = 0;
    } else {
      const p = prior.get(lot.lotId);
      if (p !== undefined) {
        const nextStale = p.stalenessDays + 1;
        if (nextStale <= maxCarry) {
          markPx = p.price;
          source = 'carry';
          staleness = nextStale;
        }
      }
    }

    if (markPx === null) {
      // PIN (c) — typed absence; NEVER an entry-price echo.
      const lastStale = prior.get(lot.lotId)?.stalenessDays ?? 0;
      perLot.push({
        ok: false,
        lotId: lot.lotId, ticker: lot.ticker, side: lot.side,
        refusal: 'mark_unavailable',
        reason: prior.has(lot.lotId)
          ? `no fresh bar and carry-forward would exceed maxCarryDays=${maxCarry}`
          : `no fresh bar and no prior mark to carry forward`,
        stalenessDays: lastStale,
      });
      unavailableLots += 1;
      // Do NOT thread this lot into nextPrior — a refused day breaks the chain.
      continue;
    }

    // PIN (b) — sign conventions.
    const markN = markPx as number;
    const entryN = lot.entryPrice as number;
    const sharesN = lot.shares as number;

    const unrealizedN = lot.side === 'long'
      ? (markN - entryN) * sharesN
      : (entryN - markN) * sharesN;
    const grossMvN = markN * sharesN;
    const signedMvN = lot.side === 'long' ? grossMvN : -grossMvN;

    const unrealizedCents = toCents(unrealizedN);
    const mvCents = toCents(signedMvN);

    unrealCents += unrealizedCents;
    if (lot.side === 'long') longCents += mvCents;
    else shortCents += mvCents;   // mvCents already negative

    pricedLots += 1;
    if (source === 'carry') staleLots += 1;

    perLot.push({
      ok: true,
      lotId: lot.lotId, ticker: lot.ticker, side: lot.side,
      mark: markPx,
      source,
      stalenessDays: staleness,
      unrealizedUsd: money(fromCents(unrealizedCents)),
      marketValueUsd: money(fromCents(mvCents)),
    });

    nextPrior.set(lot.lotId, {
      price: markPx,
      asOf: sessionDate,
      stalenessDays: staleness,
    });
  }

  const longMv = money(fromCents(longCents));
  const shortMv = money(fromCents(shortCents));
  const grossExposureUsd = money(fromCents(longCents + Math.abs(shortCents)));
  const netExposureUsd = money(fromCents(longCents + shortCents));
  const unrealizedTotalUsd = money(fromCents(unrealCents));

  return {
    sessionDate,
    perLot,
    book: {
      longMv, shortMv, grossExposureUsd, netExposureUsd, unrealizedTotalUsd,
      pricedLots, staleLots, unavailableLots,
    },
    nextPriorMarks: nextPrior,
  };
}

// -----------------------------------------------------------------------------
// Trivial in-memory BarSource for test/matrix wiring convenience.
// The kernel exposes this as a helper only — real runners inject their own.
// -----------------------------------------------------------------------------

export class MapBarSource implements BarSource {
  constructor(private readonly bars: ReadonlyMap<string, Price>) {}
  static key(ticker: string, sessionDate: SessionDate): string {
    return `${ticker}|${sessionDate}`;
  }
  close(ticker: string, sessionDate: SessionDate): Price | null {
    return this.bars.get(MapBarSource.key(ticker, sessionDate)) ?? null;
  }
}

/** Convenience builder for tests. */
export function makeBars(entries: ReadonlyArray<[string, SessionDate, number]>): MapBarSource {
  const m = new Map<string, Price>();
  for (const [t, d, px] of entries) m.set(MapBarSource.key(t, d), price(px));
  return new MapBarSource(m);
}