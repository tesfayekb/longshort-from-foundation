import { describe, it, expect } from 'vitest';
import {
  groupFetchErrorsByStatusDay,
  topPersistentFailTickers,
  type FetchErrorRow,
} from '@/features/longshort/hooks/useShadowFetchErrorClusters';

const e = (
  seed: string,
  ticker: string,
  status: string,
): FetchErrorRow => ({
  seed_as_of_date: seed,
  ticker,
  price_source_status: status,
});

describe('groupFetchErrorsByStatusDay — FP-054 54.1 AC4', () => {
  it('empty / null safe', () => {
    expect(groupFetchErrorsByStatusDay(null)).toEqual([]);
    expect(groupFetchErrorsByStatusDay([])).toEqual([]);
  });

  it('groups by (status, seed_as_of_date) and counts', () => {
    const out = groupFetchErrorsByStatusDay([
      e('2026-06-19', 'AAA', 'fetch_error'),
      e('2026-06-19', 'BBB', 'fetch_error'),
      e('2026-06-19', 'CCC', 'polygon_404'),
      e('2026-06-18', 'AAA', 'fetch_error'),
    ]);
    const k = (c: { status: string; seed_as_of_date: string }) =>
      `${c.seed_as_of_date}/${c.status}`;
    const map = Object.fromEntries(out.map((c) => [k(c), c.count]));
    expect(map['2026-06-19/fetch_error']).toBe(2);
    expect(map['2026-06-19/polygon_404']).toBe(1);
    expect(map['2026-06-18/fetch_error']).toBe(1);
    expect(out[0].seed_as_of_date).toBe('2026-06-19');
  });
});

describe('topPersistentFailTickers — FP-054 54.1 AC4', () => {
  it('counts DISTINCT seed_as_of_date per ticker (same-day dupes collapse)', () => {
    const rows: FetchErrorRow[] = [
      e('2026-06-19', 'AAA', 'fetch_error'),
      e('2026-06-19', 'AAA', 'fetch_error'),
      e('2026-06-18', 'AAA', 'polygon_404'),
      e('2026-06-19', 'BBB', 'fetch_error'),
      e('2026-06-18', 'BBB', 'fetch_error'),
      e('2026-06-17', 'BBB', 'fetch_error'),
    ];
    const top = topPersistentFailTickers(rows, 5);
    expect(top).toEqual([
      { ticker: 'BBB', fail_days: 3 },
      { ticker: 'AAA', fail_days: 2 },
    ]);
  });

  it('respects topN and is null-safe', () => {
    expect(topPersistentFailTickers(null, 5)).toEqual([]);
    const out = topPersistentFailTickers(
      [e('d1', 'A', 's'), e('d1', 'B', 's'), e('d1', 'C', 's')],
      2,
    );
    expect(out).toHaveLength(2);
  });
});