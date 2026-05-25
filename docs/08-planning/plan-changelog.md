# Plan Changelog

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Tracks every plan revision with full traceability across:
- Plan sections
- Approved decisions
- Supersession chains

This document is the authoritative history of all plan changes.

## Scope

All changes to:
- `master-plan.md`
- `approved-decisions.md`

## Enforcement Rule (CRITICAL)

- Every plan change MUST create a changelog entry
- No change may occur without being recorded here
- If an entry is missing or incomplete → the change is **INVALID**
- History must **NEVER** be overwritten — only appended

## Versioning Rules

- Each plan revision increments version: `vN` → `vN+1`
- Versions are immutable once recorded
- No version may be edited after creation

## Changelog Format (MANDATORY)

Each entry MUST include:

- **Plan Version** (e.g., v1 → v2)
- **Date**
- **Section IDs Changed**
- **Decision IDs Affected** (DEC-NNN)
- **What Changed**
- **Why It Changed**
- **What Stayed Unchanged**
- **What Was Added**
- **What Was Removed**
- **Approval Status**
- **Supersession Links** (if applicable)

If any field is missing → entry is **INVALID**.

## Diff Requirement

Each entry MUST align with the required plan diff:
- Sections unchanged (by ID)
- Sections modified (with reason)
- Sections added (new IDs)
- Sections removed (with justification)
- Conflicts with approved decisions (DEC-NNN)

## Entries

### v0 → v1 (2026-04-08)

**Type:** Initial creation

| Field | Value |
|-------|-------|
| Plan Version | v0 → v1 |
| Section IDs Created | PLAN-GOV-001, PLAN-AUTH-001, PLAN-RBAC-001, PLAN-USRMGMT-001, PLAN-ADMIN-001, PLAN-USRPNL-001, PLAN-AUDIT-001, PLAN-HEALTH-001, PLAN-API-001, PLAN-JOBS-001 |
| Decision IDs Affected | DEC-001, DEC-002, DEC-003, DEC-005 |
| What Changed | Initial plan created |
| Why | Project initialization |
| What Stayed | N/A |
| What Was Added | All plan sections |
| What Was Removed | None |
| Approval Status | PLAN-GOV-001: implemented; others: proposed |
| Supersession Links | None |

### v1 → v2 (2026-04-08)

**Type:** Corrective alignment — audit issue fixes

| Field | Value |
|-------|-------|
| Plan Version | v1 → v2 |
| Section IDs Changed | None |
| Decision IDs Affected | DEC-002 (superseded by DEC-006), DEC-006 (new), DEC-007 (new) |
| What Changed | DEC-002 superseded — Constitution has 11 rules, not 10. OQ-003 formally resolved with DEC-007 (audit retention 90 days). Added `normalizeRequest()` to Function Index. Added `roles.create` and `roles.delete` to Permission Index. Added provisional moderator disclaimers. Fixed permission matrix to permission-driven model. Fixed `app_role` vs `TEXT` type mismatch. |
| Why | Final audit identified 7 consistency gaps (score 98.5/100). All fixes are corrective alignment — no structural changes. |
| What Stayed | All plan sections, all other decisions, all module definitions, all existing index entries |
| What Was Added | DEC-006, DEC-007, `normalizeRequest()` function entry, `roles.create` + `roles.delete` permission entries, provisional disclaimers |
| What Was Removed | None |
| Approval Status | Approved |
| Supersession Links | DEC-002 → DEC-006 |

### v2 → v3 (2026-04-09)

**Type:** Governance transition — plan approval (Review Round 2)

| Field | Value |
|-------|-------|
| Plan Version | v2 → v3 |
| Section IDs Changed | PLAN-AUTH-001, PLAN-RBAC-001, PLAN-USRMGMT-001, PLAN-ADMIN-001, PLAN-USRPNL-001, PLAN-AUDIT-001, PLAN-HEALTH-001, PLAN-API-001, PLAN-JOBS-001 |
| Decision IDs Affected | DEC-008, DEC-009, DEC-010, DEC-011, DEC-012, DEC-013, DEC-014, DEC-015, DEC-016 |
| What Changed | Execution status only — all 9 sections moved from `proposed` to `approved` |
| Why | All module documentation scored 100/100; governance system complete; OQ-002 and OQ-005 remain open (resolved in v4) |
| What Stayed | All module definitions, dependencies, acceptance criteria, subsections unchanged |
| What Was Added | DEC-008 through DEC-016 (implementation approvals) |
| What Was Removed | None |
| Approval Status | Approved (Review Round 2) |
| Supersession Links | None |

### v3 → v4 (2026-04-09)

**Type:** Corrective alignment — pre-implementation audit fixes

| Field | Value |
|-------|-------|
| Plan Version | v3 → v4 |
| Section IDs Changed | None (no plan section definitions changed) |
| Decision IDs Affected | DEC-017 (new), DEC-018 (new), DEC-019 (new) |
| What Changed | Resolved OQ-002 (MFA recovery codes → DEC-017), OQ-004 (moderator deferred to v2 → DEC-018), OQ-005 (pg_cron → DEC-019). Fixed RSK→RISK ID mismatch across 6 reference indexes. Added missing permission entries (self-scope permissions). Added missing Permission UUID placeholders. Added RW-006 (health monitoring watchlist item). Updated Last Reviewed dates. Fixed v2→v3 changelog wording. |
| Why | Pre-implementation audit identified 10 issues (2 critical blockers, 5 medium, 3 low). All resolved. |
| What Stayed | All plan section definitions, dependencies, acceptance criteria, module docs unchanged |
| What Was Added | DEC-017, DEC-018, DEC-019, RW-006, 3 self-scope permission entries, Permission UUID placeholders |
| What Was Removed | Provisional moderator references (per DEC-018) |
| Approval Status | Approved |
| Supersession Links | None |

