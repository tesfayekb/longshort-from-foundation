BEGIN;

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
  'FP-050 Phase 4 F2.a — discovery-layer egress relocation. Written by the off-Supabase-Edge runner (F2-b); drained by seedWorkItems (F2-c). PK (as_of_date, issuer_cik, accession_number) enforces section (h) discovery-idempotency.';

GRANT SELECT ON public.insider_accession_discovery_queue TO authenticated;
GRANT ALL    ON public.insider_accession_discovery_queue TO service_role;

ALTER TABLE public.insider_accession_discovery_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS iadq_service_role_all
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_service_role_all
  ON public.insider_accession_discovery_queue
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS iadq_longshort_view_select
  ON public.insider_accession_discovery_queue;
CREATE POLICY iadq_longshort_view_select
  ON public.insider_accession_discovery_queue
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

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

CREATE INDEX IF NOT EXISTS idx_iadq_unconsumed_by_day
  ON public.insider_accession_discovery_queue (as_of_date)
  WHERE consumed_at IS NULL;

COMMIT;