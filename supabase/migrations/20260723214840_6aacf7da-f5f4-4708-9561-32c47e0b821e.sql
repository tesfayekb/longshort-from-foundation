
CREATE TABLE IF NOT EXISTS public.overshoot_minute_bars (
  ticker           text        NOT NULL,
  ts               timestamptz NOT NULL,
  o                numeric(18,6) NOT NULL,
  h                numeric(18,6) NOT NULL,
  l                numeric(18,6) NOT NULL,
  c                numeric(18,6) NOT NULL,
  v                bigint      NOT NULL,
  vw               numeric(18,6),
  n                integer,
  slice_tag        text        NOT NULL CHECK (slice_tag IN ('a','b')),
  ingest_run_id    uuid        NOT NULL,
  source           text        NOT NULL DEFAULT 'polygon',
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, ts)
);

CREATE INDEX IF NOT EXISTS overshoot_minute_bars_ts_idx
  ON public.overshoot_minute_bars (ts);
CREATE INDEX IF NOT EXISTS overshoot_minute_bars_slice_idx
  ON public.overshoot_minute_bars (slice_tag, ticker, ts);
CREATE INDEX IF NOT EXISTS overshoot_minute_bars_run_idx
  ON public.overshoot_minute_bars (ingest_run_id);

GRANT SELECT ON public.overshoot_minute_bars TO authenticated;
GRANT ALL    ON public.overshoot_minute_bars TO service_role;

ALTER TABLE public.overshoot_minute_bars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overshoot_minute_bars_read_view_perm"
  ON public.overshoot_minute_bars
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

CREATE POLICY "overshoot_minute_bars_service_role_all"
  ON public.overshoot_minute_bars
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Ingest-run bookkeeping (SLICE-A vs SLICE-B, stratified sample metadata)
CREATE TABLE IF NOT EXISTS public.overshoot_minute_ingest_runs (
  run_id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slice_tag      text        NOT NULL CHECK (slice_tag IN ('a','b')),
  scope          jsonb       NOT NULL,           -- {tickers:[], sessions:[], windows:[]}
  seed           bigint,                          -- for SLICE-B stratified sample
  rows_written   integer     NOT NULL DEFAULT 0,
  api_calls      integer     NOT NULL DEFAULT 0,
  status         text        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','completed','failed')),
  error          text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  created_by     text
);

GRANT SELECT ON public.overshoot_minute_ingest_runs TO authenticated;
GRANT ALL    ON public.overshoot_minute_ingest_runs TO service_role;

ALTER TABLE public.overshoot_minute_ingest_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overshoot_minute_ingest_runs_read_view_perm"
  ON public.overshoot_minute_ingest_runs
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

CREATE POLICY "overshoot_minute_ingest_runs_service_role_all"
  ON public.overshoot_minute_ingest_runs
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
