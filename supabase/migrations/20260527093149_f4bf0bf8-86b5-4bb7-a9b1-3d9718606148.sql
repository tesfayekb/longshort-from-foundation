GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'RLS helper — checks whether user_id has permission_key directly via role_permissions OR via superadmin role bypass. SECURITY DEFINER runs body with owner privileges. EXECUTE granted to authenticated per the RLS evaluation requirement; service-role bypasses EXECUTE for edge function paths.';