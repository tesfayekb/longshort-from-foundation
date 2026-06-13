-- =============================================================================
-- sql/16 — FP-050 Phase 4 F2.a / MIG-096
-- Discovery-layer egress relocation: persistence target for the off-Supabase-
-- Edge daily-index discovery probe (F2-b GitHub Actions runner, lands next
-- sub-commit). Consumer (`seedWorkItems`) reads from this table at F2-c.
-- =============================================================================
--
-- WHAT THIS MIGRATION DOES
--
--   1. Creates public.insider_accession_discovery_queue (one row per
--      qualifying Form-4 / 4-A accession surfaced by a discovery fire).
--   2. Grants the standard family privileges (service_role full;
--      authenticated SELECT only — no anon).
--   3. Enables RLS and installs the canonical 5-policy family used by every
--      other longshort discovery/work-queue table (signal_queue_*,
--      signal_observations, insider_form4_rows): service-role-all +
--      longshort.view-select + deny-write triad on authenticated.
--   4. Creates one secondary partial index for the consumer's hot path
--      (`(as_of_date) WHERE consumed_at IS NULL`). PK provides the other
--      access path (point lookups + as_of_date range scans).
--
-- PK: (as_of_date, issuer_cik, accession_number)
--   Locks the §(h) idempotency triple at the discovery layer: an accession
--   can be surfaced AT MOST ONCE per as_of_date per issuer_cik. Reseeds of
--   the same trading day are ON CONFLICT DO NOTHING no-ops (F2-b producer
--   contract), so a producer retry is safe.
--
-- COLUMNS
--   as_of_date              date      — trading-day key (matches signal as_of)
--   issuer_cik              text      — issuer CIK (zero-padded, parser-canon)
--   accession_number        text      — EDGAR accession (e.g. 0001234567-26-...)
--   form_type               text      — '4' | '4/A' (CHECK below)
--   company_name            text      — issuer name as parsed from master.idx
--   filename                text      — relative path from master.idx row
--                                       (e.g. edgar/data/{cik}/{accession-nodash}.txt)
--   discovered_at           timestamptz NOT NULL DEFAULT now()
--   discovered_by           text      NOT NULL — egress tag the producer
--                                       stamps (e.g. 'github-actions',
--                                       'cloudflare-worker', 'operator-cli');
--                                       lets reconciliation distinguish runner
--                                       families when more than one is active
--                                       during cutovers.
--   discovery_correlation_id text     NOT NULL — the producer-run correlation
--                                       id so a queued row joins back to its
--                                       discovery-fire telemetry.
--   consumed_at             timestamptz NULL — set by `seedWorkItems`'s
--                                       claim-and-mark transaction at F2-c.
--   consumed_run_id         uuid      NULL — the signal_compute_log run_id
--                                       that drained this row (FK-shaped but
--                                       NOT enforced — signal_compute_log is
--                                       cross-signal and the FK would couple
--                                       schemas in a way the rest of the
--                                       family avoids).
--
-- WHY service-role-only writes (no authenticated path, mirrors sql/13 family)
--   Discovery rows are written exclusively by the F2-b runner under the
--   service-role key. The consumer (`seedWorkItems`) also runs under
--   service-role (edge-function `supabaseAdmin`). Any authenticated INSERT/
--   UPDATE/DELETE would let a logged-in user forge or drop discovery rows —
--   which would silently zero out a trading day or seed phantom accessions.
--   The deny triad makes that impossible structurally (RESTRICTIVE
--   AND-combines and cannot be OR-defeated by any future PERMISSIVE policy).
--
-- WHY longshort.view SELECT (not raw `authenticated`)
--   Read visibility is gated on the long-short module's view permission so
--   admin tooling can render discovery-coverage panels without exposing the
--   queue to every authenticated user. Mirrors signal_queue_runs /
--   signal_observations SELECT shape.
--
-- INDEX RATIONALE
--   - PK (as_of_date, issuer_cik, accession_number) — covers point lookups
--     and as_of_date range scans; sufficient for the F2-c consumer's
--     `WHERE as_of_date = $1 AND consumed_at IS NULL` plan when paired with
--     the partial index below.
--   - idx_iadq_unconsumed_by_day — partial `(as_of_date) WHERE consumed_at
--     IS NULL`. The consumer's hot path is "give me today's unconsumed
--     rows"; the partial keeps the index small (most days drain to empty
--     within minutes of the cron fire).
--
-- IDEMPOTENCY (D3)
--   CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
--   DROP POLICY IF EXISTS / CREATE POLICY for stable policy names. Re-apply
--   is a no-op. The CHECK constraint on form_type is named so re-runs do
--   not error on duplicate constraint-name.
--
-- ATOMICITY
--   BEGIN/COMMIT wraps the whole DDL block so the table is never observable
--   without its grants/RLS/policies.
--
-- DEPLOY GATE
--   F2.a is a migration-only commit. No edge-function code changes; the
--   F2-pre deploy-SHA verifier contract binds only on deploy steps and does
--   NOT gate this commit. F2-b (discovery script + GHA workflow) and F2-c
--   (consumer switch) re-enter the verifier gate.
--
-- Authority: FP-050 Phase 4 F2.a / MIG-096 / ACT-202.
-- =============================================================================

