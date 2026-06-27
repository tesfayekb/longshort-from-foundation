CREATE TABLE IF NOT EXISTS public.short_interest_days_to_cover (
  operator_id uuid NOT NULL,
  ticker text NOT NULL,
  as_of_date date NOT NULL,
  latest_days_to_cover numeric NULL,
  report_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, ticker)
);

GRANT SELECT ON public.short_interest_days_to_cover TO authenticated;
GRANT ALL ON public.short_interest_days_to_cover TO service_role;

ALTER TABLE public.short_interest_days_to_cover ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'short_interest_days_to_cover'
      AND policyname = 'longshort viewers can read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "longshort viewers can read"
      ON public.short_interest_days_to_cover
      FOR SELECT
      TO authenticated
      USING (public.has_permission(auth.uid(), 'longshort.view'))
    $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'short_interest_days_to_cover'
      AND policyname = 'service role full access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service role full access"
      ON public.short_interest_days_to_cover
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS short_interest_dtc_updated_at_idx
  ON public.short_interest_days_to_cover (updated_at DESC);