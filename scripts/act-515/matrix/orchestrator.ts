// ACT-515 Matrix — Orchestrator (session-walk).
//
// RULING 2026-07-26 (OPTION 1 — BUILD-THEN-RECEIPT):
//   The R1 receipt turn requires a session-level orchestrator: the sealed
//   corpus admits are slate-stage only; the wallet-cap arithmetic
//     5 admits/day × ~11-session T2 hold ≈ 55 steady-state open lots vs
//     36 long-slot cap
//   proves book caps MUST bind. The prior receipt-attempt path (naive
//   runPipeline over pre-admitted lots) would silently miss those binds.
//   This module owns the session walk: per session in calendar order —
//     (a) EXIT FOLD  — lots whose pre-resolved actualExitDate == today
//                      settle at their runExit-computed post-haircut
//                      close; cash += settleProceeds(...); realized
//                      accrues; carry state cleared.
//     (b) ADMIT      — reconstructSessionAdmits against LIVE state:
//                        · openBook: per-side positive-notional exposure
//                        · budgets:  { k: 5, shortDailyBudget: 5 }  (matrix
//                                     charter — NO DEC-084 ramp; see
//                                     reconstructor.ts header §PACING)
//                        · caps:     sideCapUsd = sizingBase × {0.90, 0.10}
//                        · variant sizing (const=$100k rail, comp=running)
//     (c) RESOLVE-EXITS — for each admitted entry, runExit(...) pre-
//                         resolves actualExitDate + post-haircut prices;
//                         cash entry = entryCash(side, shares, entryEff).
//     (d) MARK       — markBook(open lots, session, closeBarSource) with
//                      carry-forward priorMarks; mark_unavailable → typed
//                      refusal (mark_gap_in_open_book / mark_gap_after_entry).
//     (e) CARRY      — end-of-day debit balance × DAILY_CARRY_RATE (2x
//                      legs' cost engine).
//     (f) EQUITY ROW — cash + longMv + shortMv (per Module 5 sign convention).
//
// COMPOSITE BAR SOURCE:
//   · Entry-open lookup       ← bars-pairs.jsonl                (opens map)
//   · Mark / exit close       ← bars-windows-{YYYY}.jsonl union (closes map)
//   Both maps carry provenance from the sealed Turn-2B cache (see
//   cache-shas.ts). The composite exposes `open(ticker, session)` and
//   `close(ticker, session)`; either returning `null` propagates a typed
//   `entry_price_missing` skip or `mark_unavailable` per Module 5/6 policy.
//
// LEDGER FOOT INVARIANT (Module 7 §PIN (e), re-asserted through this path):
//   equity(t) − equity(t−1) = realizedToday + Δunrealized − carryToday
// Asserted in `orchestrator_test.ts` on the hand fixture across ≥4 sessions.
//
// SCOPE FENCE: zero kernel edits; readonly imports from ../kernel/*.
// ANTI-PHANTOM: no wall-clock, no `Date`, no RNG. FixedClock injected.

import {
  runExit, entryCash, settleProceeds,
  EXIT_ANCHOR_BY_SIDE_TIER, HAIRCUT_BPS_BY_SIDE,
  type SessionCalendar, type HaircutMode,
} from '../kernel/exit.ts';
import {
  markBook,
  type BarSource, type OpenLot, type PriorMark,
} from '../kernel/mark.ts';
import {
  DAILY_CARRY_RATE,
  type EquitySummary, type EquityDrawdown,
} from '../kernel/equity.ts';
import {
  SIZING_VARIANTS, KERNEL_CONST_BASE_EQUITY_USD, KERNEL_SLOT_CONCENTRATION,
  type SizingVariantId,
} from '../kernel/size.ts';
import {
  money, price, shares as sharesBrand,
  type Clock, type Money, type Price, type Shares, type SideDb, type Tier,
} from '../kernel/types.ts';
import type { SessionDate } from '../kernel/clock.ts';
import {
  reconstructSessionAdmits, deriveLongTier, SHORT_TIER_CONVENTION,
  type CorpusCandidateRow, type CellMapLookup,
} from './reconstructor.ts';

