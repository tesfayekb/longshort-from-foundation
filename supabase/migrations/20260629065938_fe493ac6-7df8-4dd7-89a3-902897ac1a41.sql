-- MIG-142 (FP-061 sub-step 4M.5b / ACT-376): terminal net-PnL columns on longshort_lots.
-- Column-on-lots per DW-160 precedent (DW-159 amended; separate realized_pnl table SUPERSEDED).
-- net_pnl is a PLAIN column populated by the writer (NOT a GENERATED column) — wash_sale_adjustment
-- is set asynchronously by apply_7_8 which may fire AFTER the close-write, so a generated column
-- would compute stale. The writer in lot-ledger-writer.closeLots seeds net_pnl=realized_pnl at
-- close (wash_sale_adjustment defaults 0), and applyNetPnlAdjustment in wash-sale-writer updates
-- both columns when a §7.8 disallowance lands.
ALTER TABLE public.longshort_lots
  ADD COLUMN IF NOT EXISTS wash_sale_adjustment NUMERIC(20,4) NOT NULL DEFAULT 0;

ALTER TABLE public.longshort_lots
  ADD COLUMN IF NOT EXISTS net_pnl NUMERIC(20,4) NULL;

COMMENT ON COLUMN public.longshort_lots.wash_sale_adjustment IS
  'FP-061 4M.5b / MIG-142. Positive magnitude added back to a CLOSED lot whose loss '
  'was disallowed under IRS §7.8 wash-sale retroactive attachment. Defaults 0; '
  'updated by wash-sale-writer.applyNetPnlAdjustment join on source_lot_ids.';

COMMENT ON COLUMN public.longshort_lots.net_pnl IS
  'FP-061 4M.5b / MIG-142. Net taxable PnL = realized_pnl + wash_sale_adjustment '
  '(PLUS not minus — disallowed_amount is stored as positive magnitude; a -500 loss + '
  '500 disallowance = 0 net taxable). The 1099-B / Form 8949 number. Seeded at close '
  'by closeLots = realized_pnl; updated by applyNetPnlAdjustment when §7.8 fires.';