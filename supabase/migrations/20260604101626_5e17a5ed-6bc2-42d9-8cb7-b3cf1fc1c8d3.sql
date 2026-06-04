-- MIG-060 — FP-008.4 Commit 10 / #11 hygiene tail / DW-084
-- Add authoritative job_registry → handler-file mapping. The registry→handler linkage
-- is convention-only today (three non-uniform conventions: platform <id>→job-<id-dashed>;
-- longshort.<x>→longshort-<x-dashed> with non-clean suffixes; universe 4-rows-share-1-handler
-- via ?rule= dispatch; plus a script-dispatched replay chain with no edge handler). The
-- Gate-15 sentinel (scripts/check-handler-liveness-markers.ts) joins to this column to
-- catch the INC-39 seam class (enabled+scheduled job pointing at a NOT-FOR-LIVE / MOCK_*
-- handler) at CI time. Nullable: control rows + script-dispatched jobs have no handler file.

ALTER TABLE public.job_registry ADD COLUMN IF NOT EXISTS handler_path text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_registry_handler_path_check') THEN
    ALTER TABLE public.job_registry
      ADD CONSTRAINT job_registry_handler_path_check
      CHECK (handler_path IS NULL OR handler_path ~ '^supabase/functions/[a-z0-9-]+/index\.ts$');
  END IF;
END $$;

UPDATE public.job_registry SET handler_path = 'supabase/functions/job-health-check/index.ts' WHERE id = 'health_check';
UPDATE public.job_registry SET handler_path = 'supabase/functions/job-alert-evaluation/index.ts' WHERE id = 'alert_evaluation';
UPDATE public.job_registry SET handler_path = 'supabase/functions/job-metrics-aggregate/index.ts' WHERE id = 'metrics_aggregate';
UPDATE public.job_registry SET handler_path = 'supabase/functions/job-audit-cleanup/index.ts' WHERE id = 'audit_cleanup';
UPDATE public.job_registry SET handler_path = 'supabase/functions/longshort-universe-quarterly-refresh/index.ts' WHERE id = 'longshort.universe.quarterly_refresh';
UPDATE public.job_registry SET handler_path = 'supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts' WHERE id IN (
  'longshort.universe.hard_exclusion_refresh_3_3a',
  'longshort.universe.hard_exclusion_refresh_3_3b',
  'longshort.universe.hard_exclusion_refresh_3_3c',
  'longshort.universe.hard_exclusion_refresh_3_3e'
);
UPDATE public.job_registry SET handler_path = 'supabase/functions/longshort-reconciliation-tick/index.ts' WHERE id = 'longshort.reconciliation_periodic_sweep';
UPDATE public.job_registry SET handler_path = 'supabase/functions/longshort-reconciliation-liveness-check/index.ts' WHERE id = 'longshort.reconciliation_liveness_check';
-- replay_chain + control rows (__kill_switch__, __class_pause:*) intentionally left NULL (no handler file).

COMMENT ON COLUMN public.job_registry.handler_path IS
  'Authoritative dispatcher→handler-file mapping (repo-relative). NULL for script-dispatched (replay_chain) + control rows. Gate-15 sentinel joins to this to catch enabled+scheduled jobs pointing at NOT-FOR-LIVE/MOCK_ handlers. Per FP-008.4 Commit 10 / DW-084.';