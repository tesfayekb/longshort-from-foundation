/**
 * target-position-builder — Step A pure compute kernel (FP-055 / ACT-302).
 *
 * Computes the daily TARGET STATE (per-ticker target dollar position)
 * for the long-short strategy off (book + capital). PURE: no Supabase,
 * no `Date.now()`, no randomness. `ts` is injected (DEC-034 clause 4);
 * `bookReader` + `capitalFetcher` are interfaces (mockable).
 *
 * SCOPE (load-bearing):
 *   - INPUT: combiner_book (via BookReader) + account_equity (via
 *     BrokerBuyingPowerFetcher.fetchBuyingPower(ts)). Two inputs only —
 *     broker POSITIONS are NOT read here (positions are the
 *     execution-layer delta surface, deferred to DW-046).
 *   - OUTPUT: target STATE (absolute per-name target_notional). NOT
 *     deltas; NOT orders; NO broker write; NO POST /v2/orders.
 *   - WITNESS only for §7.1 sector cap — assert per-(side,sector) ≤ 6;
 *     do NOT re-enforce. The cap is applied UPSTREAM at book assembly.
 *
 * SIZING MODEL (reconciled from operator intent v1 — supersedes the
 * spec's implicit "100% of invested capital" with two named params):
 *
 *     capital_base       = account_equity × allocation_pct × leverage
 *     per_name_notional  = capital_base / book_size
 *
 * Defaults: allocation_pct = 1.0 (full account), leverage = 1.0 (paper
 * lock). At those defaults a full 40-name book matches §1.5 verbatim
 * (2.5 % per name; 100 % gross; dollar-neutral when 20L+20S).
 *
 * D5 LEVERAGE LOCK (load-bearing):
 *   The kernel ASSERTS leverage === 1.0 and throws
 *   `LeverageLockViolationError` if violated. Spec §1 L95/L155
 *   ("Not a leveraged strategy in v1. 100% gross exposure, no margin
 *   borrowing." / "Leverage: None. Strategy operates at 100% gross.")
 *   is HONORED in the live path via this assertion. Leverage is a
 *   named PARAM (not a literal) so the future Phase-8 DEC (DW-136)
 *   can ratify slider unlock at 1.0–2.0 without a kernel rewrite —
 *   but until that DEC lands the kernel refuses any non-1.0 value.
 *
 * D4 ALLOCATION:
 *   allocation_pct ∈ (0, 1]. Validated; throws
 *   `AllocationOutOfRangeError` otherwise. Default 1.0; operator
 *   dashboard surface (forthcoming) will set per-day.
 *
 * D3 PARTIAL BOOK:
 *   If the book has fewer than the expected 40 rows (small-universe
 *   replay / degenerate as_of), the kernel divides capital_base by the
 *   actual `book_size`. No per-name re-distribution beyond that natural
 *   division. Empty book → zero targets (noop, not an error).
 *
 * Owner: longshort (Step A — FP-055).
 */

import type { BrokerBuyingPowerFetcher } from '../longshort-broker-interfaces.ts';

/** Paper-bootstrap leverage lock. Phase-8 DEC (DW-136) supersedes. */
export const LEVERAGE_PAPER_LOCK = 1.0 as const;

/** Default account allocation when operator config absent. */
export const DEFAULT_ALLOCATION_PCT = 1.0 as const;

/** Sizing basis literal — bound to BrokerBuyingPower.account_equity. */
export const DEFAULT_SIZING_BASIS = 'account_equity' as const;

/** Expected full book size at non-degenerate as_of (20L + 20S). */
export const FULL_BOOK_SIZE = 40 as const;

/** §7.1 — per-(side, sector) maximum slot count. Witness only. */
export const SECTOR_CAP_PER_SIDE = 6 as const;

// ─── Typed errors (anti-phantom-defaults; no silent sentinels) ──────────────

export class LeverageLockViolationError extends Error {
  readonly attempted: number;
  constructor(attempted: number) {
    super(
      `leverage_locked_at_1_for_paper_bootstrap_see_phase8_dec ` +
        `(attempted=${attempted})`,
    );
    this.name = 'LeverageLockViolationError';
    this.attempted = attempted;
  }
}

