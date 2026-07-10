/**
 * allocation-cap — INC-96 fix. Aggregate per-side allocation guard for
 * the overshoot entry engine.
 *
 * Owner: overshoot-execution module (strategy)
 * Classification: money-path pure primitive
 * Lifecycle: active
 *
 * PROBLEM (INC-96, Tier-A). The entry handler applies ratified
 * allocation constants (`OVERSHOOT_SIDE_ALLOCATION_PCT_LONG=0.90`,
 * `_SHORT=0.10`, `strategy_allocation_pct`, `margin_multiplier`) at the
 * PER-SLOT decision point via `computeTargetSizing`, but re-checks
 * NOTHING at the AGGREGATE level over `(current_book_MV + this-run
 * accepted notional + this-order notional)`. Alpaca `buying_power`
 * reflects RegT 2× intraday margin, so the BP gate cannot substitute:
 * on a deep book the loop will happily submit up to ~2× equity of LONG
 * orders before RegT bites. Same defect family as INC-87 / INC-92.
 *
 * FIX SHAPE. Before broker submit, project the post-fill MV per side:
 *   projected_side_MV = current_open_lots_MV_side
 *                     + already_accepted_this_run_notional_side
 *                     + this_order_notional
 * Refuse the order with typed reason `allocation_cap_reached` iff
 *   projected_side_MV > sizingBase × OVERSHOOT_SIDE_ALLOCATION_PCT_<SIDE>
 * where `sizingBase = equity × strategy_allocation_pct × margin_multiplier`
 * (identical to the sizingBase computed by the handler; passed in so
 * this module has no clock / config dependency).
 *
 * MV BASIS (LOAD-BEARING). `computeOpenMVBySide` uses broker MARKS
 * (`market_value`) as the PRIMARY basis for each open broker position,
 * and falls back to COST BASIS (`avg_entry_price × qty`) when Alpaca
 * omits `market_value` on the row. Rationale: marks are the truer
 * measure of $-at-risk vs equity — a cost-basis view can silently eat
 * headroom as prices move. Cost-basis fallback is deterministic and
 * NEVER understates exposure vs the ledger. Every emitted basis mix is
 * reported in `MvBySideResult.basis_mix` so the entry-run audit can
 * record whether the cap decision rode on `broker_mark`, `cost_basis`,
 * or a mix — W5 measurement carries this through.
 *
 * RANK PRESERVATION. Iteration order is unchanged — this module refuses
 * the current slot only. Because the entry handler iterates in detector-
 * rank order (LONG then SHORT, `rank_score DESC`), the best names claim
 * the remaining headroom first and the tail truncates cleanly with
 * `allocation_cap_reached`. No reordering induced by the cap.
 *
 * SCOPE. This module is a PURE primitive: no I/O, no clock, no globals.
 * The handler injects the ratified constants + snapshot values.
 */

export type OvershootAllocSide = 'long' | 'short';

/** Minimal shape of a broker position row consumed by this module.
 *  Mirrors `_shared/overshoot-broker/alpaca-position-fetcher.ts`
 *  BrokerPosition (qty signed by Alpaca: >0 long, <0 short). */
export interface BrokerPositionForCap {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  market_value?: number;
}

/** Minimal shape of an open lot row consumed as a defensive fallback
 *  when a lot exists in `overshoot_lots` but the broker returned no
 *  matching position (should not happen — ledger + broker are the
 *  same truth by contract — but the ledger is included so the cap
 *  NEVER understates exposure vs `overshoot_lots.cost_basis`). */
export interface OpenLotForCap {
  symbol: string;
  side: OvershootAllocSide;
  cost_basis: number; // total cost, always positive
}

export interface MvBySideResult {
  long: number;   // aggregate absolute LONG MV
  short: number;  // aggregate absolute SHORT MV
  basis_mix: {
    long:  { broker_mark: number; cost_basis_fallback: number; ledger_only: number };
    short: { broker_mark: number; cost_basis_fallback: number; ledger_only: number };
  };
}

/**
 * Compute open MV per side. Broker rows first (marks preferred,
 * cost-basis fallback). Then any lot in `overshoot_lots` for a symbol
 * NOT present in the broker set contributes its `cost_basis` — this
 * is defensive: if the ledger holds a lot the broker doesn't report,
 * the cap MUST still count it (never silently understate).
 *
 * All returned MVs are POSITIVE (absolute values). Short side is a
 * positive dollar figure representing the size of the SHORT book.
 */
