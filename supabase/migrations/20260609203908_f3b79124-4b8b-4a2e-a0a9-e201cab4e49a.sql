-- MIG-082 — FP-045 Phase 1 — Generalized cursor-drain queue-worker tables (DEC-047)
--
-- Four tables backing the generalized queue-worker engine that resolves the
-- rate-capped signal class (PEAD / FP-044 reshell; options-flow / FP-043 revival;
-- future feed-signals whose universe × vendor-cap exceeds the 150s HTTP wall and
-- the ~400s Pro background-task budget). Generalized per signal_id — one table
-- set, NOT per-signal tables — so each new rate-capped signal is a config
-- registration + cron rows, never a schema migration.
--
-- Per-run scoping via run_id lets manual + cron runs coexist; the orphan-sweeper
-- (FP-045 Phase 2) handles staging TTL, so no separate TTL column / cron row.
--
-- RLS pattern: READ via has_permission(auth.uid(), 'longshort.view') — matches
-- signal_observations / signal_compute_log / universe_membership / longshort_audit_logs
-- (DEC-031 read-surface convention; MIG-072 unified the family). WRITE blocked
-- for authenticated via RESTRICTIVE deny-{insert,update,delete}; service-role
-- writes only (the queue-worker engine).
--
-- skip_reason values mirror the SignalSkipReason enum (DEC-053) — enforced
-- application-side, stored as text here (same pattern as signal_compute_log
-- skip_counts jsonb keys; no DB-side CHECK so the FP-041 lesson — widening the
-- enum without same-commit DB CHECK update — does not recur).

