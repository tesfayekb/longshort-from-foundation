-- MIG-139 (FP-061 sub-step 4M.1 / DW-158): longshort_lots — FIFO tax-lot
-- ledger. First money-path table. Columns byte-match
-- verify_lot_record.InternalLotRecord (COMPARED_FIELDS exact-match contract)
-- PLUS DW-160 column-on-lots settlement fields (settlement_state,
-- expected_settlement_ts) per FP-061 Binding Decision.
--
-- Tax-regulatory; indefinite retention per §11.0.10 line 334. Zero-tolerance
-- divergence per §11.0.9 line 234 (enforced by verify_lot_record).
--
-- RLS / GRANT / trigger shape mirrors MIG-138 (short_interest_alpha_shadow)
-- and the broader money-path table pattern.

CREATE TABLE IF NOT EXISTS public.longshort_lots (
  lot_id                  uuid             NOT NULL DEFAULT gen_random_uuid(),
  operator_id             uuid             NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  symbol                  text             NOT NULL,
  entry_ts                timestamptz      NOT NULL,
  qty                     numeric          NOT NULL,
  cost_basis              numeric          NOT NULL,
  side                    text             NOT NULL,
  status                  text             NOT NULL DEFAULT 'open',
  locate_id               text             NULL,
  -- DW-160 column-on-lots (FP-061 Binding Decision). Reconciler fills in 4M.2.
  settlement_state        text             NOT NULL DEFAULT 'pending',
  expected_settlement_ts  timestamptz      NULL,
  -- Lineage to the broker fill that opened the lot. Not in COMPARED_FIELDS;
  -- excluded from verify_lot_record's exact-match by design.
  source_order_id         text             NULL,
  closed_at               timestamptz      NULL,
  created_at              timestamptz      NOT NULL DEFAULT now(),
  updated_at              timestamptz      NOT NULL DEFAULT now(),
  PRIMARY KEY (lot_id),
  CONSTRAINT longshort_lots_qty_positive_check
    CHECK (qty > 0),
  CONSTRAINT longshort_lots_cost_basis_nonneg_check
    CHECK (cost_basis >= 0),
  CONSTRAINT longshort_lots_side_check
    CHECK (side IN ('long','short')),
  CONSTRAINT longshort_lots_status_check
    CHECK (status IN ('open','closed')),
  CONSTRAINT longshort_lots_settlement_state_check
    CHECK (settlement_state IN ('pending','settled','failed'))
);

COMMENT ON TABLE public.longshort_lots IS
  'FP-061 sub-step 4M.1 / DW-158: FIFO tax-lot ledger. First money-path table. Columns byte-match verify_lot_record.InternalLotRecord COMPARED_FIELDS {lot_id, symbol, entry_ts, qty, cost_basis, side, status, locate_id} for the verifier exact-match contract. Adds DW-160 column-on-lots settlement_state + expected_settlement_ts (FP-061 Binding Decision — reconciler fills in 4M.2). source_order_id is broker-fill lineage and is INTENTIONALLY OUTSIDE COMPARED_FIELDS. Indefinite retention (tax-regulatory §11.0.10). Zero-tolerance divergence (§11.0.9).';

-- Useful access paths for the 4M.2-4M.5 consumers + the verify_lot_record reader.
CREATE INDEX IF NOT EXISTS longshort_lots_operator_symbol_status_idx
  ON public.longshort_lots (operator_id, symbol, status);
CREATE INDEX IF NOT EXISTS longshort_lots_operator_entry_ts_idx
  ON public.longshort_lots (operator_id, entry_ts);
CREATE INDEX IF NOT EXISTS longshort_lots_settlement_pending_idx
  ON public.longshort_lots (operator_id, expected_settlement_ts)
  WHERE settlement_state = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.longshort_lots TO authenticated;
GRANT ALL ON public.longshort_lots TO service_role;

ALTER TABLE public.longshort_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS longshort_lots_service_role_all
  ON public.longshort_lots;
CREATE POLICY longshort_lots_service_role_all
  ON public.longshort_lots
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS longshort_lots_authenticated_select
  ON public.longshort_lots;
CREATE POLICY longshort_lots_authenticated_select
  ON public.longshort_lots
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS longshort_lots_authenticated_insert
  ON public.longshort_lots;
CREATE POLICY longshort_lots_authenticated_insert
  ON public.longshort_lots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'longshort.manage'));

DROP POLICY IF EXISTS longshort_lots_authenticated_update
  ON public.longshort_lots;
CREATE POLICY longshort_lots_authenticated_update
  ON public.longshort_lots
  FOR UPDATE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.manage'))
  WITH CHECK (public.has_permission(auth.uid(), 'longshort.manage'));

DROP POLICY IF EXISTS longshort_lots_authenticated_delete
  ON public.longshort_lots;
CREATE POLICY longshort_lots_authenticated_delete
  ON public.longshort_lots
  FOR DELETE
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.manage'));

DROP TRIGGER IF EXISTS longshort_lots_set_updated_at ON public.longshort_lots;
CREATE TRIGGER longshort_lots_set_updated_at
  BEFORE UPDATE ON public.longshort_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
