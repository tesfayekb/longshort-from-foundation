/**
 * NullBorrowRateFetcher (EDGE-RESIDENT) — DW-162a anti-sentinel adapter.
 *
 * Implements `BrokerBorrowRateFetcher` against Alpaca paper, which DOES NOT
 * expose a numeric `annual_rate_pct` field. The free/paper API surfaces only
 * `easy_to_borrow: boolean | null` via `/v2/assets/{symbol}`.
 *
 * DESIGN: this adapter `fetchBorrowRate(...)` ALWAYS THROWS a typed
 * `BorrowRateUnavailableError` carrying the REAL broker-emitted `is_htb`
 * (derived from `!easy_to_borrow` via the existing
 * `BrokerShortabilityFetcher`). It does NOT synthesize, default, or sentinel
 * a numeric rate (§9 SENTINEL anti-pattern — explicitly forbidden by the
 * squeeze-protection charter, DW-162a reconciliation).
 *
 * Why a throw rather than a "boolean-only" return shape: the
 * `BrokerBorrowRate` contract requires `annual_rate_pct: number` —
 * fabricating a value (0, NaN, -1, etc.) to satisfy the type would BE the
 * sentinel anti-pattern. Throwing is the honest, typed-absence path
 * (DEC-034 (3) propagation; §2 axiom 3 typed-absence).
 *
 * VERIFIER WIRING: `verify_borrow_rate` (#7) catches via its existing
 * fetcher-throws path, which already has a failure_action ("if rate cannot
 * be obtained, treat as HTB and skip short entry" — §11.0.7 #7 verbatim).
 * That branch correctly fires for any name today. The rate-DRIFT branches
 * (`bps_diff > 50`, `bps_diff ≥ 200`) remain unreachable until a numeric
 * vendor lands (DW-162b / DW-166 vendor charter). #7 stays classified
 * **STUBBED-vendor-gated** in the conformance audit — the proxy does NOT
 * relabel it IMPLEMENTED.
 *
 * The `is_htb` payload on the error lets callers that need only the
 * boolean (e.g., a future preflight cross-check) read it without
 * re-issuing the shortability fetch.
 */

import type {
  BrokerBorrowRate,
  BrokerBorrowRateFetcher,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';

export class BorrowRateUnavailableError extends Error {
  readonly kind = 'borrow_rate_unavailable' as const;
  readonly symbol: string;
  /** Real broker-emitted HTB boolean (derived from `!easy_to_borrow`).
   *  `null` when the underlying shortability fetch itself yielded
   *  `easy_to_borrow: null` — typed-absence, NOT a synthesized default. */
  readonly is_htb: boolean | null;
  /** Stable provenance — the vendor gate that produced the absence. */
  readonly reason = 'alpaca_paper_no_numeric_borrow_rate' as const;
  constructor(symbol: string, is_htb: boolean | null, message?: string) {
    super(message ?? `borrow rate unavailable for ${symbol} (vendor-gated; DW-162b/DW-166)`);
    this.name = 'BorrowRateUnavailableError';
    this.symbol = symbol;
    this.is_htb = is_htb;
  }
}

export class NullBorrowRateFetcher implements BrokerBorrowRateFetcher {
  constructor(private readonly shortabilityFetcher: BrokerShortabilityFetcher) {}

  async fetchBorrowRate(symbol: string, ts: Date): Promise<BrokerBorrowRate> {
    // Resolve the REAL `is_htb` from the shortability fetch (no synthesis).
    // If even the shortability fetch fails, propagate that error — the
    // verifier's existing fetcher-throws path handles it.
    const snap = await this.shortabilityFetcher.fetchShortability(symbol, ts);
    const is_htb: boolean | null =
      typeof snap.easy_to_borrow === 'boolean' ? !snap.easy_to_borrow : null;
    // ALWAYS THROW — never return a synthesized numeric rate. §9 SENTINEL
    // anti-pattern. The thrown error carries the real `is_htb` so callers
    // that need the boolean can read it without a duplicate fetch.
    throw new BorrowRateUnavailableError(symbol, is_htb);
  }
}