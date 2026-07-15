-- =============================================================================
-- ACT-493 v1 Turn 3 -- Q2b + M4a + M9 (partial-exit accounting + M9 consistency trigger)
--
-- Adds four Q2b in-place residual columns to overshoot_lots plus M4a exit_attempts.
-- Installs the M9 BEFORE-INSERT-OR-UPDATE trigger enforcing the invariant
-- (status='closed') <=> (closed_at IS NOT NULL). Backfills defaults on all
-- existing open lots so no code reads an unpopulated NULL post-deploy.
--
-- Q1c ratified (Turn 2): horizons LONG=10 / SHORT=5 unchanged. This migration
-- adds ONLY the partial-exit accounting shape; no exit-timing semantics move.
--
-- Idempotency: IF NOT EXISTS on every column and index; DROP TRIGGER IF EXISTS
-- + CREATE TRIGGER for the M9 enforcement; UPDATE guarded by WHERE clauses that
-- exclude already-backfilled rows. Safe to re-apply on partial-apply recovery.
--
-- Halt-on-fail assertions:
--   (a) every open lot has remaining_qty populated (= qty) post-backfill.
--   (b) every open lot has filled_qty=0 and exit_attempts=0 post-backfill.
--   (c) the M9 invariant holds across the entire table.
-- =============================================================================

-- --- Q2b: in-place partial-exit residual columns ---------------------------
ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS remaining_qty        numeric,
  ADD COLUMN IF NOT EXISTS filled_qty           numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_exit_price       numeric,
  ADD COLUMN IF NOT EXISTS realized_pnl_partial numeric NOT NULL DEFAULT 0;

-- Backfill remaining_qty = qty for all existing rows where NULL.
UPDATE public.overshoot_lots
   SET remaining_qty = qty
 WHERE remaining_qty IS NULL;

-- Now that every row has a value, tighten to NOT NULL + default 0
-- (INSERT paths supply remaining_qty explicitly at lot creation; the
-- default is a safety net for defective callers, mirroring qty semantics).
ALTER TABLE public.overshoot_lots
  ALTER COLUMN remaining_qty SET NOT NULL,
  ALTER COLUMN remaining_qty SET DEFAULT 0;

-- Audit comments for each new column (§22.5.1 provenance).
COMMENT ON COLUMN public.overshoot_lots.remaining_qty IS
  'ACT-493 v1 Q2b: unfilled residual quantity. remaining_qty = qty - filled_qty. Full-close atomically drops to 0 with status=closed and closed_at set (M9 trigger enforces).';
COMMENT ON COLUMN public.overshoot_lots.filled_qty IS
  'ACT-493 v1 Q2b: cumulative exit-side fill quantity across all exit attempts on this lot.';
COMMENT ON COLUMN public.overshoot_lots.avg_exit_price IS
  'ACT-493 v1 Q2b: quantity-weighted average exit price across cumulative filled_qty. NULL until first exit fill lands.';
COMMENT ON COLUMN public.overshoot_lots.realized_pnl_partial IS
  'ACT-493 v1 Q2b: realized P&L attributable to filled_qty (broker-truth prices). Fully realized at status=closed.';

-- --- M4a: exit_attempts counter --------------------------------------------
ALTER TABLE public.overshoot_lots
  ADD COLUMN IF NOT EXISTS exit_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.overshoot_lots.exit_attempts IS
  'ACT-493 v1 M4a: consecutive-non-fill counter. Increments on each exit-run submit; resets to 0 when a fill lands (partial or full). Used by the M4 day-in-force re-fire policy consumer.';

-- --- Supporting index for the exit-engine open-lot scan ---------------------
-- The exit engine reads WHERE status='open' AND remaining_qty > 0 (Turn 3+
-- money-path). Partial-open lots (filled_qty > 0 && remaining_qty > 0) must
-- surface here. Existing open-lot index (Turn 1 tier_idx) is compatible; add
-- a residual-aware partial index for the future engine query.
CREATE INDEX IF NOT EXISTS overshoot_lots_open_residual_idx
  ON public.overshoot_lots (symbol, side)
  WHERE (status = 'open' AND remaining_qty > 0);

