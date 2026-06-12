/**
 * news-sentiment-queue-registration_test — FP-048 Phase 3b drift sentinels.
 *
 * Pins:
 *   - signal_id ↔ job_id ↔ JOB_ID_TO_SIGNAL_ID mapping coherence
 *   - sequential-feed mode discipline (config can't be registered as
 *     per-ticker without raising — cross-mode contamination test)
 *   - structural arithmetic: pagesPerSlice × OBSERVED_PAGE_LATENCY_S
 *     = 94.5 s; assert < 150 s wall and < 120 s STOP gate
 *   - rate-bound is computed but ASSERTED NON-BINDING (latency dominates)
 *
 * The arithmetic is derived structurally so a future tweak of any
 * constant breaks the assertion mechanically rather than silently
 * drifting the module doc's pre-flight row out of sync with the code.
 */
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  NEWS_QUEUE_CONFIG,
  NEWS_QUEUE_JOB_ID,
  NEWS_SIGNAL_ID,
  OBSERVED_PAGE_LATENCY_S,
  RATE_SAFETY_MULTIPLIER,
  SELF_IMPOSED_RATE_CAP_RPS,
} from './news-sentiment-queue-registration.ts';
import { JOB_ID_TO_SIGNAL_ID } from '../shared/job-signal-mapping.ts';
import {
  createTestRegistry,
  isFeedMode,
} from '../shared/queue-worker/queue-config.ts';

// ── signal-id ↔ job-id ↔ mapping coherence ───────────────────────────────

Deno.test('registration — NEWS_SIGNAL_ID matches DEC-056 binding literal', () => {
  assertStrictEquals(NEWS_SIGNAL_ID, 'news_sentiment_7d');
});

Deno.test('registration — NEWS_QUEUE_JOB_ID follows longshort.<name>.compute family', () => {
  assertStrictEquals(NEWS_QUEUE_JOB_ID, 'longshort.news.compute');
});

Deno.test('registration — JOB_ID_TO_SIGNAL_ID[NEWS_QUEUE_JOB_ID] === NEWS_SIGNAL_ID (FP-010 inheritance)', () => {
  assertStrictEquals(JOB_ID_TO_SIGNAL_ID[NEWS_QUEUE_JOB_ID], NEWS_SIGNAL_ID);
});

// ── mode discipline ──────────────────────────────────────────────────────

Deno.test('registration — NEWS_QUEUE_CONFIG declares sequential-feed mode', () => {
  assertStrictEquals(NEWS_QUEUE_CONFIG.mode, 'sequential-feed');
  // Mirror via the engine's discriminator helper.
  assertStrictEquals(isFeedMode(NEWS_QUEUE_CONFIG), true);
});

Deno.test('registration — cross-mode contamination guard: registering news as per-ticker must fail validation', () => {
  const reg = createTestRegistry();
  // Build a deliberately-malformed config: per-ticker required fields
  // present AND feed-mode fields present. The validator's per-ticker
  // branch runs (mode omitted → default per-ticker) and the cross-mode
  // contamination check at the END of that branch must throw.
  const badConfig = {
    signalId: NEWS_SIGNAL_ID,
    jobId: NEWS_QUEUE_JOB_ID,
    ratePerSec: NEWS_QUEUE_CONFIG.ratePerSec,
    heartbeatTimeoutSec: NEWS_QUEUE_CONFIG.heartbeatTimeoutSec,
    stagingTtlSec: NEWS_QUEUE_CONFIG.stagingTtlSec,
    // mode omitted → per-ticker default; supply per-ticker required
    // fields with synthetic values so the validator reaches the
    // cross-mode contamination check rather than tripping a missing-
    // required-field error first.
    callsPerName: 1,
    sliceSize: 1,
    fetchAndCompute: async () => ({ kind: 'value' as const, raw: 0 }),
    // ── feed-mode fields ALSO present — this is the contamination ──
    pagesPerSlice: NEWS_QUEUE_CONFIG.pagesPerSlice,
    maxPages: NEWS_QUEUE_CONFIG.maxPages,
    fetchPage: async () => ({ items: [], nextToken: null }),
    computeFromItems: () => ({ kind: 'value' as const, raw: 0 }),
  };
  assertThrows(
    () => reg.register(badConfig),
    Error,
    'per-ticker mode must not set feed-mode fields',
  );
});

