// FP-069 W3.6.e-i (ACT-464.e-i) — I5 POLYGON PRE-OPEN RE-CHECK (default-deny).
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
//
// STATUS: UNTESTED-OPERATIONAL. The module is fully unit-tested for its
// decision logic (this file's sibling _test.ts), but the OPERATIONAL
// question "does the pre-open Polygon quote at 09:30-09:35 ET
// meaningfully reflect the T-close overshoot magnitude?" has not been
// evidenced against live pre-open microstructure. The default-DENY
// posture is deliberate: on ANY ambiguity the selection MUST NOT enter.
// First-light evidence (W5) will parameterise whether the reversion
// threshold should tighten, loosen, or become side-asymmetric — until
// then, the constants are conservative floors, not tuned values.
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
//     beyond OVERSHOOT_I5_REVERSION_TOLERANCE_PCT of the T-close-to-
//     detection-reference move. Formally:
//         reversionPct = (tCloseRef - preOpenRef) / (tCloseRef - preEventRef)
//     reversionPct > tolerance → refuse (`i5_reversion_exceeded`).
//
//   SHORT selection (overshoot was DOWN at T-close):
//     Symmetric: reject if pre-open has REVERTED upward beyond tolerance
//         reversionPct = (preOpenRef - tCloseRef) / (preEventRef - tCloseRef)
//     reversionPct > tolerance → refuse.
//
// Default tolerance: 0.50 (half the T-close overshoot reversed). Chosen
// as a conservative floor per the UNTESTED-OPERATIONAL posture; do NOT
// tune without W5 evidence.
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

import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';

/** Fraction of the T-close overshoot that may revert pre-open without
 *  refusing the selection. 0.50 = half the overshoot reversed. */
export const OVERSHOOT_I5_REVERSION_TOLERANCE_PCT = 0.50;

/** Snapshot staleness cap for the I5 pre-open quote read. Matches the
 *  entry/exit constructors (single ratified value across intents). */
export const OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS = 15_000;

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
 *  Scope discipline: Option B is I5-only per ACT-485. The
 *  entry-/exit-price constructors keep [0, 15000] until a separate
 *  amendment ratifies the same widening there. */
export const OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS = -1_000;

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
  const toleranceCap = input.toleranceCap ?? OVERSHOOT_I5_REVERSION_TOLERANCE_PCT;

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
      || snapshotAgeMs > OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS
      || snapshotAgeMs < OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS) {
    return {
      ok: false, side, reversionPct: null,
      refusal: 'polygon_snapshot_stale',
      reason: `snapshot age ${snapshotAgeMs}ms outside [${OVERSHOOT_I5_SNAPSHOT_MIN_AGE_MS}, ${OVERSHOOT_I5_SNAPSHOT_MAX_AGE_MS}ms]`,
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