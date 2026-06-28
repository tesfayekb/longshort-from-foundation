-- MIG: DEC-071 sub-step 3a — schema keystone for reversal cross-signal gate.
--
-- (1) signal_observations.skip_reason — nullable text discriminator that lets
--     the assembler distinguish a "gated (coverage-OK, contribution-skipped)"
--     row from a genuinely absent one. The existing
--     signal_observations_value_is_present_check (value⇔is_present) is
--     untouched and remains the structural invariant; skip_reason is an
--     ADDITIONAL axis, not a replacement. A gated row is still
--     (value=null, is_present=false) — legal under the existing CHECK —
--     plus skip_reason='gated_by_news' or 'gated_by_catalyst'. Backward-
--     compatible: every existing writer omits the field; UPSERTs that do
--     not set it default to NULL and behave identically to pre-migration.
--
-- (2) reversal_ungated_observations — DW-176 shadow capture. Records the
--     RAW pre-gate computeReversal output for every name on every tick,
--     tagged with the gate_decision actually applied. The 'none' case
--     covers two situations: (a) gate inputs unavailable (precondition
--     failed → raw emit), and (b) gate inputs available but neither news
--     nor catalyst fired on this ticker. Both write the raw value with
--     gate_decision='none' so the shadow series has zero gaps for
--     Phase-7 / DW-177 ablation analysis.

ALTER TABLE public.signal_observations
  ADD COLUMN IF NOT EXISTS skip_reason text NULL;

COMMENT ON COLUMN public.signal_observations.skip_reason IS
  'DEC-071: nullable discriminator for typed-absence rows. NULL for present rows and for legacy skip rows. Set to ''gated_by_news'' / ''gated_by_catalyst'' / ''gate_inputs_unavailable'' by the reversal orchestrator when §4.3.5 gated-≠-missing carve-out applies. The value⇔is_present CHECK is unchanged; gated rows are (value=null, is_present=false) plus skip_reason set.';

CREATE TABLE IF NOT EXISTS public.reversal_ungated_observations (
  operator_id    uuid        NOT NULL,
  signal_id      text        NOT NULL,
  as_of_date     date        NOT NULL,
  ticker         text        NOT NULL,
  raw_value      double precision NULL,
  gate_decision  text        NOT NULL,
  computed_at    timestamptz NOT NULL,
  PRIMARY KEY (operator_id, signal_id, as_of_date, ticker),
  CONSTRAINT reversal_ungated_observations_gate_decision_check
    CHECK (gate_decision IN ('none','gated_by_news','gated_by_catalyst','gate_inputs_unavailable'))
);

COMMENT ON TABLE public.reversal_ungated_observations IS
  'DEC-071 / DW-176: ungated-shadow capture for Signal #7 (short-term reversal). One row per (operator_id, signal_id, as_of_date, ticker) carrying the RAW computeReversal output BEFORE the news/catalyst gate is applied, plus the gate_decision actually taken on the live emit. Phase-7 / DW-177 ablation reads this table alongside signal_observations to measure the live-vs-ungated ROI delta. Zero series gaps: gate_inputs_unavailable and ungated-ticker rows both write raw with gate_decision=''none'' / ''gate_inputs_unavailable''.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reversal_ungated_observations TO authenticated;
GRANT ALL ON public.reversal_ungated_observations TO service_role;

ALTER TABLE public.reversal_ungated_observations ENABLE ROW LEVEL SECURITY;

-- Mirrors the signal_observations RLS surface: service_role unconditional,
-- authenticated reads gated on longshort.view, writes gated on longshort.manage.
DROP POLICY IF EXISTS reversal_ungated_observations_service_role_all
  ON public.reversal_ungated_observations;
CREATE POLICY reversal_ungated_observations_service_role_all
  ON public.reversal_ungated_observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS reversal_ungated_observations_authenticated_select
  ON public.reversal_ungated_observations;
CREATE POLICY reversal_ungated_observations_authenticated_select
  ON public.reversal_ungated_observations
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS reversal_ungated_observations_authenticated_insert
  ON public.reversal_ungated_observations;
CREATE POLICY reversal_ungated_observations_authenticated_insert
  ON public.reversal_ungated_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'longshort.manage'));

DROP POLICY IF EXISTS reversal_ungated_observations_authenticated_update
  ON public.reversal_ungated_observations;
CREATE POLICY reversal_ungated_observations_authenticated_update
  ON public.reversal_ungated_observations
  FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'longshort.manage'));