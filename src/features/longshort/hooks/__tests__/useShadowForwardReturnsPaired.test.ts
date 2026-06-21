import { describe, it, expect } from 'vitest';
import {
  pairForwardReturns,
  type ForwardReturnRow,
} from '@/features/longshort/hooks/useShadowForwardReturnsPaired';

const fr = (
  seed: string,
  ticker: string,
  side: string,
  horizon: number,
  ret: number | null,
): ForwardReturnRow => ({
  seed_as_of_date: seed,
  ticker,
  side,
  horizon_td: horizon,
  side_signed_return: ret,
});

describe('pairForwardReturns — FP-054 54.1 AC2/AC3', () => {
  it('empty inputs: paired=[], n=0', () => {
    expect(pairForwardReturns([], [])).toEqual({ paired: [], n: 0 });
    expect(pairForwardReturns(null, undefined)).toEqual({ paired: [], n: 0 });
  });

  it('pairs on (seed,ticker,side,horizon) and counts distinct seed days', () => {
    const arm = [
      fr('2026-06-19', 'AAA', 'long', 5, 0.05),
      fr('2026-06-19', 'BBB', 'short', 5, -0.02),
      fr('2026-06-20', 'AAA', 'long', 5, 0.03),
      fr('2026-06-20', 'CCC', 'long', 5, 0.01),
    ];
    const baseline = [
      fr('2026-06-19', 'AAA', 'long', 5, 0.04),
      fr('2026-06-19', 'BBB', 'short', 5, -0.01),
      fr('2026-06-20', 'AAA', 'long', 5, 0.02),
    ];
    const out = pairForwardReturns(arm, baseline);
    expect(out.paired).toHaveLength(3);
    expect(out.n).toBe(2);
    expect(out.paired[0]).toMatchObject({
      ticker: 'AAA',
      arm_return: 0.05,
      baseline_return: 0.04,
    });
  });

  it('drops pairs where either side_signed_return is null / non-finite', () => {
    const arm = [
      fr('2026-06-19', 'AAA', 'long', 5, null),
      fr('2026-06-19', 'BBB', 'short', 5, 0.02),
    ];
    const baseline = [
      fr('2026-06-19', 'AAA', 'long', 5, 0.01),
      fr('2026-06-19', 'BBB', 'short', 5, Number.NaN),
    ];
    const out = pairForwardReturns(arm, baseline);
    expect(out.paired).toEqual([]);
    expect(out.n).toBe(0);
  });

  it('side / horizon mismatch never pairs', () => {
    const arm = [fr('2026-06-19', 'AAA', 'long', 5, 0.05)];
    const baseline = [
      fr('2026-06-19', 'AAA', 'short', 5, 0.04),
      fr('2026-06-19', 'AAA', 'long', 1, 0.03),
    ];
    expect(pairForwardReturns(arm, baseline).paired).toEqual([]);
  });
});