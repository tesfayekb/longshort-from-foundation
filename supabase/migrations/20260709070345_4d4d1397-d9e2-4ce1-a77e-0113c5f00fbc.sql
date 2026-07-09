-- ACT-494 item (2) root-cause fix.
--
-- ROOT CAUSE (evidence-first, per operator directive):
--   • Table:   public.overshoot_universe
--   • Policy:  overshoot_universe_deny_authenticated_write
--   • Shape:   permissive='RESTRICTIVE', cmd='ALL', roles='{authenticated}', qual='false'
--   • Effect:  RESTRICTIVE FOR ALL with USING(false) is AND-combined with every
--              other policy for every command INCLUDING SELECT. Result: authenticated
--              SELECTs return zero rows even for superadmins.
--   • Symptom: /trading/overshoot/universe renders Active=0 / SI coverage=0 while
--              the DB holds 839 active rows.
--
-- The sibling table overshoot_short_interest carries an equivalent-INTENT policy
-- (overshoot_short_interest_no_direct_write) but registered as PERMISSIVE, so it
-- is OR-combined and is harmless for SELECT — that is why the Overview page's
-- SI-freshness card kept working while the Universe page went dark.
--
-- FIX: replace the FOR ALL RESTRICTIVE deny with three RESTRICTIVE policies
-- scoped to INSERT/UPDATE/DELETE only, preserving the original write-denial
-- intent while unblocking read paths gated by the existing view policy
-- (overshoot_universe_view_read → has_permission(auth.uid(),'overshoot.view')).
-- ZERO change to write semantics. ZERO change to any engine/detector code or
-- fixtures. LIVE-PRICE display boundary unchanged.

DROP POLICY IF EXISTS overshoot_universe_deny_authenticated_write ON public.overshoot_universe;

CREATE POLICY overshoot_universe_deny_authenticated_insert
  ON public.overshoot_universe
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY overshoot_universe_deny_authenticated_update
  ON public.overshoot_universe
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY overshoot_universe_deny_authenticated_delete
  ON public.overshoot_universe
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);