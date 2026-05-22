-- MIG-042 — FP-006 sub-step 6.2(a)
-- longshort_reconciliation_state table per DEC-034.1 clause (5) verbatim schema.
-- State-as-projection per DEC-034.1 clause (2): this surface is a CACHE of derived facts;
-- the authoritative log is reconciliation_events (MIG-043). The contract: if this table is
-- wiped, rebuildStateFromEvents() over the prior rolling-hour window must produce the same
-- state values (subject only to events arriving after the wipe).
--
-- Standalone operator_id column with default UUID per DEC-031 sub-point 5 / F-2 + MIG-038 precedent.
-- Composite PK (operator_id, symbol, call_name) per DEC-034.1 clause (5) verbatim.

CREATE TABLE IF NOT EXISTS public.longshort_reconciliation_state (
  operator_id              uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  symbol                   text        NOT NULL,
  call_name                text        NOT NULL,
  rolling_window_count     integer     NOT NULL DEFAULT 0,
  rolling_window_start     timestamptz NOT NULL,
  last_firing_ts           timestamptz,
  cooldown_until           timestamptz,
  escalation_active        boolean     NOT NULL DEFAULT false,
  escalation_count_24h     integer     NOT NULL DEFAULT 0,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, symbol, call_name)
);

ALTER TABLE public.longshort_reconciliation_state ENABLE ROW LEVEL SECURITY;

-- Read policy: authenticated users with longshort.view can SELECT (operational visibility)
CREATE POLICY longshort_reconciliation_state_read_policy ON public.longshort_reconciliation_state
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

-- Write policy: ONLY service-role through the engine entry point. No direct INSERT/UPDATE
-- from authenticated user surface. Service-role bypasses RLS via supabaseAdmin client.
CREATE POLICY longshort_reconciliation_state_no_direct_write_policy ON public.longshort_reconciliation_state
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Index for rolling-window query (per DEC-034.1 clause (3) <5s rebuild budget)
CREATE INDEX IF NOT EXISTS idx_longshort_reconciliation_state_operator
  ON public.longshort_reconciliation_state (operator_id, updated_at DESC);

COMMENT ON TABLE public.longshort_reconciliation_state IS 'FP-006 sub-step 6.2(a) — reconciliation engine state surface per DEC-034.1 clause (5). State-as-projection contract per clause (2): authoritative log is reconciliation_events; this table is a cache of derived facts rebuildable via rebuildStateFromEvents() within <5s on rolling-hour window per clause (3).';
