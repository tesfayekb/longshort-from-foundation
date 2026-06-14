-- =============================================================================
-- MIG-097 — FP-050 Phase 4 / ACT-215
-- Add insider_accession_discovery_queue.acceptance_datetime (NOT NULL)
-- =============================================================================
--
-- WHY: ACT-215 live-EDGAR verification confirmed that per-accession
--   `index.json` never carries `acceptanceDateTime` for any Form-4 shape
--   (modern wk-form4_*.xml or legacy edgardoc.xml). The DEC-058 §(b)
--   non-defaultable acceptance contract requires an authoritative source;
--   the per-issuer submissions feed
--   `data.sec.gov/submissions/CIK<padded10>.json`
--   (`filings.recent.acceptanceDateTime[]` parallel array) IS that source.
--   Acceptance is discovery-time metadata — captured by the producer
--   (`scripts/insider-discovery-egress.ts`) and written onto every queue
--   row so the consumer reads it from a strongly-typed schema column
--   instead of re-fetching at processing-time.
--
-- §(b) AS A SCHEMA INVARIANT: the column is NOT NULL with NO default.
--   Producer rows missing acceptance fail-fast at INSERT (PostgREST
--   23502 not_null_violation) — the same gate semantics the consumer's
--   prior `no_acceptance_datetime` runtime skip provided, hoisted from
--   processing-time to enqueue-time. The R1 heartbeat sentinel uses
--   the Unix epoch (1970-01-01T00:00:00Z) as its acceptance value —
--   the (issuer_cik='__heartbeat__', accession_number='__heartbeat__')
--   sentinel triple remains the consumer's structural skip predicate;
--   the epoch acceptance stamp is diagnostic-only and unreachable by
--   any real-row code path.
--
-- PAIRED TRUNCATE → ALTER (operator-ratified at the ACT-215 ratification
--   step (3)): the prior queue contents have no acceptance_datetime; a
--   nullable-default-then-tighten staging would let the §(b) invariant
--   exist in a relaxed form mid-migration, which the contract forbids.
--   The TRUNCATE + ALTER are wrapped in one BEGIN/COMMIT so they bind
--   atomically. Post-apply the GHA backfill workflow repopulates the
--   queue against the new producer code (step 8.iii).
--
-- IDEMPOTENCY (D3): TRUNCATE on an empty table is a no-op; ADD COLUMN
--   IF NOT EXISTS skips on re-run. The NOT NULL clause re-applies
--   cleanly on re-run because PostgreSQL records NOT NULL idempotently
--   at the column level.
--
-- Authority: FP-050 Phase 4 / ACT-215 / DEC-058 §(b) amendment.
-- =============================================================================

BEGIN;

-- Step 1: clear the queue. Required because the new column is NOT NULL
-- with no default — existing rows have no acceptance value to seed.
TRUNCATE TABLE public.insider_accession_discovery_queue;

-- Step 2: add the column with the §(b) invariant baked in at schema time.
ALTER TABLE public.insider_accession_discovery_queue
  ADD COLUMN IF NOT EXISTS acceptance_datetime timestamptz NOT NULL;

COMMENT ON COLUMN public.insider_accession_discovery_queue.acceptance_datetime IS
  'SEC acceptanceDateTime captured by the producer at discovery-time from data.sec.gov/submissions/CIK<padded10>.json filings.recent.acceptanceDateTime[]. DEC-058 §(b) non-defaultable invariant hoisted to enqueue-time (ACT-215). Heartbeat sentinel rows carry epoch (1970-01-01T00:00:00Z) — diagnostic-only, unreachable by real-row paths.';

COMMIT;

-- =============================================================================
-- Post-apply verification (operator runs in Supabase SQL Editor):
--
--   SELECT
--     column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public'
--     AND table_name='insider_accession_discovery_queue'
--     AND column_name='acceptance_datetime';
--   -- expect: ('acceptance_datetime','timestamp with time zone','NO',NULL)
--
--   SELECT count(*) AS row_count
--   FROM public.insider_accession_discovery_queue;
--   -- expect: 0 (operator then re-fires GHA backfill workflow)
-- =============================================================================