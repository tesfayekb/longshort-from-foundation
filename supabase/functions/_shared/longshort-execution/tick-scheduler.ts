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
import type { RebalanceAggregateAssertionResult } from './rebalance-aggregate-assertion.ts';
import type { ExemptCause } from '../longshort-verifiers/verify_rebalance_aggregate.ts';
import type { PersistenceCheckOutcome } from './rebalance-aggregate-persistence.ts';
import {
  evaluateShortStops,
  type ShortStopEvaluateResult,
} from './short-stop-evaluator.ts';
import type { EtbTransitionResult } from './etb-transition-monitor.ts';

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
  /** OPTIONAL — DW-163 post-fire dollar-neutrality assertion. When
   *  injected, runTick invokes it AFTER advanceTick completes and
   *  threads the result onto `TickSchedulerResult.rebalance_aggregate`.
   *  MUST be broker-truth-sourced (see `buildRebalanceAggregateAssertion`).
   *  Closure errors are caught + logged + surfaced as `null` so a fetch
   *  hiccup does not kill the tick (the reconcile() pipe itself writes a
   *  system_bug row on infrastructure failure). */
  rebalanceAggregateAssertion?: (
    ts: Date,
    exempt_cause?: ExemptCause | null,
  ) => Promise<RebalanceAggregateAssertionResult>;
  /** OPTIONAL — FP-057 Sub-step 5 / DEC-070 clause (g) ⊗ DW-149-B. The
   *  rolling-window persistence check. Invoked AFTER the per-tick
   *  `rebalanceAggregateAssertion` has written its reconciliation_events
   *  row, so the row this tick produced is visible to the
   *  read-last-N-rows query. The closure manages cross-tick state via
   *  the canonical `reconciliation_events` sink (NO new table — reads
   *  the last N `verify_rebalance_aggregate` rows, counts CONSECUTIVE
   *  unexplained, and escalates with latch + cooldown). Errors caught
   *  + logged so a query hiccup does not kill the tick. */
  rebalanceAggregatePersistenceCheck?: (
    ts: Date,
  ) => Promise<PersistenceCheckOutcome>;
  /** DW-149 (Component 1) — when `true`, runTick evaluates short-stop
   *  breaches BEFORE `advanceTick`. The evaluator force-covers any short
   *  position breaching `LONGSHORT_SHORT_STOP_THRESHOLD` (default 0.15)
   *  in the SAME tick (independent of the rebalance cadence). After a
   *  fire, in-flight is RE-RECONSTRUCTED so the just-placed cover enters
   *  this tick's advance-path — no 15-min lag. Defaults to `true`; legacy
   *  callers / focused tests may opt out by setting `false`.
   *  Aggregate-gate interaction: when the evaluator fires this tick AND
   *  the post-fire aggregate assertion reports a band-violation, the
   *  result is ANNOTATED `short_stop_adjusted: true` and LOGGED (not
   *  operator-alerted) — a forced cover SHOULD break neutrality for one
   *  tick (working-as-designed); persistence detection is left to the
   *  next tick's aggregate verifier (cross-tick state lives outside this
   *  in-process closure). */
  shortStopEnabled?: boolean;
  /** OPTIONAL — env-resolved short-stop threshold override
   *  (`LONGSHORT_SHORT_STOP_THRESHOLD`). Defaults to `0.15`. */
  shortStopThreshold?: number;
  /** DW-162a (Component 3a) — OPTIONAL early-warning closure. When
   *  injected, runTick invokes it AFTER the short-stop evaluator and
   *  BEFORE `advanceTick`. Detects `easy_to_borrow: true → false`
   *  transitions on HELD shorts and emits `short_etb_lost` warnings
   *  (NOT covers — the −15% short-stop owns the action layer).
   *  Closure errors are caught + logged + surfaced as `null` so a
   *  vendor hiccup does not kill the tick. */
  etbTransitionAssertion?: (ts: Date) => Promise<EtbTransitionResult>;
}

