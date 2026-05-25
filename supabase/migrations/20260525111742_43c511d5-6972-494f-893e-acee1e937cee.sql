-- MIG-051 — FP-008 sub-step 8.6 / ACT-110
-- hard_exclusions table per DEC-038.1 clause (7) + §10.5 deliverable 6.
-- PK is (operator_id, ticker, as_of_date) — rule_id NOT in PK. One row per
-- ticker per date with firing_rules text[] array column.
-- refresh_id NULLABLE: continuous-refresh firings (3.3a/b/e per MIG-049)
-- don't tie to a quarterly refresh; quarterly-refresh firings DO. ON DELETE
-- SET NULL preserves hard_exclusions rows if refresh_log row is deleted.
-- GIN index on firing_rules enables rule-array containment queries.
-- RLS operator-scoped per MIG-050 precedent.

CREATE TABLE IF NOT EXISTS public.hard_exclusions (
  operator_id uuid NOT NULL,
  ticker text NOT NULL,
  as_of_date date NOT NULL,
  firing_rules text[] NOT NULL,
  firing_reasons jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  refresh_id uuid NULL,
  PRIMARY KEY (operator_id, ticker, as_of_date),
  CONSTRAINT hard_exclusions_firing_rules_nonempty CHECK (array_length(firing_rules, 1) > 0),
  CONSTRAINT hard_exclusions_firing_reasons_object CHECK (jsonb_typeof(firing_reasons) = 'object'),
  CONSTRAINT hard_exclusions_refresh_fk
    FOREIGN KEY (refresh_id) REFERENCES public.universe_refresh_log(refresh_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hard_exclusions_as_of_date
  ON public.hard_exclusions (as_of_date);
CREATE INDEX IF NOT EXISTS idx_hard_exclusions_operator_as_of
  ON public.hard_exclusions (operator_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_hard_exclusions_refresh_id
  ON public.hard_exclusions (refresh_id);
CREATE INDEX IF NOT EXISTS idx_hard_exclusions_firing_rules_gin
  ON public.hard_exclusions USING GIN (firing_rules);

ALTER TABLE public.hard_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hard_exclusions_operator_read ON public.hard_exclusions;
CREATE POLICY hard_exclusions_operator_read
  ON public.hard_exclusions
  FOR SELECT
  TO authenticated
  USING (operator_id = auth.uid());

DROP POLICY IF EXISTS hard_exclusions_operator_insert ON public.hard_exclusions;
CREATE POLICY hard_exclusions_operator_insert
  ON public.hard_exclusions
  FOR INSERT
  TO authenticated
  WITH CHECK (operator_id = auth.uid());