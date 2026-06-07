/**
 * FP-010 Bucket A1 — Signal pipeline monitoring alert types.
 *
 * Single source of truth for the SignalMonitorAlertPayload shape consumed by:
 *   - `check-signal-compute-failures.ts` (A1: predicate emitters)
 *   - `longshort-signal-monitor/index.ts` (A3: handler that persists payloads
 *     to `alert_history` and emits `longshort.signal_monitor.alert` audits)
 *   - MIG-068 `alert_configs` seed rows (A2): one row per `SignalMonitorAlertType`
 *
 * Mirrors the discipline of `signal-types.ts` (FP-009 A1): type-only file, no
 * imports beyond what's exported, deliberate `number | null` typed-absence for
 * fields whose availability differs per alert type.
 *
 * Field-availability matrix:
 *   signal_compute_failed:           run_id, as_of_date, failure_reason,
 *                                    persisted_count, universe_size,
 *                                    populated_pct all POPULATED (failed row
 *                                    was inspected).
 *   signal_compute_low_water_mark:   same — completed row was inspected.
 *   signal_compute_stale:            run_id, as_of_date, failure_reason,
 *                                    persisted_count, universe_size,
 *                                    populated_pct all NULL — no row to
 *                                    inspect; absence-of-evidence IS the signal.
 *
 * `monitor_source` defaults to 'dedicated' for A1's emitters. The 'sweep' value
 * is reserved for a possible future sweep-extension path (FP-010 Q1 locked the
 * dedicated-only path; the union preserves the contract option without
 * forcing a breaking change later).
 *
 * Owner: longshort (FP-010 Bucket A Commit A1)
 * Classification: shared types — Phase 2 monitoring contracts.
 */

export type SignalMonitorAlertType =
  | 'signal_compute_failed'
  | 'signal_compute_low_water_mark'
  | 'signal_compute_stale';

export type SignalMonitorSeverity = 'critical' | 'warning' | 'info';

export interface SignalMonitorAlertPayload {
  /** Per-emission UUID (Deno `crypto.randomUUID()` at predicate-emit time). */
  alert_id: string;
  alert_type: SignalMonitorAlertType;
  severity: SignalMonitorSeverity;
  /** `signal_compute_log.run_id` of the inspected row; null for stale alerts. */
  run_id: string | null;
  /** Required for all alert types — identifies the signal pipeline. */
  signal_id: string;
  /** 'YYYY-MM-DD' from the inspected row; null for stale alerts. */
  as_of_date: string | null;
  /** Verbatim from the inspected row; null for completed/stale alerts. */
  failure_reason: string | null;
  /** Inspected row's persisted_count; null for stale alerts. */
  persisted_count: number | null;
  /** Inspected row's universe_size; null for stale alerts. */
  universe_size: number | null;
  /**
   * `persisted_count / universe_size` computed at emit time. null when
   *   - the alert is stale (no row to compute from), OR
   *   - universe_size is 0 (div-by-zero guard — never NaN per anti-phantom rule).
   */
  populated_pct: number | null;
  /** ISO timestamp from the `asOf` parameter passed to the predicate. */
  detected_at: string;
  /** 'dedicated' = `longshort-signal-monitor` (A3); 'sweep' reserved. */
  monitor_source: 'dedicated' | 'sweep';
}