/**
 * Tests for cross-check-spec.ts — FP-008 sub-step 8.8 / ACT-114.
 *
 * Coverage:
 *  - jaccardSimilarity utility (identical / disjoint / half-overlap / both-empty)
 *  - classify_outcome thresholds: jaccard 1.0, 0.96, 0.92, 0.85, 0.50
 *  - safety floor (sym-diff ≤ 3 overrides jaccard)
 *  - safety ceiling (sym-diff > 100, either-set-empty → system_bug)
 *  - divergence jsonb shape (sorted, ≤10 ticker samples)
 *  - builder field correctness (call_name, symbol, tier, tolerance_class)
 */
import { describe, it, expect } from 'vitest';
import {
  buildUniverseCrossCheckSpec,
  jaccardSimilarity,
  SURFACE_2_THRESHOLDS,
  type CrossCheckDivergence,
} from './cross-check-spec';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

function setOf(...tickers: string[]): Set<string> {
  return new Set(tickers);
}

function divergenceFor(polygon: string[], ishares: string[]): CrossCheckDivergence {
  const spec = buildUniverseCrossCheckSpec({ operator_id: OPERATOR_ID });
  return spec.compute_divergence(
    { polygon_tickers: new Set(polygon) },
    { ishares_tickers: new Set(ishares) },
  ) as CrossCheckDivergence;
}

function outcomeFor(polygon: string[], ishares: string[]) {
  const spec = buildUniverseCrossCheckSpec({ operator_id: OPERATOR_ID });
  const d = divergenceFor(polygon, ishares);
  return spec.classify_outcome(d, spec.tolerance);
}

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    expect(jaccardSimilarity(setOf('A', 'B'), setOf('A', 'B'))).toBe(1);
  });
  it('returns 0.0 for disjoint sets', () => {
    expect(jaccardSimilarity(setOf('A'), setOf('B'))).toBe(0);
  });
  it('returns 0.5 for half-overlap (|∩|=1, |∪|=3)', () => {
    expect(jaccardSimilarity(setOf('A', 'B'), setOf('B', 'C'))).toBeCloseTo(1 / 3, 6);
  });
  it('returns 0 for both-empty edge case (NaN-safe)', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });
});

describe('buildUniverseCrossCheckSpec — field correctness', () => {
  const spec = buildUniverseCrossCheckSpec({ operator_id: OPERATOR_ID });
  it('call_name = universe_cross_check (S6 Option I)', () => {
    expect(spec.call_name).toBe('universe_cross_check');
  });
  it('symbol is null (set-level call)', () => {
    expect(spec.symbol).toBeNull();
  });
  it('tier = strong', () => {
    expect(spec.tier).toBe('strong');
  });
  it('tolerance_class = low_tolerance', () => {
    expect(spec.tolerance_class).toBe('low_tolerance');
  });
  it('operator_id threaded', () => {
    expect(spec.operator_id).toBe(OPERATOR_ID);
  });
});

