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

### v13.6 → v13.7 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. Retroactive governance reconciliation closing DEC-032 clause (4) FP-006/FP-007 dependency-order loose-end before FP-008 Phase 1 scoping opens.

| Field | Value |
|---|---|
| Plan Version | v13.6 → v13.7 |
| Section IDs Created | `PLAN-CI-001-BOOTSTRAP-001` (FP-007's home; first instance of `PLAN-CI-NNN` plan-section family; orthogonal to `PLAN-TRADING-001` per T6 removability principle) |
| Section IDs Closed | `PLAN-CI-001-BOOTSTRAP-001` (closed at HEAD `cd4b8a14` retrospectively; closure document at `docs/08-planning/phase-closures/plan-ci-001-bootstrap-001-closure.md`) |
| FP IDs Created | FP-007 (retroactively authored; reserved at DEC-032 clause (4) on 2026-05-17; entry filed 2026-05-25 at this ACT; status `closed (2026-05-25)`) |
| Decision IDs Affected | None (DEC-032 clause (4) preserved verbatim; INC-21 records the dependency-order observation against unchanged DEC) |
| What Changed | FP-007 entry created in feature-proposals.md (slotted between FP-005 and FP-006 numerically; 7 deliverable items + 5 closure-evidence items + 5 out-of-scope items enumerated). New plan section PLAN-CI-001-BOOTSTRAP-001 in master-plan.md (3 sub-steps + closure inventoried). New closure document `docs/08-planning/phase-closures/plan-ci-001-bootstrap-001-closure.md`. INC-21 entry in incidental-findings.md (framing β; process-defect; cross-references §21.10 amendment). ACT-100 entry in action-tracker.md. Master-plan version v13.6 → v13.7. system-state.md current_plan_version + approved_plan_baseline + last_updated. Supervisor-instructions v0.5 → v0.6 amendment (operator-side; §21.10 additive). |
| Why | Pre-FP-008-scoping sanity check surfaced FP-007 entry absent from feature-proposals.md despite DEC-032 clause (4) reserving the slot as "CI/CD Pipeline Bootstrap" with verbatim language "FP-007 runs in parallel with FP-005 and is a hard prerequisite for FP-006 entry — FP-006 may NOT begin execution until both FP-005 and FP-007 are closed." FP-006 executed and closed (2026-05-25 at ACT-098 HEAD `13fce9cd`) without FP-007 being authored as an FP entry. The CI/CD scope reserved to FP-007 was nonetheless delivered through FP-006's own sub-steps 6.4 (ACT-082 audit-writer trap workflow) + 6.10.1 (ACT-099 transaction Gates 5-9 + override registry). The ordering invariant was violated in form but honored in substance. Per operator framing β calibration: resolution via process-amendment (this ACT) + forward-binding §21.10 supervisor-instruction codification, not informational note (α). |
| What Stayed | All DECs unchanged. All ADRs unchanged. FP-006 entry preserved verbatim. PLAN-TRADING-001-LONGSHORT-002 closure document preserved verbatim per §22.8.3 grandfathering. All ACT-082 + ACT-099 transaction artifacts preserved (workflow + scripts + registry + annotations). Module status remains `phase-0b-validated`. DW register unchanged (no new DW entries; FP-007 scope was substantively delivered). 79 ACs from FP-006 closure remain locked. |
| What Was Added | FP-007 entry (retro-authored); PLAN-CI-001-BOOTSTRAP-001 section + closure document; INC-21 entry; ACT-100 entry; this changelog entry; system-state version bump; supervisor-instructions v0.6 (operator-side). Defect classes #20 + #21 logged forward in supervisor self-defect log. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator standing institutional-grade authority; framing β confirmed by operator pre-draft calibration (2026-05-25); both refinements (machine-checkable §21.10 artifact requirement + PLAN-CI-001-BOOTSTRAP-001 plan-section family) adopted from operator's refinement response. |
| Supersession Links | N/A — additive; no approved sections superseded. (DEC-032 clause (4) preserved verbatim; INC-21 records observation without amending DEC.) |

### v13.5 → v13.6 (2026-05-25)

**Type:** Post-closure additive corrective per Constitution Rule 8 5-point procedure + Rule 10 Plan Merge Rule (additive diff to approved baseline). Retires banned-pattern CI enforcement debt within FP-006 governance scope. Transaction completed across ACT-099 partial landing + ACT-099-cont continuation per §22.8.4 honest STOP discipline.

| Field | Value |
|---|---|
| Plan Version | v13.5 → v13.6 |
| Section IDs Closed | None at this entry (PLAN-TRADING-001-LONGSHORT-002 / FP-006 retains `closed` status from ACT-098; this corrective is additive within FP-006 governance scope per Constitution Rule 10) |
| Section IDs Created | sub-step 6.10.1 (post-closure corrective row appended to PLAN-TRADING-001-LONGSHORT-002 sub-step inventory; inventory count bumps 16 → 17) |
| Decision IDs Affected | None (DECs unchanged; ADRs unchanged); ACT-098 closure record preserved verbatim per §22.8.3 grandfathering; closure document receives "Enforcement layer addendum" section appended after Related Documents |
| What Changed | Five enforcement scripts landed under `scripts/check-*.ts` (sentinel / wall-clock / paper-only-URL / unguarded-parseFloat / catch-returns-zero) + 5 companion `_test.ts` files + `docs/banned-patterns.md` override registry (12-row mapping table + 5-row Active Overrides table organized into Phase-7-deferred and Permanent classes) + 5 new CI gate steps in `.github/workflows/strong-evidence.yml` + 7 line annotations on known Alpaca-module sites (5 `// allow-bare-parsefloat: DW-058-B1` + 2 `// allow-now-in-business-logic: ADR-002`) + closure-document Enforcement-layer-addendum section. ACT-099 entry. Master-plan 6.10.1 row + inventory count 16 → 17. Plan version v13.5 → v13.6. system-state.md current_plan_version + approved_plan_baseline + last_updated. |
| Why | Operator-requested pre-closure audit + Lovable independent investigation 2026-05-25 surfaced that DEC-034 clause (2) + DEC-034 clause (4) + DEC-036 clause (2) + DEC-037 clause (8) each verbatim mandate CI-level grep enforcement of specific banned patterns, but FP-006 sub-step 6.4 (ACT-082) delivered only `check-audit-writer-trap.ts` (1 of 4 surfaces). Closing FP-006 — the FP that authored ADR-003 (enforcement-as-scripts-not-prose) — while leaving 4 of 5 enforcement surfaces as prose creates governance debt against the very FP that exists to retire that class of debt. ADR-003 self-application achieved at this corrective. DW-058 B1-B11 fetcher-wiring remediation in Phase 7 now has automated regression protection. Per Lovable independent reconciliation: 5-script plan canonical over supervisor's 4-script plan. Per §22.8.4 STOP-protocol reconciliation: 2 additional Permanent wall-clock overrides registered for the ADR-002 harness sites that the original prompt missed. |
| What Stayed | All DECs unchanged. All ADRs unchanged. §10.4 / §11.0.7 / §11.0.11 / §11.8 / §11.9 / DEC-034 / DEC-036 / DEC-037 spec text unchanged. All verifier / lifecycle / engine / Alpaca module logic unchanged (only annotation-only modifications to 3 Alpaca files — 7 lines, no logic). FP-006 retains `closed` status. Module status remains `phase-0b-validated`. system-state Module Status Table row unchanged. ACT-098 closure record preserved verbatim per §22.8.3 grandfathering. DW-058 through DW-062 unchanged. The 79-AC FP-006 closure attestation stays intact; this corrective is additive, not retractive. |
| What Was Added | 5 enforcement scripts (sentinel + wall-clock + paper-only-URL + unguarded-parseFloat + catch-returns-zero); 5 companion `_test.ts` files; `docs/banned-patterns.md` (5-row Active Overrides table per §22.8.4 Option-A refinement); 5 CI gate steps; 7 line annotations on Alpaca-module sites; closure-document addendum; ACT-099 entry; master-plan 6.10.1 row + inventory bump; this changelog entry; system-state version bump v13.5 → v13.6. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator standing institutional-grade authority. Lovable independent investigation 2026-05-25 + supervisor cross-check confirmed the enforcement debt at all 5 surfaces; §7.4 dual-investigative-track protocol exercised end-to-end without manufactured consensus. §22.8.4 STOP-protocol reconciliation produced Option-A refinement (ADR-002 as Permanent override class for harness wall-clock sites). §22.8.3 grandfathering applied to ACT-098 closure record. |
| Supersession Links | Supersedes the closure-document attestation at ACT-098 that "Banned-pattern enforcement per CROSSWIND §11.8 + §11.9 — TypeScript substrate translation" was satisfied at sub-step 6.4 alone. The attestation is now satisfied jointly by sub-step 6.4 (audit-writer trap) + sub-step 6.10.1 (5 additional enforcement surfaces). Original closure record-of-truth preserved per §22.8.3 grandfathering. |

### v13.4 → v13.5 (2026-05-25)

**Type:** FP-006 / PLAN-TRADING-001-LONGSHORT-002 closure — Phase 0B exit boundary established; module status transition; 79/79 acceptance criteria evidenced

| Field | Value |
|---|---|
| Plan Version | v13.4 → v13.5 |
| Section IDs Closed | PLAN-TRADING-001-LONGSHORT-002 (FP-006) — closed in full |
| Section IDs Created | None at this ACT (Phase 1 FP scoping opens as separate governance cycle) |
| Decision IDs Affected | None (DECs unchanged; ADR-002 / ADR-003 / ADR-004 / ADR-005 / ADR-006 all introduced during FP-006 sub-steps remain at their respective approval state) |
| What Changed | FP-006 closed: all 14 plan-section sub-steps (6.0a/6.0b/6.0c/6.1/6.2/6.3a/6.3a.1/6.3b/6.3c/6.3d/6.4/6.4.1/6.5a/6.5b/6.5c/6.5d/6.6/6.7/6.8/6.9/6.10) closed; all 5 phase gates closed (Gate 6.0/6.3/6.4/6.7/6.9); 79-AC coverage matrices satisfied per per-sub-step closure SHAs in the closure document. longshort module status transitioned `foundation-implemented` → `phase-0b-validated` in system-state.md. Master-plan PLAN-TRADING-001-LONGSHORT-002 marked `closed`. ACT-098 entry in action-tracker. Closure document at `docs/08-planning/phase-closures/plan-trading-001-longshort-002-closure.md` published with 9 sections (Summary / Acceptance Criteria — Evidence / Migrations / ADRs Created / Reference Index Reconciliation / Tests / Deferred-Follow-up / Grandfathering Note / Lock Statement / Related Documents). |
| Why | Phase 0B is "the architectural commitment of v0.9 — the reconciliation layer is built before any business logic" per CROSSWIND §10.4 verbatim. FP-006 closure establishes the Phase 0B exit boundary per the supervisor §2 axiom 1 ("Reconciliation precedes business logic"). Phases 1-9 cannot open until Phase 0B closes; this closure unblocks Phase 1 (universe construction) opening as separate FP. The captured-day §10.4 supporting deliverable is honestly deferred to Phase 7 per ADR-006 rather than producing a phantom-completion claim; Constitution Rule 8 documented-reason clause satisfied via ADR-006 + the closure document's Lock Statement. The 11-finding Alpaca integration audit (Lovable independent investigation per §7.4 dual-investigative-tracks + supervisor cross-check at ACT-096 + ACT-097) is locked into DW-058 + DW-059 + DW-062 Required Tests for Closure ensuring Phase 7 fetcher-wiring cannot close until audit findings are remediated. |
| What Stayed | All DECs unchanged (DEC-001..033 + DEC-034 + DEC-034.1 + DEC-035 + DEC-036 + DEC-037). All ADRs (001..006) at their canonical content. §10.4 / §11.0.11 / §11.0.7 / DEC-034 / DEC-036 spec text unchanged. All code modules frozen. All migrations applied (MIG-039..047). DW-058 / DW-059 / DW-060 / DW-061 / DW-062 remain at status `deferred` (Phase 7 ownership). 17-item Layer-1 out-of-scope list per FP-006 entry intact (DW-044/046/047/051/052/053/054/056 + Phase 1-9 deferrals + trader-class roles + §15 risk register). Reference indexes unchanged at this ACT (per-sub-step updates landed across FP-006 execution; closure attests via per-sub-step closure SHAs). |
| What Was Added | Closure document `plan-trading-001-longshort-002-closure.md` (NEW); plan version bumps v13.4 → v13.5 in current_plan_version + approved_plan_baseline; modules_implemented narrative + Module Status Table row + active_work narrative all transitioned to reflect FP-006 closure; master-plan 6.10 tick + section Status closed marker; ACT-098 entry; this changelog entry. |
| What Was Removed | None — closure is an additive plan-state-change per Constitution Rule 10. |
| Approval Status | Approved per operator standing institutional-grade authority (operator AGREE/AMEND after supervisor proceeds with best decision per v0.5 supervisor instructions). All 5 phase gates verified closed; all 14 sub-steps verified closed; 79-AC coverage matrices satisfied per closure document attestation. |
| Supersession Links | None at spec or DEC level. PLAN-TRADING-001-LONGSHORT-002 status transitions `approved (execution-pending)` → `closed`. The §10.4 captured-day supporting deliverable is not superseded but deferred per ADR-006 — the deferral disposition is recorded as the FP-006 interpretation of the §10.4 deliverable language, not a spec amendment. Phase 7 FP opens the work registered as DW-058 / DW-059 / DW-060 / DW-061 / DW-062. |

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

### Sub-step implementation continuation (2026-05-25) — Sub-step 6.8 phase 1.5: Test body implementation (ACT-093)

**Type:** Sub-step implementation continuation within FP-006; plan v13.4 unchanged; sub-step 6.8 ticks at ADR-002 follow-on

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged) |
| Section IDs Created | None |
| Decision IDs Affected | None |
| What Changed | ACT-093 replaces 7 skeleton test bodies in multi-pending-harness.ts with verbatim live-Alpaca implementations. ACT-092 build-phase landed the scaffold (pre-flight + cleanup + JSON output shape + CLI + tests); ACT-093 lands the actual empirical instrument. Each test honors safety guardrails (1-share cap; paper-URL only; per-test cleanup). |
| Why | ACT-092 prompt left test bodies as skeletons by intention (per-test descriptions in prompt body were narrative, not verbatim code). Operator ran harness post-ACT-092 and got 7 inconclusive results — expected for skeletons. ACT-093 closes the gap with verbatim implementations so the operator's next harness run produces real ADR-002-deciding evidence. |
| What Stayed | All DECs unchanged. ADRs unchanged (ADR-002 placeholder remains until next follow-on). All other modules frozen. Plan version unchanged. Master-plan 6.8 unticked. |
| What Was Added | 7 verbatim test bodies; ACT-093 entry; this plan-changelog entry. |
| What Was Removed | 7 skeleton stub bodies (replaced). |
| Approval Status | Approved per supervisor self-acknowledgment of ACT-092 prompt ambiguity. |
| Supersession Links | None — ACT-093 completes ACT-092's build phase work; not supersession. |

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


### Sub-step closure (2026-05-25) — Sub-step 6.8: ADR-002 Multi-Pending Validation + v0 Fallback Adoption

