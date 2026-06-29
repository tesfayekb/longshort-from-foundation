/**
 * Book state-machine — FP-062 sub-step 6I.4 / DW-105 §1.4.
 *
 * PURE LAYER. No Supabase, no clock, no Date.now(), no randomness. The
 * `asOfDate` is an input (string YYYY-MM-DD); the 31-calendar-day block
 * math compares it to per-symbol exit dates supplied by the caller.
 * Replay determinism: same (priorBook, todayRankings, candidates,
 * recentExits, asOfDate) → byte-identical output.
 *
 * NAME — `book-state-machine.ts` (combiner directory) to avoid collision
 * with `supabase/functions/_shared/longshort-execution/state-machine.ts`
 * which is the unrelated order two-phase FSM. Distinct concern, distinct
 * dir, distinct stem.
 *
 * v1 CROSSWIND §1.4 rules (verbatim, grep-confirmed):
 *
 *   - Entry: rank crosses to <= 20 (long or short). Cap-25: if the side
 *     already holds 25 surviving names, the new entry is REJECTED — no
 *     bumping of the lowest-ranked holding; wait for natural exit.
 *   - Exit: rank crosses to > 30 (or the ticker is absent from today's
 *     rankings for that side). Full close. Exited rows are NOT
 *     persisted to combiner_book — they are dropped, with an audit row
 *     emitted by the orchestrator.
 *   - Hysteresis 21-30: held stays held; non-held does NOT enter.
 *   - Conditional 31-day re-entry block (IRS wash-sale alignment):
 *       pnl >= 0 → NO block (0 is non-negative).
 *       pnl <  0 → 31-calendar-day block from the exit date.
 *     A name still inside its block window is rejected from entry.
 *   - v1 pure ranking-based exit. NO dual-criterion exit. NO passive
 *     holds. The spec is explicit.
 */

import type { BookRow } from './book-seeder.ts';
import type { RankingRow } from './ranker.ts';

/** §1.4 thresholds. Locked here so any future tweak is one literal swap. */
export const EXIT_RANK_THRESHOLD = 30 as const;   // rank > 30 exits
export const ENTRY_RANK_THRESHOLD = 20 as const;  // rank <= 20 may enter
export const CAP_PER_SIDE = 25 as const;          // hard cap; no bumping
export const REENTRY_BLOCK_DAYS = 31 as const;    // IRS wash-sale alignment

/**
 * A prior-book row as read by the state-machine. The PRIOR book is
 * yesterday's combiner_book rows projected to the minimal carrying
 * shape — entered_at is preserved across the hold so day-N tracks the
 * original entry timestamp, not yesterday's computed_at.
 */
export interface PriorBookRow {
  side: 'long' | 'short';
  ticker: string;
  entered_at: string;  // ISO timestamptz; carried forward on 'held'
}

/**
 * One closed-lot exit aggregate (per (operator_id, symbol, side, exit_date)).
 * `pnl_sign` is the SIGN of SUM(realized_pnl) over the partial-fill lots
 * that closed that day on that side — pre-aggregated by the loader so
 * the pure layer does no arithmetic on broker numbers.
 */
export interface RecentExit {
  side: 'long' | 'short';
  symbol: string;
  exit_date: string;  // YYYY-MM-DD
  pnl_sign: -1 | 0 | 1;
}

export type TransitionReason = 'seeded' | 'held' | 'entered' | 're_entered';

/** combiner_book row with the §1.4 descriptive columns populated. */
export interface BookRowWithTransition extends BookRow {
  entered_at: string;            // ISO timestamptz
  transition_reason: TransitionReason;
}

/** Rows dropped by §1.4 (exits, cap-25 rejects, 31-day blocks). NOT persisted
 *  to combiner_book; the orchestrator routes these to the audit log. */
export interface BookRejection {
  side: 'long' | 'short';
  ticker: string;
  reason:
    | 'exited_rank_above_threshold'  // held name with today's rank > 30 (or absent)
    | 'rejected_cap_25_full'         // side already at CAP_PER_SIDE held survivors
    | 'blocked_31_day_reentry';      // prior loss-exit within REENTRY_BLOCK_DAYS
  /** Optional metadata for forensics — included where meaningful. */
  today_rank?: number;
  prior_exit_date?: string;
}

