// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * DW-106-c-i — carry orchestrator unit tests (DI mocks; no real Supabase).
 *
 * Covers:
 *   - 4 decider outcomes mapped to the right row + skip
 *   - emit_absence gics_sector = current universe value (NOT anchor)
 *   - Single-batch capture (zero-partial); computed_at == as_of.toISOString()
 *   - Result counts (carried/past_bound/no_publication/skipped_native)
 *   - Empty-universe → failed outcome
 *   - Persistence error → failed outcome with failure_reason
 *   - Bulk priors read pagination (fetchAllRows short-read terminates)
 */

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createCarryOrchestrator,
  SIGNAL_ID,
} from './carry-orchestrator.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-18T22:30:00Z');
const AS_OF_DATE = '2026-06-18';
const LATEST_UNIVERSE_DATE = '2026-06-15';

type PriorRow = {
  ticker: string;
  as_of_date: string;
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
  carried_forward: boolean;
};

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  priors?: PriorRow[];
  latestError?: { message: string } | null;
  universeError?: { message: string } | null;
  priorsError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const calls = {
    upsertPayloads: [] as Array<Array<Record<string, unknown>>>,
    fromTables: [] as string[],
    priorsRangeCalls: [] as Array<[number, number]>,
  };
  const universe = opts.universe ?? [];
  const priors = opts.priors ?? [];
  const latestDate = universe.length > 0 ? LATEST_UNIVERSE_DATE : null;

  const supabase = {
    from(table: string) {
      calls.fromTables.push(table);
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const builder: Record<string, unknown> = {
          select(cols: string) {
            mode = cols === 'as_of_date' ? 'latest' : 'rows';
            return builder;
          },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(onFul: unknown, onRej: unknown) { return resolve().then(onFul, onRej); },
        };
        const resolve = () => {
          if (mode === 'latest') {
            if (opts.latestError) return Promise.resolve({ data: null, error: opts.latestError });
            return Promise.resolve({
              data: latestDate ? [{ as_of_date: latestDate }] : [],
              error: null,
            });
          }
          if (opts.universeError) return Promise.resolve({ data: null, error: opts.universeError });
          return Promise.resolve({ data: universe, error: null });
        };
        return builder;
      }
      if (table === 'signal_observations') {
        // Two access paths: bulk priors `.select(...).eq().eq().gte().lte().range()`
        // (paginated) and the writer `.upsert(...)`.
        return {
          select() {
            const chain: Record<string, unknown> = {
              eq() { return chain; },
              gte() { return chain; },
              lte() { return chain; },
              range(from: number, to: number) {
                calls.priorsRangeCalls.push([from, to]);
                if (opts.priorsError) {
                  return Promise.resolve({ data: null, error: opts.priorsError });
                }
                // Single-page return (priors slice well below 1000 rows in
                // tests); short read terminates fetchAllRows.
                return Promise.resolve({ data: priors, error: null });
              },
            };
            return chain;
          },
          upsert(payload: Array<Record<string, unknown>>) {
            calls.upsertPayloads.push(payload);
            return Promise.resolve({
              error: opts.upsertError ?? null,
              count: opts.upsertError ? null : payload.length,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

Deno.test('carry-orch: empty universe → failed empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  const r = await orch.run(AS_OF);
  assertEquals(r.outcome, 'failed');
  assertEquals(r.failure_reason, 'empty_universe');
  assertEquals(r.universe_size, 0);
});

Deno.test('carry-orch: 4-outcome mapping — carry, past_bound, no_pub, skip_native', async () => {
  // CARRY: AAPL pub on 2026-06-15 (3d stale).
  // PAST_BOUND: MSFT pub on 2026-05-15 (34d stale).
  // NO_PUB: GOOGL — no priors.
  // SKIP_NATIVE: NVDA — native row already at AS_OF_DATE.
  const universe = [
    { ticker: 'AAPL', gics_sector: 'Technology' },
    { ticker: 'MSFT', gics_sector: 'Technology' },
    { ticker: 'GOOGL', gics_sector: 'Communication Services' },
    { ticker: 'NVDA', gics_sector: 'Technology' },
  ];
  const priors: PriorRow[] = [
    {
      ticker: 'AAPL', as_of_date: '2026-06-15', value: 0.42, is_present: true,
      gics_sector: 'Technology', carried_forward: false,
    },
    // MSFT: priors window read returns 2026-05-15 (within 35d filter; >22d bound).
    // (Test isolates decider behavior: 34d stale → past_bound.)
    // NOTE: 35d filter at 2026-05-14; we test 2026-05-15 which is within the
    // SQL window, but past the 22d decider bound.
    {
      ticker: 'MSFT', as_of_date: '2026-05-15', value: -0.11, is_present: true,
      gics_sector: 'Technology', carried_forward: false,
    },
    {
      ticker: 'NVDA', as_of_date: AS_OF_DATE, value: 0.99, is_present: true,
      gics_sector: 'Technology', carried_forward: false,
    },
  ];
  const { supabase, calls } = makeSupabase({ universe, priors });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  const r = await orch.run(AS_OF);

  assertEquals(r.outcome, 'completed');
  assertEquals(r.carried_count, 1);
  assertEquals(r.past_bound_count, 1);
  assertEquals(r.no_publication_count, 1);
  assertEquals(r.skipped_native_count, 1);
  assertEquals(r.universe_size, 4);

  // Persisted rows: AAPL (carry) + MSFT (absence) + GOOGL (absence) = 3.
  // NVDA skipped (native exists).
  assertEquals(calls.upsertPayloads.length, 1, 'single-batch capture');
  const batch = calls.upsertPayloads[0];
  assertEquals(batch.length, 3);

  const byTicker = new Map(batch.map((r) => [r.ticker as string, r]));

  // AAPL: carried_forward=true, is_present=true, value held verbatim.
  const aapl = byTicker.get('AAPL')!;
  assertEquals(aapl.carried_forward, true);
  assertEquals(aapl.is_present, true);
  assertEquals(aapl.value, 0.42);
  assertEquals(aapl.gics_sector, 'Technology');
  assertEquals(aapl.as_of_date, AS_OF_DATE);
  assertEquals(aapl.computed_at, AS_OF.toISOString());
  assertEquals(aapl.signal_id, SIGNAL_ID);

  // MSFT: past_bound → carried_forward=false, is_present=false, value=null,
  //       gics_sector from current universe (NOT anchor).
  const msft = byTicker.get('MSFT')!;
  assertEquals(msft.carried_forward, false);
  assertEquals(msft.is_present, false);
  assertEquals(msft.value, null);
  assertEquals(msft.gics_sector, 'Technology');

  // GOOGL: no_pub → carried_forward=false, absence, gics_sector from universe.
  const googl = byTicker.get('GOOGL')!;
  assertEquals(googl.carried_forward, false);
  assertEquals(googl.is_present, false);
  assertEquals(googl.value, null);
  assertEquals(googl.gics_sector, 'Communication Services');

  // NVDA absent from batch.
  assertEquals(byTicker.has('NVDA'), false);

  // Skip rows: past_bound→data_unavailable, no_pub→insufficient_history.
  const skipReasons = r.skipped.map((s) => `${s.ticker}:${s.reason}`).sort();
  assertEquals(skipReasons, ['GOOGL:insufficient_history', 'MSFT:data_unavailable']);
});

Deno.test('carry-orch: emit_carry uses ANCHOR gics_sector (not universe sector)', async () => {
  // The decider's emit_carry carries the anchor's gics_sector. The
  // orchestrator should pass it through verbatim — universe sector
  // applies only to absence rows.
  const universe = [{ ticker: 'AAPL', gics_sector: 'Technology' }];
  const priors: PriorRow[] = [{
    ticker: 'AAPL', as_of_date: '2026-06-15', value: 0.5, is_present: true,
    gics_sector: 'Industrials' /* deliberately != universe */, carried_forward: false,
  }];
  const { supabase, calls } = makeSupabase({ universe, priors });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  const r = await orch.run(AS_OF);
  assertEquals(r.carried_count, 1);
  assertEquals(calls.upsertPayloads[0][0].gics_sector, 'Industrials');
});

Deno.test('carry-orch: persistence error → failed + counts preserved', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'Technology' }];
  const priors: PriorRow[] = [{
    ticker: 'AAPL', as_of_date: '2026-06-15', value: 0.42, is_present: true,
    gics_sector: 'Technology', carried_forward: false,
  }];
  const { supabase } = makeSupabase({
    universe, priors, upsertError: { message: 'boom' },
  });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  const r = await orch.run(AS_OF);
  assertEquals(r.outcome, 'failed');
  assertEquals(r.persisted_count, 0);
  assertEquals(r.carried_count, 1);
  assert(r.failure_reason && r.failure_reason.includes('boom'));
});

Deno.test('carry-orch: zero universe rows after present-snapshot returns empty → failed', async () => {
  // Latest snapshot returns null (no rows). Spec: failed empty_universe.
  const { supabase } = makeSupabase({ universe: [] });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  const r = await orch.run(AS_OF);
  assertEquals(r.outcome, 'failed');
  assertEquals(r.failure_reason, 'empty_universe');
});

Deno.test('carry-orch: bulk priors read uses fetchAllRows (range called)', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'Tech' }];
  const { supabase, calls } = makeSupabase({ universe, priors: [] });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  await orch.run(AS_OF);
  // Single short-read page; first range call from page 0.
  assert(calls.priorsRangeCalls.length >= 1);
  assertEquals(calls.priorsRangeCalls[0][0], 0);
});

Deno.test('carry-orch: computed_at == as_of.toISOString() for every row', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'Tech' },
    { ticker: 'MSFT', gics_sector: 'Tech' },
  ];
  const priors: PriorRow[] = [{
    ticker: 'AAPL', as_of_date: '2026-06-15', value: 0.1, is_present: true,
    gics_sector: 'Tech', carried_forward: false,
  }];
  const { supabase, calls } = makeSupabase({ universe, priors });
  const orch = createCarryOrchestrator({ supabase: supabase as never, operator_id: OPERATOR_ID });
  await orch.run(AS_OF);
  for (const row of calls.upsertPayloads[0]) {
    assertEquals(row.computed_at, AS_OF.toISOString());
  }
});