// ACT-515 Kernel — Module 6: Exit.
//
// SCOPE: pure per-lot round-trip exit pricing on the STUDIED close basis.
// Injected `SessionCalendar` resolves the tier's ordinal; injected
// `BarSource` supplies the ordinal-day close; haircuts applied per
// `estimator-assumptions.md §2` (5 bps/side long, 15 bps/side short).
// No I/O, no wall-clock, no RNG.
//
// FIVE PINS (per ruling 2026-07-25):
//
//   (a) EXIT RULE = ordinal-from-EVENT per tier — T1 ord-6, T2 ord-10 —
//       counted STRICTLY FORWARD from `eventDate` (event day = ord-0;
//       next session = ord-1). Byte-anchored to the hand-truth fixture
//       header:
//         fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl:1
//           `"exit_convention":"ordinal-10 close (LONG T2,
//             holdingDayOrdinal>=10, session-age.ts:145)"`
//       and to the ACT-574 T+1-open / ordinal-close-exit convention.
//       The kernel's exit day is provably the studied day iff the
//       injected `SessionCalendar` reproduces the fixture's session grid
//       (verified in the LAYER-1 integration gate — see §11).
//
//   (b) EXIT PRICE = ordinal-session CLOSE from `BarSource`. Haircut per
//       `estimator-assumptions.md §2` rows "Long-side haircut" (5 bps/side)
//       and "Short-side haircut" (15 bps/side); `haircutMode:'study'` by
//       default, `haircutMode:'none'` for LAYER-1 fixture parity (the
//       hand-truth fixture's `pnl_rule` is `shares × (exit_close − entry_open)`
//       with no haircut — fixture header verbatim).
//       **Exit-day mark_unavailable interaction (declared, not silent):**
//       if the exit-day bar is absent, exit DEFERS to the next priced
//       session, stamping `stalenessDays >= 1`; bound by injected
//       `maxCarryDays` (default 5, matching Mark); beyond that a typed
//       `exit_price_unavailable` propagates. NEVER a fabricated exit
//       price from the prior mark. Full policy duplicated verbatim in
//       `scripts/act-515/estimator-assumptions.md §10`; a docs-as-code
//       test in `exit_test.ts` asserts the two copies stay in sync
//       (same pattern as Module 3 §7, Module 4 §8, Module 5 §9).
//       Policy summary line (docs-as-code anchor — do not edit without
//       also editing estimator-assumptions.md §10):
//         Exit price = ordinal session close; exit-day null defers to
//         next priced session up to `maxCarryDays`, then typed
//         `exit_price_unavailable`.
//
//   (c) DECLARED ABSTRACTIONS (extension of Module 3 §7):
//       · DEC-083 09:45-exit is NOT modeled here — the kernel prices the
//         STUDIED close basis; the morning-exit delta is priced separately
//         by the R-007 study (adopted 07-23). Wiring DEC-083 into a
//         kernel run requires a new module + charter.
//       · No partial fills — all-or-none per fixture.
//       · No early-exit paths by default — drawdown-stop variants are
//         matrix rows expressed via the optional `exitOverride` hook
//         (default OFF).
//
//   (d) CASH SEAM — `cashRequired(side, slotNotional)` +
//       `settleProceeds(side, shares, exitClosePostHaircut)` expose the
//       cash flows to Module 7 (equity/DD), which enforces buying-power
//       under compounding / 2× leverage. Seam parity property-tested.
//
//   (e) ROUND-TRIP REALIZED P&L in branded integer cents; long/short
//       symmetric; property-tested vs Module 5 sign conventions
//       (mirror positions ⇒ negated realized).
//
// ANTI-PHANTOM: no `Date.now`, no `new Date(`, no `Math.random`. Enforced
// by a lint test in `exit_test.ts`.

import {
  type Money, type Price, type Shares, type SideDb, type Tier,
  type ExitRefusalCode,
  money, price,
} from './types.ts';
import type { SessionDate } from './clock.ts';
import type { BarSource } from './mark.ts';

// -----------------------------------------------------------------------------
// Injected SessionCalendar
// -----------------------------------------------------------------------------

/** Injected trading-session calendar. `sessionAfter(event, n)` returns the
 *  Nth session STRICTLY AFTER `event` (n=1 → next session). Returns `null`
 *  when the calendar's horizon is exhausted — the kernel refuses rather
 *  than clamping (PIN (b)/refusal `exit_calendar_exhausted`). */
export interface SessionCalendar {
  sessionAfter(event: SessionDate, n: number): SessionDate | null;
}

