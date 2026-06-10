/**
 * Analyst Revision Drift (Signal #1) per CROSSWIND §4.4.5.
 *
 * Formula (spec-literal, copied verbatim from
 * `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:466`):
 *
 *   signal_N = sum over R in trailing 30d:
 *     direction(R) × min(|magnitude(R)|, 0.50)
 *                  × analyst_credibility_weight(R)
 *                  × exp(-age_days / 5)
 *
 * Per-revision (responsive to single new revisions), NOT consensus-average
 * smoothing. CROSSWIND edge-case clause: coverage initiations and rating
 * reiterations count as zero; revision magnitude capped at 50%.
 *
 * ─── Term bindings (per DEC-055 — the governing decision) ──────────────
 *
 * Inputs per scored revision R: the focal feed row + the same-analyst
 * prior row recovered by Phase 1's `findSameAnalystPrior`
 * (Branch A+H Option 2 — true revision deltas; FP-047 Phase-0 mechanical
 * probe at NKE/KO/DDOG/TYL/HYLN ratified the strict-prior approach).
 *
 *   direction(R) = sign(newTarget − priorTarget)
 *     §4.4.5-faithful revision direction. NOT `sign(priceTarget −
 *     priceWhenPosted)` (implied upside vs. spot) — the NKE probe
 *     ($62 → $50 on a $44 spot) is the recorded justification for
 *     rejecting the implied-upside substitution (DEC-055 §(c)).
 *
 *   magnitude(R) = (newTarget − priorTarget) / priorTarget, then
 *                  clipped to [-0.50, +0.50] by the `min(|·|, 0.50)`
 *                  multiplier in the spec formula.
 *
 *   ADJUSTED / UNADJUSTED PAIRING RULE (stated rule; test-pinned):
 *     prefer `adjPriceTarget` ONLY when finite AND > 0 on BOTH the focal
 *     and the prior row; otherwise use `priceTarget` on BOTH. NEVER mix
 *     adjusted on one side with unadjusted on the other — that would
 *     synthesize a phantom revision across a split boundary.
 *
 *   analyst_credibility_weight(R) = 1.0 (uniform, DEC-055 §(a)).
 *
 *   age_days = (asOf − R.publishedDate) in calendar days, computed from
 *              the injected `asOf: Date` parameter. ZERO wall-clock —
 *              this module is Gate-2 clean (`Date.parse` is parser-only).
 *
 * ─── Window boundary (stated rule; test-pinned) ────────────────────────
 *
 * In-window: `0 ≤ ageDays ≤ 30` (INCLUSIVE on both ends). A revision
 * exactly 30.0 calendar days old is IN-window; 30.0 + ε is OUT. Future-
 * dated rows (ageDays < 0) are dropped (the fetchers already enforce a
 * `publishedDate ≤ as_of` look-ahead gate; this is defence in depth).
 *
 * ─── Unrecovered-prior accounting (DEC-055 §(g)) ───────────────────────
 *
 * Focal events in-window WITHOUT a recovered same-analyst prior are NOT
 * scored; they are COUNTED in `meta.unrecoveredCount` for observability
 * (the `revision_prior_unavailable` diagnostic surface). A name whose
 * in-window focal events are ALL unrecovered → typed skip
 * `revision_prior_unavailable`. A mix (≥1 recovered + ≥1 unrecovered)
 * → `{kind:'value', meta:{unrecoveredCount:N}}`.
 *
 * Per-row malformed-guard (non-finite focal target OR priorTarget ≤ 0)
 * counts toward `meta.malformedCount` and the all-malformed case yields
 * `data_unavailable` skip (data-quality class, not the unrecovered class).
 *
 * NO sentinel numerics anywhere. NO fabricated ε. NO wall-clock.
 *
 * Owner: longshort (FP-047 Phase 2 — Signal #1)
 * Classification: shared infrastructure — pure compute, no I/O, no clock.
 */
import { findSameAnalystPrior, parseFmpDate, type RawPriceTargetRow } from './analyst-identity.ts';
import type { SignalSkipReason } from '../shared/signal-types.ts';

/** §4.4.5: trailing window in CALENDAR days (inclusive on both ends). */
export const REVISION_WINDOW_DAYS = 30;

/** §4.4.5: exp(-age_days / 5) — 5-day half-life-ish decay constant. */
export const REVISION_DECAY_TAU_DAYS = 5;

/** §4.4.5: per-revision magnitude clip — `min(|magnitude|, 0.50)`. */
export const REVISION_MAGNITUDE_CAP = 0.50;

/** DEC-055 §(a): uniform analyst credibility weight in v1. */
export const ANALYST_CREDIBILITY_WEIGHT = 1.0;

const MS_PER_DAY = 86_400_000;

export interface AnalystRevisionInputs {
  /**
   * Focal candidate events for THIS ticker. May contain rows outside
   * the 30d window; the compute filters internally. Out-of-window rows
   * are silently dropped (not counted).
   */
  focalRows: ReadonlyArray<RawPriceTargetRow>;
  /**
   * Per-symbol history for prior recovery via `findSameAnalystPrior`.
   * Typically the union of recent history-endpoint pages from
   * `FmpPriceTargetHistoryFetcher`. The focal row itself may appear here
   * — `findSameAnalystPrior` excludes equal-or-later timestamps.
   */
  history: ReadonlyArray<RawPriceTargetRow>;
  /** Injected as-of timestamp. ZERO wall-clock. */
  asOf: Date;
}

