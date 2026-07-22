-- MIG-166: DEC-504-4 wire — persist sleeve posture on every detection run.
-- Load-bearing state gets a queryable column (§22.5.1; ACT-563 precedent).
-- Canonical shape (documented in code, not enforced by CHECK — jsonb schema
-- evolution stays cheap):
--   {
--     "active": boolean,                       -- si_stale_active
--     "long_capacity": integer,                -- 40 stale | 36 baseline
--     "short_capacity": integer,               -- 0  stale | 4  baseline
--     "long_allocation_pct": number,           -- 1.00 stale | 0.90 baseline
--     "short_allocation_pct": number,          -- 0.00 stale | 0.10 baseline
--     "reason": "si_stale_active" | "baseline",
--     "freshest_si_as_of_date": "YYYY-MM-DD" | null,
--     "transition_audit_id": uuid | null       -- id of the engaged/disengaged
--                                              --   audit row emitted THIS run;
--                                              --   null when no edge fired
--                                              --   (idempotent no-op)
--   }
ALTER TABLE public.overshoot_detection_runs
  ADD COLUMN IF NOT EXISTS sleeves jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.overshoot_detection_runs.sleeves IS
  'DEC-504-4 sleeve posture snapshot for this run. Canonical shape: {active, long_capacity, short_capacity, long_allocation_pct, short_allocation_pct, reason, freshest_si_as_of_date, transition_audit_id}. Empty object on historical (pre-MIG-166) rows.';