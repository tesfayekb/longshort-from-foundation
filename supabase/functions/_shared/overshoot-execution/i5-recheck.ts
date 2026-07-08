// FP-069 W3.6.e-i (ACT-464.e-i) — I5 POLYGON PRE-OPEN RE-CHECK (default-deny).
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
//
// STATUS: PARTIALLY-EVIDENCED (LONG side). SHORT side remains
// UNTESTED-OPERATIONAL. Structural default-DENY posture unchanged.
//
// ---- OPERATOR RATIFICATION (I5, ACT-463 + ACT-464) ------------------------
// The entry engine consults this module for EACH detection-run selection
// immediately before sizing/order-submission. The question is a binary
// "still eligible?" — did the overshoot survive from T-close to pre-open?
//
// Decision (per side):
//
//   LONG selection  (overshoot was UP at T-close):
//     Reject if the pre-open reference price has REVERTED downward
//     beyond OVERSHOOT_I5_REVERSION_MAX_LONG of the T-close-to-
//     detection-reference move. Formally:
//         reversionPct = (tCloseRef - preOpenRef) / (tCloseRef - preEventRef)
//     reversionPct > tolerance → refuse (`i5_reversion_exceeded`).
//
//   SHORT selection (overshoot was DOWN at T-close):
//     Symmetric: reject if pre-open has REVERTED upward beyond tolerance
//         reversionPct = (preOpenRef - tCloseRef) / (preEventRef - tCloseRef)
//     reversionPct > tolerance → refuse.
//
// Per-side tolerances (ACT-488, 2026-07-08 DEC — see provenance stanza below):
//   LONG:  OVERSHOOT_I5_REVERSION_MAX_LONG  = 1.00  (plateau entry per VI.J).
//   SHORT: OVERSHOOT_I5_REVERSION_MAX_SHORT = 0.50  (unchanged; VI.I.D
//          established I5-wired > T+1-open all > T-close basis on SHORT).
//
// Additional typed refusals guard against silent zero paths:
//   'polygon_snapshot_unavailable' | 'polygon_snapshot_stale'
//   'polygon_snapshot_malformed'   | 'polygon_snapshot_crossed'
//   'reference_prices_malformed'   — pre-event or t-close ref invalid
//   'degenerate_overshoot_magnitude' — |tCloseRef - preEventRef| ~= 0,
//       reversion pct undefined; refuse (never a silent 0-denominator).
//
// DEFAULT-DENY invariant: if ANY input fails validation, the result is
// ok=false. The caller MUST NOT interpret an absent ok=true as pass.
//
// ---- PROVENANCE (ACT-488, LONG-side ratification, 2026-07-08) ------------
// LONG-side threshold widened from the conservative 0.50 floor to 1.00
// on operator DEC (2026-07-08), synthesizing:
//   * VI.I (ACT-487b) — portfolio (a−b)/|a| gap at τ=0.50: LONG T1
//     14.35%, LONG T2 18.43%; refused-set mean realized return
//     out-earned survivors 4.4× (T1) / 3.0× (T2) at τ=0.50 → the gate
//     was functioning as an anti-momentum filter, opposite of charter.
//   * VI.J (ACT-487c) — τ ∈ {0.25, 0.50, 0.75, 1.00, 1.25, no-gate}
//     LONG sweep on the 1888e113 corpus. Monotone-increasing port_ret/slot
//     with a flat plateau above 0.75 (τ=1.00 → no-gate spans 3.2% of arm
//     return on LONG T1, 2.3% on LONG T2). τ=1.00 captures 33.7% (LONG T1)
//     and 29.7% (LONG T2) of the VI.I portfolio gap; residuals 9.51%
//     and 12.97% both fall below the pre-committed 15% Stage-2 GO floor.
//   * Operator DEC (2026-07-08) — ratified τ_long = 1.00 not `no-gate`,
//     three load-bearing reasons: preserves default-deny structural
//     branches, semantically defensible ("full reversion — setup no
//     longer exists"), captures ~98% of plateau uplift while leaving
//     W5 evidence room to tighten rather than being forced to loosen.
// SHORT side stays at 0.50 per VI.I.D SHORT ordering (I5 net-protective).
// Stage-2 (intraday timing grid) collapses back to NO-GO with live-drift
// tripwires A/B/C per VI.J.H, standing.