### v4 → v5 (2026-04-10)

**Type:** Governance enhancement — Deferred Work Register + carried-forward gate item protocol

| Field | Value |
|-------|-------|
| Plan Version | v4 → v5 |
| Section IDs Changed | Phase Gate Rules (new subsection: Carried-Forward Gate Item Rule) |
| Decision IDs Affected | DEC-021 (new) |
| What Changed | Added Deferred Work Register as SSOT governance document. Added Carried-Forward Gate Item Rule to Phase Gate Rules. Linked deferred items (DW-001 through DW-007) from master-plan gate items and subsections. Updated system-state with deferred_work_open field. Fixed DW-001/DW-002 status from `deferred` to `assigned` (had explicit future phase). Bumped plan version to v5. |
| Why | Deferred approved work had no formal carry-forward mechanism. Phase-boundary review, future-phase reassignment, and gate-item lifecycle were not governed. Carried-forward gate items had no explicit interaction rule with phase advancement. |
| What Stayed | All plan section definitions, dependencies, acceptance criteria, module docs, existing decisions unchanged |
| What Was Added | deferred-work-register.md (7 seed entries), DEC-021, Carried-Forward Gate Item Rule, DW-NNN links in Phase 1/2 gate sections |
| What Was Removed | None |
| Approval Status | Approved |
| Supersession Links | None |

### v5 → v6 (2026-04-10)

**Type:** Gate closure — runtime verification + change control resolution

| Field | Value |
|-------|-------|
| Plan Version | v5 → v6 |
| Section IDs Changed | PLAN-RBAC-001 (Phase 2 gate items 10, 11 updated) |
| Decision IDs Affected | DEC-022 (new) |
| What Changed | Phase 2 gate item 10 (RLS DB-level testing) checked with ACT-019 evidence. Phase 2 gate item 11 (cross-tenant isolation) marked N/A via DEC-022 (v1 single-tenant). DW-004 status → implemented. DW-005 status → cancelled. Permission deny matrix verified (29/29). System-state updated to reflect 10/12 gate items checked. |
| Why | Runtime verification tests executed against deployed Supabase confirmed RLS enforcement, write denial, and security helper fail-secure behavior. Cross-tenant gate item formally resolved as architecturally inapplicable for v1. |
| What Stayed | All plan section definitions, acceptance criteria, Phase Gate Rules, Carried-Forward Gate Item Rule unchanged |
| What Was Added | DEC-022, ACT-019, runtime verification evidence |
| What Was Removed | None |
| Approval Status | Approved |
| Supersession Links | None |

### v5 — 2026-04-10 — Stage 3B Remediation

| Field | Value |
|-------|-------|
| Trigger | Stage 3B review feedback — plan drift, shared-helper bypass, missing export sanitization |
| Changed Sections | PLAN-AUDIT-001, PLAN-API-001 |
| What Was Added | DEC-023 (shared API primitives mandate), DEC-024 (export-time metadata sanitization), DEC-025 (CSV export format approval) |
| What Was Changed | query-audit-logs and export-audit-logs refactored to use validateRequest/normalizeRequest. Export metadata allowlist-sanitized. |
| What Was Removed | None |
| Approval Status | Approved |
| Supersession Links | None |

### v6 → v7 (2026-05-13)

**Type:** Plan addition — approved unplanned proposal

| Field | Value |
|-------|-------|
| Plan Version | v6 → v7 |
| Section IDs Changed | PLAN-AUTH-MFA-POLICY-001 (new) |
| Decision IDs Affected | DEC-028 (new) |
| What Changed | FP-002 approved. New plan section PLAN-AUTH-MFA-POLICY-001 added: configurable per-panel MFA enforcement policy + per-user MFA self-preference. Two-layer model: (1) superadmin-controlled `system_config.mfa_enforcement_policy` with `panels.admin = 'required'\|'optional'`, extensible to future panels; (2) user-controlled `profiles.require_mfa_for_self`. Three new dedicated edge functions, one new admin page, one card added to `/settings/security`, narrow gate updates in `AdminLayout` and `UserLayout`. |
| Why | Hard-coded admin MFA gate forced TOTP-every-login during development with no relief lever. Solution must (a) allow superadmin to control panel-level enforcement without redeploy, (b) preserve user autonomy to opt themselves into stricter MFA, (c) be extensible to future panels (trading, finance), (d) never silently weaken MFA for already-enrolled users. |
| What Stayed | All existing MFA enrollment/challenge/recovery flows. Supabase `aal1→aal2` enforcement is sacrosanct. Reauth dialog unchanged. No new permission, role, or auth primitive. |
| What Was Added | DEC-028, PLAN-AUTH-MFA-POLICY-001, `system.mfa_policy_changed` event, `user.mfa_self_pref_changed` event, `get-mfa-policy` / `update-mfa-policy` / `update-mfa-self-pref` edge functions, `/admin/security` route, `mfa_enforcement_policy` config row, `profiles.require_mfa_for_self` column |
| What Was Removed | `UserLayout`'s `admin.access`-keyed MFA enrollment redirect (responsibility moved into `AdminLayout` and gated by panel policy) |
| Approval Status | Approved |
| Supersession Links | None |

### v11.0 → v12.0 (2026-05-15)

**Type:** Plan addition — approved unplanned proposal (architectural foundation)

