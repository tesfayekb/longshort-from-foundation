// ACT-515 Matrix — Chain C0: Corpus→SessionPlan reconstructor.
//
// SCOPE: pure function that maps a per-session slice of the ratified study
// corpus (`overshoot_study_candidate_events`, run `1888e113`) + the cell map
// (`overshoot_study_cell_results`, run `045d2dfc`, exclusion_width=5) into a
// kernel `SessionPlan.entries[]` for that session.
//
// PARAMETER PROVENANCE (Pin 1 — RULING 2026-07-25):
//   · TIER PREDICATE (LONG) — lifted verbatim from `isLongT1Geometry`
//     (`supabase/functions/_shared/overshoot/detector/detector.ts:533-540`)
//     with the `LONG_T1_GEOMETRY` constant at :522-527. Corpus-partition
//     evidence: `docs/06-tracking/ACT-574-phase1-entry-day-offset-grid.md`
//     header (`Tier resolution: T1 = ... ; T2 = LONG complement`, n=523,694).
//   · RANK SCORE — `mean_fwd_return_5d × sideSign(side)` per
//     `supabase/functions/_shared/overshoot/detector/detector.ts:61-62` and
//     :1076 (LONG cell → `rank_score = cell.mean_fwd_return_5d`). Cell
//     resolution key mirrors detector.ts:1053-1063 (side, band, window_days,
//     momentum_quintile, drawdown_bucket, exclusion_width_days=5).
//   · LONG BAND — `L_10_INF` verbatim from `LONG_T1_GEOMETRY.bands` at
//     `detector.ts:523`. LONG admission threshold is `excess ≥ 0.10`
//     (`detector.ts:61`), so every LONG corpus row resolves to this band.
//   · K + WALLET CAPS + STARTING EQUITY + SLOT CONCENTRATION — read from
//     `scripts/act-515/config-matrix.md §2` + `kernel/size.ts:95`
//     (`KERNEL_SLOT_CONCENTRATION = 0.025`) + :99 (`KERNEL_CONST_BASE_EQUITY_USD`).
//   · EXIT HORIZONS — the runner (`run-r1-const.ts`) consumes
//     `EXIT_ANCHOR_BY_SIDE_TIER` from `kernel/exit.ts:170` VERBATIM. The
//     stale prose in `config-matrix.md §2` ("T+11 / SHORT T+6") is
//     annotated in the same batch (INC-143 family instance).
//
// SCOPE NARROWING (D-C0.1, DW-235): reconstructor v1 handles LONG side only.
// SHORT rows return a typed skip `short_reconstruction_not_yet_wired` and are
// counted in the receipt. R1 `1x-const` is long-heavy (short capacity ≤ 10%).
//
// SCOPE FENCE (Pin 5): zero kernel edits. Readonly imports from `../kernel/*`.
//
// ANTI-PHANTOM: no wall-clock, no `Date`, no RNG. Deterministic: shuffling
// the input corpus rows produces the identical `entries[]` output (property
// test in `reconstructor_test.ts`).

import {
  runAdmit,
  type Candidate, type OpenBookRow, type AllocationCapConfig, type BudgetConfig,
} from '../kernel/admit.ts';
import {
  runSize, SIZING_VARIANTS, KERNEL_CONST_BASE_EQUITY_USD, KERNEL_SLOT_CONCENTRATION,
  type SizingVariantId,
} from '../kernel/size.ts';
import type { SessionDate } from '../kernel/clock.ts';
import type { EntryEvent } from '../kernel/equity.ts';
import {
  money, price, shares as sharesBrand,
  type BandLabel, type CellKey, type Clock, type Price, type SideDb,
} from '../kernel/types.ts';

// Provenance constants (Pin 1 citations — DO NOT ALTER without an INC + doc).

/** `detector.ts:523` — LONG admission threshold is `excess ≥ 0.10`, and
 *  `band-label.ts:48-63` maps `[0.10, +∞) → 'L_10_INF'`. Every LONG corpus
 *  row therefore resolves to this band. */
export const LONG_BAND_LITERAL: BandLabel = 'L_10_INF';

/** `detector.ts:522-527` LONG_T1_GEOMETRY constant, lifted VERBATIM. */
export const LONG_T1_GEOMETRY_MATRIX = Object.freeze({
  windows: [1, 2, 3] as ReadonlyArray<number>,
  momentumQuintiles: [4, 5] as ReadonlyArray<number>,
  drawdownBuckets: [1, 2, 3] as ReadonlyArray<number>,
});

