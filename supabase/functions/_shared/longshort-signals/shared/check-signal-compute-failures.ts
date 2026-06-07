/**
 * FP-010 Bucket A1 — Pure-function predicates over `signal_compute_log` rows.
 *
 * Three predicates, each returning `SignalMonitorAlertPayload[]`:
 *   1. `checkSignalComputeFailed`         — outcome='failed' rows in window
 *   2. `checkSignalComputeLowWaterMark`   — outcome='completed' rows in window
 *                                            with populated_pct < threshold
 *   3. `checkSignalComputeStale`          — per signal_id: latest row older
 *                                            than staleHours OR no row at all
 *
 * Discipline (mirrors FP-009 A1/B1 — compute-momentum.ts):
 *   - No `Date.now()`, no `new Date()` reading wall-clock — `asOf: Date` is
 *     the injected clock chokepoint per DEC-034 clause (4). Callers wire to
 *     `productionClock.getWallClockTs()` at the handler layer (A3).
 *   - No I/O. No mutation of inputs (ReadonlyArray).
 *   - Deterministic outputs (alerts sorted by signal_id then as_of_date for
 *     stable test assertions and stable downstream UPSERT keys).
 *   - Defensive div-by-zero: `universe_size === 0` → `populated_pct = null`,
 *     NEVER NaN (anti-phantom-default rule; mirrors compute-momentum.ts
 *     degenerate-denominator handling).
 *
 * Deliberate non-pure exception (single, documented):
 *   `crypto.randomUUID()` populates `alert_id`. Same idiom as
 *   `_shared/authenticate-request.ts:81` and `_shared/handler.ts:50`.
 *   Per-emit unique; orchestrator-level idempotency is enforced at A3's
 *   `alert_history` write layer (UPSERT key composes alert_type + run_id),
 *   not here.
 *
 * Window semantics (LOCKED at A1; pinned by tests):
 *   Failed / LowWaterMark: row is in-window iff
 *       completed_at > (asOf - windowHours)  AND  completed_at <= asOf
 *     i.e. strict-greater lower bound, inclusive upper bound. A row whose
 *     completed_at equals (asOf - windowHours) is OUT; +1ms is IN.
 *
 *   Stale: latest row for a signal_id is STALE iff
 *       latest_completed_at <= (asOf - staleHours)
 *     i.e. strict-greater lower bound from the opposite direction. A row
 *     exactly at (asOf - staleHours) IS stale boundary-inclusive on the
 *     OUT side of the freshness window. The 36h default absorbs the
 *     weekday-only cron cadence per FP-010 Locked Decision (c).
 *
 * Threshold semantics (LowWaterMark, LOCKED at A1):
 *   Strict `<` comparison: a row at exactly threshold (e.g. 0.80) is NOT
 *   alerted; only `populated_pct < threshold` fires.
 *
 * Owner: longshort (FP-010 Bucket A Commit A1)
 * Classification: shared infrastructure — Phase 2 monitoring predicates.
 */

import type {
  SignalMonitorAlertPayload,
} from './signal-monitor-types.ts';

/**
 * Read-only shape of one `signal_compute_log` row (MIG-065). Mirrors the
 * `INSERT` shape in `_shared/persist-signal-compute-log.ts:persistSignalComputeLog`
 * and the columns asserted in MIG-065 verbatim.
 */
export interface SignalComputeLogRow {
  run_id: string;
  signal_id: string;
  as_of_date: string;
  outcome: 'completed' | 'failed';
  universe_size: number;
  persisted_count: number;
  skip_counts: Record<string, number> | null;
  failure_reason: string | null;
  started_at: string;
  completed_at: string;
  operator_id: string;
}

/** Internal: defense-in-depth div-by-zero guard. */
function safePopulatedPct(persisted: number, universe: number): number | null {
  if (universe === 0) return null;
  return persisted / universe;
}

/** Internal: stable-sort comparator for emit-order determinism. */
function compareAlertOrder(
  a: SignalMonitorAlertPayload,
  b: SignalMonitorAlertPayload,
): number {
  if (a.signal_id !== b.signal_id) {
    return a.signal_id < b.signal_id ? -1 : 1;
  }
  const ad = a.as_of_date ?? '';
  const bd = b.as_of_date ?? '';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return 0;
}

/** Internal: parse ISO timestamp to epoch-ms; rejects malformed strings via NaN check. */
function parseTs(iso: string): number {
  return Date.parse(iso);
}

/**
 * Predicate 1 — `signal_compute_failed`.
 *
 * Filters `outcome === 'failed'` rows whose `completed_at` falls in the
 * `(asOf - windowHours, asOf]` window. Severity: 'critical'.
 */
