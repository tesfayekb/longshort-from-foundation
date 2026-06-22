-- MIG-109: DW-119 — auth-helper arbitrary-_user_id leak closure
-- Adds in-language guard to 3 RLS-load-bearing security definer helpers and
-- drops the orphaned legacy has_role(uuid, app_role) overload.
-- Authorized predicate (self OR service_role OR superadmin); mirrors sql/11:162.
-- Behavior-neutral for all existing callers (self / service_role / superadmin).

-- 1. has_permission (plpgsql): prepend guard; original body preserved.
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
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
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

-- 2. is_superadmin (sql): CASE-wrap with guard.
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN (
    _user_id = auth.uid()
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
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

-- 3. has_role(uuid, text) (sql): CASE-wrap with guard.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN (
    _user_id = auth.uid()
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
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

-- 4. Drop orphaned legacy overload (A.4: zero dependents).
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);