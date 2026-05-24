#!/usr/bin/env -S deno run --allow-read

/**
 * check-audit-writer-trap — CI enforcement script for DEC-034 clause (5) audit-writer trap.
 *
 * Per FP-006 sub-step 6.4 (FOLLOWUP-004 closure): replaces the embedded-regex enforcement
 * pattern in DEC-034 clause (5) v13.1 with a tested script + companion unit test suite.
 * Per ADR-003 v1.0: enforcement logic that requires pattern matching MUST live in tested
 * scripts, not DEC prose. This script IS that enforcement boundary for the audit-writer trap.
 *
 * Enforcement scope: scans for any line that imports OR calls `logAuditEvent` (DEC-033 v4.1
 * banned in longshort code paths; canonical writer is `writeStrategyAuditEvent`).
 *
 *   Scanned: src/features/longshort/, supabase/functions/longshort-*, supabase/functions/_shared/longshort-*
 *   Excluded: comments (JSDoc/line/block), string literals, _test.ts files, this script itself
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

/**
 * Heuristic: is character index `i` inside a string literal on this line?
 * Counts unescaped quote characters before position; odd count = inside a string.
 */
function isInsideStringLiteral(line: string, charIndex: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = 0; i < charIndex; i++) {
    const c = line[i];
    const prev = i > 0 ? line[i - 1] : '';
    if (prev === '\\') continue;
    if (c === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (c === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (c === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
  }
  return inSingle || inDouble || inBacktick;
}

/**
 * Detect violations in source text. Pure function (exported for testing).
 * Returns array of violation records; empty array = clean.
 */
export function detectViolations(source: string, filename: string): Violation[] {
  if (typeof source !== 'string') {
    throw new Error('detectViolations: source must be a string');
  }

  const violations: Violation[] = [];
  const lines = source.split('\n');

  let inMultilineImport = false;

  const importPattern = /\bimport\s.*\blogAuditEvent\b/;
  const callPattern = /\blogAuditEvent\s*\(/;
  const exportPattern = /\bexport\s.*\blogAuditEvent\b/;
  const symbolPattern = /\blogAuditEvent\b/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.replace(/^\s+/, '');

    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      continue;
    }

    if (/^\s*import\s*\{/.test(line) && !/}/.test(line)) {
      inMultilineImport = true;
    }
    if (inMultilineImport && /\}/.test(line)) {
      if (symbolPattern.test(line)) {
        const match = line.match(symbolPattern);
        if (match && match.index !== undefined && !isInsideStringLiteral(line, match.index)) {
          violations.push({
            file: filename,
            line: lineNum,
            text: line,
            reason: 'multi-line import containing logAuditEvent',
          });
        }
      }
      inMultilineImport = false;
      continue;
    }

    if (inMultilineImport) {
      if (symbolPattern.test(line)) {
        const match = line.match(symbolPattern);
        if (match && match.index !== undefined && !isInsideStringLiteral(line, match.index)) {
          violations.push({
            file: filename,
            line: lineNum,
            text: line,
            reason: 'multi-line import containing logAuditEvent',
          });
        }
      }
      continue;
    }

    const matchedPattern =
      importPattern.test(line) ? 'import-statement' :
      callPattern.test(line) ? 'call-site' :
      exportPattern.test(line) ? 'export-statement' :
      null;

    if (matchedPattern) {
      const matches = [
        ...line.matchAll(/\blogAuditEvent\b/g),
      ];
      for (const m of matches) {
        if (m.index !== undefined && !isInsideStringLiteral(line, m.index)) {
          violations.push({
            file: filename,
            line: lineNum,
            text: line,
            reason: matchedPattern,
          });
          break;
        }
      }
    }
  }

  return violations;
}

const SCAN_PATHS = [
  'src/features/longshort',
  'supabase/functions/_shared',
  'supabase/functions',
];

/**
 * Scan longshort code paths and return all violations.
 * Excludes: _test.ts files, this script itself.
 */
export async function scanLongshortPaths(rootDir: string = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];

  for (const subdir of SCAN_PATHS) {
    const root = `${rootDir}/${subdir}`;
    try {
      for await (const entry of walk(root, {
        exts: ['.ts'],
        skip: [/_test\.ts$/, /check-audit-writer-trap\.ts$/],
      })) {
        if (entry.path.includes('supabase/functions/') &&
            !entry.path.includes('longshort')) {
          continue;
        }
        const source = await Deno.readTextFile(entry.path);
        const fileViolations = detectViolations(source, entry.path);
        violations.push(...fileViolations);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`scanLongshortPaths: skipped ${root} due to error: ${errMsg}`);
    }
  }

  return violations;
}

if (import.meta.main) {
  const violations = await scanLongshortPaths();
  if (violations.length === 0) {
    console.log('check-audit-writer-trap: CLEAN (0 violations)');
    Deno.exit(0);
  }
  console.error(`check-audit-writer-trap: ${violations.length} violation(s) found:`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.text.trim()} (${v.reason})`);
  }
  Deno.exit(1);
}