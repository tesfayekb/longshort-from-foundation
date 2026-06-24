#!/usr/bin/env -S deno run --allow-read

/**
 * check-src-imports — RECIPROCAL of check-edge-imports (ACT-316, FP-056
 * E6-build-revision rider). Enforces the boundary in the src→edge direction:
 * `src/` code MUST NOT import from `supabase/functions/`.
 *
 * Why both directions matter (the codebase already encodes this via the
 * `longshort-broker-interfaces.ts` design + the negative-guard tests):
 *
 *   - edge→src is banned because the Supabase bundler can't resolve outside
 *     `supabase/functions/` (FP-011 — caught by `check-edge-imports.ts`).
 *   - src→edge is banned because the Vite bundle has no business reaching
 *     into edge-only code; the bundler's resolver may or may not find it
 *     depending on tsconfig path mapping, and even when it does, the
 *     edge tree carries Deno-specific imports (`https://...`, `Deno.*`)
 *     that don't survive the Vite build. The architectural rule is simpler
 *     than the resolver gymnastics: src/ and edge/ are two trees with one
 *     shared contract surface — `_shared/*-interfaces.ts` types that edge
 *     code consumes by reference. Concrete adapters live on one side or the
 *     other, never crossed.
 *
 * This guard prevents the Option-2-style inverted violation that would
 * silently land if E6's mistake had been "fixed" by relocating the src/
 * adapters into _shared/ and re-pointing the src/ sibling fetchers
 * back across the boundary. Both edges of the membrane are now codified.
 *
 * Banned (in non-test files under `src/`):
 *   - VALUE imports whose specifier contains `/supabase/functions/`
 *   - VALUE imports whose specifier starts with `supabase/functions/` (alias-style)
 *
 * Allowed:
 *   - relative imports within `src/`
 *   - npm: / jsr: / https: specifiers
 *   - TYPE-ONLY imports (`import type { ... } from '...'`). Type imports erase
 *     at TypeScript compile time and never enter the Vite bundle, so the
 *     "bundler cannot resolve" rationale does not apply. The architectural
 *     contract surface (`_shared/longshort-broker-interfaces.ts`,
 *     `_shared/longshort-reconciliation-types.ts`) is intentionally consumed
 *     by both trees via type-only imports.
 *   - Per-line override `// allow-src-edge-import: <reason>` for dev-tooling
 *     replay/harness code that runs under Deno (via `scripts/`) and is NOT
 *     part of the Vite production bundle. Mirrors the existing
 *     `// allow-live-alpaca-url: ADR-NNN` pattern from check-paper-only-url.
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

const SCAN_ROOT = 'src';

const SELF_EXCLUDE = [
  'scripts/check-src-imports.ts',
  'scripts/check-src-imports_test.ts',
] as const;

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)(['"])([^'"]+)\1/g;
const OVERRIDE_ANNOTATION = /\/\/\s*allow-src-edge-import:\s*\S+/;

export function isBannedSpecifier(spec: string): string | null {
  if (/^(https?:|npm:|jsr:|node:|data:)/.test(spec)) return null;
  if (!spec.startsWith('.') && !spec.startsWith('/')) {
    if (spec.startsWith('supabase/functions/')) {
      return 'src/ imports from `supabase/functions/` (Vite bundle cannot reliably resolve edge-only code with Deno-specific imports)';
    }
    return null;
  }
  if (/(^|\/)supabase\/functions\//.test(spec)) {
    return 'src/ imports a path containing `/supabase/functions/` (Vite bundle cannot reliably resolve edge-only code with Deno-specific imports)';
  }
  return null;
}

/**
 * Walk backward from the `from '...'` line to find the start of the import
 * statement (the nearest preceding line containing `^\s*import\b`). Returns
 * true if the import statement begins with `import type` (TypeScript
 * type-only import — erases at compile time, no Vite bundler resolution).
 */
export function isTypeOnlyImportStatement(lines: string[], fromLineIdx: number): boolean {
  for (let i = fromLineIdx; i >= Math.max(0, fromLineIdx - 10); i--) {
    const l = lines[i];
    if (/^\s*import\b/.test(l)) {
      return /^\s*import\s+type\b/.test(l);
    }
  }
  return false;
}

export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (OVERRIDE_ANNOTATION.test(line)) continue;
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(line)) !== null) {
      const spec = m[2];
      const reason = isBannedSpecifier(spec);
      if (reason) {
        if (isTypeOnlyImportStatement(lines, i)) continue;
        violations.push({ file: filePath, line: i + 1, text: line.trim(), reason });
      }
    }
  }
  return violations;
}

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  // Tests/harness files don't ship in the Vite bundle, so they can't break
  // production. The architectural rule is enforced on production src/ code
  // (mirrors the edge-side discipline: check-edge-imports also excludes
  // _test.ts). If a future src/ test needs to reference edge code it should
  // use a fixture or an injected mock, NOT a cross-tree import.
  if (filePath.endsWith('_test.ts') || filePath.endsWith('.test.ts')) return true;
  if (filePath.endsWith('_test.tsx') || filePath.endsWith('.test.tsx')) return true;
  // Harness files: ADR-002 validation tooling, not production bundle.
  if (/\bharness\b/.test(filePath)) return true;
  return false;
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    for await (const entry of walk(`${rootDir}/${SCAN_ROOT}`, {
      exts: ['.ts', '.tsx'],
      includeDirs: false,
    })) {
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
    console.log('check-src-imports: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-src-imports: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}