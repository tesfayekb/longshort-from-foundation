

### ACT-149: FP-037 — Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | ACT-149 (ACT-130 explicitly NOT consumed — still reserved for FP-018 Bucket C; ACT-148 used by FP-036). |
| **Mode** | execution. |
| **Tier** | C (frontend, presentational, read-only). |
| **Branch** | feature/FP-037-top-n-selector. |
| **HEAD before / after** | before: post-FP-036 (ACT-148) baseline / after: pending at execution commit. |
| **Authority** | FP-037 (approved 2026-06-08). |
| **Scope** | EDIT `src/pages/trading/longshort/signals/RankingsTab.tsx` — replace `TOP_N = 20 / BOTTOM_N = 20` constants with `TOP_N_OPTIONS = [20, 30, 50] as const` and a `topN` state (default 20); add compact `<Select>` in filter toolbar; update `slice`, `SignalDistributionBand` props, table titles, and `startingRank` to read `topN`. EDIT `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (FP-037), `docs/06-tracking/action-tracker.md` (this entry), `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Related Tests** | `RankingsTab.test.tsx` (+1 test): top-N selector defaults to 20; selecting 50 updates both table titles to "Top 50" / "Bottom 50". |
| **Evidence** | (a) **Pre-task verification** — confirmed `TOP_N = 20 / BOTTOM_N = 20` are used at exactly 6 sites in `RankingsTab.tsx` (lines 36-37 constants, 99 top slice, 102 bottom slice, 197-198 band props, 207 top title, 214 bottom title, 218 startingRank). Confirmed `SignalDistributionBand` already accepts numeric `topN` / `bottomN` props. Confirmed `Select` + `SelectItem` primitives are already imported in `RankingsTab.tsx` (used for signal/date/sector selectors). (b) **Gate-4 full run** — `bunx vitest run` returned `Test Files 49 passed (49) / Tests 383 passed (383)` (+1 vs FP-036 baseline 382); `bunx eslint .` returned `0 errors / 15 warnings` (all 15 pre-existing — same set as ACT-148). (c) **No `any` discipline** — `TOP_N_OPTIONS` typed `as const`; `topN` typed `number`; test uses existing typed mock fixtures. (d) **Out-of-scope guarantees by diff inspection** — zero data-query change (same `usePaginatedRankings` call, same select list, same mock shape); zero touch to edge functions, migrations, RLS, cron, `sql/14`, signal-math, FP-018 Bucket C deliverables, `jobid:51`, RBAC, audit code, façade, trading-navigation, `App.tsx` routing; zero new permissions / events / configs / env-vars / migrations / routes / dependencies. (e) **ID discipline** — ACT-130 untouched; ACT-149 next-free after ACT-148. No DEC required; no migration. (f) **Rule 6 same-PR** — component-inventory + route-index + feature-proposals + this register updated in same diff as the code. |
| **ROI Impact** | **Positive on operator UX** — lets the operator preview top-30/top-50 against live momentum data today, before 9 signals compete for screen space; applies automatically to every future signal because the Rankings page is already signal-generic. **Zero on prediction / signal / sizing / execution logic** — no money-path code touched; no signal-math change. |
| **Status** | Gate-4 verified (vitest 383/383, eslint 0 errors). |

### ACT-150: FP-039 / INC-69 — Cron-Auth Outage Governance Authoring (Documentation-Only)

