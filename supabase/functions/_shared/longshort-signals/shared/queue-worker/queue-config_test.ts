// deno-lint-ignore-file no-import-prefix require-await -- std assert import + typed mock factory
// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createTestRegistry,
  productionQueueRegistry,
  WORK_LIST_HEARTBEAT_ITEM_INTERVAL,
  isWorkListMode,
  isFeedMode,
  type QueueSignalConfig,
  type WorkListItem,
} from './queue-config.ts';

function makeCfg(overrides: Partial<QueueSignalConfig> = {}): QueueSignalConfig {
  return {
    signalId: 'test_signal',
    jobId: 'job-test',
    ratePerSec: 1,
    callsPerName: 1,
    sliceSize: 10,
    heartbeatTimeoutSec: 300,
    stagingTtlSec: 86400,
    fetchAndCompute: async () => ({ kind: 'value', raw: 0 }),
    ...overrides,
  };
}

Deno.test('production registry ships empty in Phase 2', () => {
  assertEquals(productionQueueRegistry.listSignalIds(), []);
});

Deno.test('register + get round-trips', () => {
  const r = createTestRegistry();
  r.register(makeCfg());
  assertEquals(r.get('test_signal').signalId, 'test_signal');
  assert(r.has('test_signal'));
  assertEquals(r.listSignalIds(), ['test_signal']);
});

Deno.test('duplicate register throws', () => {
  const r = createTestRegistry();
  r.register(makeCfg());
  assertThrows(() => r.register(makeCfg()), Error, 'already registered');
});

Deno.test('get on missing throws (no silent fallback)', () => {
  const r = createTestRegistry();
  assertThrows(() => r.get('nope'), Error, 'no config registered');
});

Deno.test('listSignalIds is sorted (stable order for sweeper iteration)', () => {
  const r = createTestRegistry();
  r.register(makeCfg({ signalId: 'z' }));
  r.register(makeCfg({ signalId: 'a' }));
  r.register(makeCfg({ signalId: 'm' }));
  assertEquals(r.listSignalIds(), ['a', 'm', 'z']);
});

Deno.test('validates ratePerSec > 0', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ ratePerSec: 0 })), Error, 'ratePerSec');
  assertThrows(() => r.register(makeCfg({ ratePerSec: -1 })), Error, 'ratePerSec');
});

Deno.test('validates integer fields', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ callsPerName: 0 })), Error, 'callsPerName');
  assertThrows(() => r.register(makeCfg({ sliceSize: 1.5 })), Error, 'sliceSize');
  assertThrows(() => r.register(makeCfg({ heartbeatTimeoutSec: 0 })), Error, 'heartbeatTimeoutSec');
  assertThrows(() => r.register(makeCfg({ stagingTtlSec: -1 })), Error, 'stagingTtlSec');
});

Deno.test('validates required string fields', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ signalId: '' })), Error, 'signalId');
  assertThrows(() => r.register(makeCfg({ jobId: '' })), Error, 'jobId');
});

// ─── work-list mode (FP-050 Phase 3.6a.i) ──────────────────────────────────

function makeWorkListCfg(overrides: Partial<QueueSignalConfig> = {}): QueueSignalConfig {
  return {
    signalId: 'test_work_list',
    jobId: 'job-work-list',
    ratePerSec: 5,
    heartbeatTimeoutSec: 300,
    stagingTtlSec: 86400,
    mode: 'work-list',
    itemsPerSlice: 50,
    callsPerItem: 2,
    seedWorkItems: async () => [] as ReadonlyArray<WorkListItem>,
    processItem: async () => ({ kind: 'processed' as const }),
    loadAndCompute: async () => [],
    ...overrides,
  };
}

Deno.test('work-list: heartbeat-item-interval constant is the ruled value (Q2 = 25)', () => {
  assertEquals(WORK_LIST_HEARTBEAT_ITEM_INTERVAL, 25);
});

Deno.test('work-list: discriminator helpers are mutually exclusive', () => {
  const wl = makeWorkListCfg();
  assert(isWorkListMode(wl));
  assert(!isFeedMode(wl));
});

Deno.test('work-list: minimal valid config registers', () => {
  const r = createTestRegistry();
  r.register(makeWorkListCfg());
  assertEquals(r.get('test_work_list').mode, 'work-list');
});

Deno.test('work-list: rejects unknown mode string', () => {
  const r = createTestRegistry();
  // Typed-mock convention: cast through `unknown` at the boundary to
  // simulate a runtime mode string the QueueSignalConfig union forbids
  // at compile time — no untyped escape hatch needed.
  const bogus = { mode: 'bogus' as unknown as QueueSignalConfig['mode'] };
  assertThrows(() => r.register(makeWorkListCfg(bogus)), Error, 'mode must be');
});

