// ACT-515 Kernel — Module 2: Clock + NY session helpers.
//
// SCOPE: injected clocks (FixedClock, ReplayClock) and America/New_York
// session-boundary helpers computed from pure integer arithmetic. Zero
// wall-clock reads (no Date.now / no `new Date(` / no Math.random) —
// enforced by a lint-as-test in `clock_test.ts` (PIN (d)).
//
// FOUR PINS (per ruling 2026-07-25):
//
//   (a) IMPLEMENTATIONS — FixedClock(instantMs) + ReplayClock(asOfSequence)
//       ONLY. Constructors validate: reject NaN, non-finite, non-integer,
//       and epoch-0 (silent-sentinel trap). ReplayClock exhausts explicitly
//       (throws on overrun) — never fabricates.
//
//   (b) SESSION HELPERS keyed America/New_York:
//         · sessionDateOf(instantMs)           → 'YYYY-MM-DD' (NY local)
//         · rthOpen(sessionDate)               → UTC ms of 09:30 ET that day
//         · rthClose(sessionDate)              → UTC ms of 16:00 ET that day
//         · isBeforeOpen / isAfterClose        → boolean
//       Holiday knowledge is INJECTED (`isMarketHoliday(date, holidays)`);
//       kernel NEVER fabricates a holiday calendar. If the caller lacks a
//       calendar it passes `null` and receives typed-absence semantics
//       (helper returns `null` — consumer decides how to fold).
//
//   (c) DST — US federal rule computed from integer arithmetic:
//         · EDT starts on the 2nd Sunday of March
//         · EST resumes on the 1st Sunday of November
//       No timezone-DB read, no `Intl.DateTimeFormat`, no `new Date(...)`.
//       Validated by `clock_test.ts` on the live watch-doc boundaries
//       2026-03-08 (spring-fwd) and 2026-11-01 (fall-back, the F1 date).
//
//   (d) ANTI-PHANTOM LINT — companion test asserts this file contains no
//       `Date.now` / `new Date(` / `Math.random` tokens. Clock module is
//       precisely where wall-clock temptation lives; the rule is executable.

import type { Clock } from './types.ts';

// -----------------------------------------------------------------------------
// Pure integer date arithmetic (Howard Hinnant civil_from_days / days_from_civil)
// Reference: https://howardhinnant.github.io/date_algorithms.html
// Valid for all proleptic Gregorian dates.
// -----------------------------------------------------------------------------

/** Days since 1970-01-01 (UTC) for a proleptic Gregorian civil date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yAdj = m <= 2 ? y - 1 : y;
  const era = Math.floor(yAdj / 400);
  const yoe = yAdj - era * 400;                       // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Inverse of daysFromCivil. */
export function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zAdj = z + 719468;
  const era = Math.floor(zAdj / 146097);
  const doe = zAdj - era * 146097;                    // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);         // [0, 11]  Mar=0..Feb=11
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9);                  // [1, 12]
  return { y: m <= 2 ? y + 1 : y, m, d };
}

/** Day of week for a day-serial. 0=Sunday..6=Saturday. */
export function dayOfWeek(z: number): number {
  const r = (z + 4) % 7;                              // 1970-01-01 was Thursday
  return r < 0 ? r + 7 : r;
}

// -----------------------------------------------------------------------------
// DST — US federal rule from integer arithmetic
// -----------------------------------------------------------------------------

/** Day-serial of the n-th Sunday of a given month/year. */
function nthSundayOf(year: number, month: number, n: number): number {
  const z1 = daysFromCivil(year, month, 1);
  const dow1 = dayOfWeek(z1);
  const daysToFirstSunday = (7 - dow1) % 7;
  return z1 + daysToFirstSunday + 7 * (n - 1);
}

/** True if the given NY calendar date is in EDT (UTC-4); false → EST (UTC-5).
 *  Rule: EDT = [2nd Sunday March, 1st Sunday November). */
export function isEdt(sessionDate: SessionDate): boolean {
  const { y, m, d } = parseSessionDate(sessionDate);
  const z = daysFromCivil(y, m, d);
  const zStart = nthSundayOf(y, 3, 2);
  const zEnd = nthSundayOf(y, 11, 1);
  return z >= zStart && z < zEnd;
}

/** UTC offset in hours for a NY calendar date. -4 (EDT) or -5 (EST). */
export function nyOffsetHours(sessionDate: SessionDate): -4 | -5 {
  return isEdt(sessionDate) ? -4 : -5;
}

// -----------------------------------------------------------------------------
// SessionDate helpers
// -----------------------------------------------------------------------------

/** ISO calendar date in NY-local time: 'YYYY-MM-DD'. Branded via nominal
 *  string alias to keep the vocabulary explicit at call sites. */
