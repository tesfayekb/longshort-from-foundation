# Incidental Findings Log

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-16 | **Status:** Living Document

## Purpose

Cross-cutting incidental findings discovered during planning, review, or execution that:
- Do NOT meet the threshold of a feature proposal or DEC entry
- Are NOT tied to a specific feature module (those go in the module's own INC log if it has one — e.g., `docs/04-modules/longshort/design-source/README.md` for CROSSWIND-specific drift)
- Need to be tracked so they aren't lost between PRs

Each entry must reach one of two terminal states per supervisor protocol §8: **resolved** (fixed and merged) or **logged with disposition** (scheduled / risk / escalated for operator decision). Nothing is just "tracked" — every open INC has a disposition.

## Open Findings

_(no open findings)_

## Resolved Findings

### INC-15 — `permissions` table has no `module` column

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Step 4 (Trading Panel Foundation Infrastructure) planning — investigating permission seed pattern for `trading.access` |
| **Severity** | Medium (documentation accuracy; no runtime bug) |
| **Disposition** | Resolved — doc-only fix landed via FP-005 Step 5.0a; DEC-031 sub-point 3 wording amended |

**Finding.** The `permissions` table has schema `(id, key, description, created_at)` — no `module` column. Verified across multiple migrations (all permission INSERTs use only `(key, description)`).

Yet:
- DEC-031 sub-point 3 states: *"Grouping in admin UI achieved via the `module` field on each permission entry."*
- `docs/07-reference/permission-index.md` entries include a `Module: trading-panel` field implying DB-backed metadata.

**Actual mechanism.** `src/pages/admin/AdminPermissionsPage.tsx` groups via `groupByResource()` — splits each permission key at the first dot. `trading.access` groups under resource `trading`, label `Trading`. No `module` field is read from the DB or used in UI. The `module` field in permission-index.md is documentation-only metadata that does not flow to any code or DB column.

**Impact.** Documentation describes a DB column that doesn't exist. Two reasonable resolutions:

1. **Doc-only fix.** Update DEC-031 sub-point 3 and permission-index.md to describe the actual key-prefix grouping mechanism. Cheaper and matches reality.
2. **Schema change.** Add the `module` column to permissions table with appropriate migration, RLS review, and AdminPermissionsPage update to read and group by it. More work but matches DEC-031's stated intent.

**Note for Step 5 (FP-005 long-short).** Same question will apply to `longshort.view` / `longshort.manage` permissions — they will group as resource `longshort` via key-prefix, not by any `module` metadata. INC-15 disposition should be decided BEFORE long-short permissions are seeded, to avoid compounding the drift.

**Related artifacts.** DEC-031 (sub-point 3), permission-index.md, AdminPermissionsPage.tsx (`groupByResource()` function).

**Resolution.** Option 1 (doc-only fix) was selected per FP-005 Step 5.0a / Round 1.1 D1. The fix landed by amending DEC-031 sub-point 3 in `docs/08-planning/approved-decisions.md` to accurately describe the `groupByResource()` mechanism in `src/pages/admin/AdminPermissionsPage.tsx` (first-dot-split of the permission key) and to clarify that the `module:` metadata in `docs/07-reference/permission-index.md` is documentation-only and is not read by code or stored as a DB column. Resolution anchor: this Step 5.0a commit (SHA recorded in the commit message body `inc_15_resolution_sha` field per §22.4).

### INC-17 — Silent auth-context fallback in layout prefetches (M4)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Lovable project review of Step 4 trading panel infrastructure. |
| **Severity** | High (security-relevant: silent permission-loss path indistinguishable from genuine denial) |
| **Disposition** | **Resolved** (2026-05-16) |
| **Resolution** | Layout prefetch queryFns for `get_my_authorization_context` (TradingLayout, AdminLayout) now log to Sentry + console.error in the catch path before returning empty-perms defaults. Empty-perms behavior preserved (fail-closed → AccessDenied) but now visible. Global QueryCache.onError handler added in App.tsx to capture all silently-swallowed query errors going forward. |

### INC-18 — Silent MFA-policy bypass on transient backend failure (N1)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Lovable project review second-read after C1.1 closure. |
| **Severity** | High (DEC-028 enforcement bypass on transient errors — production exposure once `panels.trading = 'required'`) |
| **Disposition** | **Resolved** (2026-05-16) |
| **Resolution** | `RequireMfaForTrading`, `RequireMfaForAdmin`, and `UserLayout`'s self-MFA gate now read `error` from `useMfaPolicy` and fail closed: any policy fetch error → treat enforcement as required → redirect to `/mfa-enroll`. Global QueryCache.onError handler logs the underlying fetch failure to Sentry. DEC-028 enforcement preserved on transient outages. |

### INC-16 — RW-018 test assertions out of sync with implementation (6 pre-existing failures)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | C1 fix execution (RW-018 `ApiError` mock re-export). After applying `vi.importActual` pattern, failures dropped from 7 to 6. The 6 remaining failures are pre-existing assertion mismatches, not caused by the fix. |
| **Severity** | Medium (test suite hygiene; RW-018 marked Verified but 6 of its 22 tests do not pass) |
| **Disposition** | **Resolved** (C1.1, 2026-05-16) |
| **Resolution** | Updated 6 stale assertions in `src/test/rw018-sudo-audit-events.test.ts` to match correct implementation behavior per RW-019 (correlation_id mandatory in POST body and round-tripped on error path) and DEC-029 (`logSudoEvent` returns `SudoAuditResult`, not `undefined`). 4 Category-A `.toEqual` blocks extended with `correlation_id: expect.any(String)`. 1 Category-B `.resolves.toBeUndefined()` changed to `.resolves.toMatchObject({ persisted: false })`. 6th failure (uncharacterized in original INC-16 — edge-function source regex `apiError(500…correlationId: ctx.correlationId`) split into two assertions verifying the RW-019 `const correlationId = clientCid ?? ctx.correlationId` derivation and the `apiError(500, …, correlationId)` reference, independent of property-shorthand form. Production code (`src/lib/sudo-audit.ts`, `src/lib/api-client.ts`, `supabase/functions/log-sudo-event/index.ts`) unchanged. Post-fix: 22/22 RW-018 tests pass; 205/205 repo-wide. |

**Finding.** The `vi.importActual` fix resolves the `ApiError` mock issue (1 test restored). Six remaining failures in `src/test/rw018-sudo-audit-events.test.ts` fall into two categories:

**Category A — Success-path POST body assertions (4 tests).** Tests in sections 1 and 3 expect the `apiClient.post` body to contain exactly `{ action, action_key }`, but `logSudoEvent` (implementation-correct per RW-019) sends `{ action, action_key, correlation_id }`. The assertions use `.toEqual()` strict equality, so the extra `correlation_id` field fails the match.

Affected tests:
- `auth.sudo_granted is buffered AND POSTed with the action_key`
- `auth.sensitive_action_performed is buffered AND POSTed`
- `on fresh grant: emits sudo_granted THEN sensitive_action_performed for the same action_key`
- `manual grant flow emits BOTH sudo_granted and sensitive_action_performed once each`

Fix: change `.toEqual({ action, action_key })` to `.toMatchObject({ action, action_key })` or assert the full 3-field body shape.

**Category B — Error-path return-value assertions (2 tests).** Tests in section 6 expect `logSudoEvent` to resolve to `undefined` (`.resolves.toBeUndefined()`), but `logSudoEvent` always returns a `SudoAuditResult` object (implementation-correct per DEC-029). The original `ApiError` mock bug masked this by causing `logSudoEvent` to throw a TypeError on the `instanceof` check, making the promise reject instead of resolve.

Affected tests:
- `logSudoEvent swallows edge-function errors but still buffers the event`
- `isSudoActive is unaffected by audit-write failure`

Fix: change `.resolves.toBeUndefined()` to `.resolves.toBeDefined()` or assert on `result.persisted === false`.

**Impact.** RW-018 is marked Verified in the regression watchlist and action tracker, but 6 of its 22 tests are not reproducible as passing. This is a Constitution Rule 11 issue (evidence not reproducible), though distinct from the `ApiError` mock bug that C1 resolves.

### INC-19 — SECURITY DEFINER functions executable by PUBLIC/anon (H1a)

| Field | Value |
|---|---|
| **Discovered** | 2026-05-16 |
| **Discovery Context** | Lovable project review at HEAD `f13f408` — Supabase linter flagged `0028_anon_security_definer_function_executable` and `0029_authenticated_security_definer_function_executable` on every SECURITY DEFINER function in `public`. By Postgres default, EXECUTE on functions is granted to PUBLIC unless explicitly revoked; for SECURITY DEFINER RBAC helpers (`is_superadmin`, `has_role`, `has_permission`) this created a low-grade anon-enumeration oracle (probe membership without authenticating). |
| **Severity** | Medium (defense-in-depth: no direct privilege escalation since RLS still gates rows, but anon-callable RBAC helpers leak boolean membership signals). |
| **Disposition** | **Resolved** (MIG-036, 2026-05-16) |
| **Resolution** | New migration `20260516113643_18cf3d9a-5369-4596-9d79-fe9e61d0164c.sql` REVOKEs EXECUTE FROM PUBLIC, anon on all **10** SECURITY DEFINER functions in `public` (ground-truth count from `pg_proc` at HEAD `b3c969f` — original prompt estimate of 16 was conservative). GRANTs EXECUTE TO `authenticated` only for `get_my_authorization_context()` — the sole function called from client code via `supabase.rpc(...)` (verified by grep of `src/`). Trigger functions (`accept_invitation_on_confirm`, `handle_new_user`, `handle_new_user_role`, `sync_profile_email`, `rls_auto_enable`), RLS helpers (`has_permission`, `has_role`×2, `is_superadmin`), and server-only paths (RLS helpers also called from edge functions via service-role, which bypasses EXECUTE checks) receive no `authenticated` GRANT. Post-migration `pg_proc` verification confirms `anon_can_execute = false` for all 10 and `authenticated_can_execute = true` only on `get_my_authorization_context`. H1b (0011 `function_search_path_mutable` — 5 WARN linter findings) deferred as separate future PR pending operator authorization. |

---

### INC-20 — ACT-084 v2 scope-leak: Lovable migration-tool path used for superadmin grant during smoke debugging

| Field | Value |
|---|---|
| **Discovered** | 2026-05-24 |
| **Discovery Context** | During FP-006 sub-step 6.4.1 v2 execution, operator authorized a temporary superadmin grant for `tesfayekb@me.com` (UUID `8f8dfd8a-81bb-42f3-bb87-c58e33748b1b`) to enable Option C debugging of the B.3 active 4-RPC smoke cycle. Lovable chose to apply the grant via the Supabase migration tool path (creating `supabase/migrations/20260524041921_d1be05aa-c76a-4289-a863-c16d6926c9c8.sql` + auto-regenerating `src/integrations/supabase/types.ts`) — the EXACT workflow path that Option 3 (operator OOB apply + Lovable verification split-execution) was designed to prevent. The grant itself was operator-authorized; only the delivery path was the violation. |
| **Severity** | Medium (workflow discipline violation: re-introduced the root-cause path that ACT-083b investigation surfaced and ACT-085 will codify as banned for future sub-steps; not a security violation since the grant itself was operator-authorized; not a live-DB drift since the migration applied cleanly and is in `schema_migrations`) |
| **Disposition** | **Open** (two-part follow-up: (a) operator-revokes the temporary grant out-of-band; (b) ACT-085 codifies the path-violation rule formally) |
| **Resolution** | Two-part: |
| **Part (a) — Revoke temporary superadmin grant (operator OOB)** | Operator runs the following SQL via Supabase Dashboard SQL editor against project `sftatlxatbdrotivxcip` to revoke the temporary grant: `DELETE FROM public.user_roles WHERE user_id = '8f8dfd8a-81bb-42f3-bb87-c58e33748b1b' AND role_id = (SELECT id FROM public.roles WHERE key = 'superadmin');` followed by audit log entry: `INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata) VALUES ('rbac.role_revoked', '8f8dfd8a-81bb-42f3-bb87-c58e33748b1b'::uuid, 'user_roles', '8f8dfd8a-81bb-42f3-bb87-c58e33748b1b'::uuid, jsonb_build_object('role_key', 'superadmin', 'reason', 'INC-20 cleanup — ACT-084 v2 temporary smoke-test grant revoked per gate hygiene'));`. After operator confirms revoke, this INC entry status transitions to **Resolved** via append-only correction. |
| **Part (b) — Path-violation root-cause codification (ACT-085 scope)** | ACT-085 (FP-006 sub-step 6.4.1 supervisor protocol amendment) codifies three §22.5 amendments motivated by sub-step 6.4.1's experience: (1) live-DB verification mandatory for CLEAN dispositions touching DB schema/permissions/RPCs/RLS/job_registry; (2) apply-step vs verify-step separation pattern when executor tool capabilities mismatch contract (Option 3 split-execution); (3) **pre-flight live-DB gate pattern as integrity barrier between operator OOB action and executor verification claim**. INC-20 specifically informs item (3): for any one-off DB operation during smoke debugging or capability-gap workaround, supervisor must provide SQL for operator to run out-of-band, NOT direct executor to apply via migration tool. ACT-085 amendment text references this INC entry as motivating evidence. |
| **Disposition path to closure** | (a) operator-revokes grant; this INC entry receives "Resolved (Part a, 2026-05-24)" correction. (b) ACT-085 codifies the workflow rule; this INC entry receives "Resolved (Part b, at ACT-085 SHA)" correction. Both parts complete → INC-20 transitions to **Resolved (full)**. |
| **Live-DB artifact disposition** | The migration file `supabase/migrations/20260524041921_d1be05aa-c76a-4289-a863-c16d6926c9c8.sql` STAYS IN REPO as historical — deleting it would create a "row in schema_migrations references missing file" drift class. The auto-regenerated `src/integrations/supabase/types.ts` changes also stay (legitimate type definitions for feature_flags table that should have been generated earlier anyway). |

#### Resolved (Part a, 2026-05-24)

Operator-confirmed revoke of `tesfayekb@me.com` temporary superadmin grant via Supabase Dashboard SQL editor against project `sftatlxatbdrotivxcip`. Verification query result:

| still_superadmin | latest_migration_version |
| ---------------- | ------------------------ |
| 0                | 20260524041920           |

Expected: `still_superadmin = 0` ✓. Part (a) **RESOLVED**.

#### Resolved (Part b, 2026-05-24, at ACT-085 SHA `<TBD>`)

ADR-004 landed at `docs/04-modules/longshort/design-source/ADR-004-live-db-verification-discipline.md` codifying Amendment 3 ("Executor migration-tool path banned for one-off DB operations during smoke/debugging"). Part (b) **RESOLVED**.

INC-20 transitions to **Resolved (full)** at this SHA.

---

### INC-21: DEC-032 Clause (4) FP-006/FP-007 Dependency-Order Violation

| Field | Value |
|-------|-------|
| **ID** | INC-21 |
| **Date Surfaced** | 2026-05-25 (during ACT-099 post-mortem cycle; immediately before C.1 governance reconciliation) |
| **Classification** | process-defect (framing β per operator calibration); forward-binding fix codified at supervisor-instructions §21.10 (v0.5 → v0.6 amendment) |
| **Surface Story** | At the start of FP-008 Phase 1 universe-construction scoping cycle, supervisor performed sanity-check against feature-proposals.md to identify the next free FP slot. Grep `^### FP-` returned FP-001..FP-005 + `^## FP-006` (heading-depth variance preserved); FP-007 was ABSENT from feature-proposals.md. Cross-reference to DEC-032 clause (4) confirmed FP-007 was reserved on 2026-05-17 as "CI/CD Pipeline Bootstrap" with verbatim language: "FP-007 runs in parallel with FP-005 and is a hard prerequisite for FP-006 entry — FP-006 may NOT begin execution until both FP-005 and FP-007 are closed." FP-006 nonetheless executed and closed (HEAD `13fce9cd` at ACT-098 / 2026-05-25) without FP-007 being authored as an FP entry. |
| **Observation** | The CI/CD scope reserved to FP-007 was nonetheless delivered through FP-006's own sub-steps (6.4 ACT-082 audit-writer trap + 6.10.1 ACT-099 transaction 5 banned-pattern enforcement scripts + workflow extension to 9 gates + docs/banned-patterns.md override registry). The FP-007 wrapper was missing; the FP-007 work was complete. The DEC-032 clause (4) ordering invariant was violated in form but honored in substance: by the time FP-006 closed, the CI/CD scope reserved to FP-007 was substantively delivered. |
| **Why Framing β Not α** | Framing α (informational note; no remediation) would have left the same defect class unprotected against repetition. Framing β (process-defect with forward-binding §21.10 amendment) extends the ADR-003 enforcement-as-scripts-not-prose principle one layer up — from code-pattern enforcement to governance-prerequisite enforcement. Operator calibration confirmed: cost differential is small (~10 lines of supervisor-instruction text + one file op); benefit is structural prevention of the entire defect class. Same cost-benefit ratio as the ADR-003 enforcement-script layer that has paid out twice in the ACT-099 cycle alone (defects #18 + #19 prevented by `ScanState` + string-aware walker patterns). |
| **Disposition** | Resolved-via-process-amendment (β). FP-007 retro-authored at ACT-100 / C.1 (this transaction) in feature-proposals.md with Status `closed (2026-05-25)` at SHA `cd4b8a14` — the SHA where the 9th CI gate landed at ACT-099-cont. PLAN-CI-001-BOOTSTRAP-001 plan section created in master-plan.md (orthogonal to PLAN-TRADING-001 per T6 removability). PLAN-CI-001-BOOTSTRAP-001 closure document created. Supervisor-instructions v0.5 → v0.6 amendment adds §21.10 hard-prerequisite-FP verification gate with machine-checkable artifact requirement: before drafting any execution prompt for an FP whose DEC, master-plan entry, or feature-proposals dependencies field names another FP as hard-prerequisite, supervisor MUST cite in the execution prompt's §22.3 item 2 (Anchor verification) block: (a) the prerequisite FP's feature-proposals.md line number, (b) its current `Status:` value verbatim, and (c) the SHA at which it closed. If any of (a)–(c) cannot be cited, STOP and surface to operator before draft. Recursion clause: applies recursively (a prerequisite's prerequisite must also be verified). Defect class #21 logged forward in supervisor self-defect log: "FP-prerequisite-verification miss; structurally fixed by §21.10 machine-checkable artifact requirement; mirrors ADR-003 enforcement-as-scripts-not-prose pattern at governance layer." Defect class #20 (register-conflation; raised during operator Q3 calibration) also logged forward. |
| **Cross-references** | DEC-032 clause (4) (the prose-DEC that named FP-007 as hard-prerequisite); FP-005 entry §413 item 9 ("CI/CD pipeline configuration for the longshort strategy — FP-007 per Round 1.2 D1.2-4 / F-3" — the FP-005 forward-reference); FP-007 entry in feature-proposals.md (retro-authored at this ACT); PLAN-CI-001-BOOTSTRAP-001 section in master-plan.md (created at this ACT); plan-ci-001-bootstrap-001-closure.md (created at this ACT); ACT-082 (the SHA where Gate 1 + initial 4-gate workflow landed); ACT-099 transaction (the SHA range across which Gates 5-9 + override registry landed); supervisor-instructions v0.6 amendment §21.10 (the forward-binding fix); ADR-003 enforcement-as-scripts-not-prose (the architectural precedent §21.10 extends to governance layer). |
| **Status** | Resolved (β; process-amendment applied) |

---

## Naming Conventions

- **INC-N** numbering is sequential, never reused. INC-14 lives in `docs/04-modules/longshort/design-source/README.md` (CROSSWIND-specific path drift); INC-15 onward in this file unless they're long-short-module-specific.
- Each INC has explicit disposition per supervisor protocol §8.
- INCs may originate from operator, AI collaborator (Claude or Cursor), automated tooling, or external review.
