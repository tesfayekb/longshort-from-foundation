/**
 * lifecycle-orchestrator — FP-056 E3 (DEC-068 clause b; ACT-311).
 *
 * The ONLY broker-touching surface in the E3 module. Wraps the pure
 * state-machine.ts + rejection-classifier.ts kernels around four
 * injected fetcher/submitter interfaces + a ReconciliationEventWriter.
 * Mock-buildable end-to-end (no live credentials needed).
 *
 * advanceTick semantics (per ACT-311 STEP-A resolutions):
 *
 *   SURFACE 1 — in-flight persistence: RECONSTRUCT-FROM-BROKER per
 *   tick. The broker IS the authoritative in-flight state (§2
 *   "external snapshots are primes"); within a tick `in_flight` is the
 *   shell's working set, partitioned at the end into {still_in_flight,
 *   terminal}. No persisted projection table; no migration.
 *
 *   SURFACE 2 — poll cadence: ONE step per order per tick. The tick
 *   cadence IS the poll cadence; the per-step fill window is checked
 *   via the kernel's STEP_FILL_WAIT_S_* comparison against
 *   `submitted_at` (refreshed on cancel-and-replace). DW-NEW-B ratifies
 *   the exact tick interval against §11.0 polling spec at replay.
 *
 *   SURFACE 3 — tier-3 page mechanism: the shell EMITS reconciliation-
 *   event-shaped payloads through the injected `ReconciliationEventWriter`
 *   (mirrors the verify_* pattern at `longshort-reconciliation-lifecycle.ts`
 *   which already routes paging from `outcome='failure_escalated'`). The
 *   shell does NOT call any notifier directly.
 *
 * §8.9 CACHE PROPAGATION IS E4. E3 only TAGS the tier (via the kernel's
 * emitted events) — E4 consumes the events and propagates to §7 caches.
 * NO `longshort.execute` permission gate (E5). NO migration. NO live
 * broker call (the four interfaces are injected).
 *
 * PROVENANCE flows first-class from the InFlightOrder (which the upstream
 * E2-bridge populates from the SubmissionResult's DeltaProvenance) through
 * to every TerminalOrderResult.
 */

import type {
  BrokerOrderAcceptanceFetcher,
  BrokerOrderSubmitter,
  BrokerFillFetcher,
  BrokerOrderCanceller,
  BrokerOrderAcceptanceResult,
  BrokerFillResult,
  BrokerOrderAcceptance,
} from '../longshort-broker-interfaces.ts';
import type { ClockReader } from '../longshort-clock.ts';
import type { DeltaIntent } from './rebalance-planner.ts';
import type { DeltaProvenance } from './order-submitter.ts';
import {
  type InFlightOrder,
  type SideEffect,
  type StateMachineConfig,
  type StateMachineEvent,
  type OrderState,
  type EmitEventEffect,
  DEFAULT_STATE_MACHINE_CONFIG,
  isTerminal,
  nextState,
} from './state-machine.ts';
import { classifyRejection } from './rejection-classifier.ts';
import type { RejectionPropagator } from './cache-propagator-io.ts';
import type { SameTickContradictoryPass } from './cache-propagator.ts';

// ── Reconciliation event writer interface ──────────────────────────

/** Thin façade over the existing `reconciliation_events` write surface.
 *  Live impl writes to MIG-043 `reconciliation_events`; tests inject a
 *  capturing stub. The verifier path at `longshort-reconciliation-
 *  lifecycle.ts` is the production routing target — E3 emits in the
 *  same shape so paging fires from `outcome='failure_escalated'`. */
export interface ReconciliationEventWriter {
  emit(event: EmittedExecutionEvent, ts: Date): Promise<void>;
}

export interface EmittedExecutionEvent {
  call_name: string;
  tier: EmitEventEffect['tier'];
  outcome: EmitEventEffect['outcome'];
  payload: Record<string, unknown>;
  // ── ACT-326 — decomposed MIG-043 fields (optional; the writer falls back
  //   to `payload`→observed_value when these are absent, preserving back-
  //   compat with the orchestrator's existing emit sites). Producers that
  //   know the decomposition (e.g. classifySubmissionEvent) populate these
  //   directly so the writer emits a contract-shaped row.
  symbol?: string | null;
  expected_value?: Record<string, unknown> | null;
  observed_value?: Record<string, unknown> | null;
  divergence?: Record<string, unknown> | null;
  tolerance?: Record<string, unknown> | null;
}

