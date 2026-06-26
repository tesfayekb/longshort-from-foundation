/**
 * state-machine — FP-056 E3 (DEC-068 clause b; ACT-311).
 *
 * PURE transition kernel for the two-phase order lifecycle (Phase-1
 * acceptance → Phase-2 fill) wrapping E2's terminal SubmissionResult.
 * Mock-buildable end-to-end: fixtures-in, decisions-out. NO broker
 * import, NO fetch, NO wall-clock read. The injected `ts` is the sole
 * Date source (DEC-034 (4)); all elapsed deltas are computed against
 * `submitted_at` / `accepted_at` anchors recorded on the in-flight row.
 *
 * SCOPE LOCK (E3 v1 per ACT-311 scope cut): handles `entry` + `rank_exit`
 * only — the two trade types E1's delta-computer actually produces. The
 * short-stop branch (intent producer + execution-side elevated-200bps
 * restart + Phase-1-pending→tier-3 routing per ADR-002 v0-fallback) is
 * DEFERRED to DW-149 and routed through a defensive STOP guard here:
 * any in-flight order tagged `trade_type='short_stop'` (or any non-
 * entry/non-rank_exit type) returns a `scope_violation_error` side-
 * effect and is forced to `terminal_tier3_pause`. Because E1 does not
 * emit short-stop intents, this guard should never fire in production
 * — it exists to prevent silent handling if a producer ever does.
 *
 * AUTONOMOUS THREE-TIER (DEC-068 clause b — RATIFICATION of §8.6.1
 * line 109 + §8.6.2 line 187):
 *   Tier 1 — escalate per §8.6.2 ladder via cancel-and-replace at the
 *            next bps step (NOT modify; DW-141). Preserve `accepted_at`
 *            across escalation so the WALL_CLOCK_CAP_S budget runs from
 *            ACCEPTANCE, not from the latest cancel-and-replace.
 *   Tier 2 — auto-skip terminal (`tier2_skip_next_tick` for routed
 *            rejections; `tier2_unfillable_skip` for ladder-exhausted /
 *            wall-clock-cap). Re-eligibility happens via the next tick's
 *            fresh E1 selection — E3 carries ZERO cross-tick state.
 *   Tier 3 — operator page. Only fires for: (a) Path-1.C — Phase-1
 *            still-pending past `PHASE1_PENDING_OPERATOR_ALERT_S` (60s
 *            per §11.0.7 #13); (b) rejection classified as PAUSE-class
 *            by rejection-classifier (`ssr_violation` / `pdt_block` /
 *            persistent-BP / unknown — DW-144 covers the full §8.9
 *            cache-propagation surface; E3 only TAGS the tier and emits
 *            the event); (c) kernel-invariant violation (the defensive
 *            short-stop guard above; opposite-side-on-same-symbol —
 *            already enforced upstream at E1).
 *
 * §8.6.2 LADDERS verbatim (entry vs. rank_exit):
 *   ENTRY     : step 0 = initial → step 1 = +50 bps → terminal
 *               (`tier2_unfillable_skip`). MAX_RETRY=3 default (DEC-068
 *               clause b) is satisfied: 1 escalation max ≤ 3.
 *   RANK_EXIT : step 0 = initial → step 1 = +100 bps → step 2 = +200
 *               bps → terminal `tier2_unfillable_skip` (the spec's
 *               "exit_pending" marker terminal). 2 escalations ≤ 3.
 *
 * WALL-CLOCK CAP: an order whose `(ts − accepted_at)` exceeds
 * `WALL_CLOCK_CAP_S` (120s default per DEC-068 clause b) terminates
 * `tier2_unfillable_skip` regardless of remaining ladder steps. This is
 * the absolute upper bound on per-order time-in-broker.
 *
 * NO MODIFY (DW-141), NO PARTIAL-FILL (DW-140), NO LULD (DW-142). A
 * `BrokerFillResult` with `filled: false` + `filled_qty > 0` is treated
 * the same as `filled_qty === 0` at v1 — the order is still working;
 * step-elapsed governs whether to escalate. DW-140 lands the partial-
 * fill branch with the explicit fill-then-cancel-and-replace-remainder.
 */

