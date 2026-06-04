#!/usr/bin/env -S deno run --allow-read

/**
 * check-supabase-client-specifier — Gate 14 banned-pattern check.
 *
 * FP-008.4 Commit 7.5 / DW-082 A1.b: edge-function code must import
 * @supabase/supabase-js through the canonical import-map specifier
 * (`@supabase/supabase-js`, mapped in supabase/functions/deno.json).
 * Raw esm.sh imports create a second nominal SupabaseClient type identity
 * and can reintroduce the TS2322 class that blocked Gate 11.
 *
 * Scope: production and test TypeScript under supabase/functions/. Both
 * runtime imports and `import type` declarations are scanned.
 *
 * Exit code: 0 = clean; non-zero = violations.
 */
import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface Violation {
  file: string;
  line: number;
  text: string;
  specifier: string;
}

const SCAN_ROOT = 'supabase/functions';
const BANNED_SPECIFIER = /^https:\/\/esm\.sh\/@supabase\/supabase-js(?:@|\/|$)/;

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)(['"])([^'"]+)\1/g;

export function isBannedSupabaseSpecifier(specifier: string): boolean {
  return BANNED_SPECIFIER.test(specifier);
}

export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const violations: Violation[] = [];
  for (let i = 0; i < lines.length; i++) {
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(lines[i])) !== null) {
      const specifier = match[2];
      if (!isBannedSupabaseSpecifier(specifier)) continue;
      violations.push({
        file: filePath,
        line: i + 1,
        text: lines[i].trim(),
        specifier,
      });
    }
  }
  return violations;
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    for await (const entry of walk(`${rootDir}/${SCAN_ROOT}`, { exts: ['.ts'], includeDirs: false })) {
      const relPath = entry.path.replace(`${rootDir}/`, '').replace(/^\.\//, '');
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
    console.log('check-supabase-client-specifier: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-supabase-client-specifier: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.text}`);
    console.error(`    reason: import @supabase/supabase-js via canonical '@supabase/supabase-js', not ${v.specifier}`);
  }
  Deno.exit(1);
}