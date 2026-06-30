/**
 * resolve-manual-as-of — pure helper shared by the two operator-triggered
 * manual combiner handlers (`longshort-combiner-rank-manual` and
 * `longshort-combiner-assemble-manual`).
 *
 * Problem this resolves (DW-203-ADD-03 / ACT-427 → ACT-428):
 *
 *   The ranker (`ranker-orchestrator.ts:162`) is path-polymorphic — it
 *   stamps `combiner_rankings.computed_at = as_of.toISOString()` from
 *   whatever Date the caller passes. The §11.0.7 rebalance freshness gate
 *   (`rebalance-submit-orchestrator.ts:215-237`, default `tolerance_s=600`)
 *   compares wall-clock-now against `computed_at`.
 *
 *   The cron rank (`longshort-combiner-rank/index.ts:119`) and intraday
 *   tick (`longshort-combiner-tick/index.ts:180`) already pass
 *   `productionClock.getWallClockTs()` — wall-clock-fresh, passes the gate.
 *
 *   The manual handlers historically passed `parseAsOfDate('YYYY-MM-DD')`
 *   — UTC-midnight of the supplied date — so a freshly-built manual book
 *   for TODAY stamped midnight and failed the 600s gate.
 *
 * Fix A (preserves prior-day replay determinism — Fix B's "always stamp
 * wall-clock" would remove the operator's historical-replay capability):
 *
 *   - If `replay === true` → return the parsed midnight Date unchanged.
 *     This is the T8 replay-determinism path (DEC-034 (4)): two replays of
 *     the same `as_of` must produce byte-identical `computed_at`, which is
 *     only possible if `computed_at` reads from `as_of` not wall-clock.
 *   - Else if the parsed `as_of` UTC date-part is a PRIOR day → return
 *     midnight unchanged (replay semantics by construction; an operator
 *     re-running yesterday's book has the same determinism requirement).
 *   - Else (parsed `as_of` UTC date-part EQUALS today's UTC date-part and
 *     `replay !== true`) → return `now` (wall-clock-now). This matches the
 *     cron/tick freshness semantics — `computed_at` stamps wall-clock-fresh
 *     so the §11.0.7 rebalance gate does not bite. The orchestrator still
 *     derives `as_of_date = as_of_iso.slice(0,10)` = today; correct.
 *
 * Future-rejection (`as_of > now`) is intentionally NOT handled here — the
 * callers do that BEFORE calling this helper (the original ordering is
 * preserved so today=now+ε replays do not get demoted to historical-replay
 * branch by a clock skew).
 */

/**
 * Returns the Date the manual handlers should pass to their orchestrators
 * as `as_of`, given the operator-parsed midnight Date and the wall-clock
 * `now` from `productionClock.getWallClockTs()`.
 */
export function resolveManualAsOf(
  parsedAsOfMidnight: Date,
  now: Date,
  replay: boolean,
): Date {
  if (replay) {
    return parsedAsOfMidnight;
  }
  const parsedDatePart = parsedAsOfMidnight.toISOString().slice(0, 10);
  const nowDatePart = now.toISOString().slice(0, 10);
  if (parsedDatePart === nowDatePart) {
    // Same UTC calendar day, no explicit replay flag → stamp wall-clock to
    // match cron/tick semantics so the §11.0.7 freshness gate passes.
    return now;
  }
  // Prior day (with or without explicit replay) → midnight, preserves T8 /
  // DEC-034 (4) determinism for historical re-runs.
  return parsedAsOfMidnight;
}

/**
 * Narrow a parsed JSON body for the optional `replay: boolean` flag.
 * Returns `false` for any non-true value (missing, null, non-boolean) —
 * the default is the wall-clock-for-today branch, which matches the
 * operator's overwhelmingly-common case of running for the current date.
 */
export function readReplayFlag(body: unknown): boolean {
  if (body === null || typeof body !== 'object') return false;
  const raw = (body as Record<string, unknown>).replay;
  return raw === true;
}