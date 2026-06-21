/**
 * paired-diff-stats — FP-054 sub-step 54.1, FORK B.
 *
 * Pure-TypeScript paired-difference statistics for the L2
 * Shadow-Measurement panel's AC3 spread readout.
 *
 * Per-arm output: n, meanDiff, se, ci95Lo, ci95Hi, tStat where
 *   diff_i = arm.side_signed_return_i - baseline.side_signed_return_i
 *   mean   = (1/n) Σ diff_i
 *   sd     = sample standard deviation (Bessel-corrected, n-1)
 *   se     = sd / sqrt(n)
 *   ci95   = mean ± 1.96 * se   (normal-approx; exploratory only)
 *   tStat  = mean / se
 *
 * FORK B: deliberately NO p-value computation here. The formal
 * paired-t p (with proper df = n-1 t-CDF) is deferred to the
 * canonical gate-eval path. The CI + t-stat conveys the exploratory
 * significance signal in the panel.
 *
 * Edge-case contract (Tier-A): NEVER emit NaN / Infinity to the UI.
 * - n=0           → all stats null
 * - n=1           → meanDiff defined; se / ci / tStat null
 * - n≥2 sd=0      → meanDiff defined; se=0; ci collapses to mean;
 *                   tStat null (would be ±Infinity or 0/0)
 * - non-finite    → row dropped at the pair stage (see
 *                   `pairForwardReturns`); helper still defends.
 */

export interface PairedSample {
  arm_return: number;
  baseline_return: number;
}

export interface PairedDiffStats {
  n: number;
  meanDiff: number | null;
  se: number | null;
  ci95Lo: number | null;
  ci95Hi: number | null;
  tStat: number | null;
}

// Two-sided z(0.975). Normal approx is intentional under Fork B —
// the formal df=n-1 t critical lives in the gate-eval path.
const Z_975 = 1.96;

export function computePairedDiffStats(
  rows: ReadonlyArray<PairedSample> | null | undefined,
): PairedDiffStats {
  const diffs: number[] = [];
  for (const r of rows ?? []) {
    if (!r) continue;
    if (!Number.isFinite(r.arm_return) || !Number.isFinite(r.baseline_return))
      continue;
    const d = r.arm_return - r.baseline_return;
    if (!Number.isFinite(d)) continue;
    diffs.push(d);
  }
  const n = diffs.length;
  if (n === 0) {
    return { n: 0, meanDiff: null, se: null, ci95Lo: null, ci95Hi: null, tStat: null };
  }
  let sum = 0;
  for (const d of diffs) sum += d;
  const meanDiff = sum / n;
  if (n === 1) {
    return { n: 1, meanDiff, se: null, ci95Lo: null, ci95Hi: null, tStat: null };
  }
  let sqSum = 0;
  for (const d of diffs) {
    const e = d - meanDiff;
    sqSum += e * e;
  }
  const variance = sqSum / (n - 1);
  const sd = Math.sqrt(Math.max(variance, 0));
  let se = sd / Math.sqrt(n);
  // Numerical-stability snap: when the diffs are effectively constant
  // the sum-of-squares loses precision and leaves a tiny non-zero
  // residue (~1e-18). Snap to exact 0 so the SE=0 contract holds and
  // tStat does NOT explode to ±Infinity. Threshold is relative to
  // |mean| with an absolute floor, scaled well below any meaningful
  // return diff (a 1e-12 relative scale is 12 orders below 1 bp).
  const seFloor = 1e-12 * Math.max(Math.abs(meanDiff), 1);
  if (se < seFloor) se = 0;
  if (!Number.isFinite(se)) {
    return { n, meanDiff, se: null, ci95Lo: null, ci95Hi: null, tStat: null };
  }
  if (se === 0) {
    // All diffs identical — mean is the point; CI collapses; t-stat
    // would be ±Infinity (or 0/0 when mean=0). Surface null per
    // contract; consumer renders as "n/a".
    return { n, meanDiff, se: 0, ci95Lo: meanDiff, ci95Hi: meanDiff, tStat: null };
  }
  const ci95Lo = meanDiff - Z_975 * se;
  const ci95Hi = meanDiff + Z_975 * se;
  const tStat = meanDiff / se;
  return {
    n,
    meanDiff,
    se,
    ci95Lo: Number.isFinite(ci95Lo) ? ci95Lo : null,
    ci95Hi: Number.isFinite(ci95Hi) ? ci95Hi : null,
    tStat: Number.isFinite(tStat) ? tStat : null,
  };
}

/**
 * Convenience: compute the same stats across the primary + corroboration
 * horizons (T+5 primary, T+1 / T+20 corroboration per DEC-059). The
 * caller supplies a per-horizon paired-sample array (already filtered
 * to one arm vs the baseline at that horizon).
 */
export interface PairedDiffStatsByHorizon {
  t1: PairedDiffStats;
  t5: PairedDiffStats;
  t20: PairedDiffStats;
}

export function computePairedDiffStatsByHorizon(input: {
  t1: ReadonlyArray<PairedSample> | null | undefined;
  t5: ReadonlyArray<PairedSample> | null | undefined;
  t20: ReadonlyArray<PairedSample> | null | undefined;
}): PairedDiffStatsByHorizon {
  return {
    t1: computePairedDiffStats(input.t1),
    t5: computePairedDiffStats(input.t5),
    t20: computePairedDiffStats(input.t20),
  };
}