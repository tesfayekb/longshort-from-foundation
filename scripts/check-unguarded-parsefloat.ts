#!/usr/bin/env -S deno run --allow-read

/**
 * check-unguarded-parsefloat — CI enforcement for ACT-097 finding #13 / DW-058 B1:
 * bare `parseFloat(x)` without `Number.isFinite()` guard is a sentinel-class equivalent
 * (NaN silently propagates through arithmetic and tolerance comparisons).
 *
 * Override: `// allow-bare-parsefloat: <ADR-ID or DW-ID>`.
 *
 * Exit code: 0 = clean; non-zero = violations.
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface Violation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

const SCANNED_PATHS = ['src/features/longshort', 'supabase/functions'] as const;

const SCOPE_GLOB_PREFIXES = [
  'src/features/longshort/services/',
  'src/features/longshort/api/',
  'supabase/functions/longshort-',
  'supabase/functions/_shared/strategy-reconciliation',
] as const;

const SELF_EXCLUDE = [
  'scripts/check-unguarded-parsefloat.ts',
  'scripts/check-unguarded-parsefloat_test.ts',
] as const;

const OVERRIDE_ANNOTATION = /\/\/\s*allow-bare-parsefloat:\s*(ADR-\d+|DW-\d+(?:-B\d+)?)/;
const PARSEFLOAT_PATTERN = /\bparseFloat\s*\(/;
const GUARD_PATTERNS = [
  /\bNumber\.isFinite\s*\(/,
  /\bNumber\.isNaN\s*\(/,
  /\bisNaN\s*\(/,
];

export function isInScope(filePath: string): boolean {
  return SCOPE_GLOB_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  return false;
}

export function findViolationInLine(line: string, filePath: string, lineNumber: number): Violation | null {
  if (OVERRIDE_ANNOTATION.test(line)) return null;
  if (!PARSEFLOAT_PATTERN.test(line)) return null;
  const hasGuard = GUARD_PATTERNS.some(g => g.test(line));
  if (hasGuard) return null;
  return {
    file: filePath,
    line: lineNumber,
    text: line.trim(),
    reason: 'ACT-097 finding #13 — bare parseFloat() without Number.isFinite() guard; NaN propagates silently as sentinel-class equivalent',
  };
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const scanPath of SCANNED_PATHS) {
    try {
      for await (const entry of walk(`${rootDir}/${scanPath}`, { exts: ['.ts'], includeDirs: false })) {
        const relPath = entry.path.replace(`${rootDir}/`, '');
        if (!isInScope(relPath)) continue;
        if (isExcluded(relPath)) continue;
        const text = await Deno.readTextFile(entry.path);
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const v = findViolationInLine(lines[i], relPath, i + 1);
          if (v) violations.push(v);
        }
      }
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  return violations;
}

if (import.meta.main) {
  const violations = await scanRepository();
  if (violations.length === 0) {
    console.log('check-unguarded-parsefloat: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-unguarded-parsefloat: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}