**Type:** Sub-step closure within FP-006; plan v13.4 unchanged

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged) |
| Section IDs Created | None |
| Decision IDs Affected | None (DECs unchanged); ADR-002 populated from placeholder to Accepted |
| What Changed | FP-006 sub-step 6.8 closed: ADR-002 populated with empirical determination from 2026-05-25 02:46 UTC harness run against Alpaca paper account. v0 fallback per §8.6.2 adopted for v1 short-stop Phase 1 timeout handling. §8.6.1.1 parallel-order mechanism NOT operational on Alpaca paper due to wash-trade detector rejection. |
| Why | §10.4 Phase 0B supporting deliverable + DEC-036 clause (6) required Phase 0B-level empirical validation of Alpaca multi-pending behavior before Phase 0B exit. Harness produced dispositive evidence (HTTP 403 + Alpaca code 40310000 wash-trade rejection on every opposite-side parallel-order test). Per §8.6.1.1 verbatim v0 fallback condition: "if Alpaca multi-pending-order support is unclean, v0 fallback... applies." Determination committed before Phase 0B exit per §10.4 verbatim requirement. |
| What Stayed | All DECs unchanged. §8.6.1.1 spec text unchanged (canonical; ADR documents determination, not spec amendment). §8.6.2 v0 fallback adopted verbatim. All code modules frozen. Plan version unchanged. ADR-001 / ADR-003 / ADR-004 / ADR-005 unchanged. |
| What Was Added | ADR-002 populated (placeholder → Accepted status); ADR-002-harness-output-2026-05-25.json evidence appendix; ACT-094 entry; master-plan 6.8 tick; this changelog entry. |
| What Was Removed | None — ADR-002 placeholder content superseded by full content; placeholder commitments preserved as historical context within the new ADR. |
| Approval Status | Approved per operator Path-A decision (accept wash-trade 403 as dispositive; do not chase cleaner re-runs that don't change determination). |
| Supersession Links | ADR-002 placeholder superseded by ADR-002 Accepted. |


### Sub-step closure (2026-05-25) — Sub-step 6.9 + Gate 6.9: Phase 0B Exit Gate Disposition via §10.4 Captured-Day Deferral

**Type:** Sub-step + gate closure within FP-006; plan v13.4 unchanged at this ACT (version bump deferred to 6.10 FP-closure)

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged at this ACT; v13.4 → v13.5 bump scheduled for 6.10 FP-closure) |
| Section IDs Created | ADR-006-phase-0b-captured-day-deferral.md |
| Decision IDs Affected | None (DECs unchanged); ADR-006 introduced |
| What Changed | Sub-step 6.9 closed via formal deferral of §10.4 "Captured Day 1" supporting deliverable to Phase 7 (rather than attempting to produce captured Day 1 in Phase 0B). ADR-006 records the deferral with: (a) the 4 structural prerequisites (DW-058/059/060/061 registered); (b) explicit vacuous-quietness-signal acknowledgment; (c) Option A/B/C evaluation with Option B selected; (d) reconsideration triggers. Gate 6.9 closes on this deferral basis, not on §11.0.11 firing-analysis (which is moved to Phase 7). |
| Why | §10.4 priority deliverables (1–3) — replay framework, A1 baseline, Alpaca paper — are operational at FP-006 closure. The supporting deliverable "Captured Day 1" requires real fetcher wiring + capture writer + cron scheduling + full RTH run; all four are Phase-7-grade operational infrastructure rather than Phase-0B foundation. Producing Captured Day 1 in Phase 0B then sitting on a stale fixture pending Phase 7 entry uses operator-hours on evidence that decays. Constitution Rule 8 supersession documented-reason clause satisfied via ADR-006. Phantom-completion risk (Option C minimal-demo) explicitly rejected. |
| What Stayed | All DECs unchanged. ADR-001/002/003/004/005 unchanged. §10.4 spec text unchanged. §11.0.11 spec text unchanged. All code modules frozen. Plan version unchanged (v13.4). system-state version unchanged. No migrations / no DB writes. Edge functions unchanged (mocks remain mocks; rewiring per DW-058 is Phase 7). |
| What Was Added | ADR-006 new at design-source/; 4 DW entries (DW-058..DW-061); ACT-095 entry; master-plan 6.9 + Gate 6.9 ticks; this changelog entry. |
| What Was Removed | None — additive. §10.4 "Captured Day 1" wording preserved canonically; ADR-006 records FP-006 interpretation, not spec amendment. |
| Approval Status | Approved per operator option-evaluation 2026-05-25 chat record (Option B selected over Option A decompose / Option C minimal-demo). |
| Supersession Links | None at spec level; ADR-006 supersedes the implicit assumption that "Captured Day 1" lands in Phase 0B (per the §10.4 text) and records the deferral disposition; Phase 7 FP closes the open loop. |

### Audit reconciliation (2026-05-25) — ACT-097: DW-058 + DW-059 Amendments + DW-062 Creation

**Type:** Governance reconciliation within FP-006; plan v13.4 unchanged

| Field | Value |
|---|---|
| Plan Version | v13.4 (unchanged) |
| Section IDs Created | DW-062 |
| Decision IDs Affected | DW-058 + DW-059 amended (Required Tests for Closure expanded; Blocking Dependencies amended on DW-058); ADR-002 evidence completeness addendum appended (Decision + Consequences sections unchanged) |
| What Changed | Operator-requested Alpaca integration audit (ACT-096 Phase 1 = Lovable independent investigation; this ACT-097 = supervisor cross-check + governance amendments) produced 11 reconciled findings. Lovable's report canonical; supervisor confirmed 5/5 prior findings + verified 6 additional findings via direct repo inspection. DW-058 Required Tests for Closure expanded with B1-B11 remediation list (item B10 split to DW-062); halt-feed external data source registered as Blocking Dependency. DW-059 Required Tests for Closure expanded with typed-null preservation requirements. DW-062 created for ADR-002 Test 2 RTH re-run evidence gap. ADR-002 received evidence-completeness addendum. |
| Why | Operator surfaced the question "are we creating phantom-trade risks or drifting from plan?" ahead of FP-006 closure. Audit confirmed: (1) no production code path wires Alpaca fetchers today (matches DW-058 premise); (2) but 11 latent defects exist in the fetcher implementations that would create phantom-non-halt + silent-NaN-acceptance + silent-short-disable failure modes at Phase 7 wiring time. Locking these into DW-058 + DW-059 Required Tests for Closure ensures Phase 7 fetcher-wiring closes only when remediation is complete + verified. The halt-feed wrong-endpoint finding is the most operationally severe; promoting it from Phase-7-internal-amendment to Phase-7-blocking ensures live-order code paths cannot wire before real-time halt status is sourced. |
| What Stayed | All DECs unchanged. §11.0.3 / §11.0.7 / DEC-034 / DEC-036 spec text unchanged. ADR-001/003/004/005/006 unchanged (ADR-002 received append-only addendum; Decision section unchanged). All code modules frozen. Plan v13.4 unchanged. system-state version unchanged. Master-plan untouched. DW-060 / DW-061 untouched. |
| What Was Added | DW-058 + DW-059 field amendments; DW-062 new entry; ADR-002 evidence completeness addendum section; ACT-097 entry; this changelog entry. Defect class #13 added to supervisor self-defect log (in ACT-097 entry text). |
| What Was Removed | None — append-only + targeted-field amendments. |
| Approval Status | Approved per operator audit request + Lovable independent investigation ACT-096 Phase 1 (canonical findings source) + supervisor cross-check confirmation. §7.4 dual-investigative-track protocol exercised end-to-end without manufactured consensus. |
| Supersession Links | None at spec or DEC level. DW-058 + DW-059 field versions superseded by amended versions in this commit (prior versions preserved in git history; current text canonical). |

### v13.7 → v13.8 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. Retroactive governance reconciliation closing FP-005 + FP-006 entry-format drift surfaced at ACT-100 / C.1 §21.10 pre-flight. Path 2-extended-refined per operator calibration.

