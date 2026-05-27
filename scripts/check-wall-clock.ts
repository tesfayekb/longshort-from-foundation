#!/usr/bin/env -S deno run --allow-read

/**
 * check-wall-clock — CI enforcement script for DEC-034 clause (4) wall-clock-leakage ban.
 *
 * Per ADR-003 enforcement-as-scripts-not-prose: this script is the authoritative enforcement
 * boundary for the wall-clock-leakage ban; DEC-034 clause (4) prose is the requirement.
 *
 * Banned patterns (per DEC-034 clause (4) verbatim):
 *   - Date.now()
 *   - new Date() (no-arg constructor; arg constructor with explicit ts is acceptable)
 *   - performance.now()
 *   - Temporal.Now.*
 *
 * NOTE: this docstring intentionally avoids the banned patterns as code-style strings —
 * the file-level pass below tracks /(asterisk)(asterisk) ... (asterisk)/ block-comment state
 * correctly, but defensive avoidance here also ensures the script's own JSDoc is never
 * a near-miss for its detector. Per ADR-003 self-discipline.
 *
 * Override mechanism per DEC-034 clause (4):
 *   // allow-now-in-business-logic: ADR-NNN  (permits specific instances with ADR rationale)
 *
 * Multi-line block-comment handling per ACT-099-post defect #18 fix:
 *   Detection runs file-level (lines: string[]) with inBlockComment state persisted
 *   across line boundaries. JSDoc prose mentioning the banned patterns is correctly
 *   excluded from detection. Mirror architectural pattern from check-catch-returns-zero.ts.
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

export const WALL_CLOCK_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  reason: string;
  name: string;
  // When true, the pattern must ALSO match the line with comments stripped but
  // string literals preserved. This prevents false positives where the generic
  // strip-strings-and-comments pass collapses `new Date('iso')` into `new Date()`
  // and the regex then matches the synthetic empty-arg shape. See CI-FIX-01 /
  // ACT-121 (detector defect #4 in defect-#36 family lineage).
  requireLiteralEmpty?: boolean;
}> = [
  { name: 'Date.now',       pattern: /\bDate\.now\(\s*\)/,        reason: 'DEC-034 (4) Date.now() leaks wall-clock into business logic' },
  { name: 'new-Date-noarg', pattern: /\bnew\s+Date\(\s*\)/,       reason: 'DEC-034 (4) new Date() with no argument leaks wall-clock; use injected ts parameter', requireLiteralEmpty: true },
  { name: 'performance.now',pattern: /\bperformance\.now\(\s*\)/, reason: 'DEC-034 (4) performance.now() leaks wall-clock' },
  { name: 'Temporal.Now',   pattern: /\bTemporal\.Now\./,         reason: 'DEC-034 (4) Temporal.Now.* leaks wall-clock' },
];

export interface ScanState {
  inBlockComment: boolean;
}

export function stripCommentsAndStringsWithState(line: string, state: ScanState): string {
  let out = '';
  let i = 0;
  let inSingleString = false;
  let inDoubleString = false;
  let inBacktickString = false;
  while (i < line.length) {
    const c = line[i];
    const next = line[i + 1];
    if (state.inBlockComment) {
      if (c === '*' && next === '/') { state.inBlockComment = false; i += 2; continue; }
      i++; continue;
    }
    if (inSingleString) { if (c === '\\') { i += 2; continue; } if (c === "'") inSingleString = false; i++; continue; }
    if (inDoubleString) { if (c === '\\') { i += 2; continue; } if (c === '"') inDoubleString = false; i++; continue; }
    if (inBacktickString) { if (c === '\\') { i += 2; continue; } if (c === '`') inBacktickString = false; i++; continue; }
    if (c === '/' && next === '/') break;
    if (c === '/' && next === '*') { state.inBlockComment = true; i += 2; continue; }
    if (c === "'") { inSingleString = true; i++; continue; }
    if (c === '"') { inDoubleString = true; i++; continue; }
    if (c === '`') { inBacktickString = true; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

/**
 * Like stripCommentsAndStringsWithState, but preserves string-literal contents.
 * Only block comments (across lines) and `//` line comments are removed. Used by
 * the `new-Date-noarg` pattern's `requireLiteralEmpty` discriminator so that
 * `new Date('iso-string')` is NOT mistaken for `new Date()` after stripping.
 */
export function stripCommentsOnlyWithState(line: string, state: ScanState): string {
  let out = '';
  let i = 0;
  let inSingleString = false;
  let inDoubleString = false;
  let inBacktickString = false;
  while (i < line.length) {
    const c = line[i];
    const next = line[i + 1];
    if (state.inBlockComment) {
      if (c === '*' && next === '/') { state.inBlockComment = false; i += 2; continue; }
      i++; continue;
    }
    if (inSingleString) { out += c; if (c === '\\') { out += line[i + 1] ?? ''; i += 2; continue; } if (c === "'") inSingleString = false; i++; continue; }
    if (inDoubleString) { out += c; if (c === '\\') { out += line[i + 1] ?? ''; i += 2; continue; } if (c === '"') inDoubleString = false; i++; continue; }
    if (inBacktickString) { out += c; if (c === '\\') { out += line[i + 1] ?? ''; i += 2; continue; } if (c === '`') inBacktickString = false; i++; continue; }
    if (c === '/' && next === '/') break;
    if (c === '/' && next === '*') { state.inBlockComment = true; i += 2; continue; }
    if (c === "'") { inSingleString = true; out += c; i++; continue; }
    if (c === '"') { inDoubleString = true; out += c; i++; continue; }
    if (c === '`') { inBacktickString = true; out += c; i++; continue; }
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
  // Exclude both Deno (`_test.ts`) and Vitest (`.test.ts`) naming conventions.
  // Test files are exempt from wall-clock checks because they routinely
  // construct `new Date('iso-string')` for fixture timestamps. See CI-FIX-01 /
  // ACT-121 (detector defect #5 in defect-#36 family lineage — naming-convention drift).
  if (filePath.endsWith('_test.ts')) return true;
  if (filePath.endsWith('.test.ts')) return true;
  return false;
}

export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const violations: Violation[] = [];
  const state: ScanState = { inBlockComment: false };
  const commentOnlyState: ScanState = { inBlockComment: false };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (OVERRIDE_ANNOTATION.test(line)) {
      stripCommentsAndStringsWithState(line, state);
      stripCommentsOnlyWithState(line, commentOnlyState);
      continue;
    }
    const stripped = stripCommentsAndStringsWithState(line, state);
    const commentStrippedOnly = stripCommentsOnlyWithState(line, commentOnlyState);
    for (const { pattern, reason, name, requireLiteralEmpty } of WALL_CLOCK_PATTERNS) {
      if (!pattern.test(stripped)) continue;
      if (requireLiteralEmpty && !pattern.test(commentStrippedOnly)) {
        // The strings-and-comments strip turned a `new Date('iso')` into a
        // synthetic `new Date()` shape. The comment-only strip preserves the
        // string contents, so the regex does not match the literal source —
        // therefore not a real violation. Suppress.
        continue;
      }
        violations.push({ file: filePath, line: i + 1, text: line.trim(), pattern: name, reason });
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
