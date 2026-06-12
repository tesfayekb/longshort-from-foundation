#!/usr/bin/env -S deno run --allow-read

/**
 * check-queue-worker-test-any — Gate-11 source-sentinel.
 *
 * Asserts that test files under the queue-worker engine carry zero literal
 * `any` tokens (TS `: any`, `as any`, `<any>`, `any[]`, etc.) in code
 * positions (comments and string literals are stripped before matching).
 *
 * Class lesson (INC-73 / FP-048 second firing of FP-045 Phases 2-3 47-error
 * pattern): when new consumer-mode test files are landed alongside engine
 * changes, they tend to import-and-cast through `any` and silently breach
 * the ambient `@typescript-eslint/no-explicit-any` rule. CI catches it but
 * only at the repo lint gate (Gate 4). This sentinel surfaces the same
 * class at Gate 11 (full-repo CI) and locally via `deno run`.
 *
 * Convention: typed mocks per FP-041 — narrow local interfaces + boundary
 * `as unknown as <T>` casts. Override mechanism: none. If a future test
 * genuinely needs `any`, escalate via FP/ADR rather than weakening this
 * sentinel.
 *
 * Exit code: 0 = clean; non-zero = violations.
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface AnyViolation {
  file: string;
  line: number;
  text: string;
}

const SCANNED_DIR = 'supabase/functions/_shared/longshort-signals/shared/queue-worker';

// Word-boundary `any` not preceded by an identifier char. Matches `: any`,
// `as any`, `<any>`, `any[]`, `any |`, `(any)` — but not `Many`, `company`,
// `Anything`. Case-sensitive (TS keyword is lowercase).
export const ANY_TOKEN = /(^|[^A-Za-z0-9_$])any(?![A-Za-z0-9_$])/;

/** Strip line/block comments and string/template literals so matches only see code. */
export function stripCommentsAndStrings(line: string): string {
  let out = '';
  let i = 0;
  let inS = false, inD = false, inT = false, inBlock = false;
  while (i < line.length) {
    const c = line[i], n = line[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inS) { if (c === '\\') { i += 2; continue; } if (c === "'") inS = false; i++; continue; }
    if (inD) { if (c === '\\') { i += 2; continue; } if (c === '"') inD = false; i++; continue; }
    if (inT) { if (c === '\\') { i += 2; continue; } if (c === '`') inT = false; i++; continue; }
    if (c === '/' && n === '/') break;
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === "'") { inS = true; i++; continue; }
    if (c === '"') { inD = true; i++; continue; }
    if (c === '`') { inT = true; i++; continue; }
    out += c; i++;
  }
  return out;
}

export function findAnyInLine(line: string): boolean {
  const stripped = stripCommentsAndStrings(line);
  return ANY_TOKEN.test(stripped);
}

export async function scanQueueWorkerTests(rootDir = '.'): Promise<AnyViolation[]> {
  const violations: AnyViolation[] = [];
  try {
    for await (const entry of walk(`${rootDir}/${SCANNED_DIR}`, { exts: ['.ts'], includeDirs: false })) {
      const relPath = entry.path.replace(`${rootDir}/`, '');
      if (!relPath.endsWith('_test.ts')) continue;
      const text = await Deno.readTextFile(entry.path);
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (findAnyInLine(lines[i])) {
          violations.push({ file: relPath, line: i + 1, text: lines[i].trim() });
        }
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  return violations;
}

if (import.meta.main) {
  const violations = await scanQueueWorkerTests();
  if (violations.length === 0) {
    console.log('check-queue-worker-test-any: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-queue-worker-test-any: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  Deno.exit(1);
}