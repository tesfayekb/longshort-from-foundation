/**
 * Tier-A correctness tests for the FP-054 54.1 paired-diff stats
 * helper. FORK B: NO p-value asserted — the helper deliberately does
 * not compute one. The CI / t-stat / SE math is the load-bearing
 * contract; edge cases must never leak NaN / Infinity to the UI.
 */
import { describe, it, expect } from 'vitest';
import {
  computePairedDiffStats,
  computePairedDiffStatsByHorizon,
  type PairedSample,
} from '@/features/longshort/services/stats/paired-diff-stats';

const samples = (...pairs: Array<[number, number]>): PairedSample[] =>
  pairs.map(([a, b]) => ({ arm_return: a, baseline_return: b }));

describe('computePairedDiffStats — FP-054 54.1 / Fork B', () => {
  it('n=0: all fields null, n=0', () => {
    const s = computePairedDiffStats([]);
    expect(s).toEqual({
      n: 0,
      meanDiff: null,
      se: null,
      ci95Lo: null,
      ci95Hi: null,
      tStat: null,
    });
  });

  it('null / undefined input: same null contract', () => {
    expect(computePairedDiffStats(null).n).toBe(0);
    expect(computePairedDiffStats(undefined).n).toBe(0);
  });

  it('n=1: meanDiff defined, SE/CI/t null (no Bessel df)', () => {
    const s = computePairedDiffStats(samples([0.05, 0.02]));
    expect(s.n).toBe(1);
    expect(s.meanDiff).toBeCloseTo(0.03, 12);
    expect(s.se).toBeNull();
    expect(s.ci95Lo).toBeNull();
    expect(s.ci95Hi).toBeNull();
    expect(s.tStat).toBeNull();
  });

  it('n>=2 SE=0 (constant diffs): mean defined, CI collapses, t null', () => {
    const s = computePairedDiffStats(
      samples([0.05, 0.02], [0.10, 0.07], [0.13, 0.10]),
    );
    expect(s.n).toBe(3);
    expect(s.meanDiff).toBeCloseTo(0.03, 12);
    expect(s.se).toBe(0);
    expect(s.ci95Lo).toBeCloseTo(0.03, 12);
    expect(s.ci95Hi).toBeCloseTo(0.03, 12);
    expect(s.tStat).toBeNull(); // never +Infinity
  });

  it('n=4 worked example: matches hand-computed mean/sd/se/CI/t', () => {
    // diffs = [+0.02, -0.01, +0.04, +0.03]; n=4
    // mean = 0.02
    // ss   = 0^2 + (-0.03)^2 + 0.02^2 + 0.01^2 = 0.0014
    // var  = 0.0014/3 ≈ 0.00046667; sd ≈ 0.02160247
    // se   = sd/sqrt(4) ≈ 0.01080123
    // CI   = 0.02 ± 1.96 * se ≈ [-0.001170, 0.041170]
    // t    = mean/se ≈ 1.85164
    const s = computePairedDiffStats(
      samples(
        [0.05, 0.03],
        [0.04, 0.05],
        [0.10, 0.06],
        [0.07, 0.04],
      ),
    );
    expect(s.n).toBe(4);
    expect(s.meanDiff!).toBeCloseTo(0.02, 12);
    expect(s.se!).toBeCloseTo(0.01080123, 6);
    expect(s.ci95Lo!).toBeCloseTo(0.02 - 1.96 * 0.01080123, 6);
    expect(s.ci95Hi!).toBeCloseTo(0.02 + 1.96 * 0.01080123, 6);
    expect(s.tStat!).toBeCloseTo(1.85164, 4);
  });

  it('drops non-finite rows defensively (NaN / Infinity inputs)', () => {
    const s = computePairedDiffStats([
      { arm_return: 0.05, baseline_return: 0.02 },
      { arm_return: Number.NaN, baseline_return: 0.01 },
      { arm_return: 0.04, baseline_return: Number.POSITIVE_INFINITY },
      { arm_return: 0.10, baseline_return: 0.07 },
    ]);
    expect(s.n).toBe(2); // only the two finite pairs survive
    expect(s.meanDiff!).toBeCloseTo(0.03, 12);
  });

  it('never returns NaN / Infinity in any field (broad fuzz of edge inputs)', () => {
    const cases: PairedSample[][] = [
      [],
      samples([0, 0]),
      samples([1e308, -1e308]),
      samples([0.0001, 0.0001], [0.0001, 0.0001]),
    ];
    for (const c of cases) {
      const s = computePairedDiffStats(c);
      for (const v of [s.meanDiff, s.se, s.ci95Lo, s.ci95Hi, s.tStat]) {
        if (v === null) continue;
        expect(Number.isNaN(v)).toBe(false);
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('explicitly does NOT expose a p-value field (Fork B)', () => {
    const s = computePairedDiffStats(samples([0.05, 0.02], [0.04, 0.05]));
    expect('p' in s).toBe(false);
    expect('pValue' in s).toBe(false);
  });

  it('computePairedDiffStatsByHorizon: per-horizon independence', () => {
    const byH = computePairedDiffStatsByHorizon({
      t1: samples([0.01, 0.00]),
      t5: null,
      t20: samples([0.05, 0.02], [0.04, 0.05]),
    });
    expect(byH.t1.n).toBe(1);
    expect(byH.t5.n).toBe(0);
    expect(byH.t20.n).toBe(2);
  });
});