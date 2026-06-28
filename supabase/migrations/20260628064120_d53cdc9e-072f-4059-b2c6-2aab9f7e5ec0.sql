-- MIG-NNN (DW-173): per-signal shadow table for SI-level / days-to-cover
-- alpha-variant series. Mechanism (2) — separate physical table; the live
-- feature-assembler reads `signal_observations` for `SIGNAL_IDS_ALL` only,
-- so a separate table is the leak-proof seam (a new signal_id row in
-- `signal_observations` would be picked up by the live ranker).
--
-- Modeled on `reversal_ungated_observations` (DW-176 / MIG of 2026-06-28):
-- same RLS surface (service_role all; authenticated SELECT on longshort.view;
-- authenticated writes on longshort.manage), same idempotent-upsert PK
-- discipline, same `raw_value double precision NULL` typed-absence column.

CREATE TABLE IF NOT EXISTS public.short_interest_alpha_shadow (
  operator_id  uuid             NOT NULL,
  variant      text             NOT NULL,
  as_of_date   date             NOT NULL,
  ticker       text             NOT NULL,
  raw_value    double precision NULL,
  gics_sector  text             NULL,
  computed_at  timestamptz      NOT NULL,
  PRIMARY KEY (operator_id, variant, as_of_date, ticker),
  CONSTRAINT short_interest_alpha_shadow_variant_check
    CHECK (variant IN ('si_level','si_dtc'))
);

COMMENT ON TABLE public.short_interest_alpha_shadow IS
  'DW-173: per-signal shadow capture for Signal #5 alpha-shape variants. Two variants per (operator_id, as_of_date, ticker): si_level (within-sector z-score of the live-derived si_pct_float[T]) and si_dtc (within-sector z-score of the latest days-to-cover already fanned out to short_interest_days_to_cover). The live ΔSI compute, the live signal_observations #5 row, the live ranker, and the DW-165 squeeze screen are UNCHANGED — this table is physically separate from signal_observations so the feature-assembler cannot see it. Phase-7 / FP-058 reads this table alongside signal_observations to measure promote/stack/keep for ΔSI vs level vs DTC. Typed-absence: NULL raw_value reserved; never fabricated 0 (§9). The charter cross-ref pointing at combiner_shadow_variant_config is incorrect — that harness is ranker-tuning-only and cannot hold a new alpha series; see DW-173 register addendum.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.short_interest_alpha_shadow TO authenticated;
GRANT ALL ON public.short_interest_alpha_shadow TO service_role;

ALTER TABLE public.short_interest_alpha_shadow ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS short_interest_alpha_shadow_service_role_all
  ON public.short_interest_alpha_shadow;
CREATE POLICY short_interest_alpha_shadow_service_role_all
  ON public.short_interest_alpha_shadow
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS short_interest_alpha_shadow_authenticated_select
  ON public.short_interest_alpha_shadow;
CREATE POLICY short_interest_alpha_shadow_authenticated_select
  ON public.short_interest_alpha_shadow
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS short_interest_alpha_shadow_authenticated_insert
  ON public.short_interest_alpha_shadow;
CREATE POLICY short_interest_alpha_shadow_authenticated_insert
  ON public.short_interest_alpha_shadow
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'longshort.manage'));

DROP POLICY IF EXISTS short_interest_alpha_shadow_authenticated_update
  ON public.short_interest_alpha_shadow;
CREATE POLICY short_interest_alpha_shadow_authenticated_update
  ON public.short_interest_alpha_shadow
  FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'longshort.manage'));
