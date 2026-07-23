// FIX-2 (2026-07-23) — 4-case test suite for the in-run snapshot retry
// wrapper. Case names match the operator-supplied build spec verbatim.

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fetchPolygonSnapshotWithRetry,
  OVERSHOOT_SNAPSHOT_RETRY_BACKOFF_MS,
  OVERSHOOT_SNAPSHOT_RETRY_MAX_ATTEMPTS,
} from './snapshot-retry.ts';
import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';

// Fixed asOf: 2026-07-23T20:00:00Z. Freshness threshold is 15_000 ms
// (OVERSHOOT_SNAPSHOT_MAX_AGE_MS). MIN clamp is 0 (FIX-1).
const AS_OF = new Date('2026-07-23T20:00:00Z');

function snapAt(offsetMs: number): PolygonQuoteSnapshot {
  // offsetMs is the age relative to AS_OF: positive = older (stale-side),
  // negative = newer than asOf (FIX-1 clamps to fresh).
  return {
    symbol: 'TEST',
    bid: 100.00,
    ask: 100.02,
    capturedAt: new Date(AS_OF.getTime() - offsetMs),
  };
}

function trackedSleep(): { fn: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    fn: (ms: number) => {
      calls.push(ms);
      return Promise.resolve();
    },
  };
}

Deno.test('FIX-2 case 1 — first-success: fresh attempt-1, no retry, no counter', async () => {
  const fresh = snapAt(5_000); // 5s old — well within 15s
  let fetchCount = 0;
  const sleep = trackedSleep();
  const r = await fetchPolygonSnapshotWithRetry({
    fetcher: () => { fetchCount += 1; return Promise.resolve(fresh); },
    asOf: AS_OF,
    sleep: sleep.fn,
  });
  assertEquals(fetchCount, 1);
  assertEquals(sleep.calls.length, 0, 'no backoff when attempt-1 is fresh');
  assertEquals(r.attempts, 1);
  assertEquals(r.retryRecovered, false);
  assertEquals(r.snapshot, fresh);
  assertEquals(r.finalAgeMs, 5_000);
});

Deno.test('FIX-2 case 2 — retry-success + counter: attempt-1 stale, attempt-2 fresh', async () => {
  const stale = snapAt(30_000); // 30s old — stale (> 15s)
  const fresh = snapAt(3_000);  // 3s old — fresh
  let fetchCount = 0;
  const sleep = trackedSleep();
  const r = await fetchPolygonSnapshotWithRetry({
    fetcher: () => {
      fetchCount += 1;
      return Promise.resolve(fetchCount === 1 ? stale : fresh);
    },
    asOf: AS_OF,
    sleep: sleep.fn,
  });
  assertEquals(fetchCount, 2);
  assertEquals(sleep.calls, [OVERSHOOT_SNAPSHOT_RETRY_BACKOFF_MS], 'exactly one 1500ms backoff');
  assertEquals(r.attempts, 2);
  assertEquals(r.retryRecovered, true, 'retry_recovered counter fires');
  assertEquals(r.snapshot, fresh, 'final envelope carries attempt-2 snapshot');
  assertEquals(r.finalAgeMs, 3_000, 'raw signed age from FINAL attempt');
});

Deno.test('FIX-2 case 3 — both-fail-typed: attempt-1 and attempt-2 both stale', async () => {
  const stale1 = snapAt(30_000);
  const stale2 = snapAt(25_000);
  let fetchCount = 0;
  const sleep = trackedSleep();
  const r = await fetchPolygonSnapshotWithRetry({
    fetcher: () => {
      fetchCount += 1;
      return Promise.resolve(fetchCount === 1 ? stale1 : stale2);
    },
    asOf: AS_OF,
    sleep: sleep.fn,
  });
  assertEquals(fetchCount, OVERSHOOT_SNAPSHOT_RETRY_MAX_ATTEMPTS);
  assertEquals(sleep.calls.length, 1);
  assertEquals(r.attempts, 2);
  assertEquals(r.retryRecovered, false, 'no recovery when both attempts stale');
  // Envelope carries attempt-2 snapshot so downstream price-construction
  // emits the authoritative typed `polygon_snapshot_stale` refusal.
  assertEquals(r.snapshot, stale2);
  assertEquals(r.finalAgeMs, 25_000);
});

Deno.test('FIX-2 case 4 — unrelated-throw-not-retried: fetcher throws, no retry, no counter', async () => {
  let fetchCount = 0;
  const sleep = trackedSleep();
  const err = new Error('polygon network TCP reset');
  await assertRejects(
    () => fetchPolygonSnapshotWithRetry({
      fetcher: () => { fetchCount += 1; throw err; },
      asOf: AS_OF,
      sleep: sleep.fn,
    }),
    Error,
    'polygon network TCP reset',
  );
  assertEquals(fetchCount, 1, 'throw is NOT retried');
  assertEquals(sleep.calls.length, 0, 'no backoff when throw');
});

// Corollary — null (fetch/parse failure) is NOT retried either. This is
// not one of the operator's four named cases, but it locks the spec's
// explicit "the freshness predicate itself is untouched" carve-out: only
// freshness-predicate failures trigger the retry path.
Deno.test('FIX-2 corollary — null attempt-1 does NOT retry (freshness-only scope)', async () => {
  let fetchCount = 0;
  const sleep = trackedSleep();
  const r = await fetchPolygonSnapshotWithRetry({
    fetcher: () => { fetchCount += 1; return Promise.resolve(null); },
    asOf: AS_OF,
    sleep: sleep.fn,
  });
  assertEquals(fetchCount, 1);
  assertEquals(sleep.calls.length, 0);
  assertEquals(r.attempts, 1);
  assertEquals(r.retryRecovered, false);
  assertEquals(r.snapshot, null);
  assertEquals(r.finalAgeMs, null);
});

// FIX-1 preservation check — a snapshot NEWER than asOf (negative raw age)
// must clamp fresh under the wrapper's predicate, same as it does in
// exit-price-construction. This guards against a silent FIX-1 divergence.
Deno.test('FIX-2 preserves FIX-1 clamp — attempt-1 with negative raw age is fresh', async () => {
  const negativeAge = snapAt(-2_115); // captured 2.115s in the future
  let fetchCount = 0;
  const sleep = trackedSleep();
  const r = await fetchPolygonSnapshotWithRetry({
    fetcher: () => { fetchCount += 1; return Promise.resolve(negativeAge); },
    asOf: AS_OF,
    sleep: sleep.fn,
  });
  assertEquals(fetchCount, 1);
  assertEquals(sleep.calls.length, 0);
  assertEquals(r.attempts, 1);
  assertEquals(r.finalAgeMs, -2_115, 'raw signed age preserved on envelope');
});