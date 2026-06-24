/**
 * broker-bootstrap — FP-056 E5 (DEC-068 clause d) + E6-BUILD (ACT-314).
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
 * E6-BUILD STATUS — LIVE WIRING LANDED; SPOT-CHECK STILL OPERATOR-GATED.
 *
 *   `createLiveBrokerInterfaces()` now instantiates the real
 *   `AlpacaPaperClient` + per-interface adapters (DW-138 secrets confirmed
 *   provisioned). The factory is LAZY — all construction happens inside
 *   the body so the module is import-safe in creds-free CI; the
 *   `AlpacaCredentialError` only surfaces when the factory is actually
 *   invoked.
 *
 *   The DIAGNOSTIC-503 pre-flight at the edge fn (`longshort-execute/
 *   index.ts`) catches the absent-creds case BEFORE calling the factory
 *   and returns a structured `broker_credentials_not_provisioned` envelope
 *   so the operator-facing error is diagnostic, not opaque.
 *
 *   `LiveBrokerNotProvisionedError` is retained as an exported type for
 *   back-compat with E5 callers + tests that asserted the throw; the
 *   factory no longer throws it (the production code path is now the
 *   diagnostic-503 pre-flight on absent creds + the `AlpacaCredentialError`
 *   propagation if the pre-flight is somehow bypassed).
 *
 * Mock-buildability — the tick-scheduler (`tick-scheduler.ts`) consumes a
 * `BrokerInterfaces` value through its `brokerFactory` parameter; tests
 * inject a synthetic factory returning capturing stubs (the standard E3
 * pattern). Production wires `createLiveBrokerInterfaces` at the edge-fn
 * composition root. The E_evidence_1 replay leg exercises the SAME
 * `createLiveBrokerInterfaces → adapter → advanceTick` path via the
 * `AlpacaPaperClient.fetchImpl` injection seam — fixture-driven, creds-free.
 */

import type {
  BrokerOrderAcceptanceFetcher,
  BrokerOrderSubmitter,
  BrokerFillFetcher,
  BrokerOrderCanceller,
} from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';
import {
  AlpacaPaperClient,
  type AlpacaPaperClientConfig,
} from '../../../../src/features/longshort/services/broker/alpaca/alpaca-paper-client.ts';
import { AlpacaOrderAcceptanceFetcher } from '../../../../src/features/longshort/services/broker/alpaca/alpaca-order-acceptance-fetcher.ts';
import { AlpacaOrderSubmitter } from '../../../../src/features/longshort/services/broker/alpaca/alpaca-order-submitter.ts';
import { AlpacaFillFetcher } from '../../../../src/features/longshort/services/broker/alpaca/alpaca-fill-fetcher.ts';
import { AlpacaOrderCanceller } from '../../../../src/features/longshort/services/broker/alpaca/alpaca-order-canceller.ts';
import { AlpacaOpenOrdersFetcher } from '../../../../src/features/longshort/services/broker/alpaca/alpaca-open-orders-fetcher.ts';

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

/** Retained for back-compat with E5-era callers / tests that asserted
 *  the "not provisioned" throw. The live factory no longer throws this
 *  (the production path is the diagnostic-503 pre-flight at the edge
 *  fn — `broker_credentials_not_provisioned`). Kept exported so callers
 *  that still pattern-match on it compile. */
export class LiveBrokerNotProvisionedError extends Error {
  readonly kind = 'live_broker_not_provisioned';
  constructor(message = 'Live broker interfaces are not provisioned') {
    super(message);
    this.name = 'LiveBrokerNotProvisionedError';
  }
}

/**
 * Live broker factory — instantiates the real `AlpacaPaperClient` + per-
 * interface Alpaca adapters. LAZY: all construction inside this body so
 * the module is import-safe in creds-free CI; `AlpacaCredentialError`
 * only surfaces when this function is actually called.
 *
 * `config.fetchImpl` flows into `AlpacaPaperClient` — the E_evidence_1
 * replay leg uses this seam to drive the SAME factory → adapter →
 * advanceTick path with fixture-driven responses (creds-free CI).
 */
export function createLiveBrokerInterfaces(config: AlpacaPaperClientConfig = {}): BrokerInterfaces {
  const client = new AlpacaPaperClient(config);
  const openOrders = new AlpacaOpenOrdersFetcher(client);
  return {
    acceptanceFetcher: new AlpacaOrderAcceptanceFetcher(client),
    fillFetcher: new AlpacaFillFetcher(client),
    submitter: new AlpacaOrderSubmitter(client),
    canceller: new AlpacaOrderCanceller(client),
    reconstructInFlight: (ts: Date) => openOrders.listOpenInFlight(ts),
  };
}