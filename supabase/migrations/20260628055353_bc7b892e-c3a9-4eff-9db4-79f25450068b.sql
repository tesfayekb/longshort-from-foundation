ALTER TABLE public.combiner_feature_vectors
  ADD COLUMN IF NOT EXISTS gated_signals jsonb NULL;

COMMENT ON COLUMN public.combiner_feature_vectors.gated_signals IS
  'DEC-071 sub-step 3c / MIG-137: per-name list of critical signal_ids whose features[<id>] = null is SANCTIONED (gated, not bug). The ranker SKIPS criticals listed here (per-name DEC-074 semantics: numerator/presentCount unchanged for that slot) but STILL THROWS IncludedRowInvariantError on a null critical NOT listed here (the §4.3.5 bug-detection invariant). NULL or empty array = no gated criticals (legacy behavior preserved).';