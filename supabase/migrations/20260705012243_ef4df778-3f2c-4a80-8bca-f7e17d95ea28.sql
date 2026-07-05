-- MIG-154 — FP-069 W3.6.e-ii (ACT-464.e-ii): overshoot_strategy_config table.
--
-- Ratified A3 schema (operator, ACT-464 STEP A):
--   * account_key         : natural PK (multi-account forward-compat).
--   * strategy_allocation_pct : (0, 1] — fraction of equity deployed to overshoot.
--   * margin_multiplier   : [1.00, 2.00] — leverage factor applied to the sizingBase.
--   * both CHECK constraints (fail-fast on out-of-range writes).
--   * RLS per repo has_role/has_permission pattern.
--   * updated_by nullable (service-role writes carry no user).
--
-- TYPED-ABSENCE CONTRACT: the entry engine reads exactly ONE row keyed by
-- account_key='overshoot-paper-primary'. On row-missing the engine emits
-- typed refusal `strategy_config_absent` -- NEVER a schema-default silent
-- fallback (§9 SENTINEL discipline, ACT-464 STEP A ratification).
--
-- Seed row for the primary account is written POST-MIGRATION via the
-- data-write tool per INC-82 rule (schema in migrations; data via insert).
--
-- Byte-identical grant + RLS shape to MIG-152 sibling tables.

CREATE TABLE IF NOT EXISTS public.overshoot_strategy_config (
  account_key               text        NOT NULL,
  strategy_allocation_pct   numeric     NOT NULL,
  margin_multiplier         numeric     NOT NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid        NULL,
  PRIMARY KEY (account_key),
  CONSTRAINT overshoot_strategy_config_alloc_pct_check
    CHECK (strategy_allocation_pct > 0 AND strategy_allocation_pct <= 1),
  CONSTRAINT overshoot_strategy_config_margin_multiplier_check
    CHECK (margin_multiplier >= 1.00 AND margin_multiplier <= 2.00)
);
COMMENT ON TABLE public.overshoot_strategy_config IS
  'FP-069 W3.6.e-ii (ACT-464.e-ii). Overshoot strategy allocation + margin config, keyed by account_key. sizingBase = equity * strategy_allocation_pct * margin_multiplier composed by the entry engine. Row-missing => typed refusal strategy_config_absent (never schema-default silent fallback).';

GRANT SELECT ON public.overshoot_strategy_config TO authenticated;
GRANT ALL ON public.overshoot_strategy_config TO service_role;
ALTER TABLE public.overshoot_strategy_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_strategy_config_read
  ON public.overshoot_strategy_config FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_strategy_config_service_all
  ON public.overshoot_strategy_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY overshoot_strategy_config_no_direct_write
  ON public.overshoot_strategy_config FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.overshoot_strategy_config_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER overshoot_strategy_config_touch_trg
  BEFORE UPDATE ON public.overshoot_strategy_config
  FOR EACH ROW EXECUTE FUNCTION public.overshoot_strategy_config_touch();