import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';
import {
  OVERSHOOT_SNAPSHOT_MIN_AGE_MS,
  OVERSHOOT_SNAPSHOT_MAX_AGE_MS,
} from './snapshot-age-bounds.ts';

/** LONG-side reversion tolerance. 1.00 = "the overshoot fully reverted";
 *  above this the pre-open price has crossed the pre-event reference on
 *  the wrong side of the overshoot — setup no longer exists at open.
 *  Provenance: ACT-488 DEC (2026-07-08); see file-header stanza. */
export const OVERSHOOT_I5_REVERSION_MAX_LONG = 1.00;

/** SHORT-side reversion tolerance. 0.50 unchanged — VI.I.D established
 *  I5 as net-protective on the SHORT arm at this threshold. Any change
 *  requires a separate DEC. */
export const OVERSHOOT_I5_REVERSION_MAX_SHORT = 0.50;

/** Snapshot staleness cap for the I5 pre-open quote read. Re-exported
 *  from the ratified single-home in ./snapshot-age-bounds.ts (ACT-486 /
 *  INC-91). Historical export name preserved for external callers/tests. */
export const OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS = OVERSHOOT_SNAPSHOT_MAX_AGE_MS;

/** Snapshot age floor for the I5 pre-open quote read.
 *
 *  ACT-485 (Option B) — provenance: ACT-484 diagnosis observed sub-second
 *  NEGATIVE snapshot ages at 09:31 ET first-light (rows: PLTR −277ms,
 *  QCOM −81ms, STX −445ms, NEM −273ms, HPE −852ms, and similar). Root
 *  cause is wall-clock skew between the edge-function server clock and
 *  Polygon `lastQuote.t` event-time (Polygon marginally ahead by ~100ms
 *  up to ~1s at market-open). Widening the acceptable lower bound from
 *  0 to −1000ms absorbs the observed skew while preserving the 15s
 *  upper bound as the true staleness cap. Ages outside [MIN, MAX] still
 *  refuse `polygon_snapshot_stale`.
 *
 *  Scope closure: ACT-486 (INC-91) extended the widening to the entry-
 *  and exit-price constructors after a class audit found the same skew
 *  pathology at those sibling sites. This constant is now re-exported
 *  from the single-home in ./snapshot-age-bounds.ts so every site
 *  imports the identical value. Historical export name preserved. */
export const OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS = OVERSHOOT_SNAPSHOT_MIN_AGE_MS;

/** Minimum absolute overshoot magnitude ($) below which reversionPct
 *  is undefined and the module refuses. Guards against 0-denominator
 *  silent zero paths — a defence-in-depth alongside NaN checks. */
export const OVERSHOOT_I5_MIN_MAGNITUDE_DOLLARS = 0.01;

export type I5RecheckSide = 'LONG' | 'SHORT';

export type I5RecheckRefusalCode =
  | 'polygon_snapshot_unavailable'
  | 'polygon_snapshot_stale'
  | 'polygon_snapshot_malformed'
  | 'polygon_snapshot_crossed'
  | 'reference_prices_malformed'
  | 'degenerate_overshoot_magnitude'
  | 'i5_reversion_exceeded';

export interface I5RecheckRefusal {
  ok: false;
  refusal: I5RecheckRefusalCode;
  reason: string;
  side: I5RecheckSide;
  reversionPct: number | null;
}

export interface I5RecheckOk {
  ok: true;
  side: I5RecheckSide;
  /** Fraction reverted from T-close toward pre-event (0..toleranceCap]. */
  reversionPct: number;
  /** Midpoint of the pre-open snapshot used for the check. */
  preOpenMid: number;
  tCloseRef: number;
  preEventRef: number;
  toleranceCap: number;
  snapshotAgeMs: number;
}

export type I5RecheckResult = I5RecheckOk | I5RecheckRefusal;

