-- MIG-113 / ACT-276: Fix DW-119 service-role guard to read canonical PostgREST JWT claims.
--
-- MIG-112 restored EXECUTE grants, but the admin edge-function path still returned
-- 403 because DW-119's service-role exemption read only
-- current_setting('request.jwt.claim.role', true). In the deployed PostgREST RPC
-- context the service-role JWT is exposed through request.jwt.claims JSON; auth.uid()
-- is NULL, so the guard returned false for service-role calls before evaluating the
-- target user's real permissions.
--
-- This migration changes only the service-role predicate in the three guarded RBAC
-- helpers. The arbitrary-_user_id leak closure remains intact: allowed callers are
-- still self, service_role, or a real superadmin caller. The same-migration GRANT
-- block is intentionally repeated per the DW-131 binding rule for SECURITY DEFINER
-- recreates.

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- DW-119 guard: deny arbitrary-_user_id probes from authenticated callers.
  IF NOT (
    _user_id = auth.uid()
    OR COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.key = 'superadmin'
    )
  ) THEN
    RETURN false;
  END IF;

  IF _user_id IS NULL OR _permission_key IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_superadmin(_user_id) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id
      AND p.key = _permission_key
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN (
    _user_id = auth.uid()
    OR COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.key = 'superadmin'
    )
  ) THEN (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = _user_id
        AND r.key = 'superadmin'
    )
  ) ELSE false END
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN (
    _user_id = auth.uid()
    OR COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.key = 'superadmin'
    )
  ) THEN (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.user_id = _user_id
        AND r.key = _role_key
    )
  ) ELSE false END
$function$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_authorization_context()    TO authenticated, service_role;