/**
 * Tests — universeService bulk chokepoint (FP-008 sub-step 8.7 / ACT-113).
 *
 * Coverage:
 *   - feature-flag disabled (row absent OR enabled=false) → null (typed-absence per Surface 3 Option i)
 *   - feature-flag enabled, rows present → partition into eligible_long + eligible_short
 *   - feature-flag enabled, no rows → empty EligibleUniverse with empty refresh_id/quarter_label
 *   - DB error on feature_flags read → throws
 *   - DB error on universe_membership read → throws
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUniverseService } from './universe-service.ts';
import type { UniverseEligibilityRow } from './types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date(Date.UTC(2026, 3, 1));

type StubFlag = { data: { enabled: boolean } | null; error: { message: string } | null };
type StubRows = { data: UniverseEligibilityRow[] | null; error: { message: string } | null };

interface MockFlagBuilder {
  select: () => MockFlagBuilder;
  eq: (col: string, val: unknown) => MockFlagBuilder;
  maybeSingle: () => Promise<StubFlag>;
}

interface MockRowsBuilder {
  select: () => MockRowsBuilder;
  eq: (col: string, val: unknown) => MockRowsBuilder;
  then: <T>(resolve: (v: StubRows) => T) => Promise<T>;
}

function mkRow(
  ticker: string,
  long_eligible: boolean,
  short_eligible: boolean,
): UniverseEligibilityRow {
  return {
    operator_id: OPERATOR_ID,
    ticker,
    as_of_date: '2026-04-01',
    long_eligible,
    short_eligible,
    quarter_label: 'Q2_2026',
    refresh_id: 'rfsh-xyz',
    created_at: '2026-04-01T09:00:00Z',
  };
}

/**
 * Minimal supabase-js .from(table).select(...).eq(...).maybeSingle() / .eq().eq() shape.
 * Returns the configured stub depending on the table name. Each terminal call
 * (maybeSingle OR awaited query) yields {data,error}.
 */
function makeStubAdmin(flagResp: StubFlag, rowsResp: StubRows) {
  const calls: string[] = [];
  return {
    calls,
    admin: {
      from(table: string) {
        calls.push(`from:${table}`);
        if (table === 'feature_flags') {
          const builder: MockFlagBuilder = {
            select: () => builder,
            eq: () => builder,
            maybeSingle: async () => flagResp,
          };
          return builder;
        }
        if (table === 'universe_membership') {
          const builder: MockRowsBuilder = {
            select: () => builder,
            eq: () => builder,
            then: (resolve: (v: StubRows) => unknown) => Promise.resolve(rowsResp).then(resolve),
          };
          return builder;
        }
        throw new Error(`unexpected table: ${table}`);
      },
    } as unknown as SupabaseClient,
  };
}

describe('universeService.getEligibleUniverse', () => {
  it('returns null when feature_flags row absent (typed-absence per Surface 3 Option i)', async () => {
    const { admin } = makeStubAdmin(
      { data: null, error: null },
      { data: [], error: null },
    );
    const svc = createUniverseService({ supabaseAdmin: admin });
    const result = await svc.getEligibleUniverse(AS_OF, OPERATOR_ID);
    expect(result).toBeNull();
  });

  it('returns null when feature flag enabled=false', async () => {
    const { admin } = makeStubAdmin(
      { data: { enabled: false }, error: null },
      { data: [], error: null },
    );
    const svc = createUniverseService({ supabaseAdmin: admin });
    const result = await svc.getEligibleUniverse(AS_OF, OPERATOR_ID);
    expect(result).toBeNull();
  });

  it('partitions rows into eligible_long + eligible_short when flag enabled', async () => {
    const rows = [
      mkRow('AAPL', true, true),
      mkRow('MSFT', true, false),
      mkRow('GME', false, true),
    ];
    const { admin } = makeStubAdmin(
      { data: { enabled: true }, error: null },
      { data: rows, error: null },
    );
    const svc = createUniverseService({ supabaseAdmin: admin });
    const result = await svc.getEligibleUniverse(AS_OF, OPERATOR_ID);
    expect(result).not.toBeNull();
    expect(result!.as_of_date).toBe('2026-04-01');
    expect(result!.eligible_long.map((r) => r.ticker)).toEqual(['AAPL', 'MSFT']);
    expect(result!.eligible_short.map((r) => r.ticker)).toEqual(['AAPL', 'GME']);
    expect(result!.refresh_id).toBe('rfsh-xyz');
    expect(result!.quarter_label).toBe('Q2_2026');
  });

  it('returns empty EligibleUniverse with empty refresh_id when enabled but no rows', async () => {
    const { admin } = makeStubAdmin(
      { data: { enabled: true }, error: null },
      { data: [], error: null },
    );
    const svc = createUniverseService({ supabaseAdmin: admin });
    const result = await svc.getEligibleUniverse(AS_OF, OPERATOR_ID);
    expect(result).not.toBeNull();
    expect(result!.eligible_long).toEqual([]);
    expect(result!.eligible_short).toEqual([]);
    expect(result!.refresh_id).toBe('');
    expect(result!.quarter_label).toBe('');
  });

  it('throws when feature_flags read errors', async () => {
    const { admin } = makeStubAdmin(
      { data: null, error: { message: 'db unavailable' } },
      { data: [], error: null },
    );
    const svc = createUniverseService({ supabaseAdmin: admin });
    await expect(svc.getEligibleUniverse(AS_OF, OPERATOR_ID)).rejects.toThrow(/feature_flags read failed/);
  });

  it('throws when universe_membership query errors', async () => {
    const { admin } = makeStubAdmin(
      { data: { enabled: true }, error: null },
      { data: null, error: { message: 'rls denied' } },
    );
    const svc = createUniverseService({ supabaseAdmin: admin });
    await expect(svc.getEligibleUniverse(AS_OF, OPERATOR_ID)).rejects.toThrow(/universe_membership query failed/);
  });
});