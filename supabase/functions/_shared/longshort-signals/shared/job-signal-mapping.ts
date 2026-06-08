/**
 * FP-010 Bucket A Commit A3 — job_id → signal_id mapping registry.
 *
 * Single-export shared constant mapping `job_registry.id` rows of shape
 * `longshort.<name>.compute` to the `signal_id` value those jobs write to
 * `signal_compute_log`. Consumed by `longshort-signal-monitor/index.ts`
 * (A3) to derive the set of "signals that SHOULD be firing" from the
 * `job_registry` `enabled=true AND trigger_type='scheduled'` set, rather
 * than from observed `signal_compute_log` evidence.
 *
 * Why this matters (FP-010 Locked Decision — Point 3, A3 prompt):
 *   Deriving the expected-signals universe from `signal_compute_log`
 *   DISTINCT signal_id values is architecturally unsound — it cannot
 *   detect a signal that has NEVER fired (the exact bug class the monitor
 *   exists to catch: cron-never-picks-up, handler-missing, enable-flip
 *   failed). Deriving from `job_registry` instead catches the never-fired
 *   case because the "should be firing" set is the declared enabled
 *   schedule, not observed evidence.
 *
 * Extension point for Phases 2.2–2.9 (FP-011..FP-017):
 *   Each new signal's execution prompt adds ONE entry to this map in the
 *   same PR that registers its compute job. The signal becomes monitored
 *   automatically — no change to `longshort-signal-monitor/index.ts` is
 *   required. This is the inheritance path declared in FP-010's
 *   "Future-Inheritance" field.
 *
 * Discipline:
 *   - `Readonly<Record<...>>` + `as const` enforce immutability at the
 *     type level; accidental runtime mutation is a TS error at every
 *     consumer site.
 *   - Keys MUST match `job_registry.id` verbatim (constraint enforced by
 *     A3 handler test cross-checking against `momentum-orchestrator.ts`
 *     `SIGNAL_ID` export).
 *   - Values MUST match the `signal_id` literal locked in each signal's
 *     orchestrator (e.g. `cross_sectional_momentum_12_1` is locked at
 *     `_shared/longshort-signals/cross-sectional-momentum/momentum-orchestrator.ts`
 *     export `SIGNAL_ID`).
 *
 * Owner: longshort (FP-010 Bucket A Commit A3)
 * Classification: shared infrastructure — Phase 2 monitoring registry.
 */

export const JOB_ID_TO_SIGNAL_ID: Readonly<Record<string, string>> = {
  'longshort.momentum.compute': 'cross_sectional_momentum_12_1',
  'longshort.reversal.compute': 'short_term_reversal_1w',
  'longshort.short_interest.compute': 'short_interest_change_30d',
} as const;

/**
 * Convenience accessor — returns `undefined` for unknown job_ids so the
 * handler can `.filter((sid): sid is string => sid !== undefined)` after
 * mapping. Kept as a function rather than inline `JOB_ID_TO_SIGNAL_ID[id]`
 * so future evolution (e.g. logging unknown ids, normalizing case) has a
 * single chokepoint.
 */
export function resolveSignalIdForJob(jobId: string): string | undefined {
  return JOB_ID_TO_SIGNAL_ID[jobId];
}