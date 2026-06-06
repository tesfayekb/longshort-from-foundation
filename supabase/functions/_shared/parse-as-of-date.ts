/**
 * parseAsOfDate — strict YYYY-MM-DD parser for the manual-trigger
 * edge function. Extracted from `index.ts` into its own file so the
 * Deno test harness can import it without triggering the top-level
 * `Deno.serve(...)` call in `index.ts` (which would require --allow-net
 * and bind a port during unit tests).
 *
 * Returns the Date (UTC midnight) on success, or `null` on any malformed
 * input (non-string, wrong shape, invalid calendar date). Stricter than
 * `new Date(s)` which silently coerces many invalid inputs.
 */
export function parseAsOfDate(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [, ys, ms, ds] = m;
  const y = Number(ys), mo = Number(ms), d = Number(ds);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}