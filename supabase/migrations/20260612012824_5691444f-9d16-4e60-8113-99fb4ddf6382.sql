ALTER TABLE public.signal_queue_runs
  ADD COLUMN IF NOT EXISTS slice_failure_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.signal_queue_runs.slice_failure_count IS
  'FP-048 INC-73 — consecutive feed-mode slice-throw counter. Engine: increment on throw, reset to 0 on success, ≥3 → terminal-fail run with last verbatim error (key-masked). Per-ticker mode leaves this at 0.';