-- MIG: FP-057 Sub-step 1 (2/5) — combiner_feature_vectors: additive intraday_slot superset PK rotation
-- DEC-070 clause (a) keystone. Single transaction. DEFAULT 0 BEFORE PK swap.
BEGIN;

ALTER TABLE public.combiner_feature_vectors
  ADD COLUMN intraday_slot smallint NOT NULL DEFAULT 0;

ALTER TABLE public.combiner_feature_vectors
  DROP CONSTRAINT combiner_feature_vectors_pkey;
ALTER TABLE public.combiner_feature_vectors
  ADD CONSTRAINT combiner_feature_vectors_pkey
  PRIMARY KEY (operator_id, as_of_date, ticker, intraday_slot);

COMMIT;