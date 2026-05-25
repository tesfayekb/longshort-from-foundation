#!/usr/bin/env -S deno run --allow-read

/**
 * check-sentinel-patterns — CI enforcement script for DEC-034 clause (2) sentinel-pattern ban.
 *
 * Per ADR-003 enforcement-as-scripts-not-prose: this script is the authoritative enforcement
 * boundary for the sentinel-pattern ban; DEC-034 clause (2) prose is the requirement, this
 * script is the verifier.
 *
 * Banned patterns covered (per DEC-034 clause (2) verbatim):
 *   - `value ?? 0` coercion in financial-logic paths
 *   - `value || 0` coercion (truthy fallback to numeric zero)
 *   - `parseFloat(x) || 0` — sentinel-coalescing parseFloat
 *   - Hardcoded numeric sentinels in trading-paths (-1, -999, 999, 9999 used as fallback returns)
 *
 * Override mechanism per DEC-034 clause (2):
 *   `// allow-sentinel-fallback: <ADR-ID>` permits specific instances with ADR rationale.
 *   Override registry maintained in `docs/banned-patterns.md`.
 *
 * Exit code: 0 = clean; non-zero = violations (CI fails the build).
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface Violation {
  file: string;
  line: number;
  text: string;
  pattern: string;
  reason: string;
}

const SCANNED_PATHS = [
  'src/features/longshort/services',
  'src/features/longshort/api',
  'supabase/functions',
] as const;

const SCOPE_GLOB_PREFIXES = [
  'src/features/longshort/services/',
  'src/features/longshort/api/',
  'supabase/functions/longshort-',
  'supabase/functions/_shared/strategy-reconciliation',
] as const;

const SELF_EXCLUDE = [
  'scripts/check-sentinel-patterns.ts',
  'scripts/check-sentinel-patterns_test.ts',
] as const;

const OVERRIDE_ANNOTATION = /\/\/\s*allow-sentinel-fallback:\s*ADR-\d+/;

export const SENTINEL_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string; name: string }> = [
  { name: '??-0',         pattern: /\?\?\s*0\b/,                 reason: 'DEC-034 (2) nullish-coalesce to zero is a sentinel fallback' },
  { name: '||-0',         pattern: /\|\|\s*0\b/,                 reason: 'DEC-034 (2) truthy-or to zero is a sentinel fallback' },
  { name: 'parseFloat-||',pattern: /parseFloat\([^)]*\)\s*\|\|/, reason: 'DEC-034 (2) parseFloat result with truthy-or coercion is a sentinel fallback' },
  { name: 'parseFloat-??',pattern: /parseFloat\([^)]*\)\s*\?\?/, reason: 'DEC-034 (2) parseFloat result with nullish-coalesce is a sentinel fallback' },
  { name: 'return-neg1',  pattern: /return\s+-1\s*;/,            reason: 'DEC-034 (2) hardcoded -1 sentinel return value' },
  { name: 'return-neg999',pattern: /return\s+-999\s*;/,          reason: 'DEC-034 (2) hardcoded -999 sentinel return value' },
  { name: 'return-999',   pattern: /return\s+999\s*;/,           reason: 'DEC-034 (2) hardcoded 999 sentinel return value' },
  { name: 'return-9999',  pattern: /return\s+9999\s*;/,          reason: 'DEC-034 (2) hardcoded 9999 sentinel return value' },
];

/** Strip comments and string literals from a line so pattern matching only sees code. */
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
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i += 2; continue; }
      i++; continue;
    }
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
  if (filePath.endsWith('_test.ts')) return true;
  return false;
}

export function findViolationsInLine(line: string, filePath: string, lineNumber: number): Violation[] {
  if (OVERRIDE_ANNOTATION.test(line)) return [];
  const stripped = stripCommentsAndStrings(line);
  const violations: Violation[] = [];
  for (const { pattern, reason, name } of SENTINEL_PATTERNS) {
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
    console.log('check-sentinel-patterns: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-sentinel-patterns: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.pattern}] ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}