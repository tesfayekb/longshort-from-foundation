/**
 * FP-029 — pure-helper tests for useEligibilityCoverage.
 */
import { describe, it, expect } from 'vitest';
import {
  SUB_RULES,
  isCoverageComplete,
  type EligibilityCoverageRow,
} from '@/features/longshort/hooks/useEligibilityCoverage';

function makeRow(overrides: Partial<EligibilityCoverageRow> = {}): EligibilityCoverageRow {
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    as_of_date: '2026-05-30',
    covers_3_3a: false,
    covers_3_3b: false,
    covers_3_3c: false,
    covers_3_3d: true,
    covers_3_3e: false,
    written_at: '2026-06-03T08:14:44Z',
    written_by: null,
    ...overrides,
  };
}

describe('SUB_RULES (FP-029)', () => {
  it('enumerates all five §3.3 sub-rules in schema order', () => {
    expect(SUB_RULES.map((r) => r.key)).toEqual([
      'covers_3_3a',
      'covers_3_3b',
      'covers_3_3c',
      'covers_3_3d',
      'covers_3_3e',
    ]);
  });

  it('exposes a §-coded label for each rule', () => {
    for (const rule of SUB_RULES) {
      expect(rule.code).toMatch(/^§3\.3[a-e]$/);
      expect(rule.label.length).toBeGreaterThan(0);
    }
  });
});

describe('isCoverageComplete (FP-029)', () => {
  it('returns false when only §3.3d is wired (today truth — DW-063)', () => {
    expect(isCoverageComplete(makeRow())).toBe(false);
  });

  it('returns false when any single sub-rule is false', () => {
    expect(
      isCoverageComplete(
        makeRow({
          covers_3_3a: true,
          covers_3_3b: true,
          covers_3_3c: true,
          covers_3_3d: true,
          covers_3_3e: false,
        }),
      ),
    ).toBe(false);
  });

  it('returns true only when every sub-rule is wired', () => {
    expect(
      isCoverageComplete(
        makeRow({
          covers_3_3a: true,
          covers_3_3b: true,
          covers_3_3c: true,
          covers_3_3d: true,
          covers_3_3e: true,
        }),
      ),
    ).toBe(true);
  });
});