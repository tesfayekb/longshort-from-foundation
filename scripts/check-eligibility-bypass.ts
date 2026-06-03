#!/usr/bin/env -S deno run --allow-read

/**
 * check-eligibility-bypass — Gate 12 banned-pattern check for FP-008.4 Commit 2.
 *
 * Per the Phase 1 closure addendum's eligibility caveat + MIG-055 +
 * `getEligibility()` wrapper: downstream business-logic consumers (signals,
 * sizing, execution — Phase 2+) MUST route reads of
 * `universe_membership.long_eligible` / `short_eligible` through the
 * `getEligibility()` wrapper, which gates on `assert_eligibility_complete`.
 *
 * Banned pattern: direct `.long_eligible` or `.short_eligible` token usage
 * outside the sanctioned allowlist below.
 *
 * Sanctioned files (the wrapper itself + upstream producer/persister/verifier
 * layers that are structurally upstream of, or are, the wrapper):
 *   - `supabase/functions/_shared/longshort-universe/get-eligibility.ts` (THE wrapper)
 *   - `supabase/functions/_shared/longshort-universe/hard-exclusions/`   (produces flags)
 *   - `supabase/functions/_shared/longshort-universe/refresh-jobs/`      (persists flags)
 *   - `supabase/functions/_shared/longshort-universe/verify-membership/` (FP-008.3 verifier — consolidates into wrapper in Phase 2)
 *   - `supabase/functions/longshort-universe-enrich-and-filter/`         (engine pipeline — writes via persister)
 *   - `src/features/longshort/services/replay/`                          (replay fixtures — test infrastructure)
 *   - All test files (`_test.ts`, `.test.ts`)                            (test fixtures reference flags directly)
 *   - This script + its test                                             (definition of the patterns)
 *
 * Scope: `supabase/functions/` + `src/features/longshort/`. Other paths are
 * out-of-scope (long-short is the only strategy with this surface today;
 * trading-panel platform code does not touch eligibility booleans).
 *
 * Exit code: 0 = clean; non-zero = violations.
 *
 * Per ADR-003 enforcement-as-scripts-not-prose. Sibling shape to
 * `check-wall-clock.ts` / `check-sentinel-patterns.ts` / `check-audit-writer-trap.ts`.
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
  'src/features/longshort/',
  'supabase/functions/longshort-',
  'supabase/functions/_shared/longshort-',
] as const;

/**
 * Sanctioned file/dir allowlist. Prefix-match — listing a directory sanctions
 * every file beneath it (mirrors check-wall-clock's SANCTIONED_CLOCK_FILES
 * pattern, generalized to directory prefixes for the producer/persister
 * layers).
 */
export const SANCTIONED_PREFIXES = [
  // THE wrapper — the only sanctioned downstream read path.
  'supabase/functions/_shared/longshort-universe/get-eligibility.ts',
  // Producer: applies §3.3 rules to compute long_eligible / short_eligible.
  'supabase/functions/_shared/longshort-universe/hard-exclusions/',
  // Persister: writes long_eligible / short_eligible to universe_membership.
  'supabase/functions/_shared/longshort-universe/refresh-jobs/',
  // FP-008.3 verifier — consolidates into wrapper in Phase 2 (DW-082 follow-up).
  'supabase/functions/_shared/longshort-universe/verify-membership/',
  // Engine pipeline — writes via persister; does not read flags for trading.
  'supabase/functions/longshort-universe-enrich-and-filter/',
  // Replay fixtures — test infrastructure for L2 synthetic generators.
  'src/features/longshort/services/replay/',
] as const;

const SELF_EXCLUDE = [
  'scripts/check-eligibility-bypass.ts',
  'scripts/check-eligibility-bypass_test.ts',
] as const;

const BANNED_PATTERNS: ReadonlyArray<{ pattern: RegExp; name: string; reason: string }> = [
  {
    name: 'long_eligible',
    pattern: /\blong_eligible\b/,
    reason:
      'FP-008.4 Commit 2 — direct .long_eligible access bypasses getEligibility() eligibility-caveat enforcement. Route reads through _shared/longshort-universe/get-eligibility.ts.',
  },
  {
    name: 'short_eligible',
    pattern: /\bshort_eligible\b/,
    reason:
      'FP-008.4 Commit 2 — direct .short_eligible access bypasses getEligibility() eligibility-caveat enforcement. Route reads through _shared/longshort-universe/get-eligibility.ts.',
  },
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

export function isInScope(filePath: string): boolean {
  return SCOPE_GLOB_PREFIXES.some((p) => filePath.startsWith(p));
}

export function isSanctioned(filePath: string): boolean {
  if (SELF_EXCLUDE.includes(filePath as typeof SELF_EXCLUDE[number])) return true;
  if (filePath.endsWith('_test.ts')) return true;
  if (filePath.endsWith('.test.ts')) return true;
  return SANCTIONED_PREFIXES.some((p) => filePath.startsWith(p));
}

export function findViolationsInLines(lines: string[], filePath: string): Violation[] {
  const violations: Violation[] = [];
  const state: ScanState = { inBlockComment: false };
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsAndStringsWithState(lines[i], state);
    for (const { pattern, name, reason } of BANNED_PATTERNS) {
      if (pattern.test(stripped)) {
        violations.push({
          file: filePath,
          line: i + 1,
          text: lines[i].trim(),
          pattern: name,
          reason,
        });
      }
    }
  }
  return violations;
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
    console.log('check-eligibility-bypass: CLEAN — 0 violations');
    Deno.exit(0);
  }
  console.error(`check-eligibility-bypass: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} [${v.pattern}] ${v.text}`);
    console.error(`    reason: ${v.reason}`);
  }
  Deno.exit(1);
}