export function checkSignalComputeFailed(
  rows: ReadonlyArray<SignalComputeLogRow>,
  asOf: Date,
  windowHours: number = 24,
): SignalMonitorAlertPayload[] {
  const asOfMs = asOf.getTime();
  const lowerMs = asOfMs - windowHours * 3600 * 1000;
  const detectedAt = asOf.toISOString();

  const out: SignalMonitorAlertPayload[] = [];
  for (const row of rows) {
    if (row.outcome !== 'failed') continue;
    const ts = parseTs(row.completed_at);
    if (Number.isNaN(ts)) continue;
    if (!(ts > lowerMs && ts <= asOfMs)) continue;
    out.push({
      alert_id: crypto.randomUUID(),
      alert_type: 'signal_compute_failed',
      severity: 'critical',
      run_id: row.run_id,
      signal_id: row.signal_id,
      as_of_date: row.as_of_date,
      failure_reason: row.failure_reason,
      persisted_count: row.persisted_count,
      universe_size: row.universe_size,
      populated_pct: safePopulatedPct(row.persisted_count, row.universe_size),
      detected_at: detectedAt,
      monitor_source: 'dedicated',
    });
  }
  return out.sort(compareAlertOrder);
}

/**
 * Predicate 2 — `signal_compute_low_water_mark`.
 *
 * Filters `outcome === 'completed'` rows in the window whose
 * `persisted_count / universe_size` is strictly below `threshold`.
 * Severity: 'warning'. Rows with `universe_size === 0` are skipped (null
 * populated_pct cannot be "below" a numeric threshold).
 */
export function checkSignalComputeLowWaterMark(
  rows: ReadonlyArray<SignalComputeLogRow>,
  asOf: Date,
  windowHours: number = 24,
  threshold: number = 0.80,
): SignalMonitorAlertPayload[] {
  const asOfMs = asOf.getTime();
  const lowerMs = asOfMs - windowHours * 3600 * 1000;
  const detectedAt = asOf.toISOString();

  const out: SignalMonitorAlertPayload[] = [];
  for (const row of rows) {
    if (row.outcome !== 'completed') continue;
    const ts = parseTs(row.completed_at);
    if (Number.isNaN(ts)) continue;
    if (!(ts > lowerMs && ts <= asOfMs)) continue;
    const pct = safePopulatedPct(row.persisted_count, row.universe_size);
    if (pct === null) continue;
    if (!(pct < threshold)) continue;
    out.push({
      alert_id: crypto.randomUUID(),
      alert_type: 'signal_compute_low_water_mark',
      severity: 'warning',
      run_id: row.run_id,
      signal_id: row.signal_id,
      as_of_date: row.as_of_date,
      failure_reason: row.failure_reason,
      persisted_count: row.persisted_count,
      universe_size: row.universe_size,
      populated_pct: pct,
      detected_at: detectedAt,
      monitor_source: 'dedicated',
    });
  }
  return out.sort(compareAlertOrder);
}

/**
 * Predicate 3 — `signal_compute_stale`.
 *
 * For each `signal_id` in `signalIds`, finds the latest row by `completed_at`
 * for that signal in `rows`. Emits a stale alert iff:
 *   - no row exists for the signal, OR
 *   - the latest `completed_at <= asOf - staleHours`
 *
 * Severity: 'critical'. Per the field-availability matrix: run_id,
 * as_of_date, failure_reason, persisted_count, universe_size,
 * populated_pct are ALL null (no row to inspect on the absence-of-evidence
 * code path; nulled even when a stale row exists for shape consistency
 * across the emit branches).
 */
export function checkSignalComputeStale(
  rows: ReadonlyArray<SignalComputeLogRow>,
  asOf: Date,
  staleHours: number = 36,
  signalIds: ReadonlyArray<string>,
): SignalMonitorAlertPayload[] {
  const asOfMs = asOf.getTime();
  const freshnessLowerMs = asOfMs - staleHours * 3600 * 1000;
  const detectedAt = asOf.toISOString();

  // Group latest completed_at per signal_id (single pass, O(n)).
  const latestBySignal = new Map<string, number>();
  for (const row of rows) {
    const ts = parseTs(row.completed_at);
    if (Number.isNaN(ts)) continue;
    const prior = latestBySignal.get(row.signal_id);
    if (prior === undefined || ts > prior) {
      latestBySignal.set(row.signal_id, ts);
    }
  }

  const out: SignalMonitorAlertPayload[] = [];
  for (const signalId of signalIds) {
    const latest = latestBySignal.get(signalId);
    const isStale = latest === undefined || latest <= freshnessLowerMs;
    if (!isStale) continue;
    out.push({
      alert_id: crypto.randomUUID(),
      alert_type: 'signal_compute_stale',
      severity: 'critical',
      run_id: null,
      signal_id: signalId,
      as_of_date: null,
      failure_reason: null,
      persisted_count: null,
      universe_size: null,
      populated_pct: null,
      detected_at: detectedAt,
      monitor_source: 'dedicated',
    });
  }
  return out.sort(compareAlertOrder);
}