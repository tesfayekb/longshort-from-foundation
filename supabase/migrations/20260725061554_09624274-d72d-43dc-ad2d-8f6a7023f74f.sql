-- ============================================================
-- ACT-570 Phase-1: FINRA CDN short-volume archive
-- DEV-16 ruling: NUMERIC(20,6) volume columns (fractional-share honesty)
-- DEV-7 lesson: per-file bookkeeping row for EVERY attempt
-- ============================================================

-- 1) Fact table: (ticker, trade_date) daily aggregate
CREATE TABLE IF NOT EXISTS public.overshoot_short_volume_daily (
  ticker              TEXT           NOT NULL,
  trade_date          DATE           NOT NULL,
  short_volume        NUMERIC(20,6)  NOT NULL,
  short_exempt_volume NUMERIC(20,6)  NOT NULL DEFAULT 0,
  total_volume        NUMERIC(20,6)  NOT NULL,
  svr                 NUMERIC(10,8)
                       GENERATED ALWAYS AS (
                         CASE WHEN total_volume > 0
                              THEN short_volume / total_volume
                              ELSE NULL END
                       ) STORED,
  market              TEXT,
  source              TEXT           NOT NULL DEFAULT 'finra_cdn_archive',
  ingested_at         TIMESTAMPTZ    NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_osvd_trade_date
  ON public.overshoot_short_volume_daily (trade_date);
CREATE INDEX IF NOT EXISTS idx_osvd_ticker_date
  ON public.overshoot_short_volume_daily (ticker, trade_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.overshoot_short_volume_daily TO service_role;
GRANT SELECT ON public.overshoot_short_volume_daily TO authenticated;

ALTER TABLE public.overshoot_short_volume_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "osvd_service_role_all"
  ON public.overshoot_short_volume_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "osvd_admin_read"
  ON public.overshoot_short_volume_daily
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_permission(auth.uid(), 'overshoot.manage')
    OR public.has_permission(auth.uid(), 'overshoot.view')
  );

-- 2) Per-file ingest bookkeeping (every file attempted lands one row)
CREATE TABLE IF NOT EXISTS public.finra_shvol_ingest_log (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date            DATE           NOT NULL,
  source_url            TEXT           NOT NULL,
  http_status           INTEGER,
  bytes_downloaded      INTEGER,
  rows_in_file          INTEGER,
  rows_matched_universe INTEGER,
  rows_upserted         INTEGER,
  status                TEXT           NOT NULL
                          CHECK (status IN ('ok','http_error','parse_error','empty','partial','skipped_holiday')),
  error_message         TEXT,
  duration_ms           INTEGER,
  attempted_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (trade_date, attempted_at)
);

CREATE INDEX IF NOT EXISTS idx_fsil_trade_date
  ON public.finra_shvol_ingest_log (trade_date);
CREATE INDEX IF NOT EXISTS idx_fsil_status
  ON public.finra_shvol_ingest_log (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finra_shvol_ingest_log TO service_role;
GRANT SELECT ON public.finra_shvol_ingest_log TO authenticated;

ALTER TABLE public.finra_shvol_ingest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsil_service_role_all"
  ON public.finra_shvol_ingest_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "fsil_admin_read"
  ON public.finra_shvol_ingest_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR public.has_permission(auth.uid(), 'overshoot.manage')
    OR public.has_permission(auth.uid(), 'overshoot.view')
  );

-- 3) Coverage acceptance helper view (days × tickers per year)
CREATE OR REPLACE VIEW public.v_finra_shvol_coverage AS
SELECT
  EXTRACT(YEAR FROM trade_date)::INT AS yr,
  COUNT(DISTINCT trade_date)         AS n_days,
  COUNT(DISTINCT ticker)             AS n_tickers,
  COUNT(*)                           AS n_rows,
  MIN(trade_date)                    AS first_day,
  MAX(trade_date)                    AS last_day
FROM public.overshoot_short_volume_daily
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.v_finra_shvol_coverage TO service_role, authenticated;