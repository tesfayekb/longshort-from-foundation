// FP-069 W3.4.c (ACT-461.c) — overshoot live detector orchestration module.
//
// PURE MODULE. No DB, no network, no wall-clock, no `Deno.serve`, no `postgres`
// import. All inputs (candidate rows, SI rows, study-cell stats, shortability,
// as-of date, params) are injected. Wiring to live reads / persistence lives
// in the W3.5 edge function; this module is deterministic + fully unit-testable.
//
// Charter contract (P-B ratified priors + W3 additions — every branch is
// REFUSED-WITH-REASON, never silent-passed; a silent-drop is the DW-208
// anti-pattern this module exists to prevent):
//
//   LONG  filter: |excess_w| >= 0.10 for w in {1,2,3};
//                 momentum_quintile in {4,5};
//                 drawdown_bucket   in {1,2,3};
//                 exclusion_width   = +/-5d (days_to_nearest_earnings > 5).
//   SHORT filter: |excess_w| >=  0.08 for w in {1..5};
//                 momentum_quintile in {1,5};
//                 drawdown_bucket   in {4,5};
//                 exclusion_width   = +/-5d.
//
//   SI SQUEEZE GATE (SHORTS ONLY, UNCONDITIONAL — DEFAULT-DENY):
//     STALENESS PREDICATE: single-homed at `../si-freshness.ts`
//     (DEC-504-4, 2026-07-16). This module imports `isSiRowStale` from
//     that helper and MUST NOT redeclare the comparison — the canary
//     test at `../si-freshness_test.ts` fails the build if it does.
//     Required inputs: `squeezeSiPctFloatMin` (LEGACY NAME — see INC-106
//     ruling; the parameter now denotes the EXCLUSION THRESHOLD: candidates
//     with `si_pct_float >= squeezeSiPctFloatMin` are REFUSED as
//     `si_above_squeeze_threshold`. Ratified direction per DEC / R2 clause
//     at docs/08-planning/approved-decisions.md:852 (short-squeeze exclusion
//     — admit low-SI shorts, refuse crowded/high-SI names likely to squeeze).
//     Prior implementation had the comparison INVERTED (INC-106, filed
//     2026-07-15); this constitutes a defect against R2, not a parameter
//     re-tune. The THRESHOLD VALUE (currently 0.20) remains pending the
//     ACT-527 curve re-derivation; only the DIRECTION is fixed here.
//     R2's compound clauses (days-to-cover, 5d-return conditions) are
//     NOT-IMPLEMENTED gaps tracked separately — direction first, compound
//     fidelity later.) `siStalenessMaxDays` (named param — no hard default
//     baked here; caller MUST supply the operator-ratified value) and
//     derivation: SEC settles short
//     interest twice per calendar month at mid-month + month-end with a
//     roughly 8-business-day publication delay; a fresh row therefore lands
//     within ~15 calendar days of publication. `siStalenessMaxDays` >= 21
//     spans one full missed cycle plus a small grace; caller supplies the
//     ratified value. Missing SI row -> REFUSED `si_unavailable`; row present
//     but `(asOf - as_of_date) > siStalenessMaxDays` -> REFUSED `si_stale`;
//     `si_pct_float === null` -> REFUSED `si_unavailable` (typed absence, not
//     zero — never pass-through the DW-208 sentinel); `si_pct_float >=
//     squeezeSiPctFloatMin` -> REFUSED `si_above_squeeze_threshold`
//     (INC-106 direction fix; refusal-reason string renamed to reflect
//     the true admission direction).
//
//   RANK-SCORE LOOKUP (P-B#4):
//     study-cell mean_fwd_return_5d against `overshoot_study_cell_results` for
//     run 1888e113-f9b3-43f5-856c-d91666a3c121 (frozen at construction —
//     boot-assertion reuses the harness pattern in
//     `basis-fidelity_test.ts:277-294`). Candidate cell absent from the map
//     -> REFUSED `no_study_cell` with the exact cell key persisted. NEVER
//     defaulted to zero — the whole point of ranking-by-study is that the
//     study cell IS the source of truth; absence is a real signal.
//     rank_score = mean_fwd_return_5d * sideSign (LONG:+1, SHORT:-1) so
//     higher = better across both sides in a single sort.
//
//   SLOT-AWARE SELECTION:
//     Named parameters `capacityLong` + `capacityShort` (per-side; ACT-490
//     bifurcation — capacity is a deployment dial, NOT part of the versioned
//     predicate spec; see the demotion memo above DETECTOR_PREDICATE_SPEC_V2_JSON
//     below). Selection = rank_score DESC, |excess| DESC tiebreak, tier ASC
//     as final determinism scaffold. Unselected-but-qualified candidates
//     persist with `selected_for_entry = false` and
//     `filter_refusal_reason = 'capacity'` — the W4 console MUST see what
//     was passed over as well as what was taken.
//
//   LONG-SIDE SHORTABILITY RECORDING (P-B#5):
//     `shortability` lookup optional; result recorded on LONG events when
//     provided (typed-null otherwise). NEVER gates the LONG path.
//
//   CANDIDATE GROUPING:
//     Kernel emits one row per (ticker, side, window_days, alias_used). The
//     detector groups by (ticker, side) and picks the single row with maximum
//     |excess_w{window_days}| as the argmax window for that (ticker, side)
//     pair; the other rows are collapsed into `argmax_window_days` metadata
//     on the winning row. This mirrors the study's "per (ticker, side) event"
//     unit and matches the `overshoot_events` PK shape.
//
// Filter-pipeline ordering (each stage records `filter_passes[]` and, on
// first FAIL, sets `filter_refusal_reason`; downstream stages STILL execute
// so `filter_passes` is complete for observability, but `selected_for_entry`
// stays false and rank_score / study_cell_ref reflect what was reachable):
//
//   0. side-window-set              (excess column exists for this window)
//   1. excess-threshold             (LONG >= +0.10, SHORT <= -0.08)
//   2. momentum-quintile-in-set
//   3. drawdown-bucket-in-set
//   4. earnings-exclusion           (days_to_nearest_earnings > 5)
//   5. si-squeeze-gate              (SHORT only)
//   6. study-cell-lookup            (rank_score source)
//   7. capacity-slot                (post-rank, per-side)
//
// NAMING: filter identifiers are stable strings the W4 console + audit
// queries key on. Do NOT rename without a `filter_passes` schema
// migration.

