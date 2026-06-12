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

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
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

Deno.test('GATES — exactly three canonical gates in fixed order', () => {
  assertEquals(GATES.length, 3);
  assertEquals(GATES[0].index, 1);
  assertStringIncludes(GATES[0].displayCommand, 'check-wall-clock.ts');
  assertStringIncludes(GATES[1].displayCommand, 'deno test');
  assertStringIncludes(GATES[1].displayCommand, '_shared/');
  assertEquals(GATES[2].displayCommand, 'npx eslint .');
});

Deno.test('renderAttestation — includes HEAD, each gate final-line, and ALL GREEN verdict on all-zero', () => {
  const results: GateResult[] = [
    { index: 1, command: GATES[0].displayCommand, cwd: '.', finalLine: 'check-wall-clock: CLEAN — 0 violations', exitCode: 0, durationMs: 100 },
    { index: 2, command: GATES[1].displayCommand, cwd: 'supabase/functions', finalLine: 'ok | 985 passed | 0 failed (29s)', exitCode: 0, durationMs: 29000 },
    { index: 3, command: GATES[2].displayCommand, cwd: '.', finalLine: '✖ 15 problems (0 errors, 15 warnings)', exitCode: 0, durationMs: 5000 },
  ];
  const block = renderAttestation('abc123', results);
  assertStringIncludes(block, 'HEAD: abc123');
  assertStringIncludes(block, 'Gate 1:');
  assertStringIncludes(block, 'Gate 2:');
  assertStringIncludes(block, 'Gate 3:');
  assertStringIncludes(block, 'check-wall-clock: CLEAN — 0 violations');
  assertStringIncludes(block, 'ok | 985 passed | 0 failed (29s)');
  assertStringIncludes(block, '✖ 15 problems (0 errors, 15 warnings)');
  assertStringIncludes(block, 'Verdict: ALL GREEN');
});

Deno.test('renderAttestation — FAILURE verdict when any gate non-zero', () => {
  const results: GateResult[] = [
    { index: 1, command: GATES[0].displayCommand, cwd: '.', finalLine: 'check-wall-clock: CLEAN — 0 violations', exitCode: 0, durationMs: 100 },
    { index: 2, command: GATES[1].displayCommand, cwd: 'supabase/functions', finalLine: 'error: Test failed', exitCode: 1, durationMs: 29000 },
    { index: 3, command: GATES[2].displayCommand, cwd: '.', finalLine: '✖ 15 problems (0 errors, 15 warnings)', exitCode: 0, durationMs: 5000 },
  ];
  const block = renderAttestation('abc123', results);
  assertStringIncludes(block, 'FAILURE');
});