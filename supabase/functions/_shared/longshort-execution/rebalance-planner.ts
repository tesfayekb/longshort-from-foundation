/**
 * rebalance-planner — FP-056 E1 (DEC-068 clauses a–j; landed at ACT-307).
 *
 * The COMBINED book-construction + delta-computation pure kernel that turns the
 * ranked book (combiner_rankings top-30/side) + injected §7 pre-flight results
 * + current broker positions into the per-name NOTIONAL deltas that the E2
 * submitter will convert to shares + place.
 *
 * Owner: longshort (FP-056 E1).
 *
 * LAYER DISTINCTION (DEC-068 clause j — load-bearing):
 *   - selectFinalTargets (BOOK-CONSTRUCTION layer, clause j): chooses which
 *     ≤40 names trade. Sector-aware substitution with rank-30 cap. Runs
 *     BEFORE the delta is computed.
 *   - computeDeltas (DELTA layer): per-name notional intent over the union
 *     (selected ∪ current). Closes come from current-NOT-in-selected.
 *   - planRebalance: thin entry composing both.
 *
 * Clause (b) (execution-layer autonomous three-tier retry/skip) is UNCHANGED
 * and lives downstream at E3 — this module does NOT submit orders, does NOT
 * call the broker live (purity discipline per clause j.4), and does NOT
 * require the `longshort.execute` permission (introduced at E5 per DEC-032 (4)).
 *
 * PURITY (clause j.4): all inputs are INJECTED. `preflightResults` is a Map
 * computed upstream by the orchestrator's verify_* surfaces; `currentPositions`
 * is the orchestrator's snapshot from `BrokerPositionFetcher.listOpenPositions`.
 * No fetches inside the kernel. The whole module is unit-testable WITHOUT
 * credentials. The injected `ts` is the sole `Date` source (DEC-034 clause 4).
 *
 * UNIT FORK (DEC-067 line 108 + Option B reconciliation): the kernel emits
 * NOTIONAL deltas (`delta_notional` in dollars). Shares conversion happens at
 * E2 submit-time against the order's decision-price basis. The noop-tolerance
 * is therefore a notional band, not a share band.
 *
 * INTENT CLASSIFICATION:
 *   - `open`     : no current position, |target_notional| > 0
 *   - `increase` : current side == target side, |target| > |current| beyond noop
 *   - `decrease` : current side == target side, |target| < |current| beyond noop
 *   - `close`    : current position NOT in selected set
 *   - `noop`     : |target_notional - current_market_value| ≤ noop band
 *   - opposite-side current vs. target on the SAME symbol is a `system_bug`
 *     classification (the book enforces single-side per name — should never
 *     occur; surfaced as a typed error so E3's tier-3 paging fires per
 *     DEC-068 clause (b) tier 3 "kernel invariant violation").
 */

import {
  DEFAULT_ALLOCATION_PCT,
  FULL_BOOK_SIZE,
  LEVERAGE_PAPER_LOCK,
  LeverageLockViolationError,
  AllocationOutOfRangeError,
  NonPositiveEquityError,
  SECTOR_CAP_PER_SIDE,
} from '../longshort-targets/target-position-builder.ts';

// ────────────────────────────────────────────────────────────────────────────
// DEC-068 clause (j) named constants — overridable only by amending clause (j).
// ────────────────────────────────────────────────────────────────────────────

/**
 * DEC-068 clause (j).2 — scan cap (rank-position-counted, NOT candidate-counted).
 * Data-driven from V1 live 2026-06-23 score distribution (long rank 20→30 =
 * −14.2% smooth near-linear, no cliff; rank 30 the inflection-aware optimum).
 * The substitution scan considers same-side rankings in [21, SUBSTITUTION_SCAN_CAP_RANK];
 * counting is by rank-position scanned, NOT by candidates accepted, so
 * sector-illegal rank-21 + sector-legal rank-22 = ONE substitution at rank 22
 * (two rank-positions scanned).
 */
export const SUBSTITUTION_SCAN_CAP_RANK = 30 as const;

/**
 * DEC-068 clause (j).3 — per-side daily attempt cap. Bounds compute + the
 * upstream borrow-locate / verify_* API call volume; sits inside Alpaca paper
 * rate-limits + the §8.5 30s end-to-end latency target.
 */
export const MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY = 10 as const;