// -----------------------------------------------------------------------------
// Public I/O
// -----------------------------------------------------------------------------

/** Composite bar source — opens for entry pricing, closes for mark/exit. */
export interface CompositeBarSource {
  open(ticker: string, session: SessionDate): Price | null;
  close(ticker: string, session: SessionDate): Price | null;
}

export interface OrchestratorInput {
  readonly variantId: SizingVariantId;
  readonly sessions: ReadonlyArray<SessionDate>;
  readonly calendar: SessionCalendar;
  /** Corpus rows GROUPED BY ENTRY SESSION (pre-computed by caller). */
  readonly corpusByEntrySession: ReadonlyMap<SessionDate, ReadonlyArray<CorpusCandidateRow>>;
  readonly cellMap: CellMapLookup;
  readonly bars: CompositeBarSource;
  readonly startingEquityUsd: number;
  /** { k: 5, shortDailyBudget: 5 }. */
  readonly budgets: { readonly k: number; readonly shortDailyBudget: number };
  /** { long: 0.90, short: 0.10 }. */
  readonly walletCapFractions: { readonly long: number; readonly short: number };
  readonly maxCarryDays?: number;
  /** Haircut policy passed through to runExit. Default 'study' (matches live
   *  matrix). Set 'none' for fixture-parity replays where cent-exact ledger
   *  arithmetic matters (e.g. the ledger-foot invariant test). */
  readonly haircutMode?: HaircutMode;
  readonly clock: Clock;
  /** RECEIPT MODE (ruling 2026-07-26, INC-147): when true, the two typed
   *  exit failures — `exit_price_unavailable` (true market gaps inside a
   *  window: halts/delistings post-maxCarry) and `exit_calendar_exhausted`
   *  (tail lots whose scheduled exit runs past the pinned calendar) —
   *  become PRE-AUTHORIZED TYPED SKIPS instead of hard halts. The admit is
   *  discarded (no cash movement, no book entry, no realized), counted per
   *  class, and listed in telemetry. Caller enforces >20 STOP for
   *  `exit_price_unavailable`. When false (default), the orchestrator
   *  halts on either class (matches the frozen construction-lane behavior). */
  readonly permitExitDegradation?: boolean;

  /** V-B ADDITIVE HOOK (turn-1b, orchestrator-scope; kernel untouched).
   *  Per-tier multiplier applied to admitted `entry.shares` AFTER the
   *  reconstructor's cap-binding pass. Semantics: T1 slots ×N means an
   *  admitted T1 lot's share count is multiplied by N; the reconstructor
   *  still counts 1 slot toward the 36-cap for that admit (its cap
   *  arithmetic sees the 1× slot notional). Downstream cash entry and
   *  runExit consume the multiplied share count directly. Default 1 for
   *  every tier. Omit for baseline behavior. */
  readonly slotMultiplierByTier?: Readonly<Partial<Record<Tier, number>>>;

  /** V-D ADDITIVE HOOK (turn-1b, orchestrator-scope; kernel untouched).
   *  Per-session resolver returning the SizingVariantId to use for that
   *  session's admit + sizingBase computation. `null` falls back to
   *  `input.variantId`. When present, `input.variantId` acts as the
   *  DEFAULT (used when the resolver returns null OR is absent). Warmup
   *  policy is the caller's responsibility (V-D: 1× during first 200
   *  sessions per operator ruling — encoded in the resolver body). */
  readonly variantResolver?: (session: SessionDate) => SizingVariantId | null;

