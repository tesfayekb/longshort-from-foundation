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
//     Required inputs: `squeezeSiPctFloatMin` (named param — no hard default
//     baked here; caller MUST supply the operator-ratified value) and
//     `siStalenessMaxDays` (named param — derivation: SEC settles short
//     interest twice per calendar month at mid-month + month-end with a
//     roughly 8-business-day publication delay; a fresh row therefore lands
//     within ~15 calendar days of publication. `siStalenessMaxDays` >= 21
//     spans one full missed cycle plus a small grace; caller supplies the
//     ratified value). Missing SI row -> REFUSED `si_unavailable`; row present
//     but `(asOf - as_of_date) > siStalenessMaxDays` -> REFUSED `si_stale`;
//     `si_pct_float === null` -> REFUSED `si_unavailable` (typed absence, not
//     zero — never pass-through the DW-208 sentinel); `si_pct_float <
//     squeezeSiPctFloatMin` -> REFUSED `si_below_squeeze_threshold`.
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
//     Named parameter `capacityPerSide` (charter default: 20). Selection =
//     rank_score DESC, |excess| DESC tiebreak. Unselected-but-qualified
//     candidates persist with `selected_for_entry = false` and
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

export type Side = 'LONG' | 'SHORT';

export type RefusalReason =
  | 'excess_below_threshold'
  | 'window_out_of_set'
  | 'momentum_out_of_set'
  | 'drawdown_out_of_set'
  | 'exclusion_earnings_proximity'
  | 'si_unavailable'
  | 'si_stale'
  | 'si_below_squeeze_threshold'
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
  capacityPerSide: number;         // charter default 20
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
// FP-069 W3.8 T2.1 (ACT-479) — DETECTOR-PRIOR EXTENSION: tiered admission
// ═══════════════════════════════════════════════════════════════════════
//
// Ratified 2026-07-07 (operator STEP-A ratifications, verbatim):
//   (a) v2 = detector-versioning via NEW RATIFIED_DETECTOR_VERSION constant
//       (sha256(study_full_hash ‖ canonical predicate_spec_json), first 8
//       hex, ASCII '||' separator for portability). RATIFIED_STUDY_RUN_ID
//       and RATIFIED_PARAM_GRID_HASH_PREFIX remain UNTOUCHED and
//       boot-asserted forever — the study kernel is unchanged; no consumer
//       rename atom exists; consumers ADD the new assertion in a later
//       sub-tranche without a boot-broken window.
//   (b) Selection ordering is pure rank_score DESC, |excess| DESC (operator
//       ROI directive — rank_score is the measured expected return;
//       tier-class-priority rejected as a conservatism clamp). `tier ASC`
//       is the FINAL tie-break only, invoked when rank_score AND |excess|
//       tie exactly — this is determinism scaffolding, not priority.
//   (c) A higher-mean T2 cell DOES outrank a lower-mean T1 cell — the
//       admission gate is per-cell; the ranking gate is per-mean.
//
// LONG_T2_ELIGIBLE(cell) ≡ side='LONG' ∧ NOT LONG_T1_ELIGIBLE(cell)
//                          ∧ mean_fwd_return_5d ≥ 0.0010 (2× haircut)
//                          ∧ arrival_count ≥ 1
// LONG_T1_ELIGIBLE(cell) ≡ side='LONG' ∧ mean_fwd_return_5d ≥ 0.0020
//                          ∧ arrival_count ≥ 1
//   (T1 threshold = retroactive canonicalization of the T1-only prior:
//    2× the T2 haircut floor. Cells below 0.0010 refuse `no_study_cell`
//    — a new hard floor that pre-v2 code lacked. In practice such cells
//    ranked at the bottom of the top-20-per-side sort and were unlikely
//    to be selected under capacity=20; the 2026-06-18 anchor's 3 LONG
//    admissions are all L_10_INF cells with mean ≥ 0.0020 → all T1.)
//
// SHORT path is BYTE-UNCHANGED this tranche: no T2 admission, no tier
// tagging (tier remains null on every SHORT event), no mean-return floor
// change. The SHORT rank_score formula `mean_fwd_return_5d * -1` is
// preserved verbatim; the SHORT selection set is preserved verbatim.

export const LONG_T1_MEAN_FWD_RETURN_5D_MIN = 0.0020 as const;
export const LONG_T2_MEAN_FWD_RETURN_5D_MIN = 0.0010 as const;
export const LONG_TIER_ARRIVAL_COUNT_MIN = 1 as const;

/** Minimal shape the tier predicates read — a subset of `StudyCellStats`. */
export interface CellForTierEval {
  mean_fwd_return_5d: number | null;
  arrival_count: number;
}

export function LONG_T1_ELIGIBLE(cell: CellForTierEval): boolean {
  return (
    cell.mean_fwd_return_5d !== null &&
    cell.mean_fwd_return_5d >= LONG_T1_MEAN_FWD_RETURN_5D_MIN &&
    cell.arrival_count >= LONG_TIER_ARRIVAL_COUNT_MIN
  );
}

