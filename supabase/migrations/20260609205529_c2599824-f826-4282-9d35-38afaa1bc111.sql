-- MIG-083 — FP-045 Phase 2 — Queue-worker RPCs (claim + finalizing CAS)
--
-- Two SECURITY DEFINER functions backing the slice-worker:
--   1) signal_queue_claim_slice — atomic FOR UPDATE SKIP LOCKED claim
--   2) signal_queue_cas_finalizing — guarded 'running' -> 'finalizing' CAS
--      whose predicate (cursor-empty) IS the aggregation barrier
--
-- Both are service-role-only; EXECUTE is REVOKEd from PUBLIC / anon /
-- authenticated. They mutate signal_queue_cursor (claim) and
-- signal_queue_runs (CAS) — both tables already have RESTRICTIVE deny-
-- write policies for authenticated; service_role bypasses RLS so the
-- functions remain callable from edge-function context.
--
-- search_path pinned per DEC-002 security-definer convention; no
-- mutable schema lookups.

-- ────────────────────────────────────────────────────────────────────────
-- 1) signal_queue_claim_slice
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.signal_queue_claim_slice(
  p_run_id uuid,
  p_limit  integer
)
RETURNS TABLE(ticker text, gics_sector text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'signal_queue_claim_slice: p_run_id is null'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'signal_queue_claim_slice: p_limit must be > 0, got %', p_limit
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT c.ticker
    FROM public.signal_queue_cursor c
    WHERE c.run_id = p_run_id
      AND c.claimed_at IS NULL
    ORDER BY c.ticker
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  marked AS (
    UPDATE public.signal_queue_cursor c
       SET claimed_at = now()
      FROM claimed
     WHERE c.run_id = p_run_id
       AND c.ticker = claimed.ticker
    RETURNING c.ticker, c.gics_sector
  )
  SELECT marked.ticker, marked.gics_sector FROM marked;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.signal_queue_claim_slice(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.signal_queue_claim_slice(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.signal_queue_claim_slice(uuid, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.signal_queue_claim_slice(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.signal_queue_claim_slice(uuid, integer) IS
  'FP-045 / MIG-083 / DEC-047. Atomically claims up to p_limit unclaimed cursor rows for a run via FOR UPDATE SKIP LOCKED so concurrent slice-workers never claim the same ticker. Returns the (ticker, gics_sector) rows for the caller to process. Service-role only.';

-- ────────────────────────────────────────────────────────────────────────
-- 2) signal_queue_cas_finalizing
--    Aggregation barrier: cursor-empty predicate is inside the UPDATE so
--    a slice that still holds locked-but-not-yet-deleted cursor rows
--    naturally blocks the transition.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.signal_queue_cas_finalizing(
  p_run_id uuid,
  p_now    timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rowcount integer;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'signal_queue_cas_finalizing: p_run_id is null'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_now IS NULL THEN
    RAISE EXCEPTION 'signal_queue_cas_finalizing: p_now is null'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.signal_queue_runs
     SET status        = 'finalizing',
         heartbeat_at  = p_now,
         updated_at    = p_now
   WHERE run_id = p_run_id
     AND status = 'running'
     AND NOT EXISTS (
       SELECT 1 FROM public.signal_queue_cursor c
        WHERE c.run_id = p_run_id
     );

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;
  RETURN v_rowcount = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.signal_queue_cas_finalizing(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.signal_queue_cas_finalizing(uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.signal_queue_cas_finalizing(uuid, timestamptz) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.signal_queue_cas_finalizing(uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.signal_queue_cas_finalizing(uuid, timestamptz) IS
  'FP-045 / MIG-083 / DEC-047. Compare-and-set transition signal_queue_runs.status ''running'' -> ''finalizing'' guarded by cursor-empty predicate (aggregation barrier — z-score can never run on a partial staging set). Returns TRUE only for the unique caller that wins the race; concurrent callers receive FALSE and no-op. Service-role only.';