export interface ApplyBookStateMachineInput {
  /** Yesterday's combiner_book (most-recent as_of_date < today). Empty
   *  array on the first run (gap case) — every candidate becomes 'seeded'. */
  priorBook: readonly PriorBookRow[];
  /** Today's full RankingRow set (one row per ticker, both sides ranked). */
  todayRankings: readonly RankingRow[];
  /** Today's seedBook output (rank<=20 candidates, per side). */
  candidates: readonly BookRow[];
  /** Closed lots over the last REENTRY_BLOCK_DAYS, aggregated by the loader. */
  recentExits: readonly RecentExit[];
  /** ISO YYYY-MM-DD. Used as the entered_at stamp for entered/re_entered
   *  rows AND as the reference date for the 31-day calendar math. */
  asOfDate: string;
  /** ISO timestamptz for entered_at on entered/re_entered rows. Caller
   *  passes the orchestrator's as_of.toISOString() — same source as
   *  computed_at on the persisted row (DEC-034 (4)). */
  asOfIso: string;
}

export interface ApplyBookStateMachineOutput {
  rows: BookRowWithTransition[];
  rejected: BookRejection[];
}

/** Days between two YYYY-MM-DD strings, inclusive of the exit date.
 *  Calendar days, UTC, no clock. Returns asOfDate - exitDate in days. */