| Field | Value |
|-------|-------|
| Plan Version | v11.0 → v12.0 |
| Section IDs Changed | PLAN-TRADING-001 (new) |
| Decision IDs Affected | DEC-030 (new), DEC-031 (new); DEC-003 expanded but not superseded |
| What Changed | FP-004 approved. New plan section PLAN-TRADING-001 added: trading panel + strategy-module architectural pattern. DEC-030 records the DEC-003 feature scope expansion to include trading strategies (DEC-003 stays historically intact as the scope-discipline anchor; this is an additive amendment, not a supersession). DEC-031 records the eleven architectural decisions that lock the pattern (module location at `src/features/<strategy>/`, panel routing as shared `/trading` shell, strict two-segment RBAC permissions, per-strategy data and audit tables, cross-module dependency rules with narrow trading-panel-infrastructure façade-import carve-out, edge function naming, job classification, MFA policy participation, initial seed-grant policy, scope boundary). No code, migrations, or schema changes in this version — pure planning + decision recording. This v11.0 → v12.0 transition ships in **one consolidated Step 2b documentation PR** containing all three internal batches: Batch A (this entry plus DEC-030, DEC-031, PLAN-TRADING-001, system-state version bump), Batch B (`docs/04-modules/strategy-module-pattern.md` and `docs/04-modules/trading-panel.md` — two new module docs), and Batch C (reference-index updates and architecture-doc updates across seven existing files). The batch labels exist for review traceability — not separate PRs. Subsequent work (Step 3 `.cursorrules` update, Step 4 foundation infrastructure including TradingLayout + permission seeds + e2e tests, FP-005 long-short Phase 0) opens later as separate PRs and triggers their own plan-version movements if applicable. |
| Why | DEC-003 locked feature scope at v0 (April 2026) to prevent silent scope creep. Trading was always anticipated (FP-002 / DEC-028 explicitly mentions `panels.trading` as a future panel) but never formally added. FP-004 surfaced the need to record the scope expansion formally before any trading work could begin per Constitution Rule 9 (Execution Lock). Architectural decisions captured in DEC-031 to ensure future strategies (options, futures) clone a consistent pattern rather than each inventing its own shape. |
| What Stayed | All existing plan sections (PLAN-GOV-001 through PLAN-AUTH-SUDO-001), all existing DECs including DEC-003 (which gains DEC-030 as an explicit expansion record but is not superseded), the entire platform module set (auth, rbac, admin-panel, user-panel, audit-logging, api, health-monitoring, jobs-and-scheduler, user-management). Existing `audit_logs` table is unchanged — trading uses dedicated per-strategy audit tables. |
| What Was Added | DEC-030, DEC-031, PLAN-TRADING-001. Plan version bumped v11.0 → v12.0. No code, no migrations. Two new module docs (`trading-panel.md`, `strategy-module-pattern.md`), reference-index extensions, architecture-doc updates land in Batches B and C of this Step 2b documentation PR. |
| What Was Removed | None |
| Approval Status | Approved |
| Supersession Links | None — DEC-003 remains active as the scope-discipline anchor; DEC-030 is an amendment, not a supersession |

### v13.3 → v13.4 (2026-05-24)

**Type:** In-FP-006 corrective sub-step insertion (6.4.1) — repo-only remediation closure for operator-applied DB surfaces (MIG-037..MIG-045 per canonical ledger numbering) + Lovable-verified passive smoke (21/21) + Option A §22.5 AMBIGUITY closure for B.3 active 4-RPC cycle (deferred to 6.5.x).

