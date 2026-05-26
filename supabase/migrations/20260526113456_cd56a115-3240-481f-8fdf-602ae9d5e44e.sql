-- MIG-054 — FP-008 Sub-Step 8.13 / ACT-119
--
-- UPDATE feature_flags.universe.enabled FROM false TO true per DEC-038.1 clause (5)
-- verbatim operational flip at Phase 1 closure. Parallels MIG-045 + MIG-046
-- (job_registry SET enabled=true) precedent shape: first-class operational-state
-- migration at phase boundary, NOT smoke/debugging state per §22.5.3.
--
-- Per AC-28 + AC-34 + DEC-038 clause (5) + DEC-038.1 clause (5):
-- "flag flipped to true operationally when sub-step 8.13 closes"
--
-- Honest framing per ADR-007:
-- This flip is the OPERATIONAL GATE-OPEN signal — NOT a claim that production
-- runtime has been observed. Production runtime evidence (AC-17 / AC-19 /
-- AC-26 / AC-31 runtime portions) accrues via FP-009 (UI + hardening) +
-- subsequent operational shakedown per DW-075.
--
-- Idempotent: no-op if already true; affects 1 row (universe.enabled for default operator).

UPDATE public.feature_flags
SET enabled = true
WHERE flag_key = 'universe.enabled'
  AND operator_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND enabled = false;