/**
 * longshort-clock — Injected-clock infrastructure for reconciliation engine.
 *
 * Owner: longshort (sub-step 6.2; future DW-054 platform-tier extraction trigger)
 * Classification: time-source abstraction
 *
 * Per DEC-034 clause (4) + DEC-035 clause (2) + CROSSWIND §11.9 ban on wall-clock leakage
 * in financial-logic paths: time is a parameter, never derived from the running process.
 * Replay framework determinism (per DEC-035) requires this — captured-day replay must
 * produce identical outputs across runs, which is impossible if `Date.now()` is called
 * inside business logic.
 *
 * This module is the SOLE sanctioned location where wall-clock time is read in the
 * reconciliation engine path. Per DEC-034 clause (4) acceptable exception:
 * "documented at src/features/longshort/utils/clock.ts-style injected-clock infrastructure"
 * — this file fulfills that role for the Deno edge-function side.
 *
 * Banned everywhere else in `src/features/longshort/services/**`,
 * `src/features/longshort/api/**`, `supabase/functions/longshort-*`:
 *   - `Date.now()`
 *   - `new Date()` (no-arg constructor; arg constructor with explicit ts is fine)
 *   - `performance.now()`
 *   - `Temporal.Now.*`
 *
 * Override mechanism per DEC-034 clause (4) asymmetric-change discipline:
 *   `// allow-now-in-business-logic: <ADR-ID>` permits specific instances with ADR.
 *
 * Usage:
 *   - Production paths: callers pass injected `ts: Date` from the polling-loop entry
 *     point (sub-steps 6.3a-d edge functions) or pg_cron-scheduled invocation entry.
 *   - Replay paths: callers pass `ts` from the captured-day fixture stream (sub-step 6.5).
 *   - This module's `getWallClockTs()` is the ONLY function that calls the underlying
 *     runtime time source. All other reconciliation-path code accepts `ts: Date` as a
 *     parameter and propagates downstream.
 */

export interface ClockReader {
  /** Returns the current wall-clock timestamp. Only called at top-of-call-chain entry points. */
  getWallClockTs(): Date;
}

/**
 * Production clock — reads `new Date()` (the SOLE sanctioned wall-clock read in the
 * reconciliation engine path). Use only at top-of-call-chain entry points; propagate
 * the resulting `ts: Date` as a parameter through all downstream functions.
 *
 * allow-now-in-business-logic: this is the injected-clock infrastructure exception per
 * DEC-034 clause (4); this file IS the documented exception location.
 */
export const productionClock: ClockReader = {
  getWallClockTs(): Date {
    // allow-now-in-business-logic: DEC-034 clause (4) injected-clock infrastructure exception
    return new Date();
  },
};

/**
 * Fixed-ts clock — for testing and replay framework. Returns a pre-set timestamp.
 *
 * Usage:
 *   const clock = createFixedClock(new Date('2026-05-22T14:30:00Z'));
 *   // All downstream calls receive deterministic ts.
 */
export function createFixedClock(ts: Date): ClockReader {
  const snapshot = ts.getTime();
  return {
    getWallClockTs(): Date {
      return new Date(snapshot); // defensive copy
    },
  };
}