| Field | Value |
|---|---|
| Plan Version | v13.3 → v13.4 |
| Section IDs Closed | sub-step 6.4.1 (within PLAN-TRADING-001-LONGSHORT-002 / FP-006) |
| Section IDs Created | sub-step 6.4.1 (corrective insertion between 6.4 and 6.5 in master-plan inventory) |
| Decision IDs Affected | None — no DECs modified. §22.5 AMBIGUITY clause invoked per existing supervisor doctrine ("either passive + inverse-positive OR active E2E is acceptable as long as evidence is captured"); deferral of active 4-RPC cycle to FP-006 6.5.x is governed by that clause and does not require a new DEC. |
| What Changed | (a) Operator applied 9 migrations out-of-band via Supabase Dashboard SQL editor + manual `schema_migrations` ledger inserts at original timestamps `20260521120000`..`20260522110000` (MIG-037 `longshort.view` + `longshort.manage` permission seed; MIG-038 `longshort_audit_logs` table + RLS; MIG-039 `feature_flags` table + RLS + seed; MIG-040 kill-switch infrastructure: `kill_switch_state` enum + `kill_switches` table + 4 RPCs `kill_switch_soft_pause` / `kill_switch_hard_pause` / `kill_switch_manual_liquidate` / `kill_switch_resume` with `is_superadmin(auth.uid())` gate + audit-logs writes + `system.kill_switches.manage` permission seed; MIG-041 `system_config.value_version` column + `bump_system_config_value_version` fn + `system_config_value_version_bump` trigger; MIG-042 `longshort_reconciliation_state` table + RLS; MIG-043 `reconciliation_outcome` enum + `reconciliation_tier` enum + `reconciliation_events` table + 4 indices + RLS; MIG-044 `job_registry` seeds for `longshort.reconciliation_periodic_sweep` enabled=false and `longshort.reconciliation_replay_chain` enabled=false; MIG-045 `UPDATE job_registry SET enabled=true WHERE id='longshort.reconciliation_periodic_sweep'` with DO-block dependency-check on MIG-044). (b) Lovable ran full B.1..B.5 passive smoke via `supabase--read_query` against the live DB — 21/21 green; B.3 active 4-RPC cycle surfaced §22.5 AMBIGUITY (Dashboard SQL editor runs as `postgres` service role, `auth.uid()` is NULL, gate correctly fires `42501 requires superadmin` — captured as inverse-positive evidence). (c) Per operator Option A decision, passive + inverse-positive accepted as sufficient for ACT-084 closure; active state-transition cycle deferred to FP-006 6.5.x where an authenticated superadmin session exists in the running app. (d) Master-plan sub-step inventory updated: insert `[x] 6.4.1` between 6.4 and 6.5; header `(15 + closure)` → `(16 + closure)`. (e) action-tracker ACT-084 entry. (f) system-state version bumps to v13.4 + last_updated 2026-05-24. (g) NEW closure-note appendix `docs/08-planning/phase-closures/fp-006-sub-step-6-4-1-smoke-evidence.md` capturing verbatim 21/21 passive output + inverse-positive gate evidence + Option A acceptance rationale + 6.5.x deferral pointer. |
| Why | FOLLOWUP-001 (MIG-037/038/039 live-DB application) + FOLLOWUP-002 (MIG-040/041/042/043/044/045 live-DB application) closure — sub-step 6.5 replay framework consumption requires DB surfaces (kill-switch RPCs, reconciliation enums, system_config optimistic-concurrency column, job_registry rows for periodic sweep + replay chain) that were missing after 6.4 closure. v2 incorrectly labeled this as "FOLLOWUP-005" — v3 corrects to canonical supervisor-inventory followup identifiers. Repo-only remediation (Lovable cannot apply DB migrations directly in this operator's environment) split into: operator OOB apply (preferred `supabase db push` not available — fell back to Dashboard SQL editor + manual ledger inserts) + Lovable passive verification + Option A §22.5 AMBIGUITY acceptance for the unauthenticatable B.3 active cycle. |
| What Stayed | All DECs unchanged (DEC-001..033 + DEC-034 v13.2 + DEC-034.1 + DEC-035 + DEC-036 + DEC-037). All 17 verifier files + lifecycle/types/state/clock/supabase-admin engine modules untouched. .github/workflows/strong-evidence.yml + scripts/ Deno tests untouched. 71-test verifier suite green (no source-code tests run — sub-step is repo-only governance writes). longshort module status `foundation-implemented` unchanged. Platform `audit_logs` schema unchanged. |
| What Was Added | Sub-step 6.4.1 (master-plan); ACT-084 (action-tracker); v13.3 → v13.4 entry (this changelog); fp-006-sub-step-6-4-1-smoke-evidence.md (NEW closure-note appendix); 9 migration files (MIG-037..MIG-045) applied OOB by operator — ledger entries already present in `docs/07-reference/database-migration-ledger.md`, no D5 operator update needed. |
| What Was Removed | None — additive diff per Constitution Rule 10 (Plan Merge Rule). |
| Approval Status | Approved (operator Option A decision at ACT-084 closure; §22.5 AMBIGUITY clause governs the B.3 active-cycle deferral; no new DEC required). |
| Supersession Links | None — additive corrective sub-step. FOLLOWUP-001 + FOLLOWUP-002 status transitions from active → closed (smoke evidence + Option A acceptance recorded in closure-note appendix). v2 incorrectly labeled as "FOLLOWUP-005" — v3 corrects per canonical supervisor inventory. |

### Governance addition (2026-05-24) — ADR-004 introduced via ACT-085

**Type:** Governance addition; plan v13.4 unchanged

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged — governance addition, not plan-structure change per Constitution Rule 10) |
| Section IDs Created | None |
| Decision IDs Affected | ADR-004 introduced ("Live-DB Verification Discipline + Apply-Verify Separation") |
| What Changed | ADR-004 landed codifying four §22.5 supervisor protocol amendments motivated by FP-006 sub-step 6.4.1. ACT-085 documents closure; INC-20 RESOLVED (full); master-plan 6.4.1 tick line MIG labels + FOLLOWUP refs corrected; sub-step 6.4.1 fully closes. CLAUDE.md v0.5 (chat-context) is the authoritative behavioral specification. |
| Why | Sub-step 6.4.1 corrective cycle surfaced four defect classes the v0.4 §22.5 framework did not catch (live-DB blind spot; capability assumption; executor-path violation per INC-20; visibility-gap across sessions). ADR-004 codifies prevention discipline forward. |
| What Stayed | All DECs unchanged. ADR-001/-002/-003 unchanged. Plan version unchanged. system-state unchanged. All code/migration/script/edge function files untouched. |
| What Was Added | ADR-004; ACT-085 entry; INC-20 two-part closure notes; this plan-changelog entry; master-plan 6.4.1 tick line MIG label + FOLLOWUP correction. |
| What Was Removed | None. |
| Approval Status | Approved per operator-amended strict serial sequencing (083a → 083b → 084 v1→v2→v3 → 085); operator confirmed INC-20 Part (a) revoke (`still_superadmin=0`). |
| Supersession Links | None — additive governance. |

### Gate closure (2026-05-24) — Gate 6.5: §11.10 Replay Framework Complete

**Type:** Sub-step gate closure within FP-006; plan v13.4 unchanged

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged — gate closure within FP-006; plan-structure-bump deferred to FP-006 closure at sub-step 6.10) |
| Section IDs Created | None |
| Decision IDs Affected | None — ADR-001/-002/-003/-004/-005 all unchanged; DEC-035 replay-chain job lifecycle now active per its as-designed specification |
| What Changed | Gate 6.5 closes with §11.10 replay framework complete across all five §11.10.x subsections: §11.10.1 capture scope + §11.10.2 storage (6.5a); §11.10.3 deterministic replay engine (6.5b); §11.10.4 replay-test PASS comparison (6.5c first PASS evidence against verify_quote); §11.10.5 AI-loop verification surface (6.5d). MIG-046 (`longshort.reconciliation_replay_chain` enabled=true) applied OOB by operator + verified via Lovable pre-flight gate per ADR-004 §22.5.2 split-execution. First sub-step under CLAUDE.md v0.5 to exercise the live-DB verification discipline end-to-end. |
| Why | CROSSWIND §11.10 Phase 0B deliverable; ADR-001 §11.0.1 architectural commitment to "external verification source neither AI can manipulate or pre-cache" realized through §11.10.5 AI-loop verification surface. Closes the replay framework so sub-step 6.6 (A1 baseline harness) can produce replay-test PASS evidence against synthetic baselines forward. |
| What Stayed | All DECs unchanged. ADR-001/-002/-003/-004/-005 unchanged. All verifiers + lifecycle + engine + PASS runner from prior sub-steps frozen. Plan version unchanged. system-state version unchanged. |
| What Was Added | 4 new src/scripts modules (ai-loop-verifier + CLI + tests); MIG-046 SQL file + ledger entry; ACT-089 entry; master-plan 6.5d + Gate 6.5 ticks; this changelog entry. |
| What Was Removed | None — additive. |
| Approval Status | Approved per operator OOB application of MIG-046 + chat-verified pre-flight evidence per ADR-004 §22.5.2; CLAUDE.md v0.5 §22.5.1 first-clause evidence path satisfied. |
| Supersession Links | None. |

