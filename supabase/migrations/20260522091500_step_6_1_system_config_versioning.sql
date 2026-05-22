-- MIG-041 — FP-006 sub-step 6.1(e)
-- system_config.value_version column + auto-increment trigger per CROSSWIND §12.7 config versioning

ALTER TABLE public.system_config
  ADD COLUMN IF NOT EXISTS value_version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_system_config_value_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
    NEW.value_version = COALESCE(OLD.value_version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_config_value_version_bump ON public.system_config;
CREATE TRIGGER system_config_value_version_bump
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_system_config_value_version();

COMMENT ON COLUMN public.system_config.value_version IS 'FP-006 sub-step 6.1(e) — monotonic version counter incremented automatically on every value change. Enables optimistic concurrency control and replay determinism per CROSSWIND §12.7.';
