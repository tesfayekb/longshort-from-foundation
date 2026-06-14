BEGIN;

ALTER TABLE public.insider_accession_discovery_queue
  ADD COLUMN IF NOT EXISTS ticker text NOT NULL;

COMMENT ON COLUMN public.insider_accession_discovery_queue.ticker IS
  'FP-050 Phase 4 / ACT-220 / MIG-098 — universe ticker resolved at producer-time from company_tickers.json. Eliminates the runtime CIK-mapper SEC dependency on the slice-worker hot path. Heartbeat rows carry the sentinel ticker ''__heartbeat__'' alongside the existing issuer_cik / accession_number sentinels.';

COMMIT;