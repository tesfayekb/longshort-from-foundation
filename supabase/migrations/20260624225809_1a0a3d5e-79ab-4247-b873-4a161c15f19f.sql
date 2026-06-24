-- MIG-121 (ACT-324 / FP-057): longshort_equity_snapshots
-- The equity time-series the portfolio growth chart reads. Written by the
-- placement trigger on every full_rebalance fire (source='rebalance_fire')
-- + future daily cron (source='daily_cron'). RLS/GRANT pattern mirrors
-- longshort_target_positions (MIG-118) verbatim: longshort.view read;
-- service_role-only writes; authenticated INSERT/UPDATE/DELETE denied.

CREATE TABLE IF NOT EXISTS public.longshort_equity_snapshots (
  operator_id     uuid        NOT NULL,
  ts              timestamptz NOT NULL,
  account_equity  numeric     NOT NULL CHECK (account_equity >= 0),
  cash            numeric     NULL,
  long_mv         numeric     NOT NULL CHECK (long_mv >= 0),
  short_mv        numeric     NOT NULL CHECK (short_mv >= 0),
  gross           numeric     NOT NULL CHECK (gross >= 0),
  net             numeric     NOT NULL,
  source          text        NOT NULL CHECK (source IN ('rebalance_fire','daily_cron')),
  mode            text        NULL CHECK (mode IS NULL OR mode IN ('full_rebalance','spot_check')),
  PRIMARY KEY (operator_id, ts)
);

GRANT SELECT ON public.longshort_equity_snapshots TO authenticated;
GRANT ALL    ON public.longshort_equity_snapshots TO service_role;

ALTER TABLE public.longshort_equity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS longshort_equity_snapshots_read_longshort_view ON public.longshort_equity_snapshots;
CREATE POLICY longshort_equity_snapshots_read_longshort_view
  ON public.longshort_equity_snapshots FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS longshort_equity_snapshots_deny_insert ON public.longshort_equity_snapshots;
CREATE POLICY longshort_equity_snapshots_deny_insert
  ON public.longshort_equity_snapshots AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS longshort_equity_snapshots_deny_update ON public.longshort_equity_snapshots;
CREATE POLICY longshort_equity_snapshots_deny_update
  ON public.longshort_equity_snapshots AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS longshort_equity_snapshots_deny_delete ON public.longshort_equity_snapshots;
CREATE POLICY longshort_equity_snapshots_deny_delete
  ON public.longshort_equity_snapshots AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_longshort_equity_snapshots_operator_ts
  ON public.longshort_equity_snapshots (operator_id, ts DESC);