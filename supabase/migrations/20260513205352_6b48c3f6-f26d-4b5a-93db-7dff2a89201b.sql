
-- PLAN-AUTH-MFA-POLICY-001: Configurable per-panel MFA enforcement + per-user MFA self-preference
-- DEC-028 (FP-002 approved)

-- 1. Seed the per-panel MFA enforcement policy row.
--    Defaults to admin='optional' for the current (development) environment so devs
--    are not forced into TOTP-every-login. Production deployment SOP must set this
--    to 'required' before go-live (documented in docs/08-planning/preproduction-checklist.md).
--    Schema is open-ended: future panels (trading, finance, ops) just add a key.
INSERT INTO public.system_config (key, value, description)
VALUES (
  'mfa_enforcement_policy',
  jsonb_build_object(
    'version', 1,
    'panels', jsonb_build_object('admin', 'optional'),
    'notes', 'Panel-level MFA enrollment gate. Values: required | optional. Does NOT affect Supabase aal1->aal2 challenge for already-enrolled users.'
  ),
  'Per-panel MFA enrollment policy controlled by superadmin via /admin/security'
)
ON CONFLICT (key) DO NOTHING;

-- 2. Per-user MFA self-preference.
--    When true, the user is redirected to /mfa-enroll on any authenticated route
--    if they have no MFA factor. User-controlled in /settings/security.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS require_mfa_for_self boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.require_mfa_for_self IS
  'User-chosen preference: when true, the user is forced to enroll MFA before accessing any authenticated page. User-controlled only — superadmin policy cannot toggle this.';