export interface TickSchedulerResult extends AdvanceTickResult {
  /** Number of in-flight orders reconstructed for this tick (size of the
   *  authoritative-broker set going IN). Diagnostic — surfaces "broker
   *  had nothing open this tick" vs. "broker had N working orders". */
  reconstructed_in_flight_count: number;
  /** DW-163 — verify_rebalance_aggregate outcome from THIS tick's
   *  post-fire broker-truth assertion, when the closure was injected.
   *  `null` when not injected (legacy/test paths) OR when the closure
   *  threw (caught + logged; reconcile() writes its own system_bug row
   *  in that case). */
  rebalance_aggregate: RebalanceAggregateAssertionResult | null;
  /** DW-149 — short-stop evaluator outcome for this tick. `null` when
   *  the evaluator was disabled (legacy/test paths with
   *  `shortStopEnabled: false`). */
  short_stop: ShortStopEvaluateResult | null;
  /** DW-149 — set true on `rebalance_aggregate` when an aggregate
   *  band-violation co-occurred with a short-stop fire THIS tick. The
   *  edge-fn surface uses this to demote the result to log-only (a
   *  forced cover legitimately breaks neutrality for one tick). */
  short_stop_adjusted_aggregate: boolean;
  /** FP-057 Sub-step 5 — rolling-window persistence-check outcome. `null`
   *  when the check was not injected or threw. When escalated, the edge
   *  fn / cron surfaces this on the audit row + the operator alert
   *  derives from this object (NOT from per-tick `failure_escalated`). */
  rebalance_aggregate_persistence: PersistenceCheckOutcome | null;
  /** DW-162a — ETB-transition monitor outcome for this tick. `null`
   *  when the closure was not injected OR threw (caught + logged).
   *  WARNINGS ONLY — never fires a cover. */
  etb_transition: EtbTransitionResult | null;
}

/** Execute one tick: reconstruct in-flight from broker → advanceTick →
 *  return the partition. NO wall-clock, NO direct Supabase, NO direct
 *  broker fetches — everything routed through injected interfaces. */
