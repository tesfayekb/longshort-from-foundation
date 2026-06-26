-- MIG: FP-057 Sub-step 1 (4/5) — combiner_book_shadow: additive intraday_slot superset PK+UNIQUE rotation
-- DEC-070 clause (a) keystone. Single transaction. DEFAULT 0 BEFORE PK swap.
BEGIN;

ALTER TABLE public.combiner_book_shadow
  ADD COLUMN intraday_slot smallint NOT NULL DEFAULT 0;

ALTER TABLE public.combiner_book_shadow
  DROP CONSTRAINT combiner_book_shadow_pkey;
ALTER TABLE public.combiner_book_shadow
  ADD CONSTRAINT combiner_book_shadow_pkey
  PRIMARY KEY (operator_id, as_of_date, variant, side, rank_within_side, intraday_slot);

ALTER TABLE public.combiner_book_shadow
  DROP CONSTRAINT combiner_book_shadow_operator_id_as_of_date_variant_ticker_key;
ALTER TABLE public.combiner_book_shadow
  ADD CONSTRAINT combiner_book_shadow_operator_id_as_of_date_variant_ticker_key
  UNIQUE (operator_id, as_of_date, variant, ticker, intraday_slot);

COMMIT;