# Phase Closure: PLAN-AUTH-SUDO-001 — Sensitive-Action Re-Authentication ("Sudo Mode")

> **Plan ID:** PLAN-AUTH-SUDO-001
> **Approval:** DEC-029 / FP-003
> **Closure Date:** 2026-05-13
> **Action IDs:** ACT-066 (implementation + RW-017/RW-018), ACT-067 (correlation_id end-to-end + RW-019/RW-020)
> **Migration:** MIG-022
> **Status:** Implemented — phase gate closed, all acceptance criteria verified.

---

## Summary

Closed the unlocked-public-computer attack vector by gating every account-takeover-relevant mutation (MFA enroll, `require_mfa_for_self` toggle, recovery-code generation, MFA unenroll, password change) behind a fresh-credential proof window. Every grant and every protected action is audited end-to-end with a correlation_id that round-trips client → edge function → `audit_logs` row → 200/500 response, with the audit table indexed for fast trace lookup under a governed DDL contract.

---

## Acceptance Criteria — Evidence

| Criterion | Evidence |
|-----------|----------|
| `useSudoMode()` hook (sessionStorage `auth.sudo_until`, default 5 min) | `src/hooks/useSudoMode.ts`; RW-017 expiry + clear cases |
| `<RequireSudo>` guards `/mfa-enroll` | `src/components/auth/RequireSudo.tsx`; route-index L265 |
| `SelfMfaPrefCard` toggle gated (ON/OFF) | `src/components/user/SelfMfaPrefCard.tsx`; RW-017 |
| `PasswordChangeCard` skips reauth in sudo, re-prompts on expiry | `src/components/user/PasswordChangeCard.tsx`; RW-017 |
| Recovery-code generation gated | `src/pages/user/SecurityPage.tsx`; RW-017 |
| MFA unenroll grants sudo on reauth (no regression) | RW-017 unenroll case |
| `signOut()` + `updatePassword()` clear sudo | `src/contexts/AuthContext.tsx`, `PasswordChangeCard`; RW-017 |
| `log-sudo-event` writes both events with `actor_id` from JWT | `supabase/functions/log-sudo-event/index.ts`; RW-018 + Deno index_test |
| `auth.sudo_window_seconds` registered | config-index L260 |
| Events `auth.sudo_granted` / `auth.sensitive_action_performed` registered | event-index L525, L544 |
| Reference indexes reconciled | function-index L1344/L1364, event-index L525/L544, route-index L265, config-index L260 |
| No new perms/roles/tables | Confirmed; only added `idx_audit_logs_correlation_id` (MIG-022) |
| correlation_id end-to-end | RW-019 + `supabase/functions/log-sudo-event/index_test.ts` |
| Index DDL contract + migration self-check | `sql/08_audit_correlation_id_index.sql` + `docs/07-reference/audit-correlation-id-index-contract.md`; RW-020 |

---

## Regression Coverage Added

| ID | Test File | Priority | Risk Class |
|----|-----------|----------|-----------|
| RW-017 | `src/test/rw017-sudo-mode-protection.test.ts` | Critical | Security / Authorization |
| RW-018 | `src/test/rw018-sudo-audit-events.test.ts` | High | Audit |
| RW-019 | `src/test/rw019-sudo-correlation-id.test.ts` + `supabase/functions/log-sudo-event/index_test.ts` | High | Audit / Functional |
| RW-020 | `src/test/rw020-audit-correlation-index.test.ts` | High | Performance / Data Integrity |

All four entries are listed in `docs/06-tracking/regression-watchlist.md` and the Top Critical Active Items table.

---

## Migration

- **MIG-022** — `sql/08_audit_correlation_id_index.sql` (idempotent partial btree + DDL self-check). Mirrored at `supabase/migrations/20260513222245_98d7f94f-2838-49ce-a6ab-d0f84e4fb2b8.sql`.
- DDL contract: `docs/07-reference/audit-correlation-id-index-contract.md`. Any future shape change must land as a new migration that re-asserts the contract self-check, updates the ledger, and updates the contract doc + RW-020.

---

## Reference Index Reconciliation

| Index | Entry |
|-------|-------|
| function-index | `useSudoMode` (L1364), `log-sudo-event` (L1344) |
| event-index | `auth.sudo_granted` (L525), `auth.sensitive_action_performed` (L544) |
| route-index | `/mfa-enroll` sudo-gated note (L265) |
| config-index | `auth.sudo_window_seconds` (L260) |

---

## Deferred / Follow-up

- `auth.sudo_window_seconds` is currently sourced from the client constant `SUDO_WINDOW_MS` in `useSudoMode.ts`; promotion to runtime-tunable `system_config.auth.sudo_window_seconds` (superadmin-tunable) is recorded as a follow-up in `docs/08-planning/deferred-work-register.md` if/when operational tuning is required. Out of scope for this closure — does not block the phase gate (config key documented, default enforced, no production gap).

---

## Lock Statement

This plan is **closed**. Per Constitution Rule 8, no acceptance criterion above may be silently dropped. Any future change to sudo gating, sudo audit emission, correlation_id propagation, or the `audit_logs.correlation_id` index DDL contract is a MEDIUM/HIGH change that **must** verify all four watchlist items (RW-017, RW-018, RW-019, RW-020) before proceeding, and any criterion modification requires explicit supersession via the change-control workflow.

---

## Related Documents

- [Master Plan — PLAN-AUTH-SUDO-001](../master-plan.md)
- [Approved Decisions — DEC-029](../approved-decisions.md)
- [Feature Proposals — FP-003](../feature-proposals.md)
- [Audit correlation_id Index Contract](../../07-reference/audit-correlation-id-index-contract.md)
- [Database Migration Ledger — MIG-022](../../07-reference/database-migration-ledger.md)
- [Regression Watchlist — RW-017..RW-020](../../06-tracking/regression-watchlist.md)
- [Action Tracker — ACT-066, ACT-067](../../06-tracking/action-tracker.md)