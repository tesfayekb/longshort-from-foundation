#!/usr/bin/env -S deno run --allow-read

/**
 * check-verify-after-mutation — Gate 13 banned-pattern check for FP-008.4 Commit 7.
 *
 * FP-008.4 #8 — forward-binding sentinel locking the reconciliation lifecycle's
 * pre-mutation-gate invariant (CROSSWIND §7.5 / §7.6). In live code today, every
 * mutator-with-verify (cross-check) is pre-mutation and fail-loud; this sentinel
 * prevents Phase-5 order-execution code from introducing a verify-after-mutation
 * site without explicit operator review.
 *
 * Heuristic (per-file, line-ordering — best-effort static):
 *   Flag any in-scope file in which a state-mutating call (.insert( / .update( /
 *   .upsert( / .delete()  appears BEFORE a verify_* wrapper call or a reconcile(
 *   call on a later line. The check is per-file (not per-control-flow-path); it
 *   is intentionally over-eager and uses an override-annotation escape for the
 *   spec-sanctioned post-mutation verifies (verify_position / verify_lot_record
 *   per §7.6).
 *
 * Override annotation: place on (or immediately before) the verify_* / reconcile()
 * call line:
 *
 *   // gate-13-allow: post-mutation verify per §7.6 — <reason>
 *
 * Annotated call lines are excluded from the verify-call set used for flagging.
 * (This forces Phase-5 authors to explicitly mark sanctioned post-mutation verifies
 * with a docstring citation rather than letting them slip in silently.)
 *
 * Scope: `supabase/functions/` (edge functions + shared engine code). `src/` is
 * out-of-scope (the React app does not invoke verify_* directly; all verifier
 * dispatch happens server-side).
 *
 * Limitation surfaced: this is a file-level lexical check, not a control-flow
 * analysis. A mutation in branch A and a verify in branch B of the same file
 * will flag even though they cannot both execute. The override annotation is
 * the operator escape for legitimate post-mutation verifies AND for
 * unrelated-paths-in-the-same-file false positives. Both are deliberate: the
 * goal is a human-review checkpoint at Phase-5 introduction time, not a
 * machine-precise theorem prover.
 *
 * Exit code: 0 = clean; non-zero = violations.
 *
 * Per ADR-003 enforcement-as-scripts-not-prose. Sibling shape to
 * `check-eligibility-bypass.ts` / `check-wall-clock.ts` / `check-sentinel-patterns.ts`.
 */
import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface Violation {
  file: string;
  mutation_line: number;
  mutation_text: string;
  verify_line: number;
  verify_text: string;
}

const SCANNED_PATHS = ['supabase/functions'] as const;

const SCOPE_GLOB_PREFIXES = [
  'supabase/functions/longshort-',
  'supabase/functions/_shared/longshort-',
] as const;

const SELF_EXCLUDE = [
  'scripts/check-verify-after-mutation.ts',
  'scripts/check-verify-after-mutation_test.ts',
] as const;

/**
 * Mutation tokens — supabase-js method calls that mutate. Detected as `.insert(`
 * etc. on the comment/string-stripped line.
 */
const MUTATION_PATTERN = /\.(insert|update|upsert|delete)\(/;

/**
 * Verify-call tokens — verify_* wrapper invocations OR direct `reconcile(` calls.
 * Both flow through the canonical lifecycle entry point per DEC-034.1 clause (4).
 */
const VERIFY_PATTERN = /\b(verify[A-Z][A-Za-z]*\(|verify_[a-z_]+\(|reconcile\()/;

/**
 * Override annotation: matches `gate-13-allow:` on a line. Annotation on the
 * verify-call line OR the immediately preceding line both count (so callers can
 * put the annotation as a leading-line JSDoc-style comment).
 */
const OVERRIDE_ANNOTATION = /gate-13-allow:/;

export interface ScanState { inBlockComment: boolean; }

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

export function isInScope(filePath: string): boolean {
  return SCOPE_GLOB_PREFIXES.some((p) => filePath.startsWith(p));
}

export function isSanctioned(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  if (filePath.endsWith('.test.ts')) return true;
  // The lifecycle entrypoint IS the verify-call writer; mutating it would not be
  // a "verify-after-mutation" call site in the spec sense.
  if (filePath === 'supabase/functions/_shared/longshort-reconciliation-lifecycle.ts') return true;
  return false;
}

/**
 * Per-file scan. Returns at most one violation per (mutation, verify) pair
 * (the first mutation followed by the first un-annotated verify). Callers
 * doing per-control-flow analysis should add `// gate-13-allow:` annotations.
 */
export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const state: ScanState = { inBlockComment: false };
  const stripped: string[] = [];
  for (const line of lines) stripped.push(stripCommentsAndStringsWithState(line, state));

  // Pre-pass: collect mutation + verify line indices.
  const mutationLines: number[] = [];
  const verifyLines: number[] = [];
  for (let i = 0; i < stripped.length; i++) {
    if (MUTATION_PATTERN.test(stripped[i])) mutationLines.push(i);
    if (VERIFY_PATTERN.test(stripped[i])) {
      // Annotation on same line OR immediately preceding raw line.
      const onLine = OVERRIDE_ANNOTATION.test(lines[i]);
      const onPrev = i > 0 && OVERRIDE_ANNOTATION.test(lines[i - 1]);
      if (!onLine && !onPrev) verifyLines.push(i);
    }
  }

  if (mutationLines.length === 0 || verifyLines.length === 0) return [];

  // Flag the first mutation/verify pair where verify comes after mutation.
  const firstMutation = mutationLines[0];
  const verifyAfter = verifyLines.find((v) => v > firstMutation);
  if (verifyAfter === undefined) return [];

  return [{
    file: filePath,
    mutation_line: firstMutation + 1,
    mutation_text: lines[firstMutation].trim(),
    verify_line: verifyAfter + 1,
    verify_text: lines[verifyAfter].trim(),
  }];
}

export async function scanRepository(rootDir = '.'): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const scanPath of SCANNED_PATHS) {
    try {
      for await (
        const entry of walk(`${rootDir}/${scanPath}`, { exts: ['.ts', '.tsx'], includeDirs: false })
      ) {
        const relPath = entry.path.replace(`${rootDir}/`, '');
        if (!isInScope(relPath)) continue;
        if (isSanctioned(relPath)) continue;
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
    console.log('check-verify-after-mutation: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-verify-after-mutation: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(`    mutation L${v.mutation_line}: ${v.mutation_text}`);
    console.error(`    verify   L${v.verify_line}: ${v.verify_text}`);
    console.error(`    reason: verify-after-mutation violates CROSSWIND §7.5 pre-mutation-gate invariant.`);
    console.error(`    escape: add "// gate-13-allow: post-mutation verify per §7.6 — <reason>"`);
    console.error(`            on the verify call line (or immediately preceding) if this is a`);
    console.error(`            sanctioned post-fill verify (verify_position / verify_lot_record).`);
  }
  Deno.exit(1);
}