-- =============================================================================
-- sql/18 — FP-050 Phase 4 / ACT-220 / MIG-098
-- Producer-time CIK→ticker relocation (Path-Y): the consumer
-- (`seedWorkItems` + `processItem`) now reads `ticker` directly from
-- `insider_accession_discovery_queue` instead of resolving via
-- `EdgarCikMapper.loadMap()` at slice-runtime. The producer
-- (`scripts/insider-discovery-egress.ts` / F2.b GHA runner) loads
-- `company_tickers.json` ONCE per backfill / daily fire, builds a
-- `cik10 → ticker` map at startup, and stamps `ticker` onto every
-- discovery row at INSERT time.
--
-- WHY (architectural; surfaced by runs `e5907bfb-7b16-4d51-9ab0-
-- d5253749f280` and `937cc59c-8a5f-4228-ab22-681321c9aabd`):
--   ACT-219 hardened the in-isolate `company_tickers.json` fetch with
--   `fetchWithTimeoutAndRetry` + per-isolate memoization, but Supabase
--   Edge spawns fresh isolates per cron invocation — the memo cannot
--   survive isolate boundaries. A ~1100-slice drain at ~1 slice/minute
--   triggers N fresh isolates, each re-fetching `company_tickers.json`
--   and paying the SEC fair-access throttle toll independently. Path-Y
--   eliminates the runtime SEC dependency entirely: the snapshot is
--   intrinsically immutable across a backfill, so reading it once at
--   producer-time and persisting the resolved ticker onto the queue
--   row is the architecturally correct shape. Matches the ACT-215
--   `acceptance_datetime` producer-relocation pattern verbatim.
--
-- PATH-A OPERATOR-CLEANUP PRECEDENT (cite ACT-215 / MIG-097):
--   The existing 14k+ rows in `insider_accession_discovery_queue` were
--   written by the pre-ACT-220 producer with NO `ticker` value. Adding
--   `ticker text NOT NULL` would fail against any non-empty table.
--   Per the ACT-215 / MIG-097 precedent, the OPERATOR runs a TRUNCATE
--   out-of-band via the Supabase Dashboard SQL Editor BEFORE this
--   migration is applied, then re-fires the GHA discovery workflow to
--   repopulate the queue against the new producer code (which writes
--   `ticker`). The TRUNCATE is NOT embedded here — TRUNCATE on an
--   operational table is operational cleanup, not schema migration
--   (§22.5.2 capability discipline). The verbatim cleanup SQL is in
--   the ACT-220 ledger row.
--
-- IDEMPOTENCY (D3):
--   `ADD COLUMN IF NOT EXISTS` so re-application is a no-op. The
--   NOT NULL constraint is satisfied on an empty table (operator
--   TRUNCATEd) without a DEFAULT — adopting a DEFAULT here would
--   silently mask producer bugs that fail to populate `ticker`.
--
-- DEPLOY GATE:
--   ACT-220 is a producer-time relocation; the consumer edit in
--   `_shared/longshort-signals/insider-transactions/` triggers the
--   `deploy-edge-functions.yml` paths filter and the six-MATCH
--   attestation re-enters the cycle post-merge.
--
-- Authority: FP-050 Phase 4 / ACT-220 / MIG-098.
-- =============================================================================

BEGIN;

ALTER TABLE public.insider_accession_discovery_queue
  ADD COLUMN IF NOT EXISTS ticker text NOT NULL;

COMMENT ON COLUMN public.insider_accession_discovery_queue.ticker IS
  'FP-050 Phase 4 / ACT-220 / MIG-098 — universe ticker resolved at producer-time from company_tickers.json. Eliminates the runtime CIK-mapper SEC dependency on the slice-worker hot path. Heartbeat rows carry the sentinel ticker ''__heartbeat__'' alongside the existing issuer_cik / accession_number sentinels.';

COMMIT;

-- =============================================================================
-- Post-apply verification (operator runs in Supabase SQL Editor):
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'insider_accession_discovery_queue'
--      AND column_name  = 'ticker';
--
-- Expected: one row, data_type=text, is_nullable=NO.
--
--   SELECT count(*) FROM public.insider_accession_discovery_queue;
--
-- Expected post-TRUNCATE + pre-backfill: 0 rows.
-- Expected post-backfill: ~14,000 rows (re-populated by GHA re-fire
-- across backfill_from=2026-03-15 → backfill_to=2026-06-13 inclusive).
-- =============================================================================