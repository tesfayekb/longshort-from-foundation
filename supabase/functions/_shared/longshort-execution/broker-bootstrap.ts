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
  BrokerQuoteFetcher,
  BrokerBuyingPowerFetcher,
  BrokerPositionFetcher,
  BrokerLocateFetcher,
  BrokerHaltStatusFetcher,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';
// ACT-316 (E6-build-revision) — edge-resident Alpaca adapters. Prior to ACT-316
// these imports reached into src/features/longshort/services/broker/alpaca/*,
// which the Supabase bundler cannot resolve outside supabase/functions/ (Gate-2
// FP-011 red). The edge-resident transcriptions live under _shared/longshort-broker/
// and import nothing from src/. The src/ Alpaca client is untouched and continues
// to serve src/ verifier/signal/UI paths.
import {
  AlpacaPaperClient,
  type AlpacaPaperClientConfig,
} from '../longshort-broker/alpaca-paper-client.ts';
import { AlpacaOrderAcceptanceFetcher } from '../longshort-broker/alpaca-order-acceptance-fetcher.ts';
import { AlpacaOrderSubmitter } from '../longshort-broker/alpaca-order-submitter.ts';
import { AlpacaFillFetcher } from '../longshort-broker/alpaca-fill-fetcher.ts';
import { AlpacaOrderCanceller } from '../longshort-broker/alpaca-order-canceller.ts';
import { AlpacaOpenOrdersFetcher } from '../longshort-broker/alpaca-open-orders-fetcher.ts';
// ACT-317 (E5.5 Phase-1) — placement-path adapters. Required by the §7
// preflight composer (halt + locate + position) and by the Phase-2 trigger
// (quote + buying-power for submitRebalance; position for planRebalance
// currentPositions; buying-power.account_equity for planRebalance capitalBase).
import { AlpacaQuoteFetcher } from '../longshort-broker/alpaca-quote-fetcher.ts';
import { AlpacaBuyingPowerFetcher } from '../longshort-broker/alpaca-buying-power-fetcher.ts';
import { AlpacaPositionFetcher } from '../longshort-broker/alpaca-position-fetcher.ts';
import { AlpacaLocateFetcher } from '../longshort-broker/alpaca-locate-fetcher.ts';
import { AlpacaHaltStatusFetcher } from '../longshort-broker/alpaca-halt-status-fetcher.ts';
import { AlpacaShortabilityFetcher } from '../longshort-broker/alpaca-shortability-fetcher.ts';
// ── FEED-FIX (post-ACT-336 / DEC-068 clause-(r) in flight) ───────────────
// PolygonQuoteFetcher REPLACES AlpacaQuoteFetcher at the BrokerQuoteFetcher
// seam. The Q4 probe (corr 4237512b book) measured Alpaca IEX-only quotes
// fabricating prices at median 58.63 bp / P95 265.91 bp divergence vs the
// Polygon consolidated NBBO (gate 5 bp / 20 bp — tripped 11.7×/13.3×).
// ENSG collapsed 689 bp → 28 bp. The verify_quote_freshness gate (5 s)
// is PRESERVED — it now gates a real feed instead of a fabricated one.
// Env-flag `LONGSHORT_QUOTE_FEED=alpaca` reverts to the legacy fetcher
// (operator-only emergency lever; default is polygon).
import { PolygonQuoteFetcher } from '../longshort-broker/polygon-quote-fetcher.ts';

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
  // ── ACT-317 (E5.5 Phase-1) PLACEMENT-PATH SURFACES ──────────────────────
  // Additive — existing advance-path consumers (tick-scheduler, runTick,
  // longshort-execute) read only the 5 fields above and are unaffected.
  // The Phase-2 placement trigger + the §7 preflight composer consume the
  // 5 fields below. All are lazily constructed in `createLiveBrokerInterfaces`
  // so the module remains import-safe in creds-free CI.
  //
  // ACT-319 (Gate-11 type-check fix): these 5 are OPTIONAL on the interface
  // because they reflect a placement-path-only dependency. The advance path
  // (tick-scheduler / runTick / advanceTick) never consumes them, so the
  // advance-path test helpers (e.g. tick-scheduler_test's `mkBroker`) must
  // not be forced to fabricate fetchers they never call. The production
  // factory `createLiveBrokerInterfaces` still provides ALL 10; the Phase-2
  // placement trigger asserts/narrows presence at its call site.
  /** §8.2 marketable-limit pricing via Alpaca `/v2/stocks/{sym}/quotes/latest`. */
  quoteFetcher?: BrokerQuoteFetcher;
  /** Pre-batch BP snapshot for submitter + `account_equity` for planner
   *  `capitalBase` (DEC-067 sizing basis). One fetch satisfies both. */
  buyingPowerFetcher?: BrokerBuyingPowerFetcher;
  /** `listOpenPositions(ts)` feeds the planner's `currentPositions` input
   *  through the orchestrator normalization boundary. */
  positionFetcher?: BrokerPositionFetcher;
  /** §7 short-availability via Alpaca `/v2/short_locates`. Reached ONLY
   *  when the htb-cache pre-flight consult MISSES (E4 load-bearing wiring
   *  is enforced inside `verify_short_availability(...cache?)`, not here). */
  locateFetcher?: BrokerLocateFetcher;
  /** §7 halt-status via Alpaca `/v2/assets/{sym}` (`status`+`tradable`). */
  haltStatusFetcher?: BrokerHaltStatusFetcher;
  /** §7 pre-trade shortability via Alpaca `/v2/assets/{sym}.shortable`
   *  (ACT-331 / DEC-068 clause (q)). Env-flag-gated at the bootstrap
   *  (`ALPACA_PAPER_SHORTABILITY_AVAILABLE`, default true). When absent,
   *  the §7 composer takes its shortability-typed-absence path; when
   *  ALSO `locateFetcher` is absent the trigger declares `long_only_mode`. */
  shortabilityFetcher?: BrokerShortabilityFetcher;
  // SSR DETERMINATION (Phase-1 report): Alpaca paper does NOT expose SSR
  // cleanly — no public REST endpoint surfacing SSR state. Per §2 axiom
  // (typed absence, NOT a synthetic 'SSR clear' sentinel) the §7 preflight
  // composer treats SSR as a documented degraded leg when no
  // `ssrStatusFetcher` is injected: it records `verifiers_skipped:
  // ['verify_ssr_status']` with reason `ssr_unavailable_on_paper` on every
  // short candidate. No `ssrStatusFetcher` is exposed on this interface at
  // Phase 1; Phase-2 decides whether to source SSR from a non-Alpaca feed.
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
  // ── DEC-068 clause (p) ENV-FLAG GATE ─────────────────────────────────────
  // ALPACA_PAPER_LOCATE_AVAILABLE is the declarative posture flag for the
  // short-availability source. Default `false` on paper (Alpaca paper does
  // NOT expose POST /v2/short_locates — operator-confirmed 404). When false,
  // we OMIT `locateFetcher` from the returned interface so the §7 preflight
  // composer takes the typed-absence path (no broker call, distinct audit
  // shape). When DW-155 wires a real source (or the flag flips true on a
  // venue that supports the endpoint), the real `AlpacaLocateFetcher`
  // injects. This is a pure env-var read — creds-free + network-free at
  // construction (no boot-time probe; clause (p) explicitly REJECTS that).
  const locateAvailableEnv = Deno.env.get('ALPACA_PAPER_LOCATE_AVAILABLE');
  const locateAvailable = locateAvailableEnv === 'true' || locateAvailableEnv === '1';
  // ── DEC-068 clause (q) ENV-FLAG GATE ─────────────────────────────────────
  // ALPACA_PAPER_SHORTABILITY_AVAILABLE defaults TRUE (clause (q) ratified
  // shortability on paper as the structural short-availability gate). Set
  // to '0' / 'false' to OMIT the fetcher and force the composer's
  // shortability-typed-absence path (operator emergency lever; paired with
  // ALPACA_PAPER_LOCATE_AVAILABLE=false yields `long_only_mode=true`).
  const shortabilityAvailableEnv = Deno.env.get('ALPACA_PAPER_SHORTABILITY_AVAILABLE');
  const shortabilityAvailable = shortabilityAvailableEnv === undefined
    || shortabilityAvailableEnv === ''
    || shortabilityAvailableEnv === 'true'
    || shortabilityAvailableEnv === '1';
  // ── QUOTE-FEED SELECTION (FEED-FIX) ─────────────────────────────────
  // Default = polygon (consolidated SIP via /v2/last/nbbo); operator
  // can revert by setting LONGSHORT_QUOTE_FEED=alpaca. Polygon path
  // requires POLYGON_API_KEY (already provisioned for the universe
  // enrichment + Q4 probe paths).
  const quoteFeed = (Deno.env.get('LONGSHORT_QUOTE_FEED') ?? 'polygon').toLowerCase();
  let quoteFetcher;
  if (quoteFeed === 'alpaca') {
    quoteFetcher = new AlpacaQuoteFetcher(client);
  } else {
    // LAZY: do NOT throw at construction when POLYGON_API_KEY is absent.
    // The module's creds-free-construction invariant (see header at L19-20,
    // L109, L163-169) mirrors AlpacaPaperClient's deferred credential check.
    // PolygonQuoteFetcher fails loud on first fetchQuote when the key is
    // missing, preserving prod-misconfig protection without breaking
    // import-safe / CI-test construction.
    const polyKey = Deno.env.get('POLYGON_API_KEY') ?? '';
    quoteFetcher = new PolygonQuoteFetcher(polyKey);
  }
  const base: BrokerInterfaces = {
    acceptanceFetcher: new AlpacaOrderAcceptanceFetcher(client),
    fillFetcher: new AlpacaFillFetcher(client),
    submitter: new AlpacaOrderSubmitter(client),
    canceller: new AlpacaOrderCanceller(client),
    reconstructInFlight: (ts: Date) => openOrders.listOpenInFlight(ts),
    // ── ACT-317 (E5.5 Phase-1) — placement-path adapters (LAZY). ────────
    quoteFetcher,
    buyingPowerFetcher: new AlpacaBuyingPowerFetcher(client),
    positionFetcher: new AlpacaPositionFetcher(client),
    haltStatusFetcher: new AlpacaHaltStatusFetcher(client),
  };
  if (locateAvailable) {
    base.locateFetcher = new AlpacaLocateFetcher(client);
  }
  if (shortabilityAvailable) {
    base.shortabilityFetcher = new AlpacaShortabilityFetcher(client);
  }
  return base;
}