/**
 * state-machine_test — FP-056 E3 (DEC-068 clause b; ACT-311).
 *
 * Pure-kernel transitions: fixtures-in, decisions-out. Covers entry +
 * rank_exit ladders, wall-clock cap, accepted_at preservation across
 * escalation, Path-1.C tier-3 trigger, rejection routing by tier, the
 * defensive short-stop guard. Gate-6 self-scan at the file tail.
 */

import { assert, assertAlmostEquals, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DeltaProvenance } from './order-submitter.ts';
import {
  type CancelAndReplaceEffect,
  type EmitEventEffect,
  type InFlightOrder,
  type SideEffect,
  type StateMachineConfig,
  DEFAULT_STATE_MACHINE_CONFIG,
  ENTRY_LADDER,
  RANK_EXIT_LADDER,
  escalatedLimitPrice,
  isSupportedTradeType,
  ladderFor,
  nextState,
} from './state-machine.ts';

const PROV: DeltaProvenance = {
  selection_reason: 'primary',
  substituted_from_symbol: null,
  original_rank: 5,
  sector: 'Tech',
  computed_at: '2026-06-24T20:30:00Z',
};

const CFG: StateMachineConfig = { ...DEFAULT_STATE_MACHINE_CONFIG };
const T0 = new Date('2026-06-24T20:30:00Z');
const PLUS = (s: number) => new Date(T0.getTime() + s * 1000);

function mkOrder(over: Partial<InFlightOrder> = {}): InFlightOrder {
  return {
    order_id: 'o1',
    client_order_id: 'lse-A-open-1',
    symbol: 'A',
    side: 'long',
    trade_type: 'entry',
    intent: 'open',
    broker_side: 'buy',
    shares: 10,
    current_limit_price: 100,
    state: 'phase1_pending',
    ladder_step: 0,
    submitted_at: T0,
    accepted_at: null,
    pending_elapsed_s: 0,
    provenance: PROV,
    ...over,
  };
}

function findEmit(effs: readonly SideEffect[], call: string): EmitEventEffect | undefined {
  return effs.find((e) => e.kind === 'emit_event' && e.call_name === call) as EmitEventEffect | undefined;
}
function findCancel(effs: readonly SideEffect[]): CancelAndReplaceEffect | undefined {
  return effs.find((e) => e.kind === 'cancel_and_replace') as CancelAndReplaceEffect | undefined;
}

// ── trade-type guard helper
Deno.test('isSupportedTradeType: entry+rank_exit only', () => {
  assert(isSupportedTradeType('entry'));
  assert(isSupportedTradeType('rank_exit'));
  assert(!isSupportedTradeType('short_stop' as never));
});

// ── Phase-1 acceptance branches
Deno.test('Phase-1 accepted → phase2_working; accepted_at set to ts', () => {
  const ts = PLUS(5);
  const { nextOrder, sideEffects } = nextState({
    order: mkOrder(),
    initial_limit_price: 100,
    event: { kind: 'acceptance_observed', state: 'accepted', rejection_tier: null, rejection_reason: null, pending_elapsed_s: 5 },
    ts,
    config: CFG,
  });
  assertEquals(nextOrder.state, 'phase2_working');
  assertEquals(nextOrder.accepted_at?.toISOString(), ts.toISOString());
  assertExists(findEmit(sideEffects, 'longshort.execution.phase1_accepted'));
});