/** Cell-map exclusion width — ACT-514 §preamble / config-matrix.md §2. */
export const CELL_EXCLUSION_WIDTH_DAYS = 5;

// I/O shapes

/** One row of `overshoot_study_candidate_events` (subset). */
export interface CorpusCandidateRow {
  readonly eventId: number;
  readonly ticker: string;
  readonly side: SideDb;
  readonly eventDate: SessionDate;
  readonly windowDays: number;
  readonly momentumQuintile: number | null;
  readonly drawdownBucket: number | null;
  readonly daysToNearestEarnings: number | null;
}

export type CellMapLookup = (key: CellKey) => number | null;
export type ReferencePriceResolver = (ticker: string, entrySessionDate: SessionDate) => Price | null;
export type SessionOffsetResolver = (session: SessionDate, n: number) => SessionDate | null;

export type SkipReason =
  | 'short_reconstruction_not_yet_wired'
  | 'no_cell_map_hit'
  | 'incomplete_cell_key'
  | 'entry_session_off_calendar'
  | 'entry_price_missing'
  | 'sizing_refusal';

export interface Skip {
  readonly eventId: number;
  readonly ticker: string;
  readonly side: SideDb;
  readonly reason: SkipReason;
  readonly detail?: string;
}

export interface ReconstructInput {
  readonly sessionDate: SessionDate;
  readonly corpusRows: ReadonlyArray<CorpusCandidateRow>;
  readonly cellMap: CellMapLookup;
  readonly openBook: ReadonlyArray<OpenBookRow>;
  readonly equityUsd: number;
  readonly variantId: SizingVariantId;
  readonly budgets: BudgetConfig;
  readonly caps: AllocationCapConfig;
  readonly referencePrice: ReferencePriceResolver;
  readonly sessionOffset: SessionOffsetResolver;
  readonly clock: Clock;
}

export interface ReconstructResult {
  readonly sessionDate: SessionDate;
  readonly entries: ReadonlyArray<EntryEvent>;
  readonly refusals: ReadonlyArray<{ readonly ticker: string; readonly side: SideDb; readonly category: string }>;
  readonly skips: ReadonlyArray<Skip>;
  readonly tally: Readonly<Record<string, number>>;
}

// Pure helpers

/** Verbatim `isLongT1Geometry(cellKey)` from `detector.ts:533-540`. */
export function deriveLongTier(row: CorpusCandidateRow): 'T1' | 'T2' | null {
  if (row.side !== 'long') return null;
  if (row.momentumQuintile === null || row.drawdownBucket === null) return null;
  const isT1 =
    LONG_T1_GEOMETRY_MATRIX.windows.includes(row.windowDays) &&
    LONG_T1_GEOMETRY_MATRIX.momentumQuintiles.includes(row.momentumQuintile) &&
    LONG_T1_GEOMETRY_MATRIX.drawdownBuckets.includes(row.drawdownBucket);
  return isT1 ? 'T1' : 'T2';
}

/** Entry-offset per horizon (matrix §2). T1 = T+2 open; T2 = T+1 open. */
export function entryOffsetFor(tier: 'T1' | 'T2'): number {
  return tier === 'T1' ? 2 : 1;
}

/** Build the CellKey exactly as `detector.ts:1056-1063` for LONG. */
export function buildLongCellKey(row: CorpusCandidateRow): CellKey | null {
  if (row.momentumQuintile === null || row.drawdownBucket === null) return null;
  return {
    side: 'long',
    band: LONG_BAND_LITERAL,
    argmaxWindowDays: row.windowDays,
    magnitudeQuintile: row.momentumQuintile,
    drawdownBucket: row.drawdownBucket,
    exclusionHorizonDays: CELL_EXCLUSION_WIDTH_DAYS,
  };
}

/** rankScore per detector.ts:61-62 + :1076. Long: mean × +1. Short: × −1. */
export function rankScoreFromCell(side: SideDb, meanFwdReturn5d: number): number {
  return side === 'long' ? meanFwdReturn5d : -meanFwdReturn5d;
}

// Main entry