function calendarDaysBetween(exitDate: string, asOfDate: string): number {
  const a = Date.UTC(
    Number(exitDate.slice(0, 4)),
    Number(exitDate.slice(5, 7)) - 1,
    Number(exitDate.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(asOfDate.slice(0, 4)),
    Number(asOfDate.slice(5, 7)) - 1,
    Number(asOfDate.slice(8, 10)),
  );
  return Math.floor((b - a) / 86400000);
}

/**
 * Apply §1.4 transitions. Pure; deterministic.
 *
 * Algorithm (per side, run independently):
 *
 *   1. Build a today-rank lookup over `todayRankings`.
 *   2. Build a prior-set + prior-entered_at lookup over `priorBook`.
 *   3. HELD pass: iterate priorBook in side+ticker order — keep if
 *      today's same-side rank exists AND is <= EXIT_RANK_THRESHOLD.
 *      Stamp transition_reason='held', preserve entered_at.
 *      Otherwise → BookRejection 'exited_rank_above_threshold'.
 *   4. BLOCK SET: from recentExits, the (side, symbol) pairs with
 *      pnl_sign < 0 AND (asOfDate - exit_date) < REENTRY_BLOCK_DAYS.
 *      pnl_sign >= 0 exits do NOT block.
 *   5. RECENT EXIT SET (any sign): used to distinguish 'entered' from
 *      're_entered' — a candidate that appears in recentExits but is
 *      NOT blocked (pnl_sign >= 0, or block already lapsed) is
 *      're_entered'.
 *   6. ENTER pass: iterate candidates in their seedBook order (already
 *      rank-ASC within side). Skip if already held. Reject if in block
 *      set. Otherwise: if side held-count >= CAP_PER_SIDE → reject
 *      'rejected_cap_25_full' (no bumping). Else add as 'entered' or
 *      're_entered'.
 *   7. Re-key rank_within_side: held rows + new entries are emitted in
 *      today's rank-ASC order, re-numbered 1..N per side. The cap-25
 *      check uses N (held survivors) BEFORE adding the new entry.
 */
export function applyBookStateMachine(
  input: ApplyBookStateMachineInput,
): ApplyBookStateMachineOutput {
  const { priorBook, todayRankings, candidates, recentExits, asOfDate, asOfIso } = input;

  // Today's rank lookup, keyed by (side, ticker).
  const todayRankBySide = {
    long: new Map<string, number>(),
    short: new Map<string, number>(),
  } as const;
  // Today's score lookup so held rows carry today's score (not stale).
  const todayScoreBySide = {
    long: new Map<string, number>(),
    short: new Map<string, number>(),
  } as const;
  // Carry the ranker_source from today's rankings onto held rows too.
  const rankerSourceByTicker = new Map<string, string>();
  for (const r of todayRankings) {
    todayRankBySide.long.set(r.ticker, r.long_rank);
    todayRankBySide.short.set(r.ticker, r.short_rank);
    todayScoreBySide.long.set(r.ticker, r.long_score);
    todayScoreBySide.short.set(r.ticker, r.short_score);
    rankerSourceByTicker.set(r.ticker, r.ranker_source);
  }

  // Prior entered_at lookup, keyed by (side, ticker).
  const priorEnteredAtBySide = {
    long: new Map<string, string>(),
    short: new Map<string, string>(),
  } as const;
  for (const p of priorBook) {
    priorEnteredAtBySide[p.side].set(p.ticker, p.entered_at);
  }

  // Recent-exit + block lookups, keyed by (side, symbol).
  const blockSet = { long: new Set<string>(), short: new Set<string>() } as const;
  const blockExitDate = {
    long: new Map<string, string>(),
    short: new Map<string, string>(),
  } as const;
  const recentExitSet = { long: new Set<string>(), short: new Set<string>() } as const;
  for (const e of recentExits) {
    recentExitSet[e.side].add(e.symbol);
    if (e.pnl_sign < 0 && calendarDaysBetween(e.exit_date, asOfDate) < REENTRY_BLOCK_DAYS) {
      blockSet[e.side].add(e.symbol);
      blockExitDate[e.side].set(e.symbol, e.exit_date);
    }
  }

  const outRows: BookRowWithTransition[] = [];
  const rejected: BookRejection[] = [];

  for (const side of ['long', 'short'] as const) {
    // ── Step 3: HELD pass ──
    const heldThisSide: BookRowWithTransition[] = [];
    // Iterate prior in deterministic (ticker ASC) order.
    const priorTickers = Array.from(priorEnteredAtBySide[side].keys()).sort();
    for (const ticker of priorTickers) {
      const todayRank = todayRankBySide[side].get(ticker);
      if (todayRank !== undefined && todayRank <= EXIT_RANK_THRESHOLD) {
        heldThisSide.push({
          side,
          rank_within_side: todayRank,  // re-keyed below
          ticker,
          score: todayScoreBySide[side].get(ticker)!,
          ranker_source: rankerSourceByTicker.get(ticker)!,
          entered_at: priorEnteredAtBySide[side].get(ticker)!,
          transition_reason: 'held',
        });
      } else {
        rejected.push({
          side,
          ticker,
          reason: 'exited_rank_above_threshold',
          today_rank: todayRank,
        });
      }
    }

    // ── Step 6: ENTER pass ──
    // Iterate today's candidates for this side in seedBook order (rank ASC).
    const heldTickers = new Set(heldThisSide.map(h => h.ticker));
    const candidatesThisSide = candidates.filter(c => c.side === side);
    const enteredThisSide: BookRowWithTransition[] = [];
    for (const cand of candidatesThisSide) {
      if (heldTickers.has(cand.ticker)) continue;  // already a hold
      if (blockSet[side].has(cand.ticker)) {
        rejected.push({
          side,
          ticker: cand.ticker,
          reason: 'blocked_31_day_reentry',
          today_rank: cand.rank_within_side,
          prior_exit_date: blockExitDate[side].get(cand.ticker),
        });
        continue;
      }
      // Cap-25 against held survivors + already-added entries.
      if (heldThisSide.length + enteredThisSide.length >= CAP_PER_SIDE) {
        rejected.push({
          side,
          ticker: cand.ticker,
          reason: 'rejected_cap_25_full',
          today_rank: cand.rank_within_side,
        });
        continue;
      }
      const wasRecentExit = recentExitSet[side].has(cand.ticker);
      enteredThisSide.push({
        side,
        rank_within_side: cand.rank_within_side,  // re-keyed below
        ticker: cand.ticker,
        score: cand.score,
        ranker_source: cand.ranker_source,
        entered_at: asOfIso,
        transition_reason: wasRecentExit ? 're_entered' : 'entered',
      });
    }

    // ── Step 7: re-key rank_within_side in today's rank-ASC order ──
    const combined = [...heldThisSide, ...enteredThisSide].sort((a, b) => {
      const ra = todayRankBySide[side].get(a.ticker) ?? Number.MAX_SAFE_INTEGER;
      const rb = todayRankBySide[side].get(b.ticker) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
    });
    for (let i = 0; i < combined.length; i++) {
      combined[i] = { ...combined[i], rank_within_side: i + 1 };
      outRows.push(combined[i]);
    }
  }

  // Sort rejected deterministically (side, ticker) for stable audit shape.
  rejected.sort((a, b) => {
    if (a.side !== b.side) return a.side < b.side ? -1 : 1;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });

  return { rows: outRows, rejected };
}

/**
 * Special-case helper: when there is NO prior book (first run or
 * post-gap), every candidate is 'seeded'. The orchestrator uses this
 * to preserve the pre-MIG-147 backfill semantics on first invocation.
 */
export function seedAllAsSeeded(
  candidates: readonly BookRow[],
  asOfIso: string,
): BookRowWithTransition[] {
  return candidates.map(c => ({
    ...c,
    entered_at: asOfIso,
    transition_reason: 'seeded',
  }));
}