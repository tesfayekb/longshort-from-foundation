// FP-069 W3.6.d-i (ACT-463.d-i) — SESSION-AGE / T+5 exit-fire decider.
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
// Consumed by the W3.6.d-ii exit-engine edge function: for each open lot,
// this module answers ONE question — should the T+5 time-stop fire on
// this cron tick? — from three injected inputs:
//
//   1. entryDate            (YYYY-MM-DD, session date of the entry fill)
//   2. spyPriorSessionDates (SPY overshoot_daily_bars trade_date values,
//                            strictly > entryDate, in ascending order,
//                            representing SETTLED sessions only)
//   3. inProgressSession    (typed market-clock snapshot — SEE PIN-1/PIN-2)
//
// ---- PIN-1 (operator ratification, ACT-463.d ruling 1) --------------------
// The exit cron fires INTRADAY at 19:50 UTC. Today's SPY daily bar is
// appended by the detection run at ~22:00 UTC (post-close). If we counted
// only settled SPY bars > entryDate, a Monday entry would have seen four
// settled bars by the Friday cron (Tue/Wed/Thu/Fri close bars are not yet
// written at 19:50 Fri) — so count()=3 or 4, never 5 — and the exit would
// fire on the SIXTH session (following Monday cron), one session LATE.
//
// Resolution: the cron reads the market-clock (Alpaca /v2/clock — broker/
// market STATE, permitted under the live-price directive because it is
// NOT market-data — cite that distinction at the call site) and passes an
// explicit `inProgressSession` snapshot into this module. The count is
// then `settledSessions + (inProgressSession contributes 1 iff its date >
// entryDate AND market is open AND session date not already in the
// settled set)`. No silent hardcoded ">= 4" fallback; the in-progress
// increment is EVIDENCED by the injected clock snapshot or absent.
//
// The Monday-entry-fires-Friday behavior is pinned by a fixture test in
// session-age_test.ts (do not weaken).
//
// ---- PIN-2 (operator ratification, ACT-463.d ruling 5) --------------------
// pg_cron is UTC-fixed; 19:50 UTC = 15:50 ET summer (correct: 10m to
// close) but 14:50 ET winter (~70m early). v1 accepts the drift
// DOCUMENTED. This module exposes `minutesToClose` and `isMarketOpen` on
// the injected snapshot so the exit-engine can (a) record
// minutes_to_close on each exit event for W5 measurement and (b) refuse
// the run with `market_closed` on holidays / weekends. Dynamic
// scheduling remains an evidence-gated follow-up.
//
// The MECHANISM is injected here — the SEAM is this module — but no
// wall-clock read happens inside this file (kernel purity, standing
// anti-phantom rule).

import { OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS } from './intents.ts';

export { OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS };

/**
 * Injected market-clock snapshot (PIN-2 seam). Source at the edge:
 * Alpaca /v2/clock. Populated as `null` when unavailable — a null
 * snapshot forces `market_clock_unavailable` refusal (never a silent
 * assumption that markets are open).
 */
export interface OvershootMarketClockSnapshot {
  /** YYYY-MM-DD in America/New_York — the session the market IS in, or
   *  the next session to open when the market is currently closed. */
  sessionDate: string;
  /** True iff US equities regular session is currently open. */
  isMarketOpen: boolean;
  /** Minutes until the current or next regular-session close.
   *  Recorded on exit events for W5 slippage/timing measurement (PIN-2). */
  minutesToClose: number;
  /** True iff today (in ET) is a market holiday. Distinct from weekend. */
  isHoliday: boolean;
}

export type SessionAgeRefusalCode =
  | 'market_clock_unavailable'
  | 'market_closed'
  | 'entry_date_in_future'
  | 'malformed_session_date';

export interface SessionAgeRefusal {
  ok: false;
  refusal: SessionAgeRefusalCode;
  reason: string;
}

export interface SessionAgeOk {
  ok: true;
  /** Number of trading sessions strictly AFTER entryDate, inclusive of
   *  the in-progress session when it counts (see PIN-1). */
  sessionsSinceEntry: number;
  /** True iff sessionsSinceEntry >= OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS. */
  shouldFireTimeExit: boolean;
  /** Provenance echo — did the in-progress session contribute +1? */
  inProgressCounted: boolean;
  /** Recorded verbatim on the exit event for PIN-2 measurement. */
  minutesToClose: number;
}

export type SessionAgeResult = SessionAgeOk | SessionAgeRefusal;

export interface ComputeSessionAgeInput {
  /** YYYY-MM-DD; the session date of the entry fill. */
  entryDate: string;
  /**
   * SPY overshoot_daily_bars trade_date values with trade_date > entryDate,
   * ascending, DEDUPLICATED. Represents SETTLED sessions only (today's
   * bar is NOT here at 19:50 UTC cron time — see PIN-1). Caller supplies
   * the query; this module does not touch the DB.
   */
  spyPriorSessionDates: readonly string[];
  /**
   * Live market-clock snapshot at cron tick. Null → typed refusal
   * (`market_clock_unavailable`) — never silently proceed.
   */
  clock: OvershootMarketClockSnapshot | null;
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function computeSessionAge(input: ComputeSessionAgeInput): SessionAgeResult {
  const { entryDate, spyPriorSessionDates, clock } = input;

  if (!YYYY_MM_DD.test(entryDate)) {
    return { ok: false, refusal: 'malformed_session_date',
      reason: `entryDate must be YYYY-MM-DD (got ${JSON.stringify(entryDate)})` };
  }
  for (const d of spyPriorSessionDates) {
    if (!YYYY_MM_DD.test(d)) {
      return { ok: false, refusal: 'malformed_session_date',
        reason: `spyPriorSessionDates entry must be YYYY-MM-DD (got ${JSON.stringify(d)})` };
    }
  }

  if (clock === null) {
    return { ok: false, refusal: 'market_clock_unavailable',
      reason: 'market-clock snapshot required (PIN-2 seam) — refusing rather than assuming open' };
  }
  if (!YYYY_MM_DD.test(clock.sessionDate)) {
    return { ok: false, refusal: 'malformed_session_date',
      reason: `clock.sessionDate must be YYYY-MM-DD (got ${JSON.stringify(clock.sessionDate)})` };
  }

  // Holiday / closed → whole run refuses. Cron logs the refusal; no
  // exits fire on days the exchange is closed.
  if (clock.isHoliday || !clock.isMarketOpen) {
    return { ok: false, refusal: 'market_closed',
      reason: `market not in regular session (isMarketOpen=${clock.isMarketOpen}, isHoliday=${clock.isHoliday})` };
  }

  if (clock.sessionDate < entryDate) {
    return { ok: false, refusal: 'entry_date_in_future',
      reason: `entryDate ${entryDate} is after clock.sessionDate ${clock.sessionDate}` };
  }

  // Settled sessions strictly > entryDate, deduped defensively.
  const settled = new Set<string>();
  for (const d of spyPriorSessionDates) {
    if (d > entryDate) settled.add(d);
  }

  // PIN-1: in-progress session contributes +1 iff its date is strictly
  // after entryDate AND not already present in the settled set.
  const inProgressCounted =
    clock.sessionDate > entryDate && !settled.has(clock.sessionDate);

  const sessionsSinceEntry = settled.size + (inProgressCounted ? 1 : 0);
  const shouldFireTimeExit =
    sessionsSinceEntry >= OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS;

  return {
    ok: true,
    sessionsSinceEntry,
    shouldFireTimeExit,
    inProgressCounted,
    minutesToClose: clock.minutesToClose,
  };
}