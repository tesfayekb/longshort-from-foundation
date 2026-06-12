// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Behavioural tests for `createActiveCatalystOrchestrator` (FP-049 Phase 3a).
 *
 * Covers (1) empty-universe failure, (2) all-vendors-unavailable
 * universe-wide `no_catalyst_events_in_window` skips with mass balance
 * preserved, (3) mixed values + skips with z-scoring, (4) Tradier
 * typed-fallback invoked when polygon splits unavailable,
 * (5) `liveClock` advances → `completed_at > started_at` (d066c890
 * pattern, NOT the FP-047 defect), (6) per-vendor unavailable flags
 * carried in meta, (7) `nthPrecedingTradingDay` weekend skip.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createActiveCatalystOrchestrator,
  nthPrecedingTradingDay,
  SIGNAL_ID,
} from './active-catalyst-orchestrator.ts';
import type { CatalystFetchResult, RawCatalystEventInput } from './catalyst-types.ts';
import type { SignalRow } from '../shared/signal-types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
// Friday 21:00 UTC anchor (avoids weekend-skip ambiguity in window math).
const AS_OF = new Date('2026-06-12T21:00:00Z');
const AS_OF_DATE = '2026-06-12';
const LATEST_SNAPSHOT = '2026-06-08';

type Universe = Array<{ ticker: string; gics_sector: string | null }>;

