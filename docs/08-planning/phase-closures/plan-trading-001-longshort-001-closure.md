# Phase Closure: PLAN-TRADING-001-LONGSHORT-001 — Long-Short Strategy Module Bootstrap (FP-005)

> **Plan ID:** PLAN-TRADING-001-LONGSHORT-001
> **Approval:** FP-005 / DEC-030 / DEC-031 / DEC-032 / DEC-033 v4.1
> **Closure Date:** 2026-05-21
> **Action IDs:** ACT-070 (bootstrap implementation), ACT-071 (E2E suite), ACT-072 (closure document)
> **Migrations:** MIG-037 (`longshort.view`, `longshort.manage` seed — NO `.execute`), MIG-038 (`public.longshort_audit_logs`)
> **Status:** Implemented — phase gate closed, all 23 acceptance criteria verified.

---

## Summary

Landed the first strategy module on the trading-panel architectural pattern. FP-005 delivers a **bootstrap surface only** per DEC-032 clause 1: module documentation, RBAC seed (two permissions, no role grants), per-strategy append-only audit table + writer probe, T1 directory scaffold, façade discipline locked to a 3-name template, route gating at `/trading/longshort`, and the `.cursorrules` rule that enforces façade shape for every future strategy. The audit-writer trap (T4) is closed in a live code path for the first time via `writeStrategyAuditEvent` consuming `_shared/strategy-audit.ts` exclusively — zero references to the platform `_shared/audit.ts` writer survive in strategy code.

Reconciliation engine, signal/order logic, `longshort.execute`, Tier 3 runbooks, CI/CD, and the >150s long-running-job detection pattern are intentionally **out of scope** and deferred to FP-006 / FP-007 per DEC-032 clauses 2–4 + 7.

---

## Acceptance Criteria — Evidence

All 23 acceptance criteria from FP-005 "Approved implementation outline" AC matrix v2.1 are evidenced below. Sub-step closure SHAs are recorded per supervisor v0.4 §22.6 verification logs.

