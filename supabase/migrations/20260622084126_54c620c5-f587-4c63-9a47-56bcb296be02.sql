-- MIG-112 / DW-131: Restore EXECUTE grants on RBAC SECURITY DEFINER helpers.
-- Root cause: DW-119 recreate (20260622002108) replaced the four helper functions
-- without re-issuing the EXECUTE grants established by 20260527093149. PostgREST
-- callers using the `authenticated` and `service_role` roles received
-- SQLSTATE 42501 (permission denied for function), which `checkPermissionOrThrow`
-- mapped to 403 FORBIDDEN across all admin edge functions.
--
-- This migration restores the grants verbatim. Function bodies are NOT modified;
-- the DW-119 guard logic remains in place. The canonical helper source file
-- (sql/02_rbac_security_helpers.sql) is updated in the same change so a future
-- recreate or replay re-issues the grants deterministically.

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_authorization_context()    TO authenticated, service_role;