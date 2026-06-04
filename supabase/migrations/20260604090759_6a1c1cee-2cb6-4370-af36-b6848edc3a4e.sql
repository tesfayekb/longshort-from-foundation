-- MIG-058 — FP-008.4 Commit 8 / #11 opening
-- Disarm longshort.reconciliation_periodic_sweep: set enabled=false.
--
-- WHY: MIG-045 set enabled=true on the rationale "verifier registry complete +
-- dispatch function exists." That conflated REGISTRY-readiness with HANDLER-readiness.
-- The handler (longshort-reconciliation-tick/index.ts) runs on MOCK fetchers
-- (MOCK_BP_FETCHER -> constant $100k; MOCK_POSITION_FETCHER -> null) and is explicitly
-- marked "NOT FOR LIVE INVOCATION" (FP-008.4 Commit 7). Enabling a system_critical
-- reconciliation job whose fetchers are mocks means: if scheduler dispatch is wired,
-- the job writes reconciliation_events rows derived from FABRICATED broker state every
-- 5 minutes -- phantom reconciliation per CROSSWIND §2 axiom 2 (internal derivatives
-- treated as external primes) + §20 (phantom decision throughput).
--
-- Current live state (verified 2026-06-04): enabled=true, status=registered, zero
-- job_executions rows -- not firing only because dispatch isn't wired. The protection
-- is an ABSENCE (no pg_cron dispatch), not a deliberate gate. This migration makes the
-- gate deliberate.
--
-- RE-ENABLE CONDITIONS (all three required, via a future migration referencing MIG-058):
--   (1) Handler has REAL broker fetchers (FP-006 sub-step 6.7 -- Alpaca paper), not mocks.
--   (2) Two-invocation liveness rule in place (#11 second commit) -- detects a tick that
--       fires but reconciles nothing real, and STOPs rather than continuing silently.
--   (3) An explicit re-enable migration that cites this one and confirms (1)+(2) landed.
--
-- MIG-045 is NOT deleted (forward-only history); MIG-058 supersedes its enablement.
-- Idempotent: WHERE enabled = true guard makes re-runs touch zero rows; DO block
-- asserts end-state regardless of which run achieved it.

UPDATE public.job_registry
SET enabled = false, updated_at = now()
WHERE id = 'longshort.reconciliation_periodic_sweep' AND enabled = true;

-- Sanity: confirm the row is now disabled (whether this run changed it or a prior run did).
DO $$
DECLARE
  is_enabled boolean;
BEGIN
  SELECT enabled INTO is_enabled
  FROM public.job_registry
  WHERE id = 'longshort.reconciliation_periodic_sweep';

  IF is_enabled IS NULL THEN
    RAISE EXCEPTION 'MIG-058: longshort.reconciliation_periodic_sweep not found in job_registry.';
  END IF;
  IF is_enabled = true THEN
    RAISE EXCEPTION 'MIG-058: periodic_sweep still enabled=true after disarm -- investigate.';
  END IF;
END $$;