export class AllocationOutOfRangeError extends Error {
  readonly attempted: number;
  constructor(attempted: number) {
    super(
      `allocation_pct_out_of_range_must_be_gt_0_and_le_1 ` +
        `(attempted=${attempted})`,
    );
    this.name = 'AllocationOutOfRangeError';
    this.attempted = attempted;
  }
}

export class SectorCapViolationError extends Error {
  readonly side: 'long' | 'short';
  readonly sector: string;
  readonly count: number;
  constructor(side: 'long' | 'short', sector: string, count: number) {
    super(
      `sector_cap_violation_witness_upstream_book_invariant_breached ` +
        `(side=${side} sector=${sector} count=${count} cap=${SECTOR_CAP_PER_SIDE})`,
    );
    this.name = 'SectorCapViolationError';
    this.side = side;
    this.sector = sector;
    this.count = count;
  }
}

export class NonPositiveEquityError extends Error {
  readonly attempted: number;
  constructor(attempted: number) {
    super(
      `account_equity_non_positive_cannot_size ` +
        `(account_equity=${attempted})`,
    );
    this.name = 'NonPositiveEquityError';
    this.attempted = attempted;
  }
}

// ─── Inputs / outputs ───────────────────────────────────────────────────────

/** One row from combiner_book + (optional) sector lineage for §7.1 witness. */
export interface BookRowInput {
  side: 'long' | 'short';
  rank_within_side: number;
  ticker: string;
  score: number;
  ranker_source: string;
  /** combiner_book.computed_at — lineage to the book row this target
   *  derives from. Threaded through to TargetPosition.book_ref_computed_at. */
  computed_at: string;
  /** Optional — supplied by orchestrator via combiner_rankings join.
   *  When present, kernel performs the §7.1 witness; when null, witness
   *  is skipped (degraded replay or fixture without sector lineage). */
  gics_sector?: string | null;
}

export interface BookReader {
  /** Read the combiner_book rows for (operator, as_of_date). May return
   *  an empty array — kernel treats that as a noop, NOT an error. */
  readBook(operatorId: string, asOfDate: string): Promise<BookRowInput[]>;
}

/** Persisted TargetPosition row (matches longshort_target_positions). */
export interface TargetPosition {
  operator_id: string;
  as_of_date: string;
  side: 'long' | 'short';
  ticker: string;
  /** Dollar target for this name at the as_of close. */
  target_notional: number;
  /** NULL at Step A — requires a fill price; populated by execution layer. */
  target_shares: null;
  allocation_pct: number;
  leverage: number;
  sizing_basis: 'account_equity';
  sizing_basis_value: number;
  capital_base: number;
  book_size: number;
  ranker_source: string;
  book_ref_computed_at: string;
  computed_at: string;
}

export interface ComputeTargetsParams {
  operatorId: string;
  /** YYYY-MM-DD. */
  asOfDate: string;
  /** Injected clock — sole `Date` source in the compute path (DEC-034 (4)). */
  ts: Date;
  capitalFetcher: BrokerBuyingPowerFetcher;
  bookReader: BookReader;
  /** D4 — operator-configurable. Default 1.0 (deploy full account). */
  allocationPct?: number;
  /** D5 — locked at 1.0 for the paper bootstrap. Phase-8 DEC unlocks. */
  leverage?: number;
  /** D1 — recommended binding for "current invested capital". */
  sizingBasis?: 'account_equity';
}

export interface ComputeTargetsResult {
  outcome: 'completed' | 'empty_book';
  targets: TargetPosition[];
  capital_base: number;
  book_size: number;
  book_size_long: number;
  book_size_short: number;
  sizing_basis_value: number;
  /** First book row's ranker_source — the book is single-source by
   *  construction (the ranker stamps one literal per fire). */
  ranker_source: string;
  per_name_notional: number;
}

// ─── Kernel ─────────────────────────────────────────────────────────────────

/**
 * Pure compute. Sequence:
 *   (1) Validate allocation_pct (D4).
 *   (2) Assert leverage lock (D5; throws if !== 1.0).
 *   (3) Read book. Empty → noop result.
 *   (4) Fetch capital. account_equity > 0 or throw.
 *   (5) capital_base = equity × allocation × leverage.
 *   (6) §7.1 sector-cap WITNESS (assert; do not re-enforce).
 *   (7) Materialize TargetPosition[] with per_name = capital_base / book_size.
 *
 * Throws on any invariant violation — no silent defaults, no phantom
 * zeros (DEC-034 (2)). Pre-persistence: caller (orchestrator) writes
 * ONLY on successful return.
 */