// DEC-504-4 (2026-07-16): SI staleness predicate is single-homed at
// ../si-freshness.ts. Detector and sizing overlay MUST import from the
// same file — the canary test in `../si-freshness_test.ts` enforces this.
import { isSiRowStale } from '../si-freshness.ts';

export type Side = 'LONG' | 'SHORT';

export type RefusalReason =
  | 'excess_below_threshold'
  | 'window_out_of_set'
  | 'momentum_out_of_set'
  | 'drawdown_out_of_set'
  | 'exclusion_earnings_proximity'
  | 'si_unavailable'
  | 'si_stale'
  | 'si_above_squeeze_threshold'
  | 'no_study_cell'
  | 'capacity';

export interface KernelCandidateRow {
  run_id: string;
  ticker: string;
  event_date: string; // YYYY-MM-DD — for the live path, = as_of
  side: Side;
  move_pct: number;
  window_days: number; // 1..5
  excess_w1: number | null;
  excess_w2: number | null;
  excess_w3: number | null;
  excess_w4: number | null;
  excess_w5: number | null;
  momentum_quintile: number | null;
  drawdown_bucket: number | null;
  days_to_nearest_earnings: number | null;
  alias_used: string | null;
  // fwd_return_* are NOT read by the live detector (typed absence at as_of).
}

export interface ShortInterestRow {
  ticker: string;
  as_of_date: string; // report date (YYYY-MM-DD)
  si_pct_float: number | null;
  dtc: number | null;
}

export interface StudyCellKey {
  side: Side;
  band: string;             // e.g. '10pct_w3' — caller-canonicalized
  window_days: number;
  momentum_quintile: number;
  drawdown_bucket: number;
  exclusion_width_days: number;
}

export interface StudyCellStats {
  mean_fwd_return_5d: number | null;
  arrival_count: number;
}

export interface ShortabilityRecord {
  shortable: boolean | null;
  easy_to_borrow: boolean | null;
}

export interface FilterPassRecord {
  filter: string;
  passed: boolean;
  reason?: RefusalReason;
  detail?: Record<string, unknown>;
}

export interface DetectedEvent {
  run_id: string;
  as_of_date: string;
  ticker: string;
  side: Side;
  excess_w1: number | null;
  excess_w2: number | null;
  excess_w3: number | null;
  excess_w4: number | null;
  excess_w5: number | null;
  argmax_window_days: number | null;
  momentum_quintile: number | null;
  drawdown_bucket: number | null;
  days_to_nearest_earnings: number | null;
  earnings_alias_used: string | null;
  filter_passes: FilterPassRecord[];
  filter_refusal_reason: RefusalReason | null;
  selected_for_entry: boolean;
  rank_score: number | null;
  study_cell_ref: StudyCellKey | null;
  shortability: ShortabilityRecord | null;
  /**
   * FP-069 W3.8 T2.1 (ACT-479) — W5 attribution tag, NOT a priority class.
   * LONG cells tag `T1` (mean_fwd_return_5d ≥ LONG_T1_MEAN_FWD_RETURN_5D_MIN)
   * or `T2` (LONG_T2_MEAN_FWD_RETURN_5D_MIN ≤ mean < T1 threshold ∧
   * arrival_count ≥ 1 ∧ NOT T1). SHORT path: tier is ALWAYS null (SHORT
   * predicate byte-unchanged this tranche). Cells with mean below the T2
   * floor OR arrival_count < 1 refuse `no_study_cell` (never silent-pass,
   * never tier-assigned). Selection ordering is pure rank_score DESC,
   * |excess| DESC, tier ASC final tie-break only — tier does NOT bias
   * priority (ratified 2026-07-07: rank_score is the measured expected
   * return; tier-class-priority rejected as a conservatism clamp).
   */
  tier: 'T1' | 'T2' | null;
}

export interface DetectorParams {
  runId: string;
  asOf: string; // YYYY-MM-DD
  // ACT-490: per-side capacity, asymmetric. Ratified deployment values
  // LONG=36 / SHORT=4 bind provenance to the T3b sizing constants
  // OVERSHOOT_CAPACITY_LONG / OVERSHOOT_CAPACITY_SHORT in
  // `_shared/overshoot-execution/sizing.ts` — the invariant
  // `|selections| <= sleeve-slots per side` becomes structural, not
  // conditional. Deployment dial (see DETECTOR_PREDICATE_SPEC_V2_JSON
  // demotion memo below); NOT part of the versioned predicate spec.
  capacityLong: number;
  capacityShort: number;
  squeezeSiPctFloatMin: number;    // named param — no hard default
  siStalenessMaxDays: number;      // named param — see header derivation
  exclusionWidthDays: number;      // 5 per priors
  longExcessThreshold: number;     // 0.10
  shortExcessThreshold: number;    // 0.08 (compared to |excess|; sign check done separately)
  longWindowSet: readonly number[]; // {1,2,3}
  shortWindowSet: readonly number[]; // {1,2,3,4,5}
  longMomentumSet: readonly number[]; // {4,5}
  shortMomentumSet: readonly number[]; // {1,5}
  longDrawdownSet: readonly number[]; // {1,2,3}
  shortDrawdownSet: readonly number[]; // {4,5}
  // Signature ratified 2026-07-04 (W3.5.c defect-fix): classifier keys on
  // the SIGNED excess at the argmax window so the magnitude-bin label
  // (L_03_04..L_10_INF / S_03_04..S_10_INF) matches the study-side band
  // namespace verbatim. `windowDays` retained for provenance / debug and to
  // keep the study cell PK match window-consistent with the argmax pick.
  bandLabelFor: (side: Side, windowDays: number, excessAtArgmax: number) => string;
  studyCellLookup: (key: StudyCellKey) => StudyCellStats | null;
  shortabilityLookup?: (ticker: string) => ShortabilityRecord | null;
}

