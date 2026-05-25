#!/usr/bin/env -S deno run --allow-read

/**
 * check-paper-only-url — CI enforcement script for DEC-036 clause (2) paper-only-URL ban.
 *
 * Banned: any reference to the Alpaca LIVE trading base URL (`://api.alpaca.markets`).
 * Allowed: paper trading URL `https://paper-api.alpaca.markets` and data URL `https://data.alpaca.markets`.
 *
 * Scanned scope per DEC-036 clause (2) verbatim: `src/features/longshort/**`.
 *
 * Override: `// allow-live-alpaca-url: <ADR-ID>`.
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

const SCAN_ROOT = 'src/features/longshort';

const SELF_EXCLUDE = [
  'scripts/check-paper-only-url.ts',
  'scripts/check-paper-only-url_test.ts',
] as const;

const OVERRIDE_ANNOTATION = /\/\/\s*allow-live-alpaca-url:\s*ADR-\d+/;
const LIVE_URL_PATTERN = /:\/\/api\.alpaca\.markets/;

export function isExcluded(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  return false;
}

export function stripLineComment(line: string): string {
  const idx = line.indexOf('//');
  if (idx === -1) return line;
  return line.slice(0, idx);
}

export function findViolationInLine(line: string, filePath: string, lineNumber: number): Violation | null {
  if (OVERRIDE_ANNOTATION.test(line)) return null;
  const beforeComment = stripLineComment(line);
  if (LIVE_URL_PATTERN.test(beforeComment)) {
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
  try {
    for await (const entry of walk(`${rootDir}/${SCAN_ROOT}`, { exts: ['.ts', '.tsx'], includeDirs: false })) {
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