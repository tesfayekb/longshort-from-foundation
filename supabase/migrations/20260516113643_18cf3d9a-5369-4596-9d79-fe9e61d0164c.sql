-- MIG-036: SECURITY DEFINER EXECUTE hardening (H1a)
-- Authorized by: Lovable project review H1a (linter 0028/0029) + supervisor verification.
--
-- Closes the anon-enumeration oracle on SECURITY DEFINER functions by revoking
-- EXECUTE from PUBLIC and anon. Grants EXECUTE to authenticated only for the
-- single function invoked as a client RPC from src/ (get_my_authorization_context).
-- Trigger functions, RLS helpers, and server-only paths do NOT require client
-- EXECUTE: Postgres trigger machinery, RLS expression evaluation, and the
-- service-role used by edge functions all bypass client EXECUTE checks.
--
-- Ground-truth enumeration at HEAD b3c969f (pg_proc, prosecdef = true, nspname = public):
--   1. accept_invitation_on_confirm()                 TRIGGER
--   2. handle_new_user()                              TRIGGER
--   3. handle_new_user_role()                         TRIGGER
--   4. sync_profile_email()                           TRIGGER
--   5. rls_auto_enable()                              TRIGGER (event trigger)
--   6. has_permission(uuid, text)                     RLS_HELPER (+ edge service-role)
--   7. has_role(uuid, app_role)                       RLS_HELPER (+ edge service-role)
--   8. has_role(uuid, text)                           RLS_HELPER (+ edge service-role)
--   9. is_superadmin(uuid)                            RLS_HELPER (+ edge service-role)
--  10. get_my_authorization_context()                 CLIENT_RPC
--
-- Idempotent: REVOKE/GRANT are inherently safe to re-apply. No DROP, no DDL.
-- Linked finding: INC-19

-- Trigger functions
REVOKE EXECUTE ON FUNCTION public.accept_invitation_on_confirm() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()              FROM PUBLIC, anon, authenticated;

-- RLS helpers (also called by edge functions via service-role, which bypasses EXECUTE)
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid)            FROM PUBLIC, anon, authenticated;

-- Client RPC: invoked from src/ via supabase.rpc('get_my_authorization_context')
REVOKE EXECUTE ON FUNCTION public.get_my_authorization_context() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_authorization_context() TO authenticated;