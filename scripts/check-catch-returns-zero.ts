#!/usr/bin/env -S deno run --allow-read

/**
 * check-catch-returns-zero — CI enforcement for DEC-034 clause (2) phantom-success
 * swallow ban: `try { ... } catch { return 0 }` silently coerces errors to a numeric-zero
 * sentinel indistinguishable from real-zero outcomes.
 *
 * Override: `// allow-catch-zero: <ADR-ID>` on the catch line.
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
] as const;

const SELF_EXCLUDE = [
  'scripts/check-catch-returns-zero.ts',
  'scripts/check-catch-returns-zero_test.ts',
] as const;

const OVERRIDE_ANNOTATION = /\/\/\s*allow-catch-zero:\s*ADR-\d+/;

export function isInScope(filePath: string): boolean {
  return SCOPE_GLOB_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  return false;
}

/** Heuristic: find `catch`; within next 10 lines look for `return 0` with no intervening `throw`. */
export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bcatch\s*(\(|\{)/.test(line)) continue;
    if (OVERRIDE_ANNOTATION.test(line)) continue;
    let sawReturnZero = false;
    let sawThrow = false;
    for (let j = i + 1; j < Math.min(i + 11, lines.length); j++) {
      const inner = lines[j];
      if (/\bthrow\b/.test(inner)) { sawThrow = true; break; }
      if (/\breturn\s+0\s*;/.test(inner)) { sawReturnZero = true; break; }
    }
    if (sawReturnZero && !sawThrow) {
      violations.push({
        file: filePath,
        line: i + 1,
        text: line.trim(),
        reason: 'DEC-034 (2) catch { return 0 } phantom-success swallow — error silently coerced to numeric-zero sentinel',
      });
    }
  }
  return violations;
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
        violations.push(...findViolationsInLines(lines, relPath));
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
    console.log('check-catch-returns-zero: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-catch-returns-zero: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}