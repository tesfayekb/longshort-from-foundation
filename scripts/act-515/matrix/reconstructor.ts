// ACT-515 Matrix — Chain C0: Corpus→SessionPlan reconstructor.
//
// INC-143 HEADER LAW (RULING 2026-07-26): every prose restatement of an exit
// horizon, entry offset, geometry set, or side-sign convention MUST be a
// verbatim quote from the certified source, with a byte-anchored citation
// on the same line. No paraphrase. If a prose comment drifts from the
// certified source, the certified source WINS and the comment is filed as
// an INC in the same batch.
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
// SHORT-SIDE WIRING (RULING 2026-07-26 · G-1 + H-1):
//   · G-1 TIER CONVENTION — SHORT tier is RECORDED as 'T2' by this
//     reconstructor. This is a record-only bookkeeping convention with
//     zero kernel impact: production emits `tier=null` on every SHORT
//     event per
//       supabase/functions/_shared/overshoot/detector/detector.ts:288-296
//       ("SHORT path: tier is ALWAYS null (SHORT predicate byte-unchanged
//         this tranche)")
//     and
//       supabase/functions/_shared/overshoot/detector/detector.ts:506-511
//       ("SHORT path is BYTE-UNCHANGED this tranche: no T2 admission, no
//         tier tagging (tier remains null on every SHORT event) …").
//     Both `short/T1` and `short/T2` map identically to `entry+4 / H=5`
//     per `kernel/exit.ts:175-176`
//       (`'short/T1': { mode: 'entry', H: 5, n: 4 },
//         'short/T2': { mode: 'entry', H: 5, n: 4 },`)
//     so the convention is invisible to Module 6. Recorded to keep the
//     `${SideDb}/${Tier}` dispatch key well-formed; G-2 (extend Tier to
//     `null`) rejected as post-gate map surgery, G-3 (long-only baseline)
//     already refused by frozen row.
//   · H-1 SHORT ENTRY OFFSET — SHORT entry offset is T+1 open. Anchored
//     to two ratified sources (RULING 2026-07-26):
//       (i) certified fixture-ii SHORT rows: TSLA event 2023-04-03 →
//           entry 2023-04-04 (`fixtures/overshoot-backtest/…-2023q2…`),
//           byte-exact through the integration gate — the fixture IS the
//           studied basis for this replay;
//       (ii) live entry-run timing: event detected 22:00Z → entry next
//            session 13:35Z = T+1 by construction
//            (`supabase/functions/overshoot-entry-run/index.ts`
//             morning-cron cadence; ACT-533 cadence memo).
//     The stale §2 prose ("SHORT: T+1") in `config-matrix.md` agreeing
//     is coincidence, not authority — that section is annotated STALE per
//     GAP-1(c) ruling; authority is the two sources above.
//   · PACING DISCLOSURE — live operation currently paces shorts 1/day
//     (DEC-084 ramp); the matrix replays the chartered geometry WITHOUT
//     ramp pacing (`shortDailyBudget = K`) because DEC-084 is a live-era
//     operational ramp rule, absent from ACT-515 charter §1(a) and from
//     the studied basis. Binding SHORT constraints are the 4-slot book
//     cap + 0.10 wallet cap per the frozen matrix row.
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
  type BandLabel, type CellKey, type Clock, type Price, type SideDb, type Tier,
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

/** `detector.ts:317-321` SHORT geometry — SHORT byte-unchanged from v1:
 *  `shortWindowSet: {1,2,3,4,5}`, `shortMomentumSet: {1,5}`,
 *  `shortDrawdownSet: {4,5}`. Excess-threshold `shortExcessThreshold=0.08`
 *  compared to |excess| with sign check separate (`detector.ts:315`,
 *  `detector.ts:801` — signed comparison `picked.excess <= -excessThreshold`). */
export const SHORT_GEOMETRY_MATRIX = Object.freeze({
  windows: [1, 2, 3, 4, 5] as ReadonlyArray<number>,
  momentumQuintiles: [1, 5] as ReadonlyArray<number>,
  drawdownBuckets: [4, 5] as ReadonlyArray<number>,
  excessThreshold: 0.08,
});

/** G-1 record-only tier convention (RULING 2026-07-26). See file header. */
export const SHORT_TIER_CONVENTION = 'T2' as const;

/** H-1 SHORT entry offset (T+1 open) — see file header for two anchors. */
export const SHORT_ENTRY_OFFSET_SESSIONS = 1;

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
  /** Excess at each window w∈{1..5}. Required for SHORT band derivation
   *  (SHORT band = argmax-|excess| across the shortWindowSet). LONG rows
   *  ignore these — LONG band is `L_10_INF` by construction (see above).
   *  Any SHORT row missing all five values emits `short_excess_missing`. */
  readonly excessW1?: number | null;
  readonly excessW2?: number | null;
  readonly excessW3?: number | null;
  readonly excessW4?: number | null;
  readonly excessW5?: number | null;
}

