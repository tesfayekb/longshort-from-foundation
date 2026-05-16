-- Step 4: Trading Panel Foundation Infrastructure
-- Authorized by PLAN-TRADING-001 / DEC-030 (scope expansion) + DEC-031 (architectural pattern)
-- Workstream: Step 4 (post Step 3.6 consistency cleanup merged at d25b74f)
--
-- Changes:
-- (1) Seed `trading.access` permission. NO role grants — per DEC-031 sub-point 10,
--     admin and user roles do NOT receive trading.access by default. Superadmin
--     inherits all permissions per existing RBAC. Trader-class roles are created
--     on-demand by admins after deployment via the dynamic-role admin UI.
-- (2) Extend `mfa_enforcement_policy.panels` to include `trading: 'optional'` (dev
--     seed). Production deployment SOP (preproduction-checklist.md) will set
--     `panels.trading = 'required'` before going live, mirroring the admin pattern.
--
-- Idempotency: INSERT uses ON CONFLICT DO NOTHING; UPDATE uses jsonb existence
-- guard. Both are safe to re-run.
-- Reversibility: rollback requires manual DELETE + jsonb_set NULL operations,
-- not part of forward migrations.

-- (1) Permission seed
INSERT INTO public.permissions (key, description) VALUES
  (
    'trading.access',
    'Gates access to the entire trading panel (/trading/*). Required by TradingLayout before any strategy sub-route is reachable. Analogous to admin.access for the admin panel. Per DEC-031, admin and user roles do NOT receive this by default; superadmin inherits all; trader-class roles are created on-demand by admins.'
  )
ON CONFLICT (key) DO NOTHING;

-- (2) Extend mfa_enforcement_policy.panels with trading: 'optional'
-- jsonb_set with create_missing = true (4th arg) adds the key without
-- replacing the existing panels object or version field.
UPDATE public.system_config
SET
  value      = jsonb_set(value, '{panels,trading}', '"optional"'::jsonb, true),
  updated_at = now()
WHERE key = 'mfa_enforcement_policy'
  AND NOT (value -> 'panels' ? 'trading');
