-- MIG-107 / ACT-262 — DW-117 remediation, WARN-0028 class.
-- Revoke PUBLIC/anon EXECUTE on 6 SECURITY DEFINER functions; pair with
-- authenticated GRANT on the 4 kill_switch_* RPCs to preserve the admin-UI
-- emergency-stop caller. service_role grants untouched.

REVOKE EXECUTE ON FUNCTION public.assert_eligibility_complete(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_universe_eligibility_coverage(uuid, date, jsonb) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.kill_switch_hard_pause(text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.kill_switch_hard_pause(text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.kill_switch_manual_liquidate(text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.kill_switch_manual_liquidate(text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.kill_switch_resume(text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.kill_switch_resume(text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.kill_switch_soft_pause(text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.kill_switch_soft_pause(text, text, uuid) TO authenticated;