/** Simple array-backed SessionCalendar for tests + matrix wiring. */
export class ArraySessionCalendar implements SessionCalendar {
  private readonly sorted: ReadonlyArray<SessionDate>;
  constructor(sessions: ReadonlyArray<SessionDate>) {
    // Freeze a sorted copy — kernel purity requires ordering discipline.
    const arr = [...sessions].sort();
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1]) throw new Error(`ArraySessionCalendar: duplicate session ${arr[i]}`);
    }
    this.sorted = arr;
  }
  sessionAfter(event: SessionDate, n: number): SessionDate | null {
    if (!Number.isInteger(n) || n < 1) throw new Error(`sessionAfter: n must be a positive integer (got ${n})`);
    // First index with session > event (strict).
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sorted[mid] > event) hi = mid; else lo = mid + 1;
    }
    const idx = lo + (n - 1);
    if (idx >= this.sorted.length) return null;
    return this.sorted[idx];
  }
}

// -----------------------------------------------------------------------------
// Constants — grep-anchored per PIN (a) / PIN (b)
// -----------------------------------------------------------------------------

/** Exit ordinal per tier. Operator PIN (a) 2026-07-25;
 *  fixture-corroborated for T2 at ord-10 (see header cite above). */
export const EXIT_ORDINAL_BY_TIER: Readonly<Record<Tier, number>> = Object.freeze({
  T1: 6,
  T2: 10,
});

/** Per-side haircut in bps applied at BOTH entry and exit under
 *  `haircutMode:'study'`. Anchored to `estimator-assumptions.md §2`. */
export const HAIRCUT_BPS_BY_SIDE: Readonly<Record<SideDb, number>> = Object.freeze({
  long: 5,
  short: 15,
});

// -----------------------------------------------------------------------------
// I/O shapes
// -----------------------------------------------------------------------------

export interface ExitInput {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly tier: Tier;
  readonly shares: Shares;
  readonly entryPrice: Price;      // entry OPEN (T+1 open per convention)
  readonly eventDate: SessionDate; // as_of_event_date (ord-0)
}

export type HaircutMode = 'study' | 'none';

export interface ExitOptions {
  /** Default 'study'. Set 'none' for fixture-parity replays. */
  readonly haircutMode?: HaircutMode;
  /** Max deferral days on exit-day mark_unavailable. Default 5. */
  readonly maxCarryDays?: number;
  /** Optional early-exit override (drawdown-stop matrix rows).
   *  Returning a date replaces the ordinal exit; returning `null` = OFF. */
  readonly exitOverride?: (input: ExitInput) => { exitDate: SessionDate; reason: string } | null;
}

export type ExitResult =
  | {
      readonly ok: true;
      readonly lotId: string;
      readonly ticker: string;
      readonly side: SideDb;
      readonly tier: Tier;
      readonly scheduledExitDate: SessionDate;
      readonly actualExitDate: SessionDate;
      readonly stalenessDays: number;
      readonly exitReason: 'ordinal_scheduled' | 'override';
      readonly exitCloseRaw: Price;
      readonly exitClosePostHaircut: Price;
      readonly entryPricePostHaircut: Price;
      readonly haircutBpsPerSide: number;
      readonly grossRealizedUsd: Money;   // shares × (exit − entry), sided
      readonly realizedUsd: Money;        // post-haircut, sided
    }
  | {
      readonly ok: false;
      readonly lotId: string;
      readonly ticker: string;
      readonly side: SideDb;
      readonly tier: Tier;
      readonly refusal: ExitRefusalCode;
      readonly reason: string;
      readonly scheduledExitDate: SessionDate | null;
    };

// -----------------------------------------------------------------------------
// Integer-cent helpers (PIN (e) — branded math throughout)
// -----------------------------------------------------------------------------

function toCents(usd: number): number {
  const cents = Math.round(usd * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`exit: cent overflow (${usd})`);
  return cents;
}
function fromCents(cents: number): number { return cents / 100; }

const DEFAULT_MAX_CARRY_DAYS = 5;

// -----------------------------------------------------------------------------
// runExit — pure entry point
// -----------------------------------------------------------------------------

