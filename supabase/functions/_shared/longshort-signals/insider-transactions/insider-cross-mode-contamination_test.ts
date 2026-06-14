// @ts-nocheck — Deno test file. FP-050 Phase 3.6b.iii′ γ commit-2 —
// cross-mode contamination pins for the work-list registration surface.
//
// Load-bearing invariants:
//   (CM-1) Registering the SAME signalId twice (whether same mode or
//          different mode) THROWS — the engine registry has no
//          unregister/replace API. This is the structural guarantee
//          that backfill-mode CANNOT live alongside daily-mode in the
//          same isolate's registry; the manual handler MUST bypass the
//          registry to fire backfill (per the queue-bootstrap header).
//   (CM-2) `production-registrations.ts` registers ONLY daily mode.
//          The backfill jobId never appears in the registry — only the
//          per-request manual-handler config carries it.
//   (CM-3) A backfill-mode config built via `createInsiderWorkListConfig`
//          carries the BACKFILL jobId (proves the mode argument actually
//          parameterizes the produced config and is not silently dropped).
//   (CM-4) Cross-MODE-FAMILY contamination: a work-list config rejects
//          per-ticker fields (`fetchAndCompute`, `sliceSize`,
//          `callsPerName`) and feed-mode fields
//          (`pagesPerSlice`, `fetchPage`, `computeFromItems`) at
//          validateConfig time. Pinned at the engine level — re-pinned
//          here against the insider-specific config to catch silent
//          contamination if the producer module ever leaks a field
//          from another mode family.

import { assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createInsiderWorkListConfig,
  INSIDER_BACKFILL_JOB_ID,
  INSIDER_DAILY_JOB_ID,
  INSIDER_SIGNAL_ID,
  type InsiderWorkListDeps,
} from './insider-work-list-registration.ts';
import {
  createTestRegistry,
} from '../shared/queue-worker/queue-config.ts';

function stubDeps(): InsiderWorkListDeps {
  const stub = {} as never;
  return {
    supabase: stub,
    operator_id: '00000000-0000-0000-0000-000000000001',
    accessionIndex: stub,
    form4Fetcher: stub,
    loadAndComputeCtx: stub,
  };
}

// ── (CM-1) Duplicate signalId registration THROWS ─────────────────────
Deno.test('(CM-1) registry rejects duplicate signalId (daily+backfill in same isolate)', () => {
  const reg = createTestRegistry();
  reg.register(createInsiderWorkListConfig(stubDeps(), 'daily'));
  assertThrows(
    () => reg.register(createInsiderWorkListConfig(stubDeps(), 'backfill')),
    Error,
    `signal_id '${INSIDER_SIGNAL_ID}' already registered`,
  );
});

Deno.test('(CM-1b) registry rejects duplicate signalId even for same mode (idempotency is the CALLER\'s job via has())', () => {
  const reg = createTestRegistry();
  reg.register(createInsiderWorkListConfig(stubDeps(), 'daily'));
  assertThrows(
    () => reg.register(createInsiderWorkListConfig(stubDeps(), 'daily')),
    Error,
    `signal_id '${INSIDER_SIGNAL_ID}' already registered`,
  );
});

// ── (CM-2) Backfill jobId never lands in a daily-only registry ────────
Deno.test('(CM-2) daily-only registration: backfill jobId is absent', () => {
  const reg = createTestRegistry();
  reg.register(createInsiderWorkListConfig(stubDeps(), 'daily'));
  const cfg = reg.get(INSIDER_SIGNAL_ID);
  assert(cfg.jobId === INSIDER_DAILY_JOB_ID, `expected daily jobId; got ${cfg.jobId}`);
  assert(cfg.jobId !== INSIDER_BACKFILL_JOB_ID, 'backfill jobId MUST NOT leak into daily registry');
});

// ── (CM-3) Mode argument parameterizes the jobId ──────────────────────
Deno.test('(CM-3) backfill-mode config carries INSIDER_BACKFILL_JOB_ID (mode is not silently dropped)', () => {
  const cfg = createInsiderWorkListConfig(stubDeps(), 'backfill');
  assert(cfg.jobId === INSIDER_BACKFILL_JOB_ID);
  assert(cfg.signalId === INSIDER_SIGNAL_ID, 'signalId stable across modes');
  assert(cfg.mode === 'work-list', 'engine mode constant unchanged across daily/backfill');
});

// ── (CM-4) Cross-mode-family field contamination is rejected ──────────
Deno.test('(CM-4) work-list config rejects per-ticker fields at registry validate', () => {
  const reg = createTestRegistry();
  const base = createInsiderWorkListConfig(stubDeps(), 'daily');
  assertThrows(
    () => reg.register({ ...base, sliceSize: 100 } as never),
    Error,
    'work-list mode must not set sliceSize',
  );
});

Deno.test('(CM-4b) work-list config rejects feed-mode fields at registry validate', () => {
  const reg = createTestRegistry();
  const base = createInsiderWorkListConfig(stubDeps(), 'daily');
  assertThrows(
    () => reg.register({ ...base, pagesPerSlice: 10 } as never),
    Error,
    'work-list mode must not set feed-mode fields',
  );
});