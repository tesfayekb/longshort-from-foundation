-- MIG-108: DW-118 remediation — flip 3 reconciliation_events aggregation views to security_invoker=true
-- so the longshort.view RLS gate on the base reconciliation_events table is enforced against the caller,
-- not the view owner (ERROR-0010 security_definer_view class).
-- NO change to view definitions, grants, base-table RLS, or compare_reconciliation_baseline.

ALTER VIEW public.reconciliation_events_daily_agg   SET (security_invoker = true);
ALTER VIEW public.reconciliation_events_weekly_agg  SET (security_invoker = true);
ALTER VIEW public.reconciliation_events_monthly_agg SET (security_invoker = true);