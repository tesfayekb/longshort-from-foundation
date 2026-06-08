

### FP-041: Signal #5 — Short Interest Changes (30-day)

| Field | Value |
|---|---|
| **ID** | FP-041 (next-free after FP-040; FP-038 consumed by signal-registry overview). |
| **Status** | implemented (compute + new entitlement-aware fetcher + orchestrator + cron/manual handlers + MIG-076 disarmed `job_registry` seed + signal_registry planned→live flip + Gate-4 tests). Cron wiring + enable-flip pending separate operator-run DEC-043 attestation. |
| **Problem** | Phase 2.3 deliverable: Signal #5 (short-interest changes, 30-day) per CROSSWIND §4.4.3 is the **third of nine** signals and the **first non-price** signal in the stack — it needs a NEW Polygon endpoint, a new TWICE-MONTHLY cadence, and the **first NON-CRITICAL** signal semantics (graceful degradation when data is missing). Without it the combiner sees only price-derived signals (momentum + reversal); adding it introduces the first orthogonal-data signal and exercises the missingness handling path the other 7 non-critical signals will inherit. |
| **Resolution** | Mirror the proven Signal #6 / #7 architecture with the three §4.4.3-driven divergences: (a) NEW pure compute `computeShortInterestChange` returning `-1 × (SI_pct_float[T] - SI_pct_float[T-2_reports])` with `SHORT_INTEREST_MIN_REPORTS=3` (the `-1 ×` negation is LOAD-BEARING — without it this becomes a follow-the-shorts duplicate; the sign-flip pair test pins it). (b) NEW entitlement-aware fetcher `PolygonShortInterestFetcher` — HTTP 403 → typed `subscription_gated`, HTTP 404 → typed `data_unavailable` (NEITHER throws, NEITHER fabricates a zero); 401 / 5xx after retries / parse / timeout throw `SignalComputationError`. (c) `createShortInterestOrchestrator` factory mirroring the reversal orchestrator's 5-step pipeline with `ShortInterestOrchestratorContext` extending `SignalOrchestratorContext` to swap `priceHistory` for `shortInterest`; NON-CRITICAL semantics — `subscription_gated`/`data_unavailable` → typed skip (ticker still ranked); reuses every other shared helper (`pLimitedMap`, `zScoreNormalizeWithinSector`, `captureSignalObservations`, `persistSignalComputeLog`). (d) Cron handler `longshort-short-interest-compute` (verifyCronSecret + productionClock + POLYGON_API_KEY + orchestrator + 3 audit events). (e) Manual sibling `longshort-short-interest-compute-manual` (POST + JWT + `longshort.manage` + dual audit envelope). (f) MIG-076 disarmed `job_registry` seed with TWICE-MONTHLY schedule `'0 21 1,15 * *'` + `signal_registry` planned→live flip (first exercise of the FP-038 template). (g) Extended `SignalSkipReason` enum + `aggregateSkipCounts` with `data_unavailable` + `subscription_gated` (sentinel-stable JSON in `signal_compute_log.skip_counts`). (h) Extended `JOB_ID_TO_SIGNAL_ID` with `'longshort.short_interest.compute' → 'short_interest_change_30d'` so the signal monitor picks up #5 automatically. signal_id locked: `'short_interest_change_30d'`. |
| **Scope** | NEW `_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts` (+ `_test.ts`). NEW `_shared/longshort-signals/short-interest-change/compute-short-interest.ts` (+ `_test.ts`). NEW `_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts` (+ `_test.ts`). NEW `supabase/functions/longshort-short-interest-compute/{index.ts,index_test.ts}`. NEW `supabase/functions/longshort-short-interest-compute-manual/{index.ts,index_test.ts}`. NEW migration MIG-076 (`job_registry` INSERT disarmed + `signal_registry` UPDATE planned→live). EDIT `_shared/longshort-signals/shared/signal-types.ts` (+ 2 enum members). EDIT `_shared/persist-signal-compute-log.ts` (+ 2 seeded skip_counts keys). EDIT `_shared/longshort-signals/shared/job-signal-mapping.ts` + `_test.ts` (+ 1 entry + 1 cross-ref drift sentinel). Docs same-PR: this entry; ACT-153; `database-migration-ledger.md` MIG-076; `function-index.md` (5 new entries + JOB_ID_TO_SIGNAL_ID extension-point/drift-sentinel update); `event-index.md` (6 new audit events); `docs/04-modules/longshort/signals/short-interest-change.md` (new component doc). |
| **Out of Scope** | FINRA/EDGAR backup fetcher (documented in fetcher header as future hardening; out of FP-041 scope). §3.3e SI > 25% short-book exclusion (lives in existing §3.3 logic). Cron wiring / enable-flip / cron-attributable attestation (separate operator step per DEC-040 + DEC-043). Combiner-stage missingness imputation (Phase 3). Touching momentum / reversal / combiner / universe / Rankings page. New RBAC permission (reuses `longshort.manage` + `longshort.view`). |
| **Reference Impact** | database-migration-ledger.md: MIG-076. function-index.md: 5 new entries (compute, fetcher, orchestrator, cron handler, manual handler) + extension-point update for JOB_ID_TO_SIGNAL_ID. event-index.md: 6 new audit events (`longshort.short_interest.compute.{started,completed,failed,manual_triggered,manual_completed,manual_failed}`). docs/04-modules/longshort/signals/short-interest-change.md: new component doc. No new env-vars (POLYGON_API_KEY already registered); no new configs; no new npm dependencies; no new permissions; no new routes. |
| **Decision ID** | None — twice-monthly cadence is documented in-FP (mirrors universe-quarterly precedent); entitlement-fallback convention (subscription_gated / data_unavailable typed-missing) extends the existing typed-absence discipline; new SignalSkipReason members are additive. No contested decision. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit. Signal #5 is the third of nine live (in the registry sense — code/migration shipped, cron disarmed). 3 live + 6 planned + 1 planned composite. Validation path: operator POST `longshort-short-interest-compute-manual` with `{ "as_of": "YYYY-MM-DD" }` → either (a) real z-scored short-interest-change observations persist (Stocks Advanced includes short interest), or (b) graceful all-missing degraded outcome with `subscription_gated` count > 0 in `signal_compute_log.skip_counts` — proving the degradation path and flagging that the FINRA backup is needed. Both outcomes are informative; either confirms architecture correctness. Cron wiring per DEC-043 is a separate operator step.