import type { DeltaIntent } from './rebalance-planner.ts';
import type { DeltaProvenance } from './order-submitter.ts';
import type { OrderAcceptanceState } from '../longshort-broker-interfaces.ts';

// ── Trade-type scope lock (E3 v1) ──────────────────────────────────

export type TradeType = 'entry' | 'rank_exit' | 'short_stop';

/** Returns true iff E3 v1 handles this trade type natively. */
export function isSupportedTradeType(t: TradeType): t is 'entry' | 'rank_exit' {
  return t === 'entry' || t === 'rank_exit';
}

// ── State enum ─────────────────────────────────────────────────────

export type OrderState =
  | 'phase1_pending'                       // Phase-1 acceptance unresolved (within or beyond timeout)
  | 'phase2_working'                       // Accepted; fill timer running
  | 'phase2_escalating'                    // Transient marker between cancel-and-replace and re-acceptance
  | 'terminal_filled'
  | 'terminal_tier2_skip_next_tick'        // Routed rejection (halted/htb/transient-BP/default)
  | 'terminal_tier2_unfillable_skip'       // Ladder exhausted OR wall-clock cap
  | 'terminal_tier3_pause'                 // PAUSE-class rejection OR kernel-invariant
  | 'terminal_tier3_acceptance_timeout';   // Path-1.C — Phase-1 pending > 60s

export function isTerminal(s: OrderState): boolean {
  return s.startsWith('terminal_');
}

// ── In-flight order (the cross-iteration carrier WITHIN a tick) ────

export interface InFlightOrder {
  order_id: string;
  client_order_id: string;
  symbol: string;
  side: 'long' | 'short';
  trade_type: TradeType;
  intent: DeltaIntent;
  broker_side: 'buy' | 'sell';
  shares: number;
  current_limit_price: number;
  state: OrderState;
  /** 0 = initial; +1 per escalation. Entry max 1; rank_exit max 2. */
  ladder_step: number;
  /** Set at original POST and refreshed on cancel-and-replace (the
   *  per-step timer). NOT the wall-clock budget anchor. */
  submitted_at: Date;
  /** Set on first Phase-1 acceptance; PRESERVED across escalation
   *  (the wall-clock cap anchor). Null while Phase-1 unresolved. */
  accepted_at: Date | null;
  /** Last observed elapsed-since-submit for Phase-1 (Path 1.C check). */
  pending_elapsed_s: number;
  provenance: DeltaProvenance;
}

/**
 * Filled-quantity hint for a broker-working order (DEC-070 clause b;
 * FP-057 Sub-step 2). Optional + defaults to 0 so existing test fixtures
 * and lifecycle paths keep working unchanged. Populated by the open-orders
 * fetcher (`AlpacaOpenOrdersFetcher.listOpenInFlight`) when the broker
 * reports a `partially_filled` order so the planner can subtract the
 * already-filled segment when computing working-notional remainders.
 *
 * The filled segment is ALREADY in `position_market_value` (broker truth);
 * the working segment uses `shares - (filled_qty ?? 0)`. Counting both
 * without double-counting is the central correctness property tested in
 * `rebalance-planner-workingorders_test.ts`.
 */
// Backwards-compatible augmentation: kept as a separate interface so the
// canonical `InFlightOrder` shape (consumed by the lifecycle/state-machine
// transitions) stays byte-identical.
export interface InFlightOrderFilledHint {
  filled_qty?: number;
}

// ── Events feeding the transition function ─────────────────────────

export type StateMachineEvent =
  | {
      kind: 'acceptance_observed';
      state: OrderAcceptanceState;
      rejection_tier: 'tier2_skip' | 'tier3_pause' | null; // tagged by rejection-classifier; null when not rejected
      rejection_reason: string | null;
      pending_elapsed_s: number;
    }
  | {
      kind: 'fill_observed';
      filled: boolean;
      filled_qty: number;
      avg_fill_price: number | null;
    };

// ── Side effects (values; executed by the I/O shell) ───────────────

export interface CancelAndReplaceEffect {
  kind: 'cancel_and_replace';
  order_id: string;
  symbol: string;
  broker_side: 'buy' | 'sell';
  shares: number;
  new_limit_price: number;
  next_ladder_step: number;
  reason: 'tier1_escalation';
}