-- --- M9: consistency trigger  (status='closed') <=> (closed_at IS NOT NULL) ---
-- Enforced BEFORE INSERT OR UPDATE. The trigger raises on any row that would
-- leave the table in an inconsistent state -- a defense-in-depth backstop
-- to the fill-sweep's atomic close (M7). Any caller that sets one side of
-- the pair without the other fails loudly at write time.
--
-- Rationale for a trigger (not a CHECK constraint): CHECK requires immutable
-- expressions and cannot reference multi-column shape as ergonomically; a
-- trigger surfaces a typed exception with a diagnosable message and is
-- consistent with the platform's existing validation-trigger pattern
-- (validate_invitation_status, prevent_last_superadmin_delete, etc.).
CREATE OR REPLACE FUNCTION public.overshoot_lots_enforce_status_closed_at_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  -- M9 invariant: (status='closed') <=> (closed_at IS NOT NULL).
  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    RAISE EXCEPTION
      'overshoot_lots M9 invariant violated: status=closed requires closed_at NOT NULL (lot_id=%)',
      NEW.lot_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status <> 'closed' AND NEW.closed_at IS NOT NULL THEN
    RAISE EXCEPTION
      'overshoot_lots M9 invariant violated: closed_at NOT NULL requires status=closed (lot_id=%, status=%)',
      NEW.lot_id, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS overshoot_lots_m9_status_closed_at_trg ON public.overshoot_lots;
CREATE TRIGGER overshoot_lots_m9_status_closed_at_trg
  BEFORE INSERT OR UPDATE OF status, closed_at ON public.overshoot_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.overshoot_lots_enforce_status_closed_at_consistency();

COMMENT ON FUNCTION public.overshoot_lots_enforce_status_closed_at_consistency() IS
  'ACT-493 v1 M9: enforce (status=closed) <=> (closed_at NOT NULL) invariant. Defense-in-depth backstop for the fill-sweep atomic close path.';

-- --- Halt-on-fail assertions -----------------------------------------------
DO $act493_turn3$
DECLARE
  v_remaining_null_count  integer;
  v_filled_qty_bad_count  integer;
  v_exit_attempts_bad     integer;
  v_m9_violation_count    integer;
BEGIN
  -- (a) every existing open lot has remaining_qty populated and equal to qty.
  SELECT count(*) INTO v_remaining_null_count
    FROM public.overshoot_lots
   WHERE status = 'open' AND (remaining_qty IS NULL OR remaining_qty <> qty);
  IF v_remaining_null_count <> 0 THEN
    RAISE EXCEPTION
      'ACT-493 Turn 3 halt: % open lots have remaining_qty <> qty (backfill defective)',
      v_remaining_null_count;
  END IF;

  -- (b) filled_qty defaulted 0 and exit_attempts defaulted 0 on all open lots.
  SELECT count(*) INTO v_filled_qty_bad_count
    FROM public.overshoot_lots
   WHERE status = 'open' AND filled_qty <> 0;
  IF v_filled_qty_bad_count <> 0 THEN
    RAISE EXCEPTION
      'ACT-493 Turn 3 halt: % open lots have filled_qty <> 0 (default defective)',
      v_filled_qty_bad_count;
  END IF;

  SELECT count(*) INTO v_exit_attempts_bad
    FROM public.overshoot_lots
   WHERE status = 'open' AND exit_attempts <> 0;
  IF v_exit_attempts_bad <> 0 THEN
    RAISE EXCEPTION
      'ACT-493 Turn 3 halt: % open lots have exit_attempts <> 0 (default defective)',
      v_exit_attempts_bad;
  END IF;

  -- (c) M9 invariant holds table-wide.
  SELECT count(*) INTO v_m9_violation_count
    FROM public.overshoot_lots
   WHERE (status = 'closed' AND closed_at IS NULL)
      OR (status <> 'closed' AND closed_at IS NOT NULL);
  IF v_m9_violation_count <> 0 THEN
    RAISE EXCEPTION
      'ACT-493 Turn 3 halt: % rows violate M9 invariant (pre-existing data corruption)',
      v_m9_violation_count;
  END IF;
END
$act493_turn3$;
