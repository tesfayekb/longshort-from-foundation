#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env

/**
 * check-gate-evidence — mechanical attestation for the three canonical gates.
 *
 * Per ai-failure-modes Catalog #41 (Gate-Evidence Substitution) and its
 * §22.10 escalation clause: at the FOURTH firing of the #41 class, codify
 * mechanically rather than re-promise. Mechanical scanning of work-complete
 * report MARKDOWN for gate-evidence substitution is intractable (the defect
 * surfaces as omission / inference / referenced-baseline, all of which look
 * like "narrative writing" to a linter). What IS mechanical:
 *
 *   This script EXECUTES the three canonical gate commands at HEAD and
 *   prints a single ATTESTATION BLOCK that the work-complete report can
 *   paste verbatim. The work-complete-report contract (post-fourth-firing)
 *   now requires THAT block verbatim — no re-typed lines, no paraphrases,
 *   no inferences, no baselines-by-reference. If a Gates section does not
 *   carry a `check-gate-evidence` attestation block produced at the
 *   commit's HEAD SHA, the gates are evidence-incomplete and the work is
 *   not considered landed.
 *
 * The four canonical commands (in fixed order; ai-failure-modes #41;
 * Gate 2b added at ACT-197 / γ commit-2b to mechanically close the
 * scope-gap operator surfaced: Gate 2's `_shared/` filter narrows the
 * sweep to a subset of what CI Gate 11 executes, so any commit that
 * touches handler test files OUTSIDE `_shared/` (e.g. the
 * `longshort-insider-compute<X>/index_test.ts` rewires at γ commit-2,
 * where <X> is the empty cron handler or `-manual` suffix)
 * could have passed Gate 2 while a repo-wide failure went unattested.
 * Gate 2b mirrors CI Gate 11's verbatim invocation):
 *   1. deno run --allow-read scripts/check-wall-clock.ts
 *   2. cd supabase/functions && deno test --allow-net --allow-env --allow-read _shared/
 *   2b. cd supabase/functions && deno test --allow-net --allow-env --allow-read
 *       (repo-wide; mirrors CI Gate 11 — `.github/workflows/strong-evidence.yml`
 *       — verbatim, no `_shared/` filter)
 *   2c. deno test --allow-net --allow-env --allow-read scripts/
 *       (mirrors CI Gate 2 — `deno test … scripts/`. Added at ACT-207
 *       to close the third-firing Catalog #41 scope-gap surfaced by
 *       the F2.c REVISION: a `scripts/` test failed in CI under
 *       `check-supabase-client-specifier_test.ts` while every local
 *       gate read GREEN, because neither Gate 2 (`_shared/` filter)
 *       nor Gate 2b (`supabase/functions/` cwd) sweeps `scripts/`.
 *       Gate-coverage rule made explicit by this addition: gate
 *       coverage MUST include every test path CI runs; a CI-red on a
 *       test path not exercised by any local gate is a Catalog #41
 *       violation by construction.)
 *   3. npx eslint .
 *
 * For each command, the attestation captures: the literal command line, the
 * literal final non-empty line of combined stdout/stderr, and the exit code.
 * The block is bracketed with the HEAD SHA at execution time (via
 * `git rev-parse HEAD`) so paste-time tampering would visibly diverge from
 * subsequent `git log` reads.
 *
 * Usage:
 *   deno run --allow-read --allow-run --allow-env scripts/check-gate-evidence.ts
 *
 * Exit code:
 *   0 — all three gates exited 0 at HEAD (attestation printed; safe to paste)
 *   1 — at least one gate failed (attestation still printed for forensics;
 *       the failing gate's final line is captured verbatim — DO NOT paste
 *       a failing attestation block as if it were a passing one)
 *   2 — script-level error (e.g., command unavailable, git not initialized)
 *
 * Owner: governance (ai-failure-modes #41 fourth-firing escalation;
 * landed by ACT-184 in the FP-050 Phase 2 inventory-recovery commit).
 */

interface GateResult {
  readonly index: number;
  readonly command: string;
  readonly cwd: string;
  readonly finalLine: string;
  readonly exitCode: number;
  readonly durationMs: number;
}

interface GateSpec {
  readonly index: number;
  readonly displayCommand: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  /**
   * Canonical-summary regex. The attestation prefers the LAST line of
   * stdout that matches this pattern over the literal last line, because
   * `deno test` (stack-trace/import noise on completion) and `npx eslint`
   * (auto-fix footnote) both emit lines AFTER their canonical summary line.
   * If no line matches, falls back to the last non-empty line of combined
   * stdout+stderr — preserving the original behavior for unknown tools.
   */
  readonly canonicalSummary: RegExp;
}

const GATES: readonly GateSpec[] = [
  {
    index: 1,
    displayCommand: 'deno run --allow-read scripts/check-wall-clock.ts',
    argv: ['deno', 'run', '--allow-read', 'scripts/check-wall-clock.ts'],
    cwd: '.',
    canonicalSummary: /^check-wall-clock:\s/,
  },
  {
    index: 2,
    displayCommand:
      'cd supabase/functions && deno test --allow-net --allow-env --allow-read _shared/',
    argv: [
      'deno',
      'test',
      '--allow-net',
      '--allow-env',
      '--allow-read',
      '_shared/',
    ],
    cwd: 'supabase/functions',
    canonicalSummary: /^(ok|FAILED)\s*\|\s*\d+\s+passed\s*\|\s*\d+\s+failed/,
  },
  {
    // Gate 2b — repo-wide deno test (mirrors CI Gate 11). The trailing
    // 'b' is a display-only suffix; index is 2.5 so renderAttestation
    // sorts it adjacent to Gate 2. Closes the ACT-196 scope-gap: Gate 2
    // covers `_shared/`-only, Gate 2b covers what CI actually runs.
    index: 2.5,
    displayCommand:
      'cd supabase/functions && deno test --allow-net --allow-env --allow-read',
    argv: [
      'deno',
      'test',
      '--allow-net',
      '--allow-env',
      '--allow-read',
    ],
    cwd: 'supabase/functions',
    canonicalSummary: /^(ok|FAILED)\s*\|\s*\d+\s+passed\s*\|\s*\d+\s+failed/,
  },
  {
    // Gate 2c — scripts/ deno test (mirrors CI Gate 2 in
    // `.github/workflows/strong-evidence.yml`:
    //   `deno test --allow-read --allow-net --allow-env scripts/`).
    // Added at ACT-207 to close the third-firing Catalog #41 scope-gap
    // surfaced by F2.c's REVISION: `scripts/check-supabase-client-
    // specifier_test.ts` flagged an `esm.sh` import in
    // `supabase/functions/_shared/longshort-signals/insider-transactions/
    // insider-r2-concurrent-claim_test.ts` that Gate 2 and Gate 2b BOTH
    // missed — Gate 2 because the offending import path was in `_shared/`
    // but the FAILING test was in `scripts/`, Gate 2b because the
    // failing scanner lives in `scripts/`, outside `supabase/functions/`.
    // The structural fix: Gate 2c sweeps `scripts/` with NO scope filter
    // beyond cwd, so any `scripts/`-tree test failure surfaces in the
    // local attestation block before CI sees it.
    //
    // Display index 2.75 sorts between 2.5 (Gate 2b) and 3 (Gate 3);
    // `renderAttestation` renders this as the literal 'Gate 2c' label.
    index: 2.75,
    displayCommand:
      'deno test --allow-net --allow-env --allow-read scripts/',
    argv: [
      'deno',
      'test',
      '--allow-net',
      '--allow-env',
      '--allow-read',
      'scripts/',
    ],
    cwd: '.',
    canonicalSummary: /^(ok|FAILED)\s*\|\s*\d+\s+passed\s*\|\s*\d+\s+failed/,
  },
  {
    index: 3,
    displayCommand: 'npx eslint .',
    argv: ['npx', 'eslint', '.'],
    cwd: '.',
    canonicalSummary: /^✖\s*\d+\s+problems?\s*\(\d+\s+errors?,\s*\d+\s+warnings?\)$/,
  },
];

/**
 * Extract the canonical summary line. Prefers the LAST line of `stdout`
 * matching `canonicalSummary`; falls back to the LAST line of `stdout`
 * matching it; then to the last non-empty line of combined stdout+stderr.
 *
 * This per-gate canonicalization is the substitution-resistance core:
 * without it, `deno test` would attest "at file:///…/deno.json" (Deno's
 * import-provenance footer) and `npx eslint` would attest the auto-fix
 * footnote — both of which look passable but carry zero gate-pass
 * information, exactly the substitution shape #41 was created to prevent.
 */
/** Strip ANSI SGR escape codes so attested lines paste cleanly into markdown. */
function stripAnsi(s: string): string {
  // ESC [ ... letter — matches the SGR family Deno's test runner emits.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function extractFinalLine(combined: string, canonical?: RegExp): string {
  const clean = stripAnsi(combined);
  if (canonical) {
    const lines = clean.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trimEnd();
      if (canonical.test(trimmed)) return trimmed;
    }
  }
  const lines = clean.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trimEnd();
    if (trimmed.length > 0) return trimmed;
  }
  return '(no output)';
}

async function runGate(spec: GateSpec): Promise<GateResult> {
  const start = performance.now();
  const cmd = new Deno.Command(spec.argv[0], {
    args: spec.argv.slice(1),
    cwd: spec.cwd === '.' ? undefined : spec.cwd,
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout, stderr } = await cmd.output();
  const durationMs = Math.round(performance.now() - start);
  const decoder = new TextDecoder();
  const stdoutText = decoder.decode(stdout);
  const stderrText = decoder.decode(stderr);
  // Try stdout-only first (the canonical-summary lines all land on stdout
  // for the three current gates); fall back to combined.
  const stdoutLine = extractFinalLine(stdoutText, spec.canonicalSummary);
  const finalLine = stdoutLine === '(no output)'
    ? extractFinalLine(stdoutText + stderrText, spec.canonicalSummary)
    : stdoutLine;
  return {
    index: spec.index,
    command: spec.displayCommand,
    cwd: spec.cwd,
    finalLine,
    exitCode: code,
    durationMs,
  };
}

async function readHeadSha(): Promise<string> {
  const cmd = new Deno.Command('git', {
    args: ['rev-parse', 'HEAD'],
    stdout: 'piped',
    stderr: 'piped',
  });
  const { code, stdout } = await cmd.output();
  if (code !== 0) return '(git unavailable)';
  return new TextDecoder().decode(stdout).trim();
}

function renderAttestation(headSha: string, results: readonly GateResult[]): string {
  const lines: string[] = [];
  lines.push('=== check-gate-evidence ATTESTATION (paste verbatim) ===');
  lines.push(`HEAD: ${headSha}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  for (const r of results) {
    // Render Gate 2b / Gate 2c with literal letter suffixes the doc
    // comments use; index float is sort-order only.
    const label = r.index === 2.5 ? '2b' : r.index === 2.75 ? '2c' : String(r.index);
    lines.push(`Gate ${label}: ${r.command}`);
    lines.push(`  exit=${r.exitCode}  duration_ms=${r.durationMs}`);
    lines.push(`  final-line: ${r.finalLine}`);
    lines.push('');
  }
  const allGreen = results.every((r) => r.exitCode === 0);
  lines.push(`Verdict: ${allGreen ? 'ALL GREEN' : 'FAILURE — at least one gate non-zero'}`);
  lines.push('=== end attestation ===');
  return lines.join('\n');
}

if (import.meta.main) {
  const headSha = await readHeadSha();
  const results: GateResult[] = [];
  for (const spec of GATES) {
    const r = await runGate(spec);
    results.push(r);
  }
  const block = renderAttestation(headSha, results);
  // Block goes to stdout so consumers can capture it cleanly.
  console.log(block);
  const allGreen = results.every((r) => r.exitCode === 0);
  Deno.exit(allGreen ? 0 : 1);
}

export { extractFinalLine, GATES, renderAttestation, runGate };
export type { GateResult, GateSpec };