export interface EmitEventEffect {
  kind: 'emit_event';
  call_name: string;                  // 'longshort.execution.tier1_escalated' | …
  tier: 'tier1' | 'tier2' | 'tier3';
  outcome: 'failure_handled' | 'failure_escalated' | 'false_positive_within_tolerance';
  payload: Record<string, unknown>;
}

export interface ScopeViolationErrorEffect {
  kind: 'scope_violation_error';
  order_id: string;
  reason: string;
}

export type SideEffect =
  | CancelAndReplaceEffect
  | EmitEventEffect
  | ScopeViolationErrorEffect;

// ── Config (DEC-068 clause b named defaults) ───────────────────────

export interface StateMachineConfig {
  /** §11.0.7 #13 — Phase-1 pending past this fires Path-1.C tier-3. */
  PHASE1_PENDING_OPERATOR_ALERT_S: number;
  /** DEC-068 clause b — absolute time-in-broker cap anchored at accepted_at. */
  WALL_CLOCK_CAP_S: number;
  /** Per-step fill-wait before escalating; rough mirror of §8.6.2 check marks
   *  (entry ~30s; rank_exit ~60/150s). v1 single value; refined at DW-NEW-B
   *  ratification once paper replay surfaces the right cadence. */
  STEP_FILL_WAIT_S_ENTRY: number;
  STEP_FILL_WAIT_S_RANK_EXIT: number;
}

export const DEFAULT_STATE_MACHINE_CONFIG: StateMachineConfig = {
  PHASE1_PENDING_OPERATOR_ALERT_S: 60,
  WALL_CLOCK_CAP_S: 120,
  STEP_FILL_WAIT_S_ENTRY: 30,
  STEP_FILL_WAIT_S_RANK_EXIT: 60,
};

// ── Ladders (§8.6.2 verbatim) ──────────────────────────────────────

export interface LadderStep {
  /** Cumulative bps offset from the INITIAL limit price for this step. */
  cumulative_bps: number;
}

/** ENTRY: step 0 initial → step 1 +50 bps → terminal. */
export const ENTRY_LADDER: readonly LadderStep[] = [
  { cumulative_bps: 0 },
  { cumulative_bps: 50 },
] as const;

/** RANK_EXIT: step 0 initial → step 1 +100 bps → step 2 +200 bps → terminal. */
export const RANK_EXIT_LADDER: readonly LadderStep[] = [
  { cumulative_bps: 0 },
  { cumulative_bps: 100 },
  { cumulative_bps: 200 },
] as const;

export function ladderFor(trade_type: 'entry' | 'rank_exit'): readonly LadderStep[] {
  return trade_type === 'entry' ? ENTRY_LADDER : RANK_EXIT_LADDER;
}

export function stepFillWaitS(
  trade_type: 'entry' | 'rank_exit',
  config: StateMachineConfig,
): number {
  return trade_type === 'entry' ? config.STEP_FILL_WAIT_S_ENTRY : config.STEP_FILL_WAIT_S_RANK_EXIT;
}

/**
 * Compute the escalated limit price for the next ladder step. The cumulative
 * bps offset is applied to the INITIAL limit (step-0) price, not compounded.
 * `initial_limit_price` is recovered from the order's first-step state by
 * the shell; here we accept it as a parameter so the transition stays pure.
 */
export function escalatedLimitPrice(args: {
  initial_limit_price: number;
  broker_side: 'buy' | 'sell';
  cumulative_bps: number;
}): number {
  const factor = args.cumulative_bps / 10_000;
  // Buys escalate UP (toward ask); sells escalate DOWN (toward bid).
  // Sign convention: more aggressive = away from mid in fill direction.
  const signed = args.broker_side === 'buy' ? +factor : -factor;
  return args.initial_limit_price * (1 + signed);
}

// ── Transition function (PURE) ─────────────────────────────────────

export interface NextStateInput {
  order: InFlightOrder;
  /** Initial step-0 limit price for THIS order — recovered by shell from
   *  the original SubmissionResult; needed for non-compounding escalation. */
  initial_limit_price: number;
  event: StateMachineEvent;
  ts: Date;
  config: StateMachineConfig;
}

export interface NextStateOutput {
  nextOrder: InFlightOrder;
  sideEffects: SideEffect[];
}