export interface I5RecheckInput {
  /** Pre-open Polygon NBBO snapshot at ~09:30-09:35 ET. Null → refuse. */
  snapshot: PolygonQuoteSnapshot | null;
  side: I5RecheckSide;
  /** T-close reference price (typically the close mark from detection). */
  tCloseRef: number;
  /** Pre-event reference price the overshoot was measured against. */
  preEventRef: number;
  /** Injected asOf clock (kernel purity; snapshot age only). */
  asOf: Date;
  /** Override for evidence gathering only. */
  toleranceCap?: number;
}

export function evaluateI5PreOpenRecheck(input: I5RecheckInput): I5RecheckResult {
  const { snapshot, side, tCloseRef, preEventRef, asOf } = input;
  const defaultToleranceForSide = side === 'LONG'
    ? OVERSHOOT_I5_REVERSION_MAX_LONG
    : OVERSHOOT_I5_REVERSION_MAX_SHORT;
  const toleranceCap = input.toleranceCap ?? defaultToleranceForSide;

  if (snapshot === null) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'polygon_snapshot_unavailable',
      reason: 'no Polygon snapshot supplied to I5 recheck (default-deny)',
    };
  }
  const { bid, ask, capturedAt } = snapshot;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'polygon_snapshot_malformed',
      reason: `bid/ask must be finite and > 0 (got bid=${bid} ask=${ask})`,
    };
  }
  if (bid >= ask) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'polygon_snapshot_crossed',
      reason: `crossed/locked book: bid=${bid} >= ask=${ask}`,
    };
  }
  const snapshotAgeMs = asOf.getTime() - capturedAt.getTime();
  if (!Number.isFinite(snapshotAgeMs)
      || snapshotAgeMs > OVERSHOOT_SNAPSHOT_MAX_AGE_MS
      || snapshotAgeMs < OVERSHOOT_SNAPSHOT_MIN_AGE_MS) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'polygon_snapshot_stale',
      reason: `snapshot age ${snapshotAgeMs}ms outside [${OVERSHOOT_SNAPSHOT_MIN_AGE_MS}, ${OVERSHOOT_SNAPSHOT_MAX_AGE_MS}ms]`,
    };
  }

  if (!Number.isFinite(tCloseRef) || tCloseRef <= 0 ||
      !Number.isFinite(preEventRef) || preEventRef <= 0) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'reference_prices_malformed',
      reason: `tCloseRef and preEventRef must be finite and > 0 (got t=${tCloseRef} pre=${preEventRef})`,
    };
  }

  const magnitude = Math.abs(tCloseRef - preEventRef);
  if (magnitude < OVERSHOOT_I5_MIN_MAGNITUDE_DOLLARS) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'degenerate_overshoot_magnitude',
      reason: `|tCloseRef - preEventRef|=${magnitude} below floor ${OVERSHOOT_I5_MIN_MAGNITUDE_DOLLARS}; reversionPct undefined`,
    };
  }

  const preOpenMid = (bid + ask) / 2;

  // Side-directional reversion. LONG: overshoot up (tClose > preEvent),
  // reversion downward. SHORT: overshoot down (tClose < preEvent),
  // reversion upward. Formula normalises to [0,∞); tolerance caps at 1.
  const reversionPct = side === 'LONG'
    ? (tCloseRef - preOpenMid) / (tCloseRef - preEventRef)
    : (preOpenMid - tCloseRef) / (preEventRef - tCloseRef);

  if (!Number.isFinite(reversionPct)) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'reference_prices_malformed',
      reason: `reversionPct non-finite (tClose=${tCloseRef} preEvent=${preEventRef} preOpen=${preOpenMid})`,
    };
  }

  if (reversionPct > toleranceCap) {
    return {
      ok: false, side, reversionPct,
      refusal: 'i5_reversion_exceeded',
      reason: `reversionPct=${reversionPct.toFixed(4)} exceeds tolerance ${toleranceCap} (default-deny)`,
    };
  }

  return {
    ok: true, side,
    reversionPct,
    preOpenMid,
    tCloseRef,
    preEventRef,
    toleranceCap,
    snapshotAgeMs,
  };
}