# Signal Monitor Alerts Runbook

**Owner:** longshort
**Surfaced by:** `longshort-signal-monitor` cron handler (FP-010 Bucket A Commit A3)
**Schedule:** `0 21 * * 1-5` (21:00 UTC Mon-Fri; 1h after momentum's 20:00 UTC fire window)
**Storage:** alerts persist to `public.alert_history` (operator-glance surface); per-signal forensic detail in `public.longshort_audit_logs` (action = `longshort.signal_monitor.alert`)

## 1. Purpose

This runbook is the operator response guide for the three alert types the `longshort-signal-monitor` handler emits. Each alert type covers a distinct failure mode of the daily signal-compute pipeline:

| Alert type | Severity | What it means | Typical cause |
|---|---|---|---|
| `signal_compute_failed` | critical | At least one `signal_compute_log` row with `outcome='failed'` landed in the last 24h. The cron RAN but the pipeline broke. | Polygon outage, universe-read error, persistence error, orchestrator throw. |
| `signal_compute_low_water_mark` | warning | A completed run wrote `persisted_count / universe_size < 0.80`. The cron RAN, but data quality regressed. | Sector-wide data outage, mass-`insufficient_history` (corporate-action burst), upstream universe shrinkage. |
| `signal_compute_stale` | critical | No `signal_compute_log` row exists for a `JOB_ID_TO_SIGNAL_ID`-registered enabled scheduled signal within the staleHours threshold (36h Tue-Fri / 72h Mon). The cron did NOT fire — or the signal has never fired at all. | pg_cron not picking up the schedule, handler file missing at registered path, enable-flip migration failed, MIG never applied. |

## 2. Aggregate vs per-signal — read order

The handler emits **one** `alert_history` row per alert_type per detection window (aggregate metric), and **one** `.alert` audit event **per detected signal** (per-signal forensic detail). The audit event's `metadata.alert_history_id` joins back to the aggregate row.

**Operator read order:**

1. **Triage from `alert_history`** — see which alert_type fired, severity, and the aggregate metric_value vs threshold.
2. **Drill from `longshort_audit_logs`** for `action='longshort.signal_monitor.alert'` rows with matching `metadata.alert_history_id` — one row per signal, with the full A1 `SignalMonitorAlertPayload`.
3. **Inspect `signal_compute_log` directly** for the offending `run_id` (failed/low-water-mark alerts populate this; stale alerts do not — see §6).

## 3. `signal_compute_failed` — response

### Diagnostic queries

```sql
-- Find the alert_history row(s) for the last 24h
SELECT id, metric_key, severity, metric_value, threshold_value, created_at, resolved_at
FROM public.alert_history
WHERE metric_key = 'signal_compute_failed'
  AND created_at >= now() - interval '24 hours'
ORDER BY created_at DESC;

-- Drill to per-signal forensic detail
SELECT created_at, metadata->>'signal_id' AS signal_id,
       metadata->>'run_id'        AS run_id,
       metadata->>'failure_reason' AS failure_reason,
       metadata
FROM public.longshort_audit_logs
WHERE action = 'longshort.signal_monitor.alert'
  AND (metadata->>'alert_history_id')::uuid = '<alert_history_id>'
ORDER BY created_at;

-- Inspect the underlying signal_compute_log row
SELECT * FROM public.signal_compute_log
WHERE run_id = '<run_id_from_audit>'::uuid;
```

### Resolution paths

1. **Identify failure_reason** — read `signal_compute_log.failure_reason` for the failing `run_id`. The string carries the structured stage context (`polygon_404`, `empty_universe`, `signal_compute_log_persist_failed`, orchestrator-throw message).
2. **Triage by stage:**
   - **Polygon-related** → check `POLYGON_API_KEY` secret freshness; verify Polygon status page; check `metadata.skip_counts.fetch_error` rate on adjacent runs to discriminate transient outage vs key rotation.
   - **Empty universe** → run the universe diagnostic queries (universe-side runbook); a failing momentum compute may be a downstream symptom of an upstream universe-refresh failure.
   - **Persistence error** → check `signal_compute_log` RLS policies + service-role grant chain; verify the row was rejected at write rather than mid-orchestration.
   - **Orchestrator throw** → check for unhandled exceptions in the orchestrator's `pLimitedMap` ticker loop; rare in steady state.
3. **Re-run via manual-trigger** — `longshort-momentum-compute-manual` accepts an operator-supplied `as_of` and re-runs the compute end-to-end. A clean re-run with the same `as_of` will land a second `signal_compute_log` row with `outcome='completed'`, leaving the original `outcome='failed'` row for forensic record.
4. **Acknowledge** — once resolved, set `alert_history.resolved_at = now()` for the aggregate row (operator action; AdminHealthPage will surface the unacknowledged backlog).

## 4. `signal_compute_low_water_mark` — response

### Diagnostic queries

```sql
-- Find the aggregate row + min populated_pct
SELECT id, metric_value AS min_populated_pct, threshold_value, created_at
FROM public.alert_history
WHERE metric_key = 'signal_compute_low_water_mark'
  AND created_at >= now() - interval '24 hours'
ORDER BY created_at DESC;

-- Per-signal populated_pct from audit metadata
SELECT metadata->>'signal_id'                       AS signal_id,
       (metadata->>'populated_pct')::numeric        AS populated_pct,
       (metadata->>'universe_size')::int            AS universe_size,
       (metadata->>'persisted_count')::int          AS persisted_count
FROM public.longshort_audit_logs
WHERE action = 'longshort.signal_monitor.alert'
  AND (metadata->>'alert_history_id')::uuid = '<alert_history_id>';

-- Skip-counts breakdown (which skip reason dominated?)
SELECT signal_id, as_of_date, universe_size, persisted_count, skip_counts
FROM public.signal_compute_log
WHERE run_id = '<run_id>'::uuid;
```

### Resolution paths

1. **Inspect skip_counts** — the dominant reason discriminates root cause:
   - `fetch_error >> 0` → Polygon outage or rate-limit burst; re-run during off-peak.
   - `insufficient_history >> baseline` → corporate-action burst (heavy splits/spinoffs) or universe expansion to thinly-traded tickers; verify against universe membership delta day-over-day.
   - `missing_sector / singleton_sector` → GICS attribution drift; check `universe_membership.gics_sector` distribution.
2. **Compare to baseline** — Phase 2.1 first clean fire was 99.4% populated; the 80% threshold leaves ~19 percentage points of headroom. A 78% populated rate is borderline; a 50% populated rate signals systemic issue.
3. **Soft-failure path** — by design, low_water_mark is `warning` not `critical` (the run completed; the downstream Phase 3 combiner can still consume reduced-coverage signals if cross-sectional dispersion remains meaningful). No re-run is mandatory unless the combiner downstream surfaces secondary alerts.
4. **Acknowledge** — `alert_history.resolved_at = now()` once skip-counts are understood and disposition is recorded.

## 5. `signal_compute_stale` — response

### Diagnostic queries

```sql
-- Find the aggregate row (note: metric_value = APPLIED staleHours threshold)
SELECT id, metric_value AS applied_stale_hours, threshold_value, created_at
FROM public.alert_history
WHERE metric_key = 'signal_compute_stale'
  AND created_at >= now() - interval '24 hours'
ORDER BY created_at DESC;

-- Which signal_ids are stale? (audit metadata is the ONLY source — A1
-- stale payload has null run_id/as_of_date)
SELECT metadata->>'signal_id' AS signal_id, created_at
FROM public.longshort_audit_logs
WHERE action = 'longshort.signal_monitor.alert'
  AND (metadata->>'alert_history_id')::uuid = '<alert_history_id>';

-- Cross-check: what's the latest signal_compute_log row for that signal?
SELECT signal_id, MAX(completed_at) AS last_completed_at,
       EXTRACT(EPOCH FROM (now() - MAX(completed_at))) / 3600 AS hours_stale
FROM public.signal_compute_log
WHERE signal_id = '<signal_id_from_audit>'
GROUP BY signal_id;

-- Is the compute job still enabled?
SELECT id, enabled, trigger_type, schedule, handler_path
FROM public.job_registry
WHERE id = 'longshort.<name>.compute';
```

### Resolution paths

1. **Verify pg_cron registration** — confirm the cron schedule is actually firing:
   ```sql
   SELECT jobid, schedule, command, active FROM cron.job WHERE command LIKE '%longshort-<name>-compute%';
   SELECT * FROM cron.job_run_details WHERE jobid = <jobid> ORDER BY start_time DESC LIMIT 10;
   ```
2. **Verify handler exists at registered path** — Gate-15 sentinel should catch this at deploy, but a manual `ls supabase/functions/longshort-<name>-compute/index.ts` is the canonical check.
3. **Manual-trigger re-fire** — `longshort-<name>-compute-manual` with the missed `as_of` will write a fresh `signal_compute_log` row, clearing the staleness condition on the next monitor scan.
4. **Acknowledge** — once root cause is identified and the next clean fire lands, `alert_history.resolved_at = now()`.

## 6. Tuesday-after-Monday-market-holiday false-positive (KNOWN DEFERRAL)

**Scenario:** A US market holiday falls on a Monday (MLK Day, Presidents' Day, Memorial Day, Labor Day, etc.). The momentum compute is correctly skipped on Monday (market closed; cron's `1-5` weekday gate doesn't help because Monday IS a weekday). On Tuesday at 21:00 UTC, the monitor scans and sees no `signal_compute_log` row since the prior Friday — approximately 96h ago, exceeding the Tue-Fri `STALE_HOURS_WEEKDAY = 36` threshold.

**Result:** a `signal_compute_stale` alert fires that is operationally a **false positive** (no run was expected on Monday).

**Why deferred:** the v1 monitor does NOT consume a trading-calendar / market-holiday feed. Adding holiday awareness (FP-010 Point 4 option (c)) requires either an external calendar feed or hardcoded US-market-holiday data, both of which are real complexity and outside FP-010's narrow scope.

**Operator handling:**

- Expected rate: ≤10 days/year (US market holidays falling on Monday — typically 6-8 per year accounting for MLK Day, Presidents' Day, Memorial Day, Labor Day, Indigenous Peoples' Day/Columbus Day; July 4 and Christmas vary).
- On the Tuesday following a known Monday holiday, **acknowledge the alert immediately** by setting `alert_history.resolved_at = now()` with a brief note in operator log (no dedicated `resolved_reason` column; use AdminHealthPage acknowledgment workflow when available).
- DO NOT re-run the missed Monday compute — Monday's market was closed; there is no signal to compute.

**Cross-reference:** INC-61 (FP-010 A3 closure) tracks this as the explicit deferral; future enhancement entry point per FP-010 Locked Decision Point 4 option (c).

## 7. Monitor liveness check

The monitor itself emits `.started` / `.completed` / `.failed` lifecycle audits on every invocation regardless of alert emission. To verify the monitor is alive:

```sql
SELECT created_at, action,
       (metadata->>'signals_monitored')::int     AS signals_monitored,
       (metadata->>'stale_hours_applied')::int   AS stale_hours_applied,
       metadata->'alerts_emitted'                AS alerts_emitted
FROM public.longshort_audit_logs
WHERE action LIKE 'longshort.signal_monitor.%'
ORDER BY created_at DESC
LIMIT 20;
```

- A `.started` without a matching `.completed` or `.failed` indicates the handler crashed catastrophically (e.g. timeout) — investigate edge function logs.
- Absence of ANY `.started` events over a 36h+ window means the monitor's OWN cron is not firing — this is the meta-monitoring gap that no in-system monitor can self-detect. Mitigation: an external dead-man's-switch (uptime monitor pinging an endpoint that reads `MAX(created_at) FROM longshort_audit_logs WHERE action = 'longshort.signal_monitor.started'`) is the canonical pattern; deferred per FP-010 out-of-scope item.

## 8. Future enhancements (registered)

- **Per-signal staleness ages in alert_history.metric_value** — current v1 stores the applied `staleHours` threshold (degenerate by design). If AdminHealthPage operators report the aggregate insufficient for triage, expose `max staleness hours` from A1's predicate output (requires A1 enhancement — predicate is locked at FP-010 baseline; deferral tracked in INC-61).
- **Trading-calendar-aware staleness** — Tuesday-after-Monday-holiday false-positive elimination (FP-010 Point 4 option (c)); requires holiday-calendar dependency.
- **External dead-man's-switch** — out-of-process monitor of the monitor; out of FP-010 scope.