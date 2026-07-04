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

// A3_ALLOWLIST semantics (FP-069 W1b turn-2, ACT-456):
// Entries here are the LIVE subset of the FP-069-ratified leaf set
// (clock, fetch-with-timeout, z-score-normalize, polygon-price-history-fetcher).
// A ratified-but-not-yet-imported leaf is NOT pre-listed — it is added the
// first time overshoot code genuinely imports it, in the same PR that
// introduces the import, citing the FP-069 charter clause that ratified it.
// A NON-ratified addition requires an FP-069 charter amendment BEFORE the
// allowlist edit lands. The predicate only fires on specifiers whose path
// contains 'longshort' (see rule 1 in `scanFile`), so any entry whose
// specifier does NOT contain 'longshort' is unreachable dead weight and
// must not be listed.
//
// W1b turn-2 removals:
//   - `parse-as-of-date.ts` — unreachable (no 'longshort' in specifier) AND
//     not a ratified charter leaf. Removed to keep the list a truthful mirror
//     of live posture.
//   - `longshort-universe-interfaces.ts` (removed turn-1) — HttpFetch is now
//     overshoot-owned at `_shared/overshoot/http-fetch.ts`.
export const A3_ALLOWLIST: ReadonlyArray<string> = [
  'longshort-universe/shared/fetch-with-timeout.ts',
  'longshort-clock.ts',
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
  // FP-069 W3.2.a (ACT-459.a): RULE 1 scope extension — the overshoot-owned
  // broker adapter tree at `_shared/overshoot-broker/` is a new leaf tree
  // subject to the same membrane discipline as `_shared/overshoot/`. The
  // first pattern `/(^|\/)overshoot(\/|-)/` already matches `overshoot-broker/`
  // structurally (segment starts with `overshoot-`), but the sibling explicit
  // `_shared/overshoot-broker/` predicate is added for reviewer clarity and
  // for a covering test-fixture that pins the intent (see the guard's
  // negative-fixture test in check-overshoot-separation_test.ts).
  const isOvershoot = /(^|\/)overshoot(\/|-)/.test(file) ||
                      /_shared\/overshoot\//.test(file) ||
                      /_shared\/overshoot-broker\//.test(file) ||
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