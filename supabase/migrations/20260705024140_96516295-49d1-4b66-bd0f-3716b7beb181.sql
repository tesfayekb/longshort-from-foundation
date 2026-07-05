-- FP-069 W4.e (ACT-465.e) — Overshoot Strategy Config atomic write RPC.
--
-- Ratified atomicity mechanism (a): a SECURITY DEFINER RPC mirroring
-- three cited precedents already resident in this schema:
--   * public.write_universe_eligibility_coverage
--       — DEFINER + SET search_path + has_permission(auth.uid(), ...) gate
--   * public.kill_switch_soft_pause
--       — DEFINER + SET search_path + capability gate + audit INSERT in body
--   * public.promote_combiner_model
--       — DEFINER + SET search_path + row-lock + status transition + typed exceptions
--
-- W4.e is the console's ONE write path. All console mutations to
-- public.overshoot_strategy_config MUST flow through this function; direct
-- UPDATEs from the browser are refused by RLS + no direct-write grants. The
-- permission gate is enforced FIRST inside the body (typed exception on
-- deny) so unauthenticated / under-permissioned callers cannot even reach
-- the bounds re-check or the audit INSERT.
--
-- Defense-in-depth: the table already carries CHECK constraints for
-- strategy_allocation_pct in (0,1] and margin_multiplier in [1.00, 2.00].
-- The RPC re-validates those bounds inside the body and raises a typed
-- exception BEFORE the UPDATE runs, so the client surfaces a clean error
-- message rather than a raw CHECK-violation SQLSTATE.

CREATE OR REPLACE FUNCTION public.overshoot_update_strategy_config(
  p_account_key         text,
  p_allocation_pct      numeric,
  p_margin_multiplier   numeric
)
RETURNS public.overshoot_strategy_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_before       public.overshoot_strategy_config;
  v_after        public.overshoot_strategy_config;
BEGIN
  -- (1) Permission gate FIRST. Typed exception on deny.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_permission(v_caller, 'overshoot.manage') THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config requires overshoot.manage'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (2) Parameter shape validation.
  IF p_account_key IS NULL OR length(btrim(p_account_key)) = 0 THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config: p_account_key is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_allocation_pct IS NULL OR p_margin_multiplier IS NULL THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config: p_allocation_pct and p_margin_multiplier are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (3) Bounds re-check — defense in depth beyond the table CHECK
  --     constraints. Raise typed exceptions BEFORE the UPDATE so the
  --     client surfaces a clean message instead of a raw CHECK SQLSTATE.
  IF NOT (p_allocation_pct > 0 AND p_allocation_pct <= 1) THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config: strategy_allocation_pct must be in (0, 1] (got %)', p_allocation_pct
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (p_margin_multiplier >= 1.00 AND p_margin_multiplier <= 2.00) THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config: margin_multiplier must be in [1.00, 2.00] (got %)', p_margin_multiplier
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) Capture before-values under row lock so the audit "before" snapshot
  --     matches the row the UPDATE will mutate (no lost-update race).
  SELECT * INTO v_before
    FROM public.overshoot_strategy_config
   WHERE account_key = p_account_key
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'overshoot_update_strategy_config: no config row for account_key % (seed the row via migration first)', p_account_key
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (5) Atomic UPDATE.
  UPDATE public.overshoot_strategy_config
     SET strategy_allocation_pct = p_allocation_pct,
         margin_multiplier       = p_margin_multiplier,
         updated_at              = now(),
         updated_by              = v_caller
   WHERE account_key = p_account_key
  RETURNING * INTO v_after;

  -- (6) Audit INSERT in the same body. operator_id is auth.uid() (NOT NULL
  --     column — the caller-null guard above ensures this is non-null here).
  INSERT INTO public.overshoot_audit_logs (
    id, operator_id, action, target_type, target_id, metadata, created_at
  )
  VALUES (
    gen_random_uuid(),
    v_caller,
    'overshoot.config.updated',
    'overshoot_strategy_config',
    p_account_key,
    jsonb_build_object(
      'account_key', p_account_key,
      'before', jsonb_build_object(
        'strategy_allocation_pct', v_before.strategy_allocation_pct,
        'margin_multiplier',       v_before.margin_multiplier,
        'updated_at',              v_before.updated_at,
        'updated_by',              v_before.updated_by
      ),
      'after', jsonb_build_object(
        'strategy_allocation_pct', v_after.strategy_allocation_pct,
        'margin_multiplier',       v_after.margin_multiplier,
        'updated_at',              v_after.updated_at,
        'updated_by',              v_after.updated_by
      )
    ),
    now()
  );

  RETURN v_after;
END;
$function$;

COMMENT ON FUNCTION public.overshoot_update_strategy_config(text, numeric, numeric) IS
  'FP-069 W4.e (ACT-465.e). Console-side ONE write path for overshoot_strategy_config. '
  'Ratified atomicity mechanism (a): SECURITY DEFINER + SET search_path + '
  'has_permission(auth.uid(), ''overshoot.manage'') gate FIRST + internal bounds re-check '
  '(defense in depth) + row-locked UPDATE + same-body INSERT into overshoot_audit_logs. '
  'Mirrors three precedents in this schema: write_universe_eligibility_coverage, '
  'kill_switch_soft_pause, promote_combiner_model. Direct UPDATEs from the browser are '
  'refused by RLS + absence of authenticated GRANTs on the base table.';

REVOKE ALL ON FUNCTION public.overshoot_update_strategy_config(text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.overshoot_update_strategy_config(text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.overshoot_update_strategy_config(text, numeric, numeric) TO service_role;