/**
 * Top-N per side that participates in the book at full strength (§1.5 verbatim).
 * The substitution pre-pass selects from the top-N as the primary candidate set;
 * ranks (N+1, SUBSTITUTION_SCAN_CAP_RANK] form the substitute pool.
 */
export const PRIMARY_BOOK_TOP_N_PER_SIDE = 20 as const;

// ────────────────────────────────────────────────────────────────────────────
// Noop-tolerance — E1 NAMED CONSTANTS with DEC-deferral note.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Noop-band PERCENTAGE of the target_notional. A symbol whose current vs.
 * target divergence is ≤ NOOP_PCT × |target_notional| materializes a `noop`
 * intent (no order submitted; book remains as-is for this tick).
 *
 * DEC RATIFICATION DEFERRAL (load-bearing): the values 0.02 (2%) +
 * `NOOP_FLOOR_USD` 50 are E1 NAMED CONSTANTS pending an explicit DEC clause
 * (target: amend DEC-068 with clause (k) or an E3-era amendment) once paper
 * replay surfaces the empirical drift distribution. They are NOT silent
 * defaults — they are surfaced here as exports + flagged in FP-056 for
 * follow-up ratification (registered in deferred-work via the FP-056 E1 row).
 */
export const NOOP_PCT = 0.02 as const;

/**
 * Noop-band FLOOR in dollars. A divergence under $50 is below the smallest
 * commission-relevant trade size on paper and is treated as noise. Combined
 * with NOOP_PCT via max(): a small target ($100) gets a $50 floor; a large
 * target ($10,000) gets a $200 percentage band.
 */
export const NOOP_FLOOR_USD = 50 as const;

/**
 * DEC-070 clause (c) — RANKING_FRESHNESS_TOLERANCE: max age, in seconds,
 * of the latest `combiner_rankings.computed_at` relative to the planner's
 * injected `ts` (NEVER wall-clock — DEC-034 clause 4). Initial value 600s
 * = 2 ticks × 5min per master-plan §11.0.7 #1; Phase-7 will tune per
 * DEC-048's "cadence-is-config, Phase-7-measured" principle.
 *
 * The const is the DEFAULT; the orchestrator may override via the env-var
 * `LONGSHORT_RANKING_FRESHNESS_TOLERANCE_S` (read at the boundary, not
 * here — purity discipline j.4).
 */
export const RANKING_FRESHNESS_TOLERANCE_S = 600 as const;

// ────────────────────────────────────────────────────────────────────────────
// Typed errors (anti-phantom-defaults; no silent sentinels — DEC-034 (2)).
// ────────────────────────────────────────────────────────────────────────────

export class OppositeSideOpenPositionError extends Error {
  readonly symbol: string;
  readonly current_side: 'long' | 'short';
  readonly target_side: 'long' | 'short';
  constructor(symbol: string, current_side: 'long' | 'short', target_side: 'long' | 'short') {
    super(
      `system_bug_opposite_side_position_vs_target ` +
        `(symbol=${symbol} current=${current_side} target=${target_side}) — ` +
        `book is single-side per name; this is a tier-3 kernel invariant ` +
        `violation per DEC-068 clause (b)`,
    );
    this.name = 'OppositeSideOpenPositionError';
    this.symbol = symbol;
    this.current_side = current_side;
    this.target_side = target_side;
  }
}

export class MissingCurrentPositionFieldError extends Error {
  readonly symbol: string;
  readonly field: 'market_value' | 'current_price';
  constructor(symbol: string, field: 'market_value' | 'current_price') {
    super(
      `current_position_missing_${field}_required_for_delta_computation ` +
        `(symbol=${symbol}) — broker boundary must populate before injection`,
    );
    this.name = 'MissingCurrentPositionFieldError';
    this.symbol = symbol;
    this.field = field;
  }
}

