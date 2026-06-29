-- MIG-144 — FP-061 sub-step 4M.4 / corporate_actions store (ACT-378).
-- Money-path Tier-A: a mis-applied split ratio silently corrupts cost basis.
-- §7 composer gate fulcrum is `applied_at IS NULL`.

CREATE TABLE IF NOT EXISTS public.corporate_actions (
  ca_id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol                TEXT NOT NULL,
  action_type           TEXT NOT NULL CHECK (action_type IN
                          ('split','stock_dividend','cash_dividend','merger','spinoff')),
  ex_date               DATE NOT NULL,
  announced_at          TIMESTAMPTZ NULL,
  -- Ratio-shaped (split, stock_dividend, stock-for-stock merger)
  ratio_numerator       NUMERIC(20,8) NULL,
  ratio_denominator     NUMERIC(20,8) NULL,
  -- Cash-shaped (cash_dividend, merger-cash)
  cash_per_share        NUMERIC(20,8) NULL,
  -- Symbol-change (merger, spinoff)
  successor_symbol      TEXT NULL,
  basis_allocation_pct  NUMERIC(8,5) NULL,  -- spinoff: 0–100, Form 8937
  -- Apply-state — THE §7 gate fulcrum.
  applied_at            TIMESTAMPTZ NULL,
  applied_lot_count     INTEGER NULL,
  source                TEXT NOT NULL DEFAULT 'polygon',
  source_payload        JSONB NULL,
  operator_id           UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotent vendor refetch.
  CONSTRAINT corporate_actions_unique_symbol_type_exdate
    UNIQUE (symbol, action_type, ex_date),
  -- Defensive: ratio actions require both num+den positive when present.
  CONSTRAINT corporate_actions_ratio_positive CHECK (
    (ratio_numerator IS NULL AND ratio_denominator IS NULL)
    OR (ratio_numerator > 0 AND ratio_denominator > 0)
  ),
  CONSTRAINT corporate_actions_basis_allocation_range CHECK (
    basis_allocation_pct IS NULL
    OR (basis_allocation_pct >= 0 AND basis_allocation_pct <= 100)
  )
);

-- Hot-read partial index — the §7 composer gate query
--   SELECT … WHERE symbol = ANY($1) AND ex_date <= $2 AND applied_at IS NULL
CREATE INDEX IF NOT EXISTS corporate_actions_unapplied_idx
  ON public.corporate_actions (symbol, ex_date)
  WHERE applied_at IS NULL;

-- Operator-scoped scans (per-strategy multi-tenant pattern).
CREATE INDEX IF NOT EXISTS corporate_actions_operator_exdate_idx
  ON public.corporate_actions (operator_id, ex_date);

-- GRANTs BEFORE RLS (public-schema-grants rule).
GRANT SELECT ON public.corporate_actions TO authenticated;
GRANT ALL    ON public.corporate_actions TO service_role;

ALTER TABLE public.corporate_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='corporate_actions' AND policyname='corporate_actions_service_role_all'
  ) THEN
    CREATE POLICY corporate_actions_service_role_all
      ON public.corporate_actions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='corporate_actions' AND policyname='corporate_actions_authenticated_read'
  ) THEN
    CREATE POLICY corporate_actions_authenticated_read
      ON public.corporate_actions
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- updated_at trigger using the existing shared function.
DROP TRIGGER IF EXISTS corporate_actions_set_updated_at ON public.corporate_actions;
CREATE TRIGGER corporate_actions_set_updated_at
  BEFORE UPDATE ON public.corporate_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
