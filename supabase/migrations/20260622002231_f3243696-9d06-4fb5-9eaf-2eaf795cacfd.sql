-- DW-119 / MIG-109 verification (no schema mutation).
DO $verify$
DECLARE
  v_sa  uuid := 'c0523131-8964-48c0-8a6a-76275acff631';  -- real superadmin
  v_fake uuid := '00000000-0000-0000-0000-0000000000aa'; -- non-existent authenticated user
  r boolean;
BEGIN
  -- ---------- C.1 NEGATIVE: authenticated fake user probes real superadmin ----------
  PERFORM set_config('request.jwt.claim.sub', v_fake::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated', true);
  SET LOCAL ROLE authenticated;

  r := public.is_superadmin(v_sa);
  IF r IS DISTINCT FROM false THEN RAISE EXCEPTION 'C.1a LEAK: is_superadmin(other-sa) returned %', r; END IF;

  r := public.has_role(v_sa,'superadmin');
  IF r IS DISTINCT FROM false THEN RAISE EXCEPTION 'C.1b LEAK: has_role(other-sa,superadmin) returned %', r; END IF;

  r := public.has_permission(v_sa,'roles.view');
  IF r IS DISTINCT FROM false THEN RAISE EXCEPTION 'C.1c LEAK: has_permission(other-sa,roles.view) returned %', r; END IF;

  RESET ROLE;

  -- ---------- C.2 SELF: authenticated as real superadmin asking about self ----------
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  PERFORM set_config('request.jwt.claim.role','authenticated', true);
  SET LOCAL ROLE authenticated;

  r := public.is_superadmin(v_sa);
  IF r IS DISTINCT FROM true THEN RAISE EXCEPTION 'C.2a SELF REGRESSION: is_superadmin(self) returned %', r; END IF;

  r := public.has_role(v_sa,'superadmin');
  IF r IS DISTINCT FROM true THEN RAISE EXCEPTION 'C.2b SELF REGRESSION: has_role(self,superadmin) returned %', r; END IF;

  r := public.has_permission(v_sa,'roles.view');
  IF r IS DISTINCT FROM true THEN RAISE EXCEPTION 'C.2c SELF REGRESSION: has_permission(self,roles.view) returned %', r; END IF;

  RESET ROLE;

  -- ---------- C.3 service_role exemption: probe any uid, must return real answer ----------
  PERFORM set_config('request.jwt.claim.sub','', true);
  PERFORM set_config('request.jwt.claim.role','service_role', true);
  SET LOCAL ROLE service_role;

  r := public.is_superadmin(v_sa);
  IF r IS DISTINCT FROM true THEN RAISE EXCEPTION 'C.3a SERVICE_ROLE REGRESSION: is_superadmin(real-sa) returned %', r; END IF;

  r := public.has_permission(v_sa,'roles.view');
  IF r IS DISTINCT FROM true THEN RAISE EXCEPTION 'C.3b SERVICE_ROLE REGRESSION: has_permission(real-sa,roles.view) returned %', r; END IF;

  RESET ROLE;

  RAISE NOTICE 'DW-119 verification: ALL 8 ASSERTIONS PASSED (3 negative leak-closure, 3 self-preserve, 2 service_role exemption).';
END
$verify$;