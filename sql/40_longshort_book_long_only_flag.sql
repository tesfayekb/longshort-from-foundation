-- sql/40_longshort_book_long_only_flag.sql
-- ACT-559 / DW-213 — Operator-imposed long-only mode for the LONG-SHORT book.
--
-- Idempotent seed of the `longshort.book.long_only` feature-flag row
-- (default operator). Consumed by `_shared/longshort-execution/
-- long-only-flag-reader.ts` and enforced at the candidate-construction
-- seam in `rebalance-submit-orchestrator.ts` (line 407-409, SHORT-OPEN
-- suppression only; SHORT-COVERs still submit via the planner's
-- currentPositions → close-intent path).
--
-- Reversal criterion (verbatim from DW-213):
--   Reversed ONLY when a real universe refresh lands with
--   short_eligible true-count > 0 AND operator ratifies reversal in a
--   subsequent action-tracker entry citing DW-213.

INSERT INTO public.feature_flags (
  operator_id, flag_key, enabled, evidence_tier, reason, set_by, set_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'longshort.book.long_only',
  true,
  'strong',
  'S3 ruling 2026-07-21 — long-only until a real universe refresh lands with short_eligible true-count > 0 AND operator ratifies reversal. See DW-213.',
  NULL,
  now()
)
ON CONFLICT (operator_id, flag_key) DO UPDATE
  SET enabled       = EXCLUDED.enabled,
      evidence_tier = EXCLUDED.evidence_tier,
      reason        = EXCLUDED.reason,
      set_at        = EXCLUDED.set_at;