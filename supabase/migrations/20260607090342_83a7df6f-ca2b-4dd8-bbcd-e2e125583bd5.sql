-- MIG-071 — FP-022 / C-F4 per-ticker skip attribution
--
-- Additive nullable-with-default column carrying the per-ticker SignalSkip[]
-- array that the orchestrator already computes (result.skipped) but the
-- persist helper (supabase/functions/_shared/persist-signal-compute-log.ts)
-- currently aggregates away into skip_counts. Enables diagnosing WHICH
-- tickers skipped on a degraded fire without re-running.
--
-- Default discipline deviation rationale: this column uses
-- NOT NULL DEFAULT '[]'::jsonb rather than the project's usual INC-36
-- NULL-means-untracked discipline. Justification: [] is the semantically
-- correct value for a clean fire with zero skips — there is no "untracked"
-- state, because every orchestrator run computes the array (it may be
-- empty, but it is always computed). Mirrors MIG-061 enrichment_skip_counts
-- additive-jsonb precedent.
--
-- Time-sensitivity: lands before Monday 2026-06-08 20:00 UTC so the first
-- cron-attributable signal_compute_log row captures per-ticker detail from
-- tick one (FP-018 Bucket C freshness fire).
--
-- Cross-references: FP-022; FP-018 Bucket C; MIG-065 (table CREATE);
-- supabase/functions/_shared/persist-signal-compute-log.ts (write-path
-- companion edit landing in same FP); signal-types.ts SignalSkip contract.

ALTER TABLE public.signal_compute_log
  ADD COLUMN IF NOT EXISTS skipped_detail jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.signal_compute_log.skipped_detail IS
  'Per-ticker SignalSkip[] array ({ticker, reason, detail?}) — raw skip attribution. '
  'Coexists with skip_counts (the aggregate). Default [] is semantically correct: '
  'every orchestrator run computes the array; an empty array IS a clean-fire signal.';
