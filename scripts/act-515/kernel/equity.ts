// ACT-515 Kernel — Module 7: Equity / Drawdown.
//
// SCOPE: pure per-session equity path over an evolving book. Consumes
// Module 5's `markBook` (threaded via `nextPriorMarks`) and Module 6's
// `cashRequired` / `settleProceeds` cash seams. Emits `EquityRow[]` +
// `EquitySummary` matching the frozen columns of
// `scripts/act-515/verdict-table-template.md` and `config-matrix.md §3`.
// No I/O, no wall-clock, no RNG.
//
// SIX PINS (per ruling 2026-07-25):
//
//   (a) EQUITY DEFINITION per estimator-assumptions.md §3 (cited verbatim
//       below):
//         equity(t) = cash(t) + Σ open-lot marks(t)
//       where "Σ open-lot marks" is the SIGNED sum `longMv + shortMv`
//       (Module 5 convention — long positive, short NEGATIVE, i.e. the
//       short liability nets against the short-sale proceeds already
//       booked into `cash`). Haircuts are already inside realized/entry
//       math at the Module-6 cash seam (`settleProceeds` uses the
//       post-haircut close, `cashRequired` uses the raw slot notional);
//       the EQUITY module NEVER re-applies a haircut — a property test
//       verifies no double-count vs the study-haircut path.
//
//       Compounding convention (estimator-assumptions.md §3 verbatim):
//         "the equity path IS compounded — realized gains/losses feed the
//          next day's equity, and (for `-comp` sizing variants) feed the
//          next day's slot size. For `-const` sizing variants, slot
//          notional stays flat at $2,500 / $5,000 × 1.0 / × 2.0 regardless
//          of equity path."
//       This module does NOT re-size lots — sizing is Module 4's
//       responsibility and is applied at entry time by the runner. The
//       equity path merely records the resulting cash-and-mark evolution.
//
//   (b) MARGIN CARRY per estimator-assumptions.md §1:
//         50 bps/month flat on the DEBIT balance (cash < 0), applied
//         per-session as:
//           carry(t) = max(0, -cash_end_of_day) × (0.0050 × 12 / 252)
//         i.e. 60 bps/yr / 252 sessions ≈ 2.381 bps/session.
//       1×-const paths MUST accrue ZERO carry (test), because their
//       starting equity ($100k) covers 40 slots × $2.5k = $100k of
//       aspirational notional — cash bottoms out AT zero, never below.
//       The formula is duplicated verbatim in estimator-assumptions.md
//       §12; a docs-as-code test in `equity_test.ts` asserts sync.
//       Policy summary line (docs-as-code anchor — do not edit without
//       also editing estimator-assumptions.md §12):
//         carry(t) = max(0, -cash_end_of_day) × (0.0050 × 12 / 252).
//
//   (c) DRAWDOWN DEFINITION per estimator-assumptions.md §3:
//         · Running peak = max of daily equity series over the window.
//         · dd(t) = (peak − equity(t)) / peak; report as a POSITIVE pct.
//         · maxDD reported with (peakDate → troughDate) span and the
//           first `recoveryDate` where equity ≥ prior peak; if none by
//           the last session, recoveryDate = 'UNRECOVERED'.
//         · Worst calendar year return alongside.
//       Column NAMES are byte-matched to `verdict-table-template.md` /
//       `config-matrix.md §3` — see `MATRIX_COLUMN_IDS` below. A
//       docs-as-code test asserts every ID appears verbatim in
//       `config-matrix.md`.
//
//   (d) OUTPUT — `runEquityPath(...)` returns `EquityRow[]` (one per
//       session) + a summary block matching the frozen matrix columns.
//
//   (e) LEDGER FOOT PROPERTY (no-leak invariant), per-session:
//         equity(t) − equity(t−1) = realizedToday + Δunrealized − carryToday
//       Asserted to the cent across a multi-lot synthetic path in
//       `equity_test.ts`. Derivation (docs-as-code): closing a lot at
//       p_ex changes cash by ±shares·p_ex and removes ±shares·p_prev of
//       MV; the difference decomposes as `realized(=shares·(p_ex−entry))
//       + −unrealized_prev(=shares·(p_prev−entry))` on the long side and
//       mirror on the short — Δequity_from_close = shares·(p_ex − p_prev)
//       exactly. Open lots contribute Δunrealized = ±shares·(p_t − p_prev).
//       New entries contribute both a cash outflow and matching MV
//       (net-zero except for the day's mark movement, which is captured
//       in Δunrealized). Carry is a pure subtraction.
//
//   (f) THREADING CONTRACT — one runner-facing function
//       `runEquityPath(sessions, plan, barSource, opts)`. `plan` is the
//       injected schedule (entries + scheduled exits per session, with
//       exit prices pre-resolved by Module 6). The runner is responsible
//       for chaining Modules 3/4/6 into `plan`; this module owns only the
//       equity walk. Module 5's `nextPriorMarks` is threaded internally
//       from one session to the next.
//
// ANTI-PHANTOM: no wall-clock, no date-constructor, no RNG (see anti-phantom rule). Enforced
// by a lint test in `equity_test.ts`.

