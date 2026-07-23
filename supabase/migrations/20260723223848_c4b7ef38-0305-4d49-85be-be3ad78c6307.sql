ALTER TABLE public.overshoot_minute_ingest_runs
  DROP CONSTRAINT IF EXISTS overshoot_minute_ingest_runs_status_check;

ALTER TABLE public.overshoot_minute_ingest_runs
  ADD CONSTRAINT overshoot_minute_ingest_runs_status_check
  CHECK (status = ANY (ARRAY['running','completed','failed','superseded-by-canonicalization']));