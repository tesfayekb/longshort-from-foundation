#!/usr/bin/env -S deno run --allow-read

/**
 * check-paper-only-url — CI enforcement script for DEC-036 clause (2) paper-only-URL ban.
 *
 * Banned: any reference to the Alpaca LIVE trading base URL (://api.alpaca.markets).
 * Allowed: paper trading URL https://paper-api.alpaca.markets and data URL https://data.alpaca.markets.
 *
 * Scanned scope per DEC-036 clause (2) verbatim: src/features/longshort/**.
 * EXPANDED at INC-77 closure (DEC-068 clause f + k.8 — FP-056 E2 PR): also
 * scans supabase/functions/** so the E2 sequential submitter + the rest of
 * _shared/longshort-execution/ live inside the static-lint coverage. The
 * runtime guard in `alpaca-paper-client.ts` constructor catches dynamic /
 * config-injected overrides; this static lint catches literal references to
 * the live URL string. The two together cover both surface classes.
 *
 * Override: // allow-live-alpaca-url: ADR-NNN
 *
 * String-literal awareness per ACT-099-post defect #19 fix:
 *   The previous stripLineComment cut at first '//' regardless of string-literal context,
 *   which masked URLs (whose '://' contains the '//' boundary) from detection. The fix
 *   tracks string-literal state character-by-character so URLs inside string literals
 *   remain visible to the pattern while legitimate '// ...' line comments are stripped.
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

const SCAN_ROOTS = [
  'src/features/longshort',
  'supabase/functions',
] as const;

const SELF_EXCLUDE = [
  'scripts/check-paper-only-url.ts',
  'scripts/check-paper-only-url_test.ts',
] as const;

const OVERRIDE_ANNOTATION = /\/\/\s*allow-live-alpaca-url:\s*ADR-\d+/;
const LIVE_URL_PATTERN = /:\/\/api\.alpaca\.markets/;

/**
 * String-literal-aware comment stripper. Preserves '...', "...", `...` content
 * (so URLs containing '//' are not truncated), strips '// ...' line comments only
 * when the '//' is outside any string literal. Block-comment handling is line-local
 * (no in-scope file currently has multi-line JSDoc prose containing a live URL; if
 * that ever changes, add an inBlockComment regression test and upgrade to ScanState).
 */
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
    if (inSingleString) { if (c === '\\') { out += c + (next ?? ''); i += 2; continue; } if (c === "'") inSingleString = false; out += c; i++; continue; }
    if (inDoubleString) { if (c === '\\') { out += c + (next ?? ''); i += 2; continue; } if (c === '"') inDoubleString = false; out += c; i++; continue; }
    if (inBacktickString) { if (c === '\\') { out += c + (next ?? ''); i += 2; continue; } if (c === '`') inBacktickString = false; out += c; i++; continue; }
    if (c === '/' && next === '/') break;
    if (c === '/' && next === '*') { inBlockComment = true; i += 2; continue; }
    if (c === "'") { inSingleString = true; out += c; i++; continue; }
    if (c === '"') { inDoubleString = true; out += c; i++; continue; }
    if (c === '`') { inBacktickString = true; out += c; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  return false;
}

export function findViolationInLine(line: string, filePath: string, lineNumber: number): Violation | null {
  if (OVERRIDE_ANNOTATION.test(line)) return null;
  const stripped = stripCommentsAndStrings(line);
  if (LIVE_URL_PATTERN.test(stripped)) {
    return {
      file: filePath,
      line: lineNumber,
      text: line.trim(),
      reason: 'DEC-036 (2) live Alpaca trading URL (://api.alpaca.markets) banned — paper-only base URL discipline',
    };
  }
  return null;
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const root of SCAN_ROOTS) {
    try {
      for await (const entry of walk(`${rootDir}/${root}`, { exts: ['.ts', '.tsx'], includeDirs: false })) {
        const relPath = entry.path.replace(`${rootDir}/`, '');
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
    console.log('check-paper-only-url: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-paper-only-url: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}