  /** V-B′ ADDITIVE HOOK (RULING 2026-07-26). Per-tier multiplier applied to
   *  candidate slot notional BEFORE the reconstructor's cap-binding pass.
   *  Fixes the V-B geometry-honesty gap where caps were computed against
   *  1× notional while shares/cash carried N×. When set, downstream shares
   *  scale via the reconstructor's `slotNotional / entryPrice` and BOTH the
   *  allocation-cap arithmetic AND cash entry see the multiplied ticket.
   *  MUST NOT be combined with `slotMultiplierByTier` for the same tier
   *  (would double-multiply); orchestrator asserts this. */
  readonly preAdmitSlotMultiplierByTier?: Readonly<Partial<Record<Tier, number>>>;

  /** LONG-ONLY MICRO-RECEIPT PASS-THROUGH (2026-07-26 capstone).
   *  When true, forwarded to `reconstructSessionAdmits` — every SHORT
   *  candidate is refused with `short_admits_disabled`. LONG branch
   *  untouched. Default false. */
  readonly disableShortAdmits?: boolean;
}

export interface OrchestratorRow {
  readonly sessionDate: SessionDate;
  readonly cashUsd: Money;
  readonly longMvUsd: Money;                // POSITIVE
  readonly shortMvUsd: Money;               // NEGATIVE
  readonly equityUsd: Money;
  readonly unrealizedTotalUsd: Money;
  readonly realizedTodayUsd: Money;
  readonly carryTodayUsd: Money;
  readonly openLots: number;
  readonly openLongLots: number;
  readonly openShortLots: number;
  readonly sizingBaseUsd: Money;
  readonly longCapUsd: Money;
  readonly shortCapUsd: Money;
  readonly admitsToday: number;
  readonly refusalsToday: Readonly<Record<string, number>>;
  readonly skipsToday: Readonly<Record<string, number>>;
}

export interface CapBindTelemetry {
  readonly allocationCapRefusalsTotal: number;
  readonly positionAlreadyOpenTotal: number;
  readonly dailyBudgetReachedTotal: number;
  readonly shortDailyBudgetReachedTotal: number;
  readonly maxConcurrentLongLots: number;
  readonly maxConcurrentShortLots: number;
  readonly totalAdmits: number;
  readonly totalAdmitsLong: number;
  readonly totalAdmitsShort: number;
  readonly totalRealizedUsd: Money;
  readonly totalRealizedLongUsd: Money;
  readonly totalRealizedShortUsd: Money;
  /** Pre-authorized typed skip: exit_price_unavailable post-maxCarry.
   *  Populated only in `permitExitDegradation` mode. */
  readonly exitPriceUnavailableSkips: ReadonlyArray<{
    readonly sessionDate: SessionDate;
    readonly lotId: string; readonly ticker: string; readonly side: SideDb;
    readonly reason: string;
  }>;
  /** Pre-authorized typed skip: exit_calendar_exhausted (tail lots).
   *  Populated only in `permitExitDegradation` mode. */
  readonly exitCalendarExhaustedSkips: ReadonlyArray<{
    readonly sessionDate: SessionDate;
    readonly lotId: string; readonly ticker: string; readonly side: SideDb;
    readonly reason: string;
  }>;
  /** Per-lot exit records — one per lot that reached settlement in the walk.
   *  Populated for R1 attribution (ACT-515). Not written to disk here;
   *  downstream consumers (run-attribution.ts) join to slate metadata via
   *  eventId. Never influences kernel decisions. */
  readonly perLot: ReadonlyArray<{
    readonly lotId: string;
    readonly ticker: string;
    readonly side: SideDb;
    readonly tier: Tier;
    readonly eventId: number;
    readonly eventDate: SessionDate;
    readonly entryDate: SessionDate;
    readonly actualExitDate: SessionDate;
    readonly entryPriceEff: number;
    readonly exitClosePostHaircut: number;
    readonly sharesQty: number;
    readonly notionalUsd: number;      // shares × entryPriceEff, positive
    readonly realizedUsd: number;      // signed, post-haircut
    readonly holdingSessions: number;  // actualExitDate − entryDate (session count)
  }>;
}