### Sub-step closure (2026-05-24) — Sub-step 6.6: A1 Baseline Aggregation Infrastructure

**Type:** Sub-step closure within FP-006; plan v13.4 unchanged

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged) |
| Section IDs Created | None |
| Decision IDs Affected | None |
| What Changed | A1 sustained-anomaly baseline aggregation infrastructure landed per CROSSWIND §10.4 priority deliverable #1: 3 SQL views (daily/weekly/monthly per call_name per outcome on `reconciliation_events`) + `compare_reconciliation_baseline()` RPC (SECURITY INVOKER; excludes `expected_divergence_handled` + `false_positive_within_tolerance` per §11.6 verbatim) + TypeScript query helpers wrapping both. MIG-047 applied OOB by operator via Dashboard SQL editor per ADR-004 §22.5.2; Lovable pre-flight gate verified. |
| Why | Phase 7 baseline establishment (§10.11 #2 — rolling 90-day trailing window) + Phase 9 §11.6 sustained-anomaly kill condition (current > 3× baseline for 7+ consecutive RTH days) both depend on this aggregation surface being in place during Phase 0B. Building infrastructure now per A1; population happens during Phase 7 paper trading. |
| What Stayed | All DECs unchanged. ADRs unchanged. All prior 6.x sub-step modules frozen. Plan version unchanged. |
| What Was Added | baseline-query-helpers.ts + tests; MIG-047 SQL file + ledger entry; ACT-090 entry; master-plan 6.6 tick; this changelog entry. |
| What Was Removed | None — additive. |
| Approval Status | Approved per operator OOB application of MIG-047 + verified pre-flight gate. Second sub-step under CLAUDE.md v0.5 §22.5.2 (after 6.5d). |
| Supersession Links | None. |

### Gate closure (2026-05-24) — Gate 6.7: Replay Framework + A1 Baseline + Alpaca Paper

**Type:** Gate closure within FP-006; plan v13.4 unchanged

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged) |
| Section IDs Created | None |
| Decision IDs Affected | None — ADRs unchanged |
| What Changed | Sub-step 6.7 closed: Alpaca paper integration landed. 6 fetcher implementations (Position / Quote / HaltStatus / Locate / BuyingPower / OrderAcceptance) against live Alpaca paper API, each implementing the corresponding interface in `longshort-broker-interfaces.ts` without modification. Minimal REST wrapper (`AlpacaPaperClient`) with typed error hierarchy (AlpacaCredentialError + AlpacaApiError + AlpacaNetworkError) — no phantom-success swallow per DEC-034 clause (3). Unit tests (≥9 client + ≥11 fetchers) use mocked fetch (CI-runnable, no credentials). Integration tests marked `Deno.test.ignore` (operator runs locally with credentials). Connection-test CLI emits per-fetcher JSON status suitable for §12.5 evidence. Gate 6.7 closes: all three §10.4 priority deliverables now operational — replay framework (Gate 6.5) + A1 baseline aggregation (6.6) + Alpaca paper integration (6.7). |
| Why | §10.4 Phase 0B supporting deliverable: "Alpaca paper account integration (real broker connection for reconciliation against real Alpaca paper state, not mocked)". Foundation for all replay-test PASS evidence claims from Phase 7 forward. |
| What Stayed | All DECs unchanged. ADRs unchanged. `longshort-broker-interfaces.ts` unchanged. All prior sub-step modules frozen (verifiers / lifecycle / engine / 6.5 / 6.6). 11 fetcher interfaces remain using 6.5b fixture-backed implementations; lit up in 6.10 or later. Captured Day 1 fixture deferred to 6.9 (requires full RTH market day). Plan v13.4 unchanged. |
| What Was Added | 17 files: 1 REST client + 6 fetcher implementations + 1 integration test file + 2 unit test files + 2 scripts (CLI + arg-parsing test) + `.env.example` extension + `tsconfig.app.json` exclude amendment (per §22.3 item 7 capability-gap surface; same scoped-exclude pattern as 6.5b) + ACT-091 entry + master-plan 6.7 + Gate 6.7 ticks + this changelog entry. |
| What Was Removed | None — additive. |
| Approval Status | Approved per operator confirmation. Per §22.5.1 third clause: no live-DB state touched (Alpaca API is external; pure code + tests). |
| Supersession Links | None. |

### Sub-step build phase (2026-05-25) — Sub-step 6.8 phase 1: Multi-Pending Validation Harness