export class WallClockInKernelError extends Error {
  constructor() {
    super(
      `wall_clock_forbidden_in_pure_kernel — ts must be injected at the ` +
        `boundary (DEC-034 clause 4)`,
    );
    this.name = 'WallClockInKernelError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Inputs.
// ────────────────────────────────────────────────────────────────────────────

/**
 * One row from `combiner_rankings` (top-N per side carrying scores + sector).
 * Mirrors the shape produced by FP-052 ranker (long_rank/short_rank/long_score/
 * short_score/gics_sector/ticker, per MIG 20260616103102).
 */
export interface RankingRow {
  ticker: string;
  long_rank: number;       // 1-indexed; values > SUBSTITUTION_SCAN_CAP_RANK are ignored by the scan
  short_rank: number;
  long_score: number;
  short_score: number;
  gics_sector: string | null;  // nullable per existing book-seeder fixtures
  ranker_source: string;
  /** DEC-070 clause (c) — optional freshness anchor (ISO string of
   *  `combiner_rankings.computed_at`). Optional so test fixtures that
   *  don't model freshness keep working; the orchestrator's ranking-
   *  freshness gate only bites when at least one row carries a value. */
  computed_at?: string | null;
}

/**
 * §7 pre-flight RESULT (clause j.4 — INJECTED, not fetched here).
 *
 * The orchestrator (E2+) runs the §7 verify_* surfaces against a candidate
 * symbol on a side and aggregates the outcomes into one PASS/FAIL with a
 * structured reason. The planner consumes this Map and never calls a verifier
 * itself — that's the purity discipline that keeps E1 unit-testable without
 * broker credentials.
 */
export interface PreflightResult {
  passed: boolean;
  /** Structured failure reason when passed=false; null when passed=true. */
  reason: string | null;
  /** Names of the verifiers that failed (audit trail; informational). */
  failed_verifiers: readonly string[];
}

/**
 * Pre-flight key — substitution scans the same symbol on the same side, so the
 * Map key must encode both. Convention: `${symbol}|${side}`.
 */
export type PreflightKey = `${string}|${'long' | 'short'}`;

export function preflightKey(symbol: string, side: 'long' | 'short'): PreflightKey {
  return `${symbol}|${side}` as PreflightKey;
}

/**
 * Current open position as the planner consumes it. NORMALIZED — the boundary
 * (orchestrator at E2) maps BrokerPosition → CurrentPosition, populating the
 * derived `side` from the sign of qty and asserting market_value/current_price
 * presence (throws MissingCurrentPositionFieldError otherwise). This narrow
 * shape keeps the pure layer decoupled from the broker SDK.
 */
export interface CurrentPosition {
  symbol: string;
  side: 'long' | 'short';   // derived: qty > 0 → long, qty < 0 → short
  qty: number;              // signed
  market_value: number;     // signed; |market_value| is the dollar notional currently held
  current_price: number;    // > 0
}

/**
 * Working-order projection consumed by the planner (DEC-070 clause b).
 *
 * Decoupled from `InFlightOrder` to keep the pure kernel free of the
 * state-machine type surface — the orchestrator maps `reconstructInFlight()`
 * output to this narrow shape. Carries the working REMAINDER price basis +
 * size needed to compute `effective_current = position_mv + Σ working_notional`.
 *
 * Notional basis (load-bearing — see clause b prose): use the working
 * order's `current_limit_price` (the price at which it will fill), NOT
 * the live quote. The working order represents committed dollars at that
 * limit; using the quote would double-jitter the delta against quote noise.
 *
 * Remaining-qty basis (load-bearing): `remaining = shares − (filled_qty ??
 * 0)`. The filled segment is ALREADY counted in broker `market_value`; only
 * the remainder represents incremental notional in flight.
 */
export interface WorkingOrderView {
  symbol: string;
  /** Position-side semantic the working order moves toward: `buy` open/increase
   *  for a long → 'long'; `sell` close/decrease for a long → 'long'; etc. */
  side: 'long' | 'short';
  broker_side: 'buy' | 'sell';
  /** Original order qty (broker-reported). */
  shares: number;
  /** Broker-reported filled qty for partially_filled orders; default 0. */
  filled_qty?: number;
  /** Working limit price — the notional basis. > 0. */
  current_limit_price: number;
}

/**
 * Compute the signed notional adjustment a working order contributes to
 * effective-current. Convention mirrors `CurrentPosition.market_value`
 * (long-position positive, short-position positive-magnitude with negative
 * sign): a long-open BUY adds +notional; a long-close SELL subtracts
 * notional; a short-open SELL adds −notional (drives mv more negative);
 * a short-close BUY adds +notional (drives mv toward zero from below).
 */
export function workingOrderSignedNotional(o: WorkingOrderView): number {
  const remaining = Math.max(0, o.shares - (o.filled_qty ?? 0));
  if (!(remaining > 0) || !(o.current_limit_price > 0)) return 0;
  const gross = remaining * o.current_limit_price;
  // Sign rules: the working order moves position mv in the direction of
  //   long+buy = +gross   (open/increase long)
  //   long+sell = −gross  (decrease/close long)
  //   short+sell = −gross (open/increase short, mv more negative)
  //   short+buy = +gross  (decrease/close short, mv toward zero)
  if (o.side === 'long') return o.broker_side === 'buy' ? +gross : -gross;
  return o.broker_side === 'sell' ? -gross : +gross;
}

// ────────────────────────────────────────────────────────────────────────────
// Intermediate (in-module, NOT exported as part of the public planRebalance
// surface — but EXPORTED here for the dedicated unit tests of selectFinalTargets).
// ────────────────────────────────────────────────────────────────────────────

export type SelectionReason = 'primary' | 'substitute' | 'one_fewer_fallback';

/**
 * Provenance-carrying selected target. The provenance fields
 * (selection_reason / substituted_from_symbol / original_rank) are LOAD-BEARING
 * — they flow through to ExecutionDelta as first-class fields so E5's audit
 * writer and the operator's rebalance-preview surface read them directly
 * without reconstruction (reconstruction is impossible-correct: the substitute
 * candidate's own original_rank is not derivable post-hoc from the symbol
 * alone, since the same symbol can occupy different ranks on different days).
 */
export interface SelectedTarget {
  symbol: string;
  side: 'long' | 'short';
  sector: string | null;
  /** Dollar target for this name at the as_of close (sign: positive for long, negative for short). */
  target_notional: number;
  original_rank: number;                     // 1..SUBSTITUTION_SCAN_CAP_RANK on its OWN ranking
  substituted_from_symbol: string | null;    // null when selection_reason='primary'
  selection_reason: SelectionReason;
  /** For audit: the score the candidate carried on its side. */
  score: number;
  ranker_source: string;
}

/**
 * The book-construction summary the planner emits ALONGSIDE the deltas — feeds
 * the operator rebalance-preview + the structured audit envelope at E5.
 */
export interface BookConstructionSummary {
  book_size: number;                              // selected_long.length + selected_short.length
  book_size_long: number;
  book_size_short: number;
  substitution_attempts_long: number;
  substitution_attempts_short: number;
  substitutions_made_long: number;
  substitutions_made_short: number;
  one_fewer_fallbacks_long: number;
  one_fewer_fallbacks_short: number;
  capital_base: number;
  per_name_notional: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Output: ExecutionDelta carries the provenance as FIRST-CLASS fields.
// ────────────────────────────────────────────────────────────────────────────

export type DeltaIntent = 'open' | 'increase' | 'decrease' | 'close' | 'noop';

export interface ExecutionDelta {
  symbol: string;
  /** For close intents (no longer in selected set), echoes the CURRENT side. */
  side: 'long' | 'short';
  intent: DeltaIntent;
  /** Signed dollar delta to apply: target_notional - current_market_value.
   *  For `close`, equals -current_market_value (drives the position to zero). */
  delta_notional: number;
  /** Sign-preserved dollar target; 0 for `close` (post-trade target is zero). */
  target_notional: number;
  /** Signed dollar value currently held; 0 for `open`. */
  current_market_value: number;
  /** Noop-band threshold actually applied to this row — = max(NOOP_PCT*|target|, NOOP_FLOOR_USD). */
  noop_band_usd: number;
  // ── PROVENANCE (first-class, flows from SelectedTarget; null for close/noop-without-selection). ──
  selection_reason: SelectionReason | null;
  substituted_from_symbol: string | null;
  original_rank: number | null;
  sector: string | null;
  /** Snapshot of the kernel's injected ts (ISO). */
  computed_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// selectFinalTargets — DEC-068 clause (j) substitution pre-pass.
// ────────────────────────────────────────────────────────────────────────────

export interface SelectFinalTargetsParams {
  rankings: readonly RankingRow[];
  preflightResults: ReadonlyMap<PreflightKey, PreflightResult>;
  /** D4 — operator-configurable, default 1.0. */
  allocationPct?: number;
  /** D5 — locked at 1.0 for paper bootstrap (DEC-067). */
  leverage?: number;
  /** Account equity in dollars; used as the sizing basis (DEC-067 default). */
  capitalBase: number;
}

export interface SelectFinalTargetsResult {
  selected: readonly SelectedTarget[];
  summary: BookConstructionSummary;
}

/**
 * The substitution pre-pass. Per DEC-068 clause (j):
 *
 *   For each side ∈ {long, short}:
 *     1. Take top-PRIMARY_BOOK_TOP_N_PER_SIDE candidates (rank 1..N) on that side.
 *     2. For each, if its INJECTED pre-flight result PASSES, accept as 'primary'.
 *     3. If it FAILS, scan same-side ranks [N+1, SUBSTITUTION_SCAN_CAP_RANK]
 *        in ascending rank order for the FIRST candidate that is BOTH:
 *          (a) sector-legal — its sector count among CURRENTLY-ACCEPTED names
 *              on this side is < SECTOR_CAP_PER_SIDE (re-read per substitution,
 *              NOT snapshotted; a prior substitute shifts the legality landscape).
 *          (b) pre-flight-passing — its own injected PreflightResult.passed=true.
 *        Substitute as 'substitute' (provenance stamped with substituted_from).
 *     4. If no substitute found by rank SUBSTITUTION_SCAN_CAP_RANK → record a
 *        'one_fewer_fallback' (no SelectedTarget materialized for this slot).
 *     5. Bound: at most MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY substitution
 *        SCANS per side per call. Beyond the bound, additional failures fall
 *        through to one-fewer without scanning (preserves the bound's
 *        load-limiting purpose).
 *
 * The count of "rank-positions scanned" — NOT "candidates accepted" — is what
 * the bound counts. Candidates skipped for sector-illegality count toward the
 * SCAN; they do not consume a substitution_attempt slot beyond the one scan
 * already initiated for the failing primary.
 *
 * Sizing: per_name_notional = (capital_base × allocationPct × leverage) /
 *         book_size, where book_size = selected_long + selected_short (post-
 *         substitution). One-fewer fallbacks REDUCE book_size, which RAISES
 *         per_name_notional — preserving capital-base utilization per
 *         DEC-067's sizing model.
 */
export function selectFinalTargets(p: SelectFinalTargetsParams): SelectFinalTargetsResult {
  const allocationPct = p.allocationPct ?? DEFAULT_ALLOCATION_PCT;
  const leverage = p.leverage ?? LEVERAGE_PAPER_LOCK;

  if (!Number.isFinite(allocationPct) || !(allocationPct > 0 && allocationPct <= 1)) {
    throw new AllocationOutOfRangeError(allocationPct);
  }
  if (leverage !== LEVERAGE_PAPER_LOCK) {
    throw new LeverageLockViolationError(leverage);
  }
  if (!Number.isFinite(p.capitalBase) || p.capitalBase <= 0) {
    throw new NonPositiveEquityError(p.capitalBase);
  }

  // Build side-ordered candidate lists (rank 1..SUBSTITUTION_SCAN_CAP_RANK).
  const longByRank: RankingRow[] = [];
  const shortByRank: RankingRow[] = [];
  for (const r of p.rankings) {
    if (r.long_rank >= 1 && r.long_rank <= SUBSTITUTION_SCAN_CAP_RANK) longByRank.push(r);
    if (r.short_rank >= 1 && r.short_rank <= SUBSTITUTION_SCAN_CAP_RANK) shortByRank.push(r);
  }
  longByRank.sort((a, b) => a.long_rank - b.long_rank);
  shortByRank.sort((a, b) => a.short_rank - b.short_rank);

  type SideRunResult = {
    selected: SelectedTarget[];
    substitution_attempts: number;
    substitutions_made: number;
    one_fewer_fallbacks: number;
  };

  const runSide = (
    side: 'long' | 'short',
    byRank: readonly RankingRow[],
  ): SideRunResult => {
    const acceptedSectorCounts = new Map<string, number>();
    const selected: SelectedTarget[] = [];
    let substitution_attempts = 0;
    let substitutions_made = 0;
    let one_fewer_fallbacks = 0;

    const rankOf = (r: RankingRow) => (side === 'long' ? r.long_rank : r.short_rank);
    const scoreOf = (r: RankingRow) => (side === 'long' ? r.long_score : r.short_score);

    const primaryCandidates = byRank.filter((r) => rankOf(r) <= PRIMARY_BOOK_TOP_N_PER_SIDE);
    const substitutePool = byRank.filter((r) => rankOf(r) > PRIMARY_BOOK_TOP_N_PER_SIDE);

    const accept = (
      r: RankingRow,
      reason: SelectionReason,
      substituted_from: string | null,
    ) => {
      selected.push({
        symbol: r.ticker,
        side,
        sector: r.gics_sector,
        target_notional: 0,  // patched after book_size known
        original_rank: rankOf(r),
        substituted_from_symbol: substituted_from,
        selection_reason: reason,
        score: scoreOf(r),
        ranker_source: r.ranker_source,
      });
      if (r.gics_sector) {
        acceptedSectorCounts.set(
          r.gics_sector,
          (acceptedSectorCounts.get(r.gics_sector) ?? 0) + 1,
        );
      }
    };

    const sectorLegal = (r: RankingRow): boolean => {
      if (!r.gics_sector) return true;  // null sector = no cap binding
      return (acceptedSectorCounts.get(r.gics_sector) ?? 0) < SECTOR_CAP_PER_SIDE;
    };

    const isPassing = (r: RankingRow): boolean => {
      const pf = p.preflightResults.get(preflightKey(r.ticker, side));
      // Absent pre-flight result = treat as failed (typed-absence is safer than
      // typed-pass; the orchestrator at E2 is responsible for populating).
      return pf?.passed === true;
    };

    // Track substitute-pool symbols already consumed (one substitute per slot).
    const consumedSubs = new Set<string>();

    for (const primary of primaryCandidates) {
      if (isPassing(primary) && sectorLegal(primary)) {
        accept(primary, 'primary', null);
        continue;
      }
      // Primary either failed pre-flight OR is sector-illegal at this point in
      // the sequential pass. Initiate one substitution scan (counts against bound).
      if (substitution_attempts >= MAX_SUBSTITUTION_ATTEMPTS_PER_SIDE_PER_DAY) {
        one_fewer_fallbacks++;
        continue;
      }
      substitution_attempts++;
      let substituted = false;
      for (const cand of substitutePool) {
        if (consumedSubs.has(cand.ticker)) continue;
        // Sector counts + pre-flight RE-READ here (sequential — a prior
        // substitute may have shifted the legality landscape).
        if (!sectorLegal(cand)) continue;
        if (!isPassing(cand)) continue;
        accept(cand, 'substitute', primary.ticker);
        consumedSubs.add(cand.ticker);
        substitutions_made++;
        substituted = true;
        break;
      }
      if (!substituted) one_fewer_fallbacks++;
    }

    return { selected, substitution_attempts, substitutions_made, one_fewer_fallbacks };
  };

  const longRun = runSide('long', longByRank);
  const shortRun = runSide('short', shortByRank);

  const book_size = longRun.selected.length + shortRun.selected.length;
  const capital_base = p.capitalBase * allocationPct * leverage;

  // Empty selection = zero per_name_notional (legitimate edge case; deltas =
  // close-only for whatever current positions exist).
  const per_name_notional = book_size > 0 ? capital_base / book_size : 0;

  // Patch target_notional with sign convention: long positive, short negative.
  for (const t of longRun.selected) t.target_notional = per_name_notional;
  for (const t of shortRun.selected) t.target_notional = -per_name_notional;

  return {
    selected: [...longRun.selected, ...shortRun.selected],
    summary: {
      book_size,
      book_size_long: longRun.selected.length,
      book_size_short: shortRun.selected.length,
      substitution_attempts_long: longRun.substitution_attempts,
      substitution_attempts_short: shortRun.substitution_attempts,
      substitutions_made_long: longRun.substitutions_made,
      substitutions_made_short: shortRun.substitutions_made,
      one_fewer_fallbacks_long: longRun.one_fewer_fallbacks,
      one_fewer_fallbacks_short: shortRun.one_fewer_fallbacks,
      capital_base,
      per_name_notional,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// computeDeltas — pure notional delta over (selected ∪ current).
// ────────────────────────────────────────────────────────────────────────────

export interface ComputeDeltasParams {
  selectedTargets: readonly SelectedTarget[];
  currentPositions: readonly CurrentPosition[];
  ts: Date;
  noopPct?: number;
  noopFloorUsd?: number;
}

export function computeDeltas(p: ComputeDeltasParams): ExecutionDelta[] {
  const noopPct = p.noopPct ?? NOOP_PCT;
  const noopFloor = p.noopFloorUsd ?? NOOP_FLOOR_USD;
  const computed_at = p.ts.toISOString();

  const targetsBySymbol = new Map<string, SelectedTarget>();
  for (const t of p.selectedTargets) targetsBySymbol.set(t.symbol, t);

  const currentBySymbol = new Map<string, CurrentPosition>();
  for (const c of p.currentPositions) {
    // Boundary contract — narrow shape assertions (the orchestrator is
    // expected to enforce these before injection; we double-check defensively).
    if (!Number.isFinite(c.market_value)) {
      throw new MissingCurrentPositionFieldError(c.symbol, 'market_value');
    }
    if (!Number.isFinite(c.current_price) || c.current_price <= 0) {
      throw new MissingCurrentPositionFieldError(c.symbol, 'current_price');
    }
    currentBySymbol.set(c.symbol, c);
  }

  const out: ExecutionDelta[] = [];
  const allSymbols = new Set<string>([
    ...targetsBySymbol.keys(),
    ...currentBySymbol.keys(),
  ]);

  for (const symbol of allSymbols) {
    const target = targetsBySymbol.get(symbol);
    const current = currentBySymbol.get(symbol);

    if (target && current && target.side !== current.side) {
      throw new OppositeSideOpenPositionError(symbol, current.side, target.side);
    }

    const target_notional = target?.target_notional ?? 0;
    const current_mv = current?.market_value ?? 0;
    const delta_notional = target_notional - current_mv;
    const noop_band = Math.max(noopPct * Math.abs(target_notional), noopFloor);

    let intent: DeltaIntent;
    if (!target && current) {
      intent = 'close';
    } else if (target && !current) {
      // |target| > 0 by construction (per_name_notional > 0 when book non-empty).
      intent = Math.abs(target_notional) > 0 ? 'open' : 'noop';
    } else if (target && current) {
      if (Math.abs(delta_notional) <= noop_band) {
        intent = 'noop';
      } else {
        intent = Math.abs(target_notional) > Math.abs(current_mv) ? 'increase' : 'decrease';
      }
    } else {
      // Unreachable: symbol came from union of two non-empty sets.
      continue;
    }

    out.push({
      symbol,
      side: target?.side ?? current!.side,
      intent,
      delta_notional: intent === 'close' ? -current_mv : delta_notional,
      target_notional: intent === 'close' ? 0 : target_notional,
      current_market_value: current_mv,
      noop_band_usd: noop_band,
      selection_reason: target?.selection_reason ?? null,
      substituted_from_symbol: target?.substituted_from_symbol ?? null,
      original_rank: target?.original_rank ?? null,
      sector: target?.sector ?? null,
      computed_at,
    });
  }

  // Deterministic ordering: long-first then by symbol ASC (mirrors target-position-builder).
  out.sort((a, b) => {
    if (a.side !== b.side) return a.side === 'long' ? -1 : 1;
    if (a.symbol < b.symbol) return -1;
    if (a.symbol > b.symbol) return 1;
    return 0;
  });
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// planRebalance — thin entry composing the two pure functions.
// ────────────────────────────────────────────────────────────────────────────

export interface PlanRebalanceParams {
  rankings: readonly RankingRow[];
  preflightResults: ReadonlyMap<PreflightKey, PreflightResult>;
  currentPositions: readonly CurrentPosition[];
  ts: Date;
  capitalBase: number;
  allocationPct?: number;
  leverage?: number;
  noopPct?: number;
  noopFloorUsd?: number;
}

export interface PlanRebalanceResult {
  selected: readonly SelectedTarget[];
  deltas: readonly ExecutionDelta[];
  summary: BookConstructionSummary;
}

export function planRebalance(p: PlanRebalanceParams): PlanRebalanceResult {
  // Witness: full expected book = 2 * PRIMARY_BOOK_TOP_N_PER_SIDE = FULL_BOOK_SIZE.
  // (Used in tests; not enforced here — partial books are legitimate per DEC-067.)
  void FULL_BOOK_SIZE;

  const sel = selectFinalTargets({
    rankings: p.rankings,
    preflightResults: p.preflightResults,
    capitalBase: p.capitalBase,
    allocationPct: p.allocationPct,
    leverage: p.leverage,
  });
  const deltas = computeDeltas({
    selectedTargets: sel.selected,
    currentPositions: p.currentPositions,
    ts: p.ts,
    noopPct: p.noopPct,
    noopFloorUsd: p.noopFloorUsd,
  });
  return { selected: sel.selected, deltas, summary: sel.summary };
}