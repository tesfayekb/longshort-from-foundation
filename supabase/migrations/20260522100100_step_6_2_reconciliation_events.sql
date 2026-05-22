-- MIG-043 — FP-006 sub-step 6.2(b)
-- reconciliation_events table per CROSSWIND §11.0.10 verbatim + DEC-034.1 clause (6).
-- Standalone operator_id column per DEC-031 F-2; event_id is natural PK per §11.0.10 verbatim.
-- Append-only INSERT-only RLS; resolved_at + resolution_pr_ref update via governed RPC only
-- (RPC not built in 6.2; UPDATE remains blocked until that RPC lands in a future sub-step).

DO $$ BEGIN
  CREATE TYPE reconciliation_outcome AS ENUM (
    'false_positive_within_tolerance',
    'failure_handled',
    'failure_escalated',
    'expected_divergence_handled',
    'system_bug'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reconciliation_tier AS ENUM (
    'strong_plus',
    'strong',
    'medium',
    'weak'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.reconciliation_events (
  event_id            uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id         uuid                     NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  ts                  timestamptz              NOT NULL,
  engine_version      text                     NOT NULL,
  call_name           text                     NOT NULL,
  tier                reconciliation_tier      NOT NULL,
  symbol              text,
  expected_value      jsonb,
  observed_value      jsonb,
  divergence          jsonb,
  tolerance           jsonb,
  outcome             reconciliation_outcome   NOT NULL,
  failure_action      text,
  phase_0b_run_id     uuid,
  pr_evidence_ref     text,
  notes               text,
  resolved_at         timestamptz,
  resolution_pr_ref   text
);

ALTER TABLE public.reconciliation_events ENABLE ROW LEVEL SECURITY;

-- Read policy: authenticated users with longshort.view can SELECT
CREATE POLICY reconciliation_events_read_policy ON public.reconciliation_events
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

-- Write policy: append-only via service role; no direct user writes.
-- The engine writes through supabaseAdmin (service-role bypasses RLS for INSERT).
-- No UPDATE/DELETE policies exist — events are immutable per §11.0.10 retention discipline.
-- resolved_at + resolution_pr_ref updates land in a future sub-step via governed RPC.
CREATE POLICY reconciliation_events_no_direct_write_policy ON public.reconciliation_events
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Indices for query patterns:
-- (a) firing-diff query: new events since deploy time (used by sub-step 6.4 evidence tooling)
CREATE INDEX IF NOT EXISTS idx_reconciliation_events_ts_call
  ON public.reconciliation_events (ts DESC, call_name);

-- (b) rolling-window state rebuild (used by rebuildStateFromEvents per DEC-034.1 clause (3))
CREATE INDEX IF NOT EXISTS idx_reconciliation_events_state_rebuild
  ON public.reconciliation_events (operator_id, symbol, call_name, ts DESC);

-- (c) Phase 0B exit-gate analysis (used by sub-step 6.9 quietness evidencing)
CREATE INDEX IF NOT EXISTS idx_reconciliation_events_phase_0b
  ON public.reconciliation_events (phase_0b_run_id, outcome) WHERE phase_0b_run_id IS NOT NULL;

-- (d) Unresolved system_bug events (operator action queue)
CREATE INDEX IF NOT EXISTS idx_reconciliation_events_unresolved_bugs
  ON public.reconciliation_events (call_name, ts DESC) WHERE outcome = 'system_bug' AND resolved_at IS NULL;

COMMENT ON TABLE public.reconciliation_events IS 'FP-006 sub-step 6.2(b) — reconciliation engine event log per CROSSWIND §11.0.10 verbatim + DEC-034.1 clause (6). Append-only via service role through engine entry point. Every verify_* invocation writes one row regardless of outcome (per DEC-034.1 clause (1) hybrid architecture). Retention: indefinite for strong_plus / strong tier; 12 months for medium tier per §11.0.10.';