export type SessionDate = string;

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** Format a civil (y,m,d) as 'YYYY-MM-DD'. */
export function formatSessionDate(y: number, m: number, d: number): SessionDate {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new Error(`formatSessionDate: non-integer (${y}-${m}-${d})`);
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`formatSessionDate: out of range (${y}-${m}-${d})`);
  }
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Parse 'YYYY-MM-DD' into (y,m,d) integers. */
export function parseSessionDate(s: SessionDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) throw new Error(`parseSessionDate: not YYYY-MM-DD (${s})`);
  return { y: +match[1], m: +match[2], d: +match[3] };
}

/** NY calendar date containing the given UTC instant.
 *  Two-pass: guess with EST (-5), then re-classify under the true offset for
 *  that date. Idempotent within two iterations because DST transitions occur
 *  at 02:00 local and the offset only shifts by 1h. */
export function sessionDateOf(instantMs: number): SessionDate {
  if (!Number.isFinite(instantMs)) {
    throw new Error(`sessionDateOf: non-finite (${instantMs})`);
  }
  const guessEst = instantMs + -5 * MS_PER_HOUR;
  const zGuess = Math.floor(guessEst / MS_PER_DAY);
  const g = civilFromDays(zGuess);
  const dateGuess = formatSessionDate(g.y, g.m, g.d);
  const trueOffset = nyOffsetHours(dateGuess);
  if (trueOffset === -5) return dateGuess;
  const local = instantMs + trueOffset * MS_PER_HOUR;
  const z = Math.floor(local / MS_PER_DAY);
  const c = civilFromDays(z);
  return formatSessionDate(c.y, c.m, c.d);
}

/** UTC epoch ms at 09:30 ET on the given session date. */
export function rthOpen(sessionDate: SessionDate): number {
  const { y, m, d } = parseSessionDate(sessionDate);
  const z = daysFromCivil(y, m, d);
  const off = nyOffsetHours(sessionDate);
  // 09:30 local = (9.5 - off) hours UTC on the same civil day
  return z * MS_PER_DAY + (9 * 60 + 30) * 60_000 + -off * MS_PER_HOUR;
}

/** UTC epoch ms at 16:00 ET on the given session date. */
export function rthClose(sessionDate: SessionDate): number {
  const { y, m, d } = parseSessionDate(sessionDate);
  const z = daysFromCivil(y, m, d);
  const off = nyOffsetHours(sessionDate);
  return z * MS_PER_DAY + 16 * 60 * 60_000 + -off * MS_PER_HOUR;
}

export function isBeforeOpen(instantMs: number, sessionDate: SessionDate): boolean {
  return instantMs < rthOpen(sessionDate);
}

export function isAfterClose(instantMs: number, sessionDate: SessionDate): boolean {
  return instantMs >= rthClose(sessionDate);
}

/** Holiday check: caller injects the calendar. If `holidays` is null the
 *  helper returns null (typed-absence) — the kernel refuses to fabricate. */
export function isMarketHoliday(
  sessionDate: SessionDate,
  holidays: ReadonlyArray<SessionDate> | null,
): boolean | null {
  if (holidays === null) return null;
  return holidays.includes(sessionDate);
}

// -----------------------------------------------------------------------------
// Injected clocks — FixedClock + ReplayClock only (PIN (a))
// -----------------------------------------------------------------------------

function validateInstant(name: string, ms: number): void {
  if (!Number.isFinite(ms)) throw new Error(`${name}: non-finite instant (${ms})`);
  if (!Number.isInteger(ms)) throw new Error(`${name}: non-integer instant (${ms})`);
  if (ms <= 0) throw new Error(`${name}: non-positive / epoch-0 instant (${ms})`);
}

/** Frozen clock — returns the same instant forever. */
export class FixedClock implements Clock {
  private readonly instantMs: number;
  constructor(instantMs: number) {
    validateInstant('FixedClock', instantMs);
    this.instantMs = instantMs;
  }
  nowMs(): number {
    return this.instantMs;
  }
}

/** Replay clock — advances through an as-of sequence one step per nowMs().
 *  Throws on overrun; refuses empty sequence; refuses non-monotone input.
 *  This is the §2 axiom-4 injected-as-of discipline. */
export class ReplayClock implements Clock {
  private readonly seq: ReadonlyArray<number>;
  private idx = 0;
  constructor(asOfSequence: ReadonlyArray<number>) {
    if (asOfSequence.length === 0) {
      throw new Error('ReplayClock: empty sequence');
    }
    for (let i = 0; i < asOfSequence.length; i++) {
      validateInstant(`ReplayClock[${i}]`, asOfSequence[i]);
      if (i > 0 && asOfSequence[i] < asOfSequence[i - 1]) {
        throw new Error(
          `ReplayClock: non-monotone at ${i} (${asOfSequence[i]} < ${asOfSequence[i - 1]})`,
        );
      }
    }
    this.seq = asOfSequence;
  }
  nowMs(): number {
    if (this.idx >= this.seq.length) {
      throw new Error(`ReplayClock: exhausted after ${this.seq.length} steps`);
    }
    return this.seq[this.idx++];
  }
  /** Steps remaining without advancing. Diagnostic-only. */
  remaining(): number {
    return this.seq.length - this.idx;
  }
}