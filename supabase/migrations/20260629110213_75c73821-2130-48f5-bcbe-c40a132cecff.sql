-- ============================================================================
-- MIG-146 — FP-062 6I.5 — DW-144 §8.9 system trading-pause WRITE surface
-- Account-only (per-symbol pause is DW-150). Additive only.
-- ============================================================================

-- (a) Additive columns on kill_switches for system-vs-operator attribution.
ALTER TABLE public.kill_switches
  ADD COLUMN IF NOT EXISTS set_by_kind text,
  ADD COLUMN IF NOT EXISTS source_ref  text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kill_switches_set_by_kind_chk'
  ) THEN
    ALTER TABLE public.kill_switches
      ADD CONSTRAINT kill_switches_set_by_kind_chk
      CHECK (set_by_kind IS NULL OR set_by_kind IN ('operator','system'));
  END IF;
END $$;

COMMENT ON COLUMN public.kill_switches.set_by_kind IS
  'Attribution discriminator. ''operator'' = human via superadmin RPC (set_by populated). ''system'' = automated via kill_switch_system_pause (set_by NULL — auth.users FK forbids a sentinel UUID). NULL on pre-MIG-146 rows.';

COMMENT ON COLUMN public.kill_switches.source_ref IS
  'Provenance ref for the pause source — e.g. reconciliation event_id or 6I.6a/6I.6b trigger ref. Free-form text.';

-- (b) Service-role-only system pause RPC. Soft-pause-only. active-only transition.
CREATE OR REPLACE FUNCTION public.kill_switch_system_pause(
  p_strategy_key text,
  p_reason       text,
  p_source_ref   text,
  p_operator_id  uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_audit_id        uuid;
  v_correlation_id  uuid;
  v_current_state   kill_switch_state;
  v_action_taken    text;
BEGIN
  -- Capability gate is the GRANT (service_role only). No auth.uid check —
  -- the automated caller has no auth.uid. Defensive belt:
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claim.role', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     ) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres','supabase_admin')
  THEN
    RAISE EXCEPTION 'kill_switch_system_pause requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_strategy_key IS NULL OR p_reason IS NULL OR p_source_ref IS NULL THEN
    RAISE EXCEPTION 'kill_switch_system_pause: p_strategy_key, p_reason, p_source_ref are required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_correlation_id := gen_random_uuid();

  -- Lock the row (if any) so the active-only transition guard is race-safe.
  SELECT state INTO v_current_state
  FROM public.kill_switches
  WHERE operator_id = p_operator_id AND strategy_key = p_strategy_key
  FOR UPDATE;

  IF v_current_state IS NULL THEN
    -- No row yet → install a system soft-pause.
    INSERT INTO public.kill_switches (
      operator_id, strategy_key, state, reason, set_by, set_at,
      set_by_kind, source_ref
    )
    VALUES (
      p_operator_id, p_strategy_key, 'soft_paused', p_reason, NULL, now(),
      'system', p_source_ref
    );
    v_action_taken := 'inserted_soft_paused';

  ELSIF v_current_state = 'active' THEN
    -- Active → soft_paused transition is allowed for the system path.
    UPDATE public.kill_switches
       SET state       = 'soft_paused',
           reason      = p_reason,
           set_by      = NULL,
           set_at      = now(),
           set_by_kind = 'system',
           source_ref  = p_source_ref
     WHERE operator_id = p_operator_id AND strategy_key = p_strategy_key;
    v_action_taken := 'transitioned_active_to_soft_paused';

  ELSIF v_current_state = 'soft_paused' THEN
    -- Already soft_paused → refresh reason/source_ref but preserve attribution
    -- only if the existing row is also system-attributed; otherwise (operator
    -- soft_pause) do not overwrite operator attribution — refresh source_ref
    -- and reason additively but keep set_by/set_by_kind as-is.
    UPDATE public.kill_switches
       SET reason     = COALESCE(reason, '') ||
                        CASE WHEN reason IS NULL OR reason = '' THEN '' ELSE ' | ' END ||
                        '[system:' || p_source_ref || '] ' || p_reason,
           source_ref = p_source_ref,
           set_at     = now()
     WHERE operator_id = p_operator_id AND strategy_key = p_strategy_key;
    v_action_taken := 'refreshed_existing_soft_paused';

  ELSE
    -- hard_paused or liquidating → DO NOT downgrade operator stronger state.
    v_action_taken := 'noop_stronger_state_preserved';
  END IF;

  INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, correlation_id, created_at)
  VALUES (
    gen_random_uuid(),
    NULL,
    'kill_switch.system_pause',
    'kill_switches',
    NULL,
    jsonb_build_object(
      'operator_id',     p_operator_id,
      'strategy_key',    p_strategy_key,
      'reason',          p_reason,
      'source_ref',      p_source_ref,
      'set_by_kind',     'system',
      'prior_state',     v_current_state,
      'state_after',     CASE
                           WHEN v_action_taken = 'noop_stronger_state_preserved'
                           THEN v_current_state::text
                           ELSE 'soft_paused'
                         END,
      'action_taken',    v_action_taken
    ),
    v_correlation_id::text,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success',        true,
    'strategy_key',   p_strategy_key,
    'state',          CASE
                        WHEN v_action_taken = 'noop_stronger_state_preserved'
                        THEN v_current_state::text
                        ELSE 'soft_paused'
                      END,
    'action_taken',   v_action_taken,
    'set_by_kind',    'system',
    'source_ref',     p_source_ref,
    'audit_id',       v_audit_id,
    'correlation_id', v_correlation_id
  );