**Type:** Sub-step build phase within FP-006; plan v13.4 unchanged; sub-step 6.8 ticks at follow-on completion

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged) |
| Section IDs Created | None |
| Decision IDs Affected | None — ADR-002 placeholder unchanged at this phase; populated at follow-on |
| What Changed | Build phase of sub-step 6.8 closed: multi-pending validation harness landed per DEC-036 clause (6) + §8.6.1.1. 7-test framework with pre-flight sanity, per-test cleanup, structured HarnessResult output, CLI entrypoint, unit tests with mocked fetch, integration test `Deno.test.ignore`'d. Sub-step closes at follow-on prompt after operator runs harness against live Alpaca paper + supervisor populates ADR-002 with determination. |
| Why | §10.4 Phase 0B supporting deliverable: "Alpaca multi-pending-order behavior validation per §8.6.1.1 short-stop parallel-order mechanism requirement... Determination documented and committed before Phase 0B exits." Build phase produces the empirical-test instrument; follow-on phase produces the determination. |
| What Stayed | All DECs unchanged. ADRs unchanged (ADR-002 placeholder remains until follow-on). All prior modules frozen. Plan version unchanged. Master-plan 6.8 unticked. |
| What Was Added | 5 src/scripts modules + tests; ACT-092 entry; this plan-changelog entry. |
| What Was Removed | None — additive. |
| Approval Status | Approved per FP-006 sub-step 6.8 build-phase shape (two-phase: build + populate). |
| Supersession Links | None. |

### v13.2 → v13.3 (2026-05-22)

**Type:** In-FP-006 sub-step closure (6.4) + FOLLOWUP-004 architectural fix landing (CI script + ADR-003 + DEC-034 v13.2 amendment)

| Field | Value |
|---|---|
| Plan Version | v13.2 → v13.3 |
| Section IDs Closed | sub-step 6.4 + Phase Gate 6.4 (within PLAN-TRADING-001-LONGSHORT-002) |
| Section IDs Created | None |
| Decision IDs Affected | DEC-034 amendment v13.2 (clause (5) verifier text replaced — embedded regex removed; reference to `scripts/check-audit-writer-trap.ts` with 8 unit tests including FINDING-001 regression fixture). DEC-034 itself NOT superseded — clauses (1)-(4) + (6) unchanged. |
| What Changed | (a) 5 strong-evidence tooling scripts landed under `scripts/` with 5 companion `_test.ts` files (19 total Deno tests: 8 audit-writer-trap + 3 firing-diff + 2 replay-run + 3 telemetry-report + 3 broker-spot-check) — all ship verbatim working implementations per D2 disposition (no throw-stubs). (b) `.github/workflows/strong-evidence.yml` CI workflow added with 4 quality gates. (c) ADR-003 (`docs/04-modules/longshort/design-source/ADR-003-enforcement-as-scripts-not-prose.md`) created — codifies "enforcement logic that requires pattern matching MUST live in tested scripts, not DEC prose" precedent; references DEC-036 (precedent established by ADR-002). (d) DEC-034 v13.2 amendment in approved-decisions.md replaces clause (5) embedded regex with reference to the script. (e) FINDING-001 status updated in `docs/06-tracking/known-verifier-exceptions.md` from "active exception pending FOLLOWUP-004" to "closed / superseded by ADR-003 + tested script — regression fixture lives at test (3) in check-audit-writer-trap_test.ts". (f) `scripts/README.md` created — directory documentation + authoring contract + banned-pattern self-discipline. (g) function-index.md registers 5 module entries + 1 doc entry. |
| Why | FOLLOWUP-004 closure per operator A+ disposition at sub-step 6.3a closure (logged in ACT-077). The DEC-034 v13.1 embedded regex accumulated 4 distinct defect classes (DEC-036 Alpaca regex / DEC-034 v1 substring / DEC-034 v13.1 import-shape / FINDING-001 JSDoc continuation false-positive). Root cause: enforcement boundary held in supervisor's head, untested, ungoverned. Architectural fix: move enforcement to tested CI scripts (ADR-003 codifies the pattern; DEC-034 v13.2 amendment is the first application; this precedent applies to any future DEC clause requiring mechanical verification). |
| What Stayed | All other DECs (DEC-034 clauses (1)-(4) + (6), DEC-034.1, DEC-035, DEC-036, DEC-037, DEC-001..033) unchanged. All 17 verifier files + edge function + MIG-045 from 6.3d untouched. Engine modules (lifecycle.ts, supabase-admin.ts, clock, state, types) untouched. 71-test verifier suite green. .cursorrules unchanged. longshort module status `foundation-implemented` (engine + tooling; signal/order logic remains FP-006 6.6+). |
| What Was Added | ACT-082; scripts/ directory (5 modules + 5 test files + 1 README); .github/workflows/strong-evidence.yml; ADR-003; DEC-034 v13.2 amendment; FINDING-001 status update; function-index entries; master-plan 6.4 + Gate 6.4 ticks; this changelog entry. |
| What Was Removed | DEC-034 v13.1 embedded regex pattern (replaced by reference to script — superseded inline within DEC-034 clause (5)). FINDING-001 exception register entry transitions to closed (still present, append-only, marked superseded by ADR-003). |
| Approval Status | Approved (operator A+ disposition at 6.3a closure for FOLLOWUP-004; D1/D2/D3 pre-execution dispositions absorbed). |
| Supersession Links | DEC-034 v13.1 clause (5) embedded regex → DEC-034 v13.2 amendment (script reference). FINDING-001 active exception → closed / superseded by ADR-003 + scripts/check-audit-writer-trap.ts test (3) regression fixture. |

### v13.1 → v13.2 (2026-05-22)

**Type:** In-FP-006 decomposition insertion (corrective sub-step 6.3a.1) + governance reduction discipline (interim verifier-exception register replacing exception-in-every-ACT pattern)

