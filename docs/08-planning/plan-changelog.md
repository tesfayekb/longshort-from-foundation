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
