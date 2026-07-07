-- MIG-157 (FP-069 W3.8 T3b / ACT-480) — additive overshoot_entry_runs table
-- for entry-cron persistence + regime governor signal-context capture.
-- Idempotent: safe to re-run. RLS enabled; no policies added this migration
-- (service_role writes/reads only; a scoped operator read policy is a
-- follow-up when the operator console consumes the table).

CREATE TABLE IF NOT EXISTS public.overshoot_entry_runs (
  run_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date          date NOT NULL,
  detection_run_id      uuid NULL,
  outcome               text NOT NULL,
  targets_loaded        integer NOT NULL DEFAULT 0,
  orders_submitted      integer NOT NULL DEFAULT 0,
  correlation_id        text NULL,
  git_sha               text NULL,
  regime                text NULL,
  regime_signal_context jsonb NULL,
  dry_run               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Additive columns for the create-if-absent path (idempotent).
ALTER TABLE public.overshoot_entry_runs
  ADD COLUMN IF NOT EXISTS regime                text NULL,
  ADD COLUMN IF NOT EXISTS regime_signal_context jsonb NULL;

-- Standard GRANT block (public schema needs explicit grants for the Data API).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overshoot_entry_runs TO authenticated;
GRANT ALL ON public.overshoot_entry_runs TO service_role;

-- RLS on. No policies this migration — service_role bypasses RLS; a scoped
-- read policy for the operator console lands with the T4 console read work.
ALTER TABLE public.overshoot_entry_runs ENABLE ROW LEVEL SECURITY;

-- Index the two query surfaces we already know: recent runs by session
-- (dashboard / audit joins) and by detection linkage (W5 slicing joins).
CREATE INDEX IF NOT EXISTS overshoot_entry_runs_session_date_idx
  ON public.overshoot_entry_runs (session_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS overshoot_entry_runs_detection_run_id_idx
  ON public.overshoot_entry_runs (detection_run_id);
