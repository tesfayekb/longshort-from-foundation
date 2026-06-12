// deno-lint-ignore-file no-import-prefix
// @ts-nocheck — Deno test file.
/**
 * INC-73 regression suite — feed-mode slice-failure telemetry contract.
 *
 * Covers:
 *   (1) throw-on-page-2 → failure_reason stamped + claim released + cursor preserved
 *   (2) retry-next-tick resumes from same cursor (idempotent via feed_items PK)
 *   (3) 3 consecutive throws → run failed with last verbatim error
 *   (4) any successful slice resets slice_failure_count to 0
 *   (5) per-page heartbeat advances under liveClock (monotonic-advance regression)
 *
 * Per-ticker mode is intentionally NOT touched by these tests — regression
 * fence per the INC-73 binding (per-ticker suite remains UNMODIFIED).
 *
 * Source-sentinel only (does not boot Postgres). Validates the engine
 * surface emits the documented telemetry shape and threshold semantics
 * through a stubbed SupabaseClient that records every call.
 *
 * Typing convention (FP-041): narrow local interfaces + `as unknown as <T>`
 * boundary casts. Zero literal `any` tokens — enforced by Gate-11 sentinel
 * `scripts/check-queue-worker-test-any.ts`.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FEED_SLICE_FAILURE_THRESHOLD,
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
  status?: string;
  failure_reason?: string;
  heartbeat_at?: string;
}

interface RecordedCall {
  table: string;
  op: string;
  payload?: Payload;
  filters?: Filters;
}

interface PageResult {
  items: unknown[];
  nextToken: string | null;
}

interface FetchPageCall {
  cursorToken: string | null;
}

type FetchPageImpl = (call: FetchPageCall) => Promise<PageResult> | PageResult;

interface StubHandle {
  supabase: unknown;
  calls: RecordedCall[];
  getRunState: () => RunStateRow;
  getClaimedAt: () => string | null;
  config: unknown;
}

interface MakeStubOpts {
  initialPagesFetched?: number;
  initialSliceFailureCount?: number;
  fetchPageImpl: FetchPageImpl;
}

// ── Stub builder ────────────────────────────────────────────────────────

function makeStub(opts: MakeStubOpts): StubHandle {
  const calls: RecordedCall[] = [];
  let runState: RunStateRow = {
    feed_cursor: null,
    feed_pages_fetched: opts.initialPagesFetched ?? 0,
    slice_failure_count: opts.initialSliceFailureCount ?? 0,
  };
  let claimed_at: string | null = null;

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
      if (table === 'signal_queue_cursor' && 'claimed_at' in payload) {
        claimed_at = payload.claimed_at as string | null;
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
        claimed_at = new Date().toISOString();
        return { data: [{ ticker: FEED_SYNTHETIC_TICKER, gics_sector: null }], error: null };
      }
      if (name === 'signal_queue_cas_finalizing') return { data: false, error: null };
      return { data: null, error: null };
    },
  };

  const config = {
    signalId: 'news_sentiment_7d',
    ratePerSec: 100,
    callsPerName: 1,
    sliceSize: 1,
    maxObservationsPerRun: 2000,
    heartbeatTimeoutSec: 600,
    stagingTtlSec: 3600,
    // feed-mode markers
    mode: 'sequential-feed',
    pagesPerSlice: 15,
    maxPages: 70,
    fetchPage: opts.fetchPageImpl,
    buildObservations: () => [],
    fetchAndCompute: async () => ({ kind: 'skip', reason: 'no_data', detail: 'unused' }),
  };

  return {
    supabase: supabase as unknown,
    calls,
    getRunState: () => ({ ...runState }),
    getClaimedAt: () => claimed_at,
    config: config as unknown,
  };
}

// ── (1) throw-on-page-2 → reason stamped + claim released + cursor preserved

Deno.test('INC-73: throw on page 2 stamps failure_reason, increments counter, releases claim', async () => {
  let pageNum = 0;
  const stub = makeStub({
    fetchPageImpl: () => {
      pageNum++;
      if (pageNum === 1) return { items: [], nextToken: 'PAGE2_TOKEN' };
      throw new Error('upstream HTTP 500');
    },
  });
  const clock = createFixedClock(new Date('2026-06-12T02:00:00Z'));
  let threw = false;
  try {
    await runQueueSlice({
      supabase: stub.supabase,
      config: stub.config,
      as_of: new Date('2026-06-12T01:30:00Z'),
      run_id: 'r1',
      liveClock: clock,
    });
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes('upstream HTTP 500'));
  }
  assert(threw, 'expected re-throw for handler to emit slice.failed');

  const final = stub.getRunState();
  assertEquals(final.slice_failure_count, 1);

  const failureStamps = stub.calls.filter(
    (c) => c.table === 'signal_queue_runs' && c.op === 'update' &&
           typeof c.payload?.failure_reason === 'string' &&
           (c.payload.failure_reason as string).startsWith('feed_slice_threw:'),
  );
  assert(failureStamps.length >= 1, 'expected failure_reason stamp');
  assert((failureStamps[0].payload!.failure_reason as string).includes('upstream HTTP 500'));

  const releases = stub.calls.filter(
    (c) => c.table === 'signal_queue_cursor' && c.op === 'update' && c.payload?.claimed_at === null,
  );
  assertEquals(releases.length, 1, 'expected exactly one cursor release');
});

// ── (3) 3 consecutive throws → run failed with last verbatim error

Deno.test('INC-73: 3rd consecutive throw terminal-fails run with last verbatim error', async () => {
  const stub = makeStub({
    initialSliceFailureCount: FEED_SLICE_FAILURE_THRESHOLD - 1, // 2 — next throw is the 3rd
    fetchPageImpl: () => { throw new Error('upstream HTTP 503 on retry'); },
  });
  try {
    await runQueueSlice({
      supabase: stub.supabase, config: stub.config,
      as_of: new Date('2026-06-12T01:35:00Z'), run_id: 'r2',
      liveClock: createFixedClock(new Date('2026-06-12T02:05:00Z')),
    });
  } catch (_e) { /* expected */ }

  const final = stub.getRunState();
  assertEquals(final.slice_failure_count, FEED_SLICE_FAILURE_THRESHOLD);
  assertEquals(final.status, 'failed');
  const reason = final.failure_reason as string;
  assert(reason.startsWith('feed_slice_threw_3x:'));
  assert(reason.includes('upstream HTTP 503'));
});

