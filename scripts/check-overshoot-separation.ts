/**
 * check-overshoot-separation.ts — FP-069 W1a CI membrane guard.
 *
 * Enforces the FP-069 Separation Contract at the source tree:
 *
 *  (1) Overshoot code MUST NOT import anything from the longshort tree,
 *      except for the four A3-verified leaf utilities on the allowlist.
 *  (2) Longshort code MUST NOT import anything from the overshoot tree
 *      (any path segment matching /overshoot/).
 *
 * "Overshoot code" = any file under:
 *   - supabase/functions/_shared/overshoot/  (fetcher tree)
 *   - supabase/functions/overshoot-<name>    (function directories)
 *   - src tree — any file whose path contains an "overshoot" segment
 *
 * "Longshort tree" = any import specifier whose path contains 'longshort'.
 *
 * Exit codes:
 *   0 = clean
 *   1 = violation(s) found; each printed with file:line and reason.
 *
 * Invoked from .github/workflows/overshoot-guards.yml on every PR.
 */

// The four A3-verified leaf-utility paths overshoot code may import from
// the longshort tree. Kept small on purpose — each addition requires
// executor review + FP amendment.
//
// Matched as *specifier-suffix* — relative imports resolve to these tail paths.
// The two non-longshort entries (`longshort-clock`, `parse-as-of-date`) are
// generic infra that historically live under `_shared/`; they are included
// here so that any future move under the longshort tree still passes the
// membrane. `parse-as-of-date.ts` currently does NOT contain "longshort" in
// its specifier and therefore would not trigger the guard at all — it is
// listed for documentary completeness only.
export const A3_ALLOWLIST: ReadonlyArray<string> = [
  'longshort-universe-interfaces.ts',
  'longshort-universe/shared/fetch-with-timeout.ts',
  'longshort-clock.ts',
  'parse-as-of-date.ts',
];

export interface Violation {
  file: string;
  line: number;
  specifier: string;
  reason: string;
}

const IMPORT_RE =
  /(?:^|\n)\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;

export function scanFile(
  file: string,
  contents: string,
): Violation[] {
  const isOvershoot = /(^|\/)overshoot(\/|-)/.test(file) ||
                      /_shared\/overshoot\//.test(file) ||
                      /(^|\/)overshoot-[a-z0-9-]+\//.test(file);
  const isLongshort = /longshort/i.test(file) && !isOvershoot;
  const out: Violation[] = [];

  // Pre-compute per-line offsets for line-number reporting.
  const lineStarts: number[] = [0];
  for (let i = 0; i < contents.length; i++) {
    if (contents.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const lineOf = (idx: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(contents)) !== null) {
    const spec = m[1];
    const line = lineOf(m.index);

    if (isOvershoot && /longshort/.test(spec)) {
      const allowed = A3_ALLOWLIST.some((a) => spec.endsWith(a));
      if (!allowed) {
        out.push({
          file, line, specifier: spec,
          reason:
            'overshoot → longshort import not on A3 allowlist ' +
            '(FP-069 Separation Contract). Amend charter before adding.',
        });
      }
    }

    if (isLongshort && /overshoot/.test(spec)) {
      out.push({
        file, line, specifier: spec,
        reason:
          'longshort → overshoot import forbidden ' +
          '(FP-069 Separation Contract). Overshoot is the leaf tree.',
      });
    }
  }
  return out;
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(root)) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      out.push(...(await walk(path)));
    } else if (entry.isFile) {
      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(path);
    }
  }
  return out;
}

async function main() {
  const roots = ['supabase/functions', 'src'];
  const violations: Violation[] = [];
  for (const r of roots) {
    try {
      const files = await walk(r);
      for (const f of files) {
        const contents = await Deno.readTextFile(f);
        violations.push(...scanFile(f, contents));
      }
    } catch (_) { /* root missing — skip */ }
  }

  if (violations.length === 0) {
    console.log('check-overshoot-separation: OK (0 violations)');
    Deno.exit(0);
  }
  console.error(
    `check-overshoot-separation: FAIL (${violations.length} violation(s))\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  \`${v.specifier}\`  — ${v.reason}`);
  }
  Deno.exit(1);
}

if (import.meta.main) {
  await main();
}