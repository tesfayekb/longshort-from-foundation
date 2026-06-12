// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import per FP-045 Phase 2 addendum
// @ts-nocheck — Deno test file.
//
// FP-048 Phase 3a — Sequential-feed engine extension tests.
//
// Coverage:
//   - config validator: feed-mode required-field enforcement +
//     cross-mode contamination rejection (per-ticker fields on feed
//     config and vice-versa).
//   - init: feed mode seeds ONE synthetic-ticker cursor row with NULL
//     gics_sector and stamps metadata.mode='sequential-feed'.
//   - slice-worker feed branch: claim → fetchPage loop → feed_items
//     upsert → release-vs-delete-vs-CAS at exhaustion → heartbeat on
//     EVERY page (per operator fit-point 2/4 amendment).
//   - page-retry idempotency: same fetchPage result upserted twice
//     produces identical feed_items rows (relies on PK + onConflict
//     not-ignoreDuplicates so a retry overwrites with the same bytes).
//   - maxPages runaway → run transitioned to failed, runaway=true.
//   - empty claim path (post-drain heartbeat tick) → CAS attempted.
//
// Per-ticker regression: existing queue-slice-worker_test.ts,
// queue-init_test.ts, queue-finalizer_test.ts, queue-config_test.ts,
// and queue-sweeper_test.ts remain UNMODIFIED and must pass on the
// same engine binary — the discriminated `mode?:` field is optional
// with default 'per-ticker', so consumers that omit it are byte-faithful.

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createTestRegistry,
  FEED_SYNTHETIC_TICKER,
  isFeedMode,
  type FeedPageResult,
  type QueueSignalConfig,
} from './queue-config.ts';
import { initQueueRun } from './queue-init.ts';
import { runQueueSlice } from './queue-slice-worker.ts';
import type { TokenBucket } from '../../options-flow/token-bucket.ts';

function fakeBucket(): TokenBucket {
  // Tests do not validate pacing; provide a no-op bucket so timing is
  // bounded purely by the mock-fetchPage call count.
  return { acquire: async () => {} } as unknown as TokenBucket;
}

function feedCfg(
  fetchPage: (args: { cursorToken: string | null; asOf: Date }) => Promise<FeedPageResult>,
  over: Partial<QueueSignalConfig> = {},
): QueueSignalConfig {
  return {
    signalId: 'test_feed', jobId: 'job-test-feed',
    ratePerSec: 10, heartbeatTimeoutSec: 300, stagingTtlSec: 86400,
    mode: 'sequential-feed',
    pagesPerSlice: 3, maxPages: 100,
    fetchPage,
    computeFromItems: () => ({ kind: 'value', raw: 0 }),
    ...over,
  };
}

function perTickerCfg(): QueueSignalConfig {
  return {
    signalId: 'pt', jobId: 'job-pt', ratePerSec: 1,
    callsPerName: 1, sliceSize: 5,
    heartbeatTimeoutSec: 60, stagingTtlSec: 3600,
    fetchAndCompute: async () => ({ kind: 'value', raw: 1 }),
  };
}

// ════════════════════════════════════════════════════════════════════
// 1) Config validator — feed-mode required fields + cross-contamination
// ════════════════════════════════════════════════════════════════════

Deno.test('config: isFeedMode discriminator works for both modes', () => {
  assertEquals(isFeedMode(perTickerCfg()), false);
  assertEquals(isFeedMode(feedCfg(async () => ({ items: [], nextToken: null }))), true);
});

Deno.test('config: feed mode requires pagesPerSlice (positive integer)', () => {
  const r = createTestRegistry();
  assertThrows(
    () => r.register(feedCfg(async () => ({ items: [], nextToken: null }), { pagesPerSlice: 0 })),
    Error, 'pagesPerSlice',
  );
  assertThrows(
    () => r.register(feedCfg(async () => ({ items: [], nextToken: null }), { pagesPerSlice: undefined })),
    Error, 'pagesPerSlice',
  );
});

Deno.test('config: feed mode requires maxPages, fetchPage, computeFromItems', () => {
  const fp = async () => ({ items: [], nextToken: null });
  const r = createTestRegistry();
  assertThrows(
    () => r.register(feedCfg(fp, { maxPages: undefined })),
    Error, 'maxPages',
  );
  assertThrows(
    () => r.register({ ...feedCfg(fp), fetchPage: undefined } as unknown as QueueSignalConfig),
    Error, 'fetchPage',
  );
  assertThrows(
    () => r.register({ ...feedCfg(fp), computeFromItems: undefined } as unknown as QueueSignalConfig),
    Error, 'computeFromItems',
  );
});