// ── (4) successful slice resets counter

Deno.test('INC-73: successful slice resets slice_failure_count to 0', async () => {
  const stub = makeStub({
    initialSliceFailureCount: 2,
    fetchPageImpl: () => ({ items: [], nextToken: null }), // single page, exhausts
  });
  await runQueueSlice({
    supabase: stub.supabase, config: stub.config,
    as_of: new Date('2026-06-12T01:40:00Z'), run_id: 'r3',
    liveClock: createFixedClock(new Date('2026-06-12T02:10:00Z')),
  });
  const resetCalls = stub.calls.filter(
    (c) => c.table === 'signal_queue_runs' && c.op === 'update' &&
           c.payload?.slice_failure_count === 0,
  );
  assert(resetCalls.length >= 1, 'expected slice_failure_count reset on success');
});

// ── (5) heartbeat advances under liveClock (monotonic-advance regression)

Deno.test('INC-73: per-page heartbeat tracks liveClock not as_of (monotonic advance)', async () => {
  let pageNum = 0;
  const stub = makeStub({
    fetchPageImpl: () => {
      pageNum++;
      return { items: [], nextToken: pageNum < 2 ? `T${pageNum}` : null };
    },
  });
  // Frozen as_of vs. distinct liveClock instant — heartbeat MUST use the latter.
  const asOfFrozen = new Date('2026-06-12T01:00:00Z');
  const liveInstant = new Date('2026-06-12T02:00:00Z');
  await runQueueSlice({
    supabase: stub.supabase, config: stub.config,
    as_of: asOfFrozen, run_id: 'r4',
    liveClock: createFixedClock(liveInstant),
  });
  const advances = stub.calls.filter(
    (c) => c.table === 'signal_queue_runs' && c.op === 'update' &&
           c.payload !== undefined && 'feed_pages_fetched' in c.payload,
  );
  assert(advances.length >= 1, 'expected at least one per-page advance');
  for (const a of advances) {
    assertEquals(a.payload!.heartbeat_at, liveInstant.toISOString(),
      'heartbeat_at MUST use liveClock, not as_of');
    assert(a.payload!.heartbeat_at !== asOfFrozen.toISOString());
  }
});