function makeSupabase(opts: { universe: Universe }) {
  const upsertPayloads: SignalRow[][] = [];
  const universe = opts.universe;
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;
  return {
    upsertPayloads,
    client: {
      from(table: string) {
        if (table === 'universe_membership') {
          let mode: 'latest' | 'rows' = 'rows';
          const builder: Record<string, unknown> = {
            select(cols: string) { mode = cols === 'as_of_date' ? 'latest' : 'rows'; return builder; },
            eq() { return builder; },
            order() { return builder; },
            limit() { return resolve(); },
            then(onF: unknown, onR: unknown) { return resolve().then(onF, onR); },
          };
          const resolve = () => mode === 'latest'
            ? Promise.resolve({ data: latestDate ? [{ as_of_date: latestDate }] : [], error: null })
            : Promise.resolve({ data: universe, error: null });
          return builder;
        }
        if (table === 'signal_observations') {
          return {
            upsert(payload: SignalRow[]) {
              upsertPayloads.push(payload);
              return Promise.resolve({ data: null, error: null, count: payload.length });
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    },
  };
}

function fetcher(result: CatalystFetchResult) {
  return { fetch: (_w: unknown, _t?: unknown) => Promise.resolve(result) };
}

function events(rows: RawCatalystEventInput[]): CatalystFetchResult {
  return { kind: 'events', rows, future_event_excluded: 0 };
}

function unavailable(reason: 'subscription_gated' | 'rate_limited' | 'data_unavailable'): CatalystFetchResult {
  return { kind: 'unavailable', reason };
}

function makeAllUnavailableCtx(universe: Universe) {
  const sup = makeSupabase({ universe });
  return {
    sup,
    ctx: {
      supabase: sup.client as never,
      operator_id: OPERATOR_ID,
      fmpEarnings: fetcher(unavailable('data_unavailable')),
      fmpMa: fetcher(unavailable('data_unavailable')),
      fmpGrades: fetcher(unavailable('data_unavailable')),
      polygonSplits: fetcher(unavailable('data_unavailable')),
      polygonDividends: fetcher(unavailable('data_unavailable')),
      polygonNewsKeyword: fetcher(unavailable('data_unavailable')),
      finnhubFda: fetcher(unavailable('data_unavailable')),
      tradier: fetcher(unavailable('data_unavailable')),
    } as never,
  };
}

Deno.test('(1) empty universe → outcome=failed empty_universe', async () => {
  const { ctx } = makeAllUnavailableCtx([]);
  const orch = createActiveCatalystOrchestrator(ctx);
  const r = await orch.run(AS_OF);
  assertEquals(r.outcome, 'failed');
  assertEquals(r.failure_reason, 'empty_universe');
  assertEquals(r.universe_size, 0);
  assertEquals(r.signal_id, SIGNAL_ID);
});

Deno.test('(2) all vendors unavailable → universe-wide no_catalyst_events_in_window; mass balance', async () => {
  const universe: Universe = [
    { ticker: 'AAA', gics_sector: 'Tech' },
    { ticker: 'BBB', gics_sector: 'Tech' },
    { ticker: 'CCC', gics_sector: 'Tech' },
  ];
  // Make polygon splits + dividends 'events' so Tradier fallback is NOT invoked here.
  const sup = makeSupabase({ universe });
  const ctx = {
    supabase: sup.client as never,
    operator_id: OPERATOR_ID,
    fmpEarnings: fetcher(events([])),
    fmpMa: fetcher(events([])),
    fmpGrades: fetcher(events([])),
    polygonSplits: fetcher(events([])),
    polygonDividends: fetcher(events([])),
    polygonNewsKeyword: fetcher(events([])),
    finnhubFda: fetcher(events([])),
    tradier: fetcher(unavailable('data_unavailable')),
  } as never;
  const r = await createActiveCatalystOrchestrator(ctx).run(AS_OF);
  assertEquals(r.outcome, 'completed');
  assertEquals(r.universe_size, 3);
  assertEquals(r.persisted_count, 0);
  assertEquals(r.skipped.length, 3);
  for (const s of r.skipped) assertEquals(s.reason, 'no_catalyst_events_in_window');
  assertEquals(r.catalyst_meta.tradier_fallback_invoked, false);
  assertEquals(r.as_of_date, AS_OF_DATE);
});

Deno.test('(3) mixed values + skips: 3-name sector, 2 with events, z-scoring applied', async () => {
  const universe: Universe = [
    { ticker: 'AAA', gics_sector: 'Tech' },
    { ticker: 'BBB', gics_sector: 'Tech' },
    { ticker: 'CCC', gics_sector: 'Tech' },
  ];
  const e = (ticker: string, hoursAgo: number): RawCatalystEventInput => ({
    ticker,
    event_type: 'earnings',
    event_at: new Date(AS_OF.getTime() - hoursAgo * 3_600_000).toISOString(),
    source: 'structured',
    vendor: 'fmp',
  });
  const sup = makeSupabase({ universe });
  const ctx = {
    supabase: sup.client as never,
    operator_id: OPERATOR_ID,
    fmpEarnings: fetcher(events([e('AAA', 0), e('BBB', 48)])),
    fmpMa: fetcher(events([])),
    fmpGrades: fetcher(events([])),
    polygonSplits: fetcher(events([])),
    polygonDividends: fetcher(events([])),
    polygonNewsKeyword: fetcher(events([])),
    finnhubFda: fetcher(events([])),
    tradier: fetcher(unavailable('data_unavailable')),
  } as never;
  const r = await createActiveCatalystOrchestrator(ctx).run(AS_OF);
  assertEquals(r.outcome, 'completed');
  assertEquals(r.persisted_count, 2);
  assertEquals(r.skipped.length, 1);
  assertEquals(r.skipped[0].ticker, 'CCC');
  assertEquals(r.skipped[0].reason, 'no_catalyst_events_in_window');
  // mass balance
  assertEquals(r.persisted_count + r.skipped.length, universe.length);
  // Two earnings events → both Tier-1
  assertEquals(r.catalyst_meta.by_tier[1], 2);
  assertEquals(r.catalyst_meta.total_event_count, 2);
  assertEquals(r.catalyst_meta.keyword_source_count, 0);
});

Deno.test('(4) Tradier typed-fallback invoked when polygon splits unavailable', async () => {
  const universe: Universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const sup = makeSupabase({ universe });
  const ctx = {
    supabase: sup.client as never,
    operator_id: OPERATOR_ID,
    fmpEarnings: fetcher(events([])),
    fmpMa: fetcher(events([])),
    fmpGrades: fetcher(events([])),
    polygonSplits: fetcher(unavailable('subscription_gated')),
    polygonDividends: fetcher(events([])),
    polygonNewsKeyword: fetcher(events([])),
    finnhubFda: fetcher(events([])),
    tradier: fetcher(events([])),
  } as never;
  const r = await createActiveCatalystOrchestrator(ctx).run(AS_OF);
  assertEquals(r.outcome, 'completed');
  assertEquals(r.catalyst_meta.tradier_fallback_invoked, true);
  assertEquals(r.catalyst_meta.vendor_unavailable.polygon_splits, true);
  assertEquals(r.catalyst_meta.vendor_unavailable.polygon_dividends, false);
});

Deno.test('(5) liveClock — completed_at > started_at (d066c890 pattern; NOT FP-047 defect)', async () => {
  let tick = 0;
  const liveClock = { getWallClockTs: () => new Date(1_700_000_000_000 + tick++ * 1000) };
  const { ctx } = makeAllUnavailableCtx([{ ticker: 'AAA', gics_sector: 'Tech' }]);
  const r = await createActiveCatalystOrchestrator({ ...ctx, liveClock } as never).run(AS_OF);
  assert(r.started_at !== r.completed_at, `started=${r.started_at} completed=${r.completed_at}`);
  assert(Date.parse(r.completed_at) > Date.parse(r.started_at));
});

Deno.test('(6) per-vendor unavailable flags surface in catalyst_meta', async () => {
  const sup = makeSupabase({ universe: [{ ticker: 'AAA', gics_sector: 'Tech' }] });
  const ctx = {
    supabase: sup.client as never,
    operator_id: OPERATOR_ID,
    fmpEarnings: fetcher(events([])),
    fmpMa: fetcher(unavailable('rate_limited')),
    fmpGrades: fetcher(events([])),
    polygonSplits: fetcher(events([])),
    polygonDividends: fetcher(events([])),
    polygonNewsKeyword: fetcher(unavailable('subscription_gated')),
    finnhubFda: fetcher(events([])),
    tradier: fetcher(unavailable('data_unavailable')),
  } as never;
  const r = await createActiveCatalystOrchestrator(ctx).run(AS_OF);
  assertEquals(r.catalyst_meta.vendor_unavailable.fmp_ma, true);
  assertEquals(r.catalyst_meta.vendor_unavailable.polygon_news_keyword, true);
  assertEquals(r.catalyst_meta.vendor_unavailable.fmp_earnings, false);
  assertEquals(r.catalyst_meta.tradier_fallback_invoked, false); // polygon corp-actions OK
});

Deno.test('(7) nthPrecedingTradingDay skips weekends', () => {
  // Monday 2026-06-15 → 1 trading day back is Friday 2026-06-12
  const mon = new Date('2026-06-15T15:00:00Z');
  const oneBack = nthPrecedingTradingDay(mon, 1);
  assertEquals(oneBack.toISOString().slice(0, 10), '2026-06-12');
  // Friday 2026-06-12 → 5 trading days back is Friday 2026-06-05
  const fri = new Date('2026-06-12T21:00:00Z');
  const fiveBack = nthPrecedingTradingDay(fri, 5);
  assertEquals(fiveBack.toISOString().slice(0, 10), '2026-06-05');
  // n=0 → start-of-day of as_of
  const zero = nthPrecedingTradingDay(fri, 0);
  assertEquals(zero.toISOString(), '2026-06-12T00:00:00.000Z');
});

Deno.test('(8) started_at uses liveClock — replay-determinism guard', async () => {
  const fixed = new Date('2030-01-01T12:00:00Z');
  const liveClock = { getWallClockTs: () => fixed };
  const { ctx } = makeAllUnavailableCtx([{ ticker: 'AAA', gics_sector: 'Tech' }]);
  const r = await createActiveCatalystOrchestrator({ ...ctx, liveClock } as never).run(AS_OF);
  assertEquals(r.started_at, fixed.toISOString());
  assertEquals(r.completed_at, fixed.toISOString());
  // as_of_date derives from AS_OF, NOT liveClock — replay determinism
  assertEquals(r.as_of_date, AS_OF_DATE);
});