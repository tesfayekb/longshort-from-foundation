// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  aggregateSkipCounts,
  persistSignalComputeLog,
} from './persist-signal-compute-log.ts';
import type { SignalOrchestratorResult } from '../_shared/longshort-signals/shared/signal-orchestrator-types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF_DATE = '2026-05-25';
const TS = '2026-05-25T20:00:00.000Z';

type InsertCall = { table: string; payload: Record<string, unknown> };

function makeSupabase(opts: { insertError?: { message: string } | null; runId?: string | null }) {
  const calls: InsertCall[] = [];
  const supabase = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          calls.push({ table, payload });
          return {
            select(_cols: string) {
              return {
                single() {
                  if (opts.insertError) {
                    return Promise.resolve({ data: null, error: opts.insertError });
                  }
                  return Promise.resolve({
                    data: { run_id: opts.runId ?? 'mock-run-id-1' },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

function baseResult(overrides: Partial<SignalOrchestratorResult> = {}): SignalOrchestratorResult {
  return {
    outcome: 'completed',
    signal_id: 'cross_sectional_momentum_12_1',
    as_of_date: AS_OF_DATE,
    universe_size: 500,
    persisted_count: 480,
    skipped: [],
    started_at: TS,
    completed_at: TS,
    ...overrides,
  };
}

// ── aggregateSkipCounts ────────────────────────────────────────────────────

Deno.test('aggregateSkipCounts: empty array yields all-zero stable shape', () => {
  const out = aggregateSkipCounts([]);
  assertEquals(out, {
    insufficient_history: 0,
    missing_sector: 0,
    fetch_error: 0,
    singleton_sector: 0,
    data_unavailable: 0,
    subscription_gated: 0,
    missing_shares_outstanding: 0,
    no_qualifying_transactions: 0,
    no_qualifying_flow: 0,
    no_recent_earnings: 0,
    pead_panel_below_floor: 0,
    zero_dispersion: 0,
    no_revisions_in_window: 0,
    revision_prior_unavailable: 0,
    zero_magnitude_only: 0,
    no_articles_in_window: 0,
    no_catalyst_events_in_window: 0,
    ticker_to_cik_unresolved: 0,
    no_primary_doc: 0,
    gated_by_news: 0,
    gated_by_catalyst: 0,
    gate_inputs_unavailable: 0,
  });
});

Deno.test('aggregateSkipCounts: per-reason counts aggregate correctly', () => {
  const out = aggregateSkipCounts([
    { ticker: 'A', reason: 'insufficient_history' },
    { ticker: 'B', reason: 'insufficient_history' },
    { ticker: 'C', reason: 'missing_sector' },
    { ticker: 'D', reason: 'fetch_error' },
    { ticker: 'E', reason: 'singleton_sector' },
    { ticker: 'F', reason: 'singleton_sector' },
    { ticker: 'G', reason: 'singleton_sector' },
  ]);
  assertEquals(out, {
    insufficient_history: 2,
    missing_sector: 1,
    fetch_error: 1,
    singleton_sector: 3,
    data_unavailable: 0,
    subscription_gated: 0,
    missing_shares_outstanding: 0,
    no_qualifying_transactions: 0,
    no_qualifying_flow: 0,
    no_recent_earnings: 0,
    pead_panel_below_floor: 0,
    zero_dispersion: 0,
    no_revisions_in_window: 0,
    revision_prior_unavailable: 0,
    zero_magnitude_only: 0,
    no_articles_in_window: 0,
    no_catalyst_events_in_window: 0,
    ticker_to_cik_unresolved: 0,
    no_primary_doc: 0,
    gated_by_news: 0,
    gated_by_catalyst: 0,
    gate_inputs_unavailable: 0,
  });
});

Deno.test('aggregateSkipCounts: always emits all four enum keys even with single-reason input', () => {
  const out = aggregateSkipCounts([{ ticker: 'A', reason: 'fetch_error' }]);
  assert('insufficient_history' in out);
  assert('missing_sector' in out);
  assert('fetch_error' in out);
  assert('singleton_sector' in out);
  assertEquals(out.fetch_error, 1);
  assertEquals(out.insufficient_history, 0);
});

// ── persistSignalComputeLog ────────────────────────────────────────────────

Deno.test('persistSignalComputeLog: writes one row with full result fields on success', async () => {
  const { supabase, calls } = makeSupabase({ runId: 'r-1' });
  const result = baseResult({
    skipped: [
      { ticker: 'A', reason: 'insufficient_history' },
      { ticker: 'B', reason: 'fetch_error' },
    ],
  });
  const { run_id, persist_error } = await persistSignalComputeLog(supabase, result, OPERATOR_ID);
  assertEquals(persist_error, null);
  assertEquals(run_id, 'r-1');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, 'signal_compute_log');
  const p = calls[0].payload;
  assertEquals(p.signal_id, 'cross_sectional_momentum_12_1');
  assertEquals(p.as_of_date, AS_OF_DATE);
  assertEquals(p.outcome, 'completed');
  assertEquals(p.universe_size, 500);
  assertEquals(p.persisted_count, 480);
  assertEquals(p.operator_id, OPERATOR_ID);
  assertEquals(p.started_at, TS);
  assertEquals(p.completed_at, TS);
  assertEquals(p.failure_reason, null);
  assertEquals((p.skip_counts as Record<string, number>).insufficient_history, 1);
  assertEquals((p.skip_counts as Record<string, number>).fetch_error, 1);
});

Deno.test('persistSignalComputeLog: failure outcome propagates failure_reason verbatim', async () => {
  const { supabase, calls } = makeSupabase({});
  const result = baseResult({
    outcome: 'failed',
    universe_size: 0,
    persisted_count: 0,
    failure_reason: 'empty_universe',
  });
  const { run_id, persist_error } = await persistSignalComputeLog(supabase, result, OPERATOR_ID);
  assertEquals(persist_error, null);
  assertEquals(run_id, 'mock-run-id-1');
  assertEquals(calls[0].payload.outcome, 'failed');
  assertEquals(calls[0].payload.failure_reason, 'empty_universe');
});

Deno.test('persistSignalComputeLog: returns persist_error on DB error, run_id is null', async () => {
  const { supabase, calls } = makeSupabase({ insertError: { message: 'permission denied for table signal_compute_log' } });
  const result = baseResult();
  const { run_id, persist_error } = await persistSignalComputeLog(supabase, result, OPERATOR_ID);
  assertEquals(run_id, null);
  assert(persist_error instanceof Error);
  assert(persist_error!.message.includes('permission denied'));
  assertEquals(calls.length, 1);
});

Deno.test('persistSignalComputeLog: skip_counts JSON shape is stable when no skips', async () => {
  const { supabase, calls } = makeSupabase({});
  await persistSignalComputeLog(supabase, baseResult({ skipped: [] }), OPERATOR_ID);
  assertEquals(calls[0].payload.skip_counts, {
    insufficient_history: 0,
    missing_sector: 0,
    fetch_error: 0,
    singleton_sector: 0,
    data_unavailable: 0,
    subscription_gated: 0,
    missing_shares_outstanding: 0,
    no_qualifying_transactions: 0,
    no_qualifying_flow: 0,
    no_recent_earnings: 0,
    pead_panel_below_floor: 0,
    zero_dispersion: 0,
    no_revisions_in_window: 0,
    revision_prior_unavailable: 0,
    zero_magnitude_only: 0,
    no_articles_in_window: 0,
    no_catalyst_events_in_window: 0,
    ticker_to_cik_unresolved: 0,
    no_primary_doc: 0,
    gated_by_news: 0,
    gated_by_catalyst: 0,
    gate_inputs_unavailable: 0,
  });
});

// ── FP-022 / C-F4: skipped_detail per-ticker round-trip ────────────────────

Deno.test('persistSignalComputeLog: skipped_detail round-trips the SignalSkip[] verbatim', async () => {
  const { supabase, calls } = makeSupabase({});
  const skipped = [
    { ticker: 'AAPL', reason: 'insufficient_history' as const, detail: '215 bars, 252 required' },
    { ticker: 'TSLA', reason: 'fetch_error' as const },
    { ticker: 'ZZZZ', reason: 'missing_sector' as const },
  ];
  await persistSignalComputeLog(supabase, baseResult({ skipped }), OPERATOR_ID);
  // skipped_detail carries the raw array, distinct from the aggregate skip_counts.
  assertEquals(calls[0].payload.skipped_detail, skipped);
  // Aggregate still present and correct (both coexist).
  assertEquals((calls[0].payload.skip_counts as Record<string, number>).insufficient_history, 1);
  assertEquals((calls[0].payload.skip_counts as Record<string, number>).fetch_error, 1);
  assertEquals((calls[0].payload.skip_counts as Record<string, number>).missing_sector, 1);
});

Deno.test('persistSignalComputeLog: skipped_detail is [] when no skips (clean fire)', async () => {
  const { supabase, calls } = makeSupabase({});
  await persistSignalComputeLog(supabase, baseResult({ skipped: [] }), OPERATOR_ID);
  assertEquals(calls[0].payload.skipped_detail, []);
});