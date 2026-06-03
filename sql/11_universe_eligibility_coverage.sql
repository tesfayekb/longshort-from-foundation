-- =============================================================================
-- MIG-055 — universe_eligibility_coverage table + assert_eligibility_complete
--           function + write_universe_eligibility_coverage RPC.
--
-- FP-008.4 Commit 2 — eligibility-caveat three-layer enforcement (schema layer).
--
-- Purpose: structurally enforce the Phase 1 closure addendum's eligibility
-- caveat — "downstream consumers must not treat `universe_membership.long_eligible`
-- / `short_eligible` as fully-§3.3-screened until every sub-rule is wired."
-- Today only §3.3d (HTB) is wired; §3.3a/b/c/e ship as feed-deferred-placeholders
-- per DW-063 + DEC-038.1. Coverage tracks per-(operator_id, as_of_date) which
-- sub-rules actually contributed to the row's eligibility booleans.
--
-- COALESCE-defaults-to-false discipline: missing coverage rows are treated as
-- "no sub-rule wired" — the safe direction. `assert_eligibility_complete`
-- returns false for any (operator_id, as_of_date) without a coverage row OR
-- with any false coverage column. Downstream wrapper (`getEligibility()` in
-- `_shared/longshort-universe/get-eligibility.ts`) refuses to expose eligibility
-- flags unless `assert_eligibility_complete` returns true. Gap window between
-- refresh_log INSERT and coverage INSERT fails safe: false-negative coverage,
-- not false-positive.
--
-- Decoupled-from-engine pattern (Option (b) per Commit 2 verification V3):
-- coverage write is a SECURITY DEFINER RPC, idempotent ON CONFLICT
-- (operator_id, as_of_date) DO UPDATE — engine calls it AFTER the existing
-- refresh_log INSERT succeeds, in a separate try/catch. RPC failure does NOT
-- roll back the refresh_log insert; it logs a warning and leaves the coverage
-- absent (assert_eligibility_complete = false until corrective re-run).
--
-- jsonb coverage payload shape (forward-compatible — no signature change as
-- Phase 2 wires additional sub-rules):
--   {"covers_3_3a": false, "covers_3_3b": false, "covers_3_3c": false,
--    "covers_3_3d": true,  "covers_3_3e": false}
--
-- Today's truth: covers_3_3d = true (HTB rule wired via FinraShortInterestFetcher
-- + Polygon locate-data path); all other sub-rules = false (feed-deferred per
-- DW-063 + the §3.3c v1-deferred-placeholder pattern).
--
-- RLS: longshort.view holders read; superadmin override; no direct write —
-- writes via SECURITY DEFINER RPC only (mirrors kill_switches +
-- universe_refresh_log no-direct-write pattern).
--
-- Idempotent (D3): CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS +
-- CREATE OR REPLACE FUNCTION + idempotent backfill (ON CONFLICT DO NOTHING).
-- Apply via Supabase SQL Editor; safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.universe_eligibility_coverage (
  operator_id    UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  as_of_date     DATE         NOT NULL,
  covers_3_3a    BOOLEAN      NOT NULL DEFAULT FALSE,
  covers_3_3b    BOOLEAN      NOT NULL DEFAULT FALSE,
  covers_3_3c    BOOLEAN      NOT NULL DEFAULT FALSE,
  covers_3_3d    BOOLEAN      NOT NULL DEFAULT FALSE,
  covers_3_3e    BOOLEAN      NOT NULL DEFAULT FALSE,
  written_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  written_by     UUID,
  PRIMARY KEY (operator_id, as_of_date)
);

COMMENT ON TABLE public.universe_eligibility_coverage IS
  'FP-008.4 Commit 2 / MIG-055 — per-(operator_id, as_of_date) coverage of §3.3 hard-exclusion sub-rules. covers_3_3X = true iff that sub-rule''s feed/path actually contributed to universe_membership.{long,short}_eligible for that as_of_date. Read via assert_eligibility_complete() + getEligibility() wrapper; never read directly by downstream consumers.';

-- -----------------------------------------------------------------------------
-- 2. Grants (BEFORE RLS + policies, per public-schema-grants discipline)
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.universe_eligibility_coverage TO authenticated;
GRANT ALL    ON public.universe_eligibility_coverage TO service_role;
-- No anon grant — coverage is auth-only operational state.

-- -----------------------------------------------------------------------------
-- 3. RLS — no direct write, longshort.view + superadmin read
-- -----------------------------------------------------------------------------
ALTER TABLE public.universe_eligibility_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS universe_eligibility_coverage_no_direct_write_policy
  ON public.universe_eligibility_coverage;
CREATE POLICY universe_eligibility_coverage_no_direct_write_policy
  ON public.universe_eligibility_coverage
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS universe_eligibility_coverage_read_policy
  ON public.universe_eligibility_coverage;
CREATE POLICY universe_eligibility_coverage_read_policy
  ON public.universe_eligibility_coverage
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'longshort.view')
    OR public.is_superadmin(auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 4. assert_eligibility_complete(operator_id, as_of_date) → boolean
--
-- Returns true iff a coverage row exists for (operator_id, as_of_date) AND
-- every covers_3_3X column is true. Absence-of-row returns false (safe-side
-- default). SECURITY DEFINER so downstream callers don't need direct table
-- SELECT to invoke.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_eligibility_complete(
  _operator_id UUID,
  _as_of_date  DATE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT covers_3_3a AND covers_3_3b AND covers_3_3c AND covers_3_3d AND covers_3_3e
      FROM public.universe_eligibility_coverage
      WHERE operator_id = _operator_id
        AND as_of_date  = _as_of_date
    ),
    FALSE
  );
$$;

