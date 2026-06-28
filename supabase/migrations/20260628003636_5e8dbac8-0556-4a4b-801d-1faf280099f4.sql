CREATE TABLE IF NOT EXISTS public.news_attention_observations (
  operator_id uuid NOT NULL,
  signal_id text NOT NULL,
  as_of_date date NOT NULL,
  ticker text NOT NULL,
  article_count integer NOT NULL,
  computed_at timestamptz NOT NULL,
  PRIMARY KEY (operator_id, signal_id, as_of_date, ticker)
);

GRANT SELECT ON public.news_attention_observations TO authenticated;
GRANT ALL ON public.news_attention_observations TO service_role;

ALTER TABLE public.news_attention_observations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'news_attention_observations'
      AND policyname = 'longshort viewers can read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "longshort viewers can read"
      ON public.news_attention_observations
      FOR SELECT
      TO authenticated
      USING (public.has_permission(auth.uid(), 'longshort.view'))
    $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'news_attention_observations'
      AND policyname = 'service role full access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service role full access"
      ON public.news_attention_observations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS news_attention_observations_computed_at_idx
  ON public.news_attention_observations (computed_at DESC);