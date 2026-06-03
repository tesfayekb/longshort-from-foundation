-- =============================================================================
-- MIG-056 — universe_refresh_log.outcome CHECK widening to 4-value set.
--
-- FP-008.4 Commit 3 — circuit-breaker defect D1 resolution (schema layer only).
--
-- Purpose: widen the existing 3-value CHECK constraint on
-- public.universe_refresh_log.outcome from
--     ('completed', 'failed', 'partial')          -- MIG-048 original
-- to
--     ('completed', 'failed', 'partial', 'circuit_breaker_open')
-- so that the value the orchestrator already writes
-- (supabase/functions/longshort-universe-quarterly-refresh/
--  quarterly-refresh-orchestrator.ts — `outcome: 'circuit_breaker_open'`)
-- is accepted by the database. Today any attempt by the orchestrator to
-- finalize a refresh as `circuit_breaker_open` raises a 23514 CHECK violation
-- and leaves a half-finalized row; this widening eliminates that failure mode.
--
-- NULL acceptance is intentionally preserved. CHECK constraints are
-- tri-valued and NULL passes; NULL on `outcome` remains the established
-- in-flight convention (row inserted at refresh start, outcome filled at
-- finalization). Do NOT add NOT NULL here — see DW-082 Part A1 and the
-- circuit-breaker survey notes for downstream readers (e.g.,
-- `countConsecutiveFailures`) that depend on NULL-as-in-flight semantics.
--
-- Scope discipline (FP-008.4 Commit 3 = D1 ONLY): this commit does NOT fix
-- the self-masking streak-detection race (D5 — deferred to Commit 3.5), the
-- fail-open-on-read pattern (D2 — deferred to Commit 4), or the optional-
-- method gap (D3 — deferred to Commit 4). Sequencing is load-bearing: D1
-- (this commit) MUST land before D5 — once Commit 3.5's fix enables the
-- breaker to actually trip, the first real trip would otherwise throw a
-- 23514 CHECK violation against the unwidened constraint.
--
-- Idempotency: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pattern mirrors
-- the established repo shape (see supabase/migrations/...
-- audit_logs_actor_id_fkey rebuild migration). Safe to re-run; the second
-- run finds no constraint to drop and re-adds the same 4-value form.
--
-- Concern-2 read-only verification (folded into Commit 3 per execution
-- prompt — NO second ALTER, NO sql/11 modification): the empty-
-- universe_refresh_log edge case for assert_eligibility_complete(operator,
-- NULL) was verified at Commit 3 pre-task via:
--     SELECT public.assert_eligibility_complete(
--       '00000000-0000-0000-0000-000000000001'::uuid, NULL);
-- → returns FALSE (not NULL, not error). The outer COALESCE(..., FALSE) in
-- sql/11's function body swallows the absent-row path cleanly. No fix
-- needed; documented here so future readers do not re-investigate.
-- =============================================================================

ALTER TABLE public.universe_refresh_log
  DROP CONSTRAINT IF EXISTS universe_refresh_log_outcome_check;

ALTER TABLE public.universe_refresh_log
  ADD CONSTRAINT universe_refresh_log_outcome_check
  CHECK (outcome IN ('completed', 'failed', 'partial', 'circuit_breaker_open'));

COMMENT ON CONSTRAINT universe_refresh_log_outcome_check
  ON public.universe_refresh_log IS
  'FP-008.4 Commit 3 / MIG-056 — widened from MIG-048 3-value set to include circuit_breaker_open. NULL accepted (in-flight convention). Prerequisite to Commit 3.5 D5 streak-detection fix.';