| AC | Subject | Evidence |
|----|---------|----------|
| AC-01 | INC-15 doc-only fix | Step 5.0a closure SHA `c4b8a96`; INC-15 status `Resolved` in `docs/06-tracking/incidental-findings.md` |
| AC-02 | `strategy-module-pattern.md` audit-writer contract rewrite per DEC-033 v4.1 | Step 5.0a closure SHA `c4b8a96`; §Audit-Writer Contract rewritten |
| AC-03 | DEC-031 sub-point 3 wording clarification per DEC-032 | Step 5.0a closure SHA `c4b8a96` |
| AC-04 | DEC-031 sub-point 6 wording clarification per DEC-032 | Step 5.0a closure SHA `c4b8a96` |
| AC-05 | Canonical shared helper `_shared/strategy-audit.ts` + unit tests | Step 5.0b closure SHA `f55a877`; `supabase/functions/_shared/strategy-audit.ts` + `_test.ts` |
| AC-06 | `longshort.md` Phase Scope table (≥16 rows) + ART-018 | Step 5.1 closure SHA `554d7c1`; `docs/04-modules/longshort/longshort.md`; `docs/07-reference/artifact-index.md` ART-018 |
| AC-07 | MIG-037 RBAC seed: `longshort.view`, `longshort.manage` — NO `.execute` | Step 5.2 closure SHA `274e235`; `supabase/migrations/20260521120000_step_5_2_longshort_rbac_seed.sql` |
| AC-08 | `permission-index.md` updated for both keys | Step 5.2 closure SHA `274e235`; `docs/07-reference/permission-index.md` |
| AC-09 | `LONGSHORT_PERMISSION_KEYS` constant on façade | Step 5.2 closure SHA `274e235`; `src/features/longshort/index.ts` |
| AC-10 | MIG-038 `public.longshort_audit_logs` with `operator_id` default UUID + `correlation_id` | Step 5.3 closure SHA `e5d2235`; `supabase/migrations/20260521130000_step_5_3_longshort_audit_table.sql` |
| AC-11 | Platform `audit_logs` schema unchanged | Step 5.3 closure SHA `e5d2235`; diff inspection — no `public.audit_logs` ALTER |
| AC-12 | RLS append-only (INSERT-only policy) | Step 5.3 migration; `longshort_audit_logs_insert_policy` only — no UPDATE/DELETE policies |
| AC-13 | `longshort-emit-init` edge function (DEC-023 envelope) | Step 5.3 closure SHA `e5d2235`; `supabase/functions/longshort-emit-init/index.ts` |
| AC-14 | T4 audit-writer trap closed (rg-zero proof in live code path) | Step 5.3 closure SHA `e5d2235`; `longshort-emit-init/index.ts` imports `writeStrategyAuditEvent` exclusively; zero `logAuditEvent` references |
| AC-15 | T1 scaffold under `src/features/longshort/` (6 subdirs + index.ts) | Step 5.4 closure SHA `67bf6ba`; `src/features/longshort/{api,components,hooks,services,types,utils}/README.md` + `index.ts` |
| AC-16 | Façade export surface = `{ longshortNav, LONGSHORT_PERMISSION_KEYS, LongShortDashboardPage }` | Step 5.5 closure SHA `c3c4804`; `src/features/longshort/index.ts` |
| AC-17 | `.cursorrules` Rule T1a codifying 3-name template | Step 5.5 closure SHA `c3c4804`; `.cursorrules` |
| AC-18 | `trading-navigation.ts` DEC-031 sub-point 6 carve-out exercised | Step 5.5 closure SHA `c3c4804`; `src/config/trading-navigation.ts` |
| AC-19 | Page wrappers façade-only (no deep imports) | Step 5.5 closure SHA `c3c4804`; `src/pages/trading/longshort/LongShortDashboardPage.tsx` imports only from `@/features/longshort` |
| AC-20 | No sibling-strategy imports | Step 5.5 closure SHA `c3c4804`; diff inspection — only `longshort` strategy exists, no sibling-strategy import paths present |
| AC-21 | E2E spec asserts `/trading/longshort` RBAC gating (3 scenarios) | Step 5.6 (this closure); `e2e/longshort/longshort-access.spec.ts` `Long-short strategy access control` describe block |
| AC-22 | E2E spec asserts `longshort-emit-init` audit emission with correlation_id | Step 5.6 (this closure); `e2e/longshort/longshort-access.spec.ts` `Long-short audit emission` describe block |
| AC-23 | `system-state.md` transitioned; `action-tracker.md` registered; master-plan Phase Gate ticked; closure document published | Step 5.6 (this closure); `docs/00-governance/system-state.md` longshort → `foundation-implemented`; ACT-070/071/072 in `docs/06-tracking/action-tracker.md`; this document |

---

## Migrations

- **MIG-037** — `supabase/migrations/20260521120000_step_5_2_longshort_rbac_seed.sql` — idempotent `INSERT ... ON CONFLICT (key) DO NOTHING` seeding `longshort.view` and `longshort.manage` into `public.permissions`. Per DEC-031 sub-point 10, no role grants — only superadmin inheritance applies until trader-class roles are created.
- **MIG-038** — `supabase/migrations/20260521130000_step_5_3_longshort_audit_table.sql` — creates `public.longshort_audit_logs` (10 columns; `operator_id` standalone with default UUID `'00000000-0000-0000-0000-000000000001'`, no FK per DEC-032 clause 5 F-2; `correlation_id` column). Enables RLS with INSERT-only policy `longshort_audit_logs_insert_policy` (append-only by absence of UPDATE/DELETE policies). Creates `idx_longshort_audit_logs_correlation_id` for trace lookups.

Both migrations registered in `docs/07-reference/database-migration-ledger.md`. Tables-summary count updated to 14 in this closure (deferred from Step 5.3 per execution-prompt §22.3 item 1 anti-creep boundary).

---

## Reference Index Reconciliation

