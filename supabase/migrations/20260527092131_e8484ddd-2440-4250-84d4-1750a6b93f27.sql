-- Fix missing Postgres-level table grants on universe/reconciliation tables.
-- RLS policies already exist; this only closes the layer-1 grant gap.
GRANT SELECT ON public.universe_refresh_log TO authenticated;
GRANT SELECT ON public.reconciliation_events TO authenticated;
GRANT SELECT ON public.universe_membership TO authenticated;