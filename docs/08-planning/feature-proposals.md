

### FP-037: Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | FP-037 (next-free verified by grep at HEAD — 0 prior references). |
| **Status** | approved (operator-directed forward 2026-06-08 — Tier C; frontend-only, presentational, read-only, Monday-safe). |
| **Problem** | The top/bottom cutoff on the Rankings page is hardcoded to TOP_N = 20 / BOTTOM_N = 20. The operator cannot preview what top-30 or top-50 looks like before 9 signals compete for screen space. |
| **Resolution** | Replace constants with a single `topN` state (default 20), driven by a compact `<Select>` (options 20 / 30 / 50). Long and short cutoffs move together symmetrically (bottomN = topN). All existing usages (slice, `SignalDistributionBand` props, table titles, `startingRank`) read the state value. |
| **Scope** | EDIT: `src/pages/trading/longshort/signals/RankingsTab.tsx` (constants → state + selector; all usages read state). EDIT: `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (this entry), `docs/06-tracking/action-tracker.md` ACT-149, `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Out of Scope** | Any data/query change (server-paginated full list unchanged; only top/bottom CUTOFF changes). Any other tab. Any new dependency. Any edge function, migration, cron, sql/14, signal-math, FP-018 Bucket C surface touch. ACT-130 (still reserved for FP-018 Bucket C). |
| **Reference Impact** | component-inventory.md: RankingsTab description + FP-037 note. route-index.md: signals hub description + related tests update. feature-proposals.md: this entry. action-tracker.md: ACT-149. No new permissions, events, configs, env-vars, migrations, routes, edge functions, or shared helpers. No new npm dependency. |
| **Decision ID** | None — frontend, presentational, within existing UI-design-system discipline. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit (HEAD pending). Rankings page shows a 20/30/50 selector (default 20) controlling the top/bottom cutoff; titles and distribution-band accents update dynamically; full Gate-4 green. Zero data/query change. Zero Monday/edge/migration touch.

Authority: ACT-149.

### FP-039: Cron-Auth Outage Remediation (atomic env-rotate + redeploy + command-reconcile across 6 consumers)

| Field | Value |
|---|---|
| **ID** | FP-039 (FP-038 reserved for signal-registry spec — NOT consumed here; highest live prior FP at HEAD is FP-037). |
| **Status** | Applied + verified (operator-run out-of-band, 2026-06-08). Bucket-C-unblocking. Supersedes FP-019 as a standalone fix (FP-019 was partial — see FP-019 Addendum below). |
| **Problem** | Every cron consumer (jobids 34/35/36/37/48/51) returned 401 Unauthorized on every fire; `cron.job_run_details.status='succeeded'` concealed the failure. Root cause: three concurrent defects — divergent secret values across cron commands (5 jobs on `ee867b97…`, jobid:48 on `076426…`), deployed `CRON_SECRET` env var matching neither, and INC-63 redeploy-required constraint (env binds at deploy). FP-019's partial corrective aligned 5 command-sides but missed jobid:48 and skipped the env+redeploy step — net effect was 0% cron auth success until FP-039. See INC-69 for full surface story. |
| **Resolution (operator-run, applied + verified 2026-06-08)** | One atomic remediation: (1) generated a new canonical `CRON_SECRET` value; (2) updated the Supabase Edge Function secret `CRON_SECRET` to that value; (3) redeployed all 6 consumers so they bind the new env at runtime (`longshort-momentum-compute`, `longshort-universe-quarterly-refresh`, `job-health-check`, `job-alert-evaluation`, `job-metrics-aggregate`, `job-audit-cleanup`); (4) reconciled all 6 cron commands via `cron.schedule(...)` idempotent upserts so every `X-Cron-Secret` header carries the canonical value. Per §22.5.3 plaintext-secret out-of-band path: no MIG allocated. |
| **End-to-end evidence (DEC-043 standard)** | (a) Platform jobs 34/35 returned **200 `{"state":"succeeded","success":true}`** on schedule 2026-06-08 10:02–11:58 UTC (first 200s in the retention window). (b) Momentum jobid:51 test-fired and produced **two cron-attributable `signal_compute_log` rows** — `completed_at` 2026-06-08 11:52:00 and 11:54:00 UTC, `as_of_date` 2026-06-08, `outcome=completed`, `persisted_count=834` (real wall-clock; not the midnight-manual signature). (c) Byte-match attestation for jobid:51: exactly 1 `cron.job` row, `schedule = '0 20 * * 1-5'` byte-identical to `job_registry.schedule`, `active=true`, command carries resolved project ref + real secret (no placeholder literals). |
| **Scope (atomic, all-or-nothing across 6 consumers)** | Env-var rotate + Edge Function redeploy ×6 + `cron.schedule()` reconcile ×6 in one operator session. Treating this as 6 separate fixes would have left a partial-success state similar to FP-019. |
| **Out of Scope** | Warmup jobs 29-33 (405s — pre-existing, separate INC when addressed). CRON_SECRET rotation to a chat-clean value (deferred to DW-091, which is updated-not-closed — see DW-091 addendum). HEAD c443000 reconciliation (unrelated). Any code/migration/schema/RLS change. |
| **Reference Impact** | `docs/06-tracking/incidental-findings.md` (INC-69); `docs/08-planning/approved-decisions.md` (DEC-043); `docs/00-governance/definition-of-done.md` (new DoD checklist item referencing DEC-043); `docs/06-tracking/action-tracker.md` (ACT-150 + ACT-130); `docs/08-planning/deferred-work-register.md` (DW-091 addendum row); `sql/14_longshort_signal_cron_schedule.sql` (header-comment correction — canonical live-verified pattern is now jobid:51, NOT jobid:48). No new permissions, events, configs, env-vars, migrations, routes, edge functions, shared helpers, or npm deps. No MIG (operator-run plaintext-secret out-of-band per §22.5.3). |
| **Decision ID** | DEC-043 (the new scheduled-job-attestation rule motivated by INC-69 — verbatim codification of "enabled ≠ scheduled ≠ authenticated; attestation requires end-to-end 200 + real artifact row"). |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Applied + verified out-of-band by operator 2026-06-08. The 6-consumer cron-auth path is restored end-to-end; first cron-attributable 200s + artifact rows in the project's retention history landed at 10:02–11:58 + 11:52/11:54 UTC. FP-018 Bucket C now closeable per ACT-130 on stronger evidence than originally planned. Forward-binding: DEC-043 is the binding attestation standard going forward; DW-091 remains open with a hard tripwire to close before Phase 8 (small live capital).

