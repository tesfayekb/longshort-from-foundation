#!/usr/bin/env -S deno run --allow-read

/**
 * check-edge-imports — CI enforcement for FP-011: Supabase edge-function code MUST NOT
 * import from outside `supabase/functions/`. The Supabase bundler only ships files inside
 * the function directory + sibling `_shared/`; reaching across into `src/...` produces a
 * "Module not found" failure at deploy time that CI-green tests do NOT catch (Vitest /
 * Deno run sources directly without the bundler).
 *
 * This script is the durable fix for the test-gap that hid the FP-010 / FP-011 defect.
 *
 * Banned (in non-test edge function source under `supabase/functions/`):
 *   - imports whose specifier contains `/src/`
 *   - imports whose specifier starts with `src/` (alias-style)
 *   - imports that traverse up into `src/` via `../...` paths
 *
 * Allowed:
 *   - relative imports within the function directory or into `../_shared/...`
 *   - npm: / jsr: / https: specifiers
 *
 * Exit code: 0 = clean; non-zero = violations (CI fails the build).
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface Violation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

const SCAN_ROOT = 'supabase/functions';

const SELF_EXCLUDE = [
  'scripts/check-edge-imports.ts',
  'scripts/check-edge-imports_test.ts',
] as const;

// Match `from '<spec>'` or `from "<spec>"` and `import('<spec>')`.
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)(['"])([^'"]+)\1/g;

export function isBannedSpecifier(spec: string): string | null {
  // External / npm / jsr / data — fine.
  if (/^(https?:|npm:|jsr:|node:|data:)/.test(spec)) return null;
  // Bare module specifiers (e.g. "react") — not used in edge code, but harmless to allow.
  if (!spec.startsWith('.') && !spec.startsWith('/')) {
    if (spec.startsWith('src/')) {
      return 'edge function imports from `src/` (bundler cannot resolve outside supabase/functions/)';
    }
    return null;
  }
  // Relative path: catch anything that mentions `/src/` after normalization-ish.
  // We do not resolve fs; literal substring is enough because the only way to escape
  // supabase/functions/ into src/ is to write `/src/` somewhere in the specifier.
  if (/(^|\/)src\//.test(spec)) {
    return 'edge function imports a path containing `/src/` (bundler cannot resolve outside supabase/functions/)';
  }
  return null;
}

export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(line)) !== null) {
      const spec = m[2];
      const reason = isBannedSpecifier(spec);
      if (reason) {
        violations.push({ file: filePath, line: i + 1, text: line.trim(), reason });
      }
    }
  }
  return violations;
}

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  // Test files don't ship in the deploy bundle, so they can't break deploys.
  // (They still shouldn't import from src/, but that's a separate concern; keep
  // this verifier focused on the deploy-breaking class.)
  if (filePath.endsWith('_test.ts') || filePath.endsWith('.test.ts')) return true;
  return false;
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    for await (const entry of walk(`${rootDir}/${SCAN_ROOT}`, { exts: ['.ts'], includeDirs: false })) {
      const relPath = entry.path.replace(`${rootDir}/`, '').replace(/^\.\//, '');
      if (isExcluded(relPath)) continue;
      const text = await Deno.readTextFile(entry.path);
      violations.push(...findViolationsInLines(text.split('\n'), relPath));
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  return violations;
}

if (import.meta.main) {
  const violations = await scanRepository();
  if (violations.length === 0) {
    console.log('check-edge-imports: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-edge-imports: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}