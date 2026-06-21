import { describe, it, expect } from 'vitest';
import {
  foldShadowBookHead,
  type ShadowBookRow,
} from '@/features/longshort/hooks/useShadowBookHead';

const row = (
  variant: string,
  as_of_date: string,
  side: string,
  ticker: string,
  rank: number,
): ShadowBookRow => ({
  variant,
  as_of_date,
  side,
  ticker,
  rank_within_side: rank,
  score: 0,
});

describe('foldShadowBookHead — FP-054 54.1 AC5', () => {
  it('returns [] for null / empty', () => {
    expect(foldShadowBookHead(null)).toEqual([]);
    expect(foldShadowBookHead([])).toEqual([]);
  });

  it('retains only rows at the per-variant max as_of_date', () => {
    const out = foldShadowBookHead([
      row('gated_k0', '2026-06-19', 'long', 'AAA', 1),
      row('gated_k0', '2026-06-18', 'long', 'STALE', 1),
      row('gated_k0', '2026-06-19', 'short', 'BBB', 1),
      row('relaxed_x', '2026-06-18', 'long', 'CCC', 1),
    ]);
    expect(out).toHaveLength(2);
    const g = out.find((e) => e.variant === 'gated_k0')!;
    expect(g.as_of_date).toBe('2026-06-19');
    expect(g.longs.map((r) => r.ticker)).toEqual(['AAA']);
    expect(g.shorts.map((r) => r.ticker)).toEqual(['BBB']);
    const r = out.find((e) => e.variant === 'relaxed_x')!;
    expect(r.as_of_date).toBe('2026-06-18');
    expect(r.longs.map((x) => x.ticker)).toEqual(['CCC']);
  });

  it('sorts each side by rank_within_side ascending', () => {
    const out = foldShadowBookHead([
      row('v', '2026-06-19', 'long', 'C', 3),
      row('v', '2026-06-19', 'long', 'A', 1),
      row('v', '2026-06-19', 'long', 'B', 2),
    ]);
    expect(out[0].longs.map((r) => r.ticker)).toEqual(['A', 'B', 'C']);
  });
});