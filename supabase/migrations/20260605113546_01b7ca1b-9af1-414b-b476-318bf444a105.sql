-- MIG-064 — FP-009 Bucket A Commit A3 / Phase 2.1 missingness capture
--
-- signal_observations: per-(operator, signal, as_of_date, ticker) row recording
-- whether the signal computation produced a value or typed-absence. Feeds the
-- missingness profile (§6.5.3) that Phase 3 combiner training consumes.
--
-- Shape decisions:
--   - composite PK (operator_id, signal_id, as_of_date, ticker) — matches the
--     uniqueness invariant + supports UPSERT idempotency on re-runs
--     (last-writer-wins by composite PK; same convention as universe_membership)
--   - value double precision NULL — typed-absence per FP-009 survey §1
--     (number | null TS contract per §22.3(b) Decimal-not-used lock)
--   - is_present bool NOT NULL — redundant with (value IS NULL) but explicit
--     for combiner queries; CHECK constraint enforces consistency between the
--     two columns so the redundancy cannot drift
--   - gics_sector text NULL — captured at compute time for forensic stability
--     (sector reclassifications happen — see MIG-063 Q2 rationale; recording
--     the sector AT compute time pins the within-sector grouping basis)
--   - computed_at timestamptz NOT NULL DEFAULT now() — wall-clock for telemetry
--     only, not signal correctness; financial paths inject clock per §3.1
--
-- RLS: deny-all-authenticated-writes per MIG-057 RESTRICTIVE discipline
--   (signal-computation jobs run as service role; no operator write path).
--   Operator can SELECT their own rows.
--
-- No backfill: empty table immediately post-apply. First observations arrive
-- at Bucket C when momentum signal runs in production. Pre-MIG-064 rows do
-- not exist (table is new), so the INC-36 epistemic-honesty pattern applies
-- vacuously — there is nothing to backfill.

CREATE TABLE IF NOT EXISTS public.signal_observations (
  operator_id uuid NOT NULL,
  signal_id text NOT NULL,
  as_of_date date NOT NULL,
  ticker text NOT NULL,
  value double precision,
  is_present boolean NOT NULL,
  gics_sector text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, signal_id, as_of_date, ticker),
  CONSTRAINT signal_observations_value_is_present_check
    CHECK ((value IS NULL AND is_present = false) OR (value IS NOT NULL AND is_present = true))
);

CREATE INDEX IF NOT EXISTS idx_signal_observations_operator_signal_date
  ON public.signal_observations (operator_id, signal_id, as_of_date);

CREATE INDEX IF NOT EXISTS idx_signal_observations_signal_date
  ON public.signal_observations (signal_id, as_of_date);

GRANT SELECT ON public.signal_observations TO authenticated;
GRANT ALL ON public.signal_observations TO service_role;

ALTER TABLE public.signal_observations ENABLE ROW LEVEL SECURITY;

-- Operator can read their own observations.
DROP POLICY IF EXISTS signal_observations_select_own ON public.signal_observations;
CREATE POLICY signal_observations_select_own
  ON public.signal_observations
  FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

-- RESTRICTIVE deny-all-authenticated-writes per MIG-057 discipline. The
-- signal-computation pipeline runs as service role (bypasses RLS); no
-- operator-side write path exists or should exist. Per-command RESTRICTIVE
-- (never FOR ALL — see sql/13 rationale: RESTRICTIVE FOR ALL would also
-- block SELECT).
DROP POLICY IF EXISTS signal_observations_deny_authenticated_insert ON public.signal_observations;
CREATE POLICY signal_observations_deny_authenticated_insert
  ON public.signal_observations
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS signal_observations_deny_authenticated_update ON public.signal_observations;
CREATE POLICY signal_observations_deny_authenticated_update
  ON public.signal_observations
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS signal_observations_deny_authenticated_delete ON public.signal_observations;
CREATE POLICY signal_observations_deny_authenticated_delete
  ON public.signal_observations
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

COMMENT ON TABLE public.signal_observations IS
  'Per-(operator, signal, as_of_date, ticker) observation row. Feeds Phase 3 combiner training data per §6.5.3 missingness profile. Confirmed by FP-009 Bucket A Commit A3 / MIG-064 / Phase 2.1.';
