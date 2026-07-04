/**
 * phase-coverage — pure extraction of the checkPhaseCoverage helper
 * previously defined in overshoot-study-run/index.ts.
 *
 * FP-069 W3.2.a fold-in (GATE-11 FIX). Before this extraction, the
 * unit tests in `index_test.ts:111` / `:137` used `await import('./index.ts')`
 * to reach the helper. That import triggered the runner module's top-level
 * `Deno.serve(...)` binding, which — under Gate 11's full `deno test`
 * execution shape at `.github/workflows/strong-evidence.yml:190` — leaks
 * an unclosed listener at the end of the test run (op-sanitizer failure).
 *
 * The revision moves ONLY the helper (and its private `addDaysIso` date-math
 * dependency) to this dedicated module so the tests can import the pure
 * function without ever loading the runner. index.ts continues to re-export
 * checkPhaseCoverage from here so any downstream caller that used the
 * module surface remains source-compatible.
 *
 * Sanitizer suppression is FORBIDDEN by the sub-turn charter — this
 * structural extraction is the sanctioned fix. Zero behavior delta.
 */

/**
 * Coverage check: verify sorted phase slices union-cover the full window
 * [W_min, W_max] with no gaps (overlap allowed). Dates as ISO YYYY-MM-DD.
 * Returns { covered, reason? } for observable diagnostics.
 */
export function checkPhaseCoverage(
  phases: readonly { min: string; max: string }[],
  fullMin: string,
  fullMax: string,
): { covered: boolean; reason?: string } {
  if (phases.length === 0) return { covered: false, reason: 'no_phases_completed' };
  const sorted = [...phases].sort((a, b) => (a.min < b.min ? -1 : 1));
  if (sorted[0].min > fullMin) {
    return { covered: false, reason: `gap_at_start:first_min=${sorted[0].min}>full_min=${fullMin}` };
  }
  let cursor = sorted[0].max;
  for (let i = 1; i < sorted.length; i++) {
    // Allow contiguous OR overlap: sorted[i].min <= cursor + 1 day
    const gapCutoff = addDaysIso(cursor, 1);
    if (sorted[i].min > gapCutoff) {
      return { covered: false, reason: `gap:${cursor}->${sorted[i].min}` };
    }
    if (sorted[i].max > cursor) cursor = sorted[i].max;
  }
  if (cursor < fullMax) {
    return { covered: false, reason: `gap_at_end:last_max=${cursor}<full_max=${fullMax}` };
  }
  return { covered: true };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}