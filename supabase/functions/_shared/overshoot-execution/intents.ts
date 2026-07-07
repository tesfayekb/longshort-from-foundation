// FP-069 W3.6.a (ACT-463) — overshoot execution intent taxonomy.
//
// PURE MODULE. Zero imports beyond types. No DB, no network, no wall-clock.
//
// Operator-ratified intent set (I2, with binding correction):
//
//   'entry'       — first-open marketable-limit submitted at T+1 pre-open,
//                   after Polygon stabilization re-check (I5, default-deny).
//                   Sizing: equal-notional per capacity slot (I3, Option A).
//
//   'exit_time'   — time-stop close at T+5 sessions UNIFORMLY (I2 corrected
//                   from per-band window_days). Rationale (operator-ratified
//                   P-B#3): per-day-ROI arithmetic favors uniform T+5
//                   (0.68%/day) vs per-band holding (0.40%/day). The
//                   detection trigger window W is a detection dimension,
//                   NOT a holding-period dimension — conflating the two
//                   was drift from ratified priors and is corrected here.
//
//   'exit_manual' — operator-initiated close before the T+5 time-stop.
//                   Second-confirm token gate applies (I6, scoped to
//                   order-submitting engines only — not detection).
//
// Every intent has ONE canonical submission path. No implicit fallbacks. A
// caller that cannot map its situation to one of these intents MUST surface a
// typed refusal upstream — never invent a fourth intent, never reuse an
// existing intent for an out-of-contract purpose.

export const OVERSHOOT_INTENTS = ['entry', 'exit_time', 'exit_manual'] as const;
export type OvershootIntent = typeof OVERSHOOT_INTENTS[number];

export function isOvershootIntent(value: unknown): value is OvershootIntent {
  return typeof value === 'string' && (OVERSHOOT_INTENTS as ReadonlyArray<string>).includes(value);
}

// ── R-1 PER-SIDE HOLDING CONSTANTS (FP-069 W3.8 T1, ACT-478) ────────────────
//
// PROVENANCE — ratified 2026-07-05 (ACT-475 §V.A1, tranche list), grounded on:
//   ACT-471 (Part II, r10 reconstruction). LONG days 6-10 mean per-day return
//     ≈ 42.7 bps/day, essentially indistinguishable from days 2-5 (42.9 bps).
//     Extending LONG holding from 5 → 10 captures ~2× the per-name PnL band
//     without eroding per-day-ROI arithmetic. LONG H=10 ratified.
//   ACT-472 (Part III, SHORT_T1_R10_NEGATIVE finding). SHORT r10 turns NEGATIVE
//     across every regime bucket at H > 5. SHORT H ≤ 5 HARD; extending SHORT
//     beyond 5 destroys edge. SHORT H=5 ratified.
//
// Per-side constants (this module owns the values; engine wiring lands at T3):
export const OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG = 10;
export const OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT = 5;

// DEPRECATED-ALIASED uniform constant — DO NOT REMOVE this turn (T1).
// Current consumers (session-age.ts, session-age_test.ts, overshoot-exit-run
// index.ts:104,271 + index_test.ts sentinels, intents_test.ts) still read the
// uniform value; per T1 scope "handlers keep passing their own values until
// T3". Removing this alias would break FIVE call-sites and violate the
// "byte-untouched on all engine files" gate. The value stays at 5 — which
// happens to equal SHORT — so behavior at engine layer is unchanged this
// tranche (SHORT correctly capped; LONG remains at 5 until T3 rewires
// session-age + exit-run to consume the per-side constants).
//
// T3 REMOVAL PLAN: session-age.computeSessionAge accepts `side: OvershootSide`
// and reads the per-side constant via a helper; the exit engine's void-drift
// canary migrates to reference both per-side symbols; this alias is then
// deleted with the T3 landing.
export const OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS = 5;

/**
 * Per-side holding-horizon accessor. NOT wired into the exit engine this
 * tranche (T1) — provided so T3 has a single seam to point session-age at.
 * Pure; no wall-clock; no DB.
 */
export function holdingSessionsForSide(side: 'LONG' | 'SHORT'): number {
  return side === 'LONG'
    ? OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG
    : OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT;
}

// Direction of order flow implied by (intent, side). Consumed by the CID
// builder callers (W3.6.c/d/e) and by the broker submitter (W3.6.b) to map
// intent to Alpaca side. Long-entry BUYs, long-exit SELLs; short-entry SELLs
// (short), short-exit BUYs (to-close).
export type OrderFlow = 'buy' | 'sell' | 'sell_short' | 'buy_to_close';

export function flowForIntent(
  intent: OvershootIntent,
  side: 'LONG' | 'SHORT',
): OrderFlow {
  if (intent === 'entry') return side === 'LONG' ? 'buy' : 'sell_short';
  // exit_time and exit_manual are functionally identical at flow layer;
  // separation lives in the trigger source + audit intent field.
  return side === 'LONG' ? 'sell' : 'buy_to_close';
}