/** Elapsed seconds from `from` to `ts`, floored at 0. */
function elapsedS(ts: Date, from: Date): number {
  return Math.max(0, (ts.getTime() - from.getTime()) / 1000);
}

function terminate(
  o: InFlightOrder,
  state: Extract<
    OrderState,
    | 'terminal_filled'
    | 'terminal_tier2_skip_next_tick'
    | 'terminal_tier2_unfillable_skip'
    | 'terminal_tier3_pause'
    | 'terminal_tier3_acceptance_timeout'
  >,
): InFlightOrder {
  return { ...o, state };
}

function emit(
  call_name: string,
  tier: EmitEventEffect['tier'],
  outcome: EmitEventEffect['outcome'],
  payload: Record<string, unknown>,
): EmitEventEffect {
  return { kind: 'emit_event', call_name, tier, outcome, payload };
}

function basePayload(o: InFlightOrder): Record<string, unknown> {
  return {
    order_id: o.order_id,
    client_order_id: o.client_order_id,
    symbol: o.symbol,
    side: o.side,
    intent: o.intent,
    trade_type: o.trade_type,
    shares: o.shares,
    ladder_step: o.ladder_step,
    current_limit_price: o.current_limit_price,
  };
}

export function nextState(input: NextStateInput): NextStateOutput {
  const { order, event, ts, config, initial_limit_price } = input;

  // ── Defensive scope guard (DW-149) — first thing the kernel checks.
  if (!isSupportedTradeType(order.trade_type)) {
    const reason = `short_stop deferred to DW-149: trade_type='${order.trade_type}' not supported in E3 v1`;
    return {
      nextOrder: terminate(order, 'terminal_tier3_pause'),
      sideEffects: [
        { kind: 'scope_violation_error', order_id: order.order_id, reason },
        emit('longshort.execution.scope_violation', 'tier3', 'failure_escalated', {
          ...basePayload(order),
          reason,
        }),
      ],
    };
  }

  // Already-terminal — no transition.
  if (isTerminal(order.state)) {
    return { nextOrder: order, sideEffects: [] };
  }

  // ── Branch by event kind. ─────────────────────────────────────────

  if (event.kind === 'acceptance_observed') {
    // Phase-1 path. We expect order.state ∈ {phase1_pending, phase2_escalating}.
    // (phase2_escalating is the transient state used by the shell after it
    // issues cancel-and-replace; the resubmission re-enters Phase-1 polling.)
    if (order.state !== 'phase1_pending' && order.state !== 'phase2_escalating') {
      return { nextOrder: order, sideEffects: [] };
    }

    if (event.state === 'accepted') {
      // Phase-1 → Phase-2. Set accepted_at ONLY if not previously set
      // (preserved across escalation per the wall-clock-cap anchor rule).
      const accepted_at = order.accepted_at ?? ts;
      const nextOrder: InFlightOrder = {
        ...order,
        state: 'phase2_working',
        accepted_at,
        pending_elapsed_s: event.pending_elapsed_s,
      };
      return {
        nextOrder,
        sideEffects: [
          emit(
            'longshort.execution.phase1_accepted',
            'tier1',
            'false_positive_within_tolerance',
            { ...basePayload(nextOrder), accepted_at: accepted_at.toISOString() },
          ),
        ],
      };
    }

    if (event.state === 'rejected') {
      const tier = event.rejection_tier ?? 'tier3_pause';
      const terminal = tier === 'tier2_skip'
        ? 'terminal_tier2_skip_next_tick'
        : 'terminal_tier3_pause';
      return {
        nextOrder: terminate(order, terminal),
        sideEffects: [
          emit(
            tier === 'tier2_skip'
              ? 'longshort.execution.tier2_rejection_skipped'
              : 'longshort.execution.tier3_rejection_paused',
            tier === 'tier2_skip' ? 'tier2' : 'tier3',
            tier === 'tier2_skip' ? 'failure_handled' : 'failure_escalated',
            {
              ...basePayload(order),
              rejection_reason: event.rejection_reason,
              rejection_tier: tier,
            },
          ),
        ],
      };
    }

    // pending — extended polling OR Path-1.C trigger.
    if (event.pending_elapsed_s > config.PHASE1_PENDING_OPERATOR_ALERT_S) {
      return {
        nextOrder: terminate(order, 'terminal_tier3_acceptance_timeout'),
        sideEffects: [
          emit(
            'longshort.execution.tier3_acceptance_timeout',
            'tier3',
            'failure_escalated',
            {
              ...basePayload(order),
              pending_elapsed_s: event.pending_elapsed_s,
              threshold_s: config.PHASE1_PENDING_OPERATOR_ALERT_S,
            },
          ),
        ],
      };
    }
    // Within threshold — remain phase1_pending, refresh observed elapsed.
    return {
      nextOrder: { ...order, state: 'phase1_pending', pending_elapsed_s: event.pending_elapsed_s },
      sideEffects: [],
    };
  }

  // event.kind === 'fill_observed'
  if (order.state !== 'phase2_working' && order.state !== 'phase2_escalating') {
    return { nextOrder: order, sideEffects: [] };
  }

  if (event.filled) {
    return {
      nextOrder: terminate(order, 'terminal_filled'),
      sideEffects: [
        emit('longshort.execution.filled', 'tier1', 'false_positive_within_tolerance', {
          ...basePayload(order),
          filled_qty: event.filled_qty,
          avg_fill_price: event.avg_fill_price,
        }),
      ],
    };
  }

  // Not filled. Decide: wall-clock cap? ladder-step elapsed? hold?
  // The wall-clock cap is anchored at accepted_at (PRESERVED across
  // escalation). The per-step timer is anchored at submitted_at (refreshed
  // on cancel-and-replace) so each ladder step gets its own fill window.
  const trade_type = order.trade_type as 'entry' | 'rank_exit';
  const ladder = ladderFor(trade_type);
  const stepWait = stepFillWaitS(trade_type, config);
  const stepElapsed = elapsedS(ts, order.submitted_at);
  const totalElapsed = order.accepted_at !== null ? elapsedS(ts, order.accepted_at) : 0;

  if (totalElapsed > config.WALL_CLOCK_CAP_S) {
    return {
      nextOrder: terminate(order, 'terminal_tier2_unfillable_skip'),
      sideEffects: [
        emit(
          'longshort.execution.tier2_unfillable_wallclock_cap',
          'tier2',
          'failure_handled',
          {
            ...basePayload(order),
            wall_clock_elapsed_s: totalElapsed,
            cap_s: config.WALL_CLOCK_CAP_S,
          },
        ),
      ],
    };
  }

  if (stepElapsed < stepWait) {
    // Still within this step's fill window — hold.
    return { nextOrder: order, sideEffects: [] };
  }

  // Step timer elapsed — try to escalate.
  const nextStepIdx = order.ladder_step + 1;
  if (nextStepIdx >= ladder.length) {
    // Ladder exhausted — terminal auto-skip.
    return {
      nextOrder: terminate(order, 'terminal_tier2_unfillable_skip'),
      sideEffects: [
        emit(
          'longshort.execution.tier2_unfillable_ladder_exhausted',
          'tier2',
          'failure_handled',
          {
            ...basePayload(order),
            ladder_steps_attempted: ladder.length,
          },
        ),
      ],
    };
  }

  // Tier-1 escalate: cancel-and-replace at the next bps step.
  const newPrice = escalatedLimitPrice({
    initial_limit_price,
    broker_side: order.broker_side,
    cumulative_bps: ladder[nextStepIdx].cumulative_bps,
  });

  return {
    nextOrder: {
      ...order,
      state: 'phase2_escalating',
      ladder_step: nextStepIdx,
      current_limit_price: newPrice,
      submitted_at: ts,     // reset per-step timer
      // accepted_at PRESERVED (wall-clock cap anchor unchanged).
      // Phase-1 re-polled by the shell after the cancel-and-replace POST.
    },
    sideEffects: [
      {
        kind: 'cancel_and_replace',
        order_id: order.order_id,
        symbol: order.symbol,
        broker_side: order.broker_side,
        shares: order.shares,
        new_limit_price: newPrice,
        next_ladder_step: nextStepIdx,
        reason: 'tier1_escalation',
      },
      emit('longshort.execution.tier1_escalated', 'tier1', 'failure_handled', {
        ...basePayload(order),
        new_limit_price: newPrice,
        next_ladder_step: nextStepIdx,
        cumulative_bps: ladder[nextStepIdx].cumulative_bps,
      }),
    ],
  };
}