-- MIG: FP-057 Sub-step 1 (5/5) — combiner_forward_returns: additive intraday_slot superset PK rotation
-- DEC-070 clause (a) keystone. Single transaction. DEFAULT 0 BEFORE PK swap.
-- T+H horizon arithmetic UNCHANGED for slot 0 (DEC-064 §6.1/6.2 algorithm-lock preserved).
BEGIN;

ALTER TABLE public.combiner_forward_returns
  ADD COLUMN intraday_slot smallint NOT NULL DEFAULT 0;

ALTER TABLE public.combiner_forward_returns
  DROP CONSTRAINT combiner_forward_returns_pkey;
ALTER TABLE public.combiner_forward_returns
  ADD CONSTRAINT combiner_forward_returns_pkey
  PRIMARY KEY (operator_id, source_table, variant, seed_as_of_date, ticker, horizon_td, intraday_slot);

COMMIT;