COMMENT ON FUNCTION public.assert_eligibility_complete(UUID, DATE) IS
  'FP-008.4 Commit 2 / MIG-055 — returns true iff every §3.3 sub-rule coverage column is true for the given (operator_id, as_of_date). Absence-of-row returns false (safe-side default). Called by getEligibility() TS wrapper.';

GRANT EXECUTE ON FUNCTION public.assert_eligibility_complete(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_eligibility_complete(UUID, DATE) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. write_universe_eligibility_coverage(operator_id, as_of_date, coverage)
--
-- SECURITY DEFINER RPC — bypasses the no-direct-write RLS to upsert a coverage
-- row. Idempotent ON CONFLICT (operator_id, as_of_date) DO UPDATE. Called by
-- longshort-universe-enrich-and-filter AFTER the existing refresh_log INSERT
-- succeeds, in a separate try/catch. RPC failure does NOT roll back the
-- refresh_log INSERT — fail-safe is for assert_eligibility_complete to return
-- false (the gap window) until corrective re-run.
--
-- Caller authorization: requires `longshort.manage` (write-class) OR
-- service_role. Edge function calls via service-role-keyed client; UI callers
-- (if any future debugging tool wants to backfill) gated on longshort.manage.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_universe_eligibility_coverage(
  _operator_id UUID,
  _as_of_date  DATE,
  _coverage    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          UUID := auth.uid();
  v_is_service_role BOOLEAN := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_covers_3_3a     BOOLEAN := COALESCE((_coverage->>'covers_3_3a')::boolean, FALSE);
  v_covers_3_3b     BOOLEAN := COALESCE((_coverage->>'covers_3_3b')::boolean, FALSE);
  v_covers_3_3c     BOOLEAN := COALESCE((_coverage->>'covers_3_3c')::boolean, FALSE);
  v_covers_3_3d     BOOLEAN := COALESCE((_coverage->>'covers_3_3d')::boolean, FALSE);
  v_covers_3_3e     BOOLEAN := COALESCE((_coverage->>'covers_3_3e')::boolean, FALSE);
BEGIN
  IF NOT v_is_service_role
     AND NOT public.has_permission(v_caller, 'longshort.manage')
     AND NOT public.is_superadmin(v_caller)
  THEN
    RAISE EXCEPTION 'write_universe_eligibility_coverage requires longshort.manage or service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(_coverage) <> 'object' THEN
    RAISE EXCEPTION 'write_universe_eligibility_coverage: _coverage must be a jsonb object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.universe_eligibility_coverage(
    operator_id, as_of_date,
    covers_3_3a, covers_3_3b, covers_3_3c, covers_3_3d, covers_3_3e,
    written_at, written_by
  )
  VALUES (
    _operator_id, _as_of_date,
    v_covers_3_3a, v_covers_3_3b, v_covers_3_3c, v_covers_3_3d, v_covers_3_3e,
    now(), v_caller
  )
  ON CONFLICT (operator_id, as_of_date) DO UPDATE
    SET covers_3_3a = EXCLUDED.covers_3_3a,
        covers_3_3b = EXCLUDED.covers_3_3b,
        covers_3_3c = EXCLUDED.covers_3_3c,
        covers_3_3d = EXCLUDED.covers_3_3d,
        covers_3_3e = EXCLUDED.covers_3_3e,
        written_at  = EXCLUDED.written_at,
        written_by  = EXCLUDED.written_by;

  RETURN jsonb_build_object(
    'success', true,
    'operator_id', _operator_id,
    'as_of_date',  _as_of_date,
    'covers_3_3a', v_covers_3_3a,
    'covers_3_3b', v_covers_3_3b,
    'covers_3_3c', v_covers_3_3c,
    'covers_3_3d', v_covers_3_3d,
    'covers_3_3e', v_covers_3_3e,
    'complete',    v_covers_3_3a AND v_covers_3_3b AND v_covers_3_3c AND v_covers_3_3d AND v_covers_3_3e
  );
END;
$$;

COMMENT ON FUNCTION public.write_universe_eligibility_coverage(UUID, DATE, JSONB) IS
  'FP-008.4 Commit 2 / MIG-055 — SECURITY DEFINER upsert for universe_eligibility_coverage. Idempotent ON CONFLICT. Authorization: longshort.manage OR superadmin OR service_role. Called by longshort-universe-enrich-and-filter after refresh_log INSERT succeeds.';

GRANT EXECUTE ON FUNCTION public.write_universe_eligibility_coverage(UUID, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_universe_eligibility_coverage(UUID, DATE, JSONB) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Backfill — covers_3_3d=true ONLY for every existing as_of_date in
--    universe_refresh_log. Other sub-rules ship false per DW-063 + the §3.3
--    feed-deferred-placeholder pattern. Backfill is intentionally narrow: it
--    captures the truth of today (only §3.3d is wired) so the wrapper's
--    refusal-to-trade is grounded in real coverage state, not an empty table.
-- -----------------------------------------------------------------------------
INSERT INTO public.universe_eligibility_coverage(
  operator_id, as_of_date,
  covers_3_3a, covers_3_3b, covers_3_3c, covers_3_3d, covers_3_3e,
  written_at, written_by
)
SELECT DISTINCT
  url.operator_id,
  url.as_of_date,
  FALSE AS covers_3_3a,
  FALSE AS covers_3_3b,
  FALSE AS covers_3_3c,
  TRUE  AS covers_3_3d,
  FALSE AS covers_3_3e,
  now() AS written_at,
  NULL::uuid AS written_by
FROM public.universe_refresh_log url
WHERE url.outcome IN ('completed', 'partial')
ON CONFLICT (operator_id, as_of_date) DO NOTHING;