export function reconstructSessionAdmits(input: ReconstructInput): ReconstructResult {
  const variant = SIZING_VARIANTS[input.variantId];
  const skips: Skip[] = [];
  type Enriched = Candidate & {
    readonly __row: CorpusCandidateRow;
    readonly __tier: 'T1' | 'T2';
    readonly __entrySession: SessionDate;
    readonly __entryPrice: Price;
  };
  const candidates: Enriched[] = [];

  for (const row of input.corpusRows) {
    if (row.side === 'short') {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
        reason: 'short_reconstruction_not_yet_wired' });
      continue;
    }

    const tier = deriveLongTier(row);
    if (tier === null) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'incomplete_cell_key',
        detail: 'momentum_quintile or drawdown_bucket is null' });
      continue;
    }

    const cellKey = buildLongCellKey(row);
    if (cellKey === null) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'incomplete_cell_key' });
      continue;
    }
    const meanFwd = input.cellMap(cellKey);
    if (meanFwd === null || !Number.isFinite(meanFwd)) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'no_cell_map_hit', detail: JSON.stringify(cellKey) });
      continue;
    }

    const rankScore = rankScoreFromCell(row.side, meanFwd);

    const entrySession = input.sessionOffset(row.eventDate, entryOffsetFor(tier));
    if (entrySession === null) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'entry_session_off_calendar' });
      continue;
    }
    // Rows destined for other sessions are not this session's candidates.
    if (entrySession !== input.sessionDate) continue;

    const refPx = input.referencePrice(row.ticker, entrySession);
    if (refPx === null) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'entry_price_missing' });
      continue;
    }

    const sized = runSize({
      variant, side: row.side, equityUsd: money(input.equityUsd),
      referencePrice: refPx,
    });
    if (!sized.ok) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'sizing_refusal', detail: sized.refusal });
      continue;
    }

    candidates.push({
      ticker: row.ticker,
      side: row.side,
      tier,
      rankScore,
      band: LONG_BAND_LITERAL,
      slotNotionalUsd: sized.slotNotionalUsd as number,
      __row: row, __tier: tier, __entrySession: entrySession, __entryPrice: refPx,
    });
  }

  const admitRes = runAdmit({
    candidates,
    openBook: input.openBook,
    caps: input.caps,
    budgets: input.budgets,
    cellLookup: () => null,
    clock: input.clock,
  });

  const byKey = new Map<string, Enriched>();
  for (const c of candidates) byKey.set(`${c.side}/${c.ticker}`, c);

  const entries: EntryEvent[] = [];
  const refusals: Array<{ ticker: string; side: SideDb; category: string }> = [];
  for (const d of admitRes.decisions) {
    if (d.kind === 'admit') {
      const c = byKey.get(`${d.side}/${d.ticker}`);
      if (!c) continue;
      const shareCount = Math.floor((c.slotNotionalUsd as number) / (c.__entryPrice as number));
      if (shareCount <= 0) continue;
      entries.push({
        lotId: `${input.sessionDate}#${c.__row.eventId}`,
        ticker: c.ticker,
        side: c.side,
        shares: sharesBrand(shareCount),
        entryPrice: c.__entryPrice,
        slotNotional: money(c.slotNotionalUsd as number),
      });
    } else {
      refusals.push({ ticker: d.ticker, side: d.side, category: d.category });
    }
  }

  return {
    sessionDate: input.sessionDate,
    entries, refusals, skips,
    tally: {
      admits: admitRes.tally.admits,
      position_already_open: admitRes.tally.position_already_open,
      allocation_cap_reached: admitRes.tally.allocation_cap_reached,
      short_daily_budget_reached: admitRes.tally.short_daily_budget_reached,
      daily_budget_reached: admitRes.tally.daily_budget_reached,
      skips_short: skips.filter(s => s.reason === 'short_reconstruction_not_yet_wired').length,
      skips_no_cell: skips.filter(s => s.reason === 'no_cell_map_hit').length,
      skips_incomplete_key: skips.filter(s => s.reason === 'incomplete_cell_key').length,
      skips_no_bar: skips.filter(s => s.reason === 'entry_price_missing').length,
      skips_off_calendar: skips.filter(s => s.reason === 'entry_session_off_calendar').length,
      skips_sizing: skips.filter(s => s.reason === 'sizing_refusal').length,
    },
  };
}

// Grep-anchor for the constants referenced elsewhere; do not remove.
export const _CITATIONS = Object.freeze({
  slotConcentration: KERNEL_SLOT_CONCENTRATION,
  constBaseEquity: KERNEL_CONST_BASE_EQUITY_USD,
  longBand: LONG_BAND_LITERAL,
  cellExclusion: CELL_EXCLUSION_WIDTH_DAYS,
  priceCtor: price,
});
