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

// Only real ES module specifiers count:
//   * `import ... from '...'`
//   * `export ... from '...'`
//   * `import '...'` (side-effect)
//   * dynamic `import('...')`
// Comments and other prose that mention the substring `from '…'` must NOT
// trigger. We enforce this by (a) stripping line + block comments before
// scanning and (b) anchoring the regex to real import/export statement heads.
// Lookbehind keeps the anchor character out of the match, so match.index
// points at the `import`/`export` token itself — required for accurate
// line-number reporting.
const IMPORT_RE =
  /(?<=^|[\s;{}()])(?:import\s*(?:[\s\S]*?\s+from\s+|\(\s*)?|export\s+[\s\S]*?\s+from\s+)(['"])([^'"\n]+)\1/g;

/**
 * Strip `//` line comments and `/* … *\/` block comments from source text
 * without perturbing string-literal contents. This is deliberately naive
 * (no full JS tokenizer) but sufficient for the import-header scan: it
 * walks the text once, tracking whether the cursor sits inside a string,
 * a line comment, or a block comment.
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode: 'code' | 'sl' | 'dq' | 'bt' | 'line' | 'block' = 'code';
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") { mode = 'sl'; out += c; i++; continue; }
      if (c === '"') { mode = 'dq'; out += c; i++; continue; }
      if (c === '`') { mode = 'bt'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += '\n'; }
      i++; continue;
    }
    if (mode === 'block') {
      if (c === '*' && c2 === '/') { mode = 'code'; i += 2; continue; }
      if (c === '\n') out += '\n';
      i++; continue;
    }
    // string modes — pass through, honor escapes
    if (c === '\\' && i + 1 < n) { out += c + src[i + 1]; i += 2; continue; }
    if (mode === 'sl' && c === "'") { mode = 'code'; out += c; i++; continue; }
    if (mode === 'dq' && c === '"') { mode = 'code'; out += c; i++; continue; }
    if (mode === 'bt' && c === '`') { mode = 'code'; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

export function isBannedSupabaseSpecifier(specifier: string): boolean {
  return BANNED_SPECIFIER.test(specifier);
}

export function findViolationsInText(text: string, filePath: string): Violation[] {
  const violations: Violation[] = [];
  const stripped = stripComments(text);
  const lines = text.split('\n');
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(stripped)) !== null) {
    const specifier = match[2];
    if (!isBannedSupabaseSpecifier(specifier)) continue;
    // Compute 1-based line number in the original (unstripped) text by
    // counting newlines in the stripped prefix — stripComments preserves
    // newlines, so indices align.
    const lineIdx = stripped.slice(0, match.index).split('\n').length - 1;
    violations.push({
      file: filePath,
      line: lineIdx + 1,
      text: (lines[lineIdx] ?? '').trim(),
      specifier,
    });
  }
  return violations;
}

/** Back-compat shim: preserved for existing callers/tests. */
export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  return findViolationsInText(lines.join('\n'), filePath);
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  try {
    for await (const entry of walk(`${rootDir}/${SCAN_ROOT}`, { exts: ['.ts'], includeDirs: false })) {
      const relPath = entry.path.replace(`${rootDir}/`, '').replace(/^\.\//, '');
      const text = await Deno.readTextFile(entry.path);
      violations.push(...findViolationsInText(text, relPath));
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