Deno.test('Phase-1 rejected with halt reason → tier2_skip_next_tick', () => {
  const { nextOrder, sideEffects } = nextState({
    order: mkOrder(),
    initial_limit_price: 100,
    event: {
      kind: 'acceptance_observed', state: 'rejected',
      rejection_tier: 'tier2_skip', rejection_reason: 'symbol halted',
      pending_elapsed_s: 1,
    },
    ts: PLUS(1), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_tier2_skip_next_tick');
  const ev = findEmit(sideEffects, 'longshort.execution.tier2_rejection_skipped')!;
  assertEquals(ev.tier, 'tier2');
  assertEquals(ev.outcome, 'failure_handled');
});

Deno.test('Phase-1 rejected with ssr reason → tier3_pause; failure_escalated', () => {
  const { nextOrder, sideEffects } = nextState({
    order: mkOrder({ side: 'short', broker_side: 'sell', intent: 'open' }),
    initial_limit_price: 100,
    event: {
      kind: 'acceptance_observed', state: 'rejected',
      rejection_tier: 'tier3_pause', rejection_reason: 'ssr_violation',
      pending_elapsed_s: 1,
    },
    ts: PLUS(1), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_tier3_pause');
  const ev = findEmit(sideEffects, 'longshort.execution.tier3_rejection_paused')!;
  assertEquals(ev.outcome, 'failure_escalated');
});

Deno.test('Phase-1 pending below threshold → remain phase1_pending', () => {
  const { nextOrder } = nextState({
    order: mkOrder(), initial_limit_price: 100,
    event: { kind: 'acceptance_observed', state: 'pending', rejection_tier: null, rejection_reason: null, pending_elapsed_s: 12 },
    ts: PLUS(12), config: CFG,
  });
  assertEquals(nextOrder.state, 'phase1_pending');
  assertEquals(nextOrder.pending_elapsed_s, 12);
});

Deno.test('Phase-1 pending past 60s → terminal_tier3_acceptance_timeout (Path 1.C)', () => {
  const { nextOrder, sideEffects } = nextState({
    order: mkOrder(), initial_limit_price: 100,
    event: { kind: 'acceptance_observed', state: 'pending', rejection_tier: null, rejection_reason: null, pending_elapsed_s: 61 },
    ts: PLUS(61), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_tier3_acceptance_timeout');
  const ev = findEmit(sideEffects, 'longshort.execution.tier3_acceptance_timeout')!;
  assertEquals(ev.outcome, 'failure_escalated');
});

// ── Phase-2 branches
Deno.test('Phase-2 fill → terminal_filled', () => {
  const o = mkOrder({ state: 'phase2_working', accepted_at: T0, submitted_at: T0 });
  const { nextOrder, sideEffects } = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: true, filled_qty: 10, avg_fill_price: 100.01 },
    ts: PLUS(10), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_filled');
  assertExists(findEmit(sideEffects, 'longshort.execution.filled'));
});

Deno.test('Phase-2 unfilled within step window → hold (no transition)', () => {
  const o = mkOrder({ state: 'phase2_working', accepted_at: T0, submitted_at: T0 });
  const { nextOrder, sideEffects } = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(5), config: CFG,
  });
  assertEquals(nextOrder.state, 'phase2_working');
  assertEquals(sideEffects.length, 0);
});

Deno.test('Entry: step-0 elapsed → tier-1 escalate to +50bps (cancel_and_replace + phase2_escalating)', () => {
  const o = mkOrder({ state: 'phase2_working', accepted_at: T0, submitted_at: T0 });
  const { nextOrder, sideEffects } = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(31), config: CFG,
  });
  assertEquals(nextOrder.state, 'phase2_escalating');
  assertEquals(nextOrder.ladder_step, 1);
  const cnr = findCancel(sideEffects)!;
  // buy escalates UP by 50bps from initial 100 = 100.5
  assertEquals(Math.round(cnr.new_limit_price * 100) / 100, 100.5);
  assertEquals(nextOrder.current_limit_price, cnr.new_limit_price);
  // accepted_at PRESERVED across escalation (the wall-clock anchor).
  assertEquals(nextOrder.accepted_at?.toISOString(), T0.toISOString());
  // submitted_at REFRESHED to ts (per-step timer reset).
  assertEquals(nextOrder.submitted_at.toISOString(), PLUS(31).toISOString());
  assertExists(findEmit(sideEffects, 'longshort.execution.tier1_escalated'));
});

Deno.test('Entry: ladder exhausted (step 1 elapsed) → tier2_unfillable_skip', () => {
  const o = mkOrder({
    state: 'phase2_working', accepted_at: T0, submitted_at: PLUS(31),
    ladder_step: 1, current_limit_price: 100.5,
  });
  const { nextOrder, sideEffects } = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(62), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_tier2_unfillable_skip');
  const ev = findEmit(sideEffects, 'longshort.execution.tier2_unfillable_ladder_exhausted')!;
  assertEquals(ev.tier, 'tier2');
});

Deno.test('Rank-exit: step 0 → step 1 (+100bps) → step 2 (+200bps) → tier2_unfillable_skip', () => {
  // Sell-side rank_exit: escalating direction is DOWN (toward bid).
  const o = mkOrder({
    trade_type: 'rank_exit', intent: 'close', side: 'long', broker_side: 'sell',
    state: 'phase2_working', accepted_at: T0, submitted_at: T0, current_limit_price: 100,
  });
  const r1 = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(61), config: CFG,
  });
  assertEquals(r1.nextOrder.state, 'phase2_escalating');
  assertEquals(r1.nextOrder.ladder_step, 1);
  // sell escalates DOWN by 100bps from 100 = 99
  assertEquals(Math.round(r1.nextOrder.current_limit_price * 100) / 100, 99);

  // Pretend we got re-accepted, then step-1 timer elapses.
  const o2: InFlightOrder = { ...r1.nextOrder, state: 'phase2_working', submitted_at: PLUS(61) };
  // Use an expanded wall-clock cap for this ladder-progression sub-step so
  // the test isolates step-timer escalation (the wall-clock-cap path has
  // its own dedicated test below).
  const cfgLongA = { ...CFG, WALL_CLOCK_CAP_S: 1000 };
  const r2 = nextState({
    order: o2, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(122), config: cfgLongA,
  });
  assertEquals(r2.nextOrder.ladder_step, 2);
  // sell escalates DOWN by 200bps from 100 = 98
  assertEquals(Math.round(r2.nextOrder.current_limit_price * 100) / 100, 98);

  // Now ladder exhausted: re-accepted, step-2 elapses.
  // Wall-clock anchor preserved at T0; PLUS(185) is 185s; under 120s cap?
  // 185 > 120 → wall-clock cap will trip BEFORE ladder-exhausted.
  // Test the ladder-exhausted path with a config that gives more wall-clock room.
  const cfgLong = { ...CFG, WALL_CLOCK_CAP_S: 1000 };
  const o3: InFlightOrder = { ...r2.nextOrder, state: 'phase2_working', submitted_at: PLUS(122) };
  const r3 = nextState({
    order: o3, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(185), config: cfgLong,
  });
  assertEquals(r3.nextOrder.state, 'terminal_tier2_unfillable_skip');
  assertExists(findEmit(r3.sideEffects, 'longshort.execution.tier2_unfillable_ladder_exhausted'));
});

