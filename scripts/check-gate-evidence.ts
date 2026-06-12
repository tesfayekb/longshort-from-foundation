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
 * The three canonical commands (in fixed order; ai-failure-modes #41):
 *   1. deno run --allow-read scripts/check-wall-clock.ts
 *   2. cd supabase/functions && deno test --allow-net --allow-env --allow-read _shared/
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
function extractFinalLine(combined: string, canonical?: RegExp): string {
  if (canonical) {
    const lines = combined.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trimEnd();
      if (canonical.test(trimmed)) return trimmed;
    }
  }
  const lines = combined.split(/\r?\n/);
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
    lines.push(`Gate ${r.index}: ${r.command}`);
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