import {
  type Money, type Price, type Shares, type SideDb,
  type EquityRefusalCode,
  money,
} from './types.ts';
import type { SessionDate } from './clock.ts';
import {
  markBook, type BarSource, type OpenLot, type PriorMark,
} from './mark.ts';
import { cashRequired, settleProceeds } from './exit.ts';

// -----------------------------------------------------------------------------
// Constants — PIN (b) carry formula
// -----------------------------------------------------------------------------

/** 50 bps/month flat on debit balance (estimator §1). */
export const MARGIN_MONTHLY_RATE = 0.0050;
/** Sessions per year — standard trading-day count. */
export const SESSIONS_PER_YEAR = 252;
/** Per-session carry factor: (0.0050 × 12) / 252. */
export const DAILY_CARRY_RATE = (MARGIN_MONTHLY_RATE * 12) / SESSIONS_PER_YEAR;

// -----------------------------------------------------------------------------
// Matrix column IDs — PIN (c) docs-as-code anchor
// -----------------------------------------------------------------------------

/** Column IDs byte-matched to `scripts/act-515/config-matrix.md §3` /
 *  `verdict-table-template.md §1`. Docs-as-code sync test in
 *  `equity_test.ts` asserts every entry appears verbatim in config-matrix.md. */
export const MATRIX_COLUMN_IDS: ReadonlyArray<string> = Object.freeze([
  'max-p2t-dd',
  'dd-dates',
  'dd-duration-days',
  'dd-recovery-days',
  'cagr',
  'margin-interest',
]);

// -----------------------------------------------------------------------------
// I/O shapes
// -----------------------------------------------------------------------------

export interface EntryEvent {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly shares: Shares;
  readonly entryPrice: Price;      // post-haircut entry (Module 6 pre-computes)
  readonly slotNotional: Money;    // for cashRequired
}

export interface ExitEventScheduled {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly shares: Shares;
  readonly entryPrice: Price;
  readonly exitClosePostHaircut: Price;
  readonly realizedUsd: Money;     // from Module 6 (used for foot property)
}

export interface SessionPlan {
  readonly sessionDate: SessionDate;
  readonly entries: ReadonlyArray<EntryEvent>;
  readonly exits: ReadonlyArray<ExitEventScheduled>;
}

export interface EquityPathOptions {
  readonly startingEquityUsd: Money;
  /** Max carry-forward for the mark module (§9). Default 5. */
  readonly maxCarryDays?: number;
}

export interface EquityRow {
  readonly sessionDate: SessionDate;
  readonly cashUsd: Money;
  readonly longMvUsd: Money;             // POSITIVE per Module 5
  readonly shortMvUsd: Money;            // NEGATIVE per Module 5
  readonly equityUsd: Money;             // cash + longMv + shortMv
  readonly unrealizedTotalUsd: Money;
  readonly realizedTodayUsd: Money;
  readonly carryTodayUsd: Money;
  readonly openLots: number;
  readonly stalenessFlags: {
    readonly staleLots: number;
    readonly unavailableLots: number;
  };
}

export interface EquityDrawdown {
  readonly maxDdPct: number;             // POSITIVE fraction (0.10 = 10%)
  readonly peakDate: SessionDate | null;
  readonly troughDate: SessionDate | null;
  readonly recoveryDate: SessionDate | 'UNRECOVERED' | null;
  readonly durationDays: number;         // sessions peak→trough
  readonly recoveryDays: number | 'N/A-UNRECOVERED' | null;
}

export interface EquitySummary {
  readonly startingEquityUsd: Money;
  readonly endingEquityUsd: Money;
  readonly totalReturnPct: number;
  readonly worstCalendarYear: number | null;
  readonly worstCalendarYearReturnPct: number | null;
  readonly drawdown: EquityDrawdown;
  readonly cumulativeCarryUsd: Money;
}

export type EquityPathResult =
  | {
      readonly ok: true;
      readonly rows: ReadonlyArray<EquityRow>;
      readonly summary: EquitySummary;
    }
  | {
      readonly ok: false;
      readonly refusal: EquityRefusalCode;
      readonly reason: string;
      readonly sessionDate: SessionDate;
      readonly rowsBeforeFailure: ReadonlyArray<EquityRow>;
    };

