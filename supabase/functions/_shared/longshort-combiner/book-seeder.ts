/**
 * Combiner book seeder — FP-052 (3.0c-i / ACT-238).
 *
 * PURE LAYER (no Supabase, no clock, no -999, no randomness). Consumes
 * ranker output and emits the seeded book — top-`BOOK_SEED_SIZE` by
 * `long_rank` → long side; top-`BOOK_SEED_SIZE` by `short_rank` → short
 * side. Hysteresis, cap-25, no-bumping, and 31-day-re-entry block are
 * CROSSWIND §1.4 state-machine concerns deferred to 3.0d (registered
 * in `docs/08-planning/deferred-work-register.md`).
 *
 * Pre-persistence overlap assertion (load-bearing):
 * the seeder throws `BookOverlapError` BEFORE returning if any ticker
 * appears on both sides — the combiner_book UNIQUE
 * `(operator_id, as_of_date, ticker)` constraint would otherwise
 * surface this as a PG 23505 at UPSERT time, which is harder to
 * diagnose and routes through the orchestrator's failure path with a
 * post-mortem-only signature. The pure-layer assert surfaces it as a
 * typed error caught before any persistence side-effect.
 *
 * Short-side rule: if a side has fewer than `BOOK_SEED_SIZE` ranked
 * names available (small-universe replay / degenerate as_of), seed
 * what exists — do NOT pad with sentinel rows. The orchestrator
 * surfaces undersized books as audit metadata.
 */

import type { RankingRow } from './ranker.ts';
import { BOOK_SEED_SIZE, RANKER_SOURCE_FALLBACK } from './ranker-constants.ts';

/**
 * One emitted book row. Shape mirrors `combiner_book` (MIG-099 sibling
 * 20260616103102) modulo operator_id / as_of_date which the
 * orchestrator threads in at UPSERT time. `score` is side-oriented:
 * `long_score` on long rows, `short_score` on short rows.
 */
export interface BookRow {
  side: 'long' | 'short';
  rank_within_side: number;
  ticker: string;
  score: number;
  ranker_source: typeof RANKER_SOURCE_FALLBACK;
}

/**
 * Thrown BEFORE any persistence side-effect when the seeded book would
 * place the same ticker on both sides. Defense-in-depth against the
 * `combiner_book.UNIQUE(operator_id, as_of_date, ticker)` constraint
 * surfacing as a PG 23505 at UPSERT time.
 */
export class BookOverlapError extends Error {
  readonly overlapping: readonly string[];
  constructor(overlapping: readonly string[]) {
    super(
      `book-seeder: tickers appear on BOTH long and short sides of the seeded book: ` +
        overlapping.join(', '),
    );
    this.name = 'BookOverlapError';
    this.overlapping = overlapping;
  }
}

/**
 * Seed both sides of the book from a ranker output. Iterates the
 * provided `rankings` array twice (once per side), each time selecting
 * the rows whose side-rank is in `[1, BOOK_SEED_SIZE]`. Output is
 * sorted within each side by `rank_within_side` ASC for deterministic
 * UPSERT shape.
 */
export function seedBook(rankings: readonly RankingRow[]): BookRow[] {
  // Long side — keep rows with long_rank in [1, BOOK_SEED_SIZE].
  const longRows: BookRow[] = [];
  for (const r of rankings) {
    if (r.long_rank >= 1 && r.long_rank <= BOOK_SEED_SIZE) {
      longRows.push({
        side: 'long',
        rank_within_side: r.long_rank,
        ticker: r.ticker,
        score: r.long_score,
        ranker_source: r.ranker_source,
      });
    }
  }
  longRows.sort((a, b) => a.rank_within_side - b.rank_within_side);

  // Short side — keep rows with short_rank in [1, BOOK_SEED_SIZE].
  const shortRows: BookRow[] = [];
  for (const r of rankings) {
    if (r.short_rank >= 1 && r.short_rank <= BOOK_SEED_SIZE) {
      shortRows.push({
        side: 'short',
        rank_within_side: r.short_rank,
        ticker: r.ticker,
        score: r.short_score,
        ranker_source: r.ranker_source,
      });
    }
  }
  shortRows.sort((a, b) => a.rank_within_side - b.rank_within_side);

  // Pre-persistence overlap assertion — throw on intersection BEFORE
  // returning so the orchestrator never reaches the UPSERT.
  const longSet = new Set(longRows.map(r => r.ticker));
  const overlap: string[] = [];
  for (const r of shortRows) {
    if (longSet.has(r.ticker)) overlap.push(r.ticker);
  }
  if (overlap.length > 0) {
    // Sort for deterministic error message (tests assert ordering).
    overlap.sort();
    throw new BookOverlapError(overlap);
  }

  return [...longRows, ...shortRows];
}