// ── Terminal result (handed back to the caller for the tick close) ─

export interface TerminalOrderResult {
  order_id: string;
  client_order_id: string;
  symbol: string;
  side: 'long' | 'short';
  intent: DeltaIntent;
  trade_type: InFlightOrder['trade_type'];
  state: Extract<
    OrderState,
    | 'terminal_filled'
    | 'terminal_tier2_skip_next_tick'
    | 'terminal_tier2_unfillable_skip'
    | 'terminal_tier3_pause'
    | 'terminal_tier3_acceptance_timeout'
  >;
  ladder_step: number;
  final_limit_price: number;
  shares_requested: number;
  filled_qty: number;            // 0 unless state === 'terminal_filled'
  avg_fill_price: number | null;
  accepted_at: string | null;    // ISO; null if never accepted
  observed_at: string;
  provenance: DeltaProvenance;
}

// ── advanceTick ────────────────────────────────────────────────────

export interface AdvanceTickParams {
  /** The set of in-flight orders carried INTO this tick — produced by the
   *  caller's broker-reconstruction step (SURFACE 1). For tick-1 directly
   *  after E2 submission this is the E2→E3 bridge output. */
  in_flight: readonly InFlightOrder[];
  /** Initial step-0 limit prices per order_id — used by the pure kernel
   *  for non-compounding bps escalation. The bridge populates from E2's
   *  SubmissionResult.limit_price. */
  initial_limit_prices: ReadonlyMap<string, number>;
  acceptanceFetcher: BrokerOrderAcceptanceFetcher;
  fillFetcher: BrokerFillFetcher;
  submitter: BrokerOrderSubmitter;
  canceller: BrokerOrderCanceller;
  eventWriter: ReconciliationEventWriter;
  /** OPTIONAL — FP-056 E4 (DEC-068 clause e). When injected, broker rejections
   *  flow through the §8.9 propagation surface AFTER the kernel's tier-2/3
   *  event emit (the inline seam — zero propagation lag; the htb record is
   *  written before the tick returns, so next-tick pre-flight sees it).
   *  Backward-compatible: legacy callers that don't pass this still get the
   *  kernel's tier-tag event but skip the cache propagation. Production
   *  callers MUST inject it. */
  propagator?: RejectionPropagator;
  /** OPTIONAL — per-tick snapshot of §7 pre-flight verifier PASSes that
   *  would have caught a rejection. The propagator uses this for system_bug
   *  classification (§8.9 L274-275). Defaults to empty. */
  sameTickContradictoryPasses?: readonly SameTickContradictoryPass[];
  /** Injected clock — passed through for fetcher calls; the kernel uses `ts` directly. */
  clock: ClockReader;
  ts: Date;
  config?: Partial<StateMachineConfig>;
  /** Per-Phase-1 acceptance-poll timeout per call. Defaults to the §11.0.7
   *  #13 + DEC-068 clause b's PHASE1_PENDING window. */
  phase1AcceptanceTimeoutS?: number;
}

export interface AdvanceTickResult {
  still_in_flight: InFlightOrder[];
  terminal: TerminalOrderResult[];
}

const DEFAULT_PHASE1_TIMEOUT_S = 10;

function mergeConfig(c?: Partial<StateMachineConfig>): StateMachineConfig {
  return { ...DEFAULT_STATE_MACHINE_CONFIG, ...(c ?? {}) };
}

function toTerminal(
  o: InFlightOrder,
  observedAt: Date,
  filled_qty = 0,
  avg_fill_price: number | null = null,
): TerminalOrderResult {
  const state = o.state as TerminalOrderResult['state'];
  return {
    order_id: o.order_id,
    client_order_id: o.client_order_id,
    symbol: o.symbol,
    side: o.side,
    intent: o.intent,
    trade_type: o.trade_type,
    state,
    ladder_step: o.ladder_step,
    final_limit_price: o.current_limit_price,
    shares_requested: o.shares,
    filled_qty,
    avg_fill_price,
    accepted_at: o.accepted_at ? o.accepted_at.toISOString() : null,
    observed_at: observedAt.toISOString(),
    provenance: o.provenance,
  };
}

