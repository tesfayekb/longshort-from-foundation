-- MIG-065 — FP-009 Bucket C Commit C1 / Phase 2.1 production wiring
--
-- signal_compute_log: per-run telemetry for signal orchestrator invocations.
-- Parallel to universe_refresh_log; each row records one orchestrator.run()
-- invocation with its outcome, universe size, persisted count, and per-reason
-- skip counts.
--
-- RLS: MIG-057 discipline — 1 PERMISSIVE SELECT-own + 3 RESTRICTIVE deny-writes.

CREATE TABLE IF NOT EXISTS public.signal_compute_log (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id text NOT NULL,
  as_of_date date NOT NULL,
  outcome text NOT NULL,
  universe_size integer NOT NULL,
  persisted_count integer NOT NULL,
  skip_counts jsonb,
  failure_reason text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  operator_id uuid NOT NULL,
  CONSTRAINT signal_compute_log_outcome_check
    CHECK (outcome IN ('completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_signal_compute_log_operator_signal_date
  ON public.signal_compute_log (operator_id, signal_id, as_of_date DESC);

CREATE INDEX IF NOT EXISTS idx_signal_compute_log_signal_outcome
  ON public.signal_compute_log (signal_id, outcome);

GRANT SELECT ON public.signal_compute_log TO authenticated;
GRANT ALL ON public.signal_compute_log TO service_role;

ALTER TABLE public.signal_compute_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_compute_log_select_own ON public.signal_compute_log;
CREATE POLICY signal_compute_log_select_own ON public.signal_compute_log
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (operator_id = auth.uid());

DROP POLICY IF EXISTS signal_compute_log_deny_authenticated_insert ON public.signal_compute_log;
CREATE POLICY signal_compute_log_deny_authenticated_insert ON public.signal_compute_log
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS signal_compute_log_deny_authenticated_update ON public.signal_compute_log;
CREATE POLICY signal_compute_log_deny_authenticated_update ON public.signal_compute_log
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS signal_compute_log_deny_authenticated_delete ON public.signal_compute_log;
CREATE POLICY signal_compute_log_deny_authenticated_delete ON public.signal_compute_log
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE public.signal_compute_log IS
  'Per-signal-compute-run telemetry. Parallel to universe_refresh_log. RLS: SELECT-own + RESTRICTIVE deny-writes per MIG-057 discipline. Confirmed by FP-009 Bucket C Commit C1.';
