// FIX-2 (2026-07-23) — IN-RUN SNAPSHOT RETRY WRAPPER (both legs).
//
// PURE MODULE. No DB, no network directly, no wall-clock. All I/O is
// injected (fetcher, asOf, sleep) so the wrapper is unit-testable
// without Polygon and without real timers.
//
// See `docs/08-planning/FIX-2-spec.md` for the verbatim operator spec.
//
// ---- WHAT ----------------------------------------------------------------
// At the shared snapshot-fetch seam (consumed by entry-price-construction,
// exit-price-construction, and i5-recheck via their calling engines), when
// a fetched snapshot fails the freshness predicate:
//   (1) refetch ONCE after backoff_ms = 1500 within the same run (hard cap
//       attempts = 2, per lot);
//   (2) emit the typed `polygon_snapshot_stale` refusal ONLY if BOTH
//       attempts fail freshness (this wrapper does not emit the refusal
//       itself — it returns the final attempt's snapshot; downstream
//       price-construction validates and emits the typed refusal, so the
//       flow class is preserved verbatim);
//   (3) increment a `retry_recovered` counter (surfaced by the caller into
//       run metadata so FIX-6-class analyses can price the fix);
//   (4) raw signed `snapshotAgeMs` from the FINAL attempt is preserved on
//       the envelope.
//
// ---- WHAT IT IS NOT ------------------------------------------------------
//   * NOT a refusal-class demotion.
//   * NOT a window override.
//   * NOT an age bypass.
//   * The freshness predicate itself is UNTOUCHED — FIX-1's clamp stands:
//     `Math.max(OVERSHOOT_SNAPSHOT_MIN_AGE_MS, rawAgeMs) ≤ OVERSHOOT_SNAPSHOT_MAX_AGE_MS`.
//
// ---- MOTIVATION ----------------------------------------------------------
// VICR-class genuine transients (+15.5s snapshot skew) that strand lots
// past horizon (FIX-2-NOTE-01, −900 bps of −1467). Retry-once catches the
// transient without loosening the predicate for the true-stale case.
//
// ---- UNRELATED THROWS ----------------------------------------------------
// The wrapper only retries when the first attempt returns a non-null
// snapshot that fails the freshness predicate. A `null` return (fetch/parse
// failure — surfaces as `polygon_snapshot_unavailable`/`_malformed` in
// price-construction) does NOT retry. A thrown exception is NOT caught and
// NOT retried — it propagates to the caller so per-lot try/catch classifies
// it (matches the pre-FIX-2 behaviour where network throws were counted
// under `snapshot_fetch_failed` / `per_lot_unexpected`).

import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';
import {
  OVERSHOOT_SNAPSHOT_MIN_AGE_MS,
  OVERSHOOT_SNAPSHOT_MAX_AGE_MS,
} from './snapshot-age-bounds.ts';

/** FIX-2 backoff between attempt-1 and attempt-2. Locked by operator spec. */
export const OVERSHOOT_SNAPSHOT_RETRY_BACKOFF_MS = 1_500;

/** FIX-2 hard cap. Attempts=2 = one retry after the initial fetch. */
export const OVERSHOOT_SNAPSHOT_RETRY_MAX_ATTEMPTS = 2;

export interface SnapshotRetryDeps {
  /** Bound fetcher (already knows polygonKey + symbol). Returns null on
   *  fetch/parse failure (mirrors caller-side `fetchPolygonSnapshot`). */
  fetcher: () => Promise<PolygonQuoteSnapshot | null>;
  /** Run-level clock reference. Frozen across both attempts on purpose —
   *  this matches the exact `asOf` that downstream price-construction
   *  uses, so the wrapper's freshness decision is bit-consistent with
   *  the authoritative refusal in `*-price-construction.ts`. A newer
   *  polygon snapshot returned by attempt-2 will have `capturedAt >
   *  asOf`, producing a NEGATIVE raw age that clamps fresh under FIX-1. */
  asOf: Date;
  /** Backoff sleep. Injectable for tests (real callers pass setTimeout). */
  sleep: (ms: number) => Promise<void>;
}

export interface SnapshotRetryResult {
  /** Final-attempt snapshot (or null if a fetch attempt returned null). */
  snapshot: PolygonQuoteSnapshot | null;
  /** How many attempts were made (1 or 2). */
  attempts: number;
  /** True iff attempt-1 was stale AND attempt-2 was fresh. False on all
   *  other terminal states (first-success, both-stale, either-null). */
  retryRecovered: boolean;
  /** Raw signed age of the FINAL attempt's snapshot (ms). Null if the
   *  final snapshot is null. Preserved on the envelope per FIX-2 spec. */
  finalAgeMs: number | null;
}

/** Mirrors the exact freshness predicate used by exit-price-construction /
 *  entry-price-construction / i5-recheck (all three route through
 *  snapshot-age-bounds.ts constants). Kept private to this module so
 *  callers cannot drift the semantics — the authoritative refusal still
 *  lives in price-construction. */
function isFresh(snap: PolygonQuoteSnapshot, asOf: Date): boolean {
  const rawAgeMs = asOf.getTime() - snap.capturedAt.getTime();
  if (!Number.isFinite(rawAgeMs)) return false;
  const effective = Math.max(OVERSHOOT_SNAPSHOT_MIN_AGE_MS, rawAgeMs);
  return effective <= OVERSHOOT_SNAPSHOT_MAX_AGE_MS;
}

function rawAge(snap: PolygonQuoteSnapshot, asOf: Date): number {
  return asOf.getTime() - snap.capturedAt.getTime();
}

/**
 * FIX-2 wrapper. Attempts up to 2 fetches; retries once on stale; does not
 * retry on null; does not catch throws.
 *
 * @throws whatever `deps.fetcher()` throws (never wrapped, never retried).
 */
export async function fetchPolygonSnapshotWithRetry(
  deps: SnapshotRetryDeps,
): Promise<SnapshotRetryResult> {
  // Attempt 1 — exceptions propagate verbatim (case 4).
  const attempt1 = await deps.fetcher();
  if (attempt1 === null) {
    // Null = fetch/parse failure; NOT a freshness failure. Do not retry
    // (spec is specific to the freshness predicate). Surfaces downstream
    // as `polygon_snapshot_unavailable` or `_malformed`.
    return { snapshot: null, attempts: 1, retryRecovered: false, finalAgeMs: null };
  }
  if (isFresh(attempt1, deps.asOf)) {
    return {
      snapshot: attempt1,
      attempts: 1,
      retryRecovered: false,
      finalAgeMs: rawAge(attempt1, deps.asOf),
    };
  }

  // Attempt 1 was stale → backoff and retry once.
  await deps.sleep(OVERSHOOT_SNAPSHOT_RETRY_BACKOFF_MS);

  // Attempt 2 — exceptions again propagate verbatim.
  const attempt2 = await deps.fetcher();
  if (attempt2 === null) {
    return { snapshot: null, attempts: 2, retryRecovered: false, finalAgeMs: null };
  }
  const attempt2Fresh = isFresh(attempt2, deps.asOf);
  return {
    snapshot: attempt2,
    attempts: 2,
    retryRecovered: attempt2Fresh,
    finalAgeMs: rawAge(attempt2, deps.asOf),
  };
}