export type CellMapLookup = (key: CellKey) => number | null;
export type ReferencePriceResolver = (ticker: string, entrySessionDate: SessionDate) => Price | null;
export type SessionOffsetResolver = (session: SessionDate, n: number) => SessionDate | null;

export type SkipReason =
  | 'no_cell_map_hit'
  | 'incomplete_cell_key'
  | 'short_geometry_out_of_set'
  | 'short_excess_below_threshold'
  | 'short_excess_missing'
  | 'short_band_below_min'
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
  /** V-B′ HOOK (RULING 2026-07-26; orchestrator-scope, kernel untouched).
   *  Per-tier multiplier applied to a candidate's `slotNotionalUsd` BEFORE
   *  runAdmit — so the allocation-cap arithmetic and the per-slot share
   *  count both see the SAME multiplied ticket. Semantics: a T1 lot with
   *  multiplier N consumes N × slot of the wallet cap AND materialises with
   *  N × shares. Contrast with the orchestrator's post-admit
   *  `slotMultiplierByTier` (V-B): that hook lets the reconstructor's cap
   *  see 1× while shares/cash carry N× — geometry-honesty gap surfaced by
   *  the V-B receipt caveat. Default 1 for every tier. */
  readonly preAdmitSlotMultiplierByTier?: Readonly<Partial<Record<Tier, number>>>;
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

/** Entry-offset per horizon. LONG T1 = T+2 open; LONG T2 = T+1 open (matrix
 *  §2, STALE-PROSE-annotated but coincidentally correct). SHORT = T+1 open
 *  per H-1 anchors (see file header). */
export function entryOffsetFor(tier: 'T1' | 'T2'): number {
  return tier === 'T1' ? 2 : 1;
}

