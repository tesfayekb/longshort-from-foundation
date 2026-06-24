-- MIG-119: longshort_short_availability_cache — htb rejection-state record
-- FP-056 E4 / ACT-312 / DEC-068 clause-e HYBRID resolution.
--
-- Purpose: break the htb re-reject loop the substitution layer cannot catch.
-- Alpaca's /v2/assets shortable/ETB column is a once-each-morning snapshot
-- (per Alpaca docs); intraday borrow changes are not reflected until the next
-- morning's refresh. Without this record, an htb-rejected name re-passes the
-- stale-snapshot pre-flight on the next tick and re-submits, looping until
-- the next morning. The record is consulted by verify_short_availability as
-- a fast-fail gate BEFORE the broker locate call; on a genuine-success locate
-- (qty_available >= qty_requested) the row is DELETEd (clear-on-genuine-success).
-- A PARTIAL locate (qty_available < qty_requested) does NOT clear — the symbol
-- is still constrained.
--
-- The §2 axiom is satisfied: this is a within-day CORRECTION over a known-
-- stale prime (the assets snapshot), not a derivative drifting from a live
-- prime (which would be the §2 anti-pattern that ruled out halted/BP caches).
--
-- TTL backstop (expires_at): defensive net for a marked name that is never
-- re-selected (and therefore never gets a genuine-success clear). Default
-- 24h wall-clock — a conservative upper bound; a trading-calendar-aware TTL
-- is flagged for a DEC-068 append (no daily assets-refresh job exists; grep
-- confirmed only quarterly universe refresh).

CREATE TABLE IF NOT EXISTS public.longshort_short_availability_cache (
  symbol         TEXT PRIMARY KEY,
  marked_htb_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at     TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_longshort_short_availability_cache_expires_at
  ON public.longshort_short_availability_cache (expires_at);

GRANT SELECT ON public.longshort_short_availability_cache TO authenticated;
GRANT ALL    ON public.longshort_short_availability_cache TO service_role;

ALTER TABLE public.longshort_short_availability_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "longshort.view reads htb cache"
  ON public.longshort_short_availability_cache;
CREATE POLICY "longshort.view reads htb cache"
  ON public.longshort_short_availability_cache
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS "service_role manages htb cache"
  ON public.longshort_short_availability_cache;
CREATE POLICY "service_role manages htb cache"
  ON public.longshort_short_availability_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
