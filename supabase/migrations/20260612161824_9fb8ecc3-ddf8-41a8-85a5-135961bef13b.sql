-- ============================================================================
-- FP-050 Phase 3.6b.ii′ HEAD — MIG-095
-- `insider_form4_rows` schema correction: ADD COLUMN owner_cik text NOT NULL.
--
-- WHY (defect chain):
--   MIG-094 (Phase 3.6b.i) created `insider_form4_rows` with the §(h)
--   idempotency triple PK (issuer_cik, accession_number, transaction_seq).
--   The MIG-094 docstring described the §(h) most-recent-accession read-time
--   preference key as four-part: (issuer_cik, owner_cik, transaction_date,
--   transaction_seq) — matching the existing in-memory dedup in
--   `insider-orchestrator.ts::preferMostRecentAccession` (line 188:
--   `key = ${r.issuer_cik}|${r.owner_cik}|${r.transaction_date}|${r.transaction_seq}`).
--   The column list shipped only three of those four components; `owner_cik`
--   was omitted. Detection path: the FP-050 Phase 3.6b.ii′ extraction
--   conformance check ("the dedup key the consumer must reconstruct must
--   exist on the persisted row") — the lift could not proceed byte-for-byte
--   against the existing preference function without this column. The
--   intended 3.6b.iii′ regression test ("two same-date, same-seq,
--   different-owner transactions BOTH survive the preference") is the
--   permanent forward-looking sentinel.
--
-- SAFE-NOW PRECONDITION (evidence, not assumption):
--   The table is empty at the moment of this migration. Verified live via
--   §22.5.1 read prior to this migration's creation:
--     SELECT count(*) FROM public.insider_form4_rows;  →  0 rows
--   A NOT NULL ADD COLUMN cannot fail on an empty table (no existing rows
--   to violate the constraint), and no DEFAULT is needed. If this migration
--   is re-applied after the table is populated, the IF NOT EXISTS guard
--   makes it a no-op (the column already exists).
--
-- IN-MEMORY DEDUP PARTICIPANT — NO INDEX:
--   `owner_cik` is loaded into memory inside loadAndCompute's paginated 90-
--   day-window scan and consumed only by `preferMostRecentAccession` (a
--   Map.set keyed on the four-part composite). It never appears in a SQL
--   WHERE clause. Creating an index on it would be premature
--   pessimisation. Read-path indexes remain:
--     idx_insider_form4_rows_ticker_acceptance (ticker, acceptance_datetime DESC)
--     idx_insider_form4_rows_issuer_txn_date    (issuer_cik, transaction_date DESC)
--
-- IDEMPOTENT: `ADD COLUMN IF NOT EXISTS`. Re-apply is a no-op.
--
-- NO GRANT / RLS / POLICY CHANGES: column inherits the existing access
-- model from MIG-094 (service-role write, longshort.view read, deny-write
-- triad on authenticated).
-- ============================================================================

ALTER TABLE public.insider_form4_rows
  ADD COLUMN IF NOT EXISTS owner_cik text NOT NULL;

COMMENT ON COLUMN public.insider_form4_rows.owner_cik IS
  'Reporting-person CIK (padded text). Load-bearing component of the §(h) most-recent-accession in-memory dedup key (issuer_cik, owner_cik, transaction_date, transaction_seq) applied at read time by loadAndCompute. NOT indexed — participates in in-memory Map dedup only, never in a SQL WHERE. Added by MIG-095 to close the MIG-094 docstring/column-list defect.';