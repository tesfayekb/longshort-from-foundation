/**
 * DW-shadow-visibility 1c — tests for the pure helper that powers
 * useCronLastFire's keyed lookup. Network behaviour rides on React
 * Query / the supabase client; the staleness verdict itself is
 * covered by cron-staleness.test.ts (UI-001) and is intentionally
 * NOT duplicated here.
 */
import { describe, it, expect } from 'vitest';
import {
  toCronLastFireMap,
  type CronLastFireRow,
} from '@/features/longshort/hooks/useCronLastFire';

const ROW_A: CronLastFireRow = {
  job_id: 'longshort.combiner_shadow_rank.compute',
  completed_at: '2026-06-19T23:00:05Z',
  outcome: 'success',
  failure_reason: null,
  updated_at: '2026-06-19T23:00:05Z',
};

const ROW_B: CronLastFireRow = {
  job_id: 'longshort.short_interest_carry.compute',
  completed_at: null,
  outcome: 'failed',
  failure_reason: 'orchestrator_throw: boom',
  updated_at: '2026-06-19T22:30:01Z',
};

describe('toCronLastFireMap (DW-shadow-visibility 1c)', () => {
  it('returns an empty Map for null / undefined / empty input', () => {
    expect(toCronLastFireMap(null).size).toBe(0);
    expect(toCronLastFireMap(undefined).size).toBe(0);
    expect(toCronLastFireMap([]).size).toBe(0);
  });

  it('keys rows by job_id with O(1) lookup semantics', () => {
    const m = toCronLastFireMap([ROW_A, ROW_B]);
    expect(m.size).toBe(2);
    expect(m.get(ROW_A.job_id)).toEqual(ROW_A);
    expect(m.get(ROW_B.job_id)).toEqual(ROW_B);
    expect(m.get('does.not.exist')).toBeUndefined();
  });

  it('last write wins on duplicate job_id (server should never send this; defensive)', () => {
    const dup: CronLastFireRow = { ...ROW_A, outcome: 'failed', failure_reason: 'later' };
    const m = toCronLastFireMap([ROW_A, dup]);
    expect(m.size).toBe(1);
    expect(m.get(ROW_A.job_id)?.outcome).toBe('failed');
    expect(m.get(ROW_A.job_id)?.failure_reason).toBe('later');
  });

  it('skips entries without a string job_id', () => {
    const bad = { job_id: null, completed_at: null, outcome: null, failure_reason: null, updated_at: '' } as unknown as CronLastFireRow;
    const m = toCronLastFireMap([ROW_A, bad]);
    expect(m.size).toBe(1);
    expect(m.get(ROW_A.job_id)).toEqual(ROW_A);
  });
});