BEGIN;

-- 1. TABLE -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.insider_accession_discovery_queue (
  as_of_date                date        NOT NULL,
  issuer_cik                text        NOT NULL,
  accession_number          text        NOT NULL,
  form_type                 text        NOT NULL,
  company_name              text        NOT NULL,
  filename                  text        NOT NULL,
  discovered_at             timestamptz NOT NULL DEFAULT now(),
  discovered_by             text        NOT NULL,
  discovery_correlation_id  text        NOT NULL,
  consumed_at               timestamptz NULL,
  consumed_run_id           uuid        NULL,
  CONSTRAINT insider_accession_discovery_queue_pkey
    PRIMARY KEY (as_of_date, issuer_cik, accession_number),
  CONSTRAINT insider_accession_discovery_queue_form_type_check
    CHECK (form_type IN ('4', '4/A'))
);

COMMENT ON TABLE public.insider_accession_discovery_queue IS
  'FP-050 Phase 4 F2.a — discovery-layer egress relocation. Written by the off-Supabase-Edge runner (F2-b); drained by seedWorkItems (F2-c). PK (as_of_date, issuer_cik, accession_number) enforces §(h) discovery-idempotency.';

-- 2. GRANTS ------------------------------------------------------------------
--    service_role: full (producer + consumer both run service-role).
--    authenticated: SELECT only — write paths are RLS-denied below.
--    anon: NONE — discovery rows are not public.

GRANT SELECT ON public.insider_accession_discovery_queue TO authenticated;
GRANT ALL    ON public.insider_accession_discovery_queue TO service_role;

-- 3. RLS ENABLE --------------------------------------------------------------

ALTER TABLE public.insider_accession_discovery_queue ENABLE ROW LEVEL SECURITY;

-- 4. POLICY FAMILY -----------------------------------------------------------
--    (a) service_role full ALL
--    (b) longshort.view SELECT
--    (c) RESTRICTIVE deny INSERT / UPDATE / DELETE for authenticated

-- (a) service_role full ALL
DROP POLICY IF EXISTS iadq_service_role_all
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_service_role_all
  ON public.insider_accession_discovery_queue
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- (b) longshort.view SELECT
DROP POLICY IF EXISTS iadq_longshort_view_select
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_longshort_view_select
  ON public.insider_accession_discovery_queue
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

-- (c) RESTRICTIVE deny triad on authenticated
DROP POLICY IF EXISTS iadq_deny_authenticated_insert
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_deny_authenticated_insert
  ON public.insider_accession_discovery_queue
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS iadq_deny_authenticated_update
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_deny_authenticated_update
  ON public.insider_accession_discovery_queue
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS iadq_deny_authenticated_delete
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_deny_authenticated_delete
  ON public.insider_accession_discovery_queue
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- 5. INDEXES -----------------------------------------------------------------
--    PK already covers (as_of_date, issuer_cik, accession_number).
--    Partial index for the consumer's "today's unconsumed rows" hot path.

CREATE INDEX IF NOT EXISTS idx_iadq_unconsumed_by_day
  ON public.insider_accession_discovery_queue (as_of_date)
  WHERE consumed_at IS NULL;

COMMIT;

-- =============================================================================
-- Post-apply verification (operator runs in Supabase SQL Editor):
--
--   SELECT
--     (SELECT count(*) FROM information_schema.tables
--       WHERE table_schema='public'
--         AND table_name='insider_accession_discovery_queue') AS table_present,
--     (SELECT count(*) FROM pg_policies
--       WHERE schemaname='public'
--         AND tablename='insider_accession_discovery_queue') AS policy_count,
--     (SELECT count(*) FROM pg_indexes
--       WHERE schemaname='public'
--         AND tablename='insider_accession_discovery_queue') AS index_count,
--     (SELECT count(*) FROM public.insider_accession_discovery_queue) AS row_count;
--
-- Expected post-apply:
--   table_present = 1
--   policy_count  = 5  (iadq_service_role_all, iadq_longshort_view_select,
--                       iadq_deny_authenticated_insert,
--                       iadq_deny_authenticated_update,
--                       iadq_deny_authenticated_delete)
--   index_count   = 2  (PK + idx_iadq_unconsumed_by_day)
--   row_count     = 0  (empty until F2-b runner first writes)
-- =============================================================================