| Field | Value |
|---|---|
| Plan Version | v13.7 → v13.8 |
| Section IDs Created | None |
| Section IDs Closed | None (FP-005 PLAN-TRADING-001-LONGSHORT-001 + FP-006 PLAN-TRADING-001-LONGSHORT-002 master-plan sections already correctly attest `closed`; only the feature-proposals.md entry-level Status fields were drift-stale) |
| FP IDs Created | None (FP-005 + FP-006 corrected; FP-001/002/003/004/007 unchanged) |
| Decision IDs Affected | None (DEC-030/031/032 etc. preserved verbatim) |
| What Changed | FP-005 entry Status corrected from `proposed` to `closed (2026-05-21 — closure document; closure ACT-072; closure SHA `1358904`)`; `Closure SHA` field added. FP-006 entry Status corrected from `Approved (governance-authored; execution-pending)` to `closed (2026-05-25 — closure document; closure ACT-098; closure SHA `13fce9cd`)`; `Closure SHA` field added. INC-22 entry added (framing β process-defect; defect classes #22-#26 forward-binding). INC-21 entry received one-line corroborating-evidence note. ACT-101 entry added. system-state.md version v13.7 → v13.8. Supervisor-instructions v0.6 → v0.6.1 amendment delivered as operator-side artifact (§21.10 three-sub-case expansion). |
| Why | ACT-100 / C.1 §21.10 pre-flight for FP-008 Phase 1 scoping surfaced that FP-005 + FP-006 entries in feature-proposals.md had stale Status fields and were missing Closure SHA fields (pre-FP-007-template convention). The §21.10 (b) Status verbatim citation requirement couldn't be satisfied truthfully without correcting the drift. Path 2-extended-refined adopted per operator calibration: fix FP-005 + FP-006 only; FP-001/002/003 out of scope (orthogonal to longshort prerequisite chain); FP-004 left as-is (pattern-type FP; `approved` factually correct). Supervisor-instructions v0.6.1 inline per operator calibration: defer would guarantee future §21.10 STOP and prose-creep. INC-22 framing β per operator calibration: defect #26 structurally isomorphic to defect #21; β strictly dominant on benefit. |
| What Stayed | All DECs unchanged. All ADRs unchanged. FP-001 / FP-002 / FP-003 / FP-004 / FP-007 entries preserved verbatim. PLAN-TRADING-001-LONGSHORT-001 + PLAN-TRADING-001-LONGSHORT-002 master-plan sections preserved verbatim (already correctly attest `closed`). PLAN-CI-001-BOOTSTRAP-001 preserved verbatim. FP-005 + FP-006 closure documents preserved verbatim per §22.8.3 grandfathering. Module status remains `phase-0b-validated`. DW register unchanged. ACT-072 + ACT-098 + ACT-099 + ACT-100 closure attestations preserved verbatim. |
| What Was Added | FP-005 + FP-006 entry Status field corrections + Closure SHA field additions; INC-22 entry; INC-21 corroborating-evidence one-line note; ACT-101 entry; this changelog entry; system-state.md version bump v13.7 → v13.8; supervisor-instructions v0.6.1 (operator-side). Defect classes #22 + #23 + #24 + #25 + #26 logged forward in supervisor self-defect log. |
| What Was Removed | None — additive only. (Stale Status text in FP-005 + FP-006 entries is replaced, not removed — the replacement preserves the audit trail by citing closure document path + ACT + SHA, providing strictly more information than the stale text.) |
| Approval Status | Approved per operator standing institutional-grade authority; Path 2-extended-refined + inline v0.6.1 + INC-22 framing β all operator-calibrated 2026-05-25. |
| Supersession Links | N/A — additive; no approved sections superseded. (FP-005 + FP-006 entry corrections are within-entry field-level reconciliations, not section drops or rewrites.) |

### v13.8 → v13.9 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. New plan-section creation (PLAN-TRADING-001-LONGSHORT-003) under Constitution Rule 8 5-point procedure. FP-008 governance-authoring ACT-102.

| Field | Value |
|---|---|
| Plan Version | v13.8 → v13.9 |
| Section IDs Created | `PLAN-TRADING-001-LONGSHORT-003` (Long-Short Strategy Module Phase 1: Universe Ingestion and Management; continues the PLAN-TRADING-001-LONGSHORT-NNN family; Status `approved (execution-pending)`; Feature Proposal FP-008; 13 sub-steps + closure; 8 exit gates per CROSSWIND v0.9 §10.5) |
| Section IDs Closed | None (PLAN-TRADING-001-LONGSHORT-002 / FP-006 + PLAN-CI-001-BOOTSTRAP-001 / FP-007 + PLAN-TRADING-001-LONGSHORT-001 / FP-005 + PLAN-TRADING-001 / FP-004 all preserved verbatim per §22.8.3 grandfathering) |
| FP IDs Created | FP-008 (governance-authored at this ACT; Status `approved (execution-pending)`; Plan Section PLAN-TRADING-001-LONGSHORT-003; scope per CROSSWIND v0.9 §10.5 + §3) |
| Decision IDs Affected | None at this ACT (DEC-038 + DEC-038.1 forward-referenced; to be authored during FP-008 sub-step 8.0a). DEC-030 through DEC-037 preserved verbatim. |
| What Changed | FP-008 entry created in feature-proposals.md (slotted after FP-007 entry; 12-deliverable scope per §10.5; 13-sub-step decomposition; 7-row R1-R7 risk register; 11-item Out-of-Scope list; forward-references DEC-038 + DEC-038.1 + ADR-007 + MIG-048 + MIG-049). New plan section PLAN-TRADING-001-LONGSHORT-003 in master-plan.md (continues PLAN-TRADING-001-LONGSHORT-NNN sequence; 8 exit gates per §10.5 verbatim; kill condition per §10.5; 13-sub-step inventory). ACT-102 entry in action-tracker.md. Plan version v13.8 → v13.9. system-state.md current_plan_version + approved_plan_baseline + last_updated. |
| Why | Phase 0 fully closed (FP-005 + FP-006 + FP-007 all `closed`; module status `phase-0b-validated`; governance loose-ends retired at ACT-100 / C.1 + ACT-101 / C.2-lite). Per CROSSWIND v0.9 §10.5: Phase 1 (Universe ingestion and management) is the natural successor to Phase 0B and opens as a separate execution-tier scope. Per DEC-031 strategy-module pattern + DEC-032 + the FP-005 / FP-006 / FP-007 per-phase FP wrapper precedent: each phase gets its own FP entry + plan section + sub-step decomposition. FP-008 is the FP wrapper for Phase 1 work; this ACT authors the wrapper; sub-step execution opens at sub-step 8.0a per FP-006 precedent. Per §21.10 v0.6.1 pre-flight: all four prerequisite-chain FPs (FP-004 + FP-005 + FP-006 + FP-007) fully cite-anchored under their respective sub-cases; recursion walked to fixed-point; first FP-execution prompt under v0.6.1 discipline exercised end-to-end without STOP. |
| What Stayed | All DECs unchanged. All ADRs unchanged. FP-001 through FP-007 entries preserved verbatim. PLAN-TRADING-001 / PLAN-TRADING-001-LONGSHORT-001 / PLAN-TRADING-001-LONGSHORT-002 / PLAN-CI-001-BOOTSTRAP-001 / PLAN-AUTH-001-A through PLAN-AUTH-001-D all preserved verbatim. All closure documents preserved verbatim per §22.8.3 grandfathering. Module status remains `phase-0b-validated` (transitions to `phase-1-validated` only at FP-008 closure / sub-step 8.13). DW register unchanged. Supervisor-instructions v0.6.1 unchanged (no amendment at this ACT). 9-gate strong-evidence.yml workflow + 6 enforcement scripts + docs/banned-patterns.md all preserved and active (guarding every future FP-008 PR per ADR-003). |
| What Was Added | FP-008 entry; PLAN-TRADING-001-LONGSHORT-003 section; ACT-102 entry; this changelog entry; system-state.md version bump v13.8 → v13.9. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator standing institutional-grade authority. §21.10 v0.6.1 pre-flight chain fully cite-anchored before draft. CROSSWIND v0.9 §10.5 + §3 + §11.0.5 + §11.0.7 #10 + §11.3 + §11.4 + §12.4 cited verbatim as scope anchors. |
| Supersession Links | N/A — additive; no approved sections superseded. |

### v13.11 → v13.12 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. Reference-index reconciliation pass closing defect class #31 (reference-index update omission from ACT-104). ACT-105.

| Field | Value |
|---|---|
| Plan Version | v13.11 → v13.12 |
| Section IDs Created | None |
| Section IDs Closed | None (master-plan PLAN-TRADING-001-LONGSHORT-003 sub-step 8.1 checkbox already ticked at ACT-104; AC-04 + AC-05 evidence captured at ACT-104) |
| FP IDs Created | None (FP-008 entry preserved verbatim; Status remains `execution-in-progress`) |
| Decision IDs Affected | None (DEC-038/038.1 preserved verbatim; no in-cycle amendments) |
| What Changed | function-index.md gained 5 entries for FP-008 sub-step 8.1 code paths (Polygon fetcher + iShares fetcher + shared interface layer). env-var-index.md gained POLYGON_API_KEY entry (Pre-production status; provisioning required before sub-step 8.4). docs/04-modules/longshort/longshort.md gained Universe Component (Phase 1 — In-Progress) sub-section under Phase Scope. ACT-105 entry in action-tracker.md. Plan version v13.11 → v13.12. system-state.md `current_plan_version` + `approved_plan_baseline` bumped. |
| Why | ACT-104 (FP-008 sub-step 8.1 code drop) landed three divergences from prompt scope per §22.5 verification: D1 (flat folder accepted; sub-step 8.2 relocates), D2 (edge-function interface tier accepted as improvement), D3 (reference-index update omission requiring Path α follow-up). ACT-105 lands the D3 fix as forward-commit reconciliation per §22.8.5(d) immutable-forward-only history. Defect class #31 closed by mitigation. Forward-binding: future code-touching sub-step prompts list reference-index updates explicitly + Lovable surface confirms BEFORE commit. |
| What Stayed | ACT-104 code drop preserved verbatim (zero changes under `src/features/longshort/services/universe/` or `supabase/functions/_shared/longshort-universe-interfaces.ts`). ACT-104 entry preserved verbatim. DEC-038/038.1 preserved verbatim. FP-008 entry preserved verbatim (Status `execution-in-progress` unchanged). All FP-001..FP-007 entries preserved. All other plan sections preserved (PLAN-TRADING-001 / PLAN-TRADING-001-LONGSHORT-001/002/003 / PLAN-CI-001-BOOTSTRAP-001 / PLAN-AUTH-001-A..D). All closure documents preserved. Module status `phase-0b-validated` unchanged. DW register unchanged. Supervisor-instructions v0.6.1 unchanged. 9-gate strong-evidence.yml workflow + 6 enforcement scripts + docs/banned-patterns.md all preserved. dependency-map.md NOT touched (file doesn't exist; over-specification in FP-008 Reference Impact field tolerated). master-plan.md PLAN-TRADING-001-LONGSHORT-003 section NOT touched (sub-step 8.1 already ticked at ACT-104). |
| What Was Added | 5 function-index.md entries; 1 env-var-index.md entry; 1 docs/04-modules/longshort/longshort.md sub-section; ACT-105 entry; this changelog entry; system-state version bump v13.11 → v13.12. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator standing institutional-grade authority + Path α explicit acknowledgment in ACT-104 §22.5 disposition exchange. §21.10 v0.6.1 5-FP pre-flight chain verified. |
| Supersession Links | N/A — additive; no approved sections superseded. ACT-104's three divergences (D1/D2/D3) are part of the audit trail; ACT-105 patches forward, not retroactively. |

### v13.9 → v13.10 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. FP-008 sub-step 8.0a / Gate 8.0 closure: DEC-038 + DEC-038.1 ratification + 38-AC matrix authoring within already-approved PLAN-TRADING-001-LONGSHORT-003 section. ACT-103.

| Field | Value |
|---|---|
| Plan Version | v13.9 → v13.10 |
| Section IDs Created | None (PLAN-TRADING-001-LONGSHORT-003 created at v13.9; this version UPDATES it with AC matrix + Gate 8.0 tick) |
| Section IDs Closed | None (Gate 8.0 internal milestone; PLAN-TRADING-001-LONGSHORT-003 overall section remains `approved (execution-pending)` until sub-step 8.13 closure) |
| FP IDs Created | None (FP-008 created at v13.9; this version UPDATES its Status field to `execution-in-progress` and populates its Decision IDs field with ratified citations) |
| Decision IDs Affected | **DEC-038** RATIFIED (Phase 1 universe-component invariants; status `active`). **DEC-038.1** RATIFIED (Phase 1 universe-component architecture; status `active`). DEC-030 through DEC-037 preserved verbatim. |
| What Changed | DEC-038 + DEC-038.1 entries added in approved-decisions.md (8 clauses each; both `active`). PLAN-TRADING-001-LONGSHORT-003 master-plan section updated: per-sub-step AC matrix (AC-01 through AC-38) inserted; Gate 8.0 / sub-step 8.0a checkbox ticked. FP-008 entry Status field updated from `approved (execution-pending)` to `execution-in-progress`; Decision IDs field updated to ratified citation. ACT-103 entry in action-tracker.md. Plan version v13.9 → v13.10. system-state.md current_plan_version + approved_plan_baseline. |
| Why | FP-008 sub-step 8.0a / Gate 8.0 closure mirrors FP-006 Gate 6.0 / ACT-074 precedent: prerequisites + DEC ratifications + AC matrix authoring as the first execution-tier sub-step opening the per-sub-step execution chain. Per CROSSWIND v0.9 §10.5: Phase 1 invariants + architecture decisions must be locked before sub-step 8.1+ implementation begins. Per §21.10 v0.6.1 + §22.5.1 + §22.8.4 disciplines: 5-FP pre-flight chain verified before draft; no live-DB at this governance-authoring sub-step; capability-gap surface clean. |
| What Stayed | All FP-001 through FP-007 entries preserved verbatim. FP-008 entry's other fields preserved verbatim — only Status + Decision IDs field updates. All DECs 030-037 preserved verbatim. All ADRs unchanged. All other plan sections preserved verbatim. All closure documents preserved verbatim. Module status remains `phase-0b-validated`. DW register unchanged. Supervisor-instructions v0.6.1 unchanged. 9-gate strong-evidence.yml workflow + 6 enforcement scripts + docs/banned-patterns.md all preserved and active. |
| What Was Added | DEC-038 entry; DEC-038.1 entry; PLAN-TRADING-001-LONGSHORT-003 AC matrix (38 ACs); Gate 8.0 + sub-step 8.0a checkbox tick; FP-008 entry Status + Decision IDs field updates; ACT-103 entry; this changelog entry; system-state.md version bump v13.9 → v13.10. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator standing institutional-grade authority. §21.10 v0.6.1 5-FP pre-flight chain fully cite-anchored. CROSSWIND v0.9 §10.5 + §3 + §11.0.5 + §11.0.7 #10 + §11.3 cited verbatim as DEC-038 substantive anchors. |
| Supersession Links | N/A — additive; no approved sections superseded. |

- [Master Plan](master-plan.md)
- [Approved Decisions](approved-decisions.md)
- [Plan Review Log](plan-review-log.md)

### v13.10 → v13.11 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. FP-008 sub-step 8.1 — Constituent ingestion (Polygon primary + iShares secondary). First code-touching sub-step of FP-008. ACT-104.

| Field | Value |
|---|---|
| Plan Version | v13.10 → v13.11 |
| Section IDs Created | None (PLAN-TRADING-001-LONGSHORT-003 created at v13.9; this version ticks sub-step 8.1 within it) |
| Section IDs Closed | None (sub-step 8.1 closed; Gate 8.1 remains open pending sub-steps 8.2-8.5) |
| FP IDs Created | None (FP-008 Status field annotated with sub-step 8.1 closure note) |
| Decision IDs Affected | None (DEC-038 + DEC-038.1 ratified at v13.10 govern this sub-step verbatim; no amendment) |
| What Changed | NEW `supabase/functions/_shared/longshort-universe-interfaces.ts` (interfaces + types + error class). NEW `src/features/longshort/services/universe/polygon-constituent-fetcher.ts` (PRIMARY, AC-04). NEW `src/features/longshort/services/universe/ishares-constituent-fetcher.ts` (SECONDARY, AC-05; iShares IVV/IJH per Option B). NEW companion Deno `_test.ts` files (14 tests total). Master-plan sub-step 8.1 checkbox ticked. FP-008 Status field augmented with sub-step 8.1 closure annotation. ACT-104 in action-tracker.md. system-state.md `current_plan_version` + `approved_plan_baseline` bumped. |
| Why | First code-touching FP-008 sub-step per Gate 8.1 (sub-steps 8.1-8.5 per §10.5 deliverables 1-5). Establishes the constituent-ingestion data-flow foundation; sub-steps 8.2 (filters) / 8.3 (hard exclusions) / 8.4 (quarterly refresh) / 8.5 (continuous refresh) all consume the `ConstituentFetcher` contract landed here. Option B (iShares IVV/IJH) selected for the secondary cross-check source per Lovable Finding 3 evaluation + operator Route 1 approval: paid S&P direct rejected as cost-prohibitive; Wikipedia rejected as unauthoritative; iShares ETF holdings selected as free + machine-readable + daily-refreshed. Resolved Findings 1+2 in-line per operator: (1a) `Promise<T \| null>` typed-absence per §2 axiom 3 — no Optional<T> library; (2a) `as_of: Date` parameter — no Clock interface mirror (the parameter idiom is already established by `BrokerPositionFetcher` et al. at FP-006). |
| What Stayed | All DECs / ADRs / prior FP entries / closure documents preserved verbatim. Module status remains `phase-0b-validated` (transitions only at sub-step 8.13 closure). No live-DB / DB schema / RPCs / RLS / migrations / permissions / ENUMs / job_registry touched (sub-step is pure module-side code). `universe.enabled=false` flag (deferred to sub-step 8.6 MIG-051) keeps fetchers as dead code until quarterly-refresh job at sub-step 8.4 wires them. 9-gate `strong-evidence.yml` workflow + 6 enforcement scripts + `docs/banned-patterns.md` from FP-007 remain active; both new fetchers comply (zero wall-clock reads; zero silent sentinels; HTTP fetch injectable). |
| What Was Added | 5 new code files (1 interface module + 2 fetcher implementations + 2 Deno test files); ACT-104 entry; this changelog entry; master-plan sub-step 8.1 tick; FP-008 Status annotation; system-state version bump. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator Route 1 (1a + 2a + Option B) at FP-008 sub-step 8.1 execution prompt; no DEC amendment cycle invoked; no supervisor review cycle invoked. |
| Supersession Links | N/A — additive; no approved sections superseded. |

### v13.12 → v13.13 (2026-05-25)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. FP-008 sub-step 8.2 — Universe enrichment layer + §3.2 six-filter pipeline (Option β). Second code-touching sub-step of FP-008. ACT-106.

| Field | Value |
|---|---|
| Plan Version | v13.12 → v13.13 |
| Section IDs Created | None |
| Section IDs Closed | None (sub-step 8.2 closed; Gate 8.1 remains open pending sub-steps 8.3-8.5; PLAN-TRADING-001-LONGSHORT-003 stays `approved (execution-pending)` until sub-step 8.13) |
| FP IDs Created | None (FP-008 Status unchanged at `execution-in-progress`) |
| Decision IDs Affected | None — DEC-038 + DEC-038.1 preserved verbatim. The `enrichment/` sub-folder extends DEC-038.1 clause (1) by accommodation per ACT-106 Guardrail 1; the "with sub-modules:" enumeration is non-exhaustive and naturally accommodates a sibling enrichment tier. No DEC amendment authored. |
| What Changed | NEW `src/features/longshort/services/universe/enrichment/types.ts` (`EnrichedConstituent` extends `UniverseConstituent`; `UniverseEnrichmentFetcher` interface). NEW `src/features/longshort/services/universe/enrichment/polygon-enrichment-fetcher.ts` (`PolygonEnrichmentFetcher implements UniverseEnrichmentFetcher`; ticker-details + daily-aggregates Polygon endpoints; AC-06 path). NEW `src/features/longshort/services/universe/filters/types.ts` (`FILTER_THRESHOLDS` LOCKED constants; `FilterRejectionReason`; `FilterResult`). NEW `src/features/longshort/services/universe/filters/apply-filters.ts` (`applyFilters()` orchestrator; six §3.2 filters). NEW companion Deno `_test.ts` files (21 tests total — 10 enrichment + 11 filter). UPDATE `docs/07-reference/function-index.md` — 3 APPEND entries (enrichment fetcher + filter orchestrator + shared types). UPDATE `docs/04-modules/longshort/longshort.md` — Universe Component sub-section status updated from sub-step 8.1 close to sub-step 8.2 close; sub-modules list reflects `enrichment/` + `filters/` landed. UPDATE `docs/08-planning/master-plan.md` — sub-step 8.2 checkbox ticked. NEW ACT-106 entry in action-tracker.md. UPDATE system-state.md `current_plan_version` + `approved_plan_baseline` v13.12 → v13.13. |
| Why | FP-008 sub-step 8.2 / AC-06 / §3.2 LOCKED filter implementation per Option β operator decision at pre-flight. Enrichment tier is the substantive load: ACT-104 `UniverseConstituent` carries membership but NOT filter-input fields (market_cap / avg_daily_dollar_volume / share_price / listing_date / asset class). Option β fetches them via a dedicated enrichment tier (vs. inline-in-filter); mirrors FP-006 fetcher-per-purpose precedent. Guardrails baked in: (1) `enrichment/` extends DEC-038.1 clause (1) by accommodation, no DEC amendment; (2) iShares stays unenriched — §3.2 filters operate on Polygon path only; iShares is cross-check at sub-step 8.8 per DEC-038 clause (2). |
| What Stayed | All FP-001 through FP-008 entries preserved (FP-008 Status `execution-in-progress` unchanged). All DECs 030-038.1 preserved verbatim. All ADRs unchanged. All other plan sections preserved verbatim. All closure documents preserved. Module status `longshort: phase-0b-validated` preserved. DW register unchanged. Supervisor-instructions unchanged. 9-gate strong-evidence.yml + 6 enforcement scripts + docs/banned-patterns.md preserved. ACT-104 code paths preserved verbatim (zero modifications to constituent fetchers / their tests / `_shared/longshort-universe-interfaces.ts`). ACT-105 reference-index reconciliation preserved (POLYGON_API_KEY env-var registration intact; this changelog explicitly notes env-var-index.md NO-CHANGE). |
| What Was Added | enrichment + filters sub-folders + 6 new code+test files + 3 function-index entries + module-doc status update + sub-step 8.2 tick + ACT-106 entry + this changelog entry + system-state version bump. |
| What Was Removed | None — additive only. |
| Approval Status | Approved per operator standing institutional-grade authority + v0.6.2 §22.3 (a)/(b)/(c)/(d) strengthening discipline applied at draft time + Option β + Guardrails 1+2 confirmed at pre-flight. |
| Supersession Links | N/A — additive; no approved sections superseded. |

- [Master Plan](master-plan.md)
- [Action Tracker](../06-tracking/action-tracker.md)

## v13.14 — 2026-05-25 — FP-008 Sub-Step 8.3 (ACT-107)

| Field | Value |
|-------|-------|
| Change Type | Implementation (additive code + paired structural relocation) |
| Scope | §3.3 hard-exclusion infrastructure (5 active rules + 3 N/A v1 stubs + orchestrator + 2 data-source fetchers + shared interfaces); ACT-104 flat-folder relocation to `constituent-ingestion/` sub-folder. |
| Surfaces resolved | Surface 1 → 1A Polygon earnings (reuses `POLYGON_API_KEY`); Surface 2 → 2A FINRA short-interest (public CSV, no env var); Surface 3 → 3β deferred-placeholder + DW-063 cross-referencing R4 + DW-058 B2. |
| Guardrails | G1 honored (`hard-exclusions/` directly enumerated in DEC-038.1 clause (1)); G2 honored (rules operate on Polygon-enriched output; iShares not wired into hard-exclusion data flow). |
| v0.6.2 §22.3 discipline | (a) reference-index updates same-PR; (b) idiom-grep clean; (c) minimum-coupling (stateless rules, no clock injection, no reconcile coupling, no DB writes); (d) plan-version bump per Rule 10. |
| Approval | Operator approval 2026-05-25: "1A, 2A, 3β. All three Lovable recommendations approved." |
| Supersession | N/A — additive. |

## v13.15 — 2026-05-25 — FP-008 Sub-Step 8.4 (ACT-108)

| Field | Value |
|-------|-------|
| Change Type | Implementation (additive code + first live-DB landing under FP-008 + trading-days relocation) |
| Scope | §3.4 quarterly atomic refresh job: orchestrator + types + edge function `longshort-universe-quarterly-refresh` + MIG-048 (`universe_refresh_log` table + `longshort.universe.quarterly_refresh` job_registry seed enabled=false) + `trading-days.ts` relocation `hard-exclusions/ → shared/` with quarterly arithmetic helpers appended. |
| Surfaces resolved | Surface 1 → Option α MIG-049/050/051/052 renumbering (MIG-048 slot consumed at ACT-108 by `universe_refresh_log`); Surface 2 → live `supabaseAdmin` persister adopted at landing; Surface 3 → relocate `trading-days.ts` to `shared/` (second-consumer threshold). |
| Guardrails | G1 honored (`refresh-jobs/` directly enumerated in DEC-038.1 clause (1)); G2 honored (Polygon constituents are the enrichment input; iShares is cross-check-only). |
| v0.6.2 §22.3 discipline | (a) reference indices updated same-PR (function-index.md + database-migration-ledger.md + event-index.md + longshort.md + feature-proposals.md Reference Impact); (b) idiom-grep clean; (c) DEC-023 envelope via `createHandler` per T7; `writeStrategyAuditEvent` exclusively (DEC-033 v4.1 / T4); start+finalize atomicity contract for R3; (d) plan v13.14 → v13.15 per Rule 10. |
| Live-DB evidence | `supabase--read_query` confirmed `job_registry` row `longshort.universe.quarterly_refresh` `enabled=false, status='registered'`. §22.5.1 binding standard satisfied. |
| Defect class surfaced | #35 — supervisor §22.5.2 over-application when no capability mismatch exists; codification target v0.6.3 §22.3 (f); logged forward alongside #34, no in-cycle correction. |
| Approval | Operator approval 2026-05-25: "1a 2a go" + post-landing continuation directive `proceed` to complete items 2-5 as ACT-108 (single transaction, not separate ACT). |
| Supersession | N/A — additive. |

### v13.16 — 2026-05-25 — FP-008 Sub-Step 8.5 Closure (ACT-109)

| Field | Value |
|-------|-------|
| Change Type | Implementation (additive code + MIG-049 seed-only live-DB landing under FP-008) |
| Scope | §3.4 continuous hard-exclusion refresh: one-dispatcher edge function `longshort-universe-hard-exclusion-refresh` + per-rule orchestrator at `refresh-jobs/` (sibling to ACT-108 quarterly orchestrator per DEC-038.1 clause (1); in-cycle Item-A reconciliation at ACT-109 — see ACT-109 evidence clause (o)) + MIG-049 seeding 4 `job_registry` rows for `longshort.universe.hard_exclusion_refresh_{3_3a,3_3b,3_3c,3_3e}` all `enabled=false`; `isShortInterestTriggerDay` appended to `shared/trading-days.ts`; 12 audit events registered. |
| Surfaces resolved | Surface 1 → Option (a) one-dispatcher (operator selection `1a`); Surface 2 → Option α single-row + handler-internal cadence (operator selection `2α`); Surface 0 (pre-flight discovery) → Option α stub-input (`{tickers?: string[]}` body; `universe_refresh_log` confirmed to lack eligible-constituent persistence). |
| Guardrails | G1 honored (refresh-jobs/ directly enumerated in DEC-038.1 clause (1)); G2 N/A (no iShares path touched). |
| v0.6.2 §22.3 discipline | (a) reference indices updated same-PR (function-index + event-index + database-migration-ledger + longshort.md + master-plan); (b) idiom-grep clean; (c) one-dispatcher minimum-coupling via DEC-023 envelope; orchestrator stateless + parameterized on `as_of` + universe; (d) plan v13.15 → v13.16 per Rule 10. |
| Live-DB evidence | `supabase--read_query` confirmed 4 `job_registry` rows seeded `enabled=false, status='registered'`. §22.5.1 binding standard satisfied. §22.5.2 NOT triggered (no capability mismatch). |
| Defect class surfaced | #36 — supervisor Surface-N pre-resolution without schema-grep verification; codification target v0.6.3 §22.3 (g); logged forward, no in-cycle correction. |
| Approval | Operator approval 2026-05-25: "1a 2α go" → "α go" (Surface 0). |
| Supersession | N/A — additive. database-migration-ledger MIG-049-052 renumbering table corrected: hard_exclusion_refresh seeds took MIG-049 slot ahead of sub-step 8.6; universe_membership shifts MIG-049 → MIG-050; hard_exclusions MIG-050 → MIG-051. |

### v13.17 — 2026-05-25 — FP-008 Sub-Step 8.6 Closure (ACT-110)

| Field | Value |
|-------|-------|
| Change Type | Implementation (3 atomic schema migrations + reference-index reconciliation + AC text amendments under FP-008) |
| Scope | 3 new migrations: **MIG-050** `universe_membership` table (Surface 1 Option A two-boolean shape mirroring `EligibleConstituent`; CHECK `(long_eligible OR short_eligible)`; FK to `universe_refresh_log` ON DELETE RESTRICT; operator-scoped RLS; 3 indexes); **MIG-051** `hard_exclusions` table (PK `(operator_id, ticker, as_of_date)` per DEC-038.1 clause (7) — rule_id NOT in PK; `firing_rules text[]` + `firing_reasons jsonb` + nullable `refresh_id` FK ON DELETE SET NULL; operator-scoped RLS; 4 indexes including GIN on firing_rules); **MIG-052** `feature_flags` seed `universe.enabled=false` (default operator_id per MIG-039 convention; idempotent ON CONFLICT). AC-10/11/12/14 amended in master-plan with MIG renumbering; AC-13 retroactive evidence note added (satisfied at ACT-108 + ACT-109). FP-008 Reference Impact MIG renumbering corrected to post-ACT-110 actuals. FP-008 Status field forward-fixed (defect #34) to reflect 8.5 + 8.6 closures. Universe-component remains inert until 8.13 flips the flag. |
| Surfaces resolved | Surface 1 → Option A (operator-confirmed two-boolean shape + CHECK; no `universe_book` enum minted). |
| Guardrails | G1 honored (DEC-038/038.1 clauses (5) + (7) directly enumerate this sub-step's deliverables; no DEC amendment); G2 honored (iShares cross-check stays in `universe_refresh_log`; no wiring into membership/exclusions tables). |
| v0.6.2 §22.3 discipline | (a) reference indices updated same-PR (database-migration-ledger + longshort.md + master-plan + feature-proposals); (b) idiom-grep clean (CREATE TABLE IF NOT EXISTS / ENABLE RLS / DROP-CREATE POLICY / PK / CHECK / ON CONFLICT / text[] / jsonb / FK precedents all verified); (c) 3 migrations independent (only FK to MIG-048; no cross-deps); no write paths landed (8.7 scope); (d) plan v13.16 → v13.17 per Rule 10. |
| Live-DB evidence | `supabase--read_query` × 3 confirmed: (i) universe_membership — 8 columns / RLS enabled / 2 policies / CHECK `(long_eligible OR short_eligible)` present; (ii) hard_exclusions — 7 columns / RLS enabled / 2 policies; (iii) feature_flags — 1 row with `enabled=false`, `evidence_tier='weak'`, reason citing FP-008 sub-step 8.6 / ACT-110. §22.5.1 binding standard satisfied × 3. §22.5.2 NOT triggered per defect class #35 (no capability mismatch for new tables / seed). |
| Approval | Operator approval 2026-05-25: "A go" (Surface 1 — two-boolean mirror + CHECK). |
| Supersession | N/A — additive. RESERVED block in database-migration-ledger collapsed into final LANDED entries (MIG-050/051/052). |

### v13.18 — 2026-05-25 — v0.6.3 Supervisor-Instructions Amendment Cycle Companion Artifact Landing (ACT-111)

| Field | Value |
|-------|-------|
| Change Type | Governance artifact creation (additive; no code surface; no live-DB; no financial state) |
| Scope | `docs/ai-failure-modes.md` landing (failure-mode catalog seeded with defect classes #34-#38; quarterly review cadence per §12.8; cross-cutting quarterly-review ADRs land in `docs/decisions/`); `docs/decisions/.gitkeep` materialization (operator Option C ruling on §22.8.4 STOP); DW-065 registered in canonical `docs/08-planning/deferred-work-register.md` (operator Option α ruling honoring Constitution Rule 5 single-SSOT discipline). |
| Surfaces resolved | §22.8.4 STOP on §22.3 item 7 (`docs/decisions/` absence) → Option C (create `.gitkeep` + log forward as DW-065); DW append-target path drift (`06-tracking/` vs canonical `08-planning/`) → Option α (silent path correction to canonical register). |
| Guardrails | Constitution Rule 5 honored (single-SSOT register; no duplicate at parallel path); Rule 8 honored (no approved sections dropped); Rule 10 honored (additive merge bump). |
| v0.6.3 §22.3 discipline | (g) Supervisor Surface/path pre-resolution discipline confirmed structurally necessary: defect #36 fired TWICE in ACT-111 prompt-drafting cycle, both caught by Lovable §22.8.4 STOP. Pattern_signal — supervisor drafting checklist requires path-grep alongside idiom-grep + schema-grep. |
| Live-DB evidence | N/A — governance artifact only; no DB touch. |
| Defect class surfaced | #36 dual-firing in same prompt-delta; codification target v0.6.3 §22.3 (g) reinforced (already in target batch); no new defect class. |
| Approval | Operator approval 2026-05-25: Option C (Surface 1 — `.gitkeep` materialization) + Option α (DW-065 canonical path correction) + "proceed confirmation" for full ACT-111 delta. |
| Supersession | N/A — additive. v0.6.2 open governance loose-end resolved; v0.6.3 supervisor-instructions amendment cycle CLOSES pending operator confirmation that instructions are applied. |

### v13.19 — 2026-05-25 — §22.5 AMBIGUITY Reconciliation: §12.10 Operational-Log Section Appended (ACT-112)

| Field | Value |
|-------|-------|
| Change Type | Governance artifact amendment (revision-fix; strictly additive; no code surface; no live-DB; no financial state) |
| Scope | `docs/ai-failure-modes.md` — appended new top-level "§12.10 Operational Log — PR-Time AI-Loop Failure Events" section carrying verbatim CROSSWIND §12.10 contract (7 canonical categories + 8-field capture protocol + quarterly review cadence + empty body + scope-distinction note). Minor cross-reference amendments to Purpose / Scope / Related Documents reflecting dual-section structure. Existing Sections 1-9 (Catalog #34-#38 + Quarterly Review Protocol + Used By + Risks) preserved verbatim. |
| Surfaces resolved | §22.5 AMBIGUITY on ACT-111 — Lovable-landed catalog (useful, §21.10 mirror) deviated from prompt's verbatim §12.10 spec contract (7 categories + 8 fields + empty-body shape). Operator ruled Option III (strictly additive append; both governance purposes coexist under single canonical filename). |
| Guardrails | Guardrail 1 (strictly additive amendment; ACT-111 content preserved verbatim except specified cross-reference amendments); Guardrail 2 (no DEC amendment; §12.5 Rule 10 + §12.10 are existing spec). Constitution Rule 5 (single canonical filename; both purposes coexist; no duplicate at parallel path). Constitution Rule 8 (no approved sections dropped). Constitution Rule 10 (additive merge bump). |
| v0.6.3 §22.3 discipline | (a)/(b)/(c)/(e)/(f)/(h)/(i) N/A for content-only markdown amendment; (d) plan-version bump unrestricted per Lovable interpretation; (g) supervisor-side: §12.10 verbatim source cited at CROSSWIND_SPEC.md lines 3180-3220 with executor pre-flight grep commands. |
| Live-DB evidence | N/A — governance artifact only; no DB touch. |
| Defect class surfaced | Defect #39 candidate logged forward: executor pre-flight should grep cited spec sources for verbatim faithfulness (mirror of supervisor-side §22.3 (g)); codification deferred to next supervisor-instructions amendment cycle (likely v0.6.4 / v0.7); not blocking ACT-112. |
| Approval | Operator approval 2026-05-25: Option III ruling on §22.5 AMBIGUITY ("III go") authorizing strictly additive §12.10 operational-log section append + cross-reference amendments + ledger updates. |
| Supersession | N/A — additive reconciliation. ACT-111 entry preserved valid; Option III reconciles rather than invalidates. §12.5 Rule 10 mandate fully satisfied at canonical filename; v0.6.3 supervisor-instructions amendment cycle FULLY CLOSED on both supervisor-side context update and repo-side companion artifact at spec-compliant content shape. Next supervisor draft: FP-008 sub-step 8.7 (verify_universe_membership real implementation + universeService.getEligibleUniverse() chokepoint per DEC-038.1 clause (5) + hard_exclusions persistence wiring from refresh handlers). |

### v13.20 — 2026-05-26 — FP-008 Sub-Step 8.7 Closure: `verify_universe_membership` LIVE + Bulk Chokepoint + Persistence Wiring (ACT-113)

| Field | Value |
|-------|-------|
| Change Type | Implementation (financial-critical execution; T1 + T4 + T6 + T7 + T8 honored) |
| Scope | Sub-step 8.7 closed. LIVE `createUniverseMembershipFetcher` replaces `MOCK_UNIVERSE_FETCHER` at tick handler per Surface 1 Option A fetcher-layer transition (verifier signature unchanged per AC-16). BULK-tier `universeService.getEligibleUniverse()` chokepoint per Surface 2 Option γ + DEC-038.1 clause (5). `Promise<EligibleUniverse \| null>` typed-absence per Surface 3 Option i + §2 axiom 3. Shared `hardExclusionsPersister` per Surface 4 Option b + caller-side firing_rules grouping per Option c. Two-phase persistence (pipeline OUTSIDE; persistence sequence after pipeline success) per Surface 5 Option q + DEC-038 clause (3) prior-quarter intactness. Landed across two Lovable commits per partial-landing pattern (first commit 6 files at SHA 7ebfa9ec; second commit 12 file touches). |
| Surfaces resolved | Pre-flight Surfaces 1-5 (A / γ / i / b+c / q) operator-locked at ACT-113 pre-flight; no surfaces surfaced during execution. |
| Guardrails | T4 audit-writer trap avoided (orchestrator does NOT import platform logAuditEvent; persistence is pure side-effect at boundary; audit emission at edge-function handler via writeStrategyAuditEvent). T6 per-strategy removability preserved. T8 idempotency: universe_membership bulk INSERT on natural PK (operator_id, ticker, as_of_date); hard_exclusions UPSERT idempotent by construction. Anti-phantom defaults: no silent sentinels (typed-absence via null), no wall-clock in kernels (`as_of` is parameter). |
| v0.6.3 §22.3 discipline | (g) supervisor pre-flight path-grep + schema-grep + idiom-grep applied (Surface-7 grounding verified _shared/supabase-admin.ts exists; banned-pattern grep clean on first-commit landed files). Partial-landing pattern surfaced at first-commit close per §22.8.4 anti-completion-theater. |
| Live-DB evidence | N/A at this entry — sub-step 8.6 (ACT-110) already provided live-DB evidence for MIG-050/051/052 landing; ACT-113 consumes those schemas via supabaseAdmin at runtime; no new migration. |
| Defect class surfaced | "Partial-landing as completion-theater" pattern observed (large file-count sub-step + time-constrained executor session). Honest partial-landing disclosure + supervisor §22.5 verification on partial state confirms both §22.8.4 STOP discipline (executor) and multi-commit ACT verification capacity (supervisor). Not codified as new defect class on first observation; logging in supervisor handoff catalog for forward consideration if recurring across FP-008+ sub-steps. |
| Approval | Operator approval 2026-05-26: pre-flight Surfaces A / γ / i / b+c / q + "resume per recommendation" confirmation for the 12 file touches comprising the second commit of the two-commit partial-landing. |
| Supersession | N/A — additive execution. Next deliverable: FP-008 sub-step 8.8 (ingestion-time cross-check operational per §11.0.5 / A4; reconcile() invocation per DEC-038.1 clause (2); AC-17 + AC-18 bind). |

### v13.21 — 2026-05-26 — FP-008 Sub-Step 8.8 Closure: Ingestion-Time Cross-Check Operational (`reconcile()` first universe invocation; AC-17 + AC-18) (ACT-114)

| Field | Value |
|-------|-------|
| Change Type | Implementation (financial-critical execution; T1 + T4 + T6 + T7 + T8 honored; first universe-component contribution to `reconciliation_events` table via `reconcile()` per DEC-038.1 clause (2)) |
| Scope | Sub-step 8.8 closed. `buildUniverseCrossCheckSpec()` ReconcileCallSpec authored at `src/features/longshort/services/universe/constituent-ingestion/cross-check-spec.ts` per S6 Option I (file location). Surface 2 Option γ jaccard similarity with explicit safety bounds: floor `sym-diff ≤ 3 → false_positive_within_tolerance`; ceiling `sym-diff > 100 OR empty observed/expected → system_bug`; middle band classified per jaccard score. Surface 3 Option i no `verify-cross-check/` sub-folder created (spec lives co-located with primary fetcher). Surface 4 Option a `VerifyCallName` union widened with `'universe_cross_check'` literal (DW-069 logged for forward rename to `ReconcileCallName`). Surface 5 Option q quarterly orchestrator Step 2b invokes `ctx.crossCheck()` AFTER pipeline transformations + BEFORE persistence; aborts on `failure_escalated` OR `system_bug` outcomes preventing downstream `universe_membership` + `hard_exclusions` writes per DEC-038.1 clause (2) + DEC-038 clause (3) prior-quarter intactness. Cont-Refresh Option (ii) continuous-refresh orchestrator untouched (0-line diff verified). Quarterly edge function wires production `crossCheck` via `reconcile()` per AC-18 (orchestrator does NOT write to `reconciliation_events` directly; only `reconcile()` writes). Landed across two Lovable commits per partial-landing pattern (first commit 8 implementation files at SHA d4782602; second commit 8 governance file touches). |
| Surfaces resolved | Pre-flight Surfaces 1-6 (A / γ / i / a / q / I) + Cont-Refresh (ii) operator-locked at ACT-114 pre-flight ("All recs go — A / γ / i / a / q + Cont-Refresh (ii)" + S6 "I go"); no surfaces surfaced during execution. |
| Guardrails | T4 audit-writer trap avoided (orchestrator does NOT import platform `logAuditEvent`; `reconcile()` writes to `reconciliation_events` per DEC-034.1; audit emission at edge-function handler via `writeStrategyAuditEvent`). T6 per-strategy removability preserved. T8 idempotency: cross-check is deterministic over (`polygon_tickers`, `ishares_tickers`, `as_of`); replay-safe. Anti-phantom defaults: no silent sentinels (jaccard floor on empty set is explicit `system_bug` classification, NOT silent 0 or 1); no wall-clock in kernels (`as_of` is parameter throughout). AC-18 verified: zero direct `reconciliation_events` writes from universe-component code (`rg "reconciliation_events" src/features/longshort/services/universe/` returns 0 matches). |
| v0.6.3 §22.3 discipline | (g) supervisor pre-flight grep verification applied (jaccard-utility absence confirmed; ReconcileCallSpec shape grounded; banned-pattern grep clean on landed files including 0 `Date.now()` + 0 sentinel fallbacks + 0 `logAuditEvent` imports). Partial-landing pattern surfaced at first-commit close per §22.8.4 anti-completion-theater — second observation of pattern in FP-008 cycle (after ACT-113), suggests forward-binding mitigation candidate for code-heavy sub-steps (~12+ files). |
| Live-DB evidence | N/A at this entry — sub-step 8.8 introduces no new schema; consumes the existing `reconciliation_events` table via `reconcile()` (landed at FP-006 per DEC-034.1). `reconciliation_events` row emission is exercised by the live `crossCheck` injection at the quarterly edge function. |
| Defect class surfaced | "Code-heavy sub-step file-count predicts partial-landing risk" — pattern statistically meaningful after 2 consecutive partial-landings (ACT-113 + ACT-114) on ~17-20 file targets. Logging in supervisor handoff catalog for forward consideration; pre-organize file-scope into "implementation tier" + "governance tier" sections candidate. Not codifying on second observation. |
| Approval | Operator approval 2026-05-26: pre-flight Surfaces A / γ / i / a / q + Cont-Refresh (ii) + S6 Option I confirmation; "resume per recommendation" for the 8 governance file touches comprising the second commit. |
| Supersession | N/A — additive execution. Next deliverable: FP-008 sub-step 8.9 (health monitoring per §11.3 + DEC-038 clause (7); universe size + filter rates + hard exclusion counts + refresh duration + cross-check divergence counts emitted to dashboard-queryable storage; AC-19 binds). |

### v13.22 — 2026-05-26 — FP-008 Sub-Step 8.9 Closure: Universe-Component Health Monitoring Operational (FIRST dashboard-queryable metric emission; AC-19) (ACT-115)

- Sub-step 8.9 closed at ACT-115 per AC-19 + DEC-038 clause (7) verbatim binding.
- Surface choices locked (3-pass supervisor convergence): S1 γ (extend `universe_refresh_log` via MIG-053; reuse `reconciliation_events_daily_agg` view); S2 q (7-bucket `FilterRejectionReason` enum; DW-070); S3 ii (refresh-time snapshot); S4 x (cross-check via existing view; no denormalization); S5 A (single `metrics-emitter.ts` under new `health-monitoring/` sub-folder); S6 m (quarterly-only; DW-071 forward-binding deferral).
- MIG-053 adds `filter_rejection_counts jsonb` + `hard_exclusion_counts jsonb` columns to `universe_refresh_log` with point-in-time-snapshot DDL comments.
- Quarterly orchestrator Step 7 (post-finalize) emits metrics on `outcome='completed'`; emitter errors are observability-only (do NOT fail the refresh).
- Canonical dashboard query block landed in `docs/04-modules/longshort/longshort.md` (Surface 4 Option x discovery binding).
- DW-070 logs clause-(7) verbatim drift (7 enum buckets vs spec's 6 §3.2 filters); DW-071 logs continuous-refresh metric emission deferral.
- AC-19 evidenced (code-operational portion; runtime evidence defers to sub-step 8.13 flag flip per AC-17 pattern).
- ACT-104-114 code paths preserved verbatim; continuous-refresh orchestrator untouched (S6 Option m).

### v13.23 — 2026-05-26 — FP-008 Sub-Step 8.10 Closure: Universe Component Detailed Documentation + ART-019 Registration (AC-20) (ACT-116)

- Sub-step 8.10 closed at ACT-116 per AC-20 verbatim binding (FIRST documentation-only sub-step in FP-008).
- Surface choices locked (4-pass supervisor convergence): S1 γ (comprehensive component reference + operator handbook woven through; 250-line target); S2 p (single `universe.md`; sub-folder lock — no other files in `docs/04-modules/longshort/universe/` at 8.10); S3 i (standard component-doc shape; 15 sections locked verbatim); S5 a (consolidate into `universe.md`; `longshort.md` Universe Component sub-section reduces to ~5 lines preserving status indicator); S4 ART-019 with `Phase Trading-Foundation` owning_phase matching ART-018 verbatim.
- 5 peer-supervisor calibrations folded throughout: (1) anti-completion-theater binding — universe.md content sourced strictly from DEC-038 + DEC-038.1 + ACT-103-115 + longshort.md sub-section + src/ JSDoc; (2) sub-folder lock; (3) 15-section verbatim list; (4) longshort.md status-indicator preservation; (5) ART-019 phase-nomenclature lineage match.
- NEW `docs/04-modules/longshort/universe/universe.md` (250 lines; 15 sections in locked verbatim order: Purpose / Scope / Enforcement Rules / Key Rules / Architecture / Data Model / Sub-modules / Reconciliation Surface / Health Monitoring / Feature-Flag Wrapping / Events / Jobs / Failure Modes / Dependencies / Cross-references).
- `docs/04-modules/longshort/longshort.md` Universe Component sub-section reduced from 54 content lines to ~5 lines (status indicator "8.1-8.10 LANDED" + 1-sentence summary + pointer to `universe.md`).
- `docs/04-modules/longshort/README.md` Contents section gains 1 bullet for `universe/`.
- `docs/07-reference/artifact-index.md` gains ART-019 entry with `Phase Trading-Foundation` owning_phase.
- `docs/08-planning/feature-proposals.md` FP-008 Status field updated per defect #34 forward-fix (v0.6.3 §22.3 (e)).
- AC-20 ticked; sub-step 8.10 checkbox ticked.
- Tier B documentation-only: no code changes; no schema changes; no live-DB writes; no §22.5.1 / §22.5.2 invocation; no new DEC clauses; no new DW entries.
- Module status `phase-0b-validated` unchanged (8.13 closure transitions to `phase-1-validated`).
- ACT-103-115 entries preserved verbatim (append-only).

### v13.24 — 2026-05-26 — FP-008 Sub-Step 8.11 Closure: Replay-Test Integration (verify_universe_membership Chokepoint; AC-21 + AC-22) (ACT-117)

- Sub-step 8.11 closed at ACT-117 per AC-21 + AC-22 + DEC-038.1 clause (6) verbatim binding.
- Surface choices locked (3-pass supervisor convergence): S1 β (separate `l2-synthetic-universe-quarterly-refresh.jsonl.zst` snapshot fixture; L2 Day 1 UNTOUCHED; §11.10.1 8-stream tick enumeration UNAMENDED via parallel-loader pattern); S2 p (extend `replay-pass-runner.ts` with verifier-dispatch; anti-premature-decomposition guard honored — ~80-line addition); S3 i (inline TypeScript constituent constants per `l2-synthetic-day-1-generator.ts` precedent); S4 a (`verify_universe_membership` chokepoint ONLY scope; full quarterly orchestrator determinism deferred to DW-073); S5 x (extend `scripts/replay-pass.ts` Deno CLI per ADR-005 Deno-native runtime precedent; DEC-035 clause (8) Vitest citation drift logged at DW-074).
- 5 peer-supervisor calibrations applied: verify_quote path VERBATIM preservation (calibration 1); DW-073 Phase 7 future-phase assignment (calibration 2); DW-074 governance-tier resolution path (calibration 3); ART-020 omission ratified per ART-016 precedent (calibration 4); parallel-loader pattern refinement honoring §11.10.1-non-amendment guard (calibration 5).
- FIRST snapshot-style fixture extension to §11.10 framework; documented at `docs/04-modules/longshort/replay-fixture-format.md` Appendix A.
- FIRST verify_* replay chokepoint beyond verify_quote (landed at FP-006 sub-step 6.5c).
- Coverage matrix partial scaffold landed at `e2e/longshort/replay-fixtures/coverage-matrix.md` (4 rows: 2 verify_quote + 2 verify_universe_membership); DW-072 tracks remaining 16 verifier scenarios build-out.
- DW-072 + DW-073 + DW-074 logged tracking coverage matrix build-out, full-orchestrator determinism deferral, and DEC-035 clause (8) substrate drift.
- AC-21 + AC-22 evidenced via 6 Deno tests at `replay-pass-runner_test.ts` (parse + 10-event count + 8/0/2 outcome distribution + materially-excluded escalation × 2 + AC-22 byte-identical determinism + AC-21 round-trip) + 8 Deno tests at `l2-synthetic-universe-quarterly-refresh-generator_test.ts`.
- Landed across two Lovable commits per partial-landing pattern (third consecutive observation after ACT-113 + ACT-114; first commit 2 files at SHA afc73fd3; second commit 14 file touches).
- ACT-103-116 code paths preserved verbatim; existing verify_quote replay path UNTOUCHED.

### v13.25 — 2026-05-26 — FP-008 Sub-Step 8.12 Closure: Operator Runbooks for Known Failure Modes (AC-23; First Runbook Landing in Repo) (ACT-118)

- Sub-step 8.12 closed at ACT-118 per AC-23 + CROSSWIND §10.5 deliverable 12 verbatim 4-runbook enumeration.
- Surface choices locked (3-pass supervisor convergence): S1 β (4 separate runbook files; on-call utility wins over file-count economy at Tier B); S2 r (NEW `docs/04-modules/longshort/universe/runbooks/` nested sub-folder; ACT-116 calibration 2 explicit-exception applies); S3 i (7-section canonical: Symptoms → Detection → Diagnosis → Action → Verification → Escalation → Cross-references); S4 a (4 ART entries ART-020/021/022/023 with `Type = runbook` + `Owning Phase = Phase Trading-Foundation` per ART-018/019 verbatim precedent).
- 5 peer-supervisor calibrations folded throughout: anti-completion-theater binding from ACT-116/117 precedent (calibration 1); ACT-116 sub-folder-lock explicit-exception applied to runbooks/ (calibration 2); ART phase-nomenclature lineage verbatim per ART-018/019 (calibration 3); longshort.md status-indicator preservation + module-tier README.md unchanged (calibration 4); §22.8.4 STOP-on-ambiguity discipline rather than speculative DW logging (calibration 5).
- FIRST runbook artifact-class instantiation in the repo (`runbook` type was schema-registered in `artifact-index.md` but never instantiated until this sub-step).
- Four runbooks landed satisfying AC-23 verbatim: quarterly refresh failure (ART-020) + cross-check noise classification (ART-021) + halt-feed unavailable (ART-022) + earnings-calendar feed failure (ART-023).
- Runbook content sourced strictly from cited DEC clauses + CROSSWIND sections + ACT entries + DW register + src/ JSDoc per anti-completion-theater binding from ACT-116/117 precedent.
- `universe.md` placeholder replacements at lines 33 + 221; module-tier README.md UNCHANGED (Surface 2 r); `longshort.md` UNCHANGED (ACT-116 calibration 4); `replay-fixture-format.md` UNCHANGED (ACT-117 scope preservation).
- 4 ART entries appended to `artifact-index.md` with `Owning Phase = Phase Trading-Foundation` verbatim per ART-018/019 (defect-#40 lineage discipline; no `Phase 1` drift).
- `docs/08-planning/feature-proposals.md` FP-008 Status field updated per defect #34 forward-fix (v0.6.3 §22.3 (e)).
- AC-23 ticked; sub-step 8.12 checkbox ticked.
- NO new DW entries logged at this sub-step — §22.8.4 STOP-on-ambiguity discipline rather than speculative deferral.
- NO new DEC clauses; NO amendments to DEC-034 / DEC-038 / DEC-038.1; NO new ADR; runbooks are operational documentation, not governance.
- Tier B documentation-only: no code changes; no schema changes; no live-DB writes; no §22.5.1 / §22.5.2 invocation.
- Module status `phase-0b-validated` unchanged (8.13 closure transitions to `phase-1-validated`).
- ACT-103-117 entries preserved verbatim (append-only).

### v13.26 — 2026-05-26 — FP-008 Sub-Step 8.13 / Phase 1 Closure: PLAN-TRADING-001-LONGSHORT-003 CLOSED (AC-24 through AC-38; Module Status `phase-0b-validated` → `phase-1-validated`; MIG-054 Flag Flip; ADR-007 Phase 1 Runtime Evidence Deferral) (ACT-119)

**What Changed:** FP-008 closed (terminal sub-step 8.13). PLAN-TRADING-001-LONGSHORT-003 closure document published at `docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md` with full 38-AC × evidence matrix + 14-row sub-step closure-SHA matrix + Migrations + ADRs Created + Reference Index Reconciliation + Tests + Deferred Work + Out-of-Scope + Lock Statement (Surface 1 Option γ hybrid). MIG-054 `UPDATE feature_flags SET enabled=true WHERE flag_key='universe.enabled'` applied per DEC-038.1 clause (5) verbatim (Surface 2 Option q; parallels MIG-045 + MIG-046 first-class operational-state precedent). ADR-007 (Phase 1 Runtime Evidence Deferral) introduced at `docs/04-modules/longshort/design-source/ADR-007-phase-1-runtime-evidence-deferral.md` per Surface 3 Option X (vacuous-quietness deferral; FP-006 ADR-006 captured-day deferral precedent applied symmetrically; AC-17 / AC-19 / AC-26 / AC-31 runtime portions deferred to Phase 7 first production refresh). Module status `phase-0b-validated` → `phase-1-validated` per AC-34. AC-24 through AC-38 ticked (15 new ticks at closure). Sub-step 8.13 checkbox ticked. Master-plan PLAN-TRADING-001-LONGSHORT-003 section Status: `approved (execution-pending)` → `closed` per AC-36. FP-008 entry Status: `execution-in-progress` → `closed` + NEW Closure SHA / Date Closed / Closure Evidence fields per AC-37 (sub-case (i) FP-007 template). system-state.md modules_implemented narrative + active_work narrative + Module Status Table row + plan version + last_updated all updated.

**Why:** Terminal sub-step 8.13 closure transaction per FP-008 / DEC-038 / DEC-038.1.

**What Stayed:** DEC-038 + DEC-038.1 + DEC-034 + DEC-034.1 + DEC-035 active; ART-018 through ART-023 unchanged; ADR-001 through ADR-006 preserved verbatim; MIG-048 through MIG-053 preserved verbatim; all 4 runbooks at `docs/04-modules/longshort/universe/runbooks/` preserved verbatim; ACT-103 through ACT-118 preserved verbatim (append-only); function-index / event-index / route-index / permission-index / component-inventory unchanged; CROSSWIND_SPEC.md unchanged; supervisor-instructions / scripts/ / .github/ / docs/banned-patterns.md / docs/ai-failure-modes.md / docs/decisions/ unchanged.

**What Was Added:** Closure document; MIG-054 (operational flag flip); ADR-007 (Phase 1 Runtime Evidence Deferral); DW-075 (Phase 1 runtime evidence completion at Phase 7 first production refresh); DW-076 (supervisor-side defect-#42 candidate: pre-flight Finding adopted by executor without independent re-verification at terminal-closure time); ACT-119 entry; FP-008 Closure SHA / Date Closed / Closure Evidence fields; database-migration-ledger.md MIG-054 entry.

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification. Operator surface rulings locked across 3-pass supervisor convergence + Option A-correction: S1=γ / S2=q / S3=X / S4=a / S5=Option A-corrected.

**Supersession Links:** FP-008 supersedes the execution-in-progress phase as the closed Phase 1. Phase 2 (signal stack) opens as separate FP per AC-38 (FP-009+ scoping TBD).

**Defect-#42 candidate lineage:** Pre-flight surface document `FP-008-substep-8-13-pre-flight-surfaces.md` Finding 1 erroneously claimed AC-38 missing; corrected at execution-prompt drafting time via independent re-grep at HEAD `2bb125b9` (38 ACs verified contiguous AC-01 through AC-38). Logged at DW-076 + Lock Statement of closure document; forward-binding consideration for §22.3 (j) codification on recurrence.

### v13.27 — 2026-05-26 — Stage 0.5: Supervisor-Instructions v0.6.4 Path Broad Codification (Defect #43 — CI Gate Enforcement Gap + Defect #36 Family Unified Discipline) + Closure-SHA Placeholder Cleanup (ACT-120)

**What Changed:**
- Governance discipline codification per CI-INVESTIGATION-01 disposition Option C-corrected + Path Broad v0.6.4 amendment scope ruling (operator-ratified 2026-05-26)
- DW-077 logged: CI gate enforcement gap (strong-evidence.yml continuously red since FP-007 / ACT-099 closure) + defect #36 family unified discipline + defect #43 codification
- INC-23 logged: CI-INVESTIGATION-01 disposition lineage + 8-stage sequencing + AC-38 phantom finding (DW-076 / pattern-establishing instance #1) + `ur.created_at` phantom column (Stage 0 SQL incident / pattern-establishing instance #2)
- Operator-side supervisor-instructions v0.6.4 amendment (Claude Project Knowledge update; not repo-tracked per Claude Project Knowledge boundary) codifies defect class #43 with three sub-clauses per Path Broad ruling: §22.3 (k) supervisor pre-flight CI-status check requirement + §22.5 (g) executor disposition CI-status confirmation requirement + §22.3 (l) broad supervisor-side repo-state-reference inline grep-citation requirement with operator-locked inline-citation refinement (artifact contains literal grep/read command + output excerpt proving repo-state reference, OR artifact is invalid — mechanically auditable not trust-based)
- Stage 0.5 of the corrective sequencing: discipline codification doc-only commit, ~20 min
- Bundled hygiene: FP-008 entry line 7 Closure SHA placeholder + master-plan PLAN-TRADING-001-LONGSHORT-003 line 3 placeholder resolved (anchor-cite hygiene; closure document untouched per Option C-corrected)

**Why:** Two distinct failure-mode pattern-establishing instances surfaced within ~48 hours on distinct artifact types: (1) strong-evidence.yml workflow continuously red since FP-007 / ACT-099 — three TypeScript compile errors entered tree before FP-007 closure (workflow auth SHA `4605255` 2026-05-24; errors at SHAs `1e4bd29` + `5d5e6de` + `7c9ad7a`; FP-007 closure SHA `cd4b8a14` 2026-05-25); Gate 2 (Deno TypeScript compile) fails before tests run; Gates 3-9 (banned-pattern enforcement) never execute; 53 visible workflow runs all red; AC-32 + AC-32-equivalent attestations in FP-007 + FP-008 closures mechanically false. (2) Two supervisor-side artifact-authoring incidents (AC-38 phantom finding at ACT-119 pre-flight + `ur.created_at` phantom column in Stage 0 SQL) demonstrate defect #36 family extends beyond v0.6.3 §22.3 (g) Surface-only scoping. Discipline gap that hid CI failure for 53 runs is absence of `gh run list --workflow=<name>` CI-status check in both supervisor §22.3 pre-flight + executor §22.5 disposition. Path Broad codification addresses both the CI-status check gap AND the deeper supervisor-side repo-state-reference discipline gap — codifying once now (v0.6.4) is cheaper than codifying twice (v0.6.4 narrow + v0.6.5 broad later when next defect #36 instance forces it). Codifying §22.3 (k) + §22.3 (l) + §22.5 (g) NOW (before CI-FIX-01 Stage 1) means CI-FIX-01's own closure transaction is the first one to exercise the new checks — the right validation event for the new rules.

**What Stayed:**
- DEC-038 + DEC-038.1 + DEC-034 + DEC-034.1 + DEC-035 + DEC-031 + DEC-032 + DEC-036 active
- ART-018 through ART-023 unchanged
- ADR-001 through ADR-007 unchanged
- All FP closure documents (FP-005 / FP-006 / FP-007 / FP-008) frozen per Option C-corrected (closure-docs-stay-frozen + per-affected-FP erratum addendum via separate GOV-ERRATA-01 parallel FP)
- Module status `phase-1-validated` (Option C-corrected = AC-32 mechanical satisfaction realized at CI-FIX-01 closure, not now)
- FP entry Status / Date Closed / Closure Evidence fields preserved verbatim (only Closure SHA placeholder line 7 fixed; FP entry attestation otherwise unchanged)
- Master-plan section Status field text preserved verbatim except `<this-commit-SHA>` token replacement
- `.github/workflows/strong-evidence.yml` preserved verbatim (CI fixes are CI-FIX-01 / Stage 1 scope)
- All code under src/ and supabase/ preserved verbatim

**What Was Added:** DW-077 + INC-23 + ACT-120 + this changelog entry + system-state version bumps + 2 placeholder-cleanup hygiene fixes. Operator-side supervisor-instructions v0.6.4 amendment authored in parallel (Claude Project Knowledge update; not repo-tracked per longstanding boundary).

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification; operator-ratified Path Broad codification 2026-05-26 per CI-INVESTIGATION-01 disposition Option C-corrected.

**Supersession Links:** None at this plan version. (FP-007 + FP-008 closure documents are NOT superseded; erratum addenda via GOV-ERRATA-01 parallel doc-only FP forthcoming.)

**Defect #43 codification lineage:** Pattern-establishing instance #1 = AC-38 phantom finding at ACT-119 pre-flight (logged at DW-076 as defect #42 candidate; resolved via operator catch + Option A-correction). Pattern-establishing instance #2 = `ur.created_at` phantom column in Stage 0 OOB SQL (caught by Postgres error 42703 at operator-attempted execution; supervisor issued corrected SQL acknowledging the recurrence). Two instances on distinct artifact types within ~48 hours establish defect #36 family as recurring pattern; v0.6.4 Path Broad codification addresses prospectively with operator-locked inline-citation refinement.

### v13.28 — 2026-05-27 — Stage 1: CI-FIX-01 — 3 TS Error Fixes + Gate-Detector Defect + Sentinel Refactor + Gates 1–9 Green Verification (Path 1 Operator-Authorized Scope Expansion; First Full-Cycle Validation Event for v0.6.4 §22.3 (k) + (l) + §22.5 (g); Pattern Instance #3 + #4 Logged at DW-077) (ACT-121)

**What Changed:**
- Fixed 3 TypeScript compile errors that had been continuously failing Gate 2 of `strong-evidence.yml` since FP-007 / ACT-099 workflow authoring (SHA `4605255` 2026-05-24): (a) `zstd-codec.ts:13` unresolvable `https://deno.land/x/zstd@v0.20.2/mod.ts` URL replaced with `jsr:@yu7400ki/zstd-wasm@0.1.0` (Path B; pure-WASM, no native plugin); (b) `multi-pending-harness.ts:252/253/283/284` non-overlapping struct casts via Path A `as unknown as T` intermediate casts; (c) `event-index.ts:101/129` generic predicate-narrowing return-type loss via α-style explicit narrowed binding
- Path 1 operator-authorized scope expansion: (d) `scripts/check-wall-clock.ts` detector defect fix — new `stripCommentsOnlyWithState` helper + per-pattern `requireLiteralEmpty` flag on `new-Date-noarg` to suppress false positives from `new Date('iso')` → `new Date()` synthetic match after string-strip; `isExcluded` extended to also cover `.test.ts` naming convention; (e) `ishares-constituent-fetcher.ts` Option α refactor — `findHeaderRowIndex` return type `number` → `number | null` per DEC-034 clause (2) typed-absence discipline; caller `parseISharesCsv` line 116 + companion test line 41 updated
- Gates 3-9 (banned-pattern enforcement per DEC-034 clauses (2)/(4)/(5) + DEC-036 clause (2) + ACT-097 finding #13 + DW-058 B1) execute end-to-end CLEAN against current main for the first time
- **AC-32** (in PLAN-TRADING-001-LONGSHORT-003 / FP-008 closure) + **AC-32-equivalent** (in PLAN-TRADING-001-LONGSHORT-002 / FP-006 via ACT-099 deliverables) **mechanical satisfaction REALIZED at this closure SHA**
- DW-077 extended with pattern-establishing instance #3 (Stage 0.5 §22.3 item 5 `git rev-list --count` constraint contradicting §22.8.5(b)) + instance #4 (Stage 1 §22.3 (l) inline-citation table omitting executed-gate-output state) + future-split trigger update (2-of-2 most-recent recurrences are tool-behavior-state-shaped) + Path 1 scope-expansion attestation paragraph
- First full-cycle validation event for v0.6.4 §22.3 (k) (supervisor pre-flight CI-status check) + §22.3 (l) (broad supervisor-side repo-state-reference inline grep-citation) + §22.5 (g) (executor disposition CI-status confirmation) codified at Stage 0.5 / ACT-120 — the §22.5 (g) STOP discipline proved itself when Lovable refused to write false-green attestation upon discovering Gates 5/6 surfaces

**Why:** Stage 1 of the CI-INVESTIGATION-01 disposition Option C-corrected corrective sequencing. The §22.8.4 STOP after the original 3 TS fixes (Gates 5 + 6 surfacing pre-existing violations + detector defects masked since FP-007 closure) prompted operator three-path adjudication; Path 1 (extend scope) chosen because detector defect + sentinel refactor are direct prerequisites for the named CI-FIX-01 goal ("verify Gates 1-9 green end-to-end"), not adjacent feature work. Path 2 (split CI-FIX-02) would have fragmented the AC-32 attestation chain across two SHAs; Path 3 (revert) would have destroyed the 3 verified-clean TS fixes. The §22.5 (g) STOP that triggered the path-decision IS the validation event proving the v0.6.4 discipline works.

**What Stayed:**
- DEC-038 + DEC-038.1 + DEC-034 + DEC-034.1 + DEC-035 + DEC-031 + DEC-032 + DEC-036 active
- ART-018 through ART-023 unchanged
- ADR-001 through ADR-007 unchanged
- All FP closure documents (FP-005 / FP-006 / FP-007 / FP-008) frozen per Option C-corrected (erratum addenda via GOV-ERRATA-01 parallel doc-only FP forthcoming)
- Module status `phase-1-validated` (Option C-corrected = no rollback even at AC-32 realization)
- FP entry Status / Date Closed / Closure Evidence preserved (GOV-ERRATA-01 handles addenda)
- Master-plan AC ticks unchanged (GOV-ERRATA-01 handles section addenda)
- `.github/workflows/strong-evidence.yml` preserved verbatim (workflow IS the test artifact)
- INC-23 entry unchanged (CI-FIX-01 closes the corrective; doesn't re-author lineage)
- No code under `supabase/` touched; no migrations; no edge functions

**What Was Added:** 5 code-fix files (zstd-codec.ts + multi-pending-harness.ts + event-index.ts + check-wall-clock.ts + ishares-constituent-fetcher.ts) + 1 test update (ishares-constituent-fetcher_test.ts) + DW-077 instances #3 + #4 extension + ACT-121 + this changelog entry + system-state version bumps. Cumulative diff vs pre-execution SHA `4bdbabb` = 10 files (per §22.8.5(b) cumulative-diff verification, NOT commit count).

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification; operator-ratified Path 1 scope expansion 2026-05-27 per CI-INVESTIGATION-01 Option C-corrected + Stage 1 §22.8.4 STOP adjudication.

**Supersession Links:** AC-32 + AC-32-equivalent mechanical satisfaction realized at this SHA; per-affected-FP erratum addenda forthcoming via GOV-ERRATA-01 parallel doc-only FP.

**v0.6.4 first full-cycle validation-event attestation:** This commit's §22.3 (k) + §22.3 (l) + §22.5 (g) compliance is recorded inline at ACT-121 evidence section (c)–(e). The §22.5 (g) STOP discipline was independently validated when Lovable correctly refused to write false-green attestation upon discovering Gates 5/6 surfaces after the initial 3 TS fixes — proving the rule works as designed. Future commits binding to v0.6.4 must mirror this evidence shape.

### v13.29 — 2026-05-27 — Stage 1 PARTIAL Closure Attestation per Path C-Hybrid Ruling: External CI Confirmation 8-of-9 Green at SHA 4af83178 + DW-077 Extension (Instances #5, #6, #7) + AC-32 Forward-Bound to CI-FIX-02 (ACT-122)

**What Changed:**
- External GitHub Actions UI verification at SHA `4af83178` confirmed 8 of 9 strong-evidence.yml gates green (first time in repo history that DEC-034 + DEC-036 + ACT-097 + DW-058 B1 banned-pattern enforcement gates executed against any FP-008 code)
- Gate 4 (Vitest + ESLint) red on pre-existing test failures (env-shim absence + vi.mock factory hoist; both pre-date FP-007 workflow auth by 11 days; shadowed by Gate 2 TS compile failures throughout CI-INVESTIGATION-01 surface)
- AC-32 + AC-32-equivalent mechanical satisfaction REFRAMED from "REALIZED at 4af83178" to "PARTIAL at 4af83178 (8/9 gates green); REALIZATION forward-bound to CI-FIX-02 closure SHA"
- DW-077 extended with three new pattern-establishing instances per operator caveat 4 (split by class, not collapsed): #5 test-infrastructure-gap class (env-shim absence in src/test/setup.ts); #6 author-time-Vitest-semantics class (vi.mock factory hoist in rw018/rw019); #7 supervisor verification-tier class (accepting ambiguity-as-CLEAN when Lovable's §22.5 disposition disclosed capability gap without pass/fail count)
- Future-split trigger language updated to reflect 4-of-7 platform/tool-behavior pattern density across instances (#3 §22.8.5-constraint; #4 + #5 + #6 test-runner/build-tool-behavior; #7 supervisor-discipline-application); tightened taxonomy proposed but deferred to operator decision

**Why:** Path C-Hybrid ruling preserves ACT-121 attestation of real progress at 4af83178 (3 TS fixes + 2 detector fixes + ishares refactor + DW-077 extension) while documenting Stage 1 PARTIAL closure honestly. Gate 4 failures are structurally distinct from CI-FIX-01 scope (test-infrastructure + test-authoring vs TS compile + detectors); folding them into CI-FIX-01 would be unbounded scope creep that anti-bundling discipline exists to prevent. CI-FIX-02 / Stage 1.5 with strict env-shim + vi.hoisted refactor scope follows per operator caveats 2 + 3. Supervisor self-finding (instance #7) acknowledged transparently — §22.5 CLEAN acceptance should have been AMBIGUITY per disposition shape definitions; logged for forward-binding discipline.

**What Stayed:**
- DEC-038 + DEC-038.1 + DEC-034 + DEC-034.1 + DEC-035 + DEC-031 + DEC-032 + DEC-036 active
- ART-018 through ART-023 unchanged
- ADR-001 through ADR-007 unchanged
- All FP closure documents frozen per Option C-corrected (erratum addenda via GOV-ERRATA-01 will reference both SHAs — 4af83178 partial + CI-FIX-02 closure SHA final)
- Module status `phase-1-validated` (Option C-corrected = no rollback even at PARTIAL framing)
- FP entry Status / Date Closed / Closure Evidence preserved
- Master-plan AC ticks unchanged (GOV-ERRATA-01 publishes the final realization SHA reference)
- `.github/workflows/strong-evidence.yml` preserved verbatim
- INC-23 entry unchanged
- ACT-121 entry preserved verbatim (attests what it attested at 4af83178; ACT-122 documents subsequent external-verification outcome)
- DW-077 Field table + Part A + base Part B paragraphs (instances #1-#4) preserved verbatim; only Part B section appends three new instance paragraphs + updates future-split trigger

**What Was Added:** DW-077 instances #5 + #6 + #7 + updated future-split trigger + ACT-122 + this changelog entry + system-state version bumps. CI-FIX-02 / Stage 1.5 execution prompt forthcoming (separate authorization event).

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification; operator-ratified Path C-Hybrid 2026-05-27 with four caveats codified verbatim in DW-077 + ACT-122 evidence.

**Supersession Links:** None at this plan version. AC-32 + AC-32-equivalent mechanical-realization anchor forward-bound to CI-FIX-02 closure SHA per Path C-Hybrid two-SHA attestation chain; GOV-ERRATA-01 publishes per-affected-FP erratum addenda referencing both SHAs.

**Defect-#36 family lineage update:** Instance #5 (test-infrastructure-gap class — env-shim absence) + Instance #6 (author-time-Vitest-semantics class — vi.mock factory hoist) + Instance #7 (supervisor verification-tier class — ambiguity-as-CLEAN acceptance) all logged transparently. 4-of-7 platform/tool-behavior pattern density now drives the future-split decision; supervisor recommends preserving unified DW-077 discipline pending operator decision; tightened taxonomy options preserved in DW-077 trigger text.

**v0.6.4 second-validation-event attestation:** This commit's §22.3 (l) inline-citation pre-flight + §22.5 (g) honest capability-gap disclosure + supervisor self-finding (instance #7) all exercise v0.6.4 discipline at the second validation event (CI-FIX-01 was first; ACT-122 is second). Future commits binding to v0.6.4 must mirror this evidence shape.

### v13.30 — 2026-05-27 — CI-FIX-02 / Stage 1.5: Gate 4 Closure + AC-32 + AC-32-Equivalent Mechanical Satisfaction REALIZED (Path C-Hybrid Two-SHA Attestation Chain Complete) (ACT-123)

**What Changed:**
- Closed Gate 4 (Vitest + ESLint) of strong-evidence.yml workflow
- Env-shim added to src/test/setup.ts via beforeEach + vi.stubEnv per operator caveat 2 (preserves RW-021 fail-fast contract verbatim; no workflow yml env injection; no .env.test divergence)
- vi.mock factory hoist defect in rw018 + rw019 refactored to vi.hoisted() pattern per operator caveat 3 (preserves shared postMock spy semantics; assertion intent verified by 27/27 files + 248/248 tests green locally)
- AC-32 + AC-32-equivalent mechanical satisfaction REALIZED at this closure SHA per Path C-Hybrid two-SHA attestation chain (4af83178 partial + <this commit SHA> final)
- Recursive anti-bundling fence per operator caveat 1 honored at the Vitest tier (no other Vitest gate fallout); external Gates 1–9 confirmation pending operator GitHub Actions UI

**Why:** Stage 1.5 of the CI-INVESTIGATION-01 Path C-Hybrid corrective sequencing. CI-FIX-01 / Stage 1 closed 8 of 9 gates and surfaced Gate 4 pre-existing failures (env-shim absence + vi.mock factory hoist; pre-date FP-007 workflow auth by 11 days). Path C-Hybrid preserved ACT-121 at 4af83178 + documented partial closure at ACT-122 + scoped CI-FIX-02 strictly to Gate 4 per anti-bundling discipline. This commit closes the mechanical-enforcement-infrastructure realization arc that began at FP-006 / ACT-099.

**What Stayed:**
- All DECs / ARTs / ADRs unchanged
- All FP closure documents frozen per Option C-corrected (erratum addenda via GOV-ERRATA-01 will publish both 4af83178 + this SHA references)
- Module status `phase-1-validated`
- Master-plan AC ticks unchanged (AC-32 tick lands via GOV-ERRATA-01 addendum)
- `src/lib/env.ts` RW-021 fail-fast contract preserved verbatim (operator caveat 2)
- `.github/workflows/strong-evidence.yml` preserved verbatim
- `src/test/rw021-env-loader-fail-fast.test.ts` preserved verbatim
- DW-077 preserved (instances #5/#6/#7 documented at ACT-122; this ACT closes them at resolution-application tier without register modification)

**What Was Added:** Env-shim in src/test/setup.ts + vi.hoisted() refactor in rw018 + rw019 + ACT-123 + this changelog entry + system-state version bumps.

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification; operator-ratified Path C-Hybrid 2026-05-27 with four caveats codified verbatim.

**Supersession Links:** AC-32 + AC-32-equivalent mechanical-realization anchor at `<this commit SHA>` completes the two-SHA attestation chain. GOV-ERRATA-01 (parallel doc-only FP) and DEFECT-PLATFORM-01 (Stage 2) authorization open on this closure; FP-009 (Stage 3) gated on Stage 1 + Stage 2 CLEAN.

**v0.6.4 third-validation-event attestation:** §22.3 (l) inline-citation + §22.5 (g) external CI verification request + operator-caveat-1 recursive anti-bundling honor exercised at the third validation event.

### v13.31 — 2026-05-27 — CI-FIX-03 / Stage 1.6: Approach A Env-Shim Fix (Two-Location Module-Init + beforeEach) + AC-32 + AC-32-Equivalent Mechanical Satisfaction REALIZED (Path C-Hybrid Three-SHA Attestation Chain Complete) (ACT-124)

**What Changed:**
- Fixed Gate 4 (Vitest + ESLint) of strong-evidence.yml workflow at the env-shim timing tier
- `src/test/setup.ts` env-shim ADDED at module-init (top-level, after imports, before any beforeEach) per operator caveat 2.1 two-location ADD-not-MOVE specification
- Existing beforeEach `vi.stubEnv` calls RETAINED unchanged (belt-and-suspenders for RW-021 afterEach within-file teardown)
- Total `vi.stubEnv` count in setup.ts post-fix = 6 (3 at module-init + 3 in beforeEach); CI-FIX-02 form had 3 in beforeEach only
- RW-021 fail-fast contract preserved verbatim (src/lib/env.ts unchanged; rw021-env-loader-fail-fast.test.ts unchanged; workflow yml unchanged)
- rw017 + rw018 + rw019 unchanged (CI-FIX-02 vi.hoisted refactor stays — that was correct for postMock factory hoist defect; only timing of env-shim was the CI-FIX-02 defect)
- DW-077 extended with pattern-establishing instance #8 (supervisor verification-tier, sub-type grep-convention assumption) + pattern-establishing instance #9 (test-infrastructure-gap + author-time Vitest-semantics composite) per operator caveat 3 Scope A
- DW-077 future-split trigger updated with operator-verbatim tightened conjunctive language per operator caveat 4: "Density alone (currently 5-of-9) does not trigger; cleavage clarity does"
- DW-079 split DEFERRED — cleavage criterion unmet despite 5-of-9 density crossing the loose threshold
- Local-vs-CI divergence (Lovable 248/248 local vs CI 246/248 at SHA a00ce8eb) noted as forward-binding flag in ACT-124 evidence per operator caveat 5; root cause was env-shim timing per instance #9, not container divergence; INC-25 escalation deferred unless pattern continues
- AC-32 + AC-32-equivalent mechanical satisfaction REALIZED at this closure SHA per Path C-Hybrid THREE-SHA attestation chain (4af83178 partial-1 + a00ce8eb partial-2 + this commit SHA final)
- First FULL-GREEN run of strong-evidence.yml in repo history at <this commit SHA> (subject to operator external CI confirmation)
- Vitest hoist-order pre-flight verification table cited inline per operator caveat (the 30-second sanity check hard-codified per https://vitest.dev/guide/mocking + GitHub issue #3228 + GitHub issue #4232 primary sources)

**Why:** Stage 1.6 of the CI-INVESTIGATION-01 Path C-Hybrid corrective sequencing. CI-FIX-02 closed Gate 4 at the local-Vitest tier (Lovable's verifiable layer) but failed external CI on env-shim timing — vi.mock factories hoist BEFORE imports within their own test file; setupFiles top-level executes BEFORE the test file loads. CI-FIX-02 caveat 2 conflated those two boundaries. CI-FIX-03 (this fix) applies the correct two-location shim: module-init for primary vi.mock-factory-timing protection + beforeEach for RW-021 afterEach belt-and-suspenders. Per Path C-Hybrid Three-SHA extension: each SHA in the chain represents real progress with honest forward-binding to the next SHA when partial-realization remains; this commit's SHA completes the chain.

**What Stayed:**
- DEC-038 + DEC-038.1 + DEC-034 + DEC-034.1 + DEC-035 + DEC-031 + DEC-032 + DEC-036 active
- ART-018 through ART-023 unchanged
- ADR-001 through ADR-007 unchanged
- All FP closure documents frozen per Option C-corrected (erratum addenda via GOV-ERRATA-01 will publish all three SHAs)
- Module status `phase-1-validated` (Option C-corrected ruling — no rollback)
- FP entry Status / Date Closed / Closure Evidence preserved (GOV-ERRATA-01 publishes addenda)
- Master-plan AC ticks unchanged (AC-32 tick lands via GOV-ERRATA-01 addendum referencing all three closure SHAs)
- `src/lib/env.ts` RW-021 fail-fast contract preserved verbatim (operator caveat 2)
- `.github/workflows/strong-evidence.yml` preserved verbatim
- `src/test/rw021-env-loader-fail-fast.test.ts` preserved verbatim
- rw017 + rw018 + rw019 preserved (CI-FIX-02 vi.hoisted refactor stays)
- setup.ts beforeEach block RETAINED unchanged per operator caveat 2.1
- INC-23 + ACT-103 through ACT-123 preserved (append-only)
- DW-077 instances #1-#7 preserved verbatim; only Scope — Part B appends #8 + #9 + updates future-split trigger

**What Was Added:** Module-init `vi.stubEnv` calls in src/test/setup.ts (3 lines + JSDoc updates) + DW-077 instances #8 + #9 + DW-077 future-split trigger tightened-conjunctive update + ACT-124 + this changelog entry + system-state version bumps.

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification; operator-ratified CI-FIX-03 four-caveat authorization 2026-05-27 with Scope A confirmation + caveat 2.1 two-location-ADD-not-MOVE pre-paste flag + DEFER DW-079 split tightened-conjunctive ruling.

**Supersession Links:** AC-32 + AC-32-equivalent mechanical-realization anchor at `<this commit SHA>` completes the THREE-SHA attestation chain (4af83178 + a00ce8eb + this SHA). GOV-ERRATA-01 parallel doc-only FP authorization opens immediately on this closure. DEFECT-PLATFORM-01 (Stage 2) authorization also opens (can run in parallel with GOV-ERRATA-01). FP-009 (Stage 3) gated on Stage 1 + Stage 2 CLEAN.

**v0.6.4 fourth-validation-event attestation:** §22.3 (l) inline-citation + §22.5 (g) external CI verification request + operator-caveat-1 recursive anti-bundling honor + Vitest hoist-order pre-flight verification + operator-caveat-2.1 two-location ADD-not-MOVE diff specification exercised at the fourth validation event (CI-FIX-01 first; ACT-122 second; ACT-123 third; ACT-124 fourth).

### v13.32 — 2026-05-27 — CI-FIX-04 / Stage 1.7: FP-Scope `any` Fixes + DW-078 Deferral + ACT-124 Forward-Binding to PARTIAL (Option B + B.1 Framing) (ACT-125)

**What Changed:**
- Fixed 17 `@typescript-eslint/no-explicit-any` violations across 4 FP-scope test files (apply-hard-exclusions_test.ts 7× via typed `ExclusionInputData` object-spread; earnings-calendar-fetcher_test.ts 4× via `as unknown as typeof fetch`; short-interest-fetcher_test.ts 3× via `as unknown as typeof fetch`; universe-service.test.ts 3× via typed `MockFlagBuilder`/`MockRowsBuilder` interfaces + `as unknown as SupabaseClient`)
- Registered DW-078 with full inventory of deferred ESLint violations (47 total: 24 @ts-nocheck + 2 @ts-ignore + ~17 app-layer `any` + 4 misc) per operator Option B explicit deferral
- ACT-125 forward-binds ACT-124's "AC-32 REALIZED" language to PARTIAL per operator B.1 framing + ACT-121→ACT-122 shape precedent; ACT-124 preserved verbatim
- Path C-Hybrid attestation chain extends from 3-SHA to 4-SHA-with-5th-pending: 4af83178 + a00ce8eb + 9ebce0fd + this commit SHA + <DW-078 resolution SHA>
- AC-32 + AC-32-equivalent mechanical satisfaction remains PARTIAL pending DW-078 resolution (honest forward-binding per operator B.1 rationale)
- §22.3 (l) PRE-FLIGHT discipline extended per Decision 4: ESLint pre-execution surface now required in supervisor pre-flight tables for future CI-fix cycles

**Why:** Stage 1.7 of CI-INVESTIGATION-01 Path C-Hybrid corrective sequencing. CI-FIX-03 closed Gate 4 Vitest portion (27/27 + 248/248 green externally) but external CI surfaced 59 pre-existing ESLint errors in Gate 4 ESLint portion that had been shadowed by TS compile failures (pre-CI-FIX-01) and env-shim timing defect (pre-CI-FIX-03). Per operator caveat 1 (recursive anti-bundling fence) and Option (B) authorization: CI-FIX-04 fixes only the FP-scope `any` violations and defers the @ts-nocheck architectural question + app-layer technical debt to DW-078. Per operator B.1 framing: AC-32 stays PARTIAL rather than redefining the success criterion mid-execution.

**What Stayed:**
- DEC-038 + DEC-038.1 + DEC-034 + DEC-034.1 + DEC-035 + DEC-031 + DEC-032 + DEC-036 active
- ART-018 through ART-023 unchanged
- ADR-001 through ADR-007 unchanged
- All FP closure documents frozen per Option C-corrected
- Module status `phase-1-validated` preserved
- FP entry Status / Date Closed / Closure Evidence preserved (GOV-ERRATA-01 publishes addenda AFTER DW-078 resolves)
- Master-plan AC ticks unchanged (AC-32 + AC-32-equivalent still PARTIAL)
- `src/lib/env.ts` RW-021 fail-fast contract preserved verbatim
- `.github/workflows/strong-evidence.yml` preserved verbatim
- `src/test/setup.ts` CI-FIX-03 two-location shim preserved verbatim
- `src/test/rw021-env-loader-fail-fast.test.ts` + rw017 + rw018 + rw019 preserved
- `eslint.config.js` preserved (Option B — architectural question deferred)
- DW-077 entry preserved verbatim (no instance #10 per Decision 4)
- INC-23 preserved
- ACT-001 through ACT-124 preserved verbatim (ACT-124 explicitly NOT modified per operator pre-flight note; ACT-125 carries forward-binding correction)

**What Was Added:** 4 FP-scope test file fixes (17 `any` violations remediated) + DW-078 new register entry + ACT-125 forward-binding entry + this changelog entry + system-state version bumps.

**What Was Removed:** Nothing.

**Approval Status:** Per Constitution Rule 11 financial-critical HIGH classification; operator-ratified CI-FIX-04 Option (B) + B.1 framing 2026-05-27.

**Supersession Links:** AC-32 + AC-32-equivalent mechanical-realization anchor REMAINS PARTIAL at this CI-FIX-04 closure SHA; final realization forward-bound to `<DW-078 resolution SHA>` (unscheduled pending architectural authorization for @ts-nocheck disposition). GOV-ERRATA-01 parallel doc-only FP authorization deferred to AFTER DW-078 resolves. DEFECT-PLATFORM-01 (Stage 2) authorization MAY proceed in parallel. FP-009 (Stage 3) remains gated on Stage 1 + Stage 2 CLEAN — Stage 1 closure now requires DW-078 resolution as the gating event.

**v0.6.4 fifth-validation-event attestation:** §22.3 (l) inline-citation + §22.5 (g) external CI verification request + operator-caveat-1 recursive anti-bundling honor + ESLint pre-execution surface added per Decision 4 + forward-binding ACT-124→ACT-125 honoring ACT-121→ACT-122 shape precedent.

---

### Post-v13.32 — 2026-06-21 — PLAN-007 Status Reconciliation (ACT-260)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule (plan-revisions-are-merges) + Rule 8 no-silent-supersession. PLAN-TRADING-001-LONGSHORT-007 Status line + Sub-step `[ ] 3.0` inventory line reconciled to verified actual build state against repo HEAD `80dd8b2e` + live DB read 2026-06-21. NO version bump — the deferred v13.32 → v13.33 bump stays deferred to formal Gate-3.0 closure per ACT-230 clarifier (Constitution Rule 9 Execution Lock — `approved_plan_baseline` stays until 3.0 full closure).

| Field | Value |
|---|---|
| Plan Version | v13.32 (unchanged — v13.33 bump remains deferred per ACT-230) |
| Section IDs Created | None |
| Section IDs Closed | None at this entry (sub-step granularity: 3.0a / 3.0b / 3.0c / 3.M reconciled as CLOSED with anchors; 3.0d + exit-gate + Gate-3.0 stay OPEN; full PLAN-007 closure pending Gate-3.0) |
| FP IDs Created | None (FP-052 Status unchanged) |
| Decision IDs Affected | None — DEC-059 (DW-109 resolution rule) characterized verbatim at ACT-259; no amendment authored here |
| What Changed | (1) PLAN-007 Status field — stale `authoring (2026-06-14 — ...; build authorization gated on operator-approved execution prompt; 3.1/3.2/3.3 sub-step rows scaffolded only)` reconciled to `execution-in-progress (reconciled 2026-06-21 via ACT-260 ...)` with verified anchors for every closed sub-step (3.0a MIG-099/ACT-233; 3.0b ACT-235/236/237; 3.0c ACT-238/239 commit c0b81019; 3.M MIG-100/ACT-241..247, live cron jobid 97/98 active=true) and explicit open-state for 3.0d + exit-gate + Gate-3.0 (live read confirmed: 0 active models, 0 non-fallback rankings — state satisfied, formal closure pending). The original `authoring` text was preserved verbatim on the left side of the `→` arrow per Rule 8 no-silent-supersession. (2) PLAN-007 Sub-step inventory — original `[ ] 3.0` line preserved byte-unchanged; six-bullet verified breakdown added as an indented children list beneath it ([x] 3.0a / [x] 3.0b / [x] 3.0c / [x] 3.M / [ ] 3.0d / [ ] exit-gate). 3.1 / 3.2 / 3.3 sibling lines + Phase Gates block + Plan-Version-impact clause byte-unchanged. (3) ACT-260 entry in `action-tracker.md` registering the reconciliation + verbatim anchor proofs. |
| Why | Pre-existing PLAN-007 Status read `authoring` and the inventory hid four closed sub-steps + the precise residual scope (3.0d + exit-gate) behind a single `[ ] 3.0` line. Reading the plan against repo HEAD + live DB at 2026-06-21 showed 3.0a/b/c/M are CLOSED and 3.M is cron-armed; the queryable exit-gate state is already satisfied. A Constitution Rule 6 documentation-discipline gap surfaced: docs no longer matched behavior. Reconciliation is Rule 10 additive merge — closure claims were ground-truth-gated before writing per Rule 8 (every `[x]` cites a tracker ACT + the live cron/DB read that confirms it); no `[x]` was written without verifiable anchor; 3.0d + exit-gate + Gate-3.0 remain `[ ]` because they are open. The reconciliation does NOT close PLAN-007 — it makes the plan honest about how far execution has come. |
| What Stayed | All other PLAN entries preserved verbatim. All DECs / ADRs / DWs / ARTs preserved verbatim. PLAN-007 `Parent Plan` / `Feature Proposal` / `Risk Level` / `Module Doc` / `CROSSWIND anchors` / `Dependencies` / `Sub-step inventory` 3.1 / 3.2 / 3.3 rows / `Phase Gates` block / `Plan Version impact` clarifier byte-unchanged. The original `[ ] 3.0` summary line preserved byte-unchanged with the six verified bullets added as an indented breakdown beneath. `system-state.md` NOT touched (no version bump). Deferred-work-register byte-unchanged (DW-100 / DW-101 already registered; FP-052.3 / 3.3 is an FP placeholder, not a deferred work item — no register entry required by schema). No code / schema / migration / cron / edge-function / other-doc touch. |
| What Was Added | PLAN-007 Status reconciled text (preserves stale text on left of arrow per Rule 8); six verified sub-step bullets indented beneath the preserved `[ ] 3.0` line; ACT-260 entry; this changelog entry. |
| What Was Removed | Nothing — additive only per Rule 10. The stale `authoring` Status text is preserved on the left side of the `→` arrow. |
| Approval Status | Approved per operator Phase-3 re-grounding step 2 (operator-ratified sequence) 2026-06-21. Tier-C documentation-only; no DEC amendment cycle invoked. |
| Supersession Links | N/A — additive merge; no approved sections superseded. The PLAN-007 stale `authoring` Status text is preserved on the left side of the `→` arrow per Rule 8 no-silent-supersession (the reader sees both the prior state and the reconciled state). |

---

### v13.32 → v13.33 — 2026-06-23 — PLAN-TRADING-001-LONGSHORT-007 Sub-Phase 3.0 / Gate-3.0 CLOSED (FP-052 (3.0)) (ACT-281)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. Formal Gate-3.0 closure attestation for PLAN-TRADING-001-LONGSHORT-007 sub-phase 3.0 (FP-052 (3.0)) — applies the v13.32 → v13.33 bump that was deferred at FP-052 (3.0) authoring per ACT-230 clarifier (Constitution Rule 9 Execution Lock — bump deferred until Gate-3.0 closure, which is this attestation).

| Field | Value |
|---|---|
| Plan Version | v13.32 → v13.33 |
| Section IDs Changed | PLAN-TRADING-001-LONGSHORT-007 (Status field appended `→ Phase-3.0 CLOSED 2026-06-23 (Gate-3.0 / ACT-281)` per Rule 8 no-silent-supersession; prior `authoring` + `execution-in-progress (reconciled 2026-06-21 via ACT-260)` text preserved verbatim on the left side of the `→` arrow); two `[ ]` checkboxes flipped to `[x]` under the sub-step inventory — `3.0d` (ARMED 2026-06-21 10:19:46 UTC, live-verified at this closure) and `exit-gate + Gate-3.0` (queries 0/0 live-verified 2026-06-23). |
| Section IDs Closed | PLAN-TRADING-001-LONGSHORT-007 sub-phase **3.0 only** (Gate-3.0). PLAN-007 plan section as a whole remains OPEN — 3.1 (DW-100 backfill) / 3.2 (DW-101 regime) / 3.3 (FP-052.3 LambdaRank) sub-step rows preserved byte-unchanged and remain PENDING. |
| FP IDs Affected | FP-052 (3.0) — closed; FP-052.1 / FP-052.2 / FP-052.3 unchanged. |
| Decision IDs Affected | None. DEC-054 / DEC-059 (DW-109 resolution rule, 3.M anchor) unchanged. |
| What Changed | (1) Authored `docs/08-planning/phase-closures/plan-trading-001-longshort-007-closure.md` mirroring the FP-008 (`plan-trading-001-longshort-003-closure.md`) template structure: header block + Summary + Gate-3.0 verbatim-definition-vs-evidence table + 3.0d arm-state live evidence + populated-book live evidence (as_of 2026-06-22: feature_vectors=839 / rankings=359 / book=40) + cron-attributable fire evidence (cron.job_run_details jobid 102 succeeded 2026-06-22 23:35:00+00 + jobid 103 succeeded 2026-06-22 23:50:00+00) + exit-gate attestation (combiner_model_registry WHERE status='active' = 0 AND combiner_rankings WHERE ranker_source <> 'count_normalized_fallback' = 0, live-verified 2026-06-23) + sub-step closure matrix + anti-completion-theater sourcing statement + scope-boundary note (3.1/3.2/3.3 PENDING, out-of-scope) + lock statement. (2) Master-plan PLAN-TRADING-001-LONGSHORT-007 Status appended with the CLOSED state per Rule 8 additive shape. (3) Master-plan 3.0d checkbox `[~]` → `[x]`; exit-gate + Gate-3.0 checkbox `[ ]` → `[x]`. (4) `docs/04-modules/longshort/longshort.md` Combiner section header updated to `## Combiner (FP-052 — Phase 3.0 CLOSED 2026-06-23)` with a one-paragraph status block (combiner-foundation-validated; mirrors the FP-008 `phase-1-validated` precedent shape; closure-doc cross-reference); Enhancement Phase Ladder and roi-roadmap cross-ref byte-unchanged per the closure prompt scope. (5) `docs/06-tracking/action-tracker.md` ACT-281 row added at top. (6) This changelog entry. |
| Why | All three Gate-3.0 closure prerequisites verified read-only against the live DB on 2026-06-23: (i) 3.0d ARMED — job_registry `longshort.combiner_assemble.compute` + `longshort.combiner_rank.compute` both `enabled=true` (flipped 2026-06-21 10:19:46 UTC); cron.job jobid 102 + 103 both `active=true`. (ii) populated book — 2026-06-22 row counts 839 / 359 / 40; cron-attributable fires confirmed for jobid 102 (23:35) + jobid 103 (23:50). (iii) exit-gate green — `combiner_model_registry WHERE status='active'` = 0 AND `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback'` = 0. The closure honors the ACT-230 clarifier sequencing exactly: the v13.32 → v13.33 bump deferred at FP-052 (3.0) authoring lands at the formal Gate-3.0 closure attestation, not before, per Constitution Rule 9 Execution Lock. |
| What Stayed | All DECs / ADRs / DWs / ARTs preserved verbatim. PLAN-TRADING-001-LONGSHORT-007 `Parent Plan` / `Feature Proposal` / `Risk Level` / `Module Doc` / `CROSSWIND anchors` / `Dependencies` / `Sub-step inventory` 3.1 / 3.2 / 3.3 rows / `Phase Gates` block / `Plan Version impact` clarifier byte-unchanged. The PLAN-007 plan section as a whole remains OPEN at 3.1/3.2/3.3; only sub-phase 3.0 closes here. Stale `authoring` Status text + ACT-260 reconciled-text preserved on the left side of the `→` arrow per Rule 8 no-silent-supersession. The Enhancement Phase Ladder + ROI Roadmap cross-ref in `longshort.md` preserved byte-unchanged per the closure prompt scope. No code / no migration / no SQL / no Supabase Edge Functions / no arm-flip / no fire — documentation-only closure; all referenced state already landed in prior ACTs/MIGs/operator-applied flips and was verified read-only ahead of this attestation. |
| What Was Added | The closure-doc file `docs/08-planning/phase-closures/plan-trading-001-longshort-007-closure.md`; the appended `→ Phase-3.0 CLOSED 2026-06-23` Status segment on PLAN-TRADING-001-LONGSHORT-007; two `[x]` checkbox flips (3.0d + exit-gate + Gate-3.0); the `## Combiner (FP-052 — Phase 3.0 CLOSED 2026-06-23)` heading + status paragraph in `longshort.md`; ACT-281 in the action tracker; this changelog entry. |
| What Was Removed | Nothing — additive only per Rule 10. The `[~]` and `[ ]` checkbox marks were flipped to `[x]` (the prior states were the in-flight markers the sub-step inventory uses to express progress; the closure attestation is the authorized state-transition surface and the appended Status segment plus this changelog entry preserve the prior-state history). |
| Approval Status | Approved per operator-authorized closure prompt 2026-06-23 (HEAD `da9d60c0` at execution start). Tier-B financial-critical / Constitution Rule 11 HIGH; anti-completion-theater binding: every asserted state cites a verified ACT / MIG / live-DB read of 2026-06-23. |
| Supersession Links | N/A — additive merge; no approved sections superseded. The PLAN-007 prior `authoring` + ACT-260 reconciled-text Status states are preserved on the left side of the `→` arrow per Rule 8 no-silent-supersession (the reader sees the full Status history: authoring → execution-in-progress (reconciled) → Phase-3.0 CLOSED). |

### v13.33 → v13.34 — 2026-06-23 — FP-052.3 (3.3a) Promotion-Gate Foundation Landed + DEC-063 SHAP/C6 Carve-Out (ACT-283 / MIG-115)

**Type:** Additive per Constitution Rule 10 Plan Merge Rule. Materializes the FP-052.3 entry (placeholder declared at FP-052 (3.0) authoring per Rule-8 step-1 stable-ID reference); adds 3.3a `[x]` + 3.3b/3.3c `[ ]` sub-rows under PLAN-TRADING-001-LONGSHORT-007 sub-step 3.3; authors DEC-063 (SHAP/C6 temporal relocation to DW-136 landing per Clause 3 — §10.7 line 322 preserved in spec, re-gated post-DW-136; horizon CHECK widened to T+10 per §6.1/§6.2 LOCK; atomic promote/rollback RPC contract codified). No prior approved section is dropped or rewritten — 3.3 sub-step row preserved verbatim with the new 3.3a/b/c rows nested below it.

| Field | Value |
|---|---|
| Plan Version | v13.33 → v13.34 |
| Section IDs Changed | PLAN-TRADING-001-LONGSHORT-007 sub-step 3.3 — `[ ] 3.3` parent row PRESERVED verbatim; three new nested rows added under it: `[x] 3.3a` (LANDED at ACT-283 / MIG-115), `[ ] 3.3b` (LightGBM-LambdaRank training pipeline, separate prompt), `[ ] 3.3c` (DW-136 SHAP write path + DEC-063 Clause-3 re-gate execution, separate prompt). |
| Section IDs Closed | None. PLAN-007 plan section as a whole remains OPEN; 3.3 sub-step row remains OPEN (the parent stays `[ ]` until all three sub-rows close + Gate-3.3 attestation lands at the 3.3c closure prompt). |
| FP IDs Affected | FP-052.3 — materialized (the entry was a placeholder; this commit authors the full Risk-A Tier-A entry with the 3.3a scope landed and 3.3b/3.3c scaffolded). FP-052 / FP-052.1 / FP-052.2 unchanged. |
| Decision IDs Affected | NEW DEC-063 (inline in `approved-decisions.md` per the ACT-282 / DEC-062 precedent; standalone-file promotion to `docs/decisions/DEC-063-combiner-promotion-gate-v1-shap-carveout.md` tracked for a later scope-permitting turn). DEC-062 unchanged (still the DW-100-inversion governance). |
| What Changed | (1) Authored MIG-115 via `supabase--migration` tool (§22.5.1 atomic create+apply): additive widen of `combiner_forward_returns.horizon_td CHECK` from `IN (1,5,20)` to `IN (1,5,10,20)` honoring §6.1/§6.2 T+10 LOCK + zero data migration; `promote_combiner_model(p_model_id uuid)` `SECURITY DEFINER` `service_role`-only RPC enforcing single-active-per-side via retire-first ordering; `rollback_combiner_model(p_side text)` `SECURITY DEFINER` `service_role`-only RPC with the same atomicity. (2) Forward-returns fetcher T+10 pair-edit (`forward-return-constants.ts` + `forward-return-orchestrator.ts`); T+1/5/20 logic byte-unchanged. (3) NEW pure `promotion-criteria-evaluator.ts` implementing C1/C2/C9/C10/C12 with NAMED CONSTANT CANDIDATE thresholds + `TRAINING_HORIZON_TD=10` + `CARVED_OUT_CRITERIA=['C6_SHAP_attribution_traceable']`. (4) NEW Deno tests including the current-substrate snapshot invariant ("evaluator returns `{not_computable, not_yet}` against current substrate — that is the CORRECT v1 state, not a failure"). (5) DEC-063 authored inline (six clauses: SHAP/C6 carve-out + reason + re-gate condition + horizon widen + atomic RPC contract + retained criteria). (6) FP-052.3 entry materialized (Tier A; in-scope 3.3a / out-of-scope 3.3b/3.3c; candidate criteria matrix C1-C12 with C6 carved per DEC-063 noted; acceptance criteria; capability-gap surface). (7) Master-plan PLAN-007 sub-step 3.3 ladder updated (3.3a `[x]` + 3.3b/c `[ ]`). (8) Reference indexes same-PR: `function-index.md` two RPC rows + `database-migration-ledger.md` MIG-115 row. (9) `longshort.md` Phase 3.3 promotion-gate section added. (10) ACT-283 row at action-tracker top. (11) This changelog entry. |
| Why | (a) Two operator-ratified forks resolved via dual-investigation reconciliation: horizon = Option 1 (smallest spec-honoring change); SHAP = DEC-063 carve-out with re-gate (only path that doesn't create an indefinite-stall failure mode worse than the bounded diagnostic loss). (b) The promotion-gate RPC + criteria evaluator + horizon storage are the substrate contract 3.3b consumes; landing them before 3.3b authoring honors the dependency direction DEC-062 surfaced and prevents the inverted-dependency anti-pattern. (c) The DEC-063 re-gate condition is non-negotiable: §10.7 line 322 is preserved in spec; the carve-out is temporal, not permanent; DW-136 landing automatically triggers re-evaluation per Clause 3. |
| What Stayed | All prior DECs / ADRs / DWs / ARTs preserved verbatim. PLAN-TRADING-001-LONGSHORT-007 `Parent Plan` / `Feature Proposal` / `Risk Level` / `Module Doc` / `CROSSWIND anchors` / `Dependencies` / `Sub-step inventory` 3.0/3.1/3.2/3.3 parent rows / `Phase Gates` block / `Plan Version impact` clarifier byte-unchanged. The Phase-3.0 CLOSED Status preserved. The fallback ranker stays the active path; `combiner_model_registry WHERE status='active'` remains 0 (live-verified post-MIG-115); Gate-3.0 exit-gate queries continue to return 0/0. No prior approved section dropped or rewritten — 3.3a/b/c rows are NESTED under the existing approved 3.3 row, not a replacement. |
| What Was Added | DEC-063 (inline); FP-052.3 entry; MIG-115 row; ACT-283; `promote_combiner_model` + `rollback_combiner_model` function-index rows; Phase 3.3 promotion-gate section in `longshort.md`; the pure `promotion-criteria-evaluator.ts` + tests; the forward-return-fetcher T+10 pair-edit; the three sub-step rows (3.3a/b/c); this changelog entry. |
| What Was Removed | Nothing — additive only per Rule 10. The horizon-CHECK widening DROP+ADD is additive in semantic (the new constraint is a strict superset of the prior; every prior-valid row remains valid). |
| Approval Status | Approved per operator-authorized execution prompt 2026-06-23 (HEAD `be182a35` at execution start; the two upstream forks operator-ratified before this prompt: horizon = Option 1, SHAP/C6 = DEC-063 carve-out). Tier-A financial-critical / Constitution Rule 11 HIGH; anti-completion-theater binding: every asserted state cites a verified live read of 2026-06-23. |
| Supersession Links | N/A — additive merge; no approved sections superseded. DEC-063 does NOT supersede the §10.7 line 322 exit gate (it temporally relocates it per Clause 1; the spec literal is preserved; the carve-out is bounded by the Clause-3 re-gate condition). |
