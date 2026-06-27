CREATE TABLE IF NOT EXISTS public.short_etb_state_history (
  operator_id uuid NOT NULL,
  symbol text NOT NULL,
  observed_at timestamptz NOT NULL,
  etb boolean NOT NULL,
  source text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, symbol, observed_at)
);

GRANT SELECT ON public.short_etb_state_history TO authenticated;
GRANT ALL ON public.short_etb_state_history TO service_role;

ALTER TABLE public.short_etb_state_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'short_etb_state_history'
      AND policyname = 'longshort viewers can read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "longshort viewers can read"
      ON public.short_etb_state_history
      FOR SELECT
      TO authenticated
      USING (public.has_permission(auth.uid(), 'longshort.view'))
    $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'short_etb_state_history'
      AND policyname = 'service role full access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "service role full access"
      ON public.short_etb_state_history
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $p$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS short_etb_state_history_symbol_observed_at_idx
  ON public.short_etb_state_history (operator_id, symbol, observed_at DESC);