#!/usr/bin/env -S deno run --allow-read

/**
 * check-wall-clock — CI enforcement script for DEC-034 clause (4) wall-clock-leakage ban.
 *
 * Per ADR-003 enforcement-as-scripts-not-prose: this script is the authoritative enforcement
 * boundary for the wall-clock-leakage ban; DEC-034 clause (4) prose is the requirement.
 *
 * Banned patterns (per DEC-034 clause (4) verbatim):
 *   - `Date.now()`
 *   - `new Date()` (no-arg constructor; arg constructor with explicit ts is acceptable)
 *   - `performance.now()`
 *   - `Temporal.Now.*`
 *
 * Override mechanism per DEC-034 clause (4):
 *   `// allow-now-in-business-logic: <ADR-ID>` permits specific instances with ADR rationale.
 *
 * Exit code: 0 = clean; non-zero = violations.
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface Violation {
  file: string;
  line: number;
  text: string;
  pattern: string;
  reason: string;
}

const SCANNED_PATHS = ['src/features/longshort', 'supabase/functions'] as const;

const SCOPE_GLOB_PREFIXES = [
  'src/features/longshort/services/',
  'src/features/longshort/api/',
  'supabase/functions/longshort-',
  'supabase/functions/_shared/longshort-',
] as const;

const SANCTIONED_CLOCK_FILES = [
  'supabase/functions/_shared/longshort-clock.ts',
  'src/features/longshort/utils/clock.ts',
] as const;

const SELF_EXCLUDE = [
  'scripts/check-wall-clock.ts',
  'scripts/check-wall-clock_test.ts',
] as const;

const OVERRIDE_ANNOTATION = /\/\/\s*allow-now-in-business-logic:\s*ADR-\d+/;

export const WALL_CLOCK_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string; name: string }> = [
  { name: 'Date.now',       pattern: /\bDate\.now\(\s*\)/,        reason: 'DEC-034 (4) Date.now() leaks wall-clock into business logic' },
  { name: 'new-Date-noarg', pattern: /\bnew\s+Date\(\s*\)/,       reason: 'DEC-034 (4) new Date() with no argument leaks wall-clock; use injected ts parameter' },
  { name: 'performance.now',pattern: /\bperformance\.now\(\s*\)/, reason: 'DEC-034 (4) performance.now() leaks wall-clock' },
  { name: 'Temporal.Now',   pattern: /\bTemporal\.Now\./,         reason: 'DEC-034 (4) Temporal.Now.* leaks wall-clock' },
];

export function stripCommentsAndStrings(line: string): string {
  let out = '';
  let i = 0;
  let inSingleString = false;
  let inDoubleString = false;
  let inBacktickString = false;
  let inBlockComment = false;
  while (i < line.length) {
    const c = line[i];
    const next = line[i + 1];
    if (inBlockComment) { if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; } i++; continue; }
    if (inSingleString) { if (c === '\\') { i += 2; continue; } if (c === "'") inSingleString = false; i++; continue; }
    if (inDoubleString) { if (c === '\\') { i += 2; continue; } if (c === '"') inDoubleString = false; i++; continue; }
    if (inBacktickString) { if (c === '\\') { i += 2; continue; } if (c === '`') inBacktickString = false; i++; continue; }
    if (c === '/' && next === '/') break;
    if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
    if (c === "'") { inSingleString = true; i++; continue; }
    if (c === '"') { inDoubleString = true; i++; continue; }
    if (c === '`') { inBacktickString = true; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

export function isInScope(filePath: string): boolean {
  return SCOPE_GLOB_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (SANCTIONED_CLOCK_FILES.includes(filePath as typeof SANCTIONED_CLOCK_FILES[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  return false;
}

export function findViolationsInLine(line: string, filePath: string, lineNumber: number): Violation[] {
  if (OVERRIDE_ANNOTATION.test(line)) return [];
  const stripped = stripCommentsAndStrings(line);
  const violations: Violation[] = [];
  for (const { pattern, reason, name } of WALL_CLOCK_PATTERNS) {
    if (pattern.test(stripped)) {
      violations.push({ file: filePath, line: lineNumber, text: line.trim(), pattern: name, reason });
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
        for (let i = 0; i < lines.length; i++) {
          violations.push(...findViolationsInLine(lines[i], relPath, i + 1));
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
    console.log('check-wall-clock: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-wall-clock: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.pattern}] ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}