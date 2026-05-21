-- FP-005 Step 5.2: Long-Short RBAC Permission Seed
-- Authorized by PLAN-TRADING-001-LONGSHORT-001 / DEC-031 (architectural pattern + sub-point 3 two-segment + sub-point 10 no-default-grants) + DEC-032 (FP-005 bootstrap scope lock; clause 7 forbids longshort.execute)
-- Workstream: Step 5.2 (post Step 5.4 T1 scaffold merged at 67bf6ba)
--
-- Changes:
-- (1) Seed `longshort.view` permission (operational; read-only dashboard access).
-- (2) Seed `longshort.manage` permission (admin-critical; non-destructive configuration).
--
-- Explicitly NOT seeded: `longshort.execute` — deferred to FP-006 per DEC-032 clause 7.
--
-- NO role grants — per DEC-031 sub-point 10, admin and user roles do NOT receive
-- <strategy>.* permissions by default. Superadmin inherits all permissions via
-- existing RBAC. Trader-class roles are admin-on-demand after deployment.
--
-- Idempotency: INSERT uses ON CONFLICT (key) DO NOTHING. Safe to re-run.
-- Reversibility: rollback requires manual DELETE; not part of forward migrations.

INSERT INTO public.permissions (key, description) VALUES
  (
    'longshort.view',
    'Gates read-only view of the long-short strategy dashboard at /trading/longshort and its sub-routes. Required by LongShortDashboardPage (Step 5.5) before any long-short content renders. Two-segment per DEC-031 sub-point 3. Depends on trading.access (panel outer gate).'
  ),
  (
    'longshort.manage',
    'Gates non-destructive management actions on long-short strategy configuration (enable/disable, parameter tuning, capital allocation knobs — surface lands in FP-006). At Step 5.2 the permission is seeded; consuming code lands in FP-006. Does NOT permit order execution — that requires longshort.execute (deferred to FP-006 per DEC-032 clause 7). Two-segment per DEC-031 sub-point 3.'
  )
ON CONFLICT (key) DO NOTHING;