// -----------------------------------------------------------------------------
// Integer-cent helpers (PIN (a) — branded math throughout)
// -----------------------------------------------------------------------------

function toCents(usd: number): number {
  const cents = Math.round(usd * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`equity: cent overflow (${usd})`);
  return cents;
}
function fromCents(cents: number): number { return cents / 100; }

// -----------------------------------------------------------------------------
// runEquityPath — pure entry point (PIN (f))
// -----------------------------------------------------------------------------

export function runEquityPath(
  sessions: ReadonlyArray<SessionDate>,
  plan: ReadonlyArray<SessionPlan>,
  barSource: BarSource,
  opts: EquityPathOptions,
): EquityPathResult {
  if (sessions.length === 0) throw new Error('runEquityPath: sessions is empty');
  // Validate sessions strictly ascending + no dupes.
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i] <= sessions[i - 1]) {
      throw new Error(`runEquityPath: sessions not strictly ascending at [${i}] (${sessions[i - 1]} → ${sessions[i]})`);
    }
  }
  // Index plan by session for O(1) lookup; refuse unknown sessions.
  const sessionSet = new Set<string>(sessions);
  const planBySession = new Map<SessionDate, SessionPlan>();
  for (const sp of plan) {
    if (!sessionSet.has(sp.sessionDate)) {
      throw new Error(`runEquityPath: plan session ${sp.sessionDate} not in sessions list`);
    }
    if (planBySession.has(sp.sessionDate)) {
      throw new Error(`runEquityPath: duplicate plan for session ${sp.sessionDate}`);
    }
    planBySession.set(sp.sessionDate, sp);
  }

  const maxCarry = opts.maxCarryDays ?? 5;

  // State.
  let cashCents = toCents(opts.startingEquityUsd as number);
  let priorMarks = new Map<string, PriorMark>();
  let openLots = new Map<string, OpenLot>();
  let cumCarryCents = 0;

  const rows: EquityRow[] = [];
  const equitySeries: number[] = [];   // for DD walk (in cents)

  for (const sessionDate of sessions) {
    const sp = planBySession.get(sessionDate);
    const entries = sp?.entries ?? [];
    const exits = sp?.exits ?? [];

    let realizedTodayCents = 0;

    // 1. Process EXITS scheduled today. Settle cash, remove from book.
    for (const ex of exits) {
      if (!openLots.has(ex.lotId)) {
        throw new Error(`runEquityPath: exit for unknown lot ${ex.lotId} on ${sessionDate}`);
      }
      const proceeds = settleProceeds(ex.side, ex.shares, ex.exitClosePostHaircut) as number;
      cashCents += toCents(proceeds);
      realizedTodayCents += toCents(ex.realizedUsd as number);
      openLots.delete(ex.lotId);
      priorMarks.delete(ex.lotId);
    }

    // 2. Process ENTRIES today. Cash outflow (long) or inflow (short).
    for (const en of entries) {
      if (openLots.has(en.lotId)) {
        throw new Error(`runEquityPath: duplicate lotId ${en.lotId}`);
      }
      const cashReq = cashRequired(en.side, en.slotNotional) as number;
      cashCents -= toCents(cashReq);   // long: -slot; short: +slot
      openLots.set(en.lotId, {
        lotId: en.lotId, ticker: en.ticker, side: en.side,
        shares: en.shares, entryPrice: en.entryPrice,
      });
    }

    // 3. Mark surviving book at today's close.
    const marked = markBook(
      [...openLots.values()], sessionDate, barSource,
      { maxCarryDays: maxCarry, priorMarks },
    );

    if (marked.book.unavailableLots > 0) {
      // PIN (a) — never fictionalize equity over a mark gap.
      return {
        ok: false,
        refusal: 'mark_gap_in_open_book',
        reason: `${marked.book.unavailableLots} open lot(s) had mark_unavailable on ${sessionDate}`,
        sessionDate,
        rowsBeforeFailure: rows,
      };
    }

    priorMarks = new Map(marked.nextPriorMarks);

    // 4. Carry accrual on end-of-day DEBIT balance (cash < 0).
    let carryCents = 0;
    if (cashCents < 0) {
      const debit = -cashCents / 100;
      carryCents = toCents(debit * DAILY_CARRY_RATE);
      cashCents -= carryCents;
    }
    cumCarryCents += carryCents;

    const longCents = toCents(marked.book.longMv as number);
    const shortCents = toCents(marked.book.shortMv as number);
    const equityCents = cashCents + longCents + shortCents;

    rows.push({
      sessionDate,
      cashUsd: money(fromCents(cashCents)),
      longMvUsd: money(fromCents(longCents)),
      shortMvUsd: money(fromCents(shortCents)),
      equityUsd: money(fromCents(equityCents)),
      unrealizedTotalUsd: marked.book.unrealizedTotalUsd,
      realizedTodayUsd: money(fromCents(realizedTodayCents)),
      carryTodayUsd: money(fromCents(carryCents)),
      openLots: openLots.size,
      stalenessFlags: {
        staleLots: marked.book.staleLots,
        unavailableLots: marked.book.unavailableLots,
      },
    });
    equitySeries.push(equityCents);
  }

  const summary = summarize(rows, equitySeries, opts.startingEquityUsd, cumCarryCents);
  return { ok: true, rows, summary };
}

