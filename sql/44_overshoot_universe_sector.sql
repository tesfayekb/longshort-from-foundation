-- sql/44 — ACT-515(e) sector-ingest MIG (Turn 1 of 3)
-- Adds GICS-sector metadata columns to public.overshoot_universe to unlock the
-- ACT-515 (e) sector-concentration cap engine variant. Column-add only this
-- turn; FMP /stable/profile fetch + backfill land in Turns 2-3.
--
-- Per DEC-038 typed-absence + INC-71 fabrication-guard: sector remains NULL
-- until an ingest run stamps it with provenance (sector_source, sector_asof).
-- No cap enforcement engaged in this migration.

ALTER TABLE public.overshoot_universe
  ADD COLUMN IF NOT EXISTS gics_sector    text,
  ADD COLUMN IF NOT EXISTS sector_source  text,  -- 'fmp' | 'ishares' | 'manual'
  ADD COLUMN IF NOT EXISTS sector_asof    timestamptz;

-- Provenance sanity: if sector is populated, source + asof MUST both be present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'overshoot_universe_sector_provenance_chk'
  ) THEN
    ALTER TABLE public.overshoot_universe
      ADD CONSTRAINT overshoot_universe_sector_provenance_chk
      CHECK (
        gics_sector IS NULL
        OR (sector_source IS NOT NULL AND sector_asof IS NOT NULL)
      );
  END IF;
END $$;

-- Index for the sector-cap engine's per-sector notional roll-up at admit time.
CREATE INDEX IF NOT EXISTS idx_overshoot_universe_gics_sector
  ON public.overshoot_universe (gics_sector)
  WHERE gics_sector IS NOT NULL;

COMMENT ON COLUMN public.overshoot_universe.gics_sector IS
  'GICS sector label from external ingest (FMP primary, iShares cross-check). NULL until Turn-2/3 backfill lands. Consumed by ACT-515(e) sector-cap engine.';
COMMENT ON COLUMN public.overshoot_universe.sector_source IS
  'Provenance for gics_sector — fmp | ishares | manual. NULL iff gics_sector IS NULL.';
COMMENT ON COLUMN public.overshoot_universe.sector_asof IS
  'Wall-clock at ingest fetch. NULL iff gics_sector IS NULL. Callers stamp from injected clock — no in-migration NOW().';
