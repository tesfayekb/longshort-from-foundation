# Signal Cron-Wiring Runbook

> **Owner:** longshort module | **Last Reviewed:** 2026-06-07 (FP-018 Bucket A) | **Authority:** DEC-040

## Purpose

Canonical, reusable runbook for wiring a longshort signal's compute job to `pg_cron`. Established by FP-018 in response to the Phase 2.1 over-claim where `job_registry.enabled=true` was treated as sufficient evidence for "scheduled execution wired" — it is not. A `job_registry` row is a **registry flag**; a `cron.job` row is a **scheduler entry**. This codebase has no registry-driven dispatcher: every scheduled handler requires its own explicit `cron.schedule(...)` entry.

This runbook MUST be executed in full for every new signal in the FP-011..FP-017 series (and any other longshort cron-driven handler) before its phase closure can attest to "daily auto-fire verified."

## When this runbook applies

- A new longshort signal compute handler is being shipped (FP-011..FP-017 / Phases 2.2-2.9).
- An existing signal's schedule is being changed.
- The disarm-fire-enable cycle is at the **enable** step and the operator needs the cron entry to exist before the job_registry flip.

It does NOT apply to:
- Manually-triggered operator handlers (e.g. `*-manual` siblings) — they have no cron entry by design.
- Disarmed handlers (`job_registry.enabled=false`) — wiring cron for a disarmed handler violates disarm-fire-enable (the cron would fire against a flag the handler logic skips, defeating the observational gate). Cron wiring lands in the **same commit** as the enable-flip, not before.

## Canonical pattern source

`sql/09_longshort_universe_cron_schedule.sql` is the authoritative template. It is the ONE longshort cron-wiring file verified live (jobid:48 active, fires daily, no DNS-fail). All new signal cron-wiring files MUST mirror its structure. Do NOT copy from `sql/05_secure_cron_schedule.sql` — its `PROJECT_REF` placeholder was never replaced at apply time, producing the four DNS-failing platform jobs catalogued under INC-64.

## The 5 mandatory steps

### Step 1 — Resolved project ref (never placeholder)

The `net.http_post(url := ...)` URL MUST resolve to the live Supabase project host. The file in `sql/` carries the literal `PROJECT_REF` placeholder; the operator replaces it at Supabase SQL Editor apply time with the actual project ref (e.g. `sftatlxatbdrotivxcip`). The applied form in production cron.job.command MUST read `https://sftatlxatbdrotivxcip.supabase.co/functions/v1/<handler-name>` — never `https://PROJECT_REF.supabase.co/...`.

**Audit query (run post-apply):**
```sql
SELECT jobid, jobname, command FROM cron.job
WHERE command LIKE '%PROJECT_REF%';
-- Expected: 0 rows. Any row is a wiring defect — file an INC and re-apply.
```

### Step 2 — Dual-header authentication

Every longshort cron handler validates `X-Cron-Secret` via `_shared/cron-auth.ts::verifyCronSecret`. The cron entry MUST therefore carry BOTH headers:

- `Authorization: Bearer <anon_key>` — satisfies the Supabase gateway (the function still deploys with `verify_jwt = false` per signing-keys model, but the gateway expects the header on edge-function invocations).
- `X-Cron-Secret: <CRON_SECRET value>` — satisfies the handler's `verifyCronSecret` check. Single chokepoint: same secret value used by `jobid:48` (the canonical entry); never invent a new secret per handler.

