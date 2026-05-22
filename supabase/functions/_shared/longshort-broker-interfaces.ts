/**
 * longshort-broker-interfaces — Broker API contracts consumed by verify_* implementations.
 *
 * Owner: longshort (sub-step 6.3a)
 *
 * These interfaces define the SHAPE of broker API access without binding to any specific
 * broker SDK. Real implementations land at sub-step 6.7 (Alpaca paper integration).
 * Sub-step 6.3a verifier tests use mock implementations of these interfaces.
 *
 * Each interface corresponds to one capability that one or more verify_*'s need:
 *   - BrokerPositionFetcher       used by verify_position (#1)
 *   - BrokerQuoteFetcher          used by verify_quote (#2) + verify_quote_freshness (#3)
 *   - BrokerLocateFetcher         used by verify_short_availability (#4)
 *   - BrokerSSRStatusFetcher      used by verify_ssr_status (#5)
 *
 * Future batches (6.3b/c/d) will add:
 *   - BrokerHaltStatusFetcher, BrokerBorrowRateFetcher, BrokerBuyingPowerFetcher,
 *     BrokerOrderStatusFetcher, BrokerCorporateActionFetcher, etc.
 *
 * Design discipline: each interface returns a structured result with explicit success/failure
 * branches. NO sentinel returns (per DEC-034 clause (2)); NO silent network failures.
 */

/** Position state from broker. Returned by verify_position invoke. */
export interface BrokerPosition {
  symbol: string;
  qty: number;             // signed: negative for short positions
  avg_entry_price: number; // dollars per share
  fetched_at: Date;        // when the broker call returned this snapshot
}

export interface BrokerPositionFetcher {
  /**
   * Fetch position for one symbol. Throws on network/auth errors (reconcile() lifecycle
   * propagates the throw and records `system_bug` outcome). Returns null only if the
   * broker explicitly reports the symbol has NO position (not a fetch failure).
   */
  fetchPosition(symbol: string, ts: Date): Promise<BrokerPosition | null>;
}

/** Quote from one source (signal-source = Polygon; reconciliation-source = Tradier/Yahoo; broker-source = Alpaca). */
export interface BrokerQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number | null;       // null if no recent trade in this session
  ts: Date;                  // when the broker generated the quote (NOT when we received it)
  source: string;            // 'polygon' | 'tradier' | 'alpaca' for diagnostic linkage
}

export interface BrokerQuoteFetcher {
  /** Fetch latest quote for symbol from the implementation's underlying source. */
  fetchQuote(symbol: string, ts: Date): Promise<BrokerQuote>;
}

/** Locate response from broker's short-availability service. */
export interface BrokerLocateResult {
  symbol: string;
  available: boolean;         // false explicit response, NOT default-on-failure
  locate_id: string | null;   // null only when available=false
  qty_available: number | null; // max shares borrowable; null when available=false
  fetched_at: Date;
}

export interface BrokerLocateFetcher {
  /**
   * Fetch locate result for symbol. Per §11.0.7 #4 failure action: "skip short entry; do NOT
   * substitute long; do NOT default to 'assume available'." Network/auth errors throw; locate
   * absence returns `available: false` explicitly (not default-on-failure).
   */
  fetchLocate(symbol: string, ts: Date): Promise<BrokerLocateResult>;
}

/** SSR (Short Sale Restriction) status from exchange feed. Tri-state per §11.0.7 #5. */
export type SSRState = 'not_active' | 'active' | 'indeterminate';

export interface BrokerSSRStatusResult {
  symbol: string;
  state: SSRState;
  source: string;            // exchange feed source for diagnostic linkage
  fetched_at: Date;
}

export interface BrokerSSRStatusFetcher {
  /**
   * Fetch SSR status for symbol. Per §11.0.7 #5: tri-state outcome. `indeterminate` is the
   * explicit "cannot determine within timeout" branch — refuse to submit short on this symbol
   * this tick, retry next tick. NOT a fetch failure (those throw); a real "we asked but the
   * exchange feed didn't answer in time" state.
   */
  fetchSSRStatus(symbol: string, ts: Date): Promise<BrokerSSRStatusResult>;
}

// ────────────────────────────────────────────────────────────────────
// Sub-step 6.3b additions (verify_*'s #6-#10 broker contracts)
// ────────────────────────────────────────────────────────────────────

