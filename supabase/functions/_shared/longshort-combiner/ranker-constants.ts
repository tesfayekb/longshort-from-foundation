/**
 * Combiner ranker constants (FP-052 3.0c-i / ACT-238).
 *
 * Pure-constant module — no I/O, no clock, no randomness. The
 * `RANKER_SOURCE_FALLBACK` literal MUST match the partial-index
 * predicate in `supabase/migrations/20260616103102_*.sql`:
 *
 *   CREATE INDEX idx_combiner_rankings_ranker_source_nonfallback
 *     ON public.combiner_rankings (ranker_source)
 *     WHERE ranker_source <> 'count_normalized_fallback';
 *
 * Any drift here silently shifts every fallback-produced row out of /
 * into the non-fallback partial index — the model-active surface
 * `combiner_rankings` filter would mis-classify. Locked by the ranker
 * unit tests as an exact string.
 */

/**
 * Degraded-path attestation literal stamped on every fallback row.
 * Per CROSSWIND §6.4 (v0.9 count-normalized-average fallback) the
 * fallback ranker is the *documented degraded path*; the literal makes
 * the degradation queryable + partial-index-filterable.
 */
export const RANKER_SOURCE_FALLBACK = 'count_normalized_fallback' as const;

/**
 * Seed-size for both sides of the book at 3.0c. CROSSWIND §1 L107
 * ("long the top, short from the bottom") with the v1 binary
 * rank-based entry: top-20 by long_rank → long side; top-20 by
 * short_rank → short side. Hysteresis / cap-25 / no-bumping /
 * 31-day-re-entry block are §1.4 state-machine concerns deferred to
 * 3.0d (registered in `docs/08-planning/deferred-work-register.md`).
 */
export const BOOK_SEED_SIZE = 20 as const;