Header shape (placeholders replaced at apply time):
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_ANON_KEY",
  "X-Cron-Secret": "YOUR_CRON_SECRET_VALUE"
}
```

### Step 3 — Schedule selection matches `job_registry.schedule`

The `cron.schedule(jobname, schedule, ...)` `schedule` arg MUST be byte-identical to the `job_registry.schedule` column value the corresponding MIG seeded. Drift between the two is a §22.5 DRIFT-class defect: the registry advertises one cadence to operator-facing tooling (AdminJobsPage, monitoring) while the scheduler fires on a different cadence.

**Pre-apply verification:**
```sql
SELECT id, schedule, enabled
FROM job_registry
WHERE id = '<longshort.signal-name.compute>';
-- The `schedule` value here MUST match the second arg of cron.schedule(...) verbatim.
```

No-overlap discipline: longshort signal computes fire at 20:00 UTC weekdays (momentum baseline). Sibling signals stagger by ≥30min where independent OR share the 20:00 slot only when they share zero downstream contention. The signal-monitor cron (FP-010 MIG-070) is locked to 21:00 UTC — the 1h-after-momentum gap is binding governance.

### Step 4 — Post-apply `cron.job` verification (load-bearing — DEC-040)

**This step replaces the Phase 2.1 over-claim discipline.** A closure doc may NOT attest to "daily auto-fire verified" without this query's evidence pasted into the closure record verbatim.

```sql
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname = '<longshort-signal-name-compute>';
-- Expected: exactly 1 row.
-- active MUST be true.
-- schedule MUST equal the job_registry.schedule value verbatim.
-- command MUST contain the resolved project ref (no PROJECT_REF literal).
-- command MUST contain the X-Cron-Secret header literal.
```

Then wait one full cadence cycle (one weekday 20:00 UTC fire for daily signals) and verify a FRESH row landed in the signal's telemetry table via cron:

```sql
SELECT run_id, signal_id, as_of_date, completed_at, outcome, persisted_count
FROM signal_compute_log
WHERE signal_id = '<signal_id_literal>'
ORDER BY completed_at DESC
LIMIT 1;
-- completed_at MUST be wall-clock-adjacent to the most recent scheduled fire time
-- (within ~handler-duration of the 20:00 UTC slot), NOT an as_of-derived
-- midnight timestamp (which is the signature of a manual-trigger fire).
```

Cron-fire vs manual-fire distinguishability: `signal_compute_log.completed_at` is set by the handler at end of orchestrator run via `productionClock.getWallClockTs()`. A cron fire produces a completed_at within a few minutes of the cron tick; a manual fire produces a completed_at within a few minutes of the operator's curl. The wall-clock proximity to the cron schedule is the operational discriminator.

### Step 5 — Ledger + sql-index entry

The new `sql/NN_longshort_<scope>_cron_schedule.sql` file is an **artifact**, not a migration (lives in `sql/` not `supabase/migrations/` per MIG-031 precedent because it carries operator-replaced secrets that must never be committed). Even so it requires governance recording:

1. Add a row to `docs/07-reference/artifact-index.md` under "SQL artifacts (operator-applied)" with the file path, the FP that authored it, the operator-apply date, and the post-apply `cron.job` verification output verbatim.
2. Add a paragraph to `docs/07-reference/database-migration-ledger.md` under a clearly-labelled "Operator-applied cron schedules (non-migration)" subsection — NOT inline with the MIG-NNN sequence — pointing at the artifact-index entry. This keeps the MIG-NNN monotonic sequence pure (migrations only) while still surfacing cron entries to anyone reading the ledger.
3. The closure doc for the owning FP/Phase MUST cite the post-apply `cron.job` query output verbatim as exit-gate evidence (DEC-040 enforcement).

## Anti-patterns (forbidden)

- **Wiring cron for a disarmed handler.** `job_registry.enabled=false` plus a live `cron.job` row means the scheduler fires against a flag-skipped handler — no-op behaviour with no observational signal. Wait for the enable-flip; land cron in the same commit as the flip.
- **Using `sql/05_secure_cron_schedule.sql` as a template.** Its `PROJECT_REF` placeholder was never replaced (INC-64); the four platform jobs it scheduled DNS-fail on every tick. Use `sql/09` exclusively.
- **Inlining the CRON_SECRET literal in any committed file.** The `sql/` placeholder discipline is non-negotiable. The secret appears in `cron.job.command` post-apply (a `pg_cron` design constraint — INC-63) but never in the repo.
- **Attesting to "auto-fire verified" from `job_registry.enabled=true` alone.** Per DEC-040: scheduled-execution attestations require `cron.job` evidence, not registry-flag evidence. This is the Phase 2.1 over-claim that FP-018 corrects at the class level.
- **Adding a new `cron.schedule` entry without a `cron.job` audit query against `PROJECT_REF` literal after apply.** Step 1's audit query is the only mechanical defence against repeating the INC-64 four-jobs class of bug.

## Operator apply procedure (out-of-band)

The `sql/NN_*_cron_schedule.sql` file ships with `PROJECT_REF` / `YOUR_ANON_KEY` / `YOUR_CRON_SECRET_VALUE` placeholders. Apply procedure:

1. Open Supabase SQL Editor at the project (`https://supabase.com/dashboard/project/<ref>/sql/new`).
2. Paste the file contents.
3. Replace the three placeholders with the values from Edge Function secrets (anon key from project settings, CRON_SECRET from `jobid:48`'s existing command for byte-identical match).
4. Execute. `cron.schedule` is upsert-on-(jobname, username); re-apply is idempotent.
5. Run Step 4's `cron.job` verification query. Paste output verbatim into the FP closure record.
6. Wait one cadence cycle. Run the `signal_compute_log` freshness query. Paste output into the closure record.
7. ONLY after Step 6 returns a cron-attributable fresh row may the closure doc attest to "daily auto-fire verified."

## Cross-references

- DEC-040 — scheduled-execution attestations require `cron.job` evidence (the governance amendment this runbook operationalises).
- `sql/09_longshort_universe_cron_schedule.sql` — canonical template.
- `sql/14_longshort_signal_cron_schedule.sql` — first signal cron-wiring file authored against this runbook (FP-018 Bucket B; momentum).
- INC-62 — momentum cron-wiring gap (the instance defect this runbook prevents recurrence of).
- INC-63 — plaintext `X-Cron-Secret` in live `cron.job.command` (pg_cron design constraint; hardening backlog).
- INC-64 — four platform jobs (jobid 34-37) DNS-failing since April due to unreplaced `PROJECT_REF` literal (separate platform-scope corrective FP).
- `docs/00-governance/definition-of-done.md` — DoD checklist item enforcing post-apply `cron.job` verification.
- `docs/04-modules/longshort/signals/runbooks/momentum-price-history-failure-runbook.md` — sibling operational runbook (failure response, not wiring).
- `docs/04-modules/longshort/signals/runbooks/signal-monitor-alerts-runbook.md` — sibling operational runbook (monitor alert response).