/**
 * Tests — live UniverseMembershipFetcher (FP-008 sub-step 8.7 / ACT-113;
 * FP-008.3 side-awareness contract).
 *
 * Coverage:
 *   (a) row present + no exclusion → in_universe=true; excluded=false (long)
 *   (b) row present + exclusion firing → in_universe=true; excluded=true
 *       with exclusion_reasons populated (side-filtered)
 *   (c) no row → in_universe=false; excluded=false
 *   (d) DB error propagated as thrown Error
 *   (e) FP-008.3 — short-only §3.3d firing: long lookup sees clean,
 *       short lookup sees excluded
 *   (f) FP-008.3 — applies_to='both' firing: both sides see excluded
 *   (g) FP-008.3 — eligible_for_side derived from {side}_eligible column
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUniverseMembershipFetcher } from './universe-membership-fetcher.ts';

const TS = new Date('2026-04-01T13:30:00.000Z');
const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

function makeStub(
  membership: { data: unknown; error: { message: string } | null },
  exclusion: { data: unknown; error: { message: string } | null },
): SupabaseClient {
  const fromHandler = (table: string) => {
    const result = table === 'universe_membership' ? membership : exclusion;
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => result,
    };
    return chain as unknown as ReturnType<SupabaseClient['from']>;
  };
  return { from: fromHandler } as unknown as SupabaseClient;
}

describe('createUniverseMembershipFetcher', () => {
  it('returns in_universe=true / excluded=false when row exists and no exclusion (long)', async () => {
    const client = makeStub(
      { data: { long_eligible: true, short_eligible: true }, error: null },
      { data: null, error: null },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('AAPL', 'long', TS);
    expect(result.symbol).toBe('AAPL');
    expect(result.side).toBe('long');
    expect(result.in_universe).toBe(true);
    expect(result.eligible_for_side).toBe(true);
    expect(result.excluded).toBe(false);
    expect(result.exclusion_reasons).toEqual([]);
    expect(result.fetched_at).toBe(TS);
  });

  it('returns excluded=true with exclusion_reasons when both-side exclusion firing exists', async () => {
    const client = makeStub(
      { data: { long_eligible: false, short_eligible: false }, error: null },
      {
        data: {
          firing_rules: ['3.3a'],
          firing_reasons: {
            '3.3a': { reason: 'earnings_window', applies_to: 'both', evidence: 'earnings 2026-04-29' },
          },
        },
        error: null,
      },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('MSFT', 'long', TS);
    expect(result.in_universe).toBe(true);
    expect(result.excluded).toBe(true);
    expect(result.exclusion_reasons).toEqual(['3.3a']);
  });

  it('returns in_universe=false when no universe_membership row (Surface 3 Option i null-narrowing)', async () => {
    const client = makeStub(
      { data: null, error: null },
      { data: null, error: null },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('XYZ', 'long', TS);
    expect(result.in_universe).toBe(false);
    expect(result.eligible_for_side).toBe(false);
    expect(result.excluded).toBe(false);
    expect(result.exclusion_reasons).toEqual([]);
  });

  it('throws when universe_membership query errors (no phantom-success swallow)', async () => {
    const client = makeStub(
      { data: null, error: { message: 'RLS violation' } },
      { data: null, error: null },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    await expect(fetcher.fetchUniverseMembership('AAPL', 'long', TS)).rejects.toThrow(
      /universe_membership query failed/,
    );
  });

  it('FP-008.3: short-only §3.3d firing is invisible to side=long', async () => {
    const client = makeStub(
      { data: { long_eligible: true, short_eligible: false }, error: null },
      {
        data: {
          firing_rules: ['3.3d'],
          firing_reasons: {
            '3.3d': { reason: 'htb_no_locate', applies_to: 'short', evidence: 'no locate record' },
          },
        },
        error: null,
      },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('AAPL', 'long', TS);
    expect(result.side).toBe('long');
    expect(result.eligible_for_side).toBe(true);
    expect(result.excluded).toBe(false);
    expect(result.exclusion_reasons).toEqual([]);
  });

  it('FP-008.3: short-only §3.3d firing surfaces on side=short', async () => {
    const client = makeStub(
      { data: { long_eligible: true, short_eligible: false }, error: null },
      {
        data: {
          firing_rules: ['3.3d'],
          firing_reasons: {
            '3.3d': { reason: 'htb_no_locate', applies_to: 'short', evidence: 'no locate record' },
          },
        },
        error: null,
      },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('AAPL', 'short', TS);
    expect(result.side).toBe('short');
    expect(result.eligible_for_side).toBe(false);
    expect(result.excluded).toBe(true);
    expect(result.exclusion_reasons).toEqual(['3.3d']);
  });

  it('FP-008.3: applies_to=both firing surfaces on both sides', async () => {
    const stub = (side: 'long' | 'short') => makeStub(
      { data: { long_eligible: false, short_eligible: false }, error: null },
      {
        data: {
          firing_rules: ['3.3b'],
          firing_reasons: {
            '3.3b': { reason: 'ma_target', applies_to: 'both', evidence: 'M&A target' },
          },
        },
        error: null,
      },
    );
    for (const side of ['long', 'short'] as const) {
      const fetcher = createUniverseMembershipFetcher({
        supabaseAdmin: stub(side),
        operator_id: OPERATOR_ID,
      });
      const result = await fetcher.fetchUniverseMembership('TGT', side, TS);
      expect(result.excluded).toBe(true);
      expect(result.exclusion_reasons).toEqual(['3.3b']);
    }
  });

  it('FP-008.3: mixed firings — only side-applicable rules surface (long sees only the both-side rule; short sees both)', async () => {
    const client = makeStub(
      { data: { long_eligible: true, short_eligible: false }, error: null },
      {
        data: {
          firing_rules: ['3.3a', '3.3d'],
          firing_reasons: {
            '3.3a': { reason: 'earnings_window', applies_to: 'both', evidence: '' },
            '3.3d': { reason: 'htb_no_locate', applies_to: 'short', evidence: '' },
          },
        },
        error: null,
      },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const longRes = await fetcher.fetchUniverseMembership('AAPL', 'long', TS);
    expect(longRes.exclusion_reasons).toEqual(['3.3a']);
    const shortRes = await fetcher.fetchUniverseMembership('AAPL', 'short', TS);
    expect(shortRes.exclusion_reasons).toEqual(['3.3a', '3.3d']);
  });

  it('FP-008.3: eligible_for_side reads the correct universe_membership column per side', async () => {
    const client = makeStub(
      { data: { long_eligible: true, short_eligible: false }, error: null },
      { data: null, error: null },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    expect((await fetcher.fetchUniverseMembership('AAPL', 'long', TS)).eligible_for_side).toBe(true);
    expect((await fetcher.fetchUniverseMembership('AAPL', 'short', TS)).eligible_for_side).toBe(false);
  });
});