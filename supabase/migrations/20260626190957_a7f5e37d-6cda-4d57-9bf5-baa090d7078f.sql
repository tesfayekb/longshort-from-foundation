-- MIG: FP-057 Sub-step 1 (1/5) — combiner_rankings: additive intraday_slot superset PK rotation
-- DEC-070 clause (a) keystone. Includes FK-dependent combiner_shap_attribution rotation in same txn.
BEGIN;

-- Step 1: add column to both tables (DEFAULT 0 populates existing rows BEFORE any key change)
ALTER TABLE public.combiner_rankings
  ADD COLUMN intraday_slot smallint NOT NULL DEFAULT 0;

ALTER TABLE public.combiner_shap_attribution
  ADD COLUMN intraday_slot smallint NOT NULL DEFAULT 0;

-- Step 2: drop dependent FK first (it references the PK we're about to rotate)
ALTER TABLE public.combiner_shap_attribution
  DROP CONSTRAINT combiner_shap_attribution_operator_id_as_of_date_ticker_fkey;

-- Step 3: rotate combiner_rankings PK (append intraday_slot as last key element)
ALTER TABLE public.combiner_rankings
  DROP CONSTRAINT combiner_rankings_pkey;
ALTER TABLE public.combiner_rankings
  ADD CONSTRAINT combiner_rankings_pkey
  PRIMARY KEY (operator_id, as_of_date, ticker, intraday_slot);

-- Step 4: rotate combiner_shap_attribution PK to match
ALTER TABLE public.combiner_shap_attribution
  DROP CONSTRAINT combiner_shap_attribution_pkey;
ALTER TABLE public.combiner_shap_attribution
  ADD CONSTRAINT combiner_shap_attribution_pkey
  PRIMARY KEY (operator_id, as_of_date, ticker, intraday_slot);

-- Step 5: re-create FK on the rotated composite
ALTER TABLE public.combiner_shap_attribution
  ADD CONSTRAINT combiner_shap_attribution_operator_id_as_of_date_ticker_fkey
  FOREIGN KEY (operator_id, as_of_date, ticker, intraday_slot)
  REFERENCES public.combiner_rankings(operator_id, as_of_date, ticker, intraday_slot)
  ON DELETE CASCADE;

COMMIT;