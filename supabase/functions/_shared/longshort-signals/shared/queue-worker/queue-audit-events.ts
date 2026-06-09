/**
 * Audit-event vocabulary for the generalized cursor-drain queue-worker
 * engine (FP-045 / DEC-047). One constant per event so consumers can
 * import-and-reference rather than string-literal, and so the persist-log
 * exact-match test family (FP-041 lesson) can grep these symbols.
 *
 * Naming convention: `longshort.signal_queue.<sub>.<verb>` — matches the
 * existing `longshort.<domain>.<sub>.<verb>` family (universe.refresh,
 * momentum.compute, signal_monitor). Verified against
 * docs/07-reference/event-index.md as a pre-flight gate per the FP-045
 * Phase 2 addendum §4.
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

export const QUEUE_AUDIT_EVENTS = {
  RUN_STARTED:     'longshort.signal_queue.run.started',
  RUN_COMPLETED:   'longshort.signal_queue.run.completed',
  RUN_FAILED:      'longshort.signal_queue.run.failed',
  SLICE_COMPLETED: 'longshort.signal_queue.slice.completed',
  SLICE_FAILED:    'longshort.signal_queue.slice.failed',
} as const;

export type QueueAuditEvent =
  (typeof QUEUE_AUDIT_EVENTS)[keyof typeof QUEUE_AUDIT_EVENTS];