/** Exchange halt status. Per §11.0.7 #6 — exchange feed returns halted/not-halted with optional sub-reason. */
export interface BrokerHaltStatus {
  symbol: string;
  halted: boolean;
  halt_reason: string | null;  // exchange-provided reason code when halted; null when not halted
  fetched_at: Date;
}

export interface BrokerHaltStatusFetcher {
  /** Fetch halt status for symbol from exchange feed. Throws on network/auth errors. */
  fetchHaltStatus(symbol: string, ts: Date): Promise<BrokerHaltStatus>;
}

/** Borrow rate (annualized percentage). Used by verify_borrow_rate (#7) per §11.0.7 + §3.3d short cost-basis. */
export interface BrokerBorrowRate {
  symbol: string;
  annual_rate_pct: number;     // e.g., 3.5 means 3.5% annualized
  is_htb: boolean;             // hard-to-borrow flag from broker
  fetched_at: Date;
}

export interface BrokerBorrowRateFetcher {
  /**
   * Fetch current borrow rate for symbol. Per §11.0.7 #7 failure action: "if rate cannot
   * be obtained, treat as HTB and skip short entry." Network/auth errors throw; broker
   * returning "no data" returns is_htb=true explicitly (not default-on-failure).
   */
  fetchBorrowRate(symbol: string, ts: Date): Promise<BrokerBorrowRate>;
}

/** Locate persistence response. Used by verify_borrow_persistence (#8); expected-divergence-aware per §11.0.7. */
export interface BrokerLocatePersistence {
  symbol: string;
  locate_id: string;
  still_valid: boolean;
  expired_at_ttl: boolean;     // TRUE if invalidation reason is normal TTL expiration (expected); FALSE if pre-TTL disappearance (unexpected)
  ttl_expires_at: Date | null; // documented TTL boundary; null when still_valid=true and no expiration imminent
  fetched_at: Date;
}

export interface BrokerLocatePersistenceFetcher {
  /**
   * Fetch locate persistence status. Per §11.0.7 #8 expected-divergence-aware:
   *   - End-of-TTL invalidation: still_valid=false, expired_at_ttl=true  -> expected_divergence_handled
   *   - Pre-TTL disappearance:   still_valid=false, expired_at_ttl=false -> failure_handled
   *   - Locate still valid:      still_valid=true                        -> false_positive_within_tolerance
   * Per §11.0.7 #8 verbatim: "Alpaca-specific behavior validated in Phase 0B; initial
   * implementation may be no-op pending clarification, but interface exists from day 1."
   * For 6.3b: real broker mocked; interface contract complete.
   */
  fetchLocatePersistence(symbol: string, locate_id: string, ts: Date): Promise<BrokerLocatePersistence>;
}

/** Buying power state. System-level per §11.0.7 #9 — applies to account, not symbol. */
export interface BrokerBuyingPower {
  available_bp: number;        // current available buying power in dollars per broker
  account_equity: number;      // account equity per broker
  fetched_at: Date;
}

export interface BrokerBuyingPowerFetcher {
  /**
   * Fetch buying power from broker. System-level: no symbol parameter.
   * Per §11.0.7 #9 + §11.0.9 line 269 magnitude escalation: 10% divergence between
   * internal_expected_bp and observed_bp triggers immediate failure_escalated.
   */
  fetchBuyingPower(ts: Date): Promise<BrokerBuyingPower>;
}

/** Universe membership response. Used by verify_universe_membership (#10) per §11.0.7 + §11.0.6 stale-ranking detection. */
export interface UniverseMembershipStatus {
  symbol: string;
  in_universe: boolean;
  excluded: boolean;
  exclusion_reasons: string[]; // structured reason codes: 'in_ma', 'halted_5d_plus', 'earnings_window', 'low_volume', etc.
  fetched_at: Date;
}

export interface UniverseMembershipFetcher {
  /**
   * Fetch universe membership + exclusion status for symbol. Per §11.0.7 #10 + §11.0.6:
   * checks BOTH eligibility in universe AND absence from hard-exclusion list.
   * Per §11.0.9 line 273 structural escalation: if observed.excluded=true with reason
   * in {'in_ma', 'halted_5d_plus'} (materially-excluded conditions) but internal cache
   * shows in_universe=true -> single firing escalates immediately regardless of count.
   */
  fetchUniverseMembership(symbol: string, ts: Date): Promise<UniverseMembershipStatus>;
}