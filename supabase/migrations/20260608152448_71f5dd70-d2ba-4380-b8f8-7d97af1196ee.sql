-- MIG-075 — FP-038 / Signal Registry + All-Signals overview.
--
-- Index table listing every signal (§4.4.1–§4.4.9) + the combiner composite.
-- Status is STATIC-seeded — each future signal's FP flips its own row
-- planned → live in the same migration that arms its compute job (per FP-040
-- precedent + signal-FP template). No auto-status-detection in v1 (YAGNI).
--
-- RLS model — permission-scoped (NOT operator-scoped). Matches the
-- signal_observations / signal_compute_log / reconciliation_state read
-- surface so the table is non-blank for any user with `longshort.view`
-- (DEC-042: operator-scoped on system-wide tables is a footgun).

CREATE TABLE IF NOT EXISTS public.signal_registry (
  signal_id         text PRIMARY KEY,
  signal_num        integer,
  display_name      text NOT NULL,
  spec_ref          text,
  cadence           text,
  status            text NOT NULL CHECK (status IN ('live','planned','deprecated')),
  criticality       text CHECK (criticality IN ('critical','non_critical')),
  stale_after_hours integer,
  planned_phase     text,
  job_registry_id   text,
  display_order     integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.signal_registry TO authenticated;
GRANT ALL    ON public.signal_registry TO service_role;

ALTER TABLE public.signal_registry ENABLE ROW LEVEL SECURITY;

-- Permissive read: anyone with `longshort.view` sees all rows.
CREATE POLICY "signal_registry_read_longshort_view"
  ON public.signal_registry
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

-- Restrictive deny-writes: writes are migration/governance-only.
CREATE POLICY "signal_registry_deny_insert"
  ON public.signal_registry AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "signal_registry_deny_update"
  ON public.signal_registry AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "signal_registry_deny_delete"
  ON public.signal_registry AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

-- updated_at trigger reuses the platform helper.
DROP TRIGGER IF EXISTS trg_signal_registry_updated_at ON public.signal_registry;
CREATE TRIGGER trg_signal_registry_updated_at
  BEFORE UPDATE ON public.signal_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: 2 live signals + 7 planned signals + 1 planned composite.
-- §4.4 values are read verbatim from CROSSWIND_SPEC §4.4.1–§4.4.9.
-- Daily-cadence stale_after_hours=36 aligns with longshort-signal-monitor
-- STALE_HOURS_WEEKDAY (Monday override = 72 handled by monitor at read-time).
INSERT INTO public.signal_registry
  (signal_id, signal_num, display_name, spec_ref, cadence, status,
   criticality, stale_after_hours, planned_phase, job_registry_id, display_order)
VALUES
  ('cross_sectional_momentum_12_1', 6, 'Cross-sectional momentum (12-1)',
   '§4.4.1', 'daily', 'live', 'critical', 36, NULL,
   'longshort.momentum.compute', 6),
  ('short_term_reversal_1w', 7, 'Short-term reversal (1-week)',
   '§4.4.2', 'daily', 'live', 'critical', 36, NULL,
   'longshort.reversal.compute', 7),
  ('short_interest_change_30d', 5, 'Short interest changes (30-day)',
   '§4.4.3', 'twice-monthly', 'planned', 'non_critical', NULL,
   'Phase 2.3', NULL, 5),
  ('insider_transactions_90d', 4, 'Insider transactions (90-day, 14-day half-life)',
   '§4.4.4', 'intraday (30 min)', 'planned', 'non_critical', NULL,
   'Phase 2.4', NULL, 4),
  ('analyst_revision_drift', 1, 'Analyst revision drift',
   '§4.4.5', 'intraday (15 min)', 'planned', 'non_critical', NULL,
   'Phase 2.5', NULL, 1),
  ('pead', 2, 'PEAD (post-earnings drift)',
   '§4.4.6', 'event-triggered', 'planned', 'non_critical', NULL,
   'Phase 2.6', NULL, 2),
  ('options_flow_imbalance_5d', 3, 'Options flow imbalance',
   '§4.4.7', 'intraday (5 min)', 'planned', 'non_critical', NULL,
   'Phase 2.7', NULL, 3),
  ('news_sentiment_7d', 8, 'News sentiment momentum (7-day)',
   '§4.4.8', 'intraday (5 min)', 'planned', 'non_critical', NULL,
   'Phase 2.8', NULL, 8),
  ('active_catalyst_flag', 9, 'Active catalyst flag',
   '§4.4.9', 'intraday (5 min)', 'planned', 'non_critical', NULL,
   'Phase 2.9', NULL, 9),
  ('composite', NULL, 'Composite (combiner output)',
   '§6', 'derived', 'planned', NULL, NULL,
   'Phase 3', NULL, 99)
ON CONFLICT (signal_id) DO NOTHING;