export function runExit(
  input: ExitInput,
  calendar: SessionCalendar,
  barSource: BarSource,
  opts: ExitOptions = {},
): ExitResult {
  const haircutMode: HaircutMode = opts.haircutMode ?? 'study';
  const maxCarry = opts.maxCarryDays ?? DEFAULT_MAX_CARRY_DAYS;
  if (!Number.isInteger(maxCarry) || maxCarry < 0) {
    throw new Error(`runExit: maxCarryDays must be a non-negative integer (got ${maxCarry})`);
  }

  // PIN (c) — optional override (default OFF).
  const override = opts.exitOverride?.(input) ?? null;

  // PIN (a) — ordinal from event.
  const ordinal = EXIT_ORDINAL_BY_TIER[input.tier];
  const scheduled = calendar.sessionAfter(input.eventDate, ordinal);
  if (scheduled === null && override === null) {
    return {
      ok: false, lotId: input.lotId, ticker: input.ticker, side: input.side, tier: input.tier,
      refusal: 'exit_calendar_exhausted',
      reason: `calendar has no session at ord-${ordinal} beyond eventDate=${input.eventDate}`,
      scheduledExitDate: null,
    };
  }

  const target: SessionDate = override?.exitDate ?? (scheduled as SessionDate);
  const exitReason: 'ordinal_scheduled' | 'override' = override ? 'override' : 'ordinal_scheduled';

  // PIN (b) — walk forward across missing bars up to maxCarry.
  let cursor: SessionDate | null = target;
  let staleness = 0;
  let closePx: Price | null = null;
  while (cursor !== null && staleness <= maxCarry) {
    const c = barSource.close(input.ticker, cursor);
    if (c !== null) { closePx = c; break; }
    // Advance one session; treat "session 1 after cursor" as the next candidate.
    cursor = calendar.sessionAfter(cursor, 1);
    staleness += 1;
  }
  if (closePx === null) {
    return {
      ok: false, lotId: input.lotId, ticker: input.ticker, side: input.side, tier: input.tier,
      refusal: 'exit_price_unavailable',
      reason: `no close within maxCarryDays=${maxCarry} of scheduled exit ${target}`,
      scheduledExitDate: target,
    };
  }
  const actualExit: SessionDate = cursor as SessionDate;

  // PIN (b) — haircut application. `study` reduces LONG proceeds and
  // raises SHORT cost-to-close; `none` disables both.
  const hBps = haircutMode === 'study' ? HAIRCUT_BPS_BY_SIDE[input.side] : 0;
  const hMul = hBps / 10_000;

  const entryRaw = input.entryPrice as number;
  const exitRaw = closePx as number;

  let entryEffective: number;
  let exitEffective: number;
  if (input.side === 'long') {
    // Buy at entry + slippage; sell at exit − slippage.
    entryEffective = entryRaw * (1 + hMul);
    exitEffective  = exitRaw  * (1 - hMul);
  } else {
    // Short-sell at entry − slippage; cover at exit + slippage.
    entryEffective = entryRaw * (1 - hMul);
    exitEffective  = exitRaw  * (1 + hMul);
  }

  const sharesN = input.shares as number;
  const grossRealizedN = input.side === 'long'
    ? sharesN * (exitRaw - entryRaw)
    : sharesN * (entryRaw - exitRaw);
  const realizedN = input.side === 'long'
    ? sharesN * (exitEffective - entryEffective)
    : sharesN * (entryEffective - exitEffective);

  return {
    ok: true, lotId: input.lotId, ticker: input.ticker, side: input.side, tier: input.tier,
    scheduledExitDate: target,
    actualExitDate: actualExit,
    stalenessDays: staleness,
    exitReason,
    exitCloseRaw: closePx,
    exitClosePostHaircut: price(exitEffective),
    entryPricePostHaircut: price(entryEffective),
    haircutBpsPerSide: hBps,
    grossRealizedUsd: money(fromCents(toCents(grossRealizedN))),
    realizedUsd: money(fromCents(toCents(realizedN))),
  };
}

// -----------------------------------------------------------------------------
// Cash seam (PIN (d))
// -----------------------------------------------------------------------------

/** Cash outlay at entry.
 *  · LONG: `+slotNotional` (cash spent to buy).
 *  · SHORT: `−slotNotional` (short-sale proceeds credited; Reg-T
 *    maintenance is handled at Module 7 per estimator-assumptions §1). */
export function cashRequired(side: SideDb, slotNotional: Money): Money {
  const n = slotNotional as number;
  return money(side === 'long' ? n : -n);
}

/** Cash settlement at exit.
 *  · LONG: `+shares × exit` (sale proceeds).
 *  · SHORT: `−shares × exit` (cover cost). */
export function settleProceeds(
  side: SideDb,
  sharesCount: Shares,
  exitClosePostHaircut: Price,
): Money {
  const gross = (sharesCount as number) * (exitClosePostHaircut as number);
  return money(fromCents(toCents(side === 'long' ? gross : -gross)));
}