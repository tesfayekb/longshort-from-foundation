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

// Uniform T+5 holding period (P-B#3 ratified). Named constant so the exit
// engine (W3.6.d) reads its holding basis from this module, never from a
// per-band field. Sessions = trading days, not calendar days.
export const OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS = 5;

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