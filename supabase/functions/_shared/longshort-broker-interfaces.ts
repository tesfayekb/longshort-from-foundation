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