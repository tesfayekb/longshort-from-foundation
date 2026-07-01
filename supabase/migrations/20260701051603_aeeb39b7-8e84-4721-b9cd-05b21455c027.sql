-- MIG-150 — FP-067 W1 (first-class `side` on combiner_shap_attribution)
-- Additive superset PK rotation mirroring the 06-26 slot rotation shape.
-- D2 (no destructive changes to existing columns/data beyond honest DELETE of
-- unattributable-to-side orphans), D3 (idempotent), D4 (scoped to combiner),
-- D5 (ledger entry same PR — database-migration-ledger.md).

-- (1) Add `side` column as NULLABLE first (backfill window).
ALTER TABLE public.combiner_shap_attribution
  ADD COLUMN IF NOT EXISTS side text;

-- (2) Backfill from combiner_book on the CONFIRMED join key.
--     combiner_book UNIQUE (operator_id, as_of_date, ticker, intraday_slot) →
--     one booking per name per slot; that booking's side is the attribution's side.
--     Table currently has zero producers (no writer landed yet) so this is
--     expected to affect 0 rows; guarded regardless.
UPDATE public.combiner_shap_attribution s
   SET side = b.side
  FROM public.combiner_book b
 WHERE s.side IS NULL
   AND s.operator_id   = b.operator_id
   AND s.as_of_date    = b.as_of_date
   AND s.ticker        = b.ticker
   AND s.intraday_slot = b.intraday_slot;

-- (3) Typed handling of orphan rows: DELETE rows that could not be attributed
--     to a side (no matching book row). Do NOT fabricate a side — the whole
--     point of first-class `side` (Option A / FP-067-ADD-02) is honest per-
--     side substrate. Any such row would have been a pre-writer stale entry
--     because there is no live writer yet.
DELETE FROM public.combiner_shap_attribution WHERE side IS NULL;

-- (4) NOT NULL + CHECK constraint (guarded to keep re-runs idempotent).
ALTER TABLE public.combiner_shap_attribution
  ALTER COLUMN side SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'combiner_shap_attribution_side_check'
       AND conrelid = 'public.combiner_shap_attribution'::regclass
  ) THEN
    ALTER TABLE public.combiner_shap_attribution
      ADD CONSTRAINT combiner_shap_attribution_side_check
      CHECK (side IN ('long','short'));
  END IF;
END $$;

-- (5) Rotate PK 4-tuple → 5-tuple. Self-FK to combiner_rankings UNCHANGED
--     (rankings has no `side` column — do NOT add `side` to the FK).
DO $$
DECLARE
  v_pk_cols text;
BEGIN
  SELECT string_agg(a.attname, ',' ORDER BY array_position(c.conkey, a.attnum))
    INTO v_pk_cols
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum   = ANY (c.conkey)
   WHERE c.conrelid = 'public.combiner_shap_attribution'::regclass
     AND c.contype  = 'p';

  IF v_pk_cols IS DISTINCT FROM 'operator_id,as_of_date,ticker,intraday_slot,side' THEN
    ALTER TABLE public.combiner_shap_attribution
      DROP CONSTRAINT IF EXISTS combiner_shap_attribution_pkey;
    ALTER TABLE public.combiner_shap_attribution
      ADD CONSTRAINT combiner_shap_attribution_pkey
      PRIMARY KEY (operator_id, as_of_date, ticker, intraday_slot, side);
  END IF;
END $$;

COMMENT ON COLUMN public.combiner_shap_attribution.side IS
  'FP-067 W1 (MIG-150) — first-class per-side dimension. One row per booked (op, as_of, ticker, slot, side). CHECK side IN (''long'',''short''). Backfilled from combiner_book on the (op,as_of,ticker,slot) join key; unattributable orphans deleted (no fabrication).';