Authority: ACT-150 (FP-039/INC-69 governance authoring) + ACT-130 (FP-018 Bucket C closure).

---

### FP-019 Addendum (Rule 8 — Forward-Pointer, Original Preserved)

| Field | Value |
|---|---|
| **Addendum Date** | 2026-06-08 |
| **Authority** | INC-69 + FP-039 + DEC-043. |
| **Reframe** | FP-019 is reframed **partial / ineffective as a standalone fix**. (a) FP-019 aligned 5 cron command-sides (jobids 34/35/36/37/51) to send `ee867b97…`, but did NOT touch jobid:48 (`longshort-universe-quarterly-refresh`), which continued to send `076426…`. (b) FP-019 did NOT complete the env-var + Edge Function redeploy step (INC-63 redeploy-required constraint), so the deployed function instances continued to read whatever stale `CRON_SECRET` value they had bound at their last deploy. Net effect: 0% cron auth success until the FP-039 unified remediation. |
| **Original preserved** | The original FP-019 entry, its closure attestation, and its INC-64 cross-reference remain VERBATIM per Constitution Rule 8. This addendum is a forward-pointer ONLY — no silent edit of the original. |
| **Forward-pointer** | See INC-69 (full surface story) + FP-039 (the unified corrective that succeeded) + DEC-043 (the attestation rule motivated by this failure mode). |

---

### FP-009 Addendum (Rule 8 — Forward-Pointer, Original Preserved)

| Field | Value |
|---|---|
| **Addendum Date** | 2026-06-08 |
| **Authority** | INC-69 + FP-039 + DEC-043. |
| **Reframe** | FP-009's prior "live and working" attestation for the `longshort-universe-quarterly-refresh` cron path (jobid:48) applies to **MANUAL triggers only**. Live-DB scan of `net._http_response` across the retention window returned **zero 200s** for jobid:48; every `universe_refresh_log` row in the retention window is a MANUAL signature, **never cron-attributable**. The cron auth path for jobid:48 had never worked end-to-end prior to FP-039. |
| **Status post-FP-039** | jobid:48's cron auth is now FIXED by FP-039's unified canonical secret + redeploy. A cron-attributable `universe_refresh_log` row still requires a quarter-start fire (per `0 0 1 1,4,7,10 *` cadence) to confirm end-to-end — this is a follow-up evidence item, NOT yet closed. Flag for the next quarterly boundary verification. |
| **Original preserved** | The original FP-009 attestation remains VERBATIM per Constitution Rule 8; this addendum forward-points only. |
| **Forward-pointer** | INC-69 + FP-039 + DEC-043. |

---

### FP-018 Bucket B Addendum (Rule 8 — Forward-Pointer, Original Preserved)

