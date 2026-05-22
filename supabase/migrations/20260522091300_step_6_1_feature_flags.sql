-- MIG-039 — FP-006 sub-step 6.1(b)
-- feature_flags table per CROSSWIND §12.5 evidence-tier hierarchy
-- Standalone operator_id column per DEC-034.1 clause (8); operators table NOT created (v1 single-operator)

CREATE TABLE IF NOT EXISTS public.feature_flags (
  operator_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  flag_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  evidence_tier text NOT NULL DEFAULT 'weak',
  reason text,
  set_by uuid REFERENCES auth.users(id),
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, flag_key),
  CONSTRAINT feature_flags_evidence_tier_check
    CHECK (evidence_tier IN ('weak', 'medium', 'strong'))
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY feature_flags_read_policy ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY feature_flags_superadmin_write_policy ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

COMMENT ON TABLE public.feature_flags IS 'FP-006 sub-step 6.1(b) — platform-tier feature-flag registry per CROSSWIND §12.5 evidence-tier hierarchy. Standalone operator_id column per DEC-034.1 clause (8); operators table NOT created (v1 single-operator). Future sub-step 6.4 will land strong-evidence workflow RPCs governing the evidence_tier transitions weak -> medium -> strong.';
