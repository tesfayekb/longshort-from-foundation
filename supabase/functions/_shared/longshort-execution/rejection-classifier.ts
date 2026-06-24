/**
 * rejection-classifier — FP-056 E3 (DEC-068 clause b; ACT-311).
 *
 * PURE reason→tier lookup per §8.6.1 lines 116-125 rejection-class table.
 * E3 TAGS the tier; §8.9 cache propagation (NO-PAUSE-class writes per
 * DEC-068 clause e; PAUSE-class deferred to DW-144) is E4's surface —
 * this module does NOT write caches, does NOT call notifiers.
 *
 * Tier mapping (operator-affirmed at ACT-311 STEP-A reconciliation):
 *   TIER 2 — auto-skip (book operates one fewer name; re-eligible next
 *            tick via E1's fresh selection):
 *              halted                        (per-symbol transient)
 *              htb / hard_to_borrow          (per-symbol transient)
 *              insufficient_buying_power     (v1 treats all BP as transient;
 *                                             persistent-BP detection deferred
 *                                             to DW-144 — the 3-in-1h rolling
 *                                             window from §8.6.1 L121)
 *   TIER 3 — operator pause (kernel-invariant / explicit-block class):
 *              ssr_violation                 (§8.9 — invariant: §7 SSR
 *                                             pre-flight should have caught;
 *                                             firing = system_bug surface)
 *              pdt_block                     (account-level block)
 *              <unknown / unrecognized>      (per spec L125 default)
 *
 * MATCHING DISCIPLINE: case-insensitive substring contains, with the
 * tier-2 allow-list checked first. A null/empty reason is tier-3
 * (treat-as-unknown — refuse to silently downgrade unknown rejections;
 * DEC-034 (2) anti-phantom-defaults).
 */

import type { TradeType } from './state-machine.ts';

export type RejectionTier = 'tier2_skip' | 'tier3_pause';

/** Token → tier-2. Lowercase substring matched against reason. */
const TIER2_TOKENS: readonly string[] = [
  'halted',
  'halt',
  'htb',
  'hard_to_borrow',
  'hard-to-borrow',
  'insufficient_buying_power',
  'insufficient buying power',
] as const;

/**
 * Token → tier-3 (explicit invariant / pause class). Checked AFTER tier-2
 * tokens because the spec's "default → tier3" already handles unknowns;
 * these are surfaced as explicit pause-routing for diagnostic clarity in
 * the emitted event payload.
 */
const TIER3_TOKENS: readonly string[] = [
  'ssr_violation',
  'ssr',
  'short_sale_restricted',
  'pdt_block',
  'pattern_day_trader',
  'pattern day',
] as const;

/** Pure lookup. `_trade_type` is reserved for future per-trade-type
 *  policy (e.g., short-stop-specific routing); v1 does not branch on it. */
export function classifyRejection(
  reason: string | null,
  _trade_type: TradeType,
): RejectionTier {
  if (reason === null) return 'tier3_pause';
  const r = reason.toLowerCase();
  if (r.length === 0) return 'tier3_pause';

  for (const tok of TIER2_TOKENS) {
    if (r.includes(tok)) return 'tier2_skip';
  }
  for (const tok of TIER3_TOKENS) {
    if (r.includes(tok)) return 'tier3_pause';
  }
  // Unknown → tier-3 per spec L125 default (refuse silent downgrade).
  return 'tier3_pause';
}

/** Diagnostic helper — exported for tests + future event payloads. */
export const REJECTION_TOKEN_TABLE = {
  tier2: TIER2_TOKENS,
  tier3: TIER3_TOKENS,
} as const;