| Field | Value |
|---|---|
| **Addendum Date** | 2026-06-08 |
| **Authority** | INC-69 + FP-039 + ACT-130. |
| **Reframe** | FP-018 Bucket B's momentum cron-fire attestation was **premature**. At Bucket B closure, only manual-midnight `signal_compute_log` rows existed for `longshort.momentum.compute`; no cron-attributable row had ever landed (jobid:51 was returning 401 on every fire per INC-69). The byte-match attestation (`cron.job` row present, `active=true`, schedule byte-identical) was correct as far as it went, but DEC-043 now classifies it as **necessary-but-insufficient** for "cron-attributable fire verified". |
| **Status post-FP-039 / ACT-130** | Bucket C closure (ACT-130) lands the end-to-end evidence (cron-attributable `signal_compute_log` rows at 2026-06-08 11:52/11:54 UTC, real wall-clock, persisted 834) that Bucket B's attestation pre-emptively claimed. The corrected attestation chain is: Bucket B = `cron.job` row + byte-match (scheduling/config evidence per DEC-040); Bucket C = end-to-end 200 + real artifact row (authentication/execution evidence per DEC-043). |
| **Original preserved** | The original Bucket B closure text remains VERBATIM per Constitution Rule 8; this addendum forward-points only. |
| **Forward-pointer** | INC-69 + FP-039 + DEC-043 + ACT-130 (Bucket C closure). |

---

### FP-018 Bucket C — CLOSED (ACT-130, 2026-06-08)

| Field | Value |
|---|---|
| **Closure Date** | 2026-06-08 |
| **Closure Authority** | ACT-130 (reserved ID now consumed). |
| **Evidence (DEC-043 end-to-end standard)** | (a) **Cron-attributable `signal_compute_log` rows for jobid:51** — `completed_at` 2026-06-08 11:52:00 UTC and 11:54:00 UTC, `as_of_date` 2026-06-08, `outcome=completed`, `persisted_count=834`. These are real wall-clock timestamps (NOT the midnight-manual signature of every prior row). (b) **Byte-match attestation for jobid:51** — exactly 1 `cron.job` row; `schedule = '0 20 * * 1-5'` byte-identical to `job_registry.schedule` for `longshort.momentum.compute` (`enabled=true`); `active=true`; command carries resolved project ref + real secret (no placeholder literals). (c) **Authentication evidence** — `net._http_response` for jobid:51 returned 200 post-FP-039 (first 200 in the retention window). |
| **Comparison to originally-planned closure** | Originally planned: passive observation at 2026-06-08 20:00 UTC of a single cron-attributable `signal_compute_log` row. **Actually delivered: stronger evidence** — two cron-attributable rows from a controlled test-fire, plus the unified cross-consumer 200s confirming the auth path is restored across all 6 cron consumers (not just jobid:51). The test-fire path also surfaced INC-69, which a passive 20:00 observation would NOT have caught (the concealing `cron.job_run_details.status='succeeded'` metric would have read green against a still-broken auth path). |
| **FP-009 phase-gate re-check** | Per the original Bucket C definition, the FP-009 phase-gate re-check is OWED — the `master-plan.md` phase-gate checkbox that was reverted at INC-62 surfacing time is eligible for re-tick on this evidence. Phase-gate update is a separate action (per ACT-012 phase-gate protocol) and is left to the next phase-boundary sweep. |
| **Forward-pointer** | INC-69 (the outage discovered during this closure's test-fire); FP-039 (the corrective that enabled this closure); DEC-043 (the new attestation standard this closure satisfies). |

Authority: ACT-130.

### FP-037: Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | FP-037 (next-free verified by grep at HEAD — 0 prior references). |
| **Status** | approved (operator-directed forward 2026-06-08 — Tier C; frontend-only, presentational, read-only, Monday-safe). |
| **Problem** | The top/bottom cutoff on the Rankings page is hardcoded to TOP_N = 20 / BOTTOM_N = 20. The operator cannot preview what top-30 or top-50 looks like before 9 signals compete for screen space. |
| **Resolution** | Replace constants with a single `topN` state (default 20), driven by a compact `<Select>` (options 20 / 30 / 50). Long and short cutoffs move together symmetrically (bottomN = topN). All existing usages (slice, `SignalDistributionBand` props, table titles, `startingRank`) read the state value. |
| **Scope** | EDIT: `src/pages/trading/longshort/signals/RankingsTab.tsx` (constants → state + selector; all usages read state). EDIT: `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (this entry), `docs/06-tracking/action-tracker.md` ACT-149, `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Out of Scope** | Any data/query change (server-paginated full list unchanged; only top/bottom CUTOFF changes). Any other tab. Any new dependency. Any edge function, migration, cron, sql/14, signal-math, FP-018 Bucket C surface touch. ACT-130 (still reserved for FP-018 Bucket C). |
| **Reference Impact** | component-inventory.md: RankingsTab description + FP-037 note. route-index.md: signals hub description + related tests update. feature-proposals.md: this entry. action-tracker.md: ACT-149. No new permissions, events, configs, env-vars, migrations, routes, edge functions, or shared helpers. No new npm dependency. |
| **Decision ID** | None — frontend, presentational, within existing UI-design-system discipline. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit (HEAD pending). Rankings page shows a 20/30/50 selector (default 20) controlling the top/bottom cutoff; titles and distribution-band accents update dynamically; full Gate-4 green. Zero data/query change. Zero Monday/edge/migration touch.

Authority: ACT-149.
