-- MIG-148 (ACT-403, Finding-B Option-1) — partial unique index on
-- longshort_lots(source_order_id) WHERE source_order_id IS NOT NULL.
--
-- DB safety-net for the in-code dedup at writeOpenLot. The recently-filled
-- reconstruction path uses an overlapping 2× tick-interval window, so the
-- same broker order_id may be re-observed across consecutive ticks. The
-- in-code SELECT pre-check is the user-visible early return; this unique
-- index is the structural guarantee that even under a race two simultaneous
-- inserts cannot both land. Partial (WHERE source_order_id IS NOT NULL) so
-- legacy rows without lineage (corporate-action synthetic lots, tests) are
-- unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS longshort_lots_source_order_id_uidx
  ON public.longshort_lots(source_order_id)
  WHERE source_order_id IS NOT NULL;

COMMENT ON INDEX public.longshort_lots_source_order_id_uidx IS
  'MIG-148 / ACT-403 — Finding-B Option-1 idempotency safety net for the recently-filled reconstruction path. Pairs with the in-code source_order_id pre-check at writeOpenLot. Partial: applies only when source_order_id IS NOT NULL (CA synthetic lots and historical test rows have NULL lineage).';