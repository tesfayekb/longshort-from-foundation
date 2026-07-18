-- ACT-554-a: source-labeling + epoch-block + coverage view for analyst_revision_observations.
-- Safety: backfill writes must carry source='fmp_historical_backfill_v1' AND as_of_date < 2026-06-29.
-- Live-feed rows (2026-06-29 onward) are labeled 'analyst_revision_drift_v1' and are the live path's territory.

ALTER TABLE public.analyst_revision_observations
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'analyst_revision_drift_v1';

-- Backfill epoch guard: enforced at row level, deferred-safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analyst_rev_obs_backfill_epoch_block'
  ) THEN
    ALTER TABLE public.analyst_revision_observations
      ADD CONSTRAINT analyst_rev_obs_backfill_epoch_block
      CHECK (
        source <> 'fmp_historical_backfill_v1'
        OR as_of_date < DATE '2026-06-29'
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS analyst_revision_observations_source_idx
  ON public.analyst_revision_observations (source);

-- Coverage-verify view (ACT-527-style): per-ticker counts + source split + first/last event dates.
CREATE OR REPLACE VIEW public.analyst_backfill_coverage AS
SELECT
  ticker,
  COUNT(*)                                                                   AS n_total,
  COUNT(*) FILTER (WHERE source = 'analyst_revision_drift_v1')               AS n_live,
  COUNT(*) FILTER (WHERE source = 'fmp_historical_backfill_v1')              AS n_backfill,
  MIN(as_of_date) FILTER (WHERE source = 'fmp_historical_backfill_v1')       AS backfill_min_date,
  MAX(as_of_date) FILTER (WHERE source = 'fmp_historical_backfill_v1')       AS backfill_max_date,
  MIN(as_of_date) FILTER (WHERE source = 'analyst_revision_drift_v1')        AS live_min_date,
  MAX(as_of_date) FILTER (WHERE source = 'analyst_revision_drift_v1')        AS live_max_date,
  MIN(focal_published_at) FILTER (WHERE source = 'fmp_historical_backfill_v1') AS backfill_first_event,
  MAX(focal_published_at) FILTER (WHERE source = 'fmp_historical_backfill_v1') AS backfill_last_event
FROM public.analyst_revision_observations
GROUP BY ticker;

GRANT SELECT ON public.analyst_backfill_coverage TO authenticated;
GRANT SELECT ON public.analyst_backfill_coverage TO service_role;

COMMENT ON COLUMN public.analyst_revision_observations.source IS
  'Row provenance. analyst_revision_drift_v1 = live daily-compute feed (2026-06-29+). fmp_historical_backfill_v1 = ACT-554-a one-shot backfill (< 2026-06-29 only, CHECK-enforced). Blast radius: research-only — never reaches the detector.';
COMMENT ON CONSTRAINT analyst_rev_obs_backfill_epoch_block ON public.analyst_revision_observations IS
  'ACT-554-a safety: backfill-labeled rows cannot land in the live-feed epoch (2026-06-29+). Byte-integrity of live rows is enforced at the DB layer.';
COMMENT ON VIEW public.analyst_backfill_coverage IS
  'ACT-554-a coverage verify. Per-ticker row counts, source split, and event-date span. Live-row count MUST be byte-identical pre/post backfill.';