| Index | Entry |
|-------|-------|
| `permission-index.md` | `longshort.view`, `longshort.manage` (Step 5.2) |
| `event-index.md` | `longshort.init` (Step 5.3) |
| `route-index.md` | `/trading/longshort` gated by `longshort.view` (Step 5.5) |
| `artifact-index.md` | ART-018 — `docs/04-modules/longshort/longshort.md` (Step 5.1) |
| `function-index.md` | `writeStrategyAuditEvent` (Step 5.0b — shared helper). Edge function endpoint `longshort-emit-init` (Step 5.3) is not separately registered in function-index per convention (function-index = shared helpers only, not endpoints; per Step 5.7 cleanup R7). |
| `database-migration-ledger.md` | MIG-037 (Step 5.2), MIG-038 (Step 5.3); Tables-summary 13 → 14 with `longshort_audit_logs` row (this closure) |

---

## Tests

- **Deno unit tests** — `supabase/functions/_shared/strategy-audit_test.ts` covers table-name interpolation and platform-parity return shape for `writeStrategyAuditEvent`.
- **E2E suite** — `e2e/longshort/longshort-access.spec.ts` (Playwright; mirrors `e2e/trading-panel-access.spec.ts` skip-on-no-session pattern):
  - `Long-short strategy access control` → 3 scenarios: unauth-redirect / no-perm-AccessDenied / authorized-renders-dashboard (AC-21).
  - `Long-short audit emission` → POST `longshort-emit-init` returns correlation_id + audit_id; the audit_id is transitive proof of INSERT into `longshort_audit_logs` per the helper's contract (AC-22).

---

## Deferred / Follow-up

All items below are explicitly out of scope of FP-005 per DEC-032 clauses 2–4 + 7 and are recorded in `docs/08-planning/deferred-work-register.md` for FP-006 / FP-007 pickup:

1. Longshort decision engine — FP-006
2. Longshort reconciliation logic — FP-006
3. Longshort order management / execution path — FP-006
4. `longshort.execute` permission key — FP-006
5. Residual CROSSWIND §10.3 Phase 0A items — FP-006
6. All CROSSWIND §10.4 Phase 0B items — FP-006
7. Tier 3 runbooks under `docs/09-runbooks/` — FP-006
8. >150s long-running-job detection / hand-off pattern — FP-006
9. CI/CD pipeline for `longshort` — FP-007
10. CROSSWIND §15 Risk Register reconciliation (v0.10-deferred) — FP-006 once v0.10 lands

---

## Grandfathering Note (per supervisor v0.4 §22.8.3)

The Step 5.0a closure record references a dead-letter cross-reference that was identified after the PR closed. Per §22.8.3, this cross-reference is **grandfathered** (not retroactively corrected) because correcting it would re-open a closed PR. The substantive INC-15 fix itself is intact; only the closure-record cross-reference is affected. This note preserves the audit trail.

---

## Lock Statement

This plan section is **closed**. Per Constitution Rule 8, none of the 23 acceptance criteria above may be silently dropped. Per DEC-032 clause 7, any expansion into reconciliation engine, signal/order logic, `longshort.execute`, Tier 3 runbooks, CI/CD, or §10.4 items is a separate governance cycle (FP-006 / FP-007) and **must not** be merged into FP-005 retroactively. Per Constitution Rule 11 (Critical Module Override — Auth/RBAC/Security ALWAYS HIGH), any future change to `longshort.*` permissions, `longshort_audit_logs` schema, the `writeStrategyAuditEvent` helper contract, or the strategy façade discipline (3-name template per `.cursorrules` Rule T1a) is HIGH impact and requires the full change-control workflow.

---

## Related Documents

- Parent plan section: `docs/08-planning/master-plan.md` → PLAN-TRADING-001-LONGSHORT-001
- Feature proposal: `docs/08-planning/feature-proposals.md` → FP-005
- Decisions: `docs/08-planning/approved-decisions.md` → DEC-030, DEC-031, DEC-032, DEC-033 v4.1
- Module doc: `docs/04-modules/longshort/longshort.md`
- Pattern doc: `docs/04-modules/strategy-module-pattern.md`
- Migration ledger: `docs/07-reference/database-migration-ledger.md` (MIG-037, MIG-038)
- Action tracker: `docs/06-tracking/action-tracker.md` (ACT-070, ACT-071, ACT-072)
- Incidental findings: `docs/06-tracking/incidental-findings.md` (INC-15)
- Constitution: `docs/00-governance/constitution.md` (Rules 6, 8, 11)
- System state: `docs/00-governance/system-state.md` (`longshort: foundation-implemented`)