-- =============================================================================
-- sql/13 — FP-008.4 Commit 5 / MIG-057
-- #4 RLS additive-defeat fix: deny authenticated writes on three financial-data
-- tables (universe_membership, hard_exclusions, longshort_audit_logs)
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
--
-- Drops three over-broad PERMISSIVE INSERT policies and replaces each with a
-- set of AS RESTRICTIVE deny-authenticated-write policies scoped to
-- INSERT/UPDATE/DELETE (NEVER SELECT — see "Why per-command, never FOR ALL"
-- below).
--
--   Table                     | Dropped (PERMISSIVE INSERT, OR-defeated)
--   --------------------------|--------------------------------------------
--   universe_membership       | universe_membership_operator_insert
--                             |   (WITH CHECK (operator_id = auth.uid()))
--   hard_exclusions           | hard_exclusions_operator_insert
--                             |   (WITH CHECK (operator_id = auth.uid()))
--   longshort_audit_logs      | longshort_audit_logs_insert_policy
--                             |   (WITH CHECK (true))  -- audit-log forgery
--
-- WHY THIS IS THE FIX
--
-- Postgres RLS combines PERMISSIVE policies with OR and RESTRICTIVE policies
-- with AND. The dropped policies are PERMISSIVE: any future migration that
-- adds a second PERMISSIVE INSERT policy whose WITH CHECK evaluates true under
-- some authenticated condition would OR-combine and grant that write — the
-- "additive defeat" pattern. RESTRICTIVE is the only construct that cannot be
-- OR-defeated: a RESTRICTIVE policy AND-combines, so a RESTRICTIVE USING(false)
-- / WITH CHECK(false) denies the command regardless of any present or future
-- PERMISSIVE policy. This hardens the "system-actor-only-writes" invariant
-- structurally rather than by convention.
--
-- WHY THE AUDIT-LOG ENTRY IS THE MOST SECURITY-CRITICAL
--
-- longshort_audit_logs_insert_policy was WITH CHECK (true). Any authenticated
-- user could INSERT arbitrary rows: any operator_id, actor, action, target,
-- metadata, ip_address, user_agent, correlation_id. The governance model
-- (constitution §1 "repo is authoritative artifact"; §8 audit-as-Tier-A-
-- evidence) treats the audit log as ground truth for "what the system did."
-- A WITH CHECK (true) INSERT policy makes that log forgeable by any logged-in
-- user — every other safety mechanism in the system rests on audit evidence
-- whose machine-only-write property did not actually hold. See INC-36 for the
-- pre-MIG-057 epistemic trust boundary on historical audit entries.
--
-- WHY service-role-only writes (no authenticated path, even for superadmin)
--
-- All three tables are pipeline-written by edge functions running under the
-- service role (verified per call site pre-task):
--   - universe_membership          : universe-membership-persister.ts:57-59
--   - hard_exclusions              : hard-exclusions-persister.ts:53-58
--   - longshort_audit_logs         : _shared/strategy-audit.ts:126-137 via
--                                    writeStrategyAuditEvent
-- All three use the shared `supabaseAdmin` client (service-role-keyed per
-- _shared/supabase-admin.ts:27 `SUPABASE_SERVICE_ROLE_KEY`). Service-role
-- bypasses RLS entirely — RESTRICTIVE deny policies TO authenticated leave
-- these legitimate writes untouched.
--
-- A superadmin is NOT given a write path through the authenticated role.
-- universe_membership rows lacking valid refresh_id lineage poison the
-- downstream universe; hard_exclusions rows lacking firing-rule lineage break
-- exclusion traceability; longshort_audit_logs entries written by a human
-- destroy the "audit log = machine ground truth" invariant by definition.
-- The sanctioned future hand-edit path is an explicit SECURITY DEFINER RPC
-- (superadmin check + audit-log write + explicit reason parameter), mirroring
-- the existing kill_switch_soft_pause / _hard_pause / _resume pattern — not
-- an ambient policy.
--
-- WHY per-command (INSERT / UPDATE / DELETE), never FOR ALL
--
-- FOR ALL would include SELECT. A RESTRICTIVE policy AND-combines with
-- PERMISSIVE policies for its command; a RESTRICTIVE FOR ALL USING(false)
-- would AND against the *_longshort_view_read / *_operator_read SELECT
-- policies and deny ALL reads to the authenticated role — breaking the
-- dashboards. Each deny is therefore written as three separate per-command
-- RESTRICTIVE policies (INSERT, UPDATE, DELETE). SELECT is intentionally
-- untouched; the SELECT overlay remains the operative read gate.
--
-- Clause shapes per command:
--   INSERT  : WITH CHECK (false)
--   UPDATE  : USING (false) WITH CHECK (false)
--   DELETE  : USING (false)
--
-- WHAT THIS MIGRATION DOES NOT DO
--
--   - Does NOT touch the SELECT read policies (intended additive overlay).
--   - Does NOT touch sql/11's redundant `OR is_superadmin(...)` (separate
--     hygiene; not the defeat).
--   - Does NOT touch the sibling `*_no_direct_write_policy` PERMISSIVE
--     false/false tables (kill_switches, reconciliation_events,
--     universe_eligibility_coverage, universe_refresh_log,
--     longshort_reconciliation_state). Those work because no other PERMISSIVE
--     write policy is present — a fragile invariant worth hardening to the
--     RESTRICTIVE shape in a separate dedicated commit; out of #4 scope.
--
-- Idempotency (D3): every CREATE is preceded by DROP POLICY IF EXISTS on the
-- new policy name, mirroring the sql/11 pattern verbatim.
--
-- Atomicity: BEGIN/COMMIT wraps all DROP+CREATE so the table is never
-- observably in a state where the old PERMISSIVE INSERT is gone but the new
-- RESTRICTIVE deny is not yet present.
--
-- Authority: FP-008.4 Commit 5 / MIG-057. Cross-references INC-36 (the
-- audit-forgery finding's pre-MIG-057 trust-boundary statement).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. universe_membership — drop over-broad INSERT, add RESTRICTIVE I/U/D deny
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS universe_membership_operator_insert
  ON public.universe_membership;

DROP POLICY IF EXISTS universe_membership_deny_authenticated_insert
  ON public.universe_membership;
CREATE POLICY universe_membership_deny_authenticated_insert
  ON public.universe_membership
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS universe_membership_deny_authenticated_update
  ON public.universe_membership;
CREATE POLICY universe_membership_deny_authenticated_update
  ON public.universe_membership
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS universe_membership_deny_authenticated_delete
  ON public.universe_membership;
CREATE POLICY universe_membership_deny_authenticated_delete
  ON public.universe_membership
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- -----------------------------------------------------------------------------
-- 2. hard_exclusions — drop over-broad INSERT, add RESTRICTIVE I/U/D deny
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS hard_exclusions_operator_insert
  ON public.hard_exclusions;

DROP POLICY IF EXISTS hard_exclusions_deny_authenticated_insert
  ON public.hard_exclusions;
CREATE POLICY hard_exclusions_deny_authenticated_insert
  ON public.hard_exclusions
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS hard_exclusions_deny_authenticated_update
  ON public.hard_exclusions;
CREATE POLICY hard_exclusions_deny_authenticated_update
  ON public.hard_exclusions
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS hard_exclusions_deny_authenticated_delete
  ON public.hard_exclusions;
CREATE POLICY hard_exclusions_deny_authenticated_delete
  ON public.hard_exclusions
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- -----------------------------------------------------------------------------
-- 3. longshort_audit_logs — drop forgery-enabling INSERT, add RESTRICTIVE
--    I/U/D deny. This is the most security-critical of the three: the dropped
--    policy was WITH CHECK (true), making audit entries forgeable by any
--    authenticated user. See INC-36 for the pre-MIG-057 trust-boundary.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS longshort_audit_logs_insert_policy
  ON public.longshort_audit_logs;

DROP POLICY IF EXISTS longshort_audit_logs_deny_authenticated_insert
  ON public.longshort_audit_logs;
CREATE POLICY longshort_audit_logs_deny_authenticated_insert
  ON public.longshort_audit_logs
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS longshort_audit_logs_deny_authenticated_update
  ON public.longshort_audit_logs;
CREATE POLICY longshort_audit_logs_deny_authenticated_update
  ON public.longshort_audit_logs
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS longshort_audit_logs_deny_authenticated_delete
  ON public.longshort_audit_logs;
CREATE POLICY longshort_audit_logs_deny_authenticated_delete
  ON public.longshort_audit_logs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

COMMIT;

-- =============================================================================
-- Post-apply verification (operator runs in Supabase SQL Editor):
--
--   SELECT tablename, policyname, permissive, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('universe_membership','hard_exclusions','longshort_audit_logs')
--   ORDER BY tablename, policyname;
--
-- Expected post-apply:
--   - Three *_operator_insert / *_insert_policy rows GONE.
--   - Nine *_deny_authenticated_(insert|update|delete) rows present with
--     permissive='RESTRICTIVE', cmd in (INSERT|UPDATE|DELETE), qual/with_check
--     = 'false'.
--   - All *_longshort_view_read / *_operator_read SELECT rows UNCHANGED
--     (permissive='PERMISSIVE', cmd='SELECT').
-- =============================================================================