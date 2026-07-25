// L-01 charter (2026-07-25) — LIMIT-LADDER TIGHTENING A/B ARM.
//
// PURE MODULE. Zero DB, zero network, zero wall-clock. Deterministic
// per-admit arm assignment for the L-01 90-day paper A/B study
// (charter: docs/06-tracking/charters/L-01-limit-ladder-tightening.md).
//
// SEMANTICS:
//   Arm A (control) — current ratified slippage cap
//                     OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS (=50 bps),
//                     re-exposed here as OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS
//                     for grep-locality.
//   Arm B (tighter) — 40 bps (10 bps closer to quote-mid), per charter §3.
//
// PICK: deterministic FNV-1a over `${runId}:${ticker}:${slot}` mod 2.
//   - Reproducible under replay: same run_id + ticker + slot → same arm.
//   - Session-matched: multiple admits inside the same run randomize
//     independently, so both arms typically appear per session (the
//     pairing surface for L-01 G-3 paired-t).
//   - No wall-clock, no Math.random — audit rows are re-computable
//     off the audit row's (run_id, ticker, slot) triple alone.
//
// This module is ONLY consumed by `overshoot-entry-run`; the audit +
// lot rows carry the arm forward for offline analysis (charter §6).

export const OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS = 50 as const;
export const OVERSHOOT_LIMIT_ARM_B_SLIPPAGE_BPS = 40 as const;

export type LimitArm = 'A' | 'B';

export interface LimitArmPick {
  arm: LimitArm;
  slippageBps: number;
}

/** FNV-1a 32-bit over a utf-8 code-unit stream. Pure; deterministic. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    // Multiply by FNV prime 16777619 in 32-bit unsigned.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic per-admit arm assignment. Inputs must be non-empty; slot
 * must be a non-negative integer. Never returns a silent default — any
 * bad input throws so the entry-run cannot phantom-fabricate an arm.
 */
export function pickLimitArm(
  runId: string,
  ticker: string,
  slot: number,
): LimitArmPick {
  if (typeof runId !== 'string' || runId.length === 0) {
    throw new Error(`pickLimitArm: runId must be a non-empty string (got ${JSON.stringify(runId)})`);
  }
  if (typeof ticker !== 'string' || ticker.length === 0) {
    throw new Error(`pickLimitArm: ticker must be a non-empty string (got ${JSON.stringify(ticker)})`);
  }
  if (!Number.isInteger(slot) || slot < 0) {
    throw new Error(`pickLimitArm: slot must be a non-negative integer (got ${slot})`);
  }
  const bit = fnv1a32(`${runId}:${ticker}:${slot}`) & 1;
  return bit === 0
    ? { arm: 'A', slippageBps: OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS }
    : { arm: 'B', slippageBps: OVERSHOOT_LIMIT_ARM_B_SLIPPAGE_BPS };
}

/** Companion resolver: arm label → slippage_bps. Kept explicit so downstream
 *  analysis / replay can re-derive slippage from a stored arm label alone. */
export function slippageBpsForArm(arm: LimitArm): number {
  return arm === 'A' ? OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS : OVERSHOOT_LIMIT_ARM_B_SLIPPAGE_BPS;
}