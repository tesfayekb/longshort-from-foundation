/**
 * longshort-signal-monitor — daily signal pipeline health observer.
 * FP-010 Bucket A Commit A3.
 *
 * Reads `signal_compute_log` on a daily cron, evaluates the three A1
 * predicates (`checkSignalComputeFailed` / `checkSignalComputeLowWaterMark`
 * / `checkSignalComputeStale`), and emits:
 *
 *   1. ONE `alert_history` aggregate row per alert_type per detection
 *      window (aggregate `metric_value`; see Locked Decision (d) at the
 *      FP-010 entry — cooldown_seconds=300 is dispositive for the
 *      aggregate-row semantic — per-signal rows would defeat cooldown).
 *
 *   2. ONE `longshort.signal_monitor.alert` audit event per detected
 *      signal_id (carrying the full A1 `SignalMonitorAlertPayload` plus
 *      `alert_history_id` for single-hop cross-reference from the
 *      operator-glance surface to the forensic detail).
 *
 * Lifecycle audits (`.started` / `.completed` / `.failed`) bracket every
 * invocation regardless of alert emission, so the monitor's own liveness
 * is observable from `longshort_audit_logs` even when no alerts fire.
 *
 * Storage table: `longshort_audit_logs` (T4 strategy-scoped) via
 * `writeStrategyAuditEvent`. Platform `_shared/audit.ts` `logAuditEvent`
 * is FORBIDDEN for strategy code per DEC-033 v4.1 clause 4 + T4 trap.
 *
 * Schedule: `0 21 * * 1-5` (21:00 UTC Mon-Fri; 1h after momentum's
 * 20:00 UTC fire window). Disarmed at job_registry level until MIG-070
 * enable-flip per FP-010 disarm-fire-enable cycle (Bucket B/C scope).
 *
 * Auth: cron-secret only (`verifyCronSecret`). No operator-trigger
 * sibling at v1 — monitor is purely scheduled.
 *
 * Wall-clock discipline (DEC-034 clause 4): `asOf` derives from the
 * sanctioned `productionClock.getWallClockTs()` chokepoint at
 * `_shared/longshort-clock.ts`. NO `new Date()` (no-arg) in this file.
 * `new Date(asOf.getTime() - ...)` (arg ctor with explicit ts) is the
 * idiomatic boundary-derivation pattern and is permitted.
 *
 * Weekday-aware staleness per FP-010 Locked Decision (Point 4):
 *   Monday    (UTC day 1) → STALE_HOURS_MONDAY  = 72  (Fri→Mon gap)
 *   Tue-Fri   (UTC days 2-5) → STALE_HOURS_WEEKDAY = 36  (1.5× daily)
 * The monitor's own cron is `1-5` (Mon-Fri) so Sat/Sun are never reached
 * here. Tuesday-after-Monday-market-holiday false-positives are an
 * accepted deferral (see runbook + INC-61).
 *
 * Owner: longshort (FP-010 Bucket A Commit A3)
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  checkSignalComputeFailed,
  checkSignalComputeLowWaterMark,
  checkSignalComputeStale,
  type SignalComputeLogRow,
} from '../_shared/longshort-signals/shared/check-signal-compute-failures.ts';
import type {
  SignalMonitorAlertPayload,
} from '../_shared/longshort-signals/shared/signal-monitor-types.ts';
import { JOB_ID_TO_SIGNAL_ID } from '../_shared/longshort-signals/shared/job-signal-mapping.ts';

// ─── MIG-068 deterministic alert_config IDs ────────────────────────────────
// Hardcoded UUIDs (NOT name-lookup) per MIG-068 design intent + FP-010
// Locked Decision (a). Drift sentinel: A3 source-sentinel test cross-checks
// these strings against the MIG-068 migration file verbatim. If MIG-068's
// IDs ever change, this file MUST update in the same PR and the test
// guards the join.
const ALERT_CONFIG_ID_FAILED         = 'f0100068-0001-4000-8000-000000000001';
const ALERT_CONFIG_ID_LOW_WATER_MARK = 'f0100068-0002-4000-8000-000000000002';
const ALERT_CONFIG_ID_STALE          = 'f0100068-0003-4000-8000-000000000003';

// ─── Weekday-aware staleness thresholds (FP-010 Locked Decision Point 4) ──
// Named constants (NOT magic numbers) so the future option-(c)
// trading-calendar-aware refactor is a one-line swap-point.
const STALE_HOURS_WEEKDAY = 36;   // Tue-Fri: 1.5× daily cadence (A1 default)
const STALE_HOURS_MONDAY  = 72;   // Friday-fire + ~60h weekend + 12h Mon-morning

// ─── Scan window for failed/low-water-mark predicates ──────────────────────
const FAILED_WINDOW_HOURS         = 24;
const LOW_WATER_MARK_WINDOW_HOURS = 24;
const LOW_WATER_MARK_THRESHOLD    = 0.80;  // matches MIG-068 alert_configs row

// ─── Outer scan span: covers Monday-72h stale window with headroom ─────────
// The 96h envelope comfortably covers both the 72h Monday stale window AND
// any failed/low-water rows in last 24h. A1 predicates filter per-window
// internally; over-fetching is cheap (signal_compute_log writes ~1 row/day
// per signal — even at FP-017 with 7 signals × 96h = 28 rows worst case).
const OUTER_SCAN_HOURS = 96;

// ─── Audit action constants (registered in event-index.md) ─────────────────
const AUDIT_ACTION_STARTED   = 'longshort.signal_monitor.started';
const AUDIT_ACTION_COMPLETED = 'longshort.signal_monitor.completed';
const AUDIT_ACTION_FAILED    = 'longshort.signal_monitor.failed';
const AUDIT_ACTION_ALERT     = 'longshort.signal_monitor.alert';

// ─── Alert-type metric_key strings (match MIG-068 + A1 payload types) ─────
const ALERT_TYPE_FAILED         = 'signal_compute_failed';
const ALERT_TYPE_LOW_WATER_MARK = 'signal_compute_low_water_mark';
const ALERT_TYPE_STALE          = 'signal_compute_stale';

interface AggregateAlertArgs {
  configId: string;
  metricKey: string;
  severity: 'info' | 'warning' | 'critical';
  metricValue: number;
  thresholdValue: number;
  payloads: ReadonlyArray<SignalMonitorAlertPayload>;
  correlationId: string;
}

interface AlertsEmittedSummary {
  alert_type: string;
  signal_count: number;
  alert_history_id: string;
}

Deno.serve(createHandler(async (req: Request): Promise<Response> => {
  // Cron-only auth path. verifyCronSecret returns Response | null
  // (null = valid). Mirror FP-009 C1 verbatim.
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const asOf = productionClock.getWallClockTs();
  const correlationId = crypto.randomUUID();

  // Lifecycle audit — emit BEFORE any DB read so a downstream throw still
  // leaves a "we got this far" forensic crumb.
  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: AUDIT_ACTION_STARTED,
    correlationId,
    metadata: { as_of: asOf.toISOString(), trigger: 'cron' },
  });

  try {
    // ── Step 1 — discover the set of signals that SHOULD be firing ───────
    // Derive from job_registry (enabled scheduled longshort compute jobs)
    // per FP-010 Locked Decision Point 3. Deriving from observed
    // signal_compute_log evidence would miss the never-fired case.
    const { data: jobRows, error: jobErr } = await supabaseAdmin
      .from('job_registry')
      .select('id')
      .eq('enabled', true)
      .eq('trigger_type', 'scheduled')
      .like('id', 'longshort.%.compute');
    if (jobErr) throw new Error(`job_registry read failed: ${jobErr.message}`);

    const expectedSignalIds: string[] = [];
    const unmappedJobIds: string[] = [];
    for (const row of jobRows ?? []) {
      const sid = JOB_ID_TO_SIGNAL_ID[row.id];
      if (sid === undefined) {
        // Job exists + is enabled but isn't in the mapping. This is the
        // failure mode where Phase 2.X+ ships a compute job but forgets
        // to extend JOB_ID_TO_SIGNAL_ID — surface in the completion audit
        // metadata rather than silently dropping (would otherwise be the
        // exact bug class the monitor exists to catch).
        unmappedJobIds.push(row.id);
        continue;
      }
      expectedSignalIds.push(sid);
    }

    // ── Step 2 — read signal_compute_log over the outer scan window ──────
    const scanFromIso = new Date(asOf.getTime() - OUTER_SCAN_HOURS * 3600 * 1000).toISOString();
    const { data: logRows, error: logErr } = await supabaseAdmin
      .from('signal_compute_log')
      .select('run_id, signal_id, as_of_date, outcome, universe_size, persisted_count, skip_counts, failure_reason, started_at, completed_at, operator_id')
      .gte('completed_at', scanFromIso)
      .order('completed_at', { ascending: false });
    if (logErr) throw new Error(`signal_compute_log read failed: ${logErr.message}`);

    const rows = (logRows ?? []) as SignalComputeLogRow[];

    // ── Step 3 — weekday-aware staleness threshold ───────────────────────
    const dayOfWeekUtc = asOf.getUTCDay();  // 0=Sun, 1=Mon, ..., 6=Sat
    const staleHours = dayOfWeekUtc === 1 ? STALE_HOURS_MONDAY : STALE_HOURS_WEEKDAY;

    // ── Step 4 — evaluate the three A1 predicates ────────────────────────
    const failedPayloads = checkSignalComputeFailed(rows, asOf, FAILED_WINDOW_HOURS);
    const lowWaterPayloads = checkSignalComputeLowWaterMark(
      rows,
      asOf,
      LOW_WATER_MARK_WINDOW_HOURS,
      LOW_WATER_MARK_THRESHOLD,
    );
    const stalePayloads = checkSignalComputeStale(rows, asOf, staleHours, expectedSignalIds);

    // ── Step 5 — emit aggregate alert_history rows + per-signal audits ──
    const alertsEmitted: AlertsEmittedSummary[] = [];

    if (failedPayloads.length > 0) {
      const alertHistoryId = await emitAggregateAlert({
        configId: ALERT_CONFIG_ID_FAILED,
        metricKey: ALERT_TYPE_FAILED,
        severity: 'critical',
        metricValue: failedPayloads.length,  // count of failed rows in window
        thresholdValue: 0,                    // > 0 triggers (matches MIG-068)
        payloads: failedPayloads,
        correlationId,
      });
      alertsEmitted.push({
        alert_type: ALERT_TYPE_FAILED,
        signal_count: failedPayloads.length,
        alert_history_id: alertHistoryId,
      });
    }

    if (lowWaterPayloads.length > 0) {
      // Aggregate metric = MINIMUM populated_pct across triggered signals
      // (the worst offender). Per-signal populated_pct values flow through
      // audit-event metadata for forensic detail.
      let minPopulatedPct = 1.0;
      for (const p of lowWaterPayloads) {
        if (p.populated_pct !== null && p.populated_pct < minPopulatedPct) {
          minPopulatedPct = p.populated_pct;
        }
      }
      const alertHistoryId = await emitAggregateAlert({
        configId: ALERT_CONFIG_ID_LOW_WATER_MARK,
        metricKey: ALERT_TYPE_LOW_WATER_MARK,
        severity: 'warning',
        metricValue: minPopulatedPct,           // 0.0-1.0; below 0.80 triggers
        thresholdValue: LOW_WATER_MARK_THRESHOLD,
        payloads: lowWaterPayloads,
        correlationId,
      });
      alertsEmitted.push({
        alert_type: ALERT_TYPE_LOW_WATER_MARK,
        signal_count: lowWaterPayloads.length,
        alert_history_id: alertHistoryId,
      });
    }

    if (stalePayloads.length > 0) {
      // Stale metric_value = the APPLIED staleHours threshold (option A
      // per FP-010 Locked Decision Point 4). A1's predicate emits stale
      // payloads with run_id/as_of_date/completed_at all null (no row to
      // inspect on the absence-of-evidence branch; the "stale-existing-
      // row" branch is also nulled for shape consistency). Per-signal
      // staleness ages live in audit-event metadata.signal_id (one event
      // per stale signal) — operators investigating use audit detail, not
      // alert_history.metric_value, for triage. See INC-61 for the
      // future-enhancement path if AdminHealthPage operators report the
      // aggregate insufficient.
      const alertHistoryId = await emitAggregateAlert({
        configId: ALERT_CONFIG_ID_STALE,
        metricKey: ALERT_TYPE_STALE,
        severity: 'critical',
        metricValue: staleHours,                  // applied threshold (36 or 72)
        thresholdValue: staleHours,               // same — degenerate by design
        payloads: stalePayloads,
        correlationId,
      });
      alertsEmitted.push({
        alert_type: ALERT_TYPE_STALE,
        signal_count: stalePayloads.length,
        alert_history_id: alertHistoryId,
      });
    }

    // ── Step 6 — completion audit (always emits; alerts_emitted=[] is ok)
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: AUDIT_ACTION_COMPLETED,
      correlationId,
      metadata: {
        as_of: asOf.toISOString(),
        trigger: 'cron',
        signals_monitored: expectedSignalIds.length,
        unmapped_job_ids: unmappedJobIds,
        signal_compute_log_rows_scanned: rows.length,
        day_of_week_utc: dayOfWeekUtc,
        stale_hours_applied: staleHours,
        alerts_emitted: alertsEmitted,
      },
    });

    return apiSuccess({
      status: 'ok',
      correlation_id: correlationId,
      as_of: asOf.toISOString(),
      signals_monitored: expectedSignalIds.length,
      unmapped_job_ids: unmappedJobIds,
      rows_scanned: rows.length,
      day_of_week_utc: dayOfWeekUtc,
      stale_hours_applied: staleHours,
      alerts_emitted: alertsEmitted,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: AUDIT_ACTION_FAILED,
      correlationId,
      metadata: {
        as_of: asOf.toISOString(),
        trigger: 'cron',
        error: errorMessage,
        stage: 'signal_monitor_throw',
      },
    });
    return apiError(500, 'signal_monitor_failed', { correlationId });
  }
}));

/**
 * Helper — insert one `alert_history` aggregate row + emit N
 * `longshort.signal_monitor.alert` audit events (one per signal in
 * `payloads`). Returns the inserted `alert_history.id` so the caller can
 * surface it in the lifecycle audit metadata.
 *
 * INSERT shape per A2 schema verification (8 columns; no `payload jsonb`,
 * no `triggered_at`): explicit columns are `alert_config_id`, `metric_key`,
 * `severity`, `metric_value`, `threshold_value`. `id` defaults to
 * `gen_random_uuid()`; `created_at` defaults to `now()`; `resolved_at`
 * stays NULL until operator acknowledges via AdminHealthPage.
 */
async function emitAggregateAlert(args: AggregateAlertArgs): Promise<string> {
  const { data: ahRow, error: ahErr } = await supabaseAdmin
    .from('alert_history')
    .insert({
      alert_config_id: args.configId,
      metric_key: args.metricKey,
      severity: args.severity,
      metric_value: args.metricValue,
      threshold_value: args.thresholdValue,
    })
    .select('id')
    .single();

  if (ahErr || !ahRow) {
    throw new Error(`alert_history insert failed: ${ahErr?.message ?? 'no row returned'}`);
  }

  for (const payload of args.payloads) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: AUDIT_ACTION_ALERT,
      correlationId: args.correlationId,
      metadata: {
        alert_history_id: ahRow.id,
        alert_type: payload.alert_type,
        severity: payload.severity,
        signal_id: payload.signal_id,
        run_id: payload.run_id,
        as_of_date: payload.as_of_date,
        populated_pct: payload.populated_pct,
        universe_size: payload.universe_size,
        persisted_count: payload.persisted_count,
        failure_reason: payload.failure_reason,
        detected_at: payload.detected_at,
        monitor_source: payload.monitor_source,
      },
    });
  }

  return ahRow.id;
}