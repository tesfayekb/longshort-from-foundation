-- =============================================================================
-- sql/17 — FP-050 Phase 4 ACT-215 / MIG-097
-- Add `acceptance_datetime` to insider_accession_discovery_queue (NOT NULL).
-- Paired TRUNCATE → ALTER ADD COLUMN per DEC-058 §(b) amendment.
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
--   1. TRUNCATEs `public.insider_accession_discovery_queue` (required because
--      the new column is NOT NULL with no default; existing rows have no
--      acceptance value to seed and a nullable-default-then-tighten staging
--      would let the §(b) invariant exist in a relaxed form mid-migration —
--      forbidden by the operator-ratified ACT-215 ratification step (3)).
--   2. ADDs column `acceptance_datetime timestamptz NOT NULL` (no default).
--
-- WHY THIS COLUMN (DEC-058 §(b) AMENDMENT — ACT-215)
--   Live-EDGAR verification at ACT-215 confirmed per-accession `index.json`
--   never carries `acceptanceDateTime` for ANY observed Form-4 shape
--   (modern wk-form4_*.xml or legacy edgardoc.xml). The DEC-058 §(b)
--   non-defaultable acceptance contract is now sourced at producer-time
--   from the per-issuer SEC submissions feed
--     `data.sec.gov/submissions/CIK<padded10>.json`
--     (`filings.recent.acceptanceDateTime[]` parallel array, accession-keyed)
--   and written onto every queue row. The consumer reads acceptance from
--   the strongly-typed schema column instead of re-fetching at
--   processing-time. The runtime §(b) gate (`no_acceptance_datetime` skip,
--   added at ACT-214) is REMOVED — rows missing acceptance fail-fast at
--   INSERT (PostgREST 23502 not_null_violation) and never enqueue.
--
-- HEARTBEAT SENTINEL
--   The R1 heartbeat row uses Unix epoch (`1970-01-01T00:00:00Z`) as its
--   acceptance value. The `(issuer_cik='__heartbeat__',`
--   `accession_number='__heartbeat__')` sentinel triple remains the
--   consumer's structural skip predicate; the epoch acceptance stamp is
--   diagnostic-only and unreachable by any real-row code path.
--
-- OPERATOR PRE-STEP (Dashboard SQL, before this migration applies via
-- Lovable's migration tool path)
--   The Lovable migration tool applies this file atomically. The
--   TRUNCATE inside the same BEGIN/COMMIT block clears the queue
--   before the ALTER, so no separate operator pre-step is required.
--   Post-apply, the operator re-fires the GHA backfill workflow
--   (backfill_from=2026-03-15, backfill_to=2026-06-13) to repopulate
--   the queue from scratch against the new producer code.
--
-- IDEMPOTENCY (D3)
--   TRUNCATE is idempotent on an empty table (no-op). ADD COLUMN
--   IF NOT EXISTS skips on re-run; the NOT NULL constraint is
--   recorded idempotently at the column level by PostgreSQL.
--
-- ATOMICITY
--   BEGIN/COMMIT wraps both steps so the table is never observable
--   in a half-changed state.
--
-- Authority: FP-050 Phase 4 / ACT-215 / DEC-058 §(b) amendment.
-- =============================================================================

BEGIN;

TRUNCATE TABLE public.insider_accession_discovery_queue;

ALTER TABLE public.insider_accession_discovery_queue
  ADD COLUMN IF NOT EXISTS acceptance_datetime timestamptz NOT NULL;

COMMENT ON COLUMN public.insider_accession_discovery_queue.acceptance_datetime IS
  'SEC acceptanceDateTime captured by the producer at discovery-time from data.sec.gov/submissions/CIK<padded10>.json filings.recent.acceptanceDateTime[]. DEC-058 §(b) non-defaultable invariant hoisted to enqueue-time (ACT-215). Heartbeat sentinel rows carry epoch (1970-01-01T00:00:00Z) — diagnostic-only, unreachable by real-row paths.';

COMMIT;

-- =============================================================================
-- Post-apply verification (operator runs in Supabase SQL Editor):
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public'
--      AND table_name='insider_accession_discovery_queue'
--      AND column_name='acceptance_datetime';
--   -- expect: ('acceptance_datetime','timestamp with time zone','NO',NULL)
--
--   SELECT count(*) AS row_count
--     FROM public.insider_accession_discovery_queue;
--   -- expect: 0 (operator then re-fires GHA backfill workflow)
-- =============================================================================