export interface DetectorInput {
  candidates: readonly KernelCandidateRow[];
  shortInterest: ReadonlyMap<string, ShortInterestRow>; // key: ticker (upper-case)
  params: DetectorParams;
}

/** Days between two YYYY-MM-DD dates, UTC midnight, integer. */
function calendarDaysBetween(aIso: string, bIso: string): number {
  const a = Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10));
  const b = Date.UTC(+bIso.slice(0, 4), +bIso.slice(5, 7) - 1, +bIso.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

function excessForWindow(row: KernelCandidateRow, w: number): number | null {
  switch (w) {
    case 1: return row.excess_w1;
    case 2: return row.excess_w2;
    case 3: return row.excess_w3;
    case 4: return row.excess_w4;
    case 5: return row.excess_w5;
    default: return null;
  }
}

/**
 * Group kernel rows by (ticker, side); within each group pick the row whose
 * `window_days` is in the side's allowed set AND has the maximum |excess|
 * for that window. Groups with no candidate matching any allowed window
 * still produce a synthetic "argmax" row (the raw max by |excess| across
 * whatever windows are present) so the per-(ticker,side) refusal is
 * observable in the output rather than silently dropped.
 */
function pickArgmaxRow(
  group: readonly KernelCandidateRow[],
  allowedWindows: readonly number[],
): { row: KernelCandidateRow; excess: number; windowInSet: boolean } {
  let best: { row: KernelCandidateRow; excess: number; windowInSet: boolean } | null = null;
  for (const r of group) {
    const ex = excessForWindow(r, r.window_days);
    if (ex === null) continue;
    const abs = Math.abs(ex);
    const inSet = allowedWindows.includes(r.window_days);
    if (
      best === null ||
      (inSet && !best.windowInSet) ||
      (inSet === best.windowInSet && abs > Math.abs(best.excess))
    ) {
      best = { row: r, excess: ex, windowInSet: inSet };
    }
  }
  if (best === null) {
    // Fall back to the first row — pipeline will refuse at window/excess stage.
    return { row: group[0]!, excess: 0, windowInSet: false };
  }
  return best;
}

/**
 * Assert the study-cell provenance is the ratified run before ANY selection
 * runs. Reuses the harness pattern (basis-fidelity_test.ts:277-294) — a
 * mutated provenance invalidates every rank_score below.
 */
export const RATIFIED_STUDY_RUN_ID =
  '1888e113-f9b3-43f5-856c-d91666a3c121' as const;
export const RATIFIED_PARAM_GRID_HASH_PREFIX = 'a37e4b96' as const;

export interface StudyProvenanceAttestation {
  run_id: string;
  param_grid_hash: string;
}

export function assertStudyProvenance(a: StudyProvenanceAttestation): void {
  if (a.run_id !== RATIFIED_STUDY_RUN_ID) {
    throw new Error(
      `study_provenance_mismatch: run_id=${a.run_id} expected=${RATIFIED_STUDY_RUN_ID}`,
    );
  }
  if (!a.param_grid_hash.startsWith(RATIFIED_PARAM_GRID_HASH_PREFIX)) {
    throw new Error(
      `study_provenance_mismatch: param_grid_hash=${a.param_grid_hash} expected_prefix=${RATIFIED_PARAM_GRID_HASH_PREFIX}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FP-069 W3.8 T2.1b (ACT-479 — DRIFT correction) — GRID-WIDE tiered admission
// ═══════════════════════════════════════════════════════════════════════
//
// DRIFT DISPOSITION (2026-07-07): the T2.1 landing (v2 prefix 723c2d25)
// kept the LONG excess/momentum/drawdown/window gates BEFORE cell lookup,
// which reduced T2 to a mean-partition within T1 geometry — vanishingly
// small admission delta. The ratified frontier (ACT-470 Part I:
// 491 T2 LONG cells / 261,830 events; ACT-471: T1∪T2 ≈ 106 LONG
// arrivals/day; ACT-474 pointer verbatim: "T2 predicate as an exact
// deterministic view over ratified study cells — mean_fwd_return_5d ≥
// 0.0010 — reproduces Part I 491 cells / 261,830 events exactly") requires
// grid-wide cell-mean-governed admission. T2.1b corrects the semantics.
//
// Ratified 2026-07-07 (operator STEP-A + T2.1b reconciliation):
//   (a) v2 = detector-versioning via RATIFIED_DETECTOR_VERSION constant
//       (sha256(study_full_hash ‖ canonical predicate_spec_json), first 8
//       hex, ASCII '||' separator). RATIFIED_STUDY_RUN_ID and
//       RATIFIED_PARAM_GRID_HASH_PREFIX remain UNTOUCHED and boot-asserted
//       forever — the study kernel is unchanged. Nothing binds v2 yet;
//       T2.1b revises the v2 hash in-tranche (noted in
//       DETECTOR_VERSION_HISTORY[v2].rationale).
//   (b) Selection ordering: pure rank_score DESC, |excess| DESC (operator
//       ROI directive — rank_score is the measured expected return;
//       tier-class-priority rejected). `tier ASC` is the FINAL tie-break
//       only — determinism scaffolding, not priority.
//   (c) A higher-mean T2 cell DOES outrank a lower-mean T1 cell — the
//       admission gate is per-cell; the ranking gate is per-mean.
//   (d) Uniform ROI floor (SUPERVISOR LEAN, adopted): mean_fwd_return_5d
//       ≥ 0.0010 applies grid-wide, INCLUDING T1-geometry cells. Cells
//       below the floor refuse `no_study_cell` regardless of geometry —
//       trading cells measured below 2× costs is ROI-negative independent
//       of band/window/mq/dd classification. Explicit behavior delta vs
//       v1 (which admitted any non-null-mean LONG cell); the delta is
//       recorded as its own line in DETECTOR_VERSION_HISTORY[v2].
//
// LONG_T1_GEOMETRY(cellKey) ≡ side='LONG'
//                              ∧ band ∈ {'L_10_INF'}
//                              ∧ window_days ∈ {1,2,3}
//                              ∧ momentum_quintile ∈ {4,5}
//                              ∧ drawdown_bucket ∈ {1,2,3}
//
// LONG admission (T2.1b):
//   (1) Universe: kernel |move_pct| ≥ 3% (upstream, unchanged).
//   (2) Event-level gates: earnings-exclusion ±5d.
//   (3) Cell resolution: (band, window_days, momentum_quintile,
//       drawdown_bucket, exclusion_width_days) → cell.
//   (4) Cell gate: mean_fwd_return_5d ≥ 0.0010 ∧ arrival_count ≥ 1;
//       otherwise REFUSED `no_study_cell`.
//   (5) Tier tagging: T1 iff LONG_T1_GEOMETRY(cellKey); else T2.
//
// LONG events OUTSIDE T1 geometry are NO LONGER refused at
// excess/momentum/drawdown/window stages — they proceed to cell lookup and
// live or die on the ROI floor. Those stages become informational
// pass-records (`filter: 'long-tier-classifier'`) that document tier
// classification, never refuse. SHORT is byte-unchanged from v1.
//
// The 2026-06-18 anchor: 3 LONG selections were all `L_10_INF`/w∈{1,2}/
// mq=5/dd∈{1,2} cells with means well above 0.0010 → all remain T1 under
// v2b (anchor preserved by construction; the added T2 admissions are
// incremental, not displacing).
//
// SHORT path is BYTE-UNCHANGED this tranche: no T2 admission, no tier
// tagging (tier remains null on every SHORT event), no mean-return floor
// change. The SHORT rank_score formula `mean_fwd_return_5d * -1` is
// preserved verbatim; the SHORT selection set is preserved verbatim;
// every SHORT filter stage (window-set, excess-threshold, momentum,
// drawdown, earnings-exclusion, si-squeeze-gate) executes identically to
// v1 code.

/** Grid-wide ROI floor — applies to every LONG tier (T1 + T2). */
export const LONG_ROI_MEAN_FWD_RETURN_5D_MIN = 0.0010 as const;
export const LONG_TIER_ARRIVAL_COUNT_MIN = 1 as const;

/** T1 GEOMETRY — the ratified geometric envelope; cells inside are T1. */
export const LONG_T1_GEOMETRY = {
  bands: ['L_10_INF'] as const,
  windows: [1, 2, 3] as const,
  momentum_quintiles: [4, 5] as const,
  drawdown_buckets: [1, 2, 3] as const,
} as const;

/**
 * Geometry-only predicate — reads the cell KEY, not the cell stats. T1
 * cells with mean below the ROI floor still fail the uniform-floor gate
 * (see (d) above) — geometry is the tier tag, ROI floor is the admission
 * gate.
 */
export function isLongT1Geometry(cellKey: StudyCellKey): boolean {
  return (
    cellKey.side === 'LONG' &&
    (LONG_T1_GEOMETRY.bands as readonly string[]).includes(cellKey.band) &&
    (LONG_T1_GEOMETRY.windows as readonly number[]).includes(cellKey.window_days) &&
    (LONG_T1_GEOMETRY.momentum_quintiles as readonly number[]).includes(cellKey.momentum_quintile) &&
    (LONG_T1_GEOMETRY.drawdown_buckets as readonly number[]).includes(cellKey.drawdown_bucket)
  );
}

/** Minimal shape the LONG ROI-floor gate reads — subset of `StudyCellStats`. */
export interface CellForTierEval {
  mean_fwd_return_5d: number | null;
  arrival_count: number;
}

/**
 * LONG admission gate — uniform ROI floor + arrival-count floor. Applies
 * grid-wide to BOTH tiers (T1 and T2). Cells below floor refuse
 * `no_study_cell`, regardless of geometry.
 */
export function LONG_ADMISSIBLE(cell: CellForTierEval): boolean {
  return (
    cell.mean_fwd_return_5d !== null &&
    cell.mean_fwd_return_5d >= LONG_ROI_MEAN_FWD_RETURN_5D_MIN &&
    cell.arrival_count >= LONG_TIER_ARRIVAL_COUNT_MIN
  );
}

// Canonical predicate-spec JSON — the versioned artifact. Byte-exact
// strings; DO NOT reformat (whitespace / key order changes the hash). The
// two spec strings + STUDY_FULL_HASH + '||' separator produce the version
// prefixes below (sha256 first 8 hex). Recomputed from source at boot in
// the T2.4 sub-tranche's new assertion; frozen here for audit.
//
// STUDY_FULL_HASH = 'a37e4b963c0ff13f0962e231b6322d11f1210df44812cdd24dcf06e66f354e80'
// (full `overshoot_study_runs.param_grid_hash` for RATIFIED_STUDY_RUN_ID;
// UNTOUCHED, boot-asserted separately via RATIFIED_PARAM_GRID_HASH_PREFIX.)
//
// ── ACT-490 DEMOTION MEMO (deployment-dial ruling) ──────────────────────
// The V2 spec JSON below contains `selection.capacity_per_side_default: 20`.
// Per ACT-490 (INC-92 resolution), that field is HISTORICAL and
// NON-AUTHORITATIVE — selection capacity is a DEPLOYMENT DIAL passed by
// the handler at runtime via `capacityLong` / `capacityShort` on
// DetectorParams, not part of the versioned predicate.
//
// Rationale: the RATIFIED_DETECTOR_VERSION hash exists to protect SELECTION
// SEMANTICS — the deterministic function mapping (candidates, SI, study
// cells) → (qualified set, rank order). A cap change is a top-N cut applied
// AFTER semantics resolve; it relabels tail rows between selected and
// capacity-refused without touching the ranking function. Two runs at
// cap=20 vs cap=36 on identical inputs produce identical `selected_for_entry`
// sets for the first 20 rows and diverge only in whether rows 21..36 are
// selected vs capacity-refused. Alpha function unchanged.
//
// Consequence (ACT-490 era): the V2 spec string stayed BYTE-FROZEN for
// hash stability, RATIFIED_DETECTOR_VERSION stayed `b7cdfcd8`.
// The `capacity_per_side_default: 20` field is treated as a documented
// historical default only. A future V3 spec bump (unrelated to ACT-490)
// SHOULD drop the field entirely.
//
// ── INC-106 SPEC-TRUTH CORRECTION (2026-07-15) ──────────────────────────
// The prior "SHORT byte_unchanged_from_v1:true" claim was falsified by the
// INC-106 direction-flip landing: the SHORT squeeze gate is no longer a
// v1-clone. The V2 spec JSON below therefore now describes the flipped
// gate truthfully (byte_unchanged_from_v1:false + inc_106_direction_flip
// block citing R2 / approved-decisions.md:852, refusal reason
// `si_above_squeeze_threshold`, threshold value 0.20 pending ACT-527).
// Self-describing-artifact discipline (catalog-class): a detector
// byte-change updates code + spec JSON + spec sha + version pin + parity
// fixtures in ONE commit.

export const DETECTOR_PREDICATE_SPEC_V1_JSON =
  '{"version":"v1","long":{"excess_min":0.10,"windows":[1,2,3],"momentum":[4,5],"drawdown":[1,2,3],"earnings_exclusion_days":5,"tiers":{"T1":{"mean_fwd_return_5d_min":0.0020,"arrival_count_min":1}}},"selection":{"ordering":["rank_score_desc","abs_excess_desc"],"capacity_per_side_default":20},"short":{"excess_min":0.08,"windows":[1,2,3,4,5],"momentum":[1,5],"drawdown":[4,5],"earnings_exclusion_days":5,"si_squeeze":{"si_pct_float_min":"param","si_staleness_max_days":"param","default_deny_on_missing":true}}}' as const;

export const DETECTOR_PREDICATE_SPEC_V2_JSON =
  '{"version":"v2","long":{"universe":"kernel_move_pct_min_3pct","event_gates":["earnings_exclusion_5d"],"admission":"study_cell_membership","tiers":{"T1":{"geometry":{"bands":["L_10_INF"],"windows":[1,2,3],"momentum_quintiles":[4,5],"drawdown_buckets":[1,2,3]},"cell_gate":{"mean_fwd_return_5d_min":0.0010,"arrival_count_min":1}},"T2":{"geometry":"complement_of_T1_within_long_study_grid","cell_gate":{"mean_fwd_return_5d_min":0.0010,"arrival_count_min":1},"disjoint_from":"T1"}},"uniform_roi_floor":{"mean_fwd_return_5d_min":0.0010,"scope":"all_long_tiers","behavior_delta_vs_v1":"v1_admitted_any_non_null_mean; v2b_refuses_below_floor_including_t1_geometry"}},"selection":{"ordering":["rank_score_desc","abs_excess_desc","tier_asc"],"capacity_per_side_default":20,"tier_role":"w5_attribution_tag_not_priority_class"},"short":{"byte_unchanged_from_v1":false,"inc_106_direction_flip":{"act_ref":"INC-106","ratification":"approved-decisions.md:852 (R2)","comparison":"si_pct_float < squeezeSiPctFloatMin admits; si_pct_float >= squeezeSiPctFloatMin refuses as si_above_squeeze_threshold","refusal_reason":"si_above_squeeze_threshold","threshold_value":0.20,"threshold_status":"pending_ACT-527_curve"},"excess_min":0.08,"windows":[1,2,3,4,5],"momentum":[1,5],"drawdown":[4,5],"earnings_exclusion_days":5,"si_squeeze":{"si_pct_float_min":"param","si_staleness_max_days":"param","default_deny_on_missing":true}}}' as const;

/**
 * Currently-ratified detector version prefix (sha256(study_full_hash ‖
 * DETECTOR_PREDICATE_SPEC_V2_JSON), first 8 hex, ASCII '||' separator).
 * Frozen; not recomputed at runtime this tranche. Consumers begin
 * asserting this in T2.4 (additive; no v1 removal, no boot-broken window).
 */
// INC-106 (2026-07-15): direction fix bump. Prefix derived from
//   sha256('b7cdfcd8||INC-106-direction-flip-v2b')[0:8] = a026dc51.
// This derivation intentionally does NOT re-hash the composite
// (study_full_hash || DETECTOR_PREDICATE_SPEC_V2_JSON): the V2 spec
// JSON itself was updated in the same commit to describe the flipped
// gate truthfully (byte_unchanged_from_v1:false + inc_106_direction_flip
// block), so the T2.1b composite-derivation invariant is retired in
// favor of the INC-106 anchor above. Predicate semantics changed
// structurally (squeeze gate flipped to exclusion direction, refusal
// reason renamed) — recomputed prefix makes the change surface via
// the boot-assertion + dry-run envelope echo (INC-84 §5). ACT-527
// curve verdict may re-bump when the threshold VALUE is re-derived.
export const RATIFIED_DETECTOR_VERSION = 'a026dc51' as const;

export interface DetectorVersionHistoryEntry {
  version: 'v1' | 'v2';
  prefix: string;
  predicate_spec_json: string;
  rationale: string;
  act_ref: string;
  ratification_date: string;
}

/**
 * DETECTOR_VERSION_HISTORY — audit tuple; v1 preserved forever with
 * rationale, v2 recorded with ACT-479 provenance. Renamed from the
 * STEP-A-proposed `SUPERSEDED_HASHES` per operator ratification (a):
 * v1 is not "superseded" (study unchanged, boot assertions untouched);
 * v1 is retroactively canonicalized and v2 extends the admission set.
 */
export const DETECTOR_VERSION_HISTORY: readonly DetectorVersionHistoryEntry[] = [
  {
    version: 'v1',
    prefix: '34371220',
    predicate_spec_json: DETECTOR_PREDICATE_SPEC_V1_JSON,
    rationale:
      'Retroactive canonicalization of the T1-only prior at commit of ACT-479. ' +
      'Captures the pre-T2 predicate surface: LONG admission with mean_fwd_return_5d >= 0.0020 ' +
      '(2x the T2 haircut floor), arrival_count >= 1; SHORT unchanged. Selection ordering: ' +
      'rank_score DESC, |excess| DESC (no tier tie-break). No hash existed pre-ACT-479; this ' +
      'entry documents the shipped behavior surface for audit continuity.',
    act_ref: 'pre-ACT-479 (retroactive)',
    ratification_date: '2026-07-07',
  },
  {
    version: 'v2',
    prefix: RATIFIED_DETECTOR_VERSION,
    predicate_spec_json: DETECTOR_PREDICATE_SPEC_V2_JSON,
    rationale:
      'FP-069 W3.8 T2.1b (DRIFT-CORRECTED) grid-wide detector-prior extension. ' +
      'IN-TRANCHE REVISION of the T2.1 v2 landing (superseded prefix 723c2d25 — never bound; ' +
      'nothing deployed). DRIFT: T2.1 kept LONG excess/momentum/drawdown/window gates BEFORE ' +
      'cell lookup, reducing T2 to a mean-partition within T1 geometry (~zero incremental ' +
      'arrivals) — incompatible with the ACT-470 Part I ratified frontier (491 T2 LONG cells / ' +
      '261,830 events) and ACT-471 ~106/day charter figure. T2.1b corrects: LONG admission is ' +
      'now CELL-SET MEMBERSHIP over the full study grid. Tier T1 = LONG_T1_GEOMETRY ' +
      '(band=L_10_INF ∧ w∈{1,2,3} ∧ mq∈{4,5} ∧ dd∈{1,2,3}) — pure geometry. Tier T2 = any ' +
      'non-T1-geometry LONG study cell passing the uniform ROI floor. ' +
      'BEHAVIOR DELTA vs v1 (recorded per operator design-question ruling): uniform ROI floor ' +
      'mean_fwd_return_5d >= 0.0010 applies grid-wide INCLUDING T1-geometry cells. v1 admitted ' +
      'any non-null-mean LONG cell; v2b refuses below-floor cells regardless of geometry — ' +
      'trading cells below 2x costs is ROI-negative independent of geometry. LONG events ' +
      'outside T1 geometry no longer refuse at excess/momentum/drawdown stages — they proceed ' +
      'to cell lookup and admit as T2 if their cell meets the ROI floor. Event-level gates ' +
      'that REMAIN for all LONG tiers: kernel |move_pct|>=3% universe, earnings-exclusion ' +
      '+/-5d. Selection ordering unchanged from T2.1 ratification: pure rank_score DESC, ' +
      '|excess| DESC, tier ASC final-tie-break-only (W5 attribution tag, NOT priority class). ' +
      'SHORT path BYTE-UNCHANGED from v1 (all filter stages executed identically; tier=null on ' +
      'every SHORT event). Study run + kernel + param_grid_hash UNTOUCHED; ' +
      'RATIFIED_STUDY_RUN_ID and RATIFIED_PARAM_GRID_HASH_PREFIX remain boot-asserted.',
    act_ref: 'ACT-479',
    ratification_date: '2026-07-07',
  },
] as const;

export function runDetector(input: DetectorInput): DetectedEvent[] {
  const { candidates, shortInterest, params } = input;

  // ─── Group by (ticker, side) ──────────────────────────────────────
  const groups = new Map<string, KernelCandidateRow[]>();
  for (const c of candidates) {
    const k = `${c.ticker}|${c.side}`;
    let arr = groups.get(k);
    if (arr === undefined) { arr = []; groups.set(k, arr); }
    arr.push(c);
  }

  const evaluated: DetectedEvent[] = [];

  for (const [, group] of groups) {
    const side = group[0].side;
    // T2.1b: LONG admits ALL kernel windows {1..5} — window is a cell-key
    // input, not a gate. SHORT window-set is byte-unchanged from v1.
    const allowedWindows: readonly number[] =
      side === 'LONG' ? [1, 2, 3, 4, 5] : params.shortWindowSet;
    const allowedMomentum =
      side === 'LONG' ? params.longMomentumSet : params.shortMomentumSet;
    const allowedDrawdown =
      side === 'LONG' ? params.longDrawdownSet : params.shortDrawdownSet;
    const excessThreshold =
      side === 'LONG' ? params.longExcessThreshold : params.shortExcessThreshold;

    const picked = pickArgmaxRow(group, allowedWindows);
    const row = picked.row;

    const passes: FilterPassRecord[] = [];
    let firstRefusal: RefusalReason | null = null;
    const setRefusal = (r: RefusalReason) => { if (firstRefusal === null) firstRefusal = r; };

    // ─── Stages 0-3: SHORT keeps v1 geometry gates; LONG converts them
    // to informational classifier records (T2.1b DRIFT correction).
    if (side === 'SHORT') {
      // 0. side-window-set — SHORT byte-unchanged.
      passes.push({
        filter: 'side-window-set',
        passed: picked.windowInSet,
        ...(picked.windowInSet ? {} : {
          reason: 'window_out_of_set' as const,
          detail: { window_days: row.window_days, allowed: [...allowedWindows] },
        }),
      });
      if (!picked.windowInSet) setRefusal('window_out_of_set');

      // 1. excess-threshold — SHORT byte-unchanged.
      const excessOk = picked.excess <= -excessThreshold;
      passes.push({
        filter: 'excess-threshold',
        passed: excessOk,
        ...(excessOk ? {} : {
          reason: 'excess_below_threshold' as const,
          detail: { excess: picked.excess, threshold: excessThreshold, side },
        }),
      });
      if (!excessOk) setRefusal('excess_below_threshold');

      // 2. momentum — SHORT byte-unchanged.
      const momOk = row.momentum_quintile !== null && allowedMomentum.includes(row.momentum_quintile);
      passes.push({
        filter: 'momentum-quintile-in-set',
        passed: momOk,
        ...(momOk ? {} : {
          reason: 'momentum_out_of_set' as const,
          detail: { momentum_quintile: row.momentum_quintile, allowed: [...allowedMomentum] },
        }),
      });
      if (!momOk) setRefusal('momentum_out_of_set');

      // 3. drawdown — SHORT byte-unchanged.
      const ddOk = row.drawdown_bucket !== null && allowedDrawdown.includes(row.drawdown_bucket);
      passes.push({
        filter: 'drawdown-bucket-in-set',
        passed: ddOk,
        ...(ddOk ? {} : {
          reason: 'drawdown_out_of_set' as const,
          detail: { drawdown_bucket: row.drawdown_bucket, allowed: [...allowedDrawdown] },
        }),
      });
      if (!ddOk) setRefusal('drawdown_out_of_set');
    } else {
      // LONG (T2.1b): geometry becomes a cell-key input; excess /
      // momentum / drawdown / window are NOT gates. Emit a single
      // classifier pass-record for observability continuity — the W4
      // console + audit queries can still inspect which stage-shape
      // each event would have classified into.
      const _t1GeomWindow = (LONG_T1_GEOMETRY.windows as readonly number[]).includes(row.window_days);
      const _t1GeomMom = row.momentum_quintile !== null && (LONG_T1_GEOMETRY.momentum_quintiles as readonly number[]).includes(row.momentum_quintile);
      const _t1GeomDd = row.drawdown_bucket !== null && (LONG_T1_GEOMETRY.drawdown_buckets as readonly number[]).includes(row.drawdown_bucket);
      const _excessAbove10 = picked.excess >= excessThreshold;
      passes.push({
        filter: 'long-tier-classifier',
        passed: true,
        detail: {
          note: 'T2.1b: LONG geometry classified at cell lookup; excess/momentum/drawdown/window are cell-key inputs, not gates',
          t1_geometry_window: _t1GeomWindow,
          t1_geometry_momentum: _t1GeomMom,
          t1_geometry_drawdown: _t1GeomDd,
          excess_at_or_above_v1_threshold: _excessAbove10,
          picked_window_days: row.window_days,
          picked_excess: picked.excess,
        },
      });
    }

    // 4. earnings-exclusion
    const dte = row.days_to_nearest_earnings;
    const exclOk = dte !== null && Math.abs(dte) > params.exclusionWidthDays;
    passes.push({
      filter: 'earnings-exclusion',
      passed: exclOk,
      ...(exclOk ? {} : {
        reason: 'exclusion_earnings_proximity' as const,
        detail: { days_to_nearest_earnings: dte, exclusion_width_days: params.exclusionWidthDays },
      }),
    });
    if (!exclOk) setRefusal('exclusion_earnings_proximity');

    // 5. si-squeeze-gate — SHORTS ONLY. DEFAULT-DENY on missing/stale.
    if (side === 'SHORT') {
      const si = shortInterest.get(row.ticker);
      if (si === undefined) {
        passes.push({
          filter: 'si-squeeze-gate',
          passed: false,
          reason: 'si_unavailable',
          detail: { ticker: row.ticker },
        });
        setRefusal('si_unavailable');
      } else {
        // DEC-504-4 single-home: staleness comparison lives in
        // ../si-freshness.ts (isSiRowStale). Do NOT re-inline the
        // predicate here — the canary test will fail the build.
        const stale = isSiRowStale(params.asOf, si.as_of_date, params.siStalenessMaxDays);
        if (stale) {
          passes.push({
            filter: 'si-squeeze-gate',
            passed: false,
            reason: 'si_stale',
            detail: {
              si_as_of_date: si.as_of_date,
              asOf: params.asOf,
              staleness_max_days: params.siStalenessMaxDays,
            },
          });
          setRefusal('si_stale');
        } else if (si.si_pct_float === null) {
          passes.push({
            filter: 'si-squeeze-gate',
            passed: false,
            reason: 'si_unavailable',
            detail: { ticker: row.ticker, reason: 'si_pct_float_typed_null' },
          });
          setRefusal('si_unavailable');
        } else {
          // INC-106 direction fix (2026-07-15): admit LOW-SI shorts;
          // refuse crowded/high-SI names per ratified R2 exclusion
          // semantics (docs/08-planning/approved-decisions.md:852).
          // Threshold VALUE (params.squeezeSiPctFloatMin, currently 0.20)
          // is a re-derivation candidate under ACT-527; the DIRECTION is
          // ratified.
          const ok = si.si_pct_float < params.squeezeSiPctFloatMin;
          passes.push({
            filter: 'si-squeeze-gate',
            passed: ok,
            ...(ok ? {} : {
              reason: 'si_above_squeeze_threshold' as const,
              detail: {
                si_pct_float: si.si_pct_float,
                threshold: params.squeezeSiPctFloatMin,
              },
            }),
          });
          if (!ok) setRefusal('si_above_squeeze_threshold');
        }
      }
    }

    // 6. study-cell-lookup — rank_score source.
    let rank_score: number | null = null;
    let study_cell_ref: StudyCellKey | null = null;
    let tier: 'T1' | 'T2' | null = null;
    // T2.1b: LONG treats momentum/drawdown/window as cell-key inputs. A
    // typed-null momentum or drawdown_bucket still cannot form a valid
    // cell key (cell rows are keyed on those columns) — refuse
    // observably. `picked.windowInSet` is always true for LONG (all
    // windows admissible) so it collapses to non-null checks; for SHORT
    // it retains its v1 meaning.
    const cellKeyable =
      row.momentum_quintile !== null &&
      row.drawdown_bucket !== null &&
      picked.windowInSet;
    if (cellKeyable) {
      const key: StudyCellKey = {
        side,
        band: params.bandLabelFor(side, row.window_days, picked.excess),
        window_days: row.window_days,
        momentum_quintile: row.momentum_quintile!,
        drawdown_bucket: row.drawdown_bucket!,
        exclusion_width_days: params.exclusionWidthDays,
      };
      const cell = params.studyCellLookup(key);
      if (cell === null || cell.mean_fwd_return_5d === null) {
        passes.push({
          filter: 'study-cell-lookup',
          passed: false,
          reason: 'no_study_cell',
          detail: { cell_key: key },
        });
        setRefusal('no_study_cell');
      } else if (side === 'LONG') {
        // FP-069 W3.8 T2.1b (ACT-479 DRIFT correction) — grid-wide LONG
        // admission. Uniform ROI floor gate + geometry-based tier tag.
        if (LONG_ADMISSIBLE(cell)) {
          tier = isLongT1Geometry(key) ? 'T1' : 'T2';
          rank_score = cell.mean_fwd_return_5d;
          study_cell_ref = key;
          passes.push({
            filter: 'study-cell-lookup',
            passed: true,
            detail: {
              arrival_count: cell.arrival_count,
              tier,
              mean_fwd_return_5d: cell.mean_fwd_return_5d,
            },
          });
        } else {
          passes.push({
            filter: 'study-cell-lookup',
            passed: false,
            reason: 'no_study_cell',
            detail: {
              cell_key: key,
              mean_fwd_return_5d: cell.mean_fwd_return_5d,
              arrival_count: cell.arrival_count,
              reason: 'below_long_uniform_roi_floor_or_arrival_count',
              long_roi_mean_fwd_return_5d_min: LONG_ROI_MEAN_FWD_RETURN_5D_MIN,
              long_tier_arrival_count_min: LONG_TIER_ARRIVAL_COUNT_MIN,
            },
          });
          setRefusal('no_study_cell');
        }
      } else {
        // SHORT path — BYTE-UNCHANGED (no tier, no mean-return floor).
        rank_score = cell.mean_fwd_return_5d * -1;
        study_cell_ref = key;
        passes.push({
          filter: 'study-cell-lookup',
          passed: true,
          detail: { arrival_count: cell.arrival_count },
        });
      }
    } else {
      passes.push({
        filter: 'study-cell-lookup',
        passed: false,
        reason: 'no_study_cell',
        detail: { reason: 'ungrouped_cell_inputs' },
      });
      setRefusal('no_study_cell');
    }

    // Shortability recording (LONG only; NEVER gating).
    const shortability =
      side === 'LONG' && params.shortabilityLookup !== undefined
        ? params.shortabilityLookup(row.ticker)
        : null;

    evaluated.push({
      run_id: params.runId,
      as_of_date: params.asOf,
      ticker: row.ticker,
      side,
      excess_w1: row.excess_w1,
      excess_w2: row.excess_w2,
      excess_w3: row.excess_w3,
      excess_w4: row.excess_w4,
      excess_w5: row.excess_w5,
      argmax_window_days: picked.windowInSet ? row.window_days : null,
      momentum_quintile: row.momentum_quintile,
      drawdown_bucket: row.drawdown_bucket,
      days_to_nearest_earnings: row.days_to_nearest_earnings,
      earnings_alias_used: row.alias_used,
      filter_passes: passes,
      filter_refusal_reason: firstRefusal,
      selected_for_entry: false,
      rank_score,
      study_cell_ref,
      shortability,
      tier,
    });
  }

  // ─── 7. Capacity-slot selection — per side ────────────────────────────
  // Ordering (ratified 2026-07-07): rank_score DESC (measured expected
  // return — the ROI signal), |excess| DESC (magnitude tiebreak), then
  // `tier ASC` as FINAL determinism scaffold only (T1 before T2 when the
  // first two keys are EXACT ties). Tier is a W5 attribution tag, NOT a
  // priority class: a higher-mean T2 cell WILL outrank a lower-mean T1
  // cell — that is the whole point of admitting T2 at the ROI floor.
  // SHORT events always have tier=null; tier tie-break degenerates to
  // no-op on SHORT (both compared values are null → 0).
  for (const side of ['LONG', 'SHORT'] as const) {
    const qualified = evaluated
      .filter((e) => e.side === side && e.filter_refusal_reason === null && e.rank_score !== null)
      .sort((a, b) => {
        const rs = (b.rank_score as number) - (a.rank_score as number);
        if (rs !== 0) return rs;
        const aEx = Math.max(
          Math.abs(a.excess_w1 ?? 0), Math.abs(a.excess_w2 ?? 0), Math.abs(a.excess_w3 ?? 0),
          Math.abs(a.excess_w4 ?? 0), Math.abs(a.excess_w5 ?? 0),
        );
        const bEx = Math.max(
          Math.abs(b.excess_w1 ?? 0), Math.abs(b.excess_w2 ?? 0), Math.abs(b.excess_w3 ?? 0),
          Math.abs(b.excess_w4 ?? 0), Math.abs(b.excess_w5 ?? 0),
        );
        const exDiff = bEx - aEx;
        if (exDiff !== 0) return exDiff;
        // Final tie-break only: tier ASC (T1=0, T2=1, null=2). Determinism
        // scaffolding — NOT priority. See ordering comment above.
        const tierRank = (t: 'T1' | 'T2' | null): number =>
          t === 'T1' ? 0 : t === 'T2' ? 1 : 2;
        return tierRank(a.tier) - tierRank(b.tier);
      });
    // ACT-490: per-side capacity resolution (deployment dial). LONG and
    // SHORT are independently bounded so `|selections| <= sleeve-slots per
    // side` holds structurally, not conditionally on SI availability.
    const capacity = side === 'LONG' ? params.capacityLong : params.capacityShort;
    for (let i = 0; i < qualified.length; i++) {
      if (i < capacity) {
        qualified[i].selected_for_entry = true;
        qualified[i].filter_passes.push({
          filter: 'capacity-slot',
          passed: true,
          detail: { rank: i + 1, capacity },
        });
      } else {
        qualified[i].filter_refusal_reason = 'capacity';
        qualified[i].filter_passes.push({
          filter: 'capacity-slot',
          passed: false,
          reason: 'capacity',
          detail: { rank: i + 1, capacity, side },
        });
      }
    }
  }

  return evaluated;
}