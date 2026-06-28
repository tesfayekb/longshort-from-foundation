// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { captureSignalObservations } from './missingness-capture.ts';
import type { SignalRow } from './signal-types.ts';

/**
 * Minimal mock SupabaseClient — captures the .from(...).upsert(...) call
 * shape and returns a programmable response. DI-pattern parallel to the
 * fetcher tests in this directory (no real network, no real DB).
 */
function makeMock(response: { error: { message: string } | null; count?: number | null }) {
  const calls: Array<{ table: string; payload: unknown; opts: unknown }> = [];
  const supabase = {
    from(table: string) {
      return {
        upsert(payload: unknown, opts: unknown) {
          calls.push({ table, payload, opts });
          return Promise.resolve({
            error: response.error,
            count: response.count ?? null,
          });
        },
      };
    },
  };
  return { supabase: supabase as unknown as Parameters<typeof captureSignalObservations>[0], calls };
}

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    operator_id: '00000000-0000-0000-0000-000000000001',
    signal_id: 'cross_sectional_momentum_12_1',
    ticker: 'AAPL',
    as_of_date: '2026-05-25',
    value: 1.23,
    is_present: true,
    gics_sector: 'Information Technology',
    computed_at: '2026-05-25T20:00:00.000Z',
    ...overrides,
  };
}

Deno.test('(1) empty array short-circuits — returns {inserted:0,error:null}, makes no DB call', async () => {
  const { supabase, calls } = makeMock({ error: null, count: 0 });
  const out = await captureSignalObservations(supabase, []);
  assertEquals(out, { inserted: 0, error: null });
  assertEquals(calls.length, 0);
});

Deno.test('(2) single row → UPSERT called with correct shape + correct conflict target', async () => {
  const { supabase, calls } = makeMock({ error: null, count: 1 });
  const r = row();
  const out = await captureSignalObservations(supabase, [r]);
  assertEquals(out.error, null);
  assertEquals(out.inserted, 1);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, 'signal_observations');
  assertEquals(calls[0].payload, [{
    operator_id: r.operator_id,
    signal_id: r.signal_id,
    as_of_date: r.as_of_date,
    ticker: r.ticker,
    value: r.value,
    is_present: r.is_present,
    gics_sector: r.gics_sector,
    computed_at: r.computed_at,
    // DW-106-c-i passthrough: SignalRow without `carried_forward` coerces
    // to `false` in the payload (matches MIG-101 column DEFAULT).
    carried_forward: false,
    // DEC-071 sub-step 3a passthrough: SignalRow without skip_reason
    // coerces to null (matches the nullable column, byte-equivalent for
    // pre-DEC-071 writers).
    skip_reason: null,
  }]);
  assertEquals(calls[0].opts, {
    onConflict: 'operator_id,signal_id,as_of_date,ticker',
    count: 'exact',
  });
});

Deno.test('(3) multiple rows batched in single UPSERT call (not per-row round-trips)', async () => {
  const { supabase, calls } = makeMock({ error: null, count: 3 });
  const rows = [
    row({ ticker: 'AAPL' }),
    row({ ticker: 'MSFT' }),
    row({ ticker: 'NVDA' }),
  ];
  const out = await captureSignalObservations(supabase, rows);
  assertEquals(out.inserted, 3);
  assertEquals(calls.length, 1);
  assertEquals((calls[0].payload as unknown[]).length, 3);
});

Deno.test('(4) typed-absence row (value:null, is_present:false) threads through verbatim', async () => {
  const { supabase, calls } = makeMock({ error: null, count: 1 });
  const r = row({ value: null, is_present: false });
  await captureSignalObservations(supabase, [r]);
  const payload = calls[0].payload as Array<Record<string, unknown>>;
  assertEquals(payload[0].value, null);
  assertEquals(payload[0].is_present, false);
});

Deno.test('(5) duplicate (operator,signal,date,ticker) in a single batch — passed verbatim; DB UPSERT decides last-writer-wins', async () => {
  // Behavior contract: the function does NOT dedupe in-process. Supabase
  // UPSERT semantics with onConflict do the dedupe at the DB layer
  // (last-writer-wins on the composite PK). This test pins the
  // pass-through behavior so a future "helpful" dedupe doesn't silently
  // change the contract.
  const { supabase, calls } = makeMock({ error: null, count: 1 });
  const r1 = row({ value: 1.0 });
  const r2 = row({ value: 2.0 }); // same PK, different value
  await captureSignalObservations(supabase, [r1, r2]);
  const payload = calls[0].payload as Array<Record<string, unknown>>;
  assertEquals(payload.length, 2);
  assertEquals(payload[0].value, 1.0);
  assertEquals(payload[1].value, 2.0);
});

Deno.test('(6) DB error → returns {inserted:0, error}, does NOT throw', async () => {
  const { supabase } = makeMock({ error: { message: 'permission denied for table signal_observations' } });
  let threw = false;
  let out;
  try {
    out = await captureSignalObservations(supabase, [row()]);
  } catch {
    threw = true;
  }
  assert(!threw, 'captureSignalObservations should never throw');
  assertEquals(out!.inserted, 0);
  assert(out!.error instanceof Error);
  assertStringIncludes(out!.error!.message, 'signal_observations upsert failed');
  assertStringIncludes(out!.error!.message, 'permission denied');
});

Deno.test('(7) null count from PostgREST falls back to rows.length (count is optional)', async () => {
  const { supabase } = makeMock({ error: null, count: null });
  const out = await captureSignalObservations(supabase, [row(), row({ ticker: 'MSFT' })]);
  assertEquals(out.error, null);
  assertEquals(out.inserted, 2);
});

Deno.test('(8) type-level: SignalRow forces value/is_present consistency at the contract layer', () => {
  // The SignalRow type doesn't itself enforce the bi-conditional at the
  // TS level (both `value: null | number` and `is_present: boolean` are
  // independent fields), but the DB CHECK constraint
  // (signal_observations_value_is_present_check from MIG-064) is the
  // structural enforcement. This test documents the layering:
  //   - Type layer: SignalRow shape exists
  //   - Runtime layer: DB CHECK rejects (value:null, is_present:true) and
  //                    (value: <num>, is_present: false)
  // Verifying the DB CHECK requires a live-DB test (out of unit scope);
  // covered by §22.5.1 post-apply evidence on MIG-064.
  const present: SignalRow = row();
  const absent: SignalRow = row({ value: null, is_present: false });
  assertEquals(present.is_present, true);
  assertEquals(absent.is_present, false);
  assertEquals(absent.value, null);
});

Deno.test('(9) DW-106-c-i: carried_forward:true passes through verbatim into upsert payload', async () => {
  const { supabase, calls } = makeMock({ error: null, count: 1 });
  const r = row({ carried_forward: true });
  const out = await captureSignalObservations(supabase, [r]);
  assertEquals(out.error, null);
  const payload = calls[0].payload as Array<Record<string, unknown>>;
  assertEquals(payload[0].carried_forward, true);
});