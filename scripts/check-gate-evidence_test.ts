/**
 * check-gate-evidence_test — exercises the pure helpers.
 *
 * The IO-bound `runGate` is not exercised here (it would re-execute the
 * three canonical gates, blowing the test-suite runtime and creating a
 * recursion concern when this test file is itself part of the Gate-2
 * `_shared/` sweep). The pure helpers — `extractFinalLine` and
 * `renderAttestation` — are the substitution-risk surfaces (a buggy
 * final-line extractor would silently mis-attest), so those are tested.
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  extractFinalLine,
  GATES,
  renderAttestation,
  type GateResult,
} from './check-gate-evidence.ts';

Deno.test('extractFinalLine — picks last non-empty line trimming trailing newline', () => {
  assertEquals(extractFinalLine('a\nb\nc\n'), 'c');
});

Deno.test('extractFinalLine — skips trailing blank lines', () => {
  assertEquals(extractFinalLine('ok | 985 passed | 0 failed (29s)\n\n\n'), 'ok | 985 passed | 0 failed (29s)');
});

Deno.test('extractFinalLine — handles CRLF line endings', () => {
  assertEquals(extractFinalLine('first\r\nsecond\r\n'), 'second');
});

Deno.test('extractFinalLine — empty input returns sentinel', () => {
  assertEquals(extractFinalLine(''), '(no output)');
});

Deno.test('extractFinalLine — whitespace-only input returns sentinel', () => {
  assertEquals(extractFinalLine('   \n\t\n'), '(no output)');
});

Deno.test('extractFinalLine — canonical regex prefers matching line over later non-matching trailing noise', () => {
  const denoTestOutput = [
    'running 100 tests',
    'ok | 985 passed | 0 failed (29s)',
    '    at file:///dev-server/supabase/functions/deno.json',
  ].join('\n');
  const denoSummary = /^(ok|FAILED)\s*\|\s*\d+\s+passed\s*\|\s*\d+\s+failed/;
  assertEquals(extractFinalLine(denoTestOutput, denoSummary), 'ok | 985 passed | 0 failed (29s)');
});

Deno.test('extractFinalLine — canonical regex prefers ESLint summary over auto-fix footnote', () => {
  const eslintOutput = [
    'some-file.tsx',
    '  10:5  warning  Unused variable',
    '✖ 15 problems (0 errors, 15 warnings)',
    '  0 errors and 6 warnings potentially fixable with the `--fix` option.',
  ].join('\n');
  const eslintSummary = /^✖\s*\d+\s+problems?\s*\(\d+\s+errors?,\s*\d+\s+warnings?\)$/;
  assertEquals(extractFinalLine(eslintOutput, eslintSummary), '✖ 15 problems (0 errors, 15 warnings)');
});

Deno.test('extractFinalLine — falls back to last non-empty when regex matches nothing', () => {
  assertEquals(extractFinalLine('foo\nbar\n', /no-match/), 'bar');
});

Deno.test('extractFinalLine — strips ANSI SGR escape codes from captured line', () => {
  const raw = '\x1b[32mok\x1b[0m | 985 passed | 0 failed \x1b[38;5;245m(29s)\x1b[0m';
  const denoSummary = /^(ok|FAILED)\s*\|\s*\d+\s+passed\s*\|\s*\d+\s+failed/;
  assertEquals(extractFinalLine(raw, denoSummary), 'ok | 985 passed | 0 failed (29s)');
});

Deno.test('GATES — exactly five canonical gates in fixed order (Gate 2b added at ACT-197; Gate 2c added at ACT-207)', () => {
  assertEquals(GATES.length, 5);
  assertEquals(GATES[0].index, 1);
  assertStringIncludes(GATES[0].displayCommand, 'check-wall-clock.ts');
  // Gate 2 — `_shared/`-scoped deno test.
  assertStringIncludes(GATES[1].displayCommand, 'deno test');
  assertStringIncludes(GATES[1].displayCommand, '_shared/');
  // Gate 2b — repo-wide deno test (CI Gate 11 parity). Critical
  // structural invariant: NO `_shared/` filter — Gate 2b's failure
  // mode is exactly what Gate 2 misses, so a regression that re-adds
  // the filter would re-open the ACT-196 scope-gap.
  assertEquals(GATES[2].index, 2.5);
  assertStringIncludes(GATES[2].displayCommand, 'deno test');
  assert(!GATES[2].displayCommand.includes('_shared/'),
    'Gate 2b MUST NOT carry a _shared/ filter — it mirrors CI Gate 11 verbatim');
  assert(!GATES[2].argv.includes('_shared/'),
    'Gate 2b argv MUST NOT carry _shared/');
  // Gate 2c — scripts/ deno test (CI Gate 2 parity). Critical
  // structural invariant: cwd is repo-root '.' and argv carries the
  // literal 'scripts/' path filter — NOT a `_shared/` filter, NOT
  // `supabase/functions` cwd. Gate 2c's failure mode is exactly what
  // BOTH Gate 2 and Gate 2b miss (a `scripts/`-tree test failing under
  // a CI sweep that no local gate exercises). A regression that drops
  // the `scripts/` argv OR moves cwd into `supabase/functions/` would
  // re-open the ACT-207 third-firing Catalog #41 scope-gap.
  assertEquals(GATES[3].index, 2.75);
  assertStringIncludes(GATES[3].displayCommand, 'deno test');
  assertStringIncludes(GATES[3].displayCommand, 'scripts/');
  assert(!GATES[3].displayCommand.includes('_shared/'),
    'Gate 2c MUST NOT carry a _shared/ filter');
  assert(GATES[3].argv.includes('scripts/'),
    'Gate 2c argv MUST include the literal scripts/ path filter');
  assertEquals(GATES[3].cwd, '.',
    'Gate 2c MUST run from repo-root cwd — moving into supabase/functions/ would skip scripts/');
  // Gate 3 — eslint.
  assertEquals(GATES[4].displayCommand, 'npx eslint .');
});

Deno.test('renderAttestation — includes HEAD, each gate final-line, and ALL GREEN verdict on all-zero', () => {
  const results: GateResult[] = [
    { index: 1, command: GATES[0].displayCommand, cwd: '.', finalLine: 'check-wall-clock: CLEAN — 0 violations', exitCode: 0, durationMs: 100 },
    { index: 2, command: GATES[1].displayCommand, cwd: 'supabase/functions', finalLine: 'ok | 985 passed | 0 failed (29s)', exitCode: 0, durationMs: 29000 },
    { index: 2.5, command: GATES[2].displayCommand, cwd: 'supabase/functions', finalLine: 'ok | 1254 passed | 0 failed (31s)', exitCode: 0, durationMs: 31000 },
    { index: 2.75, command: GATES[3].displayCommand, cwd: '.', finalLine: 'ok | 47 passed | 0 failed (2s)', exitCode: 0, durationMs: 2000 },
    { index: 3, command: GATES[4].displayCommand, cwd: '.', finalLine: '✖ 15 problems (0 errors, 15 warnings)', exitCode: 0, durationMs: 5000 },
  ];
  const block = renderAttestation('abc123', results);
  assertStringIncludes(block, 'HEAD: abc123');
  assertStringIncludes(block, 'Gate 1:');
  assertStringIncludes(block, 'Gate 2:');
  assertStringIncludes(block, 'Gate 2b:');
  assertStringIncludes(block, 'Gate 2c:');
  assertStringIncludes(block, 'Gate 3:');
  assertStringIncludes(block, 'check-wall-clock: CLEAN — 0 violations');
  assertStringIncludes(block, 'ok | 985 passed | 0 failed (29s)');
  assertStringIncludes(block, 'ok | 1254 passed | 0 failed (31s)');
  assertStringIncludes(block, 'ok | 47 passed | 0 failed (2s)');
  assertStringIncludes(block, '✖ 15 problems (0 errors, 15 warnings)');
  assertStringIncludes(block, 'Verdict: ALL GREEN');
});

Deno.test('renderAttestation — FAILURE verdict when any gate non-zero', () => {
  const results: GateResult[] = [
    { index: 1, command: GATES[0].displayCommand, cwd: '.', finalLine: 'check-wall-clock: CLEAN — 0 violations', exitCode: 0, durationMs: 100 },
    { index: 2, command: GATES[1].displayCommand, cwd: 'supabase/functions', finalLine: 'error: Test failed', exitCode: 1, durationMs: 29000 },
    { index: 2.5, command: GATES[2].displayCommand, cwd: 'supabase/functions', finalLine: 'ok | 1254 passed | 0 failed (31s)', exitCode: 0, durationMs: 31000 },
    { index: 2.75, command: GATES[3].displayCommand, cwd: '.', finalLine: 'ok | 47 passed | 0 failed (2s)', exitCode: 0, durationMs: 2000 },
    { index: 3, command: GATES[4].displayCommand, cwd: '.', finalLine: '✖ 15 problems (0 errors, 15 warnings)', exitCode: 0, durationMs: 5000 },
  ];
  const block = renderAttestation('abc123', results);
  assertStringIncludes(block, 'FAILURE');
});