-- ============================================================================
-- FP-050 Phase 3.6b.i — insider_form4_rows table + the §(h)-triple PK,
-- keep-all-versions, BOTH dates, RLS family, 90-day-window read index.
--
-- Per DEC-058 §(h): idempotency triple = (issuer_cik, accession_number, transaction_seq).
-- NO write-time merge — the §(h) most-recent-accession preference is a READ-TIME
-- operation applied by loadAndCompute at finalize. Form 4 and Form 4/A are
-- treated identically by the schema; the read-time preference orders versions
-- by (issuer, owner, transaction_date, seq) and picks the most recent accession.
--
-- §(b) dual-date axis (Option A): BOTH transaction_date (decay anchor) AND
-- acceptance_datetime (look-ahead gate) persisted. The look-ahead gate keys on
-- acceptance_datetime ≤ as_of (timestamp comparison) — matches every sibling
-- signal's as_of convention.
--
-- Late-amendment-out-of-window counter: NOT a column on this table. It is
-- run-meta on signal_queue_runs (recorded by the consumer at finalize).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insider_form4_rows (
  -- §(h) idempotency triple (composite PK; keep-all-versions, no write-time merge)
  issuer_cik              text        NOT NULL,
  accession_number        text        NOT NULL,
  transaction_seq         integer     NOT NULL,

  -- §(b) dual-date axis — BOTH persisted (look-ahead gate vs decay anchor)
  transaction_date        date        NOT NULL,   -- decay anchor: age_days = (as_of − transaction_date)
  acceptance_datetime     timestamptz NOT NULL,   -- look-ahead gate: acceptance_datetime ≤ as_of (timestamp comparison)

  -- §(a) transaction code (raw — compute layer is single filter authority per spec §4.4.4)
  transaction_code        text        NOT NULL,
  transaction_acquired_disposed text  NOT NULL,   -- 'A' (acquired, +1) or 'D' (disposed, −1)

  -- magnitude (Σ shares × price × sign × role_weight × exp(-age_days / 14))
  transaction_shares          numeric NOT NULL,
  transaction_price_per_share numeric,            -- nullable (grants / option records may carry 0)

  -- §(c) 10b5-1 attribution (form-level scan; conservative over-exclusion per DEC-058 §(c))
  aff_10b5_one            boolean     NOT NULL DEFAULT false,

  -- §(d) role classification raw inputs (DEC-044 deterministic classifier owns weight derivation)
  is_director             boolean     NOT NULL DEFAULT false,
  is_officer              boolean     NOT NULL DEFAULT false,
  is_ten_percent_owner    boolean     NOT NULL DEFAULT false,
  not_subject_to_section_16 boolean   NOT NULL DEFAULT false,
  officer_title           text,                   -- free-text — NEO title-heuristic input (DEC-044)
  security_type           text,                   -- 'derivative' / 'non-derivative' — diagnostics only

  -- attribution (issuer-side; primary ticker per orchestrator FP-042 market-wide addendum)
  ticker                  text        NOT NULL,
  filing_form_type        text        NOT NULL,   -- '4' or '4/A' — §(h) identical treatment

  -- audit / provenance
  ingested_at             timestamptz NOT NULL DEFAULT now(),
  ingested_run_id         uuid,                   -- signal_queue_runs.run_id that ingested this row

  PRIMARY KEY (issuer_cik, accession_number, transaction_seq)
);

-- Mandatory GRANTs (every CREATE TABLE in public MUST be followed by GRANTs).
-- service_role: full access (consumer + finalize + backfill paths).
-- authenticated: SELECT only; writes denied by the deny-write triad below.
-- anon: NO grant — every read path is gated by longshort.view.
GRANT SELECT ON public.insider_form4_rows TO authenticated;
GRANT ALL    ON public.insider_form4_rows TO service_role;

ALTER TABLE public.insider_form4_rows ENABLE ROW LEVEL SECURITY;

-- RLS family pattern (mirrors signal_queue_* + signal_observations):
-- service-role write, longshort.view read, deny-write triad on authenticated.

DROP POLICY IF EXISTS "insider_form4_rows_service_role_all"        ON public.insider_form4_rows;
DROP POLICY IF EXISTS "insider_form4_rows_longshort_view_select"   ON public.insider_form4_rows;
DROP POLICY IF EXISTS "insider_form4_rows_authenticated_no_insert" ON public.insider_form4_rows;
DROP POLICY IF EXISTS "insider_form4_rows_authenticated_no_update" ON public.insider_form4_rows;
DROP POLICY IF EXISTS "insider_form4_rows_authenticated_no_delete" ON public.insider_form4_rows;

CREATE POLICY "insider_form4_rows_service_role_all"
  ON public.insider_form4_rows
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "insider_form4_rows_longshort_view_select"
  ON public.insider_form4_rows
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

CREATE POLICY "insider_form4_rows_authenticated_no_insert"
  ON public.insider_form4_rows
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "insider_form4_rows_authenticated_no_update"
  ON public.insider_form4_rows
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "insider_form4_rows_authenticated_no_delete"
  ON public.insider_form4_rows
  FOR DELETE TO authenticated
  USING (false);

-- 90-day window read index supporting loadAndCompute:
-- (ticker, acceptance_datetime DESC) covers the §(b) gated scan ordered for §(h) recency.
CREATE INDEX IF NOT EXISTS idx_insider_form4_rows_ticker_acceptance
  ON public.insider_form4_rows (ticker, acceptance_datetime DESC);

-- Secondary index for §(h) most-recent-accession preference at read time
-- (issuer, transaction_date DESC) supports the per-issuer recency ordering inside loadAndCompute.
CREATE INDEX IF NOT EXISTS idx_insider_form4_rows_issuer_txn_date
  ON public.insider_form4_rows (issuer_cik, transaction_date DESC);

-- ============================================================================
-- Phase-3.5 correction (4 of 4): signal_registry.cadence rewrite —
-- queue-drained daily ingest + finalize, measured per-day numbers.
--
-- Falsified prior value: "...single-invocation ~18s/fire incremental..." was
-- predicated on an unmeasured ~50/fire accession estimate. Phase-0 probe-window
-- measured ~1,667 in-universe Form-4 accessions per day. The §(i) arithmetic
-- row in insider-transactions.md is corrected in the same commit (doc-only);
-- this UPDATE re-stamps the registry cadence to the queue-drained design with
-- the measured per-day numbers shown structurally.
--
-- Idempotent: re-apply re-stamps the same string.
-- ============================================================================
UPDATE public.signal_registry
   SET cadence = 'daily (after-close; queue-drained ingest + finalize per FP-050 Phase 3.6b work-list consumer — Phase-0 measured ~1,667 in-universe Form-4 accessions/day; per-fire ~3,425 EDGAR HTTPS calls (1 CIK map + 90 daily-index sweep + 1,667 per-accession index.json + 1,667 Form-4 XML) drained across queue slices at 5 rps self-imposed cap (~11.4 min wall-clock); acceptance-gated per DEC-058 §(b); table-keyed §(h) read-time preference at finalize; backfill ~91k calls / ~5 hours queue-drained one-shot, MUST complete before Phase 4 arm-up; interim per DEC-048 — §4.4.4 30-min intraday revisit is a future enhancement-FP, Phase 7 picks final cadence)'
 WHERE signal_id = 'insider_transactions_90d';