-- MIG-147 — FP-062 6I.4 / DW-105 §1.4 book state-machine descriptive columns.
-- Additive only; PK unchanged.

ALTER TABLE public.combiner_book
  ADD COLUMN IF NOT EXISTS entered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS transition_reason text NULL;

-- Constrain transition_reason to the four legal in-book values.
-- 'exited' is NOT a valid value — exited rows are removed, not flagged.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'combiner_book_transition_reason_chk'
  ) THEN
    ALTER TABLE public.combiner_book
      ADD CONSTRAINT combiner_book_transition_reason_chk
      CHECK (transition_reason IS NULL
             OR transition_reason IN ('seeded','held','entered','re_entered'));
  END IF;
END $$;

-- Backfill existing rows. Pre-MIG-147 rows = pure seed-only output; mark as 'seeded'.
UPDATE public.combiner_book
   SET entered_at = computed_at,
       transition_reason = 'seeded'
 WHERE entered_at IS NULL
   AND transition_reason IS NULL;

COMMENT ON COLUMN public.combiner_book.entered_at IS
  'FP-062 6I.4 / DW-105 §1.4 — when this ticker first entered its current uninterrupted hold on this side. Held across days until full exit (rank > 30); re-stamped on re-entry. NULL only briefly between MIG-147 apply and orchestrator wire-up; backfilled := computed_at on apply.';

COMMENT ON COLUMN public.combiner_book.transition_reason IS
  'FP-062 6I.4 / DW-105 §1.4 — transition that produced this row at this as_of: seeded (pre-state-machine / no prior), held (in prior book AND today rank<=30), entered (rank<=20, not in prior, not 31-day-blocked), re_entered (entered after a prior exit). exited is NOT stored — exited rows are removed.';