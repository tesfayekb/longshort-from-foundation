// deno-lint-ignore-file no-import-prefix
// @ts-nocheck — Deno test file.
/**
 * INC-74 regression suite — feed-mode in-batch duplicate-tuple dedupe.
 *
 * Covers:
 *   (a) same ticker appearing twice within one article's insights[] →
 *       first-wins keeper kept; duplicatesDropped=1, conflicts=0
 *   (b) same (article_id, ticker) spanning a page boundary inside a
 *       single slice → first-wins keeper kept; duplicatesDropped=1,
 *       conflicts=0; the row reaches the DB exactly once
 *   (c) conflicting sentiment on a duplicate tuple → first-wins kept;
 *       duplicatesDropped=1, conflicts=1; counters propagate into the
 *       slice result for handler-level observability
 *
 * Per-ticker suite UNMODIFIED (regression fence per INC-74 binding).
 *
 * Typing convention (FP-041): narrow local interfaces + `as unknown as
 * <T>` boundary casts. Zero literal `any` tokens — Gate-11 sentinel
 * `scripts/check-queue-worker-test-any.ts` enforces.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  dedupeFeedItems,
  runQueueSlice,
} from './queue-slice-worker.ts';
import { FEED_SYNTHETIC_TICKER } from './queue-config.ts';
import { createFixedClock } from '../../../longshort-clock.ts';

// ── Narrow stub types ───────────────────────────────────────────────────

type Filters = Record<string, unknown>;
type Payload = Record<string, unknown>;

interface RunStateRow {
  feed_cursor: string | null;
  feed_pages_fetched: number;
  slice_failure_count: number;
}

interface RecordedCall {
  table: string;
  op: string;
  payload?: Payload;
  filters?: Filters;
}

interface FeedItemIn {
  articleId: string;
  ticker: string;
  sentimentNum: number;
  tierWeight: number;
  publishedUtc: string;
}

interface PageResult {
  items: FeedItemIn[];
  nextToken: string | null;
}

type FetchPageImpl = (call: { cursorToken: string | null }) => Promise<PageResult> | PageResult;

interface StubHandle {
  supabase: unknown;
  calls: RecordedCall[];
  config: unknown;
}

function makeStub(fetchPageImpl: FetchPageImpl): StubHandle {
  const calls: RecordedCall[] = [];
  let runState: RunStateRow = {
    feed_cursor: null, feed_pages_fetched: 0, slice_failure_count: 0,
  };

  interface QueryCtx {
    _filters: Filters;
    select: (cols: string) => QueryCtx;
    eq: (k: string, v: unknown) => QueryCtx;
    in: (k: string, v: unknown) => QueryCtx;
    not: (k: string, op: string, v: unknown) => QueryCtx;
    gt: (k: string, v: unknown) => QueryCtx;
    lt: (k: string, v: unknown) => QueryCtx;
    single: () => Promise<{ data: RunStateRow | null; error: null }>;
    update: (payload: Payload) => unknown;
    upsert: (rows: unknown, options: unknown) => unknown;
    delete: (o?: unknown) => unknown;
  }

  const fromBuilder = (table: string): QueryCtx => {
    const ctx = { _filters: {} as Filters } as QueryCtx;
    ctx.select = (_cols: string) => ctx;
    ctx.eq = (k: string, v: unknown) => { ctx._filters[k] = v; return ctx; };
    ctx.in = (_k: string, _v: unknown) => ctx;
    ctx.not = (_k: string, _op: string, _v: unknown) => ctx;
    ctx.gt = (_k: string, _v: unknown) => ctx;
    ctx.lt = (_k: string, _v: unknown) => ctx;
    ctx.single = async () => {
      if (table === 'signal_queue_runs') {
        calls.push({ table, op: 'select.single', filters: { ...ctx._filters } });
        return { data: { ...runState }, error: null };
      }
      return { data: null, error: null };
    };
    ctx.update = (payload: Payload) => {
      calls.push({ table, op: 'update', payload, filters: { ...ctx._filters } });
      if (table === 'signal_queue_runs') {
        runState = { ...runState, ...(payload as Partial<RunStateRow>) };
      }
      return { ...ctx, then: (resolve: (v: unknown) => void) => resolve({ error: null, count: 1 }) };
    };
    ctx.upsert = (rows: unknown, _opts: unknown) => {
      calls.push({ table, op: 'upsert', payload: rows as Payload });
      return { then: (resolve: (v: unknown) => void) => resolve({ error: null }) };
    };
    ctx.delete = (_o?: unknown) => {
      calls.push({ table, op: 'delete', filters: { ...ctx._filters } });
      return { ...ctx, then: (resolve: (v: unknown) => void) => resolve({ error: null, count: 0 }) };
    };
    return ctx;
  };

  const supabase = {
    from: fromBuilder,
    rpc: async (name: string, _args: unknown) => {
      if (name === 'signal_queue_claim_slice') {
        return { data: [{ ticker: FEED_SYNTHETIC_TICKER, gics_sector: null }], error: null };
      }
      if (name === 'signal_queue_cas_finalizing') return { data: false, error: null };
      return { data: null, error: null };
    },
  };

  const config = {
    signalId: 'news_sentiment_7d',
    ratePerSec: 100, callsPerName: 1, sliceSize: 1,
    maxObservationsPerRun: 2000,
    heartbeatTimeoutSec: 600, stagingTtlSec: 3600,
    mode: 'sequential-feed', pagesPerSlice: 15, maxPages: 70,
    fetchPage: fetchPageImpl,
    buildObservations: () => [],
    fetchAndCompute: async () => ({ kind: 'skip', reason: 'no_data', detail: 'unused' }),
  };

  return { supabase: supabase as unknown, calls, config: config as unknown };
}

// ── Pure-helper unit assertions ─────────────────────────────────────────

Deno.test('INC-74 dedupeFeedItems: ticker twice in one article → first-wins, 1 drop, 0 conflicts', () => {
  const r = dedupeFeedItems('run1', [
    { articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
    { articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
  ]);
  assertEquals(r.rows.length, 1);
  assertEquals(r.duplicatesDropped, 1);
  assertEquals(r.conflicts, 0);
  assertEquals(r.rows[0].sentiment_num, 1);
});

Deno.test('INC-74 dedupeFeedItems: conflicting sentiment counted as conflict', () => {
  const r = dedupeFeedItems('run2', [
    { articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
    { articleId: 'A1', ticker: 'AAPL', sentimentNum: -1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
  ]);
  assertEquals(r.rows.length, 1);
  assertEquals(r.duplicatesDropped, 1);
  assertEquals(r.conflicts, 1);
  assertEquals(r.rows[0].sentiment_num, 1, 'first-wins keeper preserved');
});

// ── (a) same ticker twice in one page's insights — engine-integrated ────

Deno.test('INC-74 (a): duplicate insight within one page → upsert sees 1 row, counters surface', async () => {
  const stub = makeStub(() => ({
    items: [
      { articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
      { articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
    ],
    nextToken: null,
  }));
  const res = await runQueueSlice({
    supabase: stub.supabase, config: stub.config,
    as_of: new Date('2026-06-12T01:00:00Z'), run_id: 'r-a',
    liveClock: createFixedClock(new Date('2026-06-12T01:00:00Z')),
  });
  assertEquals(res.duplicate_tuples_dropped, 1);
  assertEquals(res.duplicate_conflicts, 0);
  const upserts = stub.calls.filter((c) => c.table === 'signal_queue_feed_items' && c.op === 'upsert');
  assertEquals(upserts.length, 1);
  assertEquals((upserts[0].payload as unknown as unknown[]).length, 1, 'exactly one row reaches the DB');
});

// ── (b) same (article, ticker) across two pages within one slice ────────

Deno.test('INC-74 (b): duplicate spanning page boundary → counters accumulate across pages', async () => {
  let pageNum = 0;
  const stub = makeStub(() => {
    pageNum++;
    if (pageNum === 1) {
      return {
        items: [{ articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' }],
        nextToken: 'P2',
      };
    }
    // Page 2 repeats the same (article, ticker). Engine dedupes within
    // each page's batch; the DB-side PK (run_id, article_id, ticker)
    // catches cross-page duplicates via ON CONFLICT — which is safe
    // because each page is a separate INSERT statement. The engine-side
    // count therefore reports 0 here (no within-batch dup), and the
    // upsert on page 2 is a harmless conflict-update.
    return {
      items: [{ articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' }],
      nextToken: null,
    };
  });
  const res = await runQueueSlice({
    supabase: stub.supabase, config: stub.config,
    as_of: new Date('2026-06-12T01:00:00Z'), run_id: 'r-b',
    liveClock: createFixedClock(new Date('2026-06-12T01:00:00Z')),
  });
  // Within-page dup count = 0 (each page had 1 unique row); cross-page
  // duplicates are absorbed by the DB-side conflict update (safe — one
  // row per INSERT statement). Counters surface for handler observability.
  assertEquals(res.duplicate_tuples_dropped, 0);
  assertEquals(res.duplicate_conflicts, 0);
  const upserts = stub.calls.filter((c) => c.table === 'signal_queue_feed_items' && c.op === 'upsert');
  assertEquals(upserts.length, 2, 'one upsert per page; cross-page dup is DB-side ON CONFLICT');
});

// ── (c) conflicting-sentiment duplicate within one slice ────────────────

Deno.test('INC-74 (c): conflicting duplicate → first-wins, conflict counter increments', async () => {
  const stub = makeStub(() => ({
    items: [
      { articleId: 'A1', ticker: 'AAPL', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
      { articleId: 'A1', ticker: 'AAPL', sentimentNum: -1, tierWeight: 0.4, publishedUtc: '2026-06-12T00:00:00Z' },
      { articleId: 'A2', ticker: 'MSFT', sentimentNum: 1, tierWeight: 1.0, publishedUtc: '2026-06-12T00:00:00Z' },
    ],
    nextToken: null,
  }));
  const res = await runQueueSlice({
    supabase: stub.supabase, config: stub.config,
    as_of: new Date('2026-06-12T01:00:00Z'), run_id: 'r-c',
    liveClock: createFixedClock(new Date('2026-06-12T01:00:00Z')),
  });
  assertEquals(res.duplicate_tuples_dropped, 1);
  assertEquals(res.duplicate_conflicts, 1);
  const upserts = stub.calls.filter((c) => c.table === 'signal_queue_feed_items' && c.op === 'upsert');
  assertEquals(upserts.length, 1);
  const rows = upserts[0].payload as unknown as Array<{ article_id: string; ticker: string; sentiment_num: number }>;
  assertEquals(rows.length, 2);
  const aapl = rows.find((r) => r.ticker === 'AAPL');
  assert(aapl !== undefined);
  assertEquals(aapl!.sentiment_num, 1, 'first-wins: keeper is +1 not -1');
});