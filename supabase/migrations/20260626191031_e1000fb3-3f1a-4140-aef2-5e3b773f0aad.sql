-- MIG: FP-057 Sub-step 1 (3/5) — combiner_book: additive intraday_slot superset PK+UNIQUE rotation
-- DEC-070 clause (a) keystone. Single transaction. DEFAULT 0 BEFORE PK swap.
BEGIN;

ALTER TABLE public.combiner_book
  ADD COLUMN intraday_slot smallint NOT NULL DEFAULT 0;

ALTER TABLE public.combiner_book
  DROP CONSTRAINT combiner_book_pkey;
ALTER TABLE public.combiner_book
  ADD CONSTRAINT combiner_book_pkey
  PRIMARY KEY (operator_id, as_of_date, side, rank_within_side, intraday_slot);

ALTER TABLE public.combiner_book
  DROP CONSTRAINT combiner_book_operator_id_as_of_date_ticker_key;
ALTER TABLE public.combiner_book
  ADD CONSTRAINT combiner_book_operator_id_as_of_date_ticker_key
  UNIQUE (operator_id, as_of_date, ticker, intraday_slot);

COMMIT;