/**
 * ordering — FP-056 E2 (DEC-068 clause k.1 cross-symbol submission ordering).
 *
 * PURE COMPUTE. No I/O. The clause-k cross-symbol ordering rule lives here so
 * the dollar-neutrality-under-interruption protection is unit-testable in
 * isolation, without broker mocks or BP bookkeeping.
 *
 * RULE (DEC-068 clause k.1):
 *   Class order: (1) Closes → (2) Decreases → (3) Opens → (4) Increases.
 *   Within each class: SIDES INTERLEAVED (NOT all-longs-then-all-shorts),
 *   ordered by |delta_notional| DESCENDING. Ties broken by symbol ASC for
 *   determinism.
 *
 * RATIONALE (DEC-068 clause k.2 — the interruption-state argument):
 *   The invariant protected is DOLLAR-NEUTRALITY (§1 ~L182 90–110% gross-
 *   balance band). Closes/decreases-first leaves an interrupted batch UNDER-
 *   INVESTED but proportionally NEUTRAL; opens-first interrupted leaves it
 *   FULLY-INVESTED but IMBALANCED (band breaks, concentration breaks). Sides
 *   INTERLEAVED to prevent shorts-first-exhausting-BP from leaving the broker
 *   book net-short for a tick (invariant break inside the batch).
 *
 * NOOPs are filtered out (no submission). Clause (k) operates on the post-
 * clause-(j) selected set produced by E1 (`rebalance-planner.ts`).
 */

import type { ExecutionDelta, DeltaIntent } from './rebalance-planner.ts';

const CLASS_ORDER: ReadonlyArray<Exclude<DeltaIntent, 'noop'>> = [
  'close',
  'decrease',
  'open',
  'increase',
] as const;

/**
 * Sort comparator for within-class ordering — |delta_notional| DESCENDING,
 * ties broken by symbol ASC. Pure; deterministic.
 */
function byAbsNotionalDescThenSymbolAsc(a: ExecutionDelta, b: ExecutionDelta): number {
  const aAbs = Math.abs(a.delta_notional);
  const bAbs = Math.abs(b.delta_notional);
  if (aAbs !== bAbs) return bAbs - aAbs;
  if (a.symbol < b.symbol) return -1;
  if (a.symbol > b.symbol) return 1;
  return 0;
}

/**
 * Interleave two side-buckets by alternating long, short, long, short, …
 * Each bucket is assumed already sorted by `byAbsNotionalDescThenSymbolAsc`.
 * When one bucket exhausts, the remainder of the other appends unchanged.
 *
 * This is the clause-(k).2 net-side-neutrality-during-batch protection: it
 * prevents shorts-first-exhausting-BP (or any side-mono prefix) from leaving
 * the broker book net-imbalanced mid-batch.
 */
function interleaveSides(longs: readonly ExecutionDelta[], shorts: readonly ExecutionDelta[]): ExecutionDelta[] {
  const out: ExecutionDelta[] = [];
  const n = Math.max(longs.length, shorts.length);
  for (let i = 0; i < n; i++) {
    if (i < longs.length) out.push(longs[i]);
    if (i < shorts.length) out.push(shorts[i]);
  }
  return out;
}

/**
 * Apply the DEC-068 clause (k).1 cross-symbol submission ordering.
 *
 * Returns the input deltas re-ordered for submission. `noop` deltas are
 * filtered out (no submission). Pure; deterministic; no I/O.
 */
export function orderDeltas(deltas: readonly ExecutionDelta[]): ExecutionDelta[] {
  const out: ExecutionDelta[] = [];

  for (const cls of CLASS_ORDER) {
    const inClass = deltas.filter((d) => d.intent === cls);
    const longs = inClass.filter((d) => d.side === 'long').slice().sort(byAbsNotionalDescThenSymbolAsc);
    const shorts = inClass.filter((d) => d.side === 'short').slice().sort(byAbsNotionalDescThenSymbolAsc);
    out.push(...interleaveSides(longs, shorts));
  }

  return out;
}

/** Exposed for tests + the function-index reference entry. */
export const ORDERING_CLASS_ORDER = CLASS_ORDER;