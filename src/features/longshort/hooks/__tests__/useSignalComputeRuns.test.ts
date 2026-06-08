/**
 * FP-028 — pure-helper tests for useSignalComputeRuns.
 *
 * Covers the cron-vs-manual classifier (Monday freshness affordance) and
 * the skip-sum reducer. Network behaviour is exercised by the
 * ComputeRunsTab integration test.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyFireSource,
  totalSkips,
} from '@/features/longshort/hooks/useSignalComputeRuns';

describe('classifyFireSource (FP-028)', () => {
  it('classifies a midnight-UTC timestamp as manual', () => {
    expect(classifyFireSource('2026-06-05T00:00:00Z')).toBe('manual');
  });

  it('classifies a non-midnight timestamp as cron', () => {
    expect(classifyFireSource('2026-06-08T20:05:13Z')).toBe('cron');
  });

  it('falls back to manual for unparseable timestamps', () => {
    expect(classifyFireSource('not-a-date')).toBe('manual');
  });
});

describe('totalSkips (FP-028)', () => {
  it('sums all values in the skip_counts map', () => {
    expect(totalSkips({ a: 1, b: 2, c: 3 })).toBe(6);
  });

  it('returns 0 for null', () => {
    expect(totalSkips(null)).toBe(0);
  });

  it('ignores non-finite values', () => {
    expect(totalSkips({ a: 5, b: Number.NaN, c: 3 })).toBe(8);
  });
});