| Field | Value |
|---|---|
| **ID** | ACT-150 (next-free after ACT-149; ACT-130 explicitly reserved for FP-018 Bucket C closure — see ACT-130 below). |
| **Mode** | documentation (governance authoring). |
| **Tier** | Docs-only (no code, no migration, no schema, no cron, no secret, no deploy). |
| **Branch** | main (direct commit per §22.1 docs-only). |
| **Authority** | FP-039 (approved 2026-06-08) + INC-69 + DEC-043. |
| **Scope** | NEW: INC-69 (`docs/06-tracking/incidental-findings.md`), FP-039 + FP-019/FP-009/FP-018-Bucket-B addenda (`docs/08-planning/feature-proposals.md`), DEC-043 (`docs/08-planning/approved-decisions.md`), DoD checklist line (`docs/00-governance/definition-of-done.md`), this entry + ACT-130 entry (`docs/06-tracking/action-tracker.md`), DW-091 addendum row (`docs/08-planning/deferred-work-register.md`), sql/14 header-comment correction (`sql/14_longshort_signal_cron_schedule.sql` — comment only, no SQL logic). All 9 artifacts in one PR per Constitution Rule 6 same-PR discipline. |
| **Evidence** | (a) **Operator-run remediation verified out-of-band 2026-06-08**: platform jobs 34/35 returned 200 on schedule 10:02–11:58 UTC; momentum jobid:51 test-fired and produced two cron-attributable `signal_compute_log` rows at 11:52 and 11:54 UTC (real wall-clock, persisted 834); byte-match attestation for jobid:51 confirmed (`schedule = '0 20 * * 1-5'` byte-identical to `job_registry.schedule`, `active=true`, no placeholder literals in command). (b) **ID discipline** — INC-69 (next-free after INC-68); FP-039 (FP-038 reserved for signal-registry spec, not consumed); ACT-150 (next-free after ACT-149); ACT-130 (the reserved ID, now consumed for FP-018 Bucket C closure); DEC-043 (next-free after DEC-042); DW-091 updated-not-allocated. No MIG (operator-run plaintext-secret out-of-band per §22.5.3). (c) **Rule 8** — FP-019, FP-009, FP-018 Bucket B addenda are forward-pointers; originals preserved verbatim. (d) **Rule 6 same-PR** — all 9 artifacts in one commit. |
| **Out-of-scope guarantees** | Zero code change. Zero migration. Zero schema/RLS touch. Zero cron/secret/deploy operation. Zero touch to warmup jobs 29-33 (separate INC when addressed). Zero HEAD c443000 reconciliation (separate concern). DW-091 updated-not-closed (rotation deferred; hard tripwire before Phase 8). The sql/14 header-comment edit is the only `sql/` touch and is comment-text only (zero SQL logic change). |
| **ROI Impact** | **Positive on operational reliability** — codifies the load-bearing lesson (enabled ≠ scheduled ≠ authenticated; `cron.job_run_details.status='succeeded'` is a concealing metric) as DEC-043 + a DoD checklist item, structurally preventing the next instance of this class. **Zero on prediction / signal / sizing / execution logic** — no money-path code touched. |
| **Status** | Gate-4 verified (governance-authoring only; no code path so vitest/eslint baselines unchanged from ACT-149). |

### ACT-130: FP-018 Bucket C Closure (Reserved ID Consumed)

| Field | Value |
|---|---|
| **ID** | ACT-130 (the reserved ID, now consumed for its originally-intended purpose — FP-018 Bucket C closure). |
| **Mode** | documentation (closure attestation). |
| **Tier** | Docs-only. |
| **Branch** | main (same PR as ACT-150). |
| **Authority** | FP-018 Bucket C (original definition) + INC-69 + FP-039 + DEC-043 (the new attestation standard satisfied here). |
| **Scope** | FP-018 Bucket C closure block in `docs/08-planning/feature-proposals.md` (the "### FP-018 Bucket C — CLOSED (ACT-130, 2026-06-08)" section). Closure cites the 2026-06-08 11:52/11:54 UTC cron-attributable `signal_compute_log` evidence + the byte-match attestation. |
| **Evidence (DEC-043 end-to-end standard)** | (a) Two cron-attributable `signal_compute_log` rows for jobid:51 — `completed_at` 11:52:00 + 11:54:00 UTC 2026-06-08, `as_of_date` 2026-06-08, `outcome=completed`, `persisted_count=834` (real wall-clock, distinct from the midnight-manual signature of every prior row). (b) Byte-match attestation: `schedule = '0 20 * * 1-5'` byte-identical to `job_registry.schedule`, exactly 1 `cron.job` row, `active=true`, command resolved (no `PROJECT_REF` literal, no `<YOUR_CRON_SECRET>` placeholder). (c) `net._http_response` for jobid:51 returned 200 post-FP-039. **Stronger than originally-planned passive 20:00 observation** — the controlled test-fire path that produced this evidence also surfaced INC-69, which a passive observation would have masked. |
| **FP-009 phase-gate re-check** | OWED per the original Bucket C definition — the `master-plan.md` phase-gate checkbox reverted at INC-62 surfacing time is eligible for re-tick on this evidence. Phase-gate update is a separate action per ACT-012 protocol, deferred to the next phase-boundary sweep. |
| **Out-of-scope guarantees** | Zero code change. Zero migration. Zero touch to FP-018 Bucket A/B originals (Rule 8 preserved via the Bucket B addendum). |
| **ROI Impact** | **Positive on operational confidence** — Bucket C closed on stronger evidence than originally planned. **Zero on prediction / signal / sizing / execution logic**. |
| **Status** | Closed (ACT-130, 2026-06-08). |