Deno.test('work-list: requires itemsPerSlice positive integer', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeWorkListCfg({ itemsPerSlice: 0 })), Error, 'itemsPerSlice');
  assertThrows(() => r.register(makeWorkListCfg({ itemsPerSlice: 1.5 })), Error, 'itemsPerSlice');
  assertThrows(() => r.register(makeWorkListCfg({ itemsPerSlice: undefined })), Error, 'itemsPerSlice');
});

Deno.test('work-list: requires callsPerItem positive integer', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeWorkListCfg({ callsPerItem: 0 })), Error, 'callsPerItem');
  assertThrows(() => r.register(makeWorkListCfg({ callsPerItem: undefined })), Error, 'callsPerItem');
});

Deno.test('work-list: requires seedWorkItems / processItem / loadAndCompute functions', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeWorkListCfg({ seedWorkItems: undefined })), Error, 'seedWorkItems');
  assertThrows(() => r.register(makeWorkListCfg({ processItem: undefined })), Error, 'processItem');
  assertThrows(() => r.register(makeWorkListCfg({ loadAndCompute: undefined })), Error, 'loadAndCompute');
});

// ── Contamination matrix: work-list MUST NOT carry per-ticker fields ───────

Deno.test('work-list rejects per-ticker contamination: fetchAndCompute', () => {
  const r = createTestRegistry();
  assertThrows(
    () => r.register(makeWorkListCfg({ fetchAndCompute: async () => ({ kind: 'value', raw: 0 }) })),
    Error,
    'must not set fetchAndCompute',
  );
});

Deno.test('work-list rejects per-ticker contamination: sliceSize', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeWorkListCfg({ sliceSize: 10 })), Error, 'must not set sliceSize');
});

Deno.test('work-list rejects per-ticker contamination: callsPerName', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeWorkListCfg({ callsPerName: 1 })), Error, 'must not set callsPerName');
});

// ── Contamination matrix: work-list MUST NOT carry feed-mode fields ────────

Deno.test('work-list rejects feed contamination: pagesPerSlice / maxPages / fetchPage / computeFromItems', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeWorkListCfg({ pagesPerSlice: 15 })), Error, 'feed-mode fields');
  assertThrows(() => r.register(makeWorkListCfg({ maxPages: 70 })), Error, 'feed-mode fields');
  assertThrows(
    () => r.register(makeWorkListCfg({ fetchPage: async () => ({ items: [], nextToken: null }) })),
    Error,
    'feed-mode fields',
  );
  assertThrows(
    () => r.register(makeWorkListCfg({ computeFromItems: () => ({ kind: 'value', raw: 0 }) })),
    Error,
    'feed-mode fields',
  );
});

// ── Contamination matrix: feed mode MUST NOT carry work-list fields ────────

function makeFeedCfg(overrides: Partial<QueueSignalConfig> = {}): QueueSignalConfig {
  return {
    signalId: 'test_feed',
    jobId: 'job-feed',
    ratePerSec: 10,
    heartbeatTimeoutSec: 300,
    stagingTtlSec: 86400,
    mode: 'sequential-feed',
    pagesPerSlice: 15,
    maxPages: 70,
    fetchPage: async () => ({ items: [], nextToken: null }),
    computeFromItems: () => ({ kind: 'value', raw: 0 }),
    ...overrides,
  };
}

Deno.test('feed rejects work-list contamination: itemsPerSlice / callsPerItem / seed / process / load', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeFeedCfg({ itemsPerSlice: 50 })), Error, 'work-list fields');
  assertThrows(() => r.register(makeFeedCfg({ callsPerItem: 2 })), Error, 'work-list fields');
  assertThrows(() => r.register(makeFeedCfg({ seedWorkItems: async () => [] })), Error, 'work-list fields');
  assertThrows(
    () => r.register(makeFeedCfg({ processItem: async () => ({ kind: 'processed' as const }) })),
    Error,
    'work-list fields',
  );
  assertThrows(() => r.register(makeFeedCfg({ loadAndCompute: async () => [] })), Error, 'work-list fields');
});

// ── Contamination matrix: per-ticker mode MUST NOT carry work-list fields ──

Deno.test('per-ticker rejects work-list contamination: itemsPerSlice / callsPerItem / seed / process / load', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ itemsPerSlice: 50 })), Error, 'work-list fields');
  assertThrows(() => r.register(makeCfg({ callsPerItem: 2 })), Error, 'work-list fields');
  assertThrows(() => r.register(makeCfg({ seedWorkItems: async () => [] })), Error, 'work-list fields');
  assertThrows(
    () => r.register(makeCfg({ processItem: async () => ({ kind: 'processed' as const }) })),
    Error,
    'work-list fields',
  );
  assertThrows(() => r.register(makeCfg({ loadAndCompute: async () => [] })), Error, 'work-list fields');
});