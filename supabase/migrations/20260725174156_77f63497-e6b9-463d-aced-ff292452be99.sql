ALTER TABLE public.overshoot_universe
  ADD COLUMN IF NOT EXISTS gics_sector    text,
  ADD COLUMN IF NOT EXISTS sector_source  text,
  ADD COLUMN IF NOT EXISTS sector_asof    timestamptz;

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

CREATE INDEX IF NOT EXISTS idx_overshoot_universe_gics_sector
  ON public.overshoot_universe (gics_sector)
  WHERE gics_sector IS NOT NULL;

COMMENT ON COLUMN public.overshoot_universe.gics_sector IS
  'GICS sector label from external ingest (FMP primary, iShares cross-check). NULL until Turn-2/3 backfill lands. Consumed by ACT-515(e) sector-cap engine.';
COMMENT ON COLUMN public.overshoot_universe.sector_source IS
  'Provenance for gics_sector — fmp | ishares | manual. NULL iff gics_sector IS NULL.';
COMMENT ON COLUMN public.overshoot_universe.sector_asof IS
  'Wall-clock at ingest fetch. NULL iff gics_sector IS NULL. Callers stamp from injected clock — no in-migration NOW().';