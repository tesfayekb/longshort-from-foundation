/**
 * broker-bootstrap — FP-056 E5 (DEC-068 clause d + DW-138 reframe).
 *
 * Composition-root factory that hands the live execution edge function the
 * four broker interfaces `advanceTick` needs:
 *
 *   - BrokerOrderAcceptanceFetcher
 *   - BrokerOrderSubmitter
 *   - BrokerFillFetcher
 *   - BrokerOrderCanceller
 *   + a `reconstructInFlight(ts)` callable that lists currently-open broker
 *     orders (the E3 SURFACE-1 RECONSTRUCT-FROM-BROKER invariant — the
 *     broker IS the authoritative in-flight state; no persisted projection).
 *
 * E5 STATUS — LIVE WIRING IS A NO-OP UNTIL DW-138 LANDS.
 *
 *   The live AlpacaPaperClient + the per-interface Alpaca adapter modules
 *   are NOT BUILT YET. Per DW-138's reframe at DEC-068 charter landing,
 *   the AlpacaPaperClient exposes a `fetchImpl` injection seam so E1-E5
 *   build against scripted fixtures; live credentials (`ALPACA_PAPER_KEY`
 *   / `ALPACA_PAPER_SECRET`) are the E6 closure prerequisite, NOT the E5
 *   build prerequisite.
 *
 *   `createLiveBrokerInterfaces()` therefore THROWS a typed
 *   `LiveBrokerNotProvisionedError` until the E6 wiring lands. The throw
 *   propagates through `_shared/handler.ts` into a 503 envelope (DEC-034
 *   clause 3 — errors propagate; NO swallow + phantom-success). This is
 *   intentional: E5 lands the permission gate + the envelope + the
 *   scheduler seam; E5 does NOT fire real orders.
 *
 * Mock-buildability — the tick-scheduler (`tick-scheduler.ts`) consumes a
 * `BrokerInterfaces` value through its `brokerFactory` parameter; tests
 * inject a synthetic factory returning capturing stubs (the standard E3
 * pattern). Production wires `createLiveBrokerInterfaces` at the edge-fn
 * composition root.
 */

import type {
  BrokerOrderAcceptanceFetcher,
  BrokerOrderSubmitter,
  BrokerFillFetcher,
  BrokerOrderCanceller,
} from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';

/** The four broker surfaces `advanceTick` needs + the in-flight
 *  reconstruction callable that satisfies the E3 SURFACE-1 invariant. */
export interface BrokerInterfaces {
  acceptanceFetcher: BrokerOrderAcceptanceFetcher;
  fillFetcher: BrokerFillFetcher;
  submitter: BrokerOrderSubmitter;
  canceller: BrokerOrderCanceller;
  /** Reconstruct the in-flight order set from the broker (E3 SURFACE-1).
   *  Live impl = Alpaca `GET /v2/orders?status=open` (E6 wiring). Returns
   *  an empty array when the broker has no open orders for the account. */
  reconstructInFlight(ts: Date): Promise<readonly InFlightOrder[]>;
}

/** Typed throw used until DW-138 + E6 wires the live AlpacaPaperClient.
 *  The handler envelope maps the throw to a 503 response so callers get
 *  a structured "not yet provisioned" signal rather than a phantom 200. */
export class LiveBrokerNotProvisionedError extends Error {
  readonly kind = 'live_broker_not_provisioned';
  constructor(message = 'Live broker interfaces are not provisioned — DW-138 + FP-056 E6 must land first') {
    super(message);
    this.name = 'LiveBrokerNotProvisionedError';
  }
}

/**
 * Live broker factory — THROWS until DW-138 + E6 wires it. E5 ships the
 * envelope and the throw; E6 replaces the throw body with the real
 * AlpacaPaperClient + per-interface adapters. This deliberate throw is
 * the DEC-034 clause (3) propagation that ensures the edge fn cannot
 * phantom-succeed against an unprovisioned broker.
 */
export function createLiveBrokerInterfaces(): BrokerInterfaces {
  throw new LiveBrokerNotProvisionedError();
}