-- MIG-040 — FP-006 sub-step 6.1(d)
-- Kill-switch infrastructure per CROSSWIND §11.6 + DEC-034.1 clause (9) jobs-and-scheduler integration
-- Platform-tier table (all strategies must respect; not longshort-tier)
-- Operator_id column per DEC-031 sub-point 5 / F-2 + MIG-038 precedent
-- AC-09 binding: table + RPCs + route + UI
--
-- v2 corrections vs v1 (per §22.8.4 Lovable STOP reconciliation):
--   * is_superadmin() -> is_superadmin(auth.uid()) per actual signature at sql/02_rbac_security_helpers.sql:6
--   * audit_logs columns user_id/resource_type/resource_id -> actor_id/target_type/target_id per sql/01_rbac_schema.sql:45-56
--   * target_id is UUID type; strategy_key (text) carried in metadata; target_id = NULL

CREATE TYPE kill_switch_state AS ENUM ('active', 'soft_paused', 'hard_paused', 'liquidating');

CREATE TABLE IF NOT EXISTS public.kill_switches (
  operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  strategy_key text NOT NULL,
  state kill_switch_state NOT NULL DEFAULT 'active',
  reason text,
  set_by uuid REFERENCES auth.users(id),
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, strategy_key)
);

ALTER TABLE public.kill_switches ENABLE ROW LEVEL SECURITY;

CREATE POLICY kill_switches_read_policy ON public.kill_switches
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY kill_switches_no_direct_write_policy ON public.kill_switches
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.permissions (key, description)
VALUES ('system.kill_switches.manage', 'Manage platform kill-switches (soft-pause, hard-pause, manual-liquidate). Reauth required (sudo mode). Superadmin-only by default.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kill_switch_soft_pause(
  p_strategy_key text,
  p_reason text,
  p_operator_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_correlation_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'kill_switch_soft_pause requires superadmin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_correlation_id := gen_random_uuid();

  INSERT INTO public.kill_switches (operator_id, strategy_key, state, reason, set_by, set_at)
  VALUES (p_operator_id, p_strategy_key, 'soft_paused', p_reason, auth.uid(), now())
  ON CONFLICT (operator_id, strategy_key) DO UPDATE
    SET state = 'soft_paused',
        reason = EXCLUDED.reason,
        set_by = EXCLUDED.set_by,
        set_at = EXCLUDED.set_at;

  INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, correlation_id, created_at)
  VALUES (
    gen_random_uuid(),
    auth.uid(),
    'kill_switch.soft_pause',
    'kill_switches',
    NULL,
    jsonb_build_object(
      'operator_id', p_operator_id,
      'strategy_key', p_strategy_key,
      'reason', p_reason,
      'state_after', 'soft_paused'
    ),
    v_correlation_id::text,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'strategy_key', p_strategy_key,
    'state', 'soft_paused',
    'audit_id', v_audit_id,
    'correlation_id', v_correlation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kill_switch_hard_pause(
  p_strategy_key text,
  p_reason text,
  p_operator_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_correlation_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'kill_switch_hard_pause requires superadmin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_correlation_id := gen_random_uuid();

  INSERT INTO public.kill_switches (operator_id, strategy_key, state, reason, set_by, set_at)
  VALUES (p_operator_id, p_strategy_key, 'hard_paused', p_reason, auth.uid(), now())
  ON CONFLICT (operator_id, strategy_key) DO UPDATE
    SET state = 'hard_paused',
        reason = EXCLUDED.reason,
        set_by = EXCLUDED.set_by,
        set_at = EXCLUDED.set_at;

  INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, correlation_id, created_at)
  VALUES (
    gen_random_uuid(),
    auth.uid(),
    'kill_switch.hard_pause',
    'kill_switches',
    NULL,
    jsonb_build_object(
      'operator_id', p_operator_id,
      'strategy_key', p_strategy_key,
      'reason', p_reason,
      'state_after', 'hard_paused'
    ),
    v_correlation_id::text,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'strategy_key', p_strategy_key,
    'state', 'hard_paused',
    'audit_id', v_audit_id,
    'correlation_id', v_correlation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kill_switch_manual_liquidate(
  p_strategy_key text,
  p_reason text,
  p_operator_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_correlation_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'kill_switch_manual_liquidate requires superadmin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_correlation_id := gen_random_uuid();

  INSERT INTO public.kill_switches (operator_id, strategy_key, state, reason, set_by, set_at)
  VALUES (p_operator_id, p_strategy_key, 'liquidating', p_reason, auth.uid(), now())
  ON CONFLICT (operator_id, strategy_key) DO UPDATE
    SET state = 'liquidating',
        reason = EXCLUDED.reason,
        set_by = EXCLUDED.set_by,
        set_at = EXCLUDED.set_at;

  INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, correlation_id, created_at)
  VALUES (
    gen_random_uuid(),
    auth.uid(),
    'kill_switch.manual_liquidate',
    'kill_switches',
    NULL,
    jsonb_build_object(
      'operator_id', p_operator_id,
      'strategy_key', p_strategy_key,
      'reason', p_reason,
      'state_after', 'liquidating'
    ),
    v_correlation_id::text,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'strategy_key', p_strategy_key,
    'state', 'liquidating',
    'audit_id', v_audit_id,
    'correlation_id', v_correlation_id,
    'note', 'State transition recorded. Actual order-cancel + market-sell loop is Phase 5 territory.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kill_switch_resume(
  p_strategy_key text,
  p_reason text,
  p_operator_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id uuid;
  v_correlation_id uuid;
  v_current_state kill_switch_state;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'kill_switch_resume requires superadmin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT state INTO v_current_state
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
  SET state = 'active',
      reason = p_reason,
      set_by = auth.uid(),
      set_at = now()
  WHERE operator_id = p_operator_id AND strategy_key = p_strategy_key;

  INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, correlation_id, created_at)
  VALUES (
    gen_random_uuid(),
    auth.uid(),
    'kill_switch.resume',
    'kill_switches',
    NULL,
    jsonb_build_object(
      'operator_id', p_operator_id,
      'strategy_key', p_strategy_key,
      'reason', p_reason,
      'state_after', 'active'
    ),
    v_correlation_id::text,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'strategy_key', p_strategy_key,
    'state', 'active',
    'audit_id', v_audit_id,
    'correlation_id', v_correlation_id
  );
END;
$$;

COMMENT ON TABLE public.kill_switches IS 'FP-006 sub-step 6.1(d) — platform-tier kill-switch infrastructure per CROSSWIND section 11.6. Sole write surface is via governed RPCs (kill_switch_soft_pause / hard_pause / manual_liquidate / resume); direct INSERT/UPDATE blocked by RLS policy. Each state change emits audit_logs row via SQL-level INSERT (not subject to T4 TypeScript audit-writer trap). React-layer sudo gate via RequireSudo actionKey="kill_switch_route" provides the DEC-029 reauth predicate.';
