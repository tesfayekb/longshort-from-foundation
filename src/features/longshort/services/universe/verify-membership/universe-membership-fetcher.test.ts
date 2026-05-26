/**
 * Tests — live UniverseMembershipFetcher (FP-008 sub-step 8.7 / ACT-113).
 *
 * Coverage:
 *   (a) row present + no exclusion → in_universe=true; excluded=false
 *   (b) row present + exclusion firing → in_universe=true; excluded=true
 *       with exclusion_reasons populated
 *   (c) no row → in_universe=false; excluded=false
 *   (d) DB error propagated as thrown Error
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
  it('returns in_universe=true / excluded=false when row exists and no exclusion', async () => {
    const client = makeStub(
      { data: { long_eligible: true, short_eligible: true }, error: null },
      { data: null, error: null },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('AAPL', TS);
    expect(result.symbol).toBe('AAPL');
    expect(result.in_universe).toBe(true);
    expect(result.excluded).toBe(false);
    expect(result.exclusion_reasons).toEqual([]);
    expect(result.fetched_at).toBe(TS);
  });

  it('returns excluded=true with exclusion_reasons when hard_exclusions row exists', async () => {
    const client = makeStub(
      { data: { long_eligible: false, short_eligible: false }, error: null },
      { data: { firing_rules: ['3.3a', '3.3d'] }, error: null },
    );
    const fetcher = createUniverseMembershipFetcher({
      supabaseAdmin: client,
      operator_id: OPERATOR_ID,
    });
    const result = await fetcher.fetchUniverseMembership('MSFT', TS);
    expect(result.in_universe).toBe(true);
    expect(result.excluded).toBe(true);
    expect(result.exclusion_reasons).toEqual(['3.3a', '3.3d']);
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
    const result = await fetcher.fetchUniverseMembership('XYZ', TS);
    expect(result.in_universe).toBe(false);
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
    await expect(fetcher.fetchUniverseMembership('AAPL', TS)).rejects.toThrow(
      /universe_membership query failed/,
    );
  });
});