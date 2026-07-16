// FP-069 W3.6.c (ACT-463.c) — overshoot execution SIZING module.
// FP-069 W3.6.e-i (ACT-464.e-i) — R-α / R-β / R-γ refactor.
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
// Consumed by W3.6.e ENTRY engine at pre-open, immediately after fetching
// a FRESH account snapshot (see OvershootAlpacaAccountFetcher) and after
// the I5 Polygon pre-open re-check (default-deny) has passed. Sizing at
// entry time — not detection time — is deliberate: (a) equity used for
// slot notional must reflect the moment of commitment, not T-close of the
// prior session; (b) I5 refusals must kill an order BEFORE any sizing
// artifact is persisted; (c) target_positions schema has NOT NULL
// target_shares / target_notional with no provisional-flag, so the row
// UPSERT owns real numbers or is not written for that ticker/side.
//
// R-4 RECONCILIATION (operator-ratified, ACT-463.c):
//   - Detection handler is BYTE-UNTOUCHED this turn; the existing
//     target_shares=0 / target_notional=0 sentinel rows persist as
//     documented-provisional and are UPSERTed to real values by the
//     W3.6.e entry engine (or left unwritten when I5 refuses). The
//     residual sentinel-zero anti-phantom debt is logged as an incidental
//     finding for a follow-up schema/UX pass, not silently fixed here.
//
// R-3 SIDE-ALLOCATION + CAPACITY CONSTANTS
//   (FP-069 W3.8 T1, ACT-478 — operator directive verbatim per ACT-475 §V.B2):
//
//   "long-primary allocation — long 0.90 / capacity 36, short 0.10 /
//    capacity 4 for the paper phase; pure long-only 1.00 / 40 PRE-AUTHORIZED
//    as the W8 live default if paper confirms the study's short verdict."
//
//   Long side  : 90 % of strategy allocation, 36 capacity slots.
//   Short side : 10 % of strategy allocation, 4 capacity slots.
//
//   SLOT-CONCENTRATION INVARIANT (both sides identical): 0.90/36 = 0.025 =
//     0.10/4 — every slot carries exactly 2.5 % of sizingBase, regardless
//     of side. Enforced by test in `sizing_test.ts`; drift = a defect.
//   NAMEPLATE SUM: 0.90 + 0.10 = 1.00 pre-margin (assertion in test).
//
//   W8 auto-election criterion (PRE-AUTHORIZED, not applied here): pure
//   long-only (1.00 / 40) becomes the live default if paper phase confirms
//   the study's short verdict — the short side is retired, not just
//   throttled. This tranche (T1) does NOT implement the auto-election;
//   the current 0.90 / 0.10 split is the paper-phase configuration.
//
//   Historical: replaces the ACT-464 first-light R-α 0.50 / 0.50 default,
//   which itself replaced the 0.25 / 0.25 pre-R-α conservative seed.
//   DO NOT revert without a ratified counter-proposal. Downstream code MUST
//   read from these exported constants and MUST NOT redeclare numeric side
//   allocations. Handlers keep passing their own `capacityPerSide` argument
//   this tranche (T1); the named capacity constants below are for T3 to
//   consume when engine wiring lands.
//
// R-β SIZING-BASE INJECTION (ACT-464.e-i):
//   Sizing consumes an already-composed `sizingBase` (dollars) rather
//   than raw `equity`. The composition rule is fixed and owned by the
//   entry engine (edge fn):
//       sizingBase = snapshot.equity * strategy_allocation_pct * margin_multiplier
//   where strategy_allocation_pct and margin_multiplier are loaded from
//   `overshoot_strategy_config` (W3.6.e-ii MIG-154). Both factors are
//   ECHOED in the OK result for auditability. This module refuses to
//   invent defaults on config absence — the caller must provide both
//   factors or short-circuit with `strategy_config_absent` upstream.
//
// R-γ INSUFFICIENT-BUYING-POWER GUARDRAIL (ACT-464.e-i):
//   Even with a valid sizingBase, an entry MUST NOT be submitted when
//   the fresh buying-power snapshot cannot cover the notional. The
//   guardrail helper `assertBuyingPowerCoversNotional` is exported for
//   the entry engine to invoke AFTER computeTargetSizing returns ok,
//   BEFORE order submission. Typed refusal `insufficient_buying_power`;
//   never a silent skip.

