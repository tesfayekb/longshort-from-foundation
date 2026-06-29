// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * trading-pause_test — FP-062 6I.5 / DW-144 §8.9.
 *
 * Covers:
 *   - pauseAccount calls kill_switch_system_pause with system-attributed args
 *     (strategy_key='longshort', reason, source_ref, operator_id)
 *   - pauseAccount throws on RPC error (fail-closed)
 *   - pauseAccount validates required fields
 *   - isAccountPaused returns true for soft_paused/hard_paused/liquidating
 *   - isAccountPaused returns false for active / no row
 *   - isAccountPaused throws on read error (fail-closed)
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isAccountPaused,
  LONGSHORT_STRATEGY_KEY,
  pauseAccount,
  type SupabaseLike,
} from './trading-pause.ts';

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const supabase: SupabaseLike = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
    from: () => {
      throw new Error('from() not expected in this test');
    },
  };
  return { supabase, calls };
}

function mockRead(state: string | null, error: { message: string } | null = null) {
  const calls: Array<{ table: string; operator_id: string; strategy_key: string }> = [];
  const supabase: SupabaseLike = {
    rpc: () => {
      throw new Error('rpc() not expected in this test');
    },
    from: (table) => ({
      select: (_cols: string) => ({
        eq: (_c1: string, v1: string) => ({
          eq: (_c2: string, v2: string) => ({
            maybeSingle: () => {
              calls.push({ table, operator_id: v1, strategy_key: v2 });
              return Promise.resolve({
                data: state === null ? null : { state },
                error,
              });
            },
          }),
        }),
      }),
    }),
  };
  return { supabase, calls };
}

Deno.test('pauseAccount → invokes RPC with system attribution', async () => {
  const { supabase, calls } = mockRpc({ data: { success: true }, error: null });
  await pauseAccount(supabase, {
    reason: 'pdt_block fired',
    source_ref: 'reconciliation_event:abc-123',
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, 'kill_switch_system_pause');
  assertEquals(calls[0].args.p_strategy_key, LONGSHORT_STRATEGY_KEY);
  assertEquals(calls[0].args.p_reason, 'pdt_block fired');
  assertEquals(calls[0].args.p_source_ref, 'reconciliation_event:abc-123');
  assertEquals(
    calls[0].args.p_operator_id,
    '00000000-0000-0000-0000-000000000001',
  );
});

Deno.test('pauseAccount → passes through explicit operator_id', async () => {
  const { supabase, calls } = mockRpc({ data: null, error: null });
  await pauseAccount(supabase, {
    reason: 'r',
    source_ref: 's',
    operator_id: '11111111-1111-1111-1111-111111111111',
  });
  assertEquals(calls[0].args.p_operator_id, '11111111-1111-1111-1111-111111111111');
});

Deno.test('pauseAccount → throws on RPC error (fail-closed)', async () => {
  const { supabase } = mockRpc({ error: { message: 'insufficient_privilege' } });
  await assertRejects(
    () => pauseAccount(supabase, { reason: 'r', source_ref: 's' }),
    Error,
    'insufficient_privilege',
  );
});

Deno.test('pauseAccount → requires reason and source_ref', async () => {
  const { supabase } = mockRpc({ data: null, error: null });
  await assertRejects(
    () => pauseAccount(supabase, { reason: '', source_ref: 's' }),
    Error,
    'required',
  );
  await assertRejects(
    () => pauseAccount(supabase, { reason: 'r', source_ref: '' }),
    Error,
    'required',
  );
});

Deno.test('isAccountPaused → true for soft_paused', async () => {
  const { supabase, calls } = mockRead('soft_paused');
  const paused = await isAccountPaused(supabase);
  assertEquals(paused, true);
  assertEquals(calls[0].table, 'kill_switches');
  assertEquals(calls[0].strategy_key, LONGSHORT_STRATEGY_KEY);
});

Deno.test('isAccountPaused → true for hard_paused', async () => {
  const { supabase } = mockRead('hard_paused');
  assertEquals(await isAccountPaused(supabase), true);
});

Deno.test('isAccountPaused → true for liquidating', async () => {
  const { supabase } = mockRead('liquidating');
  assertEquals(await isAccountPaused(supabase), true);
});

Deno.test('isAccountPaused → false for active', async () => {
  const { supabase } = mockRead('active');
  assertEquals(await isAccountPaused(supabase), false);
});

Deno.test('isAccountPaused → false when no row exists', async () => {
  const { supabase } = mockRead(null);
  assertEquals(await isAccountPaused(supabase), false);
});

Deno.test('isAccountPaused → throws on read error (fail-closed)', async () => {
  const { supabase } = mockRead(null, { message: 'connection refused' });
  await assertRejects(
    () => isAccountPaused(supabase),
    Error,
    'connection refused',
  );
});