// -----------------------------------------------------------------------------
// Summary computation — PIN (c) DD + worst-calendar-year
// -----------------------------------------------------------------------------

function summarize(
  rows: ReadonlyArray<EquityRow>,
  equitySeriesCents: ReadonlyArray<number>,
  startingEquityUsd: Money,
  cumCarryCents: number,
): EquitySummary {
  const n = equitySeriesCents.length;
  const startCents = toCents(startingEquityUsd as number);
  const endCents = equitySeriesCents[n - 1];

  // Drawdown walk (peak→trough→recovery).
  let peakCents = startCents;
  let peakIdx = -1;                 // -1 = "starting equity" (pre-first-session)
  let maxDd = 0;
  let ddPeakIdx = -1;
  let ddTroughIdx = -1;
  let curPeakIdx = -1;
  let curPeakCents = startCents;
  let curTroughCents = startCents;
  let curTroughIdx = -1;

  for (let i = 0; i < n; i++) {
    const e = equitySeriesCents[i];
    if (e >= curPeakCents) {
      curPeakCents = e;
      curPeakIdx = i;
      curTroughCents = e;
      curTroughIdx = i;
    } else if (e < curTroughCents) {
      curTroughCents = e;
      curTroughIdx = i;
      const dd = (curPeakCents - e) / curPeakCents;
      if (dd > maxDd) {
        maxDd = dd;
        ddPeakIdx = curPeakIdx;
        ddTroughIdx = curTroughIdx;
      }
    }
    if (e > peakCents) { peakCents = e; peakIdx = i; }
  }

  let peakDate: SessionDate | null = null;
  let troughDate: SessionDate | null = null;
  let recoveryDate: SessionDate | 'UNRECOVERED' | null = null;
  let durationDays = 0;
  let recoveryDays: number | 'N/A-UNRECOVERED' | null = null;

  if (maxDd > 0 && ddTroughIdx >= 0) {
    troughDate = rows[ddTroughIdx].sessionDate;
    peakDate = ddPeakIdx >= 0 ? rows[ddPeakIdx].sessionDate : null;
    durationDays = ddPeakIdx >= 0 ? ddTroughIdx - ddPeakIdx : ddTroughIdx + 1;
    const priorPeakCents = ddPeakIdx >= 0 ? equitySeriesCents[ddPeakIdx] : startCents;
    let recIdx = -1;
    for (let i = ddTroughIdx + 1; i < n; i++) {
      if (equitySeriesCents[i] >= priorPeakCents) { recIdx = i; break; }
    }
    if (recIdx === -1) {
      recoveryDate = 'UNRECOVERED';
      recoveryDays = 'N/A-UNRECOVERED';
    } else {
      recoveryDate = rows[recIdx].sessionDate;
      recoveryDays = recIdx - ddTroughIdx;
    }
  }

  // Worst calendar year.
  const yearBuckets = new Map<number, { first: number; last: number }>();
  for (let i = 0; i < n; i++) {
    const yr = Number(rows[i].sessionDate.slice(0, 4));
    const b = yearBuckets.get(yr);
    if (b === undefined) yearBuckets.set(yr, { first: i, last: i });
    else b.last = i;
  }
  let worstYear: number | null = null;
  let worstYearRet: number | null = null;
  for (const [yr, b] of yearBuckets.entries()) {
    const openCents = b.first === 0 ? startCents : equitySeriesCents[b.first - 1];
    const closeCents = equitySeriesCents[b.last];
    const ret = (closeCents - openCents) / openCents;
    if (worstYearRet === null || ret < worstYearRet) {
      worstYearRet = ret;
      worstYear = yr;
    }
  }

  return {
    startingEquityUsd,
    endingEquityUsd: money(fromCents(endCents)),
    totalReturnPct: (endCents - startCents) / startCents,
    worstCalendarYear: worstYear,
    worstCalendarYearReturnPct: worstYearRet,
    drawdown: {
      maxDdPct: maxDd,
      peakDate, troughDate, recoveryDate,
      durationDays, recoveryDays,
    },
    cumulativeCarryUsd: money(fromCents(cumCarryCents)),
  };
}