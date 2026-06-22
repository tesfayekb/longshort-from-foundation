-- MIG-114: signal_decay_returns + signal_decay_log
-- Measurement-only instrument for DEC-048 evidence (close-to-next-open per-signal alpha decay).
-- Mirrors combiner_forward_returns governance: deny-write RLS for authenticated, service_role
-- writes via SECURITY DEFINER bypass; permission-gated SELECT; typed-absence CHECK constraint.
-- ASCII-only. No consumer wired.

-- ============================================================
-- 1. signal_decay_returns
-- ============================================================
CREATE TABLE public.signal_decay_returns (
  operator_id        uuid NOT NULL,
  signal_id          text NOT NULL,
  seed_as_of_date    date NOT NULL,
  ticker             text NOT NULL,
  horizon_label      text NOT NULL,
  seed_value         double precision,
  seed_close         double precision,
  next_open          double precision,
  open_decay_return  double precision,
  seed_close_date    date,
  next_open_date     date,
  price_source       text NOT NULL DEFAULT 'polygon',
  price_source_status text NOT NULL,
  notes              jsonb,
  computed_at        timestamptz NOT NULL,
  PRIMARY KEY (operator_id, signal_id, seed_as_of_date, ticker, horizon_label),
  CONSTRAINT signal_decay_returns_horizon_label_check
    CHECK (horizon_label IN ('next_open')),
  CONSTRAINT signal_decay_returns_price_source_check
    CHECK (price_source IN ('polygon')),
  CONSTRAINT signal_decay_returns_price_source_status_check
    CHECK (price_source_status IN (
      'success',
      'unreconciled_single_source',
      'polygon_404',
      'fetch_error',
      'halted_at_open',
      'universe_dropped',
      'hard_excluded_since_seed'
    )),
  -- Typed-absence: data-bearing statuses must carry NON-NULL measurements;
  -- non-data-bearing statuses must carry NULL measurements. NEVER 0/-999.
  CONSTRAINT signal_decay_returns_typed_absence_chk CHECK (
    (
      price_source_status IN ('success','unreconciled_single_source')
      AND seed_close IS NOT NULL
      AND next_open IS NOT NULL
      AND open_decay_return IS NOT NULL
      AND seed_close_date IS NOT NULL
      AND next_open_date IS NOT NULL
    )
    OR
    (
      price_source_status NOT IN ('success','unreconciled_single_source')
      AND next_open IS NULL
      AND open_decay_return IS NULL
    )
  )
);

CREATE INDEX signal_decay_returns_signal_seed_idx
  ON public.signal_decay_returns (operator_id, signal_id, seed_as_of_date);

CREATE INDEX signal_decay_returns_status_idx
  ON public.signal_decay_returns (operator_id, price_source_status, computed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_decay_returns TO authenticated;
GRANT ALL ON public.signal_decay_returns TO service_role;

ALTER TABLE public.signal_decay_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY signal_decay_returns_read_longshort_view
  ON public.signal_decay_returns
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

CREATE POLICY signal_decay_returns_deny_insert
  ON public.signal_decay_returns
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY signal_decay_returns_deny_update
  ON public.signal_decay_returns
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY signal_decay_returns_deny_delete
  ON public.signal_decay_returns
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 2. signal_decay_log (run-level telemetry; NOT signal_compute_log)
-- ============================================================
CREATE TABLE public.signal_decay_log (
  run_id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id         uuid NOT NULL,
  as_of_date          date NOT NULL,
  outcome             text NOT NULL,
  signals_considered  integer NOT NULL DEFAULT 0,
  observations_considered integer NOT NULL DEFAULT 0,
  distinct_tickers_fetched integer NOT NULL DEFAULT 0,
  rows_written        integer NOT NULL DEFAULT 0,
  by_status           jsonb,
  failure_reason      text,
  started_at          timestamptz NOT NULL,
  completed_at        timestamptz NOT NULL,
  CONSTRAINT signal_decay_log_outcome_check
    CHECK (outcome IN ('completed','failed'))
);

CREATE INDEX signal_decay_log_operator_as_of_idx
  ON public.signal_decay_log (operator_id, as_of_date DESC, completed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_decay_log TO authenticated;
GRANT ALL ON public.signal_decay_log TO service_role;

ALTER TABLE public.signal_decay_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY signal_decay_log_read_longshort_view
  ON public.signal_decay_log
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

CREATE POLICY signal_decay_log_deny_insert
  ON public.signal_decay_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY signal_decay_log_deny_update
  ON public.signal_decay_log
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY signal_decay_log_deny_delete
  ON public.signal_decay_log
  FOR DELETE
  TO authenticated
  USING (false);