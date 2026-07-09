-- ACT-494d: kill_switches missing table-level GRANT SELECT for authenticated.
-- RLS policies exist (read_scoped + no_direct_write) but PostgREST returns
-- "permission denied for table kill_switches" because no table-level grants
-- were ever issued. Writes remain fully denied by the RESTRICTIVE
-- kill_switches_no_direct_write_policy (USING(false)) plus absence of
-- INSERT/UPDATE/DELETE grants; SELECT is gated by has_permission checks.
GRANT SELECT ON public.kill_switches TO authenticated;
GRANT ALL ON public.kill_switches TO service_role;