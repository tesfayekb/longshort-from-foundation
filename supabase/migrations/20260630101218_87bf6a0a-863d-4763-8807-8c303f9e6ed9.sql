-- MIG-149 — FP-062 ranking-snapshot sidecar (operator-authorized Option 1).
-- Read-only sidecar at rebalance-fire; independent of submit path.
-- RLS template cloned verbatim from MIG-100 / combiner_book_shadow.

BEGIN;

CREATE TABLE IF NOT EXISTS public.longshort_rebalance_ranking_snapshot (
  operator_id                  uuid        NOT NULL,
  as_of_date                   date        NOT NULL,
  snapshot_computed_at         timestamptz NOT NULL,
  side                         text        NOT NULL CHECK (side IN ('long','short')),
  ticker                       text        NOT NULL,
  rank_within_side             integer     NOT NULL CHECK (rank_within_side >= 1),
  score                        numeric     NOT NULL,
  ranker_source                text        NOT NULL,
  gics_sector                  text,
  generation_skew              boolean     NOT NULL DEFAULT false,
  submit_reference_computed_at timestamptz,
  snapshotted_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, snapshot_computed_at, side, ticker)
);

GRANT SELECT ON public.longshort_rebalance_ranking_snapshot TO authenticated;
GRANT ALL    ON public.longshort_rebalance_ranking_snapshot TO service_role;

ALTER TABLE public.longshort_rebalance_ranking_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS longshort_rebalance_ranking_snapshot_read_longshort_view
  ON public.longshort_rebalance_ranking_snapshot;
CREATE POLICY longshort_rebalance_ranking_snapshot_read_longshort_view
  ON public.longshort_rebalance_ranking_snapshot FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS longshort_rebalance_ranking_snapshot_deny_insert
  ON public.longshort_rebalance_ranking_snapshot;
CREATE POLICY longshort_rebalance_ranking_snapshot_deny_insert
  ON public.longshort_rebalance_ranking_snapshot AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS longshort_rebalance_ranking_snapshot_deny_update
  ON public.longshort_rebalance_ranking_snapshot;
CREATE POLICY longshort_rebalance_ranking_snapshot_deny_update
  ON public.longshort_rebalance_ranking_snapshot AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS longshort_rebalance_ranking_snapshot_deny_delete
  ON public.longshort_rebalance_ranking_snapshot;
CREATE POLICY longshort_rebalance_ranking_snapshot_deny_delete
  ON public.longshort_rebalance_ranking_snapshot AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_lsrrs_operator_asof
  ON public.longshort_rebalance_ranking_snapshot (operator_id, as_of_date);

COMMIT;