Deno.test('config: feed mode REJECTS per-ticker fields (cross-mode contamination)', () => {
  const fp = async () => ({ items: [], nextToken: null });
  const r = createTestRegistry();
  assertThrows(
    () => r.register({ ...feedCfg(fp), callsPerName: 1 } as QueueSignalConfig),
    Error, 'must not set callsPerName',
  );
  assertThrows(
    () => r.register({ ...feedCfg(fp), sliceSize: 5 } as QueueSignalConfig),
    Error, 'must not set sliceSize',
  );
  assertThrows(
    () => r.register({
      ...feedCfg(fp),
      fetchAndCompute: async () => ({ kind: 'value', raw: 0 }),
    } as QueueSignalConfig),
    Error, 'must not set fetchAndCompute',
  );
});

Deno.test('config: per-ticker mode (default) REJECTS feed-mode fields', () => {
  const r = createTestRegistry();
  assertThrows(
    () => r.register({ ...perTickerCfg(), pagesPerSlice: 5 } as QueueSignalConfig),
    Error, 'must not set feed-mode fields',
  );
  assertThrows(
    () => r.register({
      ...perTickerCfg(),
      fetchPage: async () => ({ items: [], nextToken: null }),
    } as QueueSignalConfig),
    Error, 'must not set feed-mode fields',
  );
});

Deno.test('config: per-ticker registration round-trips unchanged (regression fence)', () => {
  const r = createTestRegistry();
  r.register(perTickerCfg());
  assertEquals(r.get('pt').signalId, 'pt');
  assertEquals(isFeedMode(r.get('pt')), false);
});

// ════════════════════════════════════════════════════════════════════
// 2) Init — feed mode seeds one synthetic-ticker cursor row
// ════════════════════════════════════════════════════════════════════