export function LONG_T2_ELIGIBLE(cell: CellForTierEval): boolean {
  if (LONG_T1_ELIGIBLE(cell)) return false;
  return (
    cell.mean_fwd_return_5d !== null &&
    cell.mean_fwd_return_5d >= LONG_T2_MEAN_FWD_RETURN_5D_MIN &&
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

export const DETECTOR_PREDICATE_SPEC_V1_JSON =
  '{"version":"v1","long":{"excess_min":0.10,"windows":[1,2,3],"momentum":[4,5],"drawdown":[1,2,3],"earnings_exclusion_days":5,"tiers":{"T1":{"mean_fwd_return_5d_min":0.0020,"arrival_count_min":1}}},"selection":{"ordering":["rank_score_desc","abs_excess_desc"],"capacity_per_side_default":20},"short":{"excess_min":0.08,"windows":[1,2,3,4,5],"momentum":[1,5],"drawdown":[4,5],"earnings_exclusion_days":5,"si_squeeze":{"si_pct_float_min":"param","si_staleness_max_days":"param","default_deny_on_missing":true}}}' as const;

export const DETECTOR_PREDICATE_SPEC_V2_JSON =
  '{"version":"v2","long":{"excess_min":0.10,"windows":[1,2,3],"momentum":[4,5],"drawdown":[1,2,3],"earnings_exclusion_days":5,"tiers":{"T1":{"mean_fwd_return_5d_min":0.0020,"arrival_count_min":1},"T2":{"mean_fwd_return_5d_min":0.0010,"arrival_count_min":1,"disjoint_from":"T1"}}},"selection":{"ordering":["rank_score_desc","abs_excess_desc","tier_asc"],"capacity_per_side_default":20,"tier_role":"w5_attribution_tag_not_priority_class"},"short":{"excess_min":0.08,"windows":[1,2,3,4,5],"momentum":[1,5],"drawdown":[4,5],"earnings_exclusion_days":5,"si_squeeze":{"si_pct_float_min":"param","si_staleness_max_days":"param","default_deny_on_missing":true}}}' as const;

/**
 * Currently-ratified detector version prefix (sha256(study_full_hash ‖
 * DETECTOR_PREDICATE_SPEC_V2_JSON), first 8 hex, ASCII '||' separator).
 * Frozen; not recomputed at runtime this tranche. Consumers begin
 * asserting this in T2.4 (additive; no v1 removal, no boot-broken window).
 */
export const RATIFIED_DETECTOR_VERSION = '723c2d25' as const;

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
      'FP-069 W3.8 T2 detector-prior extension: LONG T2 admission ' +
      '(mean_fwd_return_5d in [0.0010, 0.0020), arrival_count >= 1, disjoint from T1). ' +
      'SHORT path byte-unchanged. Selection ordering gains tier ASC as final tie-break only ' +
      '(W5 attribution tag, NOT a priority class — a higher-mean T2 cell DOES outrank a ' +
      'lower-mean T1 cell, per operator ROI directive). Study run + kernel + param_grid_hash ' +
      'UNTOUCHED; RATIFIED_STUDY_RUN_ID and RATIFIED_PARAM_GRID_HASH_PREFIX remain boot-asserted.',
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
    const allowedWindows =
      side === 'LONG' ? params.longWindowSet : params.shortWindowSet;
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

    // 0. side-window-set
    passes.push({
      filter: 'side-window-set',
      passed: picked.windowInSet,
      ...(picked.windowInSet ? {} : {
        reason: 'window_out_of_set' as const,
        detail: { window_days: row.window_days, allowed: [...allowedWindows] },
      }),
    });
    if (!picked.windowInSet) setRefusal('window_out_of_set');

    // 1. excess-threshold — signed for the side.
    const excessOk =
      side === 'LONG'
        ? picked.excess >= excessThreshold
        : picked.excess <= -excessThreshold;
    passes.push({
      filter: 'excess-threshold',
      passed: excessOk,
      ...(excessOk ? {} : {
        reason: 'excess_below_threshold' as const,
        detail: { excess: picked.excess, threshold: excessThreshold, side },
      }),
    });
    if (!excessOk) setRefusal('excess_below_threshold');

    // 2. momentum
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

    // 3. drawdown
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
        const stale = calendarDaysBetween(params.asOf, si.as_of_date) > params.siStalenessMaxDays;
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
          const ok = si.si_pct_float >= params.squeezeSiPctFloatMin;
          passes.push({
            filter: 'si-squeeze-gate',
            passed: ok,
            ...(ok ? {} : {
              reason: 'si_below_squeeze_threshold' as const,
              detail: {
                si_pct_float: si.si_pct_float,
                threshold: params.squeezeSiPctFloatMin,
              },
            }),
          });
          if (!ok) setRefusal('si_below_squeeze_threshold');
        }
      }
    }

    // 6. study-cell-lookup — rank_score source.
    let rank_score: number | null = null;
    let study_cell_ref: StudyCellKey | null = null;
    let tier: 'T1' | 'T2' | null = null;
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
        // FP-069 W3.8 T2.1 (ACT-479) — tiered LONG admission.
        // T1: mean >= 0.0020 ∧ arrival_count >= 1.
        // T2: 0.0010 <= mean < 0.0020 ∧ arrival_count >= 1 (NOT T1).
        // Below T2 floor OR arrival_count < 1 → REFUSED no_study_cell
        // (new hard floor v2 introduces; never silent-pass, never
        // default-zero — the DW-208 anti-pattern this module exists to
        // prevent).
        if (LONG_T1_ELIGIBLE(cell)) {
          tier = 'T1';
          rank_score = cell.mean_fwd_return_5d;
          study_cell_ref = key;
          passes.push({
            filter: 'study-cell-lookup',
            passed: true,
            detail: { arrival_count: cell.arrival_count, tier: 'T1' },
          });
        } else if (LONG_T2_ELIGIBLE(cell)) {
          tier = 'T2';
          rank_score = cell.mean_fwd_return_5d;
          study_cell_ref = key;
          passes.push({
            filter: 'study-cell-lookup',
            passed: true,
            detail: { arrival_count: cell.arrival_count, tier: 'T2' },
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
              reason: 'below_long_t2_floor_or_arrival_count',
              long_t2_mean_fwd_return_5d_min: LONG_T2_MEAN_FWD_RETURN_5D_MIN,
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
    const capacity = params.capacityPerSide;
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