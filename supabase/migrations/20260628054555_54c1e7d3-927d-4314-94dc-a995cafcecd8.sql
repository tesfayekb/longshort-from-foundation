-- MIG-136 (DEC-071 sub-step 3b telemetry fix): additive nullable gate_counts column
-- on signal_compute_log. Distinct from skip_counts because gated typed-absence
-- emits are categorically different from skips (failed computes).
ALTER TABLE public.signal_compute_log
  ADD COLUMN IF NOT EXISTS gate_counts jsonb NULL;

COMMENT ON COLUMN public.signal_compute_log.gate_counts IS
  'DEC-071 3b: per-gate-decision counts for typed-absence gated emits (gated_by_news / gated_by_catalyst). Distinct from skip_counts — gated rows are deliberate suppressions (is_present=false + skip_reason), NOT skips (failed computes). NULL for signals that produce no gated rows.';