function makeInitMock(universe: Array<{ ticker: string; gics_sector: string | null }>) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const supabase: unknown = {
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        select(_c?: string) { return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        in(_c: string, _vs: unknown[]) { return b; },
        order() { return b; },
        limit() { return b; },
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return { select: () => ({ single: async () => ({ data: { run_id: 'r-feed-1' }, error: null }) }) };
        },
        upsert(payload: unknown) {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ error: null });
        },
        delete() { calls.push({ table, op: 'delete' }); return b; },
        then(resolve: unknown) {
          if (table === 'signal_queue_runs') return resolve({ data: [], error: null });
          if (table === 'universe_membership') {
            if (b._filters.as_of_date === undefined) {
              return resolve({ data: [{ as_of_date: '2026-06-11' }], error: null });
            }
            return resolve({ data: universe, error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
  return { supabase, calls };
}

Deno.test('init feed-mode: seeds ONE synthetic-ticker cursor row with NULL gics_sector', async () => {
  const { supabase, calls } = makeInitMock([
    { ticker: 'AAPL', gics_sector: 'Tech' },
    { ticker: 'MSFT', gics_sector: 'Tech' },
  ]);
  const out = await initQueueRun({
    supabase, operator_id: 'op-1',
    config: feedCfg(async () => ({ items: [], nextToken: null })),
    as_of: new Date('2026-06-11T20:00:00Z'),
  });
  assertEquals(out.kind, 'started');
  if (out.kind === 'started') assertEquals(out.universe_size, 2);

  const cursorUpsert = calls.find((c) => c.table === 'signal_queue_cursor' && c.op === 'upsert');
  assert(cursorUpsert);
  const rows = cursorUpsert!.payload as Array<{ ticker: string; gics_sector: string | null }>;
  assertEquals(rows.length, 1);
  assertEquals(rows[0].ticker, FEED_SYNTHETIC_TICKER);
  assertEquals(rows[0].gics_sector, null);

  const runInsert = calls.find((c) => c.table === 'signal_queue_runs' && c.op === 'insert');
  assert(runInsert);
  assertEquals((runInsert!.payload as { metadata: { mode: string } }).metadata.mode, 'sequential-feed');
});

// ════════════════════════════════════════════════════════════════════
// 3) Slice-worker feed branch
// ════════════════════════════════════════════════════════════════════

interface FeedSliceMockState {
  feedCursor: string | null;
  pagesFetched: number;
  status: string;
}

function makeFeedSliceMock(opts: {
  initialState?: Partial<FeedSliceMockState>;
  claimReturn?: Array<{ ticker: string; gics_sector: string | null }>;
  casReturn?: boolean;
}) {
  const state: FeedSliceMockState = {
    feedCursor: opts.initialState?.feedCursor ?? null,
    pagesFetched: opts.initialState?.pagesFetched ?? 0,
    status: opts.initialState?.status ?? 'running',
  };
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const itemUpserts: unknown[][] = [];
  const runUpdates: unknown[] = [];
  const cursorUpdates: unknown[] = [];
  const cursorDeletes: Array<Record<string, unknown>> = [];
  const runFailUpdates: unknown[] = [];

  const supabase: unknown = {
    async rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      if (fn === 'signal_queue_claim_slice') {
        const claimed = opts.claimReturn
          ?? [{ ticker: FEED_SYNTHETIC_TICKER, gics_sector: null }];
        return { data: claimed, error: null };
      }
      if (fn === 'signal_queue_cas_finalizing') {
        return { data: opts.casReturn ?? false, error: null };
      }
      return { data: null, error: null };
    },
    from(table: string) {
      const b: unknown = {
        _filters: {} as Record<string, unknown>,
        _payload: undefined as unknown,
        select(_c?: string) { return b; },
        eq(c: string, v: unknown) { b._filters[c] = v; return b; },
        in(_c: string, _vs: unknown[]) { return b; },
        async single() {
          if (table === 'signal_queue_runs') {
            return {
              data: { feed_cursor: state.feedCursor, feed_pages_fetched: state.pagesFetched },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        upsert(payload: unknown, _opts?: unknown) {
          if (table === 'signal_queue_feed_items') {
            itemUpserts.push(payload as unknown[]);
          }
          return Promise.resolve({ error: null });
        },
        update(payload: unknown) { b._payload = payload; return b; },
        delete() { b._delete = true; return b; },
        then(resolve: unknown) {
          if (b._payload && table === 'signal_queue_runs') {
            const p = b._payload as Record<string, unknown>;
            // Distinguish status-fail update from regular advance/heartbeat.
            if (p.status === 'failed') runFailUpdates.push(p);
            else runUpdates.push(p);
            return resolve({ error: null });
          }
          if (b._payload && table === 'signal_queue_cursor') {
            cursorUpdates.push(b._payload);
            return resolve({ error: null });
          }
          if (b._delete && table === 'signal_queue_cursor') {
            cursorDeletes.push({ ...b._filters });
            return resolve({ error: null });
          }
          return resolve({ error: null });
        },
      };
      return b;
    },
  };

  return { supabase, state, rpcCalls, itemUpserts, runUpdates, cursorUpdates, cursorDeletes, runFailUpdates };
}

Deno.test('feed-slice: empty claim → CAS attempted, empty=true, mode tagged', async () => {
  const { supabase, rpcCalls } = makeFeedSliceMock({ claimReturn: [], casReturn: false });
  const out = await runQueueSlice({
    supabase,
    config: feedCfg(async () => ({ items: [], nextToken: null })),
    as_of: new Date('2026-06-11T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.empty, true);
  assertEquals(out.cas_attempted, true);
  assertEquals(out.mode, 'sequential-feed');
  assert(rpcCalls.some((c) => c.fn === 'signal_queue_cas_finalizing'));
});

Deno.test('feed-slice: drains pages within slice → exhaustion → DELETE cursor + CAS', async () => {
  const pages: FeedPageResult[] = [
    { items: [{ articleId: 'a1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-11T19:00:00Z' }], nextToken: 'tok1' },
    { items: [{ articleId: 'a2', ticker: 'MSFT', sentimentNum: 0, tierWeight: 0.7, publishedUtc: '2026-06-11T18:00:00Z' }], nextToken: null },
  ];
  let idx = 0;
  const { supabase, itemUpserts, cursorDeletes, rpcCalls, runUpdates } = makeFeedSliceMock({ casReturn: true });
  const out = await runQueueSlice({
    supabase,
    config: feedCfg(async () => pages[idx++], { pagesPerSlice: 5 }),
    as_of: new Date('2026-06-11T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.mode, 'sequential-feed');
  assertEquals(out.pages_fetched, 2);
  assertEquals(out.items_upserted, 2);
  assertEquals(out.cas_attempted, true);
  assertEquals(out.cas_won, true);
  // Both pages upserted into feed_items.
  assertEquals(itemUpserts.length, 2);
  // Cursor row was DELETEd (exhaustion path).
  assert(cursorDeletes.some((d) => d.run_id === 'r-1' && d.ticker === FEED_SYNTHETIC_TICKER));
  // Heartbeat bumped on EVERY page (fit-point 2/4 amendment): 1 entry heartbeat + 2 per-page advances.
  assert(runUpdates.length >= 3);
  // CAS RPC called.
  assert(rpcCalls.some((c) => c.fn === 'signal_queue_cas_finalizing'));
});

Deno.test('feed-slice: pagesPerSlice cap → RELEASE claim (not delete), no CAS', async () => {
  // Vendor returns nextToken on every page; the slice hits pagesPerSlice
  // before the feed is exhausted → release for the next minute-tick.
  let pageIdx = 0;
  const { supabase, cursorDeletes, cursorUpdates, rpcCalls } = makeFeedSliceMock({});
  const out = await runQueueSlice({
    supabase,
    config: feedCfg(
      async () => ({
        items: [{
          articleId: `a${pageIdx}`, ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0,
          publishedUtc: '2026-06-11T19:00:00Z',
        }],
        nextToken: `tok${++pageIdx}`,
      }),
      { pagesPerSlice: 3 },
    ),
    as_of: new Date('2026-06-11T20:00:00Z'),
    run_id: 'r-1',
    bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.pages_fetched, 3);
  assertEquals(out.cas_attempted, false);
  assertEquals(out.cas_won, false);
  // RELEASE path: cursor UPDATED (claimed_at=null), NOT DELETEd.
  assertEquals(cursorDeletes.length, 0);
  assert(cursorUpdates.some((u) => (u as Record<string, unknown>).claimed_at === null));
  // No CAS attempt while feed is still draining.
  assert(!rpcCalls.some((c) => c.fn === 'signal_queue_cas_finalizing'));
});

Deno.test('feed-slice: page-retry idempotency — same fetchPage result, same upsert bytes', async () => {
  // Two SEPARATE slice runs each fetch the same single page; the
  // feed_items upsert receives the SAME row shape both times. The PK
  // (run_id, article_id, ticker) + onConflict UPSERT (not
  // ignoreDuplicates) guarantees the second write is a no-op overwrite.
  const page: FeedPageResult = {
    items: [{
      articleId: 'dedup-1', ticker: 'AAPL',
      sentimentNum: 1, tierWeight: 1.0,
      publishedUtc: '2026-06-11T19:00:00Z',
    }],
    nextToken: null,
  };
  const cfg = feedCfg(async () => ({ ...page, items: page.items.map((i) => ({ ...i })) }));

  const m1 = makeFeedSliceMock({ casReturn: true });
  await runQueueSlice({
    supabase: m1.supabase, config: cfg,
    as_of: new Date('2026-06-11T20:00:00Z'),
    run_id: 'r-1', bucketFactory: () => fakeBucket(),
  });
  const m2 = makeFeedSliceMock({ casReturn: true });
  await runQueueSlice({
    supabase: m2.supabase, config: cfg,
    as_of: new Date('2026-06-11T20:00:00Z'),
    run_id: 'r-1', bucketFactory: () => fakeBucket(),
  });

  // Byte-faithful: same upsert payload shape both times.
  assertEquals(
    JSON.stringify(m1.itemUpserts[0]),
    JSON.stringify(m2.itemUpserts[0]),
  );
});

Deno.test('feed-slice: maxPages runaway → fail run + runaway=true', async () => {
  // Initial state already at maxPages; the first iteration of the slice
  // loop trips the guard before any fetchPage call.
  const { supabase, runFailUpdates, cursorDeletes } = makeFeedSliceMock({
    initialState: { pagesFetched: 100 },
  });
  let fetchCalls = 0;
  const out = await runQueueSlice({
    supabase,
    config: feedCfg(
      async () => { fetchCalls++; return { items: [], nextToken: 'never' }; },
      { maxPages: 100, pagesPerSlice: 5 },
    ),
    as_of: new Date('2026-06-11T20:00:00Z'),
    run_id: 'r-1', bucketFactory: () => fakeBucket(),
  });
  assertEquals(out.runaway, true);
  assertEquals(out.pages_fetched, 0);
  assertEquals(fetchCalls, 0);
  // Run transitioned to failed with max_pages_exceeded.
  assert(runFailUpdates.length === 1);
  const reason = (runFailUpdates[0] as Record<string, unknown>).failure_reason as string;
  assert(reason.includes('max_pages_exceeded'));
  // Cursor row was DELETEd as part of the fail cleanup.
  assert(cursorDeletes.length === 1);
});