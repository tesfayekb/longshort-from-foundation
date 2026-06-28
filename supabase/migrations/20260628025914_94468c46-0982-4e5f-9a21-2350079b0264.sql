CREATE TABLE IF NOT EXISTS public.pead_consensus_observations (
  operator_id uuid NOT NULL,
  signal_id text NOT NULL,
  as_of_date date NOT NULL,
  ticker text NOT NULL,
  report_period_date date NOT NULL,
  eps_actual numeric NOT NULL,
  consensus_eps_avg numeric NOT NULL,
  eps_high numeric NOT NULL,
  eps_low numeric NOT NULL,
  number_analysts integer NOT NULL,
  sigma_proxy numeric NOT NULL,
  sue numeric NOT NULL,
  trading_days_since integer NOT NULL,
  computed_at timestamptz NOT NULL,
  PRIMARY KEY (operator_id, signal_id, as_of_date, ticker)
);

GRANT SELECT ON public.pead_consensus_observations TO authenticated;
GRANT ALL ON public.pead_consensus_observations TO service_role;

ALTER TABLE public.pead_consensus_observations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pead_consensus_observations'
      AND policyname = 'longshort viewers can read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "longshort viewers can read"
      ON public.pead_consensus_observations
      FOR SELECT
      TO authenticated
      USING (public.has_permission(auth.uid(), 'longshort.view'))
    $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pead_consensus_observations'
      AND policyname = 'service role full access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service role full access"
      ON public.pead_consensus_observations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pead_consensus_observations_computed_at_idx
  ON public.pead_consensus_observations (computed_at DESC);

CREATE INDEX IF NOT EXISTS pead_consensus_observations_ticker_period_idx
  ON public.pead_consensus_observations (ticker, report_period_date DESC);