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
  // ── FP-056 E1 additive extensions (DEC-068 clause j — book-construction
  //    delta computation). Optional on the interface to preserve byte-identical
  //    behavior for verify_position (#1), which reads ONLY {qty, avg_entry_price}
  //    and is unaffected by the presence/absence of these fields. The live
  //    AlpacaPositionFetcher (E2/E6 work — Alpaca GET /v2/{positions, positions/{symbol}}
  //    returns both natively) MUST populate these; the E1 rebalance-planner narrows
  //    via its own CurrentPosition shape and throws on absence at its boundary.
  market_value?: number;   // dollars; signed (negative for shorts). Alpaca: positions.market_value.
  current_price?: number;  // dollars per share, last mark. Alpaca: positions.current_price.
}

export interface BrokerPositionFetcher {
  /**
   * Fetch position for one symbol. Throws on network/auth errors (reconcile() lifecycle
   * propagates the throw and records `system_bug` outcome). Returns null only if the
   * broker explicitly reports the symbol has NO position (not a fetch failure).
   */
  fetchPosition(symbol: string, ts: Date): Promise<BrokerPosition | null>;

  /**
   * FP-056 E1 additive — list all currently-open broker positions (Alpaca
   * GET /v2/positions). Used by the rebalance-planner's CLOSE-ENUMERATION:
   * a current position whose symbol is NOT in the post-substitution selected
   * set materializes a `close` ExecutionDelta. Throws on network/auth errors.
   *
   * Optional on the interface so existing MOCK_POSITION_FETCHER call sites
   * (sub-step 6.3d reconciliation-tick dispatch) remain compliant without a
   * cross-module edit. The E1 boundary consumer narrows and throws if absent
   * (the live AlpacaPositionFetcher at E2/E6 supplies it).
   *
   * Live impl MUST populate the additive {market_value, current_price} fields
   * on every returned row (E1's planner consumes them).
   */
  listOpenPositions?(ts: Date): Promise<BrokerPosition[]>;
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

/**
 * Universe membership response. Used by verify_universe_membership (#10) per
 * §11.0.7 + §11.0.6 stale-ranking detection.
 *
 * FP-008.3 — SIDE-AWARE CONTRACT. The chokepoint answers: "can I trade
 * `symbol` on `side` for `operator_id`?" Prior side-agnostic shape fused
 * short-only hard-exclusions (e.g., §3.3d `htb_no_locate` typed-absence
 * default-fire) with long-eligibility lookups, over-firing every long
 * verification on every tick from FP-008.2 hard-exclusion-refresh onward.
 *
 * Fields:
 *   - `side`                — the side the call queried (echoed back for audit).
 *   - `in_universe`         — universe presence (side-agnostic: row exists in
 *                              universe_membership at as_of_date).
 *   - `eligible_for_side`   — `{side}_eligible` column from universe_membership
 *                              (write-time snapshot already factoring in §3.3
 *                              `applies_to` semantics per apply-hard-exclusions).
 *   - `excluded`            — TRUE iff at least one currently-firing
 *                              hard_exclusions rule applies to `side` or `'both'`.
 *   - `exclusion_reasons`   — side-filtered structured reason codes.
 */
export interface UniverseMembershipStatus {
  symbol: string;
  side: 'long' | 'short';
  in_universe: boolean;
  eligible_for_side: boolean;
  excluded: boolean;
  exclusion_reasons: string[];
  fetched_at: Date;
}

export interface UniverseMembershipFetcher {
  /**
   * Fetch universe membership + exclusion status for `symbol` on `side`. Per
   * §11.0.7 #10 + §11.0.6: checks BOTH per-side eligibility in universe AND
   * absence from side-applicable hard-exclusion list.
   *
   * Side filtering: hard_exclusions firings carry `applies_to ∈ {'long',
   * 'short', 'both'}` (per hard-exclusions/types.ts BookSide). A firing
   * contributes to `excluded`/`exclusion_reasons` only when its `applies_to`
   * matches the requested `side` or equals `'both'`.
   *
   * Per §11.0.9 line 273 structural escalation: if observed.excluded=true with
   * reason in {'in_ma', 'halted_5d_plus'} but internal cache shows
   * in_universe=true → single firing escalates immediately regardless of count.
   */
  fetchUniverseMembership(
    symbol: string,
    side: 'long' | 'short',
    ts: Date,
  ): Promise<UniverseMembershipStatus>;
}

// ────────────────────────────────────────────────────────────────────
// Sub-step 6.3c additions (verify_*'s #11-#14 broker contracts)
// ────────────────────────────────────────────────────────────────────

/** Corporate action snapshot for verify_corporate_action_clean (#11). */
export interface BrokerCorporateActionSnapshot {
  symbol: string;
  recent_action_within_lookback: boolean;  // true if a corporate action occurred within lookback_days
  action_type: string | null;              // 'split' / 'dividend' / 'merger' / 'spinoff' / etc; null when no action
  action_ts: Date | null;                  // when the corporate action occurred
  broker_basis_adjusted: boolean;          // true if broker's adjusted cost basis already reflects the action
  hours_since_action: number | null;       // wall-clock hours between action_ts and ts; null when no action
  fetched_at: Date;
}

export interface BrokerCorporateActionFetcher {
  /** Fetch corporate-action snapshot. Per §11.0.7 #11: returns whether recent CA exists + adjustment status. */
  fetchCorporateActionSnapshot(symbol: string, lookback_days: number, ts: Date): Promise<BrokerCorporateActionSnapshot>;
}

/** Settlement status for verify_settlement_status (#12). */
export interface BrokerSettlementStatus {
  symbol: string;
  side: 'long' | 'short';
  trade_ts: Date;                          // when the trade was executed
  settled: boolean;
  expected_settlement_ts: Date;            // typically trade_ts + T+1
  fetched_at: Date;
}

export interface BrokerSettlementStatusFetcher {
  /**
   * Fetch settlement status. Per §11.0.7 #12 + §11.0.9 line 235:
   *   - Pre-T+1 "not settled" = expected (expected_divergence_handled)
   *   - Post-T+1 "not settled" = failure_escalated (Zero-tolerance)
   *   - Settled = false_positive_within_tolerance
   */
  fetchSettlementStatus(symbol: string, side: 'long' | 'short', trade_ts: Date, ts: Date): Promise<BrokerSettlementStatus>;
}

/** Order acceptance status for verify_order_acceptance (#13). Tri-state per §11.0.7. */
export type OrderAcceptanceState = 'accepted' | 'rejected' | 'pending';

export interface BrokerOrderAcceptanceResult {
  order_id: string;
  symbol: string | null;                   // populated when broker associates order with symbol; null permitted
  state: OrderAcceptanceState;
  rejection_reason: string | null;         // populated when state='rejected'
  pending_elapsed_s: number;               // wall-clock seconds since order submission; relevant for state='pending'
  fetched_at: Date;
}

export interface BrokerOrderAcceptanceFetcher {
  /**
   * Fetch order acceptance status. Per §11.0.7 #13 tri-state:
   *   - accepted: broker confirmed
   *   - rejected: broker returned explicit rejection (Zero-tolerance per §11.0.9 line 234)
   *   - pending: no broker response within timeout_s; escalate polling but DO NOT cancel-and-retry
   *     (cancellation of a just-filled order creates phantom-rejection / retry-storm class — banned per §11.0.7 #13)
   */
  fetchOrderAcceptance(order_id: string, timeout_s: number, ts: Date): Promise<BrokerOrderAcceptanceResult>;
}

/** Realized P&L confirmation for verify_realized_pnl (#14). Broker confirm is ground truth per §11.0.7 + §11.0.10. */
export interface BrokerRealizedPnLConfirm {
  trade_id: string;
  symbol: string;
  broker_confirmed_pnl: number;            // dollars; positive = gain, negative = loss
  trade_ts: Date;
  fetched_at: Date;
}

export interface BrokerRealizedPnLFetcher {
  /**
   * Fetch broker's confirmed realized P&L for a closed trade. Strong+ tier per §11.0.10:
   * tax/regulatory retention indefinite. Zero-tolerance per §11.0.9 line 233: any non-trivial
   * divergence escalates immediately.
   */
  fetchRealizedPnL(trade_id: string, ts: Date): Promise<BrokerRealizedPnLConfirm>;
}

// ────────────────────────────────────────────────────────────────────
// Sub-step 6.3d additions (verify_*'s #15-#17 broker contracts)
// ────────────────────────────────────────────────────────────────────

/**
 * Lot record state for verify_lot_record (#15).
 * Note: the actual lot ledger table is Phase 1+ work. For 6.3d, the verifier ships with
 * the contract; mock fetchers exercise it. Real lot ledger integration comes later.
 */
export interface BrokerLotRecord {
  lot_id: string;
  symbol: string;
  entry_ts: Date;
  qty: number;
  cost_basis: number;
  side: 'long' | 'short';
  status: string;
  locate_id: string | null;
  fetched_at: Date;
}

export interface BrokerLotRecordFetcher {
  /**
   * Fetch lot record by lot_id. Per §11.0.7 #15: called after every lot write/update per
   * §7.5/§7.6/§7.9. Zero-tolerance per §11.0.9 line 234.
   */
  fetchLotRecord(lot_id: string, ts: Date): Promise<BrokerLotRecord>;
}

/**
 * Wash sale record state for verify_wash_sale_record (#16).
 * Note: wash_sale_events table is Phase 1+ work; mock fetchers for 6.3d.
 */
export interface BrokerWashSaleRecord {
  event_id: string;
  symbol: string;
  exit_ts: Date;
  realized_loss: number;
  lot_ids_affected: string[];
  status: string;
  block_until: Date | null;
  attached_to_lot_id: string | null;
  fetched_at: Date;
}

export interface BrokerWashSaleRecordFetcher {
  /**
   * Fetch wash sale event record by event_id. Per §11.0.7 #16. Zero-tolerance per
   * §11.0.9 line 234. Year-end ground-truth reconciliation against broker 1099-B /
   * Form 8949 per §11.0.10 Strong+ retention.
   */
  fetchWashSaleRecord(event_id: string, ts: Date): Promise<BrokerWashSaleRecord>;
}

/**
 * Rebalance aggregate state for verify_rebalance_aggregate (#17). System-level (no symbol).
 */
export interface BrokerRebalanceAggregate {
  long_gross_dollars: number;
  short_gross_dollars: number;
  rebalance_completed_at: Date;
  fetched_at: Date;
}

export interface BrokerRebalanceAggregateFetcher {
  /**
   * Fetch aggregate long/short gross dollars from broker positions per §11.0.7 #17.
   * Verifies 90-110% band per §1.6. Zero-tolerance per §11.0.9 line 234.
   * For 6.3d: mock fetcher; real Alpaca /v2/positions integration at 6.7.
   */
  fetchRebalanceAggregate(ts: Date): Promise<BrokerRebalanceAggregate>;
}

// ────────────────────────────────────────────────────────────────────
// FP-056 E2 additions (DEC-068 clause k — sequential submitter contract).
// ────────────────────────────────────────────────────────────────────

/**
 * Order request — the marketable-limit shape the E2 submitter posts to
 * Alpaca paper per DEC-068 clause (k).3 §8.2 named pricing constants.
 *
 * `type='limit'` + `time_in_force='day'` per clause (k).3 SHARE_ROUNDING +
 * TIF row. `qty` is integer whole-shares (Alpaca paper fractional-limit
 * orders carry TIF/marketable constraints that disqualify them at the
 * submitter boundary per clause (k).3).
 *
 * `client_order_id` is the per-target-per-tick idempotency key per DEC-031
 * T8; the E2 submitter generates it deterministically from (symbol, intent,
 * ts) so a re-submit produces an idempotent broker-side dedupe.
 */
export interface BrokerOrderRequest {
  symbol: string;
  qty: number;                       // integer whole shares
  side: 'buy' | 'sell';
  type: 'limit';                     // §8.2 marketable-limit posture
  time_in_force: 'day';              // §8.2 TIF=DAY
  limit_price: number;               // dollars; > 0
  client_order_id: string;           // T8 idempotency key
}

/**
 * Order acceptance return — the broker's response to a successful POST.
 * Equivalent to Alpaca's `POST /v2/orders` 200 response (subset). Per
 * DEC-034 (3): no swallow + phantom-success — the submitter THROWS on
 * broker error and the throw propagates upward.
 */
export interface BrokerOrderAcceptance {
  order_id: string;
  client_order_id: string;
  /** Broker-reported lifecycle: 'new' / 'pending_new' / 'accepted' / etc. */
  status: string;
  /** When the broker accepted the order (broker-side timestamp). */
  submitted_at: Date;
}

/**
 * The POST /v2/orders surface. The E2 submitter consumes ONE method; the
 * live AlpacaPaperClient.postJson wrapper that implements it goes through
 * the construction-time paper-only allow-list guard (DEC-068 clause k.8 +
 * INC-77 closure).
 *
 * Errors propagate (DEC-034 clause 3). Network errors throw
 * AlpacaNetworkError; 4xx/5xx throw AlpacaApiError carrying the broker's
 * structured rejection body so the E2 shell can classify into the typed
 * SubmissionResult union (accepted / rejected / pending_timeout).
 *
 * Phase-1 acceptance polling is the EXISTING `BrokerOrderAcceptanceFetcher`
 * (line 297 above); the E2 shell calls it after each successful POST.
 */
export interface BrokerOrderSubmitter {
  submitOrder(req: BrokerOrderRequest, ts: Date): Promise<BrokerOrderAcceptance>;
}

// ────────────────────────────────────────────────────────────────────
// FP-056 E3 additions (DEC-068 clause b — autonomous three-tier
// resolution; ACT-311). All additive; no edit to E1/E2 contracts.
// ────────────────────────────────────────────────────────────────────

/**
 * Phase-2 fill snapshot per §8.6 / §11.0.7. E3 polls via this each tick
 * for orders in `phase2_working` / `phase2_escalating`. Live impl =
 * Alpaca `GET /v2/orders/{order_id}` reading `filled_qty` + `status`.
 *
 * `filled: true` requires `filled_qty === requested_qty` (atomic fill —
 * partial fills are DW-140 deferred per DEC-068 clause (h); a partial
 * is reported as `filled: false` with `filled_qty > 0` until DW-140
 * lands the partial-fill branch).
 */
export interface BrokerFillResult {
  order_id: string;
  filled: boolean;
  filled_qty: number;
  avg_fill_price: number | null;
  fetched_at: Date;
}

export interface BrokerFillFetcher {
  fetchFill(order_id: string, ts: Date): Promise<BrokerFillResult>;
}

/**
 * Order cancellation surface — required for clause (b) Tier-1
 * cancel-and-replace escalation (NOT modify, per DW-141 deferral).
 * Live impl = Alpaca `DELETE /v2/orders/{order_id}`. Idempotent at
 * broker boundary: cancelling an already-terminal order is a no-op.
 */
export interface BrokerOrderCanceller {
  cancelOrder(order_id: string, ts: Date): Promise<void>;
}