export type AnalystRevisionSkipReason = Extract<
  SignalSkipReason,
  | 'no_revisions_in_window'
  | 'revision_prior_unavailable'
  | 'zero_magnitude_only'
  | 'data_unavailable'
>;

export interface AnalystRevisionMeta {
  /** Events that produced a non-zero or zero magnitude (had a prior). */
  scoredCount: number;
  /** In-window focal events with no recovered same-analyst prior. */
  unrecoveredCount: number;
  /** In-window focal events dropped for non-finite/non-positive targets. */
  malformedCount: number;
}

export type AnalystRevisionComputeResult =
  | { kind: 'value'; raw: number; meta: AnalystRevisionMeta }
  | { kind: 'skip'; reason: AnalystRevisionSkipReason; detail: string };

/**
 * Resolved per-pair targets honouring the adjusted/unadjusted pairing
 * rule. Returns `null` if neither side has a usable pair.
 */
function resolvePair(
  focal: RawPriceTargetRow,
  prior: RawPriceTargetRow,
): { newTarget: number; priorTarget: number } | null {
  const fAdj = focal.adjPriceTarget;
  const pAdj = prior.adjPriceTarget;
  if (
    typeof fAdj === 'number' && Number.isFinite(fAdj) && fAdj > 0 &&
    typeof pAdj === 'number' && Number.isFinite(pAdj) && pAdj > 0
  ) {
    return { newTarget: fAdj, priorTarget: pAdj };
  }
  const fRaw = focal.priceTarget;
  const pRaw = prior.priceTarget;
  if (
    typeof fRaw === 'number' && Number.isFinite(fRaw) && fRaw > 0 &&
    typeof pRaw === 'number' && Number.isFinite(pRaw) && pRaw > 0
  ) {
    return { newTarget: fRaw, priorTarget: pRaw };
  }
  return null;
}

/** sign(x) returning −1 / 0 / +1 (Math.sign of NaN avoided by caller). */
function signOf(x: number): number {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

/**
 * Pure compute. Same inputs → same outputs. No clock, no I/O, no random.
 */
export function computeAnalystRevision(
  i: AnalystRevisionInputs,
): AnalystRevisionComputeResult {
  const asOfMs = i.asOf.getTime();
  if (!Number.isFinite(asOfMs)) {
    return { kind: 'skip', reason: 'data_unavailable', detail: 'asOf is not a valid Date' };
  }
  const windowFloorMs = asOfMs - REVISION_WINDOW_DAYS * MS_PER_DAY;

  let scoredSum = 0;
  let scoredCount = 0;
  let unrecoveredCount = 0;
  let malformedCount = 0;
  let inWindowCount = 0;
  let allScoredZeroMagnitude = true;

  for (const focal of i.focalRows) {
    const focalMs = parseFmpDate(focal.publishedDate);
    if (!Number.isFinite(focalMs)) continue;
    // Look-ahead defence: drop future-dated rows entirely.
    if (focalMs > asOfMs) continue;
    // In-window: ageDays ∈ [0, 30] inclusive ⇔ focalMs ≥ windowFloorMs.
    if (focalMs < windowFloorMs) continue;
    inWindowCount++;

    const prior = findSameAnalystPrior(focal, i.history);
    if (prior.kind !== 'found') {
      unrecoveredCount++;
      continue;
    }
    const pair = resolvePair(focal, prior.row);
    if (pair === null) {
      malformedCount++;
      continue;
    }
    const delta = pair.newTarget - pair.priorTarget;
    const magnitude = delta / pair.priorTarget;
    if (!Number.isFinite(magnitude)) {
      malformedCount++;
      continue;
    }
    const dir = signOf(delta);
    const clipped = Math.min(Math.abs(magnitude), REVISION_MAGNITUDE_CAP);
    const ageDays = (asOfMs - focalMs) / MS_PER_DAY;
    const decay = Math.exp(-ageDays / REVISION_DECAY_TAU_DAYS);
    const contribution = dir * clipped * ANALYST_CREDIBILITY_WEIGHT * decay;
    scoredSum += contribution;
    scoredCount++;
    if (clipped !== 0) allScoredZeroMagnitude = false;
  }

  if (inWindowCount === 0) {
    return {
      kind: 'skip',
      reason: 'no_revisions_in_window',
      detail: `0 focal revisions inside trailing ${REVISION_WINDOW_DAYS}d window`,
    };
  }
  if (scoredCount === 0) {
    if (malformedCount === inWindowCount) {
      return {
        kind: 'skip',
        reason: 'data_unavailable',
        detail:
          `all ${inWindowCount} in-window focal rows had non-finite or ` +
          `non-positive targets (no usable adjusted-or-raw pair)`,
      };
    }
    // unrecovered (possibly mixed with malformed) but no scored pair.
    return {
      kind: 'skip',
      reason: 'revision_prior_unavailable',
      detail:
        `${unrecoveredCount} unrecovered / ${malformedCount} malformed of ` +
        `${inWindowCount} in-window focal events; zero scored ` +
        `(DEC-055 §(g): no implied-upside fallback)`,
    };
  }
  if (allScoredZeroMagnitude) {
    return {
      kind: 'skip',
      reason: 'zero_magnitude_only',
      detail:
        `${scoredCount} scored revisions, every pair had ` +
        `newTarget === priorTarget (reiterations); typed absence per ` +
        `axiom 3`,
    };
  }
  return {
    kind: 'value',
    raw: scoredSum,
    meta: { scoredCount, unrecoveredCount, malformedCount },
  };
}