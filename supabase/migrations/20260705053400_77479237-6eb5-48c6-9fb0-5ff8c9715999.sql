-- =============================================================================
-- ACT-469 — RLS permissive-policy tightening (corrective)
-- Live pg_policies census governs (supervisor's migration-file grep read
-- superseded history as current state — sql/13 was the prior corrective for
-- longshort_lots + longshort_audit_logs; those are already scoped and are
-- NOT re-dropped here). Operator ruling: Q1(a), Q2=YES.
--
-- Writes to overshoot_audit_logs come from three places, all service-role:
--   (1) engine edge functions overshoot-{detection,entry,exit}-run/*
--   (2) SECURITY DEFINER RPC overshoot_update_strategy_config (inserts its
--       own audit row inside the DEFINER body)
--   (3) the operator runbook token-mint uses the Lovable data-write tool
--       which is service-role keyed
-- No authenticated client INSERT path exists — dropping the permissive
-- INSERT policy removes the forgery vector without breaking any consumer.
-- =============================================================================

-- === §1 Forgery-vector fix ===================================================
DROP POLICY IF EXISTS overshoot_audit_logs_insert ON public.overshoot_audit_logs;

-- === §2 Broad-read policies with no client consumers =========================
-- grep-verified: no src/ .from('corporate_actions') / .from('feature_flags')
DROP POLICY IF EXISTS corporate_actions_authenticated_read ON public.corporate_actions;
DROP POLICY IF EXISTS feature_flags_read_policy            ON public.feature_flags;

-- === §3 kill_switches — REPLACE per Q1(a) ====================================
-- Consumers that must survive:
--   src/pages/admin/AdminKillSwitchPage.tsx:69   (superadmin)
--   src/features/longshort/hooks/useTradingStatus.ts:62  (longshort.view)
-- Safety surface: strategy operators must see breaker state.
DROP POLICY IF EXISTS kill_switches_read_policy ON public.kill_switches;

CREATE POLICY kill_switches_read_scoped
  ON public.kill_switches
  FOR SELECT
  TO authenticated
  USING (
    public.has_permission(auth.uid(), 'longshort.view')
    OR public.has_permission(auth.uid(), 'overshoot.view')
    OR public.is_superadmin(auth.uid())
  );

-- === §4 Functionless service-role permissive policies (20 tables) ============
-- service_role bypasses RLS; these are linter noise. Dropping does NOT
-- change engine behavior — engine functions authenticate with the
-- service-role key and always bypass RLS regardless of these rows.
DROP POLICY IF EXISTS "service role full access"                    ON public.analyst_revision_observations;
DROP POLICY IF EXISTS corporate_actions_service_role_all            ON public.corporate_actions;
DROP POLICY IF EXISTS iadq_service_role_all                         ON public.insider_accession_discovery_queue;
DROP POLICY IF EXISTS insider_form4_rows_service_role_all           ON public.insider_form4_rows;
DROP POLICY IF EXISTS longshort_lots_service_role_all               ON public.longshort_lots;
DROP POLICY IF EXISTS "service_role manages htb cache"              ON public.longshort_short_availability_cache;
DROP POLICY IF EXISTS "service role full access"                    ON public.news_attention_observations;
DROP POLICY IF EXISTS overshoot_detection_runs_service_all          ON public.overshoot_detection_runs;
DROP POLICY IF EXISTS overshoot_events_service_all                  ON public.overshoot_events;
DROP POLICY IF EXISTS overshoot_lots_service_all                    ON public.overshoot_lots;
DROP POLICY IF EXISTS overshoot_short_interest_service_all          ON public.overshoot_short_interest;
DROP POLICY IF EXISTS overshoot_strategy_config_service_all         ON public.overshoot_strategy_config;
DROP POLICY IF EXISTS overshoot_target_positions_service_all        ON public.overshoot_target_positions;
DROP POLICY IF EXISTS "service role full access"                    ON public.pead_consensus_observations;
DROP POLICY IF EXISTS reversal_ungated_observations_service_role_all ON public.reversal_ungated_observations;
DROP POLICY IF EXISTS "service role full access"                    ON public.short_etb_state_history;
DROP POLICY IF EXISTS short_interest_alpha_shadow_service_role_all  ON public.short_interest_alpha_shadow;
DROP POLICY IF EXISTS "service role full access"                    ON public.short_interest_days_to_cover;
DROP POLICY IF EXISTS wash_sale_events_service_role_all             ON public.wash_sale_events;
DROP POLICY IF EXISTS wash_sale_pending_review_service_role_all     ON public.wash_sale_pending_review;
