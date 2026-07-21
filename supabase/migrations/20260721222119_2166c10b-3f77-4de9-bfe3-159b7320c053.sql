ALTER TABLE public.overshoot_equity_snapshots
  ADD COLUMN IF NOT EXISTS spy_close numeric,
  ADD COLUMN IF NOT EXISTS spy_source text;

UPDATE public.overshoot_equity_snapshots s
SET spy_close = b.close,
    spy_source = 'overshoot_daily_bars'
FROM public.overshoot_daily_bars b
WHERE b.ticker = 'SPY'
  AND b.trade_date = s.snapshot_date
  AND s.spy_close IS NULL;