Deno.test('Wall-clock cap (120s past accepted_at) → tier2_unfillable_skip BEFORE ladder', () => {
  const o = mkOrder({
    state: 'phase2_working', accepted_at: T0, submitted_at: PLUS(100), ladder_step: 0,
  });
  const { nextOrder, sideEffects } = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: false, filled_qty: 0, avg_fill_price: null },
    ts: PLUS(121), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_tier2_unfillable_skip');
  assertExists(findEmit(sideEffects, 'longshort.execution.tier2_unfillable_wallclock_cap'));
});

Deno.test('Defensive short-stop guard: trade_type=short_stop → scope_violation_error + tier3_pause', () => {
  const o = mkOrder({ trade_type: 'short_stop' });
  const { nextOrder, sideEffects } = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'acceptance_observed', state: 'pending', rejection_tier: null, rejection_reason: null, pending_elapsed_s: 1 },
    ts: PLUS(1), config: CFG,
  });
  assertEquals(nextOrder.state, 'terminal_tier3_pause');
  assert(sideEffects.some((e) => e.kind === 'scope_violation_error'));
  assertExists(findEmit(sideEffects, 'longshort.execution.scope_violation'));
});

Deno.test('Already-terminal carry-in → no transition, no side effects', () => {
  const o = mkOrder({ state: 'terminal_filled' });
  const r = nextState({
    order: o, initial_limit_price: 100,
    event: { kind: 'fill_observed', filled: true, filled_qty: 10, avg_fill_price: 100 },
    ts: PLUS(1), config: CFG,
  });
  assertEquals(r.nextOrder, o);
  assertEquals(r.sideEffects.length, 0);
});

Deno.test('Ladder + escalatedLimitPrice helpers', () => {
  assertEquals(ladderFor('entry'), ENTRY_LADDER);
  assertEquals(ladderFor('rank_exit'), RANK_EXIT_LADDER);
  // 100 + 50bps = 100.5 for buy (float-tolerant)
  assertAlmostEquals(escalatedLimitPrice({ initial_limit_price: 100, broker_side: 'buy', cumulative_bps: 50 }), 100.5, 1e-9);
  // 100 - 200bps = 98 for sell
  assertAlmostEquals(escalatedLimitPrice({ initial_limit_price: 100, broker_side: 'sell', cumulative_bps: 200 }), 98, 1e-9);
});

// ── Gate-6: this file MUST NOT call wall-clock APIs in the kernel module.
Deno.test('Gate-6 self-scan: state-machine.ts contains no Date.now / performance.now / no-arg Date', async () => {
  const src = await Deno.readTextFile(new URL('./state-machine.ts', import.meta.url));
  assert(!/\bDate\.now\s*\(/.test(src), 'Date.now found');
  assert(!/\bperformance\.now\s*\(/.test(src), 'performance.now found');
  // no-arg `new Date()` — match `new Date()` with no first-char between parens.
  assert(!/\bnew\s+Date\s*\(\s*\)/.test(src), 'no-arg new Date() found');
});