Authority: ACT-153.


### FP-040: Signal #7 — Short-Term Reversal (1-week)

### FP-038: Signal Registry + "All Signals" Overview

| Field | Value |
|---|---|
| **ID** | FP-038 (the reserved-but-not-yet-consumed signal-registry slot called out by FP-039/FP-040 headers; consumed here per operator approval). |
| **Status** | implemented (MIG-075 + `useSignalRegistry` + `AllSignalsTab` + tab wiring + Gate-4 tests + live-DB §22.5.1 evidence). |
| **Problem** | The Signals hub had per-page surfaces (Rankings, Compute Runs, Coverage) but no single multi-signal overview. Operator-side question "how many of the 9 are live? what's planned next? is anything stale?" required cross-referencing the spec + job_registry + signal_compute_log by hand. No single page told the truth across all signals + the combiner composite. |
| **Resolution** | (1) New index table `public.signal_registry` (MIG-075) with 10 rows: 2 live (`cross_sectional_momentum_12_1` #6, `short_term_reversal_1w` #7) + 7 planned (#1–#5, #8, #9 — `planned_phase` mapped to §4.4 spec ordering Phase 2.3–2.9) + 1 planned composite (Phase 3). §4.4 field values (`display_name`, `spec_ref`, `cadence`, `criticality`) are seeded verbatim from CROSSWIND §4.4.1–§4.4.9. RLS is permission-scoped (`longshort.view`) + 3 RESTRICTIVE deny-writes (per DEC-042 precedent — writes are migration/governance-only). Status is STATIC-seeded — each future signal's FP flips its own row planned → live (no auto-detection in v1). (2) New read-only hook `useSignalRegistry` fetches the registry ordered by `display_order` then joins last-fire + `distinctDates` from `signal_compute_log` for the (bounded) live set; exports `deriveStaleness` (mirrors `longshort-signal-monitor` weekday=36h / Monday=72h thresholds) and `DRIFT_MIN_HISTORY = 30`. (3) New `AllSignalsTab` page: one row per signal + composite, columns `# / signal / spec / cadence / status / last-fire (UTC) / coverage / staleness / drift`. Live rows link to the Rankings tab (the per-signal DETAIL page); planned rows show "—" + a planned-phase badge; composite row shows "Arrives with the combiner (Phase 3)." Drift is a COLUMN with honest states ("Insufficient history" until N ≥ 30 distinct `as_of_date`s), NOT a separate page. (4) `SignalsHubPage` adds the All-Signals tab as the new DEFAULT (the multi-signal index naturally precedes per-signal detail). |
| **Scope** | NEW migration MIG-075 (`signal_registry` + RLS + 10-row seed). NEW `src/features/longshort/hooks/useSignalRegistry.ts`. NEW `src/pages/trading/longshort/signals/AllSignalsTab.tsx`. NEW `src/pages/trading/longshort/signals/__tests__/AllSignalsTab.test.tsx` (5 tests). EDIT `src/pages/trading/longshort/SignalsHubPage.tsx` (register tab + default). Docs same-PR: this entry; ACT-152; `database-migration-ledger.md` MIG-075; `permission-index.md` `longshort.view` "Used by" (+ `signal_registry`); `route-index.md` `/trading/longshort/signals` (page + related tests + functions + implementation + added-by); `component-inventory.md` (new "All-Signals Overview" section). |
| **Out of Scope** | Any change to `RankingsTab` / `ComputeRunsTab` / `CoverageTab` / `SignalDistributionBand`. Any change to compute / orchestrators / crons / `job_registry`. Any new RBAC permission. Any new edge function. Any drift-monitoring page (drift is a column, not a page — explicitly rejected). Any per-signal page (Rankings is signal-generic; registry is the index — explicitly rejected). Any combiner page (composite is one `planned` row until the combiner exists — explicitly rejected). Auto-status-detection (YAGNI; each signal's FP flips its own row). |
| **Reference Impact** | database-migration-ledger.md: MIG-075. permission-index.md: `longshort.view` "Used by" extended with `public.signal_registry`. route-index.md: `/trading/longshort/signals` Page/Related tests/Related functions/Implementation/Added by updated for the All-Signals tab. component-inventory.md: new "Trading / Long-Short Signals — All-Signals Overview (FP-038)" section listing `AllSignalsTab` + `useSignalRegistry` hook module. No new env-vars, configs, npm dependencies, edge functions, audit events, or permissions. |
| **Decision ID** | None — status taxonomy (`live` / `planned` / `deprecated`) is enforced by a DB `CHECK`; permission-scoped RLS rides on DEC-042 precedent; no new contested decision. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit (HEAD pending). The All-Signals overview is live and is the default Signals-hub tab. Today: 2 of 9 signals live (#6 momentum, #7 reversal) + 7 planned + 1 planned composite. As each future signal lands, its FP flips its registry row `planned → live` in the same migration that arms its compute job, and it appears here + in Rankings automatically. Drift cells will transition from "Insufficient history" to "Available" once a signal accumulates ≥ 30 distinct `as_of_date`s in `signal_compute_log`.

Authority: ACT-152.


| Field | Value |
|---|---|
| **ID** | FP-040 (next-free after FP-039 at HEAD; FP-038 reserved for signal-registry spec — NOT consumed; FP-011..FP-017 burned/reserved per established numbering). |
| **Status** | implemented (code + tests + MIG-074 disarmed seed); cron-wiring + enable-flip pending separate operator-run DEC-043 attestation. |
| **Problem** | Phase 2.2 deliverable: Signal #7 (short-term reversal, 1-week) per CROSSWIND §4.4.2 is the second of nine signals and the first one that deliberately disagrees with momentum (it FADES recent moves; momentum CHASES). Implementing it now provides a momentum/reversal pair in Rankings before the Phase 3 combiner. |
| **Resolution** | Mirror the proven Signal #6 architecture: (a) pure compute `computeReversal` returning `-1 × ((P[T-1]/P[T-6]) - 1)` (the `-1 ×` negation is load-bearing — without it this signal becomes a short-window momentum duplicate); (b) `createReversalOrchestrator` factory matching `createMomentumOrchestrator`'s 5-step pipeline and re-using the shared infra (`pLimitedMap`, `zScoreNormalizeWithinSector`, `PolygonPriceHistoryFetcher`, `captureSignalObservations`, `persistSignalComputeLog`); (c) cron handler `longshort-reversal-compute` (verifyCronSecret + productionClock + POLYGON_API_KEY + orchestrator + 3 audit events); (d) manual sibling `longshort-reversal-compute-manual` (POST + JWT + `longshort.manage` + dual audit envelope); (e) MIG-074 disarmed `job_registry` seed (`enabled=false`). signal_id locked: `'short_term_reversal_1w'`. Bar requirement REVERSAL_MIN_BARS=7; price-history lookback PRICE_HISTORY_LOOKBACK_DAYS=20 calendar days (~14 trading bars, 2× the floor). `job-signal-mapping` extended with `'longshort.reversal.compute' → 'short_term_reversal_1w'` so the existing signal monitor picks the new signal up automatically. |
| **Scope** | NEW: `supabase/functions/_shared/longshort-signals/short-term-reversal/{compute-reversal.ts, compute-reversal_test.ts, reversal-orchestrator.ts, reversal-orchestrator_test.ts}`. NEW: `supabase/functions/longshort-reversal-compute/{index.ts, index_test.ts}`. NEW: `supabase/functions/longshort-reversal-compute-manual/{index.ts, index_test.ts}`. NEW migration MIG-074 (single `INSERT … ON CONFLICT DO NOTHING` into `public.job_registry` — `enabled=false`). EDIT: `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts` (+1 entry) and its `_test.ts` (cross-reference test for reversal SIGNAL_ID + update single-entry guard to two-entry guard). Docs same-PR: this entry, ACT-151, function-index.md (4 new entries + monitor extension-point note), event-index.md (6 new reversal events), database-migration-ledger.md (MIG-074 entry), NEW `docs/04-modules/longshort/signals/short-term-reversal.md`. |
| **Out of Scope** | Cron wiring + enable-flip + cron-attributable attestation (separate operator-run step per DEC-040 + DEC-043). Any change to Signal #6 (momentum), the combiner, the universe, RBAC, audit primitives, façade, trading-navigation, App.tsx routing, or any UI surface. Any fork of shared signal infra. ACT-130 (still reserved for FP-018 Bucket C, already consumed). |
| **Reference Impact** | function-index.md: 4 new entries (compute, orchestrator, cron handler, manual handler) + `job-signal-mapping` extension-point note. event-index.md: 6 new events (`longshort.reversal.compute.{started,completed,failed,manual_triggered,manual_completed,manual_failed}`). database-migration-ledger.md: MIG-074. `docs/04-modules/longshort/signals/short-term-reversal.md` created. No new permissions, configs, env-vars, routes, npm dependencies. No new shared helper (extends an existing one). |
| **Decision ID** | None — the sign-flip negation is documented in-code (compute header) + this FP entry; no DEC needed because §4.4.2 is verbatim spec. |
| **Reviewed By** | Operator |
| **Review Date** | 2026-06-08 |

**Closure** — Landed at execution commit (HEAD pending). Compute math, orchestrator, cron + manual handlers, disarmed registry row (MIG-074), and 6 new audit events ship together; cron path remains explicitly UNATTESTED until the separate operator-run wire-and-attest step produces a 200 + cron-attributable `signal_compute_log` row per DEC-043. The manual handler is the immediate verification path.

Authority: ACT-151.

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
