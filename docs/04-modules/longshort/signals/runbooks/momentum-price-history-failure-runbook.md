# Momentum Price-History Failure Runbook

> **Component:** longshort signals / cross-sectional momentum (Phase 2.1) | **Sub-step:** FP-009 Bucket C Commit C2a | **Companion doc:** `../cross-sectional-momentum.md`

## Symptoms

An operator observes one or more of the following after a scheduled or manual momentum-compute run:

- A `signal_compute_log` row with `outcome = 'failed'` whose `failure_reason` includes `polygon`, `HTTP 4XX`, `fetch_error`, or `signal_observations persistence failed`.
- A CLEAN run (`outcome = 'completed'`) with abnormally high `skip_counts.fetch_error` — e.g., greater than 10% of `universe_size`. The orchestrator does not throw on per-ticker failure (FP-008.4 #23 pattern), so a Polygon-wide degradation surfaces as a high `fetch_error` skip-rate rather than a `failed` row.
- `signal_observations` row count for the current `as_of_date` materially below the expected ~90–99% populated rate (consistent with INC-50 sector-source-wiring + INC-53 first-run shape).
- HTTP 500 from `longshort-momentum-compute-manual` with code `momentum_compute_failed` or `signal_compute_log_persist_failed`.

## Detection

Query `signal_compute_log` directly (canonical operator-scoped surface):

```sql
SELECT run_id, as_of_date, outcome, failure_reason,
       universe_size, persisted_count, skip_counts,
       started_at, completed_at
FROM public.signal_compute_log
WHERE signal_id = 'cross_sectional_momentum_12_1'
ORDER BY completed_at DESC
LIMIT 10;
```

For a clean-but-skip-rate-elevated run:

```sql
SELECT run_id, as_of_date, universe_size, persisted_count,
       (skip_counts->>'fetch_error')::int AS fetch_error_count,
       round(100.0 * (skip_counts->>'fetch_error')::int / NULLIF(universe_size, 0), 1) AS fetch_error_pct
FROM public.signal_compute_log
WHERE signal_id = 'cross_sectional_momentum_12_1'
  AND outcome = 'completed'
ORDER BY completed_at DESC
LIMIT 10;
```

## Diagnosis

1. **Read the full `failure_reason`** from the affected `signal_compute_log` row. The orchestrator preserves the upstream Polygon error message through the `SignalSkip.detail` chain (per INC-24 ticker-context preservation) so the failure mode is almost always identifiable from this string alone.
2. **Polygon aggregate-endpoint probe** for a known-stable ticker — same shape used during the C1 deploy verification:

   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" \
     "https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/2026-01-01/2026-01-31?apiKey=$POLYGON_API_KEY"
   ```

   Expected: `200`. Anything else is the diagnostic.

3. **Check `POLYGON_API_KEY`** in the Supabase dashboard secrets pane. A rotated-but-not-redeployed key produces a 401 cluster because the prior cold-start cached the stale value (lived twice this session — universe enrichment 401 at Bucket 0.2 + the observational-gate fire's preflight).

## Resolution Paths

- **(a) 401 Unauthorized** — Polygon key stale or rotated upstream. Rotate `POLYGON_API_KEY` in Supabase secrets, then **redeploy both** `longshort-momentum-compute` AND `longshort-momentum-compute-manual` to force cold-start secret re-read (per the Bucket 0.2 rotation drill — bare secret update does NOT propagate to running edge-function instances). Re-fire the manual trigger and confirm `outcome='completed'`.
- **(b) 403 / tier-mismatch** — Polygon account no longer entitled to `/v2/aggs/` at the configured cadence. Diagnose against the polygon.io account dashboard; not actionable from the codebase side. Escalate to the account owner.
- **(c) 5xx / timeout cluster (Polygon-side)** — wait and retry. Polygon outages are not actionable from our side; the orchestrator's per-ticker bounded-concurrency means a transient outage degrades to skips rather than a hard failure. Fire the manual trigger again after Polygon recovers and verify the skip-rate returns to baseline.
- **(d) Clean fire of manual trigger after fix** — invoke `POST /functions/v1/longshort-momentum-compute-manual` with operator JWT (`longshort.manage`) and a sensible recent `as_of` (last trading day). Confirm `signal_compute_log.outcome='completed'` AND `persisted_count / universe_size >= 0.80` (populated_pct gate; matches the C2a observational gate posture before C2b enables cron). Anything below 80% triggers a return to step 1 diagnosis.

## Verification

After resolution, confirm:

```sql
SELECT run_id, outcome, universe_size, persisted_count, skip_counts
FROM public.signal_compute_log
WHERE run_id = $1;

SELECT count(*) AS persisted_rows
FROM public.signal_observations
WHERE signal_id = 'cross_sectional_momentum_12_1'
  AND as_of_date = (SELECT as_of_date FROM public.signal_compute_log WHERE run_id = $1);
```

Expect `outcome='completed'`, `skip_counts.fetch_error` back to baseline (typically single-digit), and `persisted_rows ≈ persisted_count` from the log row.

## Escalation

If multiple consecutive runs fail OR the same `failure_reason` recurs across runs after resolution path (a)/(b)/(c): ESCALATE per CROSSWIND §11.0.11 root-cause-mandatory discipline. Persistent failure of a CRITICAL signal (§4.3.5) means the combiner will exclude affected names from ranking at Phase 3 — operationally a quiet ROI reduction. Treat persistent failure as system-bug-class until root cause is established.

Escalation contact: TBD per operator on-call rotation; placeholder pending operator population.

## Postmortem Template

Short INC entry shape for any non-trivial recurrence:

- **Failure observed at** `<run_id>` / `<as_of_date>` / `<completed_at>`.
- **Symptoms** — `failure_reason` string + `skip_counts.fetch_error` value + populated_pct.
- **Root cause** — one of: POLYGON_API_KEY stale (rotation-without-redeploy), Polygon outage (5xx cluster timeframe), Polygon tier issue (403), other.
- **Resolution applied** — which path (a)/(b)/(c)/(d); SHA of any code change; redeploy timestamp.
- **Recurrence-prevention notes** — e.g. rotation runbook updated to mandate dual-redeploy; alerting threshold added; documentation cross-link.

## Cross-references

- Companion doc: `../cross-sectional-momentum.md` — pipeline, schemas, trigger paths.
- INC-24 — ticker-context preservation through the skip-detail chain.
- INC-50 / INC-53 — sector-source-wiring + first-run shape (baseline populated_pct expectations).
- INC-55 — orchestrator parallel + per-ticker failure-attribution discipline.
- FP-009 Bucket 0.2 — Polygon secret rotation drill (universe enrichment 401 precedent).
- MIG-065 — `signal_compute_log` schema.
- `docs/07-reference/function-index.md` — `longshort-momentum-compute*` handler entries.