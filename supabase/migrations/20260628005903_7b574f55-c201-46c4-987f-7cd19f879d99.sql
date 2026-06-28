CREATE TABLE IF NOT EXISTS public.analyst_revision_observations (
  operator_id uuid NOT NULL,
  signal_id text NOT NULL,
  as_of_date date NOT NULL,
  ticker text NOT NULL,
  analyst_name text NOT NULL,
  analyst_company text NOT NULL,
  analyst_name_key text NOT NULL,
  analyst_company_key text NOT NULL,
  focal_published_at timestamptz NOT NULL,
  prior_published_at timestamptz NOT NULL,
  new_target numeric NOT NULL,
  prior_target numeric NOT NULL,
  target_delta numeric NOT NULL,
  magnitude_pct numeric NOT NULL,
  direction smallint NOT NULL,
  contribution numeric NOT NULL,
  age_days integer NOT NULL,
  pair_basis text NOT NULL,
  computed_at timestamptz NOT NULL,
  PRIMARY KEY (operator_id, signal_id, as_of_date, ticker, analyst_name_key, analyst_company_key, focal_published_at)
);

GRANT SELECT ON public.analyst_revision_observations TO authenticated;
GRANT ALL ON public.analyst_revision_observations TO service_role;

ALTER TABLE public.analyst_revision_observations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analyst_revision_observations'
      AND policyname = 'longshort viewers can read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "longshort viewers can read"
      ON public.analyst_revision_observations
      FOR SELECT
      TO authenticated
      USING (public.has_permission(auth.uid(), 'longshort.view'))
    $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'analyst_revision_observations'
      AND policyname = 'service role full access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service role full access"
      ON public.analyst_revision_observations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS analyst_revision_observations_computed_at_idx
  ON public.analyst_revision_observations (computed_at DESC);

CREATE INDEX IF NOT EXISTS analyst_revision_observations_ticker_focal_idx
  ON public.analyst_revision_observations (ticker, focal_published_at DESC);