### ACT-149: FP-037 — Top-N Selector (20/30/50) on Rankings

| Field | Value |
|---|---|
| **ID** | ACT-149 (ACT-130 explicitly NOT consumed — still reserved for FP-018 Bucket C; ACT-148 used by FP-036). |
| **Mode** | execution. |
| **Tier** | C (frontend, presentational, read-only). |
| **Branch** | feature/FP-037-top-n-selector. |
| **HEAD before / after** | before: post-FP-036 (ACT-148) baseline / after: pending at execution commit. |
| **Authority** | FP-037 (approved 2026-06-08). |
| **Scope** | EDIT `src/pages/trading/longshort/signals/RankingsTab.tsx` — replace `TOP_N = 20 / BOTTOM_N = 20` constants with `TOP_N_OPTIONS = [20, 30, 50] as const` and a `topN` state (default 20); add compact `<Select>` in filter toolbar; update `slice`, `SignalDistributionBand` props, table titles, and `startingRank` to read `topN`. EDIT `src/pages/trading/longshort/signals/__tests__/RankingsTab.test.tsx` (+1 test — selector changes cutoff to 50, titles update). Docs same-PR: `docs/08-planning/feature-proposals.md` (FP-037), `docs/06-tracking/action-tracker.md` (this entry), `docs/07-reference/component-inventory.md` (RankingsTab description + FP-037 note), `docs/07-reference/route-index.md` (signals hub description + related tests). |
| **Related Tests** | `RankingsTab.test.tsx` (+1 test): top-N selector defaults to 20; selecting 50 updates both table titles to "Top 50" / "Bottom 50". |
| **Evidence** | (a) **Pre-task verification** — confirmed `TOP_N = 20 / BOTTOM_N = 20` are used at exactly 6 sites in `RankingsTab.tsx` (lines 36-37 constants, 99 top slice, 102 bottom slice, 197-198 band props, 207 top title, 214 bottom title, 218 startingRank). Confirmed `SignalDistributionBand` already accepts numeric `topN` / `bottomN` props. Confirmed `Select` + `SelectItem` primitives are already imported in `RankingsTab.tsx` (used for signal/date/sector selectors). (b) **Gate-4 full run** — `bunx vitest run` returned `Test Files 49 passed (49) / Tests 383 passed (383)` (+1 vs FP-036 baseline 382); `bunx eslint .` returned `0 errors / 15 warnings` (all 15 pre-existing — same set as ACT-148). (c) **No `any` discipline** — `TOP_N_OPTIONS` typed `as const`; `topN` typed `number`; test uses existing typed mock fixtures. (d) **Out-of-scope guarantees by diff inspection** — zero data-query change (same `usePaginatedRankings` call, same select list, same mock shape); zero touch to edge functions, migrations, RLS, cron, `sql/14`, signal-math, FP-018 Bucket C deliverables, `jobid:51`, RBAC, audit code, façade, trading-navigation, `App.tsx` routing; zero new permissions / events / configs / env-vars / migrations / routes / dependencies. (e) **ID discipline** — ACT-130 untouched; ACT-149 next-free after ACT-148. No DEC required; no migration. (f) **Rule 6 same-PR** — component-inventory + route-index + feature-proposals + this register updated in same diff as the code. |
| **ROI Impact** | **Positive on operator UX** — lets the operator preview top-30/top-50 against live momentum data today, before 9 signals compete for screen space; applies automatically to every future signal because the Rankings page is already signal-generic. **Zero on prediction / signal / sizing / execution logic** — no money-path code touched; no signal-math change. |
| **Status** | Gate-4 verified (vitest 383/383, eslint 0 errors). |