| Field | Value |
|---|---|
| Plan Version | v13.1 → v13.2 |
| Section IDs Created | sub-step 6.3a.1 (corrective inserted between 6.3a and 6.3b within PLAN-TRADING-001-LONGSHORT-002) |
| Section IDs Changed | PLAN-TRADING-001-LONGSHORT-002 sub-step inventory header `(14 + closure)` → `(15 + closure)` |
| Decision IDs Affected | None — DEC-034 v13.1 verifier text unchanged in this version (DEC-034 v13.2 amendment lands at sub-step 6.4 alongside the CI script that replaces the embedded regex, per FOLLOWUP-004) |
| What Changed | (a) Sub-step 6.3a.1 corrective inserted: closes FOLLOWUP-003 (TypeScript invariance collision in `updateStateSurface` + eager Deno.env.get reads in `supabase-admin.ts` — both 6.2 supervisor-side defects surfaced at 6.3a first-real-consumer testing). (b) Interim FINDING-001 disposition: `docs/06-tracking/known-verifier-exceptions.md` created to hold the AC-05 / audit-writer-trap exception at `longshort-reconciliation-lifecycle.ts:23` (JSDoc continuation line quoting `import logAuditEvent` verbatim as defense-in-depth documentation). Exception register exists pending FOLLOWUP-004 / sub-step 6.4 CI script that replaces embedded regex with tested code. |
| Why | Operator A+ disposition on the two findings surfaced at sub-step 6.3a closure: workarounds in 6.3a tests (`--no-check` + dummy env vars) would compound across 12 more verifiers without the corrective; defending FOLLOWUP-003 to sub-step 6.3d means writing/testing 6.3b/c verifiers under type-check blindfold on Tier A surface. FINDING-001 interim register prevents Option-C "exception note in every ACT" across remaining sub-steps. |
| What Stayed | All DEC entries unchanged (DEC-034 / DEC-034.1 / DEC-035 / DEC-036 / DEC-037); all FP-006 entry content; all Round Final / Gate 6.0 / sub-step 6.1 / 6.2 / 6.3a outputs untouched; .cursorrules unchanged; longshort module status `foundation-implemented`; all verifier files from 6.3a unchanged. |
| What Was Added | ACT-078 (this corrective closure); `docs/06-tracking/known-verifier-exceptions.md` (interim register); sub-step 6.3a.1 checkbox in master-plan; this changelog entry. |
| What Was Removed | None — `supabaseAdmin` export name preserved via Proxy (no consumer migration needed); `updateStateSurface` is internal to lifecycle.ts (no external callers affected). |
| Approval Status | Approved (corrective insertion per operator A+ disposition). |
| Supersession Links | None — this is an additive corrective, not a supersession. |

### v13.0 → v13.1 (2026-05-22)

**Type:** In-cycle DEC amendment — DEC-034 clause (5) verifier regex correction per Round Final §22.5 Option 1 reconciliation

| Field | Value |
|---|---|
| Plan Version | v13.0 → v13.1 |
| Section IDs Created | (none) |
| Section IDs Changed | (none) |
| Decision IDs Affected | DEC-034 clause (5) only — verifier regex amended from plain-substring `rg -c 'logAuditEvent'` to call/import-shaped pattern `rg -nE 'import\s.*\blogAuditEvent\b\|\blogAuditEvent\s*\('` with markdown exclusion |
| What Changed | DEC-034 clause (5) verifier specification corrected to distinguish documentation (JSDoc warnings reinforcing the T4 trap; e.g., `longshort-emit-init/index.ts:10`) from real structural violations (imports/calls). Same defect class as DEC-036 clause (2) regex correction from Round 3 governance authoring. |
| Why | Lovable's §22.8.4 STOP discipline at Gate 6.0 closure surfaced the broken substring regex; supervisor reconciliation cycle resolved per Option 1 (fix-at-source) rather than Option 2 (strip JSDoc — rejected: removes legitimate defense-in-depth) or Option 3 (footnote exception — rejected: 13+ sub-step repetitions = systemic drift class per supervisor v0.4 §9). |
| What Stayed | All other DEC-034 clauses (1)(2)(3)(4)(6)(7); all other DECs (DEC-034.1, DEC-035, DEC-036, DEC-037); all FP-006 entry text; PLAN-TRADING-001-LONGSHORT-002 plan section content (only Phase Gate checkbox format-fix added); ADR-002 placeholder; DW-054/055/056/057; ACT-073 closure record; Round Final HEAD `30ff765` outputs preserved. |
| What Was Added | ACT-074 (Gate 6.0 closure); `supabase/functions/_shared/strategy-reconciliation.ts` (empty stub per DEC-033 v4.1 precedent); Phase Gate checkboxes in master-plan PLAN-TRADING-001-LONGSHORT-002 plan section; DEC-034 clause (5) amendment text. |
| What Was Removed | None (DEC-034 clause (5) old verifier text replaced in place; not deleted from history — historical version remains in plan-changelog audit trail via this entry). |
| Approval Status | Approved (in-cycle DEC amendment per Option 1 reconciliation; preserves all other Round Final ratifications). |
| Supersession Links | DEC-034 clause (5) v13.0 verifier → DEC-034 clause (5) v13.1 verifier (in-place amendment; clause-level not entry-level supersession). |

### v12.1 → v13.0 (2026-05-22)

**Type:** Governance authoring — FP-006 reservation activated; 5 DECs ratified; PLAN-TRADING-001-LONGSHORT-002 created; ADR-002 placeholder positioned