import type { OvershootAccountSnapshot } from '../overshoot-broker/alpaca-account-fetcher.ts';

// DEC-504-4 (2026-07-16) — SLEEVE-REALLOCATION SIZING OVERLAY.
//
// Single-home import: SI staleness is decided by ../overshoot/si-freshness.ts.
// The canary test in si-freshness_test.ts fails the build if this module
// re-inlines the predicate. The overlay is a PURE TRANSFORM over the
// baseline (long, short) allocation + capacity pair; no wall-clock, no
// DB, no network — the entry engine passes `siStaleActive` in from the
// aggregate freshness read.
//
// DORMANT-AT-BIRTH: at landing (2026-07-16), SI is FRESH (computed_at
// 2026-07-15). `siStaleActive` therefore lands FALSE and the baseline
// (0.90/0.10, 36/4) is preserved unchanged. The reallocation arm
// exercises only when the next stale window opens (~early August by
// FINRA's calendar). Zero effect on the live book at landing is
// CORRECT BEHAVIOR, not a defect.
import {
  overshootSleeveAllocation,
  siStaleActive,
  type SleeveAllocation,
} from '../overshoot/si-freshness.ts';

export const OVERSHOOT_SIDE_ALLOCATION_PCT_LONG = 0.90;
export const OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT = 0.10;

// ─── DEC-504-4 sleeve-reallocation overlay (pure) ───────────────────────

export interface SleeveReallocationInput {
  /** As-of date for the run, YYYY-MM-DD (UTC). */
  asOf: string;
  /** Freshest SI as_of_date across the short universe (max(as_of_date)
   *  from `overshoot_short_interest`), or null when the corpus is empty.
   *  Loaded by the entry engine — the overlay is pure. */
  freshestSiAsOfDate: string | null;
  /** DEC-504-3 ratified staleness threshold (21). Caller supplies. */
  stalenessMaxDays: number;
}

export interface SleeveReallocationDecision extends SleeveAllocation {
  /** For audit-log emission by the caller (see DEC-504-4 audit contract):
   *  when this flips, emit `overshoot.sleeve_reallocation.engaged`
   *  (active=true) or `overshoot.sleeve_reallocation.released`
   *  (active=false) via the per-strategy audit writer with reason
   *  `si_stale_active` or `si_freshness_restored` respectively. Every
   *  lot / target_positions row CREATED during an active window carries
   *  the `w5_reallocation_ref` uuid (see MIG below). */
  reason: 'si_stale_active' | 'si_freshness_restored' | 'baseline';
}

/**
 * DEC-504-4 overlay entry point. Consumed by the entry engine BEFORE
 * calling `computeTargetSizing` — the returned {longCapacity, shortCapacity,
 * long/short allocation pct} are the effective values for the run.
 *
 * WITHIN-OVERSHOOT scope only. Cross-strategy reallocation is explicitly
 * out of scope for this overlay (rejected as allocator-era work).
 */
export function decideSleeveReallocation(
  input: SleeveReallocationInput,
): SleeveReallocationDecision {
  const active = siStaleActive(input.asOf, input.freshestSiAsOfDate, input.stalenessMaxDays);
  const allocation = overshootSleeveAllocation(active, {
    longAllocationPct: OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
    shortAllocationPct: OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
    longCapacity: OVERSHOOT_CAPACITY_LONG,
    shortCapacity: OVERSHOOT_CAPACITY_SHORT,
  });
  return {
    ...allocation,
    reason: active ? 'si_stale_active' : 'baseline',
  };
}

/** R-3 capacity constants (ACT-478 / ACT-475 §V.B2). NAMED but not yet
 *  consumed by handlers this tranche — handlers pass their own
 *  capacityPerSide argument until T3 wires these in. Slot concentration
 *  = allocation ÷ capacity = 2.5 % both sides (invariant pinned by test). */