export type OrchestratorResult =
  | {
      readonly ok: true;
      readonly rows: ReadonlyArray<OrchestratorRow>;
      readonly summary: EquitySummary;
      readonly telemetry: CapBindTelemetry;
    }
  | {
      readonly ok: false;
      readonly refusal: 'mark_gap_in_open_book' | 'mark_gap_after_entry' | 'exit_calendar_exhausted' | 'exit_price_unavailable';
      readonly sessionDate: SessionDate;
      readonly detail: string;
      readonly rowsBeforeFailure: ReadonlyArray<OrchestratorRow>;
    };

// -----------------------------------------------------------------------------
// Internal state
// -----------------------------------------------------------------------------

function toCents(usd: number): number {
  const c = Math.round(usd * 100);
  if (!Number.isSafeInteger(c)) throw new Error(`orchestrator: cent overflow (${usd})`);
  return c;
}
function fromCents(c: number): number { return c / 100; }

interface OpenLotState {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly tier: Tier;
  readonly shares: Shares;
  readonly entryPriceEff: Price;       // post-haircut entry (matches Module 7)
  readonly entryDate: SessionDate;
  readonly eventDate: SessionDate;
  readonly actualExitDate: SessionDate;
  readonly exitClosePostHaircut: Price;
  readonly realizedUsd: number;         // post-haircut, signed by side
}

// -----------------------------------------------------------------------------
// Cell-map lookup adapter — reconstructor's CellMapLookup returns number|null.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// runOrchestrator — session walk over sealed cache
// -----------------------------------------------------------------------------