export async function runTick(p: TickSchedulerParams): Promise<TickSchedulerResult> {
  const broker = p.brokerFactory();
  let inFlight = await broker.reconstructInFlight(p.ts);

  // DW-149 (Component 1) — squeeze circuit-breaker. SEAM (§8.6.2):
  //   AFTER reconstructInFlight, BEFORE advanceTick, BEFORE the
  //   rebalanceAggregateAssertion. A short breaching ≥15% force-covers
  //   in the SAME tick, independent of the rebalance cadence. Default-on;
  //   opt-out via `shortStopEnabled: false` for legacy/focused tests.
  let shortStop: ShortStopEvaluateResult | null = null;
  const shortStopEnabled = p.shortStopEnabled !== false;
  if (shortStopEnabled && broker.positionFetcher) {
    shortStop = await evaluateShortStops({
      positionFetcher: broker.positionFetcher,
      submitter: broker.submitter,
      inFlight,
      ts: p.ts,
      threshold: p.shortStopThreshold,
    });
    // If a cover leg fired, RE-RECONSTRUCT in-flight so the just-placed
    // cover enters THIS tick's advance-path (no 15-min lag).
    if (shortStop.fired_legs.length > 0) {
      inFlight = await broker.reconstructInFlight(p.ts);
    }
  }

  // DW-162a (Component 3a) — early-WARNING layer. Runs AFTER the
  // short-stop evaluator (so it observes the post-cover position set
  // when a stop fired) and BEFORE advanceTick. Emits structured
  // warnings on `easy_to_borrow: true → false`; does NOT submit any
  // orders. Failure is non-fatal — the tick continues.
  let etb_transition: EtbTransitionResult | null = null;
  if (p.etbTransitionAssertion) {
    try {
      etb_transition = await p.etbTransitionAssertion(p.ts);
      if (etb_transition.warnings.length > 0) {
        for (const w of etb_transition.warnings) {
          console.warn(
            'longshort_short_etb_lost',
            JSON.stringify({
              ts: p.ts.toISOString(),
              symbol: w.symbol,
              prev_observed_at: w.prev_observed_at,
              curr_observed_at: w.curr_observed_at,
              note: 'DW-162a early-warning; broker dropped name from ETB list (borrow demand surged); no auto-cover (Component 1 owns action layer)',
            }),
          );
        }
      }
    } catch (e) {
      console.error(
        'longshort_etb_transition_monitor.failed',
        e instanceof Error ? e.message : String(e),
      );
      etb_transition = null;
    }
  }

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

  // DW-163: BROKER-TRUTH post-fire dollar-neutrality assertion. Runs on
  // the NEXT advance-tick after a placement fire, reading actual broker
  // positions (planner-vs-planner would be a tautology). The verifier's
  // reconcile() pipe writes the reconciliation_events row + executes
  // failure_action (operator alert, no auto-retry) on band-violation —
  // we just thread the outcome up so the edge fn can surface it on the
  // audit row alongside still_in_flight / terminal counts.
  let rebalance_aggregate: RebalanceAggregateAssertionResult | null = null;
  if (p.rebalanceAggregateAssertion) {
    try {
      // FP-057 Sub-step 5 — derive exempt_cause from the in-process
      // signals at THIS seam BEFORE invoking the assertion. Precedence:
      //   short_stop > partial_fill > working_order
      // Each tick is judged on its OWN signals; a stale prior-tick cause
      // cannot silence the current tick (NON-COMPOUNDING by construction).
      const exempt_cause = deriveExemptCause({
        shortStop,
        still_in_flight: result.still_in_flight,
        terminal: result.terminal,
      });
      rebalance_aggregate = await p.rebalanceAggregateAssertion(p.ts, exempt_cause);
    } catch (e) {
      console.error(
        'longshort_rebalance_aggregate_assertion.failed',
        e instanceof Error ? e.message : String(e),
      );
      rebalance_aggregate = null;
    }
  }

  // FP-057 Sub-step 5 — GENERALIZED transient annotation. Was DW-149
  // `short_stop_adjusted_aggregate` (short_stop-only); now
  // `aggregate_band_break_exempted` (covers all three causes). Log-only
  // per-tick; the PAGER fires off the persistence check below.
  const short_stop_adjusted_aggregate =
    !!(rebalance_aggregate
       && rebalance_aggregate.outcome === 'failure_escalated'
       && rebalance_aggregate.exempt_cause === 'short_stop');
  if (rebalance_aggregate
      && rebalance_aggregate.outcome === 'failure_escalated'
      && rebalance_aggregate.exempt_cause !== null) {
    console.warn(
      'longshort_rebalance_aggregate.aggregate_band_break_exempted',
      JSON.stringify({
        ts: p.ts.toISOString(),
        exempt_cause: rebalance_aggregate.exempt_cause,
        short_stop_fired_count: shortStop?.short_stop_fired_count ?? 0,
        still_in_flight_count: result.still_in_flight.length,
        aggregate_outcome: rebalance_aggregate.outcome,
        note:
          'transient-expected-for-one-tick (FP-057 sub5); persistence check ' +
          'evaluates cross-tick state; does NOT advance unexplained counter',
      }),
    );
  }

  // FP-057 Sub-step 5 — rolling-window persistence check. Reads the
  // last N reconciliation_events for call_name='verify_rebalance_aggregate'
  // (including the row JUST written this tick), counts CONSECUTIVE
  // unexplained, escalates ONCE at the threshold (latch + cooldown).
  // RESET-ON-IN-BAND: any in-band tick wipes the counter. NON-COMPOUNDING:
  // a stale exempt_cause from a prior tick does NOT silence the current
  // tick — each tick is judged on its OWN exempt_cause.
  let rebalance_aggregate_persistence: PersistenceCheckOutcome | null = null;
  if (p.rebalanceAggregatePersistenceCheck && rebalance_aggregate !== null) {
    try {
      rebalance_aggregate_persistence = await p.rebalanceAggregatePersistenceCheck(p.ts);
    } catch (e) {
      console.error(
        'longshort_rebalance_aggregate_persistence.failed',
        e instanceof Error ? e.message : String(e),
      );
      rebalance_aggregate_persistence = null;
    }
  }

  return {
    still_in_flight: result.still_in_flight,
    terminal: result.terminal,
    reconstructed_in_flight_count: inFlight.length,
    rebalance_aggregate,
    short_stop: shortStop,
    short_stop_adjusted_aggregate,
    rebalance_aggregate_persistence,
    etb_transition,
  };
}

/** Derive the strongest exempt_cause attribution from this tick's
 *  in-process signals. Pure function; the precedence is the single
 *  source of truth (asserted in tests).
 *
 *  Precedence: `short_stop` > `partial_fill` > `working_order`.
 *  Returns `null` when no transient cause applies — the row becomes a
 *  persistent-pager candidate. */
export function deriveExemptCause(args: {
  shortStop: ShortStopEvaluateResult | null;
  still_in_flight: AdvanceTickResult['still_in_flight'];
  terminal: AdvanceTickResult['terminal'];
}): ExemptCause | null {
  if (args.shortStop && args.shortStop.short_stop_fired_count > 0) {
    return 'short_stop';
  }
  // partial_fill: a terminal_filled order whose filled_qty is BETWEEN
  // (0, shares_requested) — strictly partial. shares_requested=0 is
  // defensive — never a partial.
  for (const t of args.terminal) {
    if (t.state === 'terminal_filled'
        && t.shares_requested > 0
        && t.filled_qty > 0
        && t.filled_qty < t.shares_requested) {
      return 'partial_fill';
    }
  }
  if (args.still_in_flight.length > 0) return 'working_order';
  return null;
}