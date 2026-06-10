// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Behavioral tests for `createAnalystRevisionOrchestrator` (FP-047 Phase 3).
 *
 * Covers the mass-balance identity (|values| + |skips| = |universe|),
 * vendor-gating fan-out (feed `unavailable` → universe-wide typed skip),
 * per-symbol history fan-out (subscription_gated / data_unavailable
 * mapping), and the compute → z-score → persist pipeline shape.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createAnalystRevisionOrchestrator,
  SIGNAL_ID,
} from './analyst-revision-orchestrator.ts';
import type { RawPriceTargetRow } from './analyst-identity.ts';
import type { SignalRow } from '../shared/signal-types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-10T21:00:00Z');
const AS_OF_DATE = '2026-06-10';
const LATEST_SNAPSHOT = '2026-06-08';

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  upsertError?: { message: string } | null;
}) {
  const calls = { upsertPayloads: [] as SignalRow[][] };
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;

  return {
    calls,
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
              calls.upsertPayloads.push(payload);
              return Promise.resolve({ data: null, error: opts.upsertError ?? null, count: payload.length });
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    },
  };
}

function row(symbol: string, publishedDate: string, name: string, company: string, priceTarget: number | null, prev?: number | null): RawPriceTargetRow {
  return {
    symbol,
    publishedDate,
    analystName: name,
    analystCompany: company,
    priceTarget,
    adjPriceTarget: null,
    priceWhenPosted: prev ?? null,
    newsTitle: '',
  };
}

function makeFeed(rows: RawPriceTargetRow[]) {
  return {
    async fetchFeed() {
      return { kind: 'feed' as const, rows, pagesFetched: 1, hitPageCap: false, latencyMsPerPage: [0] };
    },
  };
}
function makeFeedUnavailable(reason: 'subscription_gated' | 'rate_limited' | 'data_unavailable') {
  return { async fetchFeed() { return { kind: 'unavailable' as const, reason }; } };
}
function makeHistory(perSymbol: Record<string, RawPriceTargetRow[]>) {
  return {
    async fetchHistory(symbol: string) {
      const rows = perSymbol[symbol];
      if (rows === undefined) return { kind: 'unavailable' as const, reason: 'data_unavailable' as const };
      return { kind: 'history' as const, rows, latencyMs: 0 };
    },
  };
}

Deno.test('SIGNAL_ID is locked to analyst_revision_drift', () => {
  assertEquals(SIGNAL_ID, 'analyst_revision_drift');
});

Deno.test('empty universe → failed/empty_universe', async () => {
  const sb = makeSupabase({ universe: [] });
  const orch = createAnalystRevisionOrchestrator({
    supabase: sb.client as never,
    operator_id: OPERATOR_ID,
    feed: makeFeed([]) as never,
    history: makeHistory({}) as never,
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.failure_reason, 'empty_universe');
});

Deno.test('feed subscription_gated → universe-wide typed skip', async () => {
  const universe = [
    { ticker: 'AAA', gics_sector: 'Tech' },
    { ticker: 'BBB', gics_sector: 'Tech' },
  ];
  const sb = makeSupabase({ universe });
  const orch = createAnalystRevisionOrchestrator({
    supabase: sb.client as never,
    operator_id: OPERATOR_ID,
    feed: makeFeedUnavailable('subscription_gated') as never,
    history: makeHistory({}) as never,
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.universe_size, 2);
  assertEquals(res.persisted_count, 0);
  assertEquals(res.skipped.length, 2);
  assert(res.skipped.every((s) => s.reason === 'subscription_gated'));
});

Deno.test('mass balance: |values| + |skips| === universe_size with mixed names', async () => {
  const universe = [
    { ticker: 'AAA', gics_sector: 'Tech' },
    { ticker: 'BBB', gics_sector: 'Tech' },
    { ticker: 'CCC', gics_sector: 'Tech' },     // no focal events → no_revisions_in_window
    { ticker: 'DDD', gics_sector: 'Health' },   // singleton sector → singleton_sector
  ];
  const feedRows: RawPriceTargetRow[] = [
    row('AAA', '2026-06-09 12:00:00', 'Jane Doe', 'Acme Securities', 120),
    row('BBB', '2026-06-09 12:00:00', 'John Roe', 'Beta Capital', 80),
    row('DDD', '2026-06-09 12:00:00', 'Sam Lee', 'Gamma Research', 50),
    row('ZZZ', '2026-06-09 12:00:00', 'X Y', 'Out-of-universe', 10), // filtered out
  ];
  const history = {
    AAA: [row('AAA', '2026-05-01 12:00:00', 'Jane Doe', 'Acme Securities', 100)],
    BBB: [row('BBB', '2026-05-01 12:00:00', 'John Roe', 'Beta Capital', 100)],
    DDD: [row('DDD', '2026-05-01 12:00:00', 'Sam Lee', 'Gamma Research', 60)],
  };
  const sb = makeSupabase({ universe });
  const orch = createAnalystRevisionOrchestrator({
    supabase: sb.client as never,
    operator_id: OPERATOR_ID,
    feed: makeFeed(feedRows) as never,
    history: makeHistory(history) as never,
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.universe_size, 4);
  // AAA, BBB are in the same sector with non-equal raw signals (+0.2 vs -0.2),
  // so both should z-score to non-null → persisted.
  assertEquals(res.persisted_count, 2);
  // CCC → no_revisions_in_window; DDD → singleton_sector.
  assertEquals(res.skipped.length, 2);
  const reasons = res.skipped.map((s) => s.reason).sort();
  assertEquals(reasons, ['no_revisions_in_window', 'singleton_sector']);
  // Mass-balance identity.
  assertEquals(res.persisted_count + res.skipped.length, res.universe_size);
  // Persist payload reaches signal_observations.
  assertEquals(sb.calls.upsertPayloads.length, 1);
  assertEquals(sb.calls.upsertPayloads[0].length, 2);
  assertEquals(sb.calls.upsertPayloads[0][0].signal_id, SIGNAL_ID);
  assertEquals(sb.calls.upsertPayloads[0][0].as_of_date, AS_OF_DATE);
});

Deno.test('history data_unavailable → revision_prior_unavailable skip (not fetch_error)', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const feedRows = [row('AAA', '2026-06-09 12:00:00', 'Jane Doe', 'Acme', 120)];
  const sb = makeSupabase({ universe });
  const orch = createAnalystRevisionOrchestrator({
    supabase: sb.client as never,
    operator_id: OPERATOR_ID,
    feed: makeFeed(feedRows) as never,
    history: makeHistory({}) as never, // AAA missing → data_unavailable
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.skipped.length, 1);
  assertEquals(res.skipped[0].reason, 'revision_prior_unavailable');
});

Deno.test('history subscription_gated → subscription_gated skip', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const feedRows = [row('AAA', '2026-06-09 12:00:00', 'Jane Doe', 'Acme', 120)];
  const sb = makeSupabase({ universe });
  const orch = createAnalystRevisionOrchestrator({
    supabase: sb.client as never,
    operator_id: OPERATOR_ID,
    feed: makeFeed(feedRows) as never,
    history: {
      async fetchHistory() { return { kind: 'unavailable' as const, reason: 'subscription_gated' as const }; },
    } as never,
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.skipped[0].reason, 'subscription_gated');
});