-- MIG-115 — FP-052.3 (3.3a) foundation
-- (1) Widen combiner_forward_returns.horizon_td CHECK to admit T+10
--     (the §6.1/§6.2-locked training horizon). Additive; zero data migration.
-- (2) promote_combiner_model(p_model_id uuid) — atomic candidate→active
--     swap that retires the prior active for the same side FIRST,
--     preserving the uq_combiner_model_registry_active_per_side partial
--     unique invariant at every intermediate state. SECURITY DEFINER,
--     service_role-only (in-function gate + REVOKE/GRANT).
-- (3) rollback_combiner_model(p_side text) — retire current active,
--     restore most-recently-retired prior model for that side. Same
--     retire-first ordering. Same service_role gate.
-- Reference: FP-052.3 entry, DEC-063 (promotion-gate scope), ACT-283.

BEGIN;

-- ============================================================
-- (1) horizon_td CHECK widening
-- ============================================================
ALTER TABLE public.combiner_forward_returns
  DROP CONSTRAINT IF EXISTS combiner_forward_returns_horizon_td_check;

ALTER TABLE public.combiner_forward_returns
  ADD CONSTRAINT combiner_forward_returns_horizon_td_check
  CHECK (horizon_td IN (1, 5, 10, 20));

-- ============================================================
-- (2) promote_combiner_model
--
-- Atomic single-active-per-side swap. The partial unique index
-- uq_combiner_model_registry_active_per_side rejects any transient
-- two-active state, so the prior active MUST flip to 'retired'
-- BEFORE the candidate flips to 'active' within the same TX. Order
-- is load-bearing — DO NOT reorder.
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_combiner_model(p_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_side          text;
  v_status        text;
  v_prev_active   uuid;
  v_now           timestamptz := now();
BEGIN
  -- Service-role-only. Authenticated callers (incl. superadmin) MUST
  -- route via a service-role-keyed edge function; this matches the
  -- write-restrictive RLS on combiner_model_registry.
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claim.role', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     ) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'promote_combiner_model requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_model_id IS NULL THEN
    RAISE EXCEPTION 'promote_combiner_model: p_model_id is null'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock the candidate row to serialize concurrent promotion attempts.
  SELECT side, status INTO v_side, v_status
  FROM public.combiner_model_registry
  WHERE model_id = p_model_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promote_combiner_model: model_id % not found', p_model_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status <> 'candidate' THEN
    RAISE EXCEPTION 'promote_combiner_model: model % has status %, only candidates may be promoted',
      p_model_id, v_status
      USING ERRCODE = 'invalid_transaction_state';
  END IF;

  -- Step A: retire the current active for this side, if any. ORDER MATTERS:
  -- this must precede Step B so the partial unique index is never violated.
  UPDATE public.combiner_model_registry
     SET status      = 'retired',
         retired_at  = v_now
   WHERE side   = v_side
     AND status = 'active'
  RETURNING model_id INTO v_prev_active;

  -- Step B: promote the candidate.
  UPDATE public.combiner_model_registry
     SET status      = 'active',
         promoted_at = v_now
   WHERE model_id = p_model_id;

  RETURN jsonb_build_object(
    'success',                true,
    'model_id',               p_model_id,
    'side',                   v_side,
    'promoted_at',            v_now,
    'prev_active_id',         v_prev_active,
    'prev_active_retired_at', CASE WHEN v_prev_active IS NULL THEN NULL ELSE v_now END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_combiner_model(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_combiner_model(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_combiner_model(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.promote_combiner_model(uuid) TO service_role;

-- ============================================================
-- (3) rollback_combiner_model
--
-- Retire current active for p_side and restore the most-recently-
-- retired prior model for that side. Same retire-first ordering.
-- ============================================================
CREATE OR REPLACE FUNCTION public.rollback_combiner_model(p_side text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now              timestamptz := now();
  v_current_active   uuid;
  v_prior_retired    uuid;
BEGIN
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claim.role', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     ) IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION 'rollback_combiner_model requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_side IS NULL OR p_side NOT IN ('long', 'short') THEN
    RAISE EXCEPTION 'rollback_combiner_model: p_side must be ''long'' or ''short'' (got %)', p_side
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock the current active for the side.
  SELECT model_id INTO v_current_active
  FROM public.combiner_model_registry
  WHERE side = p_side AND status = 'active'
  FOR UPDATE;

  IF v_current_active IS NULL THEN
    RAISE EXCEPTION 'rollback_combiner_model: no active model for side %', p_side
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Pick the prior model to restore: most-recently-retired for this side.
  SELECT model_id INTO v_prior_retired
  FROM public.combiner_model_registry
  WHERE side = p_side
    AND status = 'retired'
    AND model_id <> v_current_active
  ORDER BY retired_at DESC NULLS LAST, updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_prior_retired IS NULL THEN
    RAISE EXCEPTION 'rollback_combiner_model: no prior retired model for side % to restore', p_side
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Step A: retire the current active FIRST (preserves single-active invariant).
  UPDATE public.combiner_model_registry
     SET status     = 'retired',
         retired_at = v_now
   WHERE model_id = v_current_active;

  -- Step B: restore the prior model to active.
  UPDATE public.combiner_model_registry
     SET status      = 'active',
         promoted_at = v_now,
         retired_at  = NULL
   WHERE model_id = v_prior_retired;

  RETURN jsonb_build_object(
    'success',            true,
    'side',               p_side,
    'rolled_back_id',     v_current_active,
    'restored_active_id', v_prior_retired,
    'effected_at',        v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollback_combiner_model(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rollback_combiner_model(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rollback_combiner_model(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.rollback_combiner_model(text) TO service_role;

COMMIT;