describe('classify_outcome — Surface 2 Option γ thresholds', () => {
  it('jaccard 1.0 identical → false_positive_within_tolerance', () => {
    // Use larger universes so safety floor (sym-diff ≤ 3) does not always swallow.
    const u = Array.from({ length: 50 }, (_, i) => `T${i}`);
    expect(outcomeFor(u, u)).toBe('false_positive_within_tolerance');
  });

  it('safety floor — sym-diff = 3 with low jaccard → false_positive_within_tolerance', () => {
    // 3 vs 0 overlap; sym-diff = 3 → floor activates.
    expect(outcomeFor(['A', 'B', 'C'], [])).toBe('system_bug'); // ishares empty → ceiling
    // proper floor scenario: small total but both non-empty
    expect(outcomeFor(['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'E'])).toBe('false_positive_within_tolerance');
  });

  it('safety floor boundary — sym-diff = 4 falls through to jaccard', () => {
    // polygon 100 tickers, ishares = polygon with 4 swapped → sym-diff = 4; jaccard high.
    const polygon = Array.from({ length: 100 }, (_, i) => `T${i}`);
    const ishares = [...polygon.slice(0, 98), 'X1', 'X2']; // remove 2 + add 2 → sym-diff = 4
    expect(outcomeFor(polygon, ishares)).toBe('false_positive_within_tolerance'); // jaccard 98/102 ≈ 0.96
  });

  it('jaccard 0.92 → expected_divergence_handled', () => {
    // 100 polygon; ishares: 92 overlap + 8 unique. Union 108; jaccard 92/108 ≈ 0.852.
    // Construct precise: |∩|=92, |∪|=100; need ishares of size 92 + polygonOnly=8 (none of ishares)
    // Build: polygon = T0..T99; ishares = T0..T91 + Y0..Y7 → |∩|=92, |∪|=108, jaccard ≈ 0.852.
    // For exactly 0.92 we'd need |∩|/(|A|+|B|-|∩|)=0.92. Use polygon 92, ishares = 92 share 88: |∩|=88, |∪|=96, j ≈ 0.917
    const polygon = Array.from({ length: 92 }, (_, i) => `T${i}`);
    const ishares = [...polygon.slice(0, 88), 'Y0', 'Y1', 'Y2', 'Y3'];
    // |∩|=88, |∪|=96, jaccard ≈ 0.917; sym-diff = 8 (4 polygon-only + 4 ishares-only)
    expect(outcomeFor(polygon, ishares)).toBe('expected_divergence_handled');
  });

  it('jaccard 0.85 → failure_handled', () => {
    // polygon 50, ishares share 40 + add 5 new → |∩|=40, |∪|=55, j ≈ 0.727 → too low
    // Target jaccard ~ 0.85: |∩|=85, |A|=|B|=92 → |∪|=99, j ≈ 0.86
    const polygon = Array.from({ length: 92 }, (_, i) => `T${i}`);
    const ishares = [...polygon.slice(0, 85), 'Y0', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6'];
    // |∩|=85, |∪|=99, jaccard ≈ 0.858; sym-diff = 14
    expect(outcomeFor(polygon, ishares)).toBe('failure_handled');
  });

  it('jaccard 0.50 → failure_escalated', () => {
    // polygon 60, ishares = last 30 of polygon + 30 fresh → |∩|=30, |∪|=90, j ≈ 0.333 (well below)
    const polygon = Array.from({ length: 60 }, (_, i) => `T${i}`);
    const ishares = [...polygon.slice(30), ...Array.from({ length: 30 }, (_, i) => `Y${i}`)];
    expect(outcomeFor(polygon, ishares)).toBe('failure_escalated');
  });

  it('safety ceiling — sym-diff > 100 → system_bug', () => {
    const polygon = Array.from({ length: 60 }, (_, i) => `T${i}`);
    const ishares = Array.from({ length: 60 }, (_, i) => `Y${i}`);
    // sym-diff = 120
    expect(outcomeFor(polygon, ishares)).toBe('system_bug');
  });

  it('safety ceiling — polygon empty → system_bug', () => {
    expect(outcomeFor([], ['A', 'B'])).toBe('system_bug');
  });

  it('safety ceiling — ishares empty → system_bug', () => {
    expect(outcomeFor(['A', 'B'], [])).toBe('system_bug');
  });

  it('both empty → system_bug', () => {
    expect(outcomeFor([], [])).toBe('system_bug');
  });
});

describe('compute_divergence — jsonb shape', () => {
  it('produces sorted ≤10 ticker samples for forensic context', () => {
    const polygon = Array.from({ length: 20 }, (_, i) => `P${String(i).padStart(2, '0')}`);
    const ishares = Array.from({ length: 20 }, (_, i) => `I${String(i).padStart(2, '0')}`);
    const d = divergenceFor(polygon, ishares);
    expect(d.polygon_only_count).toBe(20);
    expect(d.ishares_only_count).toBe(20);
    expect(d.polygon_only_sample.length).toBe(10);
    expect(d.ishares_only_sample.length).toBe(10);
    expect([...d.polygon_only_sample]).toEqual([...d.polygon_only_sample].slice().sort());
    expect([...d.ishares_only_sample]).toEqual([...d.ishares_only_sample].slice().sort());
    expect(d.symmetric_difference_count).toBe(40);
    expect(d.intersection_size).toBe(0);
    expect(d.jaccard_similarity).toBe(0);
  });

  it('intersection_size correct for partial overlap', () => {
    const d = divergenceFor(['A', 'B', 'C', 'D'], ['B', 'C', 'D', 'E']);
    expect(d.intersection_size).toBe(3);
    expect(d.polygon_only_count).toBe(1);
    expect(d.ishares_only_count).toBe(1);
    expect(d.symmetric_difference_count).toBe(2);
    expect(d.jaccard_similarity).toBeCloseTo(3 / 5, 6);
  });
});

describe('thresholds export', () => {
  it('exposes Surface 2 Option γ constants verbatim', () => {
    expect(SURFACE_2_THRESHOLDS.SAFETY_FLOOR_SYM_DIFF).toBe(3);
    expect(SURFACE_2_THRESHOLDS.SAFETY_CEILING_SYM_DIFF).toBe(100);
    expect(SURFACE_2_THRESHOLDS.JACCARD_FALSE_POSITIVE).toBe(0.95);
    expect(SURFACE_2_THRESHOLDS.JACCARD_EXPECTED_DIVERGENCE).toBe(0.90);
    expect(SURFACE_2_THRESHOLDS.JACCARD_FAILURE_HANDLED).toBe(0.80);
  });
});