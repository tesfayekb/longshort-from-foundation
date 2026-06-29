-- MIG-140: FP-061 sub-step 4M.5a — per-exit realized-PnL exit columns on longshort_lots.
-- ALTER ... ADD COLUMN IF NOT EXISTS is idempotent. RLS / GRANTs already in place from MIG-139
-- (table-level; new columns inherit). wash_sale_status is constrained to the §7.6 step-8 vocab.

ALTER TABLE public.longshort_lots
  ADD COLUMN IF NOT EXISTS exit_ts            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_price         NUMERIC,
  ADD COLUMN IF NOT EXISTS realized_pnl       NUMERIC,
  ADD COLUMN IF NOT EXISTS wash_sale_status   TEXT;

-- Constrain wash_sale_status to the §7.6 step-8 vocabulary. 4M.5a writes 'pending';
-- 4M.3 resolves to 'clean' or 'disallowed'. NULL allowed for still-open lots.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'longshort_lots_wash_sale_status_check'
  ) THEN
    ALTER TABLE public.longshort_lots
      ADD CONSTRAINT longshort_lots_wash_sale_status_check
      CHECK (wash_sale_status IS NULL OR wash_sale_status IN ('pending','clean','disallowed'));
  END IF;
END$$;

-- exit_price sanity (positive when present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'longshort_lots_exit_price_check'
  ) THEN
    ALTER TABLE public.longshort_lots
      ADD CONSTRAINT longshort_lots_exit_price_check
      CHECK (exit_price IS NULL OR exit_price > 0);
  END IF;
END$$;