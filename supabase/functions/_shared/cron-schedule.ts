/**
 * Minimal cron-schedule parser for the overshoot alerts dispatcher watchdog
 * (INC-95 fix). Deno-only, dependency-free — mirrors the semantics of the
 * front-end helper `src/features/longshort/utils/cron-staleness.ts` but is
 * self-contained (edge runtime has no `cron-parser` npm dep).
 *
 * Grammar supported per field (5-field: minute hour dom month dow, UTC):
 *   *          — every value in range
 *   N          — literal integer
 *   N-M        — inclusive range
 *   N-M/S      — range with step
 *   * /S       — every value stepped by S (written without the space)
 *   N,M,K      — enumeration (each part supports the above)
 *
 * Vixie-cron DOM/DOW OR-vs-AND rule: when BOTH dom and dow are restricted
 * (i.e. neither is `*`) the day matches if EITHER expression matches;
 * otherwise both fields AND together (either being `*` is a no-op).
 *
 * `lastExpectedFireAt(cron, at)` returns the most recent minute strictly
 * at-or-before `at` that the schedule fires, or `null` if the expression
 * is unparseable or no fire slot exists in the past 45 days. 45 days
 * bounds the search for twice-monthly SI (`0 21 1,15 * *`) — the widest
 * cadence we operate — with headroom.
 */

export interface CronMasks {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  hasDom: boolean;
  hasDow: boolean;
}

function expandField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    let range = part;
    let step = 1;
    if (part.includes('/')) {
      const [r, s] = part.split('/');
      range = r;
      step = parseInt(s, 10);
      if (!Number.isFinite(step) || step <= 0) throw new Error('bad_step');
    }
    let lo = min;
    let hi = max;
    if (range === '*') {
      // full range
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map((x) => parseInt(x, 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('bad_range');
      lo = a;
      hi = b;
    } else {
      const v = parseInt(range, 10);
      if (!Number.isFinite(v)) throw new Error('bad_literal');
      lo = v;
      hi = v;
    }
    if (lo < min || hi > max || lo > hi) throw new Error('out_of_bounds');
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  if (out.size === 0) throw new Error('empty_field');
  return out;
}

export function parseCron(expr: string): CronMasks | null {
  if (typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return {
      minute: expandField(parts[0], 0, 59),
      hour: expandField(parts[1], 0, 23),
      dom: expandField(parts[2], 1, 31),
      month: expandField(parts[3], 1, 12),
      dow: expandField(parts[4], 0, 6),
      hasDom: parts[2] !== '*',
      hasDow: parts[4] !== '*',
    };
  } catch {
    return null;
  }
}

function matches(m: CronMasks, d: Date): boolean {
  if (!m.month.has(d.getUTCMonth() + 1)) return false;
  if (!m.hour.has(d.getUTCHours())) return false;
  if (!m.minute.has(d.getUTCMinutes())) return false;
  const domOk = m.dom.has(d.getUTCDate());
  const dowOk = m.dow.has(d.getUTCDay()); // Sunday = 0
  if (m.hasDom && m.hasDow) return domOk || dowOk;
  return domOk && dowOk;
}

const SEARCH_WINDOW_DAYS = 45;

/**
 * Most recent minute-slot at-or-before `at` that `expr` fires (UTC).
 * Returns `null` when unparseable or no slot found in the past
 * SEARCH_WINDOW_DAYS.
 */
export function lastExpectedFireAt(expr: string, at: Date): Date | null {
  const m = parseCron(expr);
  if (!m) return null;
  // Truncate `at` to whole minute.
  const start = Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate(),
    at.getUTCHours(),
    at.getUTCMinutes(),
    0,
    0,
  );
  const limit = start - SEARCH_WINDOW_DAYS * 24 * 3600 * 1000;
  for (let t = start; t >= limit; t -= 60_000) {
    const d = new Date(t);
    if (matches(m, d)) return d;
  }
  return null;
}

/**
 * Convenience wrapper: is a scheduled job overdue?
 * Returns { overdue, lastExpected } where `overdue` is true iff
 *   lastExpected != null AND lastExpected > lastActual + tolerance AND
 *   now > lastExpected + tolerance AND lastExpected >= floorMs.
 * Caller passes `lastActualMs = 0` when the job has never fired; the
 * comparison then trivially reports overdue against the most recent slot.
 *
 * INC-95 refinement (INC-107 pull-forward, 2026-07-15): `floorMs` (optional)
 * is the LATER of the cron.job install time and the registry-arm time
 * (`job_registry.updated_at` on the enabled=true transition). Any expected
 * slot that predates `floorMs` is operationally void — pgcron cannot fire
 * slots that predate the cron row, and the registry-arm floor eliminates
 * pre-arm phantom slots (the sibling class defect that produced the
 * fill_sweep false-page on 2026-07-09 and would produce the exit.run
 * false-page on today's 19:50Z slot without this floor).
 */
export function evaluateOverdue(
  expr: string,
  now: Date,
  lastActualMs: number,
  toleranceMs: number,
  floorMs: number = 0,
): { overdue: boolean; lastExpected: Date | null } {
  const lastExpected = lastExpectedFireAt(expr, now);
  if (!lastExpected) return { overdue: false, lastExpected: null };
  const expMs = lastExpected.getTime();
  const overdue =
    now.getTime() > expMs + toleranceMs &&
    expMs > lastActualMs + toleranceMs &&
    expMs >= floorMs;
  return { overdue, lastExpected };
}