| Field | Value |
|---|---|
| Plan Version | v12.1 → v13.0 |
| Section IDs Created | PLAN-TRADING-001-LONGSHORT-002 |
| Section IDs Changed | (none) |
| Decision IDs Affected | DEC-034 (new), DEC-034.1 (new), DEC-035 (new), DEC-036 (new), DEC-037 (new) |
| What Changed | FP-006 governance authored: residual Phase 0A + entire Phase 0B reconciliation engine + 17 verify_* + replay framework + evidence tooling + Alpaca paper integration + Phase 0B exit gate quietness evidencing |
| Why | CROSSWIND v0.9 §10.4 architectural commitment ("reconciliation engine built before any business logic"); FP-005 Phase 0A bootstrap closed (9 of 9 sub-steps); FP-006 unblocks Phases 1-9 via Phase 0B closure |
| What Stayed | All FP-005 outputs, all DEC-030/031/032/033 bindings, all platform-tier modules, all repo-platform foundation, FP-007 reservation per DEC-032 clause (4), all OUT-OF-SCOPE items enumerated in Round 1.4 (Phases 1-9 + DW-046/047/052) |
| What Was Added | FP-006 entry, PLAN-TRADING-001-LONGSHORT-002 plan section, 5 DECs (DEC-034 invariants, DEC-034.1 architecture, DEC-035 replay determinism + L2 synthetic Day 1, DEC-036 Alpaca paper scope, DEC-037 evidence tooling + Gate 6.4 baseline discipline), ADR-002 placeholder at sibling-of-ADR-001 location, 4 DW entries (DW-054 platform-tier extraction, DW-055 pg_cron contingency, DW-056 real Day 1 capture Phase 7, DW-057 Tier 3 runbook templates emergent) |
| What Was Removed | None |
| Approval Status | Approved (Round Final consolidated PR post §22.5 reconciliation — Rounds 1.1 + 1.2 + 1.3 + 1.4 + 2 + 3 + Round Final reconciliation all CLEAN; time-box closed within Session 5; no escalation triggered) |
| Supersession Links | None (DEC-034.1 specializes DEC-034 but does not supersede it; both are active) |

### v12.0 → v12.1 (2026-05-17)

**Type:** Additive merge — FP-005 Bootstrap governance authoring (per Constitution Rule 10 — Plan Merge Rule: revisions are additive diffs to the approved baseline, not regenerations)

| Field | Value |
|-------|-------|
| Plan Version | v12.0 → v12.1 |
| Date | 2026-05-17 |
| Section IDs Changed | PLAN-TRADING-001 (parent unchanged in structure; receives new child sub-section PLAN-TRADING-001-LONGSHORT-001) |
| Decision IDs Affected | DEC-032 (new — FP-005 Bootstrap Scope Lock + FP-006 / FP-007 Reservation); DEC-033 (new — Canonical Shared Strategy Audit-Writer Helper, v4.1 reconciled to platform `_shared/audit.ts` return shape) |
| What Changed | FP-005 entry added to `feature-proposals.md` (after FP-004's closing `---`, before `## Status Definitions`); PLAN-TRADING-001-LONGSHORT-001 plan section added to `master-plan.md` as a child of PLAN-TRADING-001; DEC-032 and DEC-033 v4.1 added to `approved-decisions.md` after DEC-031's closing `---` and before `## Decision Integrity Rules` |
| Why It Changed | First concrete application of the FP-004 / DEC-031 strategy-module architectural pattern (DEC-031 sub-point 11 requires a per-strategy proposal before any strategy is implemented); CROSSWIND v0.9 design source landed in PR #5 Step 3.5 (ART-017 family with byte-level SHA-256 verification); `longshort` module advances from documented-only to foundation-implemented via the FP-005 Bootstrap surface (T1 directory scaffold, per-strategy audit table, RBAC seed, and `longshort-emit-init` edge function only — decision engine, reconciliation, and order management explicitly deferred to FP-006) |
| What Stayed Unchanged | All prior PLAN-* sections retain their definitions and statuses — PLAN-GOV-001, PLAN-AUTH-001, PLAN-RBAC-001, PLAN-USRMGMT-001, PLAN-ADMIN-001, PLAN-USRPNL-001, PLAN-AUDIT-001, PLAN-HEALTH-001, PLAN-API-001, PLAN-JOBS-001, PLAN-INVITE-001, PLAN-AUTH-SUDO-001, and the PLAN-TRADING-001 main body; all prior DEC-001 through DEC-031 entries; platform `audit_logs` table schema and writer contract (per DEC-031 sub-point 5 and DEC-032 clause (1) — platform `audit_logs` is NOT modified to receive strategy events); admin-panel, user-panel, user-management, auth, rbac semantics, audit-logging platform writer, api, health-monitoring, and jobs-and-scheduler module behaviors (per DEC-032 clause (1) no-platform-modification lock); `docs/04-modules/strategy-module-pattern.md` structure outside the §Audit-Writer Contract section (the §Audit-Writer Contract rewrite per DEC-033 v4.1 lands in Step 5.0a code work, not in this plan-revision entry) |
| What Was Added | FP-005 entry (feature-proposals.md); PLAN-TRADING-001-LONGSHORT-001 plan section (master-plan.md, child of PLAN-TRADING-001); DEC-032 (approved-decisions.md); DEC-033 v4.1 (approved-decisions.md) |
| What Was Removed | None (additive diff per Constitution Rule 10 — Plan Merge Rule) |
| Approval Status | PLAN-TRADING-001-LONGSHORT-001: proposed (pending FP-005 operator ratification); all prior sections retain their pre-existing statuses unchanged |
| Supersession Links | None (DEC-032 and DEC-033 v4.1 are new entries, not supersessions; no prior decision is retired by this revision) |

---

## Supersession Chain Requirement

For any modification to an approved section:

Must include:
- `prior_section_id`
- `new_section_id`
- `decision_id`
- `reason`
- `date`

Must maintain full traceability:
- plan → decision → changelog → updated plan

## No Silent Change Rule

No modification to `master-plan.md` or `approved-decisions.md` may occur without:
- Corresponding changelog entry
- Proper version increment
- Recorded diff

Violations = **INVALID** change.

## Dependencies

- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)

## Used By / Affects

- Plan governance
- Decision traceability
- Historical auditing

## Risks If Changed

HIGH — loss of traceability breaks system integrity and decision history.

## Related Documents

- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)
- [Plan Review Log](plan-review-log.md)
