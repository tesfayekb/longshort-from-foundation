/**
 * Tests for metrics-emitter.ts — FP-008 sub-step 8.9 / ACT-115.
 *
 * Coverage:
 *   (a) groupByReason behavior via emitter — 7-bucket FilterRejectionReason shape;
 *       7-bucket HardExclusionReason shape;
 *   (b) empty-array → empty jsonb object (no synthetic zero-filled buckets);
 *   (c) UPDATE invoked with correct refresh_id .eq() filter;
 *   (d) Supabase error surfaced as thrown Error (caller decides observability path).
 */
import { describe, it, expect, vi } from 'vitest';
import { makeMetricsEmitter } from './metrics-emitter.ts';
import type { FilterRejectionReason } from '../filters/types.ts';
import type { HardExclusionReason } from '../hard-exclusions/types.ts';

function makeStubSupabase(updateResult: { error: { message: string } | null } = { error: null }) {
  const eq = vi.fn().mockResolvedValue(updateResult);
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, from, update, eq };
}

describe('makeMetricsEmitter', () => {
  it('groups 7-bucket filter rejection reasons and updates universe_refresh_log row', async () => {
    const stub = makeStubSupabase();
    const emitter = makeMetricsEmitter({ supabaseAdmin: stub.client });

    const filterReasons: FilterRejectionReason[] = [
      'missing_filter_input_data',
      'below_min_avg_daily_dollar_volume',
      'below_min_avg_daily_dollar_volume',
      'below_min_share_price',
      'below_min_market_cap',
      'below_min_listing_age',
      'adr_excluded',
      'reit_excluded',
    ];
    const hxReasons: HardExclusionReason[] = [
      'earnings_window',
      'earnings_window',
      'ma_target',
      'ma_large_acquirer',
      'halted_5d_lookback',
      'htb_no_locate',
      'htb_borrow_rate_excessive',
      'short_interest_excessive',
    ];

    await emitter.emitRefreshMetrics({
      refresh_id: 'refresh-uuid-1',
      filter_rejection_reasons: filterReasons,
      hard_exclusion_reasons: hxReasons,
    });

    expect(stub.from).toHaveBeenCalledWith('universe_refresh_log');
    expect(stub.update).toHaveBeenCalledTimes(1);
    const updateArg = stub.update.mock.calls[0][0];
    expect(updateArg.filter_rejection_counts).toEqual({
      missing_filter_input_data: 1,
      below_min_avg_daily_dollar_volume: 2,
      below_min_share_price: 1,
      below_min_market_cap: 1,
      below_min_listing_age: 1,
      adr_excluded: 1,
      reit_excluded: 1,
    });
    expect(updateArg.hard_exclusion_counts).toEqual({
      earnings_window: 2,
      ma_target: 1,
      ma_large_acquirer: 1,
      halted_5d_lookback: 1,
      htb_no_locate: 1,
      htb_borrow_rate_excessive: 1,
      short_interest_excessive: 1,
    });
    expect(stub.eq).toHaveBeenCalledWith('refresh_id', 'refresh-uuid-1');
  });

  it('produces empty jsonb objects when no rejections/firings (no synthetic zero buckets)', async () => {
    const stub = makeStubSupabase();
    const emitter = makeMetricsEmitter({ supabaseAdmin: stub.client });
    await emitter.emitRefreshMetrics({
      refresh_id: 'refresh-uuid-empty',
      filter_rejection_reasons: [],
      hard_exclusion_reasons: [],
    });
    const updateArg = stub.update.mock.calls[0][0];
    expect(updateArg.filter_rejection_counts).toEqual({});
    expect(updateArg.hard_exclusion_counts).toEqual({});
  });

  it('partial-data resilience — keys present only for reasons that fired', async () => {
    const stub = makeStubSupabase();
    const emitter = makeMetricsEmitter({ supabaseAdmin: stub.client });
    await emitter.emitRefreshMetrics({
      refresh_id: 'refresh-uuid-partial',
      filter_rejection_reasons: ['adr_excluded', 'adr_excluded', 'reit_excluded'],
      hard_exclusion_reasons: ['earnings_window'],
    });
    const updateArg = stub.update.mock.calls[0][0];
    expect(updateArg.filter_rejection_counts).toEqual({ adr_excluded: 2, reit_excluded: 1 });
    expect(updateArg.hard_exclusion_counts).toEqual({ earnings_window: 1 });
  });

  it('throws when supabase update returns error', async () => {
    const stub = makeStubSupabase({ error: { message: 'rls_denied' } });
    const emitter = makeMetricsEmitter({ supabaseAdmin: stub.client });
    await expect(
      emitter.emitRefreshMetrics({
        refresh_id: 'refresh-uuid-err',
        filter_rejection_reasons: [],
        hard_exclusion_reasons: [],
      }),
    ).rejects.toThrow(/rls_denied/);
  });
});