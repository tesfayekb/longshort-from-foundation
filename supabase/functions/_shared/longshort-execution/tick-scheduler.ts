/**
 * tick-scheduler — FP-056 E5 (DEC-068 clause d).
 *
 * The thin envelope between the longshort-execute edge function and the
 * E3 `advanceTick` kernel. Composition only — zero new business logic.
 *
 * Responsibilities:
 *   1. Acquire `BrokerInterfaces` from the injected factory (live or mock).
 *   2. Call `reconstructInFlight(ts)` per the E3 SURFACE-1 invariant
 *      (broker is the authoritative in-flight state; no persisted
 *      projection table).
 *   3. Invoke `advanceTick` with the reconstructed set + injected clock +
 *      injected event writer + optional cache propagator.
 *   4. Hand back the `AdvanceTickResult` ({ still_in_flight, terminal })
 *      to the caller without mutation.
 *
 * Out of scope at E5: cron arming (operator-armed later, per the regime
 * cron precedent); real order fire (DW-138-gated E6); partial-fill
 * handling (DW-140); persistent-BP routing (DW-152).
 *
 * Pure boundary discipline: the scheduler has NO wall-clock reads, NO
 * fetches, NO Supabase calls — those live in the injected
 * `BrokerInterfaces`, the `ReconciliationEventWriter`, the
 * `RejectionPropagator`, and the `ClockReader`. The scheduler is a thin
 * pipe; everything I/O-touching is at the edge-fn composition root.
 */

import type { ClockReader } from '../longshort-clock.ts';
import {
  advanceTick,
  type AdvanceTickResult,
  type ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import type { RejectionPropagator } from './cache-propagator-io.ts';
import type { SameTickContradictoryPass } from './cache-propagator.ts';
import type { StateMachineConfig } from './state-machine.ts';
import type { BrokerInterfaces } from './broker-bootstrap.ts';

export interface TickSchedulerParams {
  brokerFactory: () => BrokerInterfaces;
  eventWriter: ReconciliationEventWriter;
  clock: ClockReader;
  ts: Date;
  /** OPTIONAL — FP-056 E4 cache propagator. Production callers MUST
   *  inject; legacy/test paths may omit. Mirrors `AdvanceTickParams`. */
  propagator?: RejectionPropagator;
  /** OPTIONAL — per-tick verifier PASSes for §8.9 system_bug
   *  classification. Defaults to empty. */
  sameTickContradictoryPasses?: readonly SameTickContradictoryPass[];
  /** OPTIONAL — initial step-0 limit prices keyed by order_id. Defaults
   *  to the per-order `current_limit_price` carried on each reconstructed
   *  InFlightOrder (matches the E3 bridge semantics for already-running
   *  orders, where step-0 == the live limit price the broker is working). */
  initialLimitPrices?: ReadonlyMap<string, number>;
  config?: Partial<StateMachineConfig>;
  phase1AcceptanceTimeoutS?: number;
}

export interface TickSchedulerResult extends AdvanceTickResult {
  /** Number of in-flight orders reconstructed for this tick (size of the
   *  authoritative-broker set going IN). Diagnostic — surfaces "broker
   *  had nothing open this tick" vs. "broker had N working orders". */
  reconstructed_in_flight_count: number;
}

/** Execute one tick: reconstruct in-flight from broker → advanceTick →
 *  return the partition. NO wall-clock, NO direct Supabase, NO direct
 *  broker fetches — everything routed through injected interfaces. */
export async function runTick(p: TickSchedulerParams): Promise<TickSchedulerResult> {
  const broker = p.brokerFactory();
  const inFlight = await broker.reconstructInFlight(p.ts);

  // Build initial-limit-prices map: caller-provided wins; else fall back
  // to each order's current_limit_price (the broker-working price).
  const initial = p.initialLimitPrices
    ? p.initialLimitPrices
    : new Map(inFlight.map((o) => [o.order_id, o.current_limit_price]));

  const result = await advanceTick({
    in_flight: inFlight,
    initial_limit_prices: initial,
    acceptanceFetcher: broker.acceptanceFetcher,
    fillFetcher: broker.fillFetcher,
    submitter: broker.submitter,
    canceller: broker.canceller,
    eventWriter: p.eventWriter,
    propagator: p.propagator,
    sameTickContradictoryPasses: p.sameTickContradictoryPasses,
    clock: p.clock,
    ts: p.ts,
    config: p.config,
    phase1AcceptanceTimeoutS: p.phase1AcceptanceTimeoutS,
  });

  return {
    still_in_flight: result.still_in_flight,
    terminal: result.terminal,
    reconstructed_in_flight_count: inFlight.length,
  };
}