END;
$function$;

-- GRANT is the capability gate.
REVOKE ALL ON FUNCTION public.kill_switch_system_pause(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kill_switch_system_pause(text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.kill_switch_system_pause(text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kill_switch_system_pause(text, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.kill_switch_system_pause(text, text, text, uuid) IS
  'FP-062 6I.5 / DW-144 §8.9. Automated PAUSE-class surface. Service-role only (GRANT-gated, NOT auth.uid-gated). Soft-pause only (bounded blast radius). Transitions only from active — never downgrades an operator hard_paused/liquidating. set_by=NULL + set_by_kind=''system'' + source_ref. Routed by 6I.6a (pdt_block) and 6I.6b (persistent BP). Per-symbol pause is DW-150.';

-- (c) Additive enrichment of kill_switch_resume: record prior_origin in audit.
-- Gate (superadmin) and transition (soft_paused-only) UNCHANGED.
CREATE OR REPLACE FUNCTION public.kill_switch_resume(
  p_strategy_key text,
  p_reason       text,
  p_operator_id  uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_audit_id        uuid;
  v_correlation_id  uuid;
  v_current_state   kill_switch_state;
  v_prior_origin    text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'kill_switch_resume requires superadmin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT state, set_by_kind INTO v_current_state, v_prior_origin
  FROM public.kill_switches
  WHERE operator_id = p_operator_id AND strategy_key = p_strategy_key;

  IF v_current_state IS NULL THEN
    RAISE EXCEPTION 'No kill-switch row exists for strategy %', p_strategy_key
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_current_state <> 'soft_paused' THEN
    RAISE EXCEPTION 'Cannot resume from state % via this RPC (only soft_paused is resumable)', v_current_state
      USING ERRCODE = 'invalid_transaction_state';
  END IF;

  v_correlation_id := gen_random_uuid();

  UPDATE public.kill_switches
     SET state       = 'active',
         reason      = p_reason,
         set_by      = auth.uid(),
         set_at      = now(),
         set_by_kind = 'operator',
         source_ref  = NULL
   WHERE operator_id = p_operator_id AND strategy_key = p_strategy_key;

  INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, correlation_id, created_at)
  VALUES (
    gen_random_uuid(),
    auth.uid(),
    'kill_switch.resume',
    'kill_switches',
    NULL,
    jsonb_build_object(
      'operator_id',   p_operator_id,
      'strategy_key',  p_strategy_key,
      'reason',        p_reason,
      'state_after',   'active',
      'prior_origin',  COALESCE(v_prior_origin, 'unknown')
    ),
    v_correlation_id::text,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success',        true,
    'strategy_key',   p_strategy_key,
    'state',          'active',
    'prior_origin',   COALESCE(v_prior_origin, 'unknown'),
    'audit_id',       v_audit_id,
    'correlation_id', v_correlation_id
  );
END;
$function$;