export async function advanceTick(p: AdvanceTickParams): Promise<AdvanceTickResult> {
  const config = mergeConfig(p.config);
  const phase1TimeoutS = p.phase1AcceptanceTimeoutS ?? DEFAULT_PHASE1_TIMEOUT_S;
  const sameTickPasses = p.sameTickContradictoryPasses ?? [];
  const still: InFlightOrder[] = [];
  const terminal: TerminalOrderResult[] = [];

  for (const original of p.in_flight) {
    // Already-terminal carry-in (defensive — caller shouldn't pass these).
    if (isTerminal(original.state)) {
      terminal.push(toTerminal(original, p.ts));
      continue;
    }

    // ── 1. Observe broker (one-step-per-order-per-tick).
    let event: StateMachineEvent;
    let fillSnap: BrokerFillResult | null = null;

    if (original.state === 'phase1_pending' || original.state === 'phase2_escalating') {
      // Phase-1 polling (initial post OR re-post after cancel-and-replace).
      let ack: BrokerOrderAcceptanceResult;
      try {
        ack = await p.acceptanceFetcher.fetchOrderAcceptance(
          original.order_id,
          phase1TimeoutS,
          p.ts,
        );
      } catch (err) {
        // Fetcher throw → tier-3 (kernel-invariant proxy: broker unreachable
        // on a known-in-flight order; refuse silent skip per DEC-034 (3)).
        await p.eventWriter.emit(
          {
            call_name: 'longshort.execution.acceptance_fetch_failed',
            tier: 'tier3',
            outcome: 'failure_escalated',
            payload: {
              order_id: original.order_id,
              symbol: original.symbol,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          p.ts,
        );
        const terminated: InFlightOrder = { ...original, state: 'terminal_tier3_pause' };
        terminal.push(toTerminal(terminated, p.ts));
        continue;
      }
      const rejection_tier =
        ack.state === 'rejected'
          ? classifyRejection(ack.rejection_reason, original.trade_type)
          : null;
      event = {
        kind: 'acceptance_observed',
        state: ack.state,
        rejection_tier,
        rejection_reason: ack.rejection_reason,
        pending_elapsed_s: ack.pending_elapsed_s,
      };
    } else if (original.state === 'phase2_working') {
      try {
        fillSnap = await p.fillFetcher.fetchFill(original.order_id, p.ts);
      } catch (err) {
        await p.eventWriter.emit(
          {
            call_name: 'longshort.execution.fill_fetch_failed',
            tier: 'tier3',
            outcome: 'failure_escalated',
            payload: {
              order_id: original.order_id,
              symbol: original.symbol,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          p.ts,
        );
        const terminated: InFlightOrder = { ...original, state: 'terminal_tier3_pause' };
        terminal.push(toTerminal(terminated, p.ts));
        continue;
      }
      event = {
        kind: 'fill_observed',
        filled: fillSnap.filled,
        filled_qty: fillSnap.filled_qty,
        avg_fill_price: fillSnap.avg_fill_price,
      };
    } else {
      // Unknown non-terminal state — defensive bug surface.
      await p.eventWriter.emit(
        {
          call_name: 'longshort.execution.unknown_state',
          tier: 'tier3',
          outcome: 'failure_escalated',
          payload: { order_id: original.order_id, state: original.state },
        },
        p.ts,
      );
      const terminated: InFlightOrder = { ...original, state: 'terminal_tier3_pause' };
      terminal.push(toTerminal(terminated, p.ts));
      continue;
    }

    // ── 2. Kernel transition (PURE).
    const initial = p.initial_limit_prices.get(original.order_id) ?? original.current_limit_price;
    const { nextOrder, sideEffects } = nextState({
      order: original,
      initial_limit_price: initial,
      event,
      ts: p.ts,
      config,
    });

    // ── 3. Execute side effects (in returned order).
    let postEscalateOrder: InFlightOrder | null = null;
    for (const eff of sideEffects) {
      if (eff.kind === 'emit_event') {
        await p.eventWriter.emit(
          { call_name: eff.call_name, tier: eff.tier, outcome: eff.outcome, payload: eff.payload },
          p.ts,
        );
      } else if (eff.kind === 'scope_violation_error') {
        // Already emitted as event by the kernel; nothing more to do — the
        // kernel terminates the order to tier3_pause in the same transition.
      } else if (eff.kind === 'cancel_and_replace') {
        // Tier-1 escalation: DELETE then POST. Both throws map to tier-3
        // pause (refuse silent-skip on broker error during escalation).
        try {
          await p.canceller.cancelOrder(eff.order_id, p.ts);
        } catch (err) {
          await p.eventWriter.emit(
            {
              call_name: 'longshort.execution.cancel_failed',
              tier: 'tier3',
              outcome: 'failure_escalated',
              payload: {
                order_id: eff.order_id,
                error: err instanceof Error ? err.message : String(err),
              },
            },
            p.ts,
          );
          postEscalateOrder = { ...nextOrder, state: 'terminal_tier3_pause' };
          break;
        }
        let resub: BrokerOrderAcceptance;
        try {
          resub = await p.submitter.submitOrder(
            {
              symbol: nextOrder.symbol,
              qty: nextOrder.shares,
              side: nextOrder.broker_side,
              type: 'limit',
              time_in_force: 'day',
              limit_price: eff.new_limit_price,
              client_order_id: `${nextOrder.client_order_id}-step${eff.next_ladder_step}`,
            },
            p.ts,
          );
        } catch (err) {
          await p.eventWriter.emit(
            {
              call_name: 'longshort.execution.resubmit_failed',
              tier: 'tier3',
              outcome: 'failure_escalated',
              payload: {
                symbol: nextOrder.symbol,
                error: err instanceof Error ? err.message : String(err),
              },
            },
            p.ts,
          );
          postEscalateOrder = { ...nextOrder, state: 'terminal_tier3_pause' };
          break;
        }
        // Re-anchor the replacement order's identity to the broker's new id;
        // accepted_at PRESERVED (the wall-clock cap anchor); submitted_at
        // already set to `ts` by the kernel.
        postEscalateOrder = {
          ...nextOrder,
          order_id: resub.order_id,
          client_order_id: resub.client_order_id,
          state: 'phase2_escalating',
        };
      }
    }

    // ── 3b. §8.9 cache propagation (E4 inline seam). Fires AFTER the
    //   kernel's tier-2/3 event emit so the broker_rejection_propagation
    //   row's outcome reflects the actual cache-write result. Confined
    //   to the original-event-was-rejection branch — fill/timeout paths
    //   are not propagation surfaces.
    if (
      p.propagator &&
      event.kind === 'acceptance_observed' &&
      event.state === 'rejected'
    ) {
      try {
        await p.propagator.propagate({
          symbol: original.symbol,
          rejection_reason: event.rejection_reason,
          sameTickPasses,
          ts: p.ts,
          order_id: original.order_id,
          client_order_id: original.client_order_id,
        });
      } catch (err) {
        // Defensive — the propagator itself surfaces htb-write failures as
        // tier-3 events; this catches an unexpected throw above that layer.
        // The order is already terminal (set by the kernel); we just emit
        // a diagnostic and continue the loop.
        await p.eventWriter.emit(
          {
            call_name: 'longshort.execution.propagator_threw',
            tier: 'tier3',
            outcome: 'failure_escalated',
            payload: {
              order_id: original.order_id,
              symbol: original.symbol,
              error: err instanceof Error ? err.message : String(err),
            },
          },
          p.ts,
        );
      }
    }

    // ── 4. Partition.
    const finalOrder = postEscalateOrder ?? nextOrder;
    if (isTerminal(finalOrder.state)) {
      const filled_qty =
        finalOrder.state === 'terminal_filled' ? (fillSnap?.filled_qty ?? finalOrder.shares) : 0;
      const avg_fill_price =
        finalOrder.state === 'terminal_filled' ? (fillSnap?.avg_fill_price ?? null) : null;
      terminal.push(toTerminal(finalOrder, p.ts, filled_qty, avg_fill_price));
    } else {
      still.push(finalOrder);
    }
  }

  return { still_in_flight: still, terminal };
}