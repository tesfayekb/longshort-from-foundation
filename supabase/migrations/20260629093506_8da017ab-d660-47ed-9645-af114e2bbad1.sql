-- MIG-145 — DW-060 condition (3) / FP-062 sub-step 6I.3b
-- ARM-WITHOUT-FIRE re-enablement of the two reconciliation jobs.
--
-- Mirrors and reverses the deliberate disarm performed in MIG-058 (sweep) and
-- complements MIG-059 (liveness-check seed + reconciliation_events.fetcher_source).
-- Preconditions:
--   condition (1): ACT-384 replaced MOCK_BP_FETCHER/MOCK_POSITION_FETCHER in the
--                  longshort-reconciliation-tick handler with createLiveBrokerInterfaces.
--   condition (2): FP-008.4 Commit 9 + MIG-059 landed the two-invocation liveness rule
--                  (longshort-reconciliation-liveness-check fn + 7 tests + job seed).
-- Atomic ordering (FP-062-ADD-02 Amendment 3):
--   STEP 1 — watcher (liveness_check) enabled FIRST.
--   STEP 2 — periodic_sweep enabled SECOND.
--   Reverse order is a STOP-condition (re-opens the INC-39-class seam MIG-058 disarmed).
-- Arm-vs-fire boundary:
--   This migration ONLY flips public.job_registry.enabled. No cron.schedule(...) is
--   added here; neither function has a cron.job row yet. Firing is 6I.3c.
-- Idempotent: WHERE enabled=false guards make re-runs touch zero rows; the
-- post-flight assertion still passes.

DO $mig145$
DECLARE
  v_liveness_exists  boolean;
  v_fetcher_src_col  boolean;
  v_disabled_count   integer;
BEGIN
  -- 2a: liveness_check job row exists (seeded by MIG-059).
  SELECT EXISTS (
    SELECT 1 FROM public.job_registry
    WHERE id = 'longshort.reconciliation_liveness_check'
  ) INTO v_liveness_exists;
  IF NOT v_liveness_exists THEN
    RAISE EXCEPTION 'MIG-145 pre-flight: job_registry row longshort.reconciliation_liveness_check MISSING (condition 2 / MIG-059 not landed)';
  END IF;

  -- 2b: reconciliation_events.fetcher_source column exists (INC-40 / MIG-059).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'reconciliation_events'
      AND column_name  = 'fetcher_source'
  ) INTO v_fetcher_src_col;
  IF NOT v_fetcher_src_col THEN
    RAISE EXCEPTION 'MIG-145 pre-flight: reconciliation_events.fetcher_source column MISSING (MIG-059 not landed)';
  END IF;

  -- Precondition: BOTH target rows currently enabled=false.
  SELECT count(*) INTO v_disabled_count
  FROM public.job_registry
  WHERE id IN (
    'longshort.reconciliation_liveness_check',
    'longshort.reconciliation_periodic_sweep'
  )
    AND enabled = false;

  IF v_disabled_count <> 2 THEN
    RAISE EXCEPTION 'MIG-145 pre-flight: expected both reconciliation jobs enabled=false, found % disabled', v_disabled_count;
  END IF;
END
$mig145$;

-- STEP 1 — watcher FIRST (FP-062-ADD-02 Amendment 3).
UPDATE public.job_registry
   SET enabled    = true,
       updated_at = now()
 WHERE id      = 'longshort.reconciliation_liveness_check'
   AND enabled = false;

-- STEP 2 — periodic_sweep AFTER the watcher.
UPDATE public.job_registry
   SET enabled    = true,
       updated_at = now()
 WHERE id      = 'longshort.reconciliation_periodic_sweep'
   AND enabled = false;

-- POST-FLIGHT: mirror MIG-058's end-state assertion (both must be enabled=true).
DO $mig145_post$
DECLARE
  v_enabled_count integer;
BEGIN
  SELECT count(*) INTO v_enabled_count
  FROM public.job_registry
  WHERE id IN (
    'longshort.reconciliation_liveness_check',
    'longshort.reconciliation_periodic_sweep'
  )
    AND enabled = true;

  IF v_enabled_count <> 2 THEN
    RAISE EXCEPTION 'MIG-145 post-flight: expected both reconciliation jobs enabled=true, found % enabled', v_enabled_count;
  END IF;
END
$mig145_post$;