/** H-1 (RULING 2026-07-26): SHORT entry offset = T+1 open. */
export function entryOffsetForSideTier(side: SideDb, tier: 'T1' | 'T2'): number {
  if (side === 'short') return SHORT_ENTRY_OFFSET_SESSIONS;
  return entryOffsetFor(tier);
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

/** SHORT band selection — verbatim mirror of the detector's classifier
 *  domain: SHORT `signed_excess` is negative and `bandLabelFor('SHORT', …)`
 *  at `band-label.ts:56-63` maps
 *    e ≤ -0.10                     → 'S_10_INF'
 *    -0.10 <  e ≤ -0.08            → 'S_08_10'
 *    -0.08 <  e ≤ -0.06            → 'S_06_08'
 *    -0.06 <  e ≤ -0.05            → 'S_05_06'
 *    -0.05 <  e ≤ -0.04            → 'S_04_05'
 *    -0.04 <  e ≤ -0.03            → 'S_03_04'
 *  Below `-0.03` yields `'S_below_min'` (null returned here).
 *
 *  The row's `windowDays` field IS the argmax window as recorded by the
 *  study writer, so the excess used is `excess_w{windowDays}`. If that
 *  field is missing, callers surface `short_excess_missing`. Above the
 *  admission threshold (|e| ≥ 0.08 per `detector.ts:315` +
 *  signed check `detector.ts:801`), only `'S_08_10'` and `'S_10_INF'` are
 *  admittable bands. */
export function shortBandFromSignedExcess(e: number): BandLabel | null {
  if (e <= -0.10) return 'S_10_INF';
  if (e <= -0.08 && e > -0.10) return 'S_08_10';
  if (e <= -0.06 && e > -0.08) return 'S_06_08';
  if (e <= -0.05 && e > -0.06) return 'S_05_06';
  if (e <= -0.04 && e > -0.05) return 'S_04_05';
  if (e <= -0.03 && e > -0.04) return 'S_03_04';
  return null;
}

/** Pull the excess at the row's recorded argmax window. */
export function excessAtArgmax(row: CorpusCandidateRow): number | null {
  switch (row.windowDays) {
    case 1: return row.excessW1 ?? null;
    case 2: return row.excessW2 ?? null;
    case 3: return row.excessW3 ?? null;
    case 4: return row.excessW4 ?? null;
    case 5: return row.excessW5 ?? null;
    default: return null;
  }
}

/** SHORT geometry check — geometry sets from `SHORT_GEOMETRY_MATRIX`. */
export function passesShortGeometry(row: CorpusCandidateRow): boolean {
  if (row.momentumQuintile === null || row.drawdownBucket === null) return false;
  return (
    SHORT_GEOMETRY_MATRIX.windows.includes(row.windowDays) &&
    SHORT_GEOMETRY_MATRIX.momentumQuintiles.includes(row.momentumQuintile) &&
    SHORT_GEOMETRY_MATRIX.drawdownBuckets.includes(row.drawdownBucket)
  );
}

/** Build the CellKey for a SHORT row given its derived band. Mirror of
 *  `detector.ts:1053-1063` but keyed to the derived SHORT band. */
export function buildShortCellKey(row: CorpusCandidateRow, band: BandLabel): CellKey | null {
  if (row.momentumQuintile === null || row.drawdownBucket === null) return null;
  return {
    side: 'short',
    band,
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
  const preMul = input.preAdmitSlotMultiplierByTier ?? {};
  type Enriched = Candidate & {
    readonly __row: CorpusCandidateRow;
    readonly __tier: 'T1' | 'T2';
    readonly __entrySession: SessionDate;
    readonly __entryPrice: Price;
  };
  const candidates: Enriched[] = [];

  for (const row of input.corpusRows) {
    // Per-side derivation — LONG + SHORT branches share cell-lookup /
    // sizing / admit downstream.
    let tier: 'T1' | 'T2';
    let cellKey: CellKey;
    let recordedTier: 'T1' | 'T2';

    if (row.side === 'long') {
      const t = deriveLongTier(row);
      if (t === null) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
          reason: 'incomplete_cell_key',
          detail: 'momentum_quintile or drawdown_bucket is null' });
        continue;
      }
      const k = buildLongCellKey(row);
      if (k === null) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
          reason: 'incomplete_cell_key' });
        continue;
      }
      tier = t;
      recordedTier = t;
      cellKey = k;
    } else {
      // SHORT branch — G-1 tier convention + H-1 offset.
      if (row.momentumQuintile === null || row.drawdownBucket === null) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
          reason: 'incomplete_cell_key' });
        continue;
      }
      if (!passesShortGeometry(row)) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
          reason: 'short_geometry_out_of_set',
          detail: `w=${row.windowDays} mq=${row.momentumQuintile} dd=${row.drawdownBucket}` });
        continue;
      }
      const e = excessAtArgmax(row);
      if (e === null || !Number.isFinite(e)) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
          reason: 'short_excess_missing',
          detail: `windowDays=${row.windowDays}` });
        continue;
      }
      // Signed-excess admission threshold — `detector.ts:801`
      //   `const excessOk = picked.excess <= -excessThreshold;`
      if (!(e <= -SHORT_GEOMETRY_MATRIX.excessThreshold)) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
          reason: 'short_excess_below_threshold',
          detail: `signed_excess=${e} threshold=-${SHORT_GEOMETRY_MATRIX.excessThreshold}` });
        continue;
      }
      const band = shortBandFromSignedExcess(e);
      if (band === null) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
          reason: 'short_band_below_min', detail: `e=${e}` });
        continue;
      }
      const k = buildShortCellKey(row, band);
      if (k === null) {
        skips.push({ eventId: row.eventId, ticker: row.ticker, side: 'short',
          reason: 'incomplete_cell_key' });
        continue;
      }
      // G-1: record 'T2' by convention; kernel dispatch is identical.
      tier = SHORT_TIER_CONVENTION;
      recordedTier = SHORT_TIER_CONVENTION;
      cellKey = k;
    }

    const meanFwd = input.cellMap(cellKey);
    if (meanFwd === null || !Number.isFinite(meanFwd)) {
      skips.push({ eventId: row.eventId, ticker: row.ticker, side: row.side,
        reason: 'no_cell_map_hit', detail: JSON.stringify(cellKey) });
      continue;
    }

    const rankScore = rankScoreFromCell(row.side, meanFwd);

    const entrySession = input.sessionOffset(row.eventDate, entryOffsetForSideTier(row.side, tier));
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

    const mul = Math.max(1, Math.floor(preMul[recordedTier] ?? 1));
    const slotNotionalUsd = (sized.slotNotionalUsd as number) * mul;

    candidates.push({
      ticker: row.ticker,
      side: row.side,
      tier: recordedTier,
      rankScore,
      band: cellKey.band,
      slotNotionalUsd,
      __row: row, __tier: recordedTier, __entrySession: entrySession, __entryPrice: refPx,
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
      skips_short_geometry: skips.filter(s => s.reason === 'short_geometry_out_of_set').length,
      skips_short_excess_below: skips.filter(s => s.reason === 'short_excess_below_threshold').length,
      skips_short_excess_missing: skips.filter(s => s.reason === 'short_excess_missing').length,
      skips_short_band_below_min: skips.filter(s => s.reason === 'short_band_below_min').length,
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
  shortGeometry: SHORT_GEOMETRY_MATRIX,
  shortTierConvention: SHORT_TIER_CONVENTION,
  shortEntryOffset: SHORT_ENTRY_OFFSET_SESSIONS,
  cellExclusion: CELL_EXCLUSION_WIDTH_DAYS,
  priceCtor: price,
});
