-- MIG-118 (FP-055 / ACT-302): longshort_target_positions
-- Mirror combiner_book RLS + GRANT pattern verbatim. Read = longshort.view;
-- write = service_role only (DEC-032 clause-4 preserved: NO new
-- execution-adjacent permission key introduced).

CREATE TABLE IF NOT EXISTS public.longshort_target_positions (
  operator_id          uuid        NOT NULL,
  as_of_date           date        NOT NULL,
  side                 text        NOT NULL CHECK (side IN ('long','short')),
  ticker               text        NOT NULL,
  target_notional      numeric     NOT NULL CHECK (target_notional >= 0),
  target_shares        numeric     NULL CHECK (target_shares IS NULL OR target_shares >= 0),
  allocation_pct       numeric     NOT NULL CHECK (allocation_pct > 0 AND allocation_pct <= 1),
  leverage             numeric     NOT NULL CHECK (leverage >= 1 AND leverage <= 2),
  sizing_basis         text        NOT NULL CHECK (sizing_basis IN ('account_equity')),
  sizing_basis_value   numeric     NOT NULL CHECK (sizing_basis_value > 0),
  capital_base         numeric     NOT NULL CHECK (capital_base > 0),
  book_size            integer     NOT NULL CHECK (book_size > 0),
  ranker_source        text        NOT NULL,
  book_ref_computed_at timestamptz NOT NULL,
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, ticker),
  UNIQUE (operator_id, as_of_date, side, ticker)
);

GRANT SELECT ON public.longshort_target_positions TO authenticated;
GRANT ALL    ON public.longshort_target_positions TO service_role;

ALTER TABLE public.longshort_target_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS longshort_target_positions_read_longshort_view ON public.longshort_target_positions;
CREATE POLICY longshort_target_positions_read_longshort_view
  ON public.longshort_target_positions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS longshort_target_positions_deny_insert ON public.longshort_target_positions;
CREATE POLICY longshort_target_positions_deny_insert
  ON public.longshort_target_positions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS longshort_target_positions_deny_update ON public.longshort_target_positions;
CREATE POLICY longshort_target_positions_deny_update
  ON public.longshort_target_positions AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS longshort_target_positions_deny_delete ON public.longshort_target_positions;
CREATE POLICY longshort_target_positions_deny_delete
  ON public.longshort_target_positions AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_longshort_target_positions_operator_asof
  ON public.longshort_target_positions (operator_id, as_of_date);