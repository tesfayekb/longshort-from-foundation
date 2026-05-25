-- MIG-052 — FP-008 sub-step 8.6 / ACT-110
-- feature_flags seed `universe.enabled=false` per DEC-038 clause (5) +
-- DEC-038.1 clause (5). Default operator_id per MIG-039 convention.
-- Idempotent ON CONFLICT per feature_flags PK. evidence_tier='weak' for
-- initial seed; promotion happens operationally at sub-step 8.13 closure.

INSERT INTO public.feature_flags (
  operator_id, flag_key, enabled, evidence_tier, reason, set_by, set_at
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'universe.enabled',
  false,
  'weak',
  'FP-008 sub-step 8.6 / ACT-110 initial seed per DEC-038 clause (5) + DEC-038.1 clause (5). Flag flipped to true operationally at sub-step 8.13 closure (FP-008 final closure). Universe-component remains inert (typed-absence per §2 axiom 3) until flag flips.',
  NULL,
  now()
)
ON CONFLICT (operator_id, flag_key) DO NOTHING;