export const OVERSHOOT_CAPACITY_LONG = 36;
export const OVERSHOOT_CAPACITY_SHORT = 4;

export type OvershootSizeSide = 'LONG' | 'SHORT';

export interface ComputeTargetSizingInput {
  /** Fresh account snapshot at entry time (I7-#7). Refusal short-circuits.
   *  Kept on the input for the equity_snapshot_unavailable refusal
   *  passthrough; the numeric basis for sizing is `sizingBase`, not
   *  snapshot.equity (see R-β). */
  snapshot: OvershootAccountSnapshot;
  side: OvershootSizeSide;
  /** Number of capacity slots on THIS side (long or short) for the run. */
  capacityPerSide: number;
  /** Reference price for share computation. T-close for detection-time
   *  provisional preview; freshest NBBO/last-trade at entry commitment. */
  entryReferencePrice: number;
  /** R-β: pre-composed sizing base in dollars —
   *      snapshot.equity * strategyAllocationPct * marginMultiplier.
   *  Composed by the entry engine from overshoot_strategy_config;
   *  this module NEVER reads config or derives it internally. */
  sizingBase: number;
  /** R-β provenance: strategy allocation pct used in sizingBase (0..1]. */
  strategyAllocationPct: number;
  /** R-β provenance: margin multiplier used in sizingBase (>=1.00). */
  marginMultiplier: number;
}

export interface TargetSizingOk {
  ok: true;
  side: OvershootSizeSide;
  slotNotional: number;
  shares: number; // FLOOR(slotNotional / entryReferencePrice)
  /** Provenance echo — auditability of the allocation basis used. */
  sideAllocationPct: number;
  equityBasis: number;
  /** R-β provenance echoes — recorded on the target_positions UPSERT for audit. */
  sizingBase: number;
  strategyAllocationPct: number;
  marginMultiplier: number;
}

export type TargetSizingRefusalCode =
  | 'equity_snapshot_unavailable'
  | 'capacity_non_positive'
  | 'reference_price_non_positive'
  | 'reference_price_exceeds_slot_notional'
  | 'sizing_base_non_positive'
  | 'strategy_allocation_pct_out_of_range'
  | 'margin_multiplier_out_of_range';

export interface TargetSizingRefusal {
  ok: false;
  refusal: TargetSizingRefusalCode;
  reason: string;
  side: OvershootSizeSide;
}

export type TargetSizingResult = TargetSizingOk | TargetSizingRefusal;

export function sideAllocationPct(side: OvershootSizeSide): number {
  return side === 'LONG'
    ? OVERSHOOT_SIDE_ALLOCATION_PCT_LONG
    : OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT;
}

