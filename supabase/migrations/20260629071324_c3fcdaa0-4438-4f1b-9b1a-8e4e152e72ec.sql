-- MIG-143 (FP-061 sub-step 4M.2 / ACT-377): settled_at column on longshort_lots.
-- The daily settlement reconciler (longshort-settlement-reconciler) flips
-- settlement_state 'pending' -> 'settled' for rows whose
-- expected_settlement_ts (stamped at open by lot-ledger-writer.writeOpenLot
-- via tradingDaysAfter(entry_ts, 1)) has elapsed against an INJECTED as_of
-- (no wall-clock for the financial comparison, §2 axiom 4). The flip
-- stamps `settled_at = as_of`.
--
-- Column-on-lots per DW-160 binding (NO sibling settlement table). Plain
-- nullable column: NULL = still pending (or pre-MIG-143 backfill); a
-- stamped timestamp = the as_of at which the reconciler observed
-- expected_settlement_ts had elapsed.
ALTER TABLE public.longshort_lots
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.longshort_lots.settled_at IS
  'FP-061 4M.2 / MIG-143. Stamped by longshort-settlement-reconciler when '
  'an injected as_of >= expected_settlement_ts and the row is flipped to '
  'settlement_state=''settled''. NULL until settled. Internal-authoritative; '
  'the broker settled-funds cross-check (verify_settlement_status real path) '
  'is soft-dependent on FP-062 AlpacaBuyingPowerFetcher.';