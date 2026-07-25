// ACT-515 Kernel — Composed Runner.
//
// SCOPE: chains Modules 5/6/7 into a single pipeline entry point:
//   runPipeline(plan, barSource, opts) → { equityRows, lotRoundTrips }
//
// Landed 2026-07-25 per operator GATE RULING (Option A, TURN-1).
//
// The runner takes a pre-resolved lot schedule (shares, entry price, tier,
// event date already decided upstream by Modules 3/4 OR by a fixture
// reconstructor). It does NOT re-run admit/size — those modules are
// validated in their own gates. This keeps the LAYER-1 gate honest:
// the byte-exact test proves that MARK + EXIT + EQUITY compose without
// leakage against reality.
//
// PIN — FOUR-FIELD ROW PROJECTION CONTRACT (fixture-i gate):
//   Each `LotRoundTrip` exposes exactly four INTEGER-CENT fields plus
//   provenance:
//     · sharesCount           (integer)
//     · entryCashOutCents     (long: +shares×entry; short: −shares×entry)
//     · exitCashInCents       (long: +shares×exit_post_haircut;
//                              short: −shares×exit_post_haircut)
//     · realizedCents         (cents; sided; ≡ Module 6's realized)
//   Plus a terminal identity asserted at gate-time:
//     ending_equity_cents == starting_equity_cents + Σ realizedCents
//   (see `scripts/act-515/tests/gate-fixture-i_test.ts`).
//
// ANTI-PHANTOM: no wall-clock, no date-constructor, no RNG. Enforced by
// the runner's lint test (`runner_test.ts` — landed at fixture-ii gate).

import {
  type Money, type Price, type Shares, type SideDb, type Tier,
  money, price, shares as sharesBrand,
} from './types.ts';
import type { SessionDate } from './clock.ts';
import type { BarSource } from './mark.ts';
import {
  runExit, cashRequired, settleProceeds,
  type SessionCalendar, type ExitResult, type HaircutMode,
} from './exit.ts';
import {
  runEquityPath,
  type SessionPlan, type EntryEvent, type ExitEventScheduled,
  type EquityRow, type EquityPathResult,
} from './equity.ts';

// -----------------------------------------------------------------------------
// Plan shape — pre-resolved lot schedule
// -----------------------------------------------------------------------------

export interface PipelineLot {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly tier: Tier;
  readonly shares: Shares;
  readonly entryPrice: Price;          // T+1 open per convention
  readonly slotNotionalUsd: Money;     // for cashRequired
  readonly entryDate: SessionDate;
  readonly eventDate: SessionDate;     // for ordinal exit resolution
}

export interface PipelinePlan {
  readonly startingEquityUsd: Money;
  readonly sessions: ReadonlyArray<SessionDate>;
  readonly calendar: SessionCalendar;
  readonly lots: ReadonlyArray<PipelineLot>;
}

export interface PipelineOptions {
  /** 'none' for fixture-i (hand rows without haircut); 'study' for live matrix. */
  readonly haircutMode?: HaircutMode;
  /** Passthrough to Module 5/6 carry policy. Default 5. */
  readonly maxCarryDays?: number;
}

// -----------------------------------------------------------------------------
// Round-trip projection — the fixture-i FOUR-FIELD contract
// -----------------------------------------------------------------------------

export interface LotRoundTrip {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly tier: Tier;
  readonly sharesCount: number;         // integer, brand-stripped for equality
  readonly entryCashOutCents: number;   // signed
  readonly exitCashInCents: number;     // signed
  readonly realizedCents: number;       // signed
  readonly entryDate: SessionDate;
  readonly exitDate: SessionDate;
  readonly entryPriceRaw: number;
  readonly exitClosePostHaircut: number;
  readonly exitCloseRaw: number;
  readonly haircutBpsPerSide: number;
  readonly stalenessDays: number;
}

export type PipelineResult =
  | {
      readonly ok: true;
      readonly equityRows: ReadonlyArray<EquityRow>;
      readonly lotRoundTrips: ReadonlyArray<LotRoundTrip>;
    }
  | {
      readonly ok: false;
      readonly stage: 'exit' | 'equity';
      readonly reason: string;
      readonly lotId?: string;
      readonly equityRefusal?: string;
      readonly sessionDate?: SessionDate;
    };

// -----------------------------------------------------------------------------
// Integer-cent helper (mirrors Modules 4/5/6/7)
// -----------------------------------------------------------------------------

function toCents(usd: number): number {
  const c = Math.round(usd * 100);
  if (!Number.isSafeInteger(c)) throw new Error(`runner: cent overflow (${usd})`);
  return c;
}

// -----------------------------------------------------------------------------
// runPipeline — composed entry point
// -----------------------------------------------------------------------------

export function runPipeline(
  plan: PipelinePlan,
  barSource: BarSource,
  opts: PipelineOptions = {},
): PipelineResult {
  const haircutMode: HaircutMode = opts.haircutMode ?? 'study';
  const maxCarry = opts.maxCarryDays ?? 5;

  // 1. Resolve each lot's exit via Module 6.
  const exits: Array<{ lot: PipelineLot; exit: Extract<ExitResult, { ok: true }> }> = [];
  for (const lot of plan.lots) {
    const res = runExit(
      {
        lotId: lot.lotId, ticker: lot.ticker, side: lot.side, tier: lot.tier,
        shares: lot.shares, entryPrice: lot.entryPrice, eventDate: lot.eventDate,
      },
      plan.calendar,
      barSource,
      { haircutMode, maxCarryDays: maxCarry },
    );
    if (!res.ok) {
      return {
        ok: false, stage: 'exit', lotId: lot.lotId,
        reason: `runExit(${lot.lotId}/${lot.ticker}): ${res.refusal} — ${res.reason}`,
      };
    }
    exits.push({ lot, exit: res });
  }

  // 2. Build SessionPlan[] — entries grouped by entryDate, exits by actualExitDate.
  const entriesByDate = new Map<SessionDate, EntryEvent[]>();
  const exitsByDate = new Map<SessionDate, ExitEventScheduled[]>();

  for (const { lot, exit } of exits) {
    const entry: EntryEvent = {
      lotId: lot.lotId, ticker: lot.ticker, side: lot.side,
      shares: lot.shares,
      // Entry price used for cost basis in Module 7 is the RAW entry price
      // when haircutMode='none'; when 'study', Module 6 applied a haircut
      // and we use its post-haircut entry so cash flows reconcile.
      entryPrice: haircutMode === 'none' ? lot.entryPrice : exit.entryPricePostHaircut,
      slotNotionalUsd: lot.slotNotionalUsd,
    };
    const ex: ExitEventScheduled = {
      lotId: lot.lotId, ticker: lot.ticker, side: lot.side,
      shares: lot.shares,
      entryPrice: entry.entryPrice,
      exitClosePostHaircut: exit.exitClosePostHaircut,
      realizedUsd: haircutMode === 'none' ? exit.grossRealizedUsd : exit.realizedUsd,
    };
    if (!entriesByDate.has(lot.entryDate)) entriesByDate.set(lot.entryDate, []);
    entriesByDate.get(lot.entryDate)!.push(entry);
    if (!exitsByDate.has(exit.actualExitDate)) exitsByDate.set(exit.actualExitDate, []);
    exitsByDate.get(exit.actualExitDate)!.push(ex);
  }

  const planBySession: SessionPlan[] = [];
  const dateSet = new Set<SessionDate>([...entriesByDate.keys(), ...exitsByDate.keys()]);
  for (const d of [...dateSet].sort()) {
    planBySession.push({
      sessionDate: d,
      entries: entriesByDate.get(d) ?? [],
      exits: exitsByDate.get(d) ?? [],
    });
  }

  // 3. Walk equity path.
  const eq: EquityPathResult = runEquityPath(
    plan.sessions, planBySession, barSource,
    { startingEquityUsd: plan.startingEquityUsd, maxCarryDays: maxCarry },
  );
  if (!eq.ok) {
    return {
      ok: false, stage: 'equity',
      reason: eq.reason, equityRefusal: eq.refusal, sessionDate: eq.sessionDate,
    };
  }

  // 4. Project the FOUR-FIELD contract per lot.
  const lotRoundTrips: LotRoundTrip[] = exits.map(({ lot, exit }) => {
    const sharesN = lot.shares as number;
    // entry_cash_out uses the RAW entry_open per fixture-i convention
    // ("shares × entry_open" in the fixture pnl_rule). When haircutMode
    // is 'none' the exit's entryPricePostHaircut === raw entryPrice, so
    // this branch is a no-op mirror; when 'study' the round-trip records
    // the effective (haircut-adjusted) cash flow.
    const entryPriceForCashOut = haircutMode === 'none'
      ? (lot.entryPrice as number)
      : (exit.entryPricePostHaircut as number);
    const exitPricePostHaircut = exit.exitClosePostHaircut as number;
    const grossEntry = sharesN * entryPriceForCashOut;
    const grossExit = sharesN * exitPricePostHaircut;
    const entryCashOut = lot.side === 'long' ? grossEntry : -grossEntry;
    const exitCashIn = lot.side === 'long' ? grossExit : -grossExit;
    const realizedUsd = (haircutMode === 'none'
      ? (exit.grossRealizedUsd as number)
      : (exit.realizedUsd as number));
    return {
      lotId: lot.lotId, ticker: lot.ticker, side: lot.side, tier: lot.tier,
      sharesCount: sharesN,
      entryCashOutCents: toCents(entryCashOut),
      exitCashInCents: toCents(exitCashIn),
      realizedCents: toCents(realizedUsd),
      entryDate: lot.entryDate,
      exitDate: exit.actualExitDate,
      entryPriceRaw: lot.entryPrice as number,
      exitClosePostHaircut: exitPricePostHaircut,
      exitCloseRaw: exit.exitCloseRaw as number,
      haircutBpsPerSide: exit.haircutBpsPerSide,
      stalenessDays: exit.stalenessDays,
    };
  });

  return { ok: true, equityRows: eq.rows, lotRoundTrips };
}

// Silence unused-import warnings for brand constructors kept in-scope
// so downstream callers (adapters/tests) can re-export them from one place.
export const _reExports = { money, price, sharesBrand, cashRequired, settleProceeds };