Deno.test('registration — cross-mode contamination guard (mirror): feed mode + per-ticker fields must fail validation', () => {
  const reg = createTestRegistry();
  // Mirror: declare sequential-feed mode but also supply per-ticker
  // fields → the feed-mode branch's "feed mode must not set X" check
  // must throw. Catches accidental copy-paste from the PEAD/options
  // registrations into a feed-mode config.
  const badConfig = {
    signalId: NEWS_SIGNAL_ID,
    jobId: NEWS_QUEUE_JOB_ID,
    ratePerSec: NEWS_QUEUE_CONFIG.ratePerSec,
    heartbeatTimeoutSec: NEWS_QUEUE_CONFIG.heartbeatTimeoutSec,
    stagingTtlSec: NEWS_QUEUE_CONFIG.stagingTtlSec,
    mode: 'sequential-feed' as const,
    pagesPerSlice: NEWS_QUEUE_CONFIG.pagesPerSlice,
    maxPages: NEWS_QUEUE_CONFIG.maxPages,
    fetchPage: async () => ({ items: [], nextToken: null }),
    computeFromItems: () => ({ kind: 'value' as const, raw: 0 }),
    // ── per-ticker contamination ──
    fetchAndCompute: async () => ({ kind: 'value' as const, raw: 0 }),
  };
  assertThrows(
    () => reg.register(badConfig),
    Error,
    'feed mode must not set fetchAndCompute',
  );
});

// ── structural pre-flight arithmetic (both-bounds) ───────────────────────

Deno.test('registration — latency bound: pagesPerSlice × OBSERVED_PAGE_LATENCY_S = 94.5 s, SAFE vs 120 s STOP gate and 150 s HTTP wall', () => {
  const latencyBoundS = NEWS_QUEUE_CONFIG.pagesPerSlice * OBSERVED_PAGE_LATENCY_S;
  assertStrictEquals(latencyBoundS, 94.5);
  // Both binding walls — assert headroom is strictly positive.
  const STOP_GATE_S = 120;
  const HTTP_WALL_S = 150;
  if (!(latencyBoundS < STOP_GATE_S)) {
    throw new Error(`latency bound ${latencyBoundS}s breaches 120s STOP gate`);
  }
  if (!(latencyBoundS < HTTP_WALL_S)) {
    throw new Error(`latency bound ${latencyBoundS}s breaches 150s HTTP wall`);
  }
});

Deno.test('registration — rate bound: pagesPerSlice / (cap × safety) ≈ 1.76 s, NON-BINDING (latency dominates)', () => {
  const ratePerSec = SELF_IMPOSED_RATE_CAP_RPS * RATE_SAFETY_MULTIPLIER;
  assertStrictEquals(ratePerSec, NEWS_QUEUE_CONFIG.ratePerSec);
  assertStrictEquals(ratePerSec, 8.5);
  const rateBoundS = NEWS_QUEUE_CONFIG.pagesPerSlice / ratePerSec;
  // Round to 2dp for the assertion.
  assertStrictEquals(Math.round(rateBoundS * 100) / 100, 1.76);
  const latencyBoundS = NEWS_QUEUE_CONFIG.pagesPerSlice * OBSERVED_PAGE_LATENCY_S;
  // Latency must dominate by an order of magnitude — anti-phantom assertion
  // so future config tweaks that flip the binding bound surface here.
  if (!(latencyBoundS > rateBoundS * 10)) {
    throw new Error(
      `rate bound ${rateBoundS}s is no longer trivially non-binding vs latency ${latencyBoundS}s — re-evaluate the arithmetic row`,
    );
  }
});

Deno.test('registration — runaway guard maxPages exceeds observed worst-case (70 pages, FP-048 Phase-0)', () => {
  const OBSERVED_MAX_PAGES = 70;
  if (!(NEWS_QUEUE_CONFIG.maxPages > OBSERVED_MAX_PAGES)) {
    throw new Error(
      `maxPages ${NEWS_QUEUE_CONFIG.maxPages} does not exceed Phase-0 observed max ${OBSERVED_MAX_PAGES}`,
    );
  }
});

Deno.test('registration — config shape: feed-mode fields present, per-ticker fields absent', () => {
  // Sanity: the consumer config object is mode-coherent (this is what the
  // engine validator would also check at register-time on the real
  // registry, but the production singleton requires POLYGON_API_KEY at
  // first-use — we mirror the validator's mode assertions on the config
  // object directly so this test stays env-free).
  assertEquals(
    {
      hasMode: NEWS_QUEUE_CONFIG.mode === 'sequential-feed',
      hasPagesPerSlice: typeof NEWS_QUEUE_CONFIG.pagesPerSlice === 'number',
      hasMaxPages: typeof NEWS_QUEUE_CONFIG.maxPages === 'number',
      // per-ticker fields MUST NOT be on the feed config
      hasSliceSize: 'sliceSize' in NEWS_QUEUE_CONFIG,
      hasCallsPerName: 'callsPerName' in NEWS_QUEUE_CONFIG,
      hasFetchAndCompute: 'fetchAndCompute' in NEWS_QUEUE_CONFIG,
    },
    {
      hasMode: true,
      hasPagesPerSlice: true,
      hasMaxPages: true,
      hasSliceSize: false,
      hasCallsPerName: false,
      hasFetchAndCompute: false,
    },
  );
});