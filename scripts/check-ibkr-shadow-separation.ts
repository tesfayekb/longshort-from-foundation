/**
 * check-ibkr-shadow-separation.ts — ACT-572 CI membrane guard.
 *
 * Enforces charter §2 Design Constraint: money-path files MUST NOT
 * import from `_shared/overshoot-shadow-ibkr/*`. The shadow lane is a
 * one-way tree — money-path code stays ignorant of its existence.
 *
 * Allowed importers of `_shared/overshoot-shadow-ibkr/*`:
 *   1. supabase/functions/overshoot-ibkr-shadow-mirror/**
 *   2. supabase/functions/overshoot-ibkr-shadow-reconcile/**
 *   3. supabase/functions/_shared/overshoot-shadow-ibkr/**  (intra-tree)
 *   4. scripts/** (CI + test harnesses)
 *
 * Exit codes:
 *   0 = clean
 *   1 = violation(s) found; each printed with file:line and reason.
 */

export interface Violation {
  file: string;
  line: number;
  specifier: string;
  reason: string;
}

const IMPORT_RE =
  /(?:^|\n)\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;

const SHADOW_SPECIFIER_RE = /overshoot-shadow-ibkr(\/|$)/;

/** Return true if `file` is on the shadow-lane allowlist. */
export function isShadowAllowed(file: string): boolean {
  return (
    /(^|\/)overshoot-ibkr-shadow-mirror\//.test(file) ||
    /(^|\/)overshoot-ibkr-shadow-reconcile\//.test(file) ||
    /_shared\/overshoot-shadow-ibkr\//.test(file) ||
    /(^|\/)scripts\//.test(file)
  );
}

export function scanFile(file: string, contents: string): Violation[] {
  const out: Violation[] = [];

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
    if (!SHADOW_SPECIFIER_RE.test(spec)) continue;
    if (isShadowAllowed(file)) continue;
    out.push({
      file,
      line: lineOf(m.index),
      specifier: spec,
      reason:
        'money-path file imports from _shared/overshoot-shadow-ibkr/* ' +
        '(ACT-572 charter §2 — shadow lane never feeds money path).',
    });
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
    console.log('check-ibkr-shadow-separation: OK (0 violations)');
    Deno.exit(0);
  }
  console.error(
    `check-ibkr-shadow-separation: FAIL (${violations.length} violation(s))\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  \`${v.specifier}\`  — ${v.reason}`);
  }
  Deno.exit(1);
}

if (import.meta.main) {
  await main();
}