export function computeOpenMVBySide(
  brokerPositions: readonly BrokerPositionForCap[],
  openLots: readonly OpenLotForCap[],
): MvBySideResult {
  const result: MvBySideResult = {
    long: 0, short: 0,
    basis_mix: {
      long:  { broker_mark: 0, cost_basis_fallback: 0, ledger_only: 0 },
      short: { broker_mark: 0, cost_basis_fallback: 0, ledger_only: 0 },
    },
  };
  const brokerSymbols = new Set<string>();
  for (const p of brokerPositions) {
    if (p.qty === 0) continue;
    brokerSymbols.add(p.symbol);
    const side: OvershootAllocSide = p.qty > 0 ? 'long' : 'short';
    let mv: number;
    let bucket: 'broker_mark' | 'cost_basis_fallback';
    if (typeof p.market_value === 'number' && Number.isFinite(p.market_value)) {
      mv = Math.abs(p.market_value);
      bucket = 'broker_mark';
    } else {
      mv = Math.abs(p.avg_entry_price * p.qty);
      bucket = 'cost_basis_fallback';
    }
    result[side] += mv;
    result.basis_mix[side][bucket] += mv;
  }
  for (const lot of openLots) {
    if (brokerSymbols.has(lot.symbol)) continue; // broker row already counted
    const mv = Math.abs(lot.cost_basis);
    result[lot.side] += mv;
    result.basis_mix[lot.side].ledger_only += mv;
  }
  return result;
}

export interface AllocationCapInputs {
  side: OvershootAllocSide;
  sizingBase: number;               // equity × strategy_allocation_pct × margin_multiplier
  sideAllocationPct: number;        // OVERSHOOT_SIDE_ALLOCATION_PCT_LONG | _SHORT
  currentOpenMV: number;            // computeOpenMVBySide()[side]
  acceptedNotionalThisRun: number;  // cumulative accepted notional this run, this side
  thisOrderNotional: number;        // slotNotional from computeTargetSizing
}

export type AllocationCapResult =
  | {
      ok: true;
      side: OvershootAllocSide;
      side_cap_usd: number;
      projected_side_mv_usd: number;
      headroom_before_usd: number;
      headroom_after_usd: number;
    }
  | {
      ok: false;
      refusal: 'allocation_cap_reached';
      side: OvershootAllocSide;
      reason: string;
      side_cap_usd: number;
      projected_side_mv_usd: number;
      overshoot_usd: number;
      current_open_mv_usd: number;
      accepted_notional_this_run_usd: number;
      this_order_notional_usd: number;
    };

/**
 * Evaluate the aggregate cap for a single candidate slot. PURE.
 *
 * Invariant: `projected_side_mv > side_cap` ⇒ refuse. Equal-to-cap
 * passes (the cap is an upper bound; touching it is compliant).
 */
export function evaluateAllocationCap(
  input: AllocationCapInputs,
): AllocationCapResult {
  const {
    side, sizingBase, sideAllocationPct,
    currentOpenMV, acceptedNotionalThisRun, thisOrderNotional,
  } = input;

  // Guard: all monetary inputs must be finite non-negative numbers.
  // A malformed input is a caller bug — refuse defensively rather than
  // silently pass a bad projection through the money path.
  for (const [name, v] of [
    ['sizingBase', sizingBase],
    ['sideAllocationPct', sideAllocationPct],
    ['currentOpenMV', currentOpenMV],
    ['acceptedNotionalThisRun', acceptedNotionalThisRun],
    ['thisOrderNotional', thisOrderNotional],
  ] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return {
        ok: false, refusal: 'allocation_cap_reached', side,
        reason: `allocation-cap input ${name}=${v} not a finite non-negative number`,
        side_cap_usd: 0,
        projected_side_mv_usd: 0,
        overshoot_usd: 0,
        current_open_mv_usd: currentOpenMV,
        accepted_notional_this_run_usd: acceptedNotionalThisRun,
        this_order_notional_usd: thisOrderNotional,
      };
    }
  }

  const sideCap = sizingBase * sideAllocationPct;
  const projected = currentOpenMV + acceptedNotionalThisRun + thisOrderNotional;

  if (projected > sideCap) {
    return {
      ok: false,
      refusal: 'allocation_cap_reached',
      side,
      reason:
        `projected_${side}_MV=${projected.toFixed(2)} > side_cap=${sideCap.toFixed(2)} ` +
        `(sizingBase=${sizingBase.toFixed(2)} × sideAllocPct=${sideAllocationPct}); ` +
        `open=${currentOpenMV.toFixed(2)} + accepted=${acceptedNotionalThisRun.toFixed(2)} ` +
        `+ thisOrder=${thisOrderNotional.toFixed(2)}`,
      side_cap_usd: sideCap,
      projected_side_mv_usd: projected,
      overshoot_usd: projected - sideCap,
      current_open_mv_usd: currentOpenMV,
      accepted_notional_this_run_usd: acceptedNotionalThisRun,
      this_order_notional_usd: thisOrderNotional,
    };
  }

  return {
    ok: true,
    side,
    side_cap_usd: sideCap,
    projected_side_mv_usd: projected,
    headroom_before_usd: sideCap - (currentOpenMV + acceptedNotionalThisRun),
    headroom_after_usd: sideCap - projected,
  };
}