-- ────────────────────────────────────────────────────────────────────────────
-- 1) signal_queue_runs — one row per queue run
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_queue_runs (
  run_id          uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id       text NOT NULL,
  operator_id     uuid NOT NULL,
  as_of_date      date NOT NULL,
  status          text NOT NULL,
  universe_size   integer NOT NULL,
  heartbeat_at    timestamptz NOT NULL DEFAULT now(),
  failure_reason  text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  finalized_at    timestamptz,
  CONSTRAINT signal_queue_runs_status_check
    CHECK (status IN ('running', 'finalizing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_signal_queue_runs_signal_status_heartbeat
  ON public.signal_queue_runs (signal_id, status, heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_signal_queue_runs_signal_asof
  ON public.signal_queue_runs (signal_id, as_of_date DESC);

GRANT SELECT ON public.signal_queue_runs TO authenticated;
GRANT ALL    ON public.signal_queue_runs TO service_role;

ALTER TABLE public.signal_queue_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_queue_runs_longshort_view_read ON public.signal_queue_runs;
CREATE POLICY signal_queue_runs_longshort_view_read
  ON public.signal_queue_runs
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS signal_queue_runs_deny_authenticated_insert ON public.signal_queue_runs;
CREATE POLICY signal_queue_runs_deny_authenticated_insert
  ON public.signal_queue_runs
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_runs_deny_authenticated_update ON public.signal_queue_runs;
CREATE POLICY signal_queue_runs_deny_authenticated_update
  ON public.signal_queue_runs
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_runs_deny_authenticated_delete ON public.signal_queue_runs;
CREATE POLICY signal_queue_runs_deny_authenticated_delete
  ON public.signal_queue_runs
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

COMMENT ON TABLE public.signal_queue_runs IS
  'FP-045 / MIG-082 / DEC-047. One row per cursor-drain queue run (signal_id-generalized). Status lifecycle: running -> finalizing -> completed | failed (orphan-sweeper CASes stale heartbeats to failed). Read via longshort.view; writes service-role only.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) signal_queue_cursor — unclaimed work items per run
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_queue_cursor (
  run_id        uuid NOT NULL REFERENCES public.signal_queue_runs(run_id) ON DELETE CASCADE,
  signal_id     text NOT NULL,
  ticker        text NOT NULL,
  gics_sector   text,
  claimed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ticker)
);

-- Partial index for the slice-worker claim query: WHERE claimed_at IS NULL ORDER BY ticker
CREATE INDEX IF NOT EXISTS idx_signal_queue_cursor_unclaimed
  ON public.signal_queue_cursor (run_id, ticker)
  WHERE claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_signal_queue_cursor_signal
  ON public.signal_queue_cursor (signal_id, run_id);

GRANT SELECT ON public.signal_queue_cursor TO authenticated;
GRANT ALL    ON public.signal_queue_cursor TO service_role;

ALTER TABLE public.signal_queue_cursor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_queue_cursor_longshort_view_read ON public.signal_queue_cursor;
CREATE POLICY signal_queue_cursor_longshort_view_read
  ON public.signal_queue_cursor
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS signal_queue_cursor_deny_authenticated_insert ON public.signal_queue_cursor;
CREATE POLICY signal_queue_cursor_deny_authenticated_insert
  ON public.signal_queue_cursor
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_cursor_deny_authenticated_update ON public.signal_queue_cursor;
CREATE POLICY signal_queue_cursor_deny_authenticated_update
  ON public.signal_queue_cursor
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_cursor_deny_authenticated_delete ON public.signal_queue_cursor;
CREATE POLICY signal_queue_cursor_deny_authenticated_delete
  ON public.signal_queue_cursor
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE public.signal_queue_cursor IS
  'FP-045 / MIG-082 / DEC-047. Unclaimed ticker work items per queue run. Slice-worker claims rows via UPDATE ... WHERE ctid IN (SELECT ctid ... WHERE claimed_at IS NULL ORDER BY ticker LIMIT $N FOR UPDATE SKIP LOCKED), then DELETEs them after the staging/skip write. Read via longshort.view; writes service-role only.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) signal_queue_staging — per-ticker raw signals awaiting finalizer
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_queue_staging (
  run_id        uuid NOT NULL REFERENCES public.signal_queue_runs(run_id) ON DELETE CASCADE,
  signal_id     text NOT NULL,
  ticker        text NOT NULL,
  gics_sector   text,
  raw_signal    double precision NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_signal_queue_staging_run
  ON public.signal_queue_staging (run_id);

CREATE INDEX IF NOT EXISTS idx_signal_queue_staging_signal
  ON public.signal_queue_staging (signal_id, run_id);

GRANT SELECT ON public.signal_queue_staging TO authenticated;
GRANT ALL    ON public.signal_queue_staging TO service_role;

ALTER TABLE public.signal_queue_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_queue_staging_longshort_view_read ON public.signal_queue_staging;
CREATE POLICY signal_queue_staging_longshort_view_read
  ON public.signal_queue_staging
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS signal_queue_staging_deny_authenticated_insert ON public.signal_queue_staging;
CREATE POLICY signal_queue_staging_deny_authenticated_insert
  ON public.signal_queue_staging
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_staging_deny_authenticated_update ON public.signal_queue_staging;
CREATE POLICY signal_queue_staging_deny_authenticated_update
  ON public.signal_queue_staging
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_staging_deny_authenticated_delete ON public.signal_queue_staging;
CREATE POLICY signal_queue_staging_deny_authenticated_delete
  ON public.signal_queue_staging
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE public.signal_queue_staging IS
  'FP-045 / MIG-082 / DEC-047. Per-ticker raw signal values awaiting the finalizer''s full-universe z-score aggregation barrier (z-score ONLY after every cursor row resolved, never partial). Per-run-scoped via run_id; orphan-sweeper handles TTL. Read via longshort.view; writes service-role only.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) signal_queue_skips — typed skip records per run/ticker (DEC-053)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.signal_queue_skips (
  run_id        uuid NOT NULL REFERENCES public.signal_queue_runs(run_id) ON DELETE CASCADE,
  signal_id     text NOT NULL,
  ticker        text NOT NULL,
  skip_reason   text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_signal_queue_skips_run_reason
  ON public.signal_queue_skips (run_id, skip_reason);

CREATE INDEX IF NOT EXISTS idx_signal_queue_skips_signal
  ON public.signal_queue_skips (signal_id, run_id);

GRANT SELECT ON public.signal_queue_skips TO authenticated;
GRANT ALL    ON public.signal_queue_skips TO service_role;

ALTER TABLE public.signal_queue_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_queue_skips_longshort_view_read ON public.signal_queue_skips;
CREATE POLICY signal_queue_skips_longshort_view_read
  ON public.signal_queue_skips
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS signal_queue_skips_deny_authenticated_insert ON public.signal_queue_skips;
CREATE POLICY signal_queue_skips_deny_authenticated_insert
  ON public.signal_queue_skips
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_skips_deny_authenticated_update ON public.signal_queue_skips;
CREATE POLICY signal_queue_skips_deny_authenticated_update
  ON public.signal_queue_skips
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_skips_deny_authenticated_delete ON public.signal_queue_skips;
CREATE POLICY signal_queue_skips_deny_authenticated_delete
  ON public.signal_queue_skips
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON TABLE public.signal_queue_skips IS
  'FP-045 / MIG-082 / DEC-047 / DEC-053. Typed skip records (skip_reason mirrors SignalSkipReason enum: insufficient_history, fetch_error, zero_dispersion, missing_dependency, vendor_no_data, etc. — application-enforced, not CHECK-constrained, to avoid the FP-041 enum-widening lesson). Fed into the finalizer''s skip_counts payload to persistSignalComputeLog. Read via longshort.view; writes service-role only.';