export async function computeTargets(
  p: ComputeTargetsParams,
): Promise<ComputeTargetsResult> {
  const allocationPct = p.allocationPct ?? DEFAULT_ALLOCATION_PCT;
  const leverage = p.leverage ?? LEVERAGE_PAPER_LOCK;
  const sizingBasis: 'account_equity' = p.sizingBasis ?? DEFAULT_SIZING_BASIS;

  // (1) D4 — allocation_pct ∈ (0, 1].
  if (!Number.isFinite(allocationPct) || !(allocationPct > 0 && allocationPct <= 1)) {
    throw new AllocationOutOfRangeError(allocationPct);
  }

  // (2) D5 LOCK — leverage MUST equal 1.0 in the paper bootstrap.
  //     Phase-8 DEC (DW-136) is the sole authority that can relax this.
  if (leverage !== LEVERAGE_PAPER_LOCK) {
    throw new LeverageLockViolationError(leverage);
  }

  // (3) Read book. Empty book is a noop (NOT an error).
  const book = await p.bookReader.readBook(p.operatorId, p.asOfDate);
  const ts_iso = p.ts.toISOString();

  if (book.length === 0) {
    return {
      outcome: 'empty_book',
      targets: [],
      capital_base: 0,
      book_size: 0,
      book_size_long: 0,
      book_size_short: 0,
      sizing_basis_value: 0,
      ranker_source: '',
      per_name_notional: 0,
    };
  }

  // (4) Fetch capital.
  const bp = await p.capitalFetcher.fetchBuyingPower(p.ts);
  const sizing_basis_value = bp.account_equity;
  if (!Number.isFinite(sizing_basis_value) || sizing_basis_value <= 0) {
    throw new NonPositiveEquityError(sizing_basis_value);
  }

  // (5) Capital base + per-name notional.
  const capital_base = sizing_basis_value * allocationPct * leverage;
  const book_size = book.length;
  const per_name_notional = capital_base / book_size;

  // (6) §7.1 WITNESS — per-(side, sector) ≤ 6. Only fires when
  //     gics_sector is present (orchestrator threads it from
  //     combiner_rankings; test fixtures may omit).
  const sectorCounts = new Map<string, number>();
  for (const r of book) {
    if (r.gics_sector) {
      const k = `${r.side}::${r.gics_sector}`;
      sectorCounts.set(k, (sectorCounts.get(k) ?? 0) + 1);
    }
  }
  for (const [key, count] of sectorCounts) {
    if (count > SECTOR_CAP_PER_SIDE) {
      const [side, sector] = key.split('::');
      throw new SectorCapViolationError(side as 'long' | 'short', sector, count);
    }
  }

  // (7) Materialize targets. Sort: long-first, then rank_within_side ASC
  //     for deterministic UPSERT shape (mirrors book-seeder).
  const sorted = [...book].sort((a, b) => {
    if (a.side !== b.side) return a.side === 'long' ? -1 : 1;
    return a.rank_within_side - b.rank_within_side;
  });

  const targets: TargetPosition[] = sorted.map((b) => ({
    operator_id: p.operatorId,
    as_of_date: p.asOfDate,
    side: b.side,
    ticker: b.ticker,
    target_notional: per_name_notional,
    target_shares: null,
    allocation_pct: allocationPct,
    leverage,
    sizing_basis: sizingBasis,
    sizing_basis_value,
    capital_base,
    book_size,
    ranker_source: b.ranker_source,
    book_ref_computed_at: b.computed_at,
    computed_at: ts_iso,
  }));

  let book_size_long = 0;
  let book_size_short = 0;
  for (const t of targets) {
    if (t.side === 'long') book_size_long++;
    else book_size_short++;
  }

  return {
    outcome: 'completed',
    targets,
    capital_base,
    book_size,
    book_size_long,
    book_size_short,
    sizing_basis_value,
    ranker_source: sorted[0].ranker_source,
    per_name_notional,
  };
}