export function computeTargetSizing(input: ComputeTargetSizingInput): TargetSizingResult {
  const {
    snapshot, side, capacityPerSide, entryReferencePrice,
    sizingBase, strategyAllocationPct, marginMultiplier,
  } = input;

  // Refusal passthrough — per the account-fetcher consumer contract, an
  // ok=false snapshot MUST short-circuit sizing. No phantom sizing.
  if (snapshot.ok === false) {
    return {
      ok: false,
      refusal: 'equity_snapshot_unavailable',
      reason: `account snapshot refused: ${snapshot.reason}`,
      side,
    };
  }

  if (!Number.isFinite(strategyAllocationPct) || strategyAllocationPct <= 0 || strategyAllocationPct > 1) {
    return {
      ok: false,
      refusal: 'strategy_allocation_pct_out_of_range',
      reason: `strategyAllocationPct must be in (0, 1] (got ${strategyAllocationPct})`,
      side,
    };
  }

  if (!Number.isFinite(marginMultiplier) || marginMultiplier < 1) {
    return {
      ok: false,
      refusal: 'margin_multiplier_out_of_range',
      reason: `marginMultiplier must be >= 1.00 (got ${marginMultiplier})`,
      side,
    };
  }

  if (!Number.isFinite(sizingBase) || sizingBase <= 0) {
    return {
      ok: false,
      refusal: 'sizing_base_non_positive',
      reason: `sizingBase must be > 0 (got ${sizingBase})`,
      side,
    };
  }

  if (!Number.isFinite(capacityPerSide) || capacityPerSide <= 0) {
    return {
      ok: false,
      refusal: 'capacity_non_positive',
      reason: `capacityPerSide must be > 0 (got ${capacityPerSide})`,
      side,
    };
  }

  if (!Number.isFinite(entryReferencePrice) || entryReferencePrice <= 0) {
    return {
      ok: false,
      refusal: 'reference_price_non_positive',
      reason: `entryReferencePrice must be > 0 (got ${entryReferencePrice})`,
      side,
    };
  }

  const pct = sideAllocationPct(side);
  // R-β: slotNotional is a pure slice of the injected sizingBase. Side
  // allocation is applied to the sizingBase (which already includes
  // strategy_allocation_pct and margin_multiplier); the side-pct is the
  // long/short partition within the strategy allocation.
  const slotNotional = (sizingBase * pct) / capacityPerSide;
  const shares = Math.floor(slotNotional / entryReferencePrice);

  if (shares <= 0) {
    // Typed outcome, not a silent zero — the entry engine treats this as a
    // refusal (do not write a 0-share target_positions row; do not order).
    return {
      ok: false,
      refusal: 'reference_price_exceeds_slot_notional',
      reason: `slotNotional=${slotNotional} < entryReferencePrice=${entryReferencePrice}; shares would floor to 0`,
      side,
    };
  }

  return {
    ok: true,
    side,
    slotNotional,
    shares,
    sideAllocationPct: pct,
    equityBasis: snapshot.equity,
    sizingBase,
    strategyAllocationPct,
    marginMultiplier,
  };
}

// ─── R-γ BUYING-POWER GUARDRAIL ────────────────────────────────────────────

export interface BuyingPowerCheckInput {
  /** Same snapshot passed to computeTargetSizing (must be ok=true here). */
  snapshot: OvershootAccountSnapshot;
  /** Total dollar notional the engine intends to submit this run
   *  (Σ slotNotional across all approved (ticker, side) pairs). */
  intendedNotional: number;
}

export type BuyingPowerCheckResult =
  | { ok: true; buyingPower: number; intendedNotional: number; headroom: number }
  | { ok: false; refusal: 'insufficient_buying_power' | 'equity_snapshot_unavailable';
      reason: string; buyingPower: number | null; intendedNotional: number };

/**
 * R-γ guardrail. Called by the entry engine AFTER all per-slot sizings
 * resolve ok, BEFORE any order submission. Refuses the run (or the
 * subset above BP) with `insufficient_buying_power` — never a silent
 * partial. Pure; no wall-clock; no net.
 */
export function assertBuyingPowerCoversNotional(
  input: BuyingPowerCheckInput,
): BuyingPowerCheckResult {
  const { snapshot, intendedNotional } = input;
  if (snapshot.ok === false) {
    return {
      ok: false, refusal: 'equity_snapshot_unavailable',
      reason: `account snapshot refused: ${snapshot.reason}`,
      buyingPower: null, intendedNotional,
    };
  }
  if (!Number.isFinite(intendedNotional) || intendedNotional < 0) {
    return {
      ok: false, refusal: 'insufficient_buying_power',
      reason: `intendedNotional must be finite and >= 0 (got ${intendedNotional})`,
      buyingPower: snapshot.buying_power, intendedNotional,
    };
  }
  const headroom = snapshot.buying_power - intendedNotional;
  if (headroom < 0) {
    return {
      ok: false, refusal: 'insufficient_buying_power',
      reason: `intendedNotional=${intendedNotional} exceeds buying_power=${snapshot.buying_power} (headroom=${headroom})`,
      buyingPower: snapshot.buying_power, intendedNotional,
    };
  }
  return { ok: true, buyingPower: snapshot.buying_power, intendedNotional, headroom };
}