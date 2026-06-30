"""DW-168 pre-buildable sanity probes (FP-066 WAVE-1, ACT-424).

Read-only observability against the accruing combiner substrate, per the
FP-066 charter (ACT-423) and the DW-168-ADD-01 disposition-reopen
(ACT-422). The R1-R5 invariants are HARD STOP conditions:

  R1: probes read combiner_feature_vectors + combiner_forward_returns ONLY.
  R2: zero writes to any table. JSONL to stdout / GHA artifacts only.
  R3: zero edit to trainer.py / promotion-criteria-evaluator.ts /
      lgbm-inference.ts (this WAVE-1 build doesn't touch S2 at all).
  R4: zero candidate fabrication — fixtures are raw combiner_* rows only.
  R5: DEC-070 (h).2 slot-merge is by-design — probes SUPPLY evidence,
      do not act on it; no trainer-grouping change here.

Each probe is __main__-runnable, emits JSONL to stdout, and supports
``--dry-run`` for sandbox fixture-mode (no Supabase client constructed).
"""