export function runOrchestrator(input: OrchestratorInput): OrchestratorResult {
  const defaultVariant = SIZING_VARIANTS[input.variantId];
  if (!defaultVariant) throw new Error(`orchestrator: unknown variant ${input.variantId}`);
  const maxCarry = input.maxCarryDays ?? 5;
  const haircutMode: HaircutMode = input.haircutMode ?? 'study';
  const permitDegradation = input.permitExitDegradation ?? false;
  const tierMul = input.slotMultiplierByTier ?? {};
  const preTierMul = input.preAdmitSlotMultiplierByTier ?? {};
  // Guard: same tier cannot be multiplied on both hooks.
  for (const t of Object.keys(preTierMul) as Tier[]) {
    const post = tierMul[t] ?? 1;
    const pre = preTierMul[t] ?? 1;
    if (post !== 1 && pre !== 1) {
      throw new Error(`orchestrator: tier ${t} cannot use both slotMultiplierByTier and preAdmitSlotMultiplierByTier`);
    }
  }
  const resolveVariant = (s: SessionDate) => {
    const r = input.variantResolver ? input.variantResolver(s) : null;
    if (r === null || r === undefined) return defaultVariant;
    const v = SIZING_VARIANTS[r];
    if (!v) throw new Error(`orchestrator: variantResolver returned unknown variant ${r}`);
    return v;
  };

  // Typed-skip accumulators (populated only under permitDegradation).
  const exitPriceUnavailableSkips: Array<{
    sessionDate: SessionDate; lotId: string; ticker: string; side: SideDb; reason: string;
  }> = [];
  const exitCalendarExhaustedSkips: Array<{
    sessionDate: SessionDate; lotId: string; ticker: string; side: SideDb; reason: string;
  }> = [];
  const perLot: Array<{
    lotId: string; ticker: string; side: SideDb; tier: Tier; eventId: number;
    eventDate: SessionDate; entryDate: SessionDate; actualExitDate: SessionDate;
    entryPriceEff: number; exitClosePostHaircut: number; sharesQty: number;
    notionalUsd: number; realizedUsd: number; holdingSessions: number;
  }> = [];

  // BarSource adapters — Module 5/6 consume `close(ticker, session)`.
  const closeSource: BarSource = { close: (t, s) => input.bars.close(t, s) };

  // State
  let cashC = toCents(input.startingEquityUsd);
  const openLots = new Map<string, OpenLotState>();
  let priorMarks: ReadonlyMap<string, PriorMark> = new Map();
  let cumCarryC = 0;
  const rows: OrchestratorRow[] = [];
  const equitySeriesC: number[] = [];

  // Telemetry
  let allocationCapRefusalsTotal = 0;
  let positionAlreadyOpenTotal = 0;
  let dailyBudgetReachedTotal = 0;
  let shortDailyBudgetReachedTotal = 0;
  let maxConcurrentLong = 0;
  let maxConcurrentShort = 0;
  let totalAdmits = 0;
  let totalAdmitsLong = 0;
  let totalAdmitsShort = 0;
  let totalRealizedC = 0;
  let totalRealizedLongC = 0;
  let totalRealizedShortC = 0;

  // Provenance map: eventId → { tier, eventDate } populated as corpus is walked.
  // Built lazily per admit call so the orchestrator does not scan the whole
  // corpus up-front.

  for (const session of input.sessions) {
    // ── (a) EXIT FOLD ────────────────────────────────────────────────
    let realizedTodayC = 0;
    const exitedLotIds: string[] = [];
    for (const lot of openLots.values()) {
      if (lot.actualExitDate === session) {
        const proceeds = settleProceeds(lot.side, lot.shares, lot.exitClosePostHaircut) as number;
        cashC += toCents(proceeds);
        realizedTodayC += toCents(lot.realizedUsd);
        totalRealizedC += toCents(lot.realizedUsd);
        if (lot.side === 'long') totalRealizedLongC += toCents(lot.realizedUsd);
        else totalRealizedShortC += toCents(lot.realizedUsd);
        exitedLotIds.push(lot.lotId);
        // Attribution sidecar: emit one record per settled lot. Session-index
        // math via calendar would need input.calendar.indexOf; we compute
        // holdingSessions cheaply by counting sessions from rows[] range.
        const hashIdx = lot.lotId.indexOf('#');
        const eventId = Number(lot.lotId.slice(hashIdx + 1));
        // holding = index(actualExit) - index(entry) using calendar sessionAfter
        // — cheap linear probe (bounded by maxCarry+tier-window, ~<15 steps).
        let hold = 0;
        {
          let cursor: SessionDate | null = lot.entryDate;
          while (cursor !== null && cursor !== lot.actualExitDate && hold < 60) {
            cursor = input.calendar.sessionAfter(cursor, 1);
            hold += 1;
          }
        }
        perLot.push({
          lotId: lot.lotId, ticker: lot.ticker, side: lot.side, tier: lot.tier,
          eventId, eventDate: lot.eventDate, entryDate: lot.entryDate,
          actualExitDate: lot.actualExitDate,
          entryPriceEff: lot.entryPriceEff as number,
          exitClosePostHaircut: lot.exitClosePostHaircut as number,
          sharesQty: lot.shares as number,
          notionalUsd: (lot.shares as number) * (lot.entryPriceEff as number),
          realizedUsd: lot.realizedUsd,
          holdingSessions: hold,
        });
      }
    }
    for (const id of exitedLotIds) openLots.delete(id);
    if (exitedLotIds.length > 0) {
      const nextPrior = new Map(priorMarks);
      for (const id of exitedLotIds) nextPrior.delete(id);
      priorMarks = nextPrior;
    }

    // ── (b) ADMIT ────────────────────────────────────────────────────
    const variant = resolveVariant(session);
    // Equity basis for -comp sizing: last completed row's equity, or the
    // starting equity if this is the first session.
    const equityForSizing = variant.mode === 'const'
      ? KERNEL_CONST_BASE_EQUITY_USD
      : (rows.length > 0 ? (rows[rows.length - 1].equityUsd as number) : input.startingEquityUsd);
    // sizingBase mirrors production: equity × strategyAllocationPct(=1) × marginMultiplier(=leverage).
    const sizingBase = equityForSizing * variant.leverage;
    const longCapUsd = sizingBase * input.walletCapFractions.long;
    const shortCapUsd = sizingBase * input.walletCapFractions.short;

    // openBook: positive-notional exposure per side (buying-power basis;
    // matches production's allocation_cap check which sums signed MV but
    // is unambiguous only when both sides are compared positive against
    // positive caps).
    const openBookRows = [] as Array<{ ticker: string; side: SideDb; marketValueUsd: number }>;
    for (const lot of openLots.values()) {
      openBookRows.push({
        ticker: lot.ticker, side: lot.side,
        marketValueUsd: (lot.shares as number) * (lot.entryPriceEff as number),
      });
    }

    const rowsToday = input.corpusByEntrySession.get(session) ?? [];
    const admitRes = reconstructSessionAdmits({
      sessionDate: session,
      corpusRows: rowsToday,
      cellMap: input.cellMap,
      openBook: openBookRows,
      equityUsd: equityForSizing,
      variantId: variant.id,
      budgets: input.budgets,
      caps: { sideCapUsd: { long: longCapUsd, short: shortCapUsd } },
      referencePrice: (t, s) => input.bars.open(t, s),
      sessionOffset: (s, n) => input.calendar.sessionAfter(s, n),
      clock: input.clock,
      preAdmitSlotMultiplierByTier: preTierMul,
      disableShortAdmits: input.disableShortAdmits ?? false,
    });

    // Build eventId → CorpusCandidateRow for tier + eventDate resolution.
    const rowByEventId = new Map<number, CorpusCandidateRow>();
    for (const r of rowsToday) rowByEventId.set(r.eventId, r);

    // ── (c) RESOLVE-EXITS + CASH ENTRY ──────────────────────────────
    let admitsToday = 0;
    for (const entry of admitRes.entries) {
      // lotId format from reconstructor: `${sessionDate}#${eventId}`.
      const hashIdx = entry.lotId.indexOf('#');
      const eventId = Number(entry.lotId.slice(hashIdx + 1));
      const corpusRow = rowByEventId.get(eventId);
      if (!corpusRow) {
        throw new Error(`orchestrator: no corpus row for admitted event ${eventId} (lotId=${entry.lotId})`);
      }
      const tier: Tier = entry.side === 'long'
        ? (deriveLongTier(corpusRow) as Tier)
        : SHORT_TIER_CONVENTION;
      const eventDate = corpusRow.eventDate;

      // V-B: post-admit share multiplier by tier (default 1). Applied AFTER
      // reconstructor's cap-binding pass — caveat surfaced in run-variants-bd
      // receipt: the reconstructor's caps see 1× slot notionals; the effective
      // T1 exposure carried into cash + runExit is multiplied here.
      const mul = Math.max(1, Math.floor(tierMul[tier] ?? 1));
      const scaledShares = mul === 1
        ? entry.shares
        : sharesBrand((entry.shares as number) * mul);

      const exitRes = runExit(
        {
          lotId: entry.lotId,
          ticker: entry.ticker,
          side: entry.side,
          tier,
          shares: scaledShares,
          entryPrice: entry.entryPrice,   // raw open per reconstructor
          entryDate: session,
          eventDate,
        },
        input.calendar, closeSource,
        { haircutMode, maxCarryDays: maxCarry },
      );
      if (!exitRes.ok) {
        if (permitDegradation) {
          const kind = exitRes.refusal === 'exit_spec_unmapped'
            ? 'exit_calendar_exhausted'
            : exitRes.refusal;
          const rec = {
            sessionDate: session, lotId: entry.lotId, ticker: entry.ticker,
            side: entry.side, reason: exitRes.reason,
          };
          if (kind === 'exit_calendar_exhausted') exitCalendarExhaustedSkips.push(rec);
          else exitPriceUnavailableSkips.push(rec);
          continue; // discard admit; no cash / no book / no realized
        }
        // exit_calendar_exhausted or exit_price_unavailable — surface typed.
        return {
          ok: false,
          refusal: exitRes.refusal === 'exit_spec_unmapped'
            ? 'exit_calendar_exhausted'
            : exitRes.refusal,
          sessionDate: session,
          detail: `runExit(${entry.lotId}) → ${exitRes.refusal}: ${exitRes.reason}`,
          rowsBeforeFailure: rows,
        };
      }

      // Cash flow at entry uses POST-HAIRCUT entry under 'study' (matches
      // runPipeline) — collapses to RAW entry under 'none' by construction.
      const entryEff = exitRes.entryPricePostHaircut;
      const flow = entryCash(entry.side, scaledShares, entryEff) as number;
      cashC += toCents(flow);

      openLots.set(entry.lotId, {
        lotId: entry.lotId,
        ticker: entry.ticker,
        side: entry.side,
        tier,
        shares: scaledShares,
        entryPriceEff: entryEff,
        entryDate: session,
        eventDate,
        actualExitDate: exitRes.actualExitDate,
        exitClosePostHaircut: exitRes.exitClosePostHaircut,
        realizedUsd: (haircutMode === 'none'
          ? (exitRes.grossRealizedUsd as number)
          : (exitRes.realizedUsd as number)),
      });
      admitsToday += 1;
      totalAdmits += 1;
      if (entry.side === 'long') totalAdmitsLong += 1;
      else totalAdmitsShort += 1;
    }

    // Telemetry from reconstructor's admit pass.
    const refusalsToday = {
      position_already_open: admitRes.tally.position_already_open,
      allocation_cap_reached: admitRes.tally.allocation_cap_reached,
      short_daily_budget_reached: admitRes.tally.short_daily_budget_reached,
      daily_budget_reached: admitRes.tally.daily_budget_reached,
    };
    positionAlreadyOpenTotal += refusalsToday.position_already_open;
    allocationCapRefusalsTotal += refusalsToday.allocation_cap_reached;
    shortDailyBudgetReachedTotal += refusalsToday.short_daily_budget_reached;
    dailyBudgetReachedTotal += refusalsToday.daily_budget_reached;

    // ── (d) MARK all open lots at today's close ─────────────────────
    const lotsForMark: OpenLot[] = [];
    for (const lot of openLots.values()) {
      lotsForMark.push({
        lotId: lot.lotId, ticker: lot.ticker, side: lot.side,
        shares: lot.shares, entryPrice: lot.entryPriceEff,
      });
    }
    const marked = markBook(lotsForMark, session, closeSource, {
      maxCarryDays: maxCarry, priorMarks,
    });
    if (marked.book.unavailableLots > 0) {
      return {
        ok: false,
        refusal: 'mark_gap_in_open_book',
        sessionDate: session,
        detail: `${marked.book.unavailableLots} open lot(s) had mark_unavailable`,
        rowsBeforeFailure: rows,
      };
    }
    priorMarks = new Map(marked.nextPriorMarks);

    // ── (e) CARRY on end-of-day debit balance ───────────────────────
    let carryC = 0;
    if (cashC < 0) {
      const debitUsd = -cashC / 100;
      carryC = toCents(debitUsd * DAILY_CARRY_RATE);
      cashC -= carryC;
    }
    cumCarryC += carryC;

    // ── (f) EQUITY ROW ──────────────────────────────────────────────
    const longC = toCents(marked.book.longMv as number);
    const shortC = toCents(marked.book.shortMv as number);
    const equityC = cashC + longC + shortC;

    let openLong = 0, openShort = 0;
    for (const l of openLots.values()) {
      if (l.side === 'long') openLong += 1; else openShort += 1;
    }
    if (openLong > maxConcurrentLong) maxConcurrentLong = openLong;
    if (openShort > maxConcurrentShort) maxConcurrentShort = openShort;

    rows.push({
      sessionDate: session,
      cashUsd: money(fromCents(cashC)),
      longMvUsd: money(fromCents(longC)),
      shortMvUsd: money(fromCents(shortC)),
      equityUsd: money(fromCents(equityC)),
      unrealizedTotalUsd: marked.book.unrealizedTotalUsd,
      realizedTodayUsd: money(fromCents(realizedTodayC)),
      carryTodayUsd: money(fromCents(carryC)),
      openLots: openLots.size,
      openLongLots: openLong,
      openShortLots: openShort,
      sizingBaseUsd: money(sizingBase),
      longCapUsd: money(longCapUsd),
      shortCapUsd: money(shortCapUsd),
      admitsToday,
      refusalsToday,
      skipsToday: admitRes.tally,
    });
    equitySeriesC.push(equityC);
  }

  const summary = summarizeEquity(rows, equitySeriesC, input.startingEquityUsd, cumCarryC);
  const telemetry: CapBindTelemetry = {
    allocationCapRefusalsTotal,
    positionAlreadyOpenTotal,
    dailyBudgetReachedTotal,
    shortDailyBudgetReachedTotal,
    maxConcurrentLongLots: maxConcurrentLong,
    maxConcurrentShortLots: maxConcurrentShort,
    totalAdmits,
    totalAdmitsLong,
    totalAdmitsShort,
    totalRealizedUsd: money(fromCents(totalRealizedC)),
    totalRealizedLongUsd: money(fromCents(totalRealizedLongC)),
    totalRealizedShortUsd: money(fromCents(totalRealizedShortC)),
    exitPriceUnavailableSkips,
    exitCalendarExhaustedSkips,
    perLot,
  };
  return { ok: true, rows, summary, telemetry };
}

// -----------------------------------------------------------------------------
// Summary — mirror of equity.ts::summarize (kept LOCAL because that function
// is not exported). If equity.ts ever exports it, drop this in favor of it.
// -----------------------------------------------------------------------------

function summarizeEquity(
  rows: ReadonlyArray<OrchestratorRow>,
  equitySeriesCents: ReadonlyArray<number>,
  startingEquityUsd: number,
  cumCarryCents: number,
): EquitySummary {
  const n = equitySeriesCents.length;
  const startCents = toCents(startingEquityUsd);
  const endCents = equitySeriesCents[n - 1];

  // DD walk (peak → trough → recovery)
  let peakCents = startCents;
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
      curPeakCents = e; curPeakIdx = i;
      curTroughCents = e; curTroughIdx = i;
    } else if (e < curTroughCents) {
      curTroughCents = e; curTroughIdx = i;
      const dd = (curPeakCents - e) / curPeakCents;
      if (dd > maxDd) { maxDd = dd; ddPeakIdx = curPeakIdx; ddTroughIdx = curTroughIdx; }
    }
    if (e > peakCents) peakCents = e;
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
    if (recIdx === -1) { recoveryDate = 'UNRECOVERED'; recoveryDays = 'N/A-UNRECOVERED'; }
    else { recoveryDate = rows[recIdx].sessionDate; recoveryDays = recIdx - ddTroughIdx; }
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
    if (worstYearRet === null || ret < worstYearRet) { worstYearRet = ret; worstYear = yr; }
  }

  const drawdown: EquityDrawdown = {
    maxDdPct: maxDd, peakDate, troughDate, recoveryDate, durationDays, recoveryDays,
  };
  return {
    startingEquityUsd: money(startingEquityUsd),
    endingEquityUsd: money(fromCents(endCents)),
    totalReturnPct: (endCents - startCents) / startCents,
    worstCalendarYear: worstYear,
    worstCalendarYearReturnPct: worstYearRet,
    drawdown,
    cumulativeCarryUsd: money(fromCents(cumCarryCents)),
  };
}

// -----------------------------------------------------------------------------
// Grep-anchors (do not remove — docs-as-code)
// -----------------------------------------------------------------------------

export const _CITATIONS = Object.freeze({
  exitAnchorByTierSide: EXIT_ANCHOR_BY_SIDE_TIER,
  haircutBpsBySide: HAIRCUT_BPS_BY_SIDE,
  slotConcentration: KERNEL_SLOT_CONCENTRATION,
  constBaseEquity: KERNEL_CONST_BASE_EQUITY_USD,
  dailyCarryRate: DAILY_CARRY_RATE,
  priceCtor: price,
  sharesCtor: sharesBrand,
});