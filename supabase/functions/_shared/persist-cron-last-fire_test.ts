// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { persistCronLastFire } from './persist-cron-last-fire.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const JOB_ID = 'longshort.combiner_shadow_rank.compute';

type UpsertCall = {
  table: string;
  payload: Record<string, unknown>;
  options: Record<string, unknown> | undefined;
};

function makeSupabase(opts: { upsertError?: { message: string } | null; throwOnFrom?: boolean } = {}) {
  const calls: UpsertCall[] = [];
  const supabase = {
    from(table: string) {
      if (opts.throwOnFrom) throw new Error('boom from()');
      return {
        upsert(payload: Record<string, unknown>, options?: Record<string, unknown>) {
          calls.push({ table, payload, options });
          return Promise.resolve({
            data: null,
            error: opts.upsertError ?? null,
          });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

Deno.test('persistCronLastFire: success sets completed_at + outcome=success + failure_reason=null', async () => {
  const { supabase, calls } = makeSupabase();
  await persistCronLastFire(supabase, JOB_ID, 'success');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, 'cron_last_fire');
  assertEquals(calls[0].options, { onConflict: 'job_id' });
  const p = calls[0].payload;
  assertEquals(p.job_id, JOB_ID);
  assertEquals(p.outcome, 'success');
  assertEquals(p.failure_reason, null);
  assert(typeof p.completed_at === 'string' && (p.completed_at as string).endsWith('Z'));
});

Deno.test('persistCronLastFire: failure OMITS completed_at + sets outcome=failed + failure_reason', async () => {
  const { supabase, calls } = makeSupabase();
  await persistCronLastFire(supabase, JOB_ID, 'failed', 'Error: orchestrator_throw');
  assertEquals(calls.length, 1);
  const p = calls[0].payload;
  assertEquals(p.outcome, 'failed');
  assertEquals(p.failure_reason, 'Error: orchestrator_throw');
  assert(!('completed_at' in p), 'completed_at must be omitted on failure to preserve last-success');
});

Deno.test('persistCronLastFire: failure with empty reason coerces to null', async () => {
  const { supabase, calls } = makeSupabase();
  await persistCronLastFire(supabase, JOB_ID, 'failed', '   ');
  assertEquals(calls[0].payload.failure_reason, null);
  assert(!('completed_at' in calls[0].payload));
});

Deno.test('persistCronLastFire: failure reason is trimmed and capped at ~500 chars', async () => {
  const { supabase, calls } = makeSupabase();
  const long = 'x'.repeat(2000);
  await persistCronLastFire(supabase, JOB_ID, 'failed', long);
  const reason = calls[0].payload.failure_reason as string;
  assertEquals(reason.length, 500);
});

Deno.test('persistCronLastFire: DB error is swallowed (no throw)', async () => {
  const { supabase } = makeSupabase({ upsertError: { message: 'permission denied for cron_last_fire' } });
  // Must not throw.
  await persistCronLastFire(supabase, JOB_ID, 'success');
  await persistCronLastFire(supabase, JOB_ID, 'failed', 'whatever');
});

Deno.test('persistCronLastFire: client throw is swallowed (no throw)', async () => {
  const { supabase } = makeSupabase({ throwOnFrom: true });
  // Must not throw — observability-write invariant.
  await persistCronLastFire(supabase, JOB_ID, 'failed', 'orig error');
});