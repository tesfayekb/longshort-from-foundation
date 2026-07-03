-- FP-069 OVERSHOOT W1a — data commons schema
-- Authority: ACT-455 (W1a landing), FP-069 charter, DW-212 evidence spine.

INSERT INTO public.permissions (key, description) VALUES
  (
    'overshoot.view',
    'Gates read-only visibility on the OVERSHOOT strategy surfaces (dedicated Alpaca paper account; separate from longshort). Required to SELECT overshoot_* tables. Two-segment per DEC-031 sub-point 3. No default role grants per DEC-031 sub-point 10.'
  )
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.overshoot_backfill_runs (
  run_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('universe_seed','bars','earnings_finnhub','earnings_fmp')),
  started_as_of   timestamptz NOT NULL,
  completed_as_of timestamptz NULL,
  cursor          text NULL,
  request_count   integer NULL,
  row_count       integer NULL,
  outcome         text NULL CHECK (outcome IN ('completed','partial','failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.overshoot_backfill_runs TO authenticated;
GRANT ALL    ON public.overshoot_backfill_runs TO service_role;
ALTER TABLE public.overshoot_backfill_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY overshoot_backfill_runs_view_read
  ON public.overshoot_backfill_runs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_backfill_runs_deny_authenticated_write
  ON public.overshoot_backfill_runs AS RESTRICTIVE FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE TRIGGER trg_overshoot_backfill_runs_updated_at
  BEFORE UPDATE ON public.overshoot_backfill_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.overshoot_universe (
  ticker       text PRIMARY KEY,
  source       text NOT NULL,
  added_as_of  date NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.overshoot_universe TO authenticated;
GRANT ALL    ON public.overshoot_universe TO service_role;
ALTER TABLE public.overshoot_universe ENABLE ROW LEVEL SECURITY;
CREATE POLICY overshoot_universe_view_read
  ON public.overshoot_universe FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_universe_deny_authenticated_write
  ON public.overshoot_universe AS RESTRICTIVE FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE TRIGGER trg_overshoot_universe_updated_at
  BEFORE UPDATE ON public.overshoot_universe
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.overshoot_daily_bars (
  ticker         text NOT NULL,
  trade_date     date NOT NULL,
  open           numeric NOT NULL,
  high           numeric NOT NULL,
  low            numeric NOT NULL,
  close          numeric NOT NULL,
  volume         bigint  NOT NULL,
  vwap           numeric NULL,
  trade_count    bigint  NULL,
  adjusted       boolean NOT NULL DEFAULT true,
  source_run_id  uuid NOT NULL REFERENCES public.overshoot_backfill_runs(run_id) ON DELETE RESTRICT,
  fetched_as_of  timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_overshoot_daily_bars_trade_date
  ON public.overshoot_daily_bars (trade_date);
GRANT SELECT ON public.overshoot_daily_bars TO authenticated;
GRANT ALL    ON public.overshoot_daily_bars TO service_role;
ALTER TABLE public.overshoot_daily_bars ENABLE ROW LEVEL SECURITY;
CREATE POLICY overshoot_daily_bars_view_read
  ON public.overshoot_daily_bars FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_daily_bars_deny_authenticated_write
  ON public.overshoot_daily_bars AS RESTRICTIVE FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.overshoot_earnings_calendar (
  ticker             text NOT NULL,
  announcement_date  date NOT NULL,
  source             text NOT NULL CHECK (source IN ('finnhub','fmp')),
  hour               text NULL CHECK (hour IN ('bmo','amc')),
  quarter            integer NULL,
  fiscal_year        integer NULL,
  eps_estimate       numeric NULL,
  eps_actual         numeric NULL,
  revenue_estimate   numeric NULL,
  revenue_actual     numeric NULL,
  source_run_id      uuid NOT NULL REFERENCES public.overshoot_backfill_runs(run_id) ON DELETE RESTRICT,
  fetched_as_of      timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, announcement_date, source)
);
CREATE INDEX IF NOT EXISTS idx_overshoot_earnings_calendar_date
  ON public.overshoot_earnings_calendar (announcement_date);
GRANT SELECT ON public.overshoot_earnings_calendar TO authenticated;
GRANT ALL    ON public.overshoot_earnings_calendar TO service_role;
ALTER TABLE public.overshoot_earnings_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY overshoot_earnings_calendar_view_read
  ON public.overshoot_earnings_calendar FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_earnings_calendar_deny_authenticated_write
  ON public.overshoot_earnings_calendar AS RESTRICTIVE FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
