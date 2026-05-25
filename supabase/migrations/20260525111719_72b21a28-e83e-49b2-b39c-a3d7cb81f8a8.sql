-- MIG-050 — FP-008 sub-step 8.6 / ACT-110
-- universe_membership table per DEC-038.1 clause (7) + §10.5 deliverable 6.
-- Two-boolean shape mirrors EligibleConstituent at
-- src/features/longshort/services/universe/hard-exclusions/types.ts:50-54
-- (Surface 1 Option A operator-confirmed; no universe_book enum minted).
-- CHECK (long_eligible OR short_eligible) excludes neither-rows; rationale
-- lives in hard_exclusions (MIG-051) + universe_refresh_log aggregates.
-- FK to universe_refresh_log(refresh_id) ON DELETE RESTRICT preserves audit
-- trail. RLS operator-scoped per DEC-038.1 clause (7); follows MIG-048
-- DROP-then-CREATE policy idiom for idempotent re-runs.

CREATE TABLE IF NOT EXISTS public.universe_membership (
  operator_id uuid NOT NULL,
  ticker text NOT NULL,
  as_of_date date NOT NULL,
  long_eligible boolean NOT NULL,
  short_eligible boolean NOT NULL,
  quarter_label text NOT NULL,
  refresh_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, ticker, as_of_date),
  CONSTRAINT universe_membership_book_check CHECK (long_eligible OR short_eligible),
  CONSTRAINT universe_membership_refresh_fk
    FOREIGN KEY (refresh_id) REFERENCES public.universe_refresh_log(refresh_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_universe_membership_as_of_date
  ON public.universe_membership (as_of_date);
CREATE INDEX IF NOT EXISTS idx_universe_membership_operator_as_of
  ON public.universe_membership (operator_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_universe_membership_refresh_id
  ON public.universe_membership (refresh_id);

ALTER TABLE public.universe_membership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS universe_membership_operator_read ON public.universe_membership;
CREATE POLICY universe_membership_operator_read
  ON public.universe_membership
  FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

DROP POLICY IF EXISTS universe_membership_operator_insert ON public.universe_membership;
CREATE POLICY universe_membership_operator_insert
  ON public.universe_membership
  FOR INSERT
  TO authenticated
  WITH CHECK (operator_id = auth.uid());