import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { detectViolations } from './check-audit-writer-trap.ts';

Deno.test("(1) Real import statement → violation", () => {
  const src = `import { logAuditEvent } from '_shared/audit.ts';\n`;
  const violations = detectViolations(src, 'test.ts');
  assertEquals(violations.length, 1);
  assertEquals(violations[0].line, 1);
  assertEquals(violations[0].reason, 'import-statement');
});

Deno.test("(2) Real call site → violation", () => {
  const src = `await logAuditEvent({ action: 'test' });\n`;
  const violations = detectViolations(src, 'test.ts');
  assertEquals(violations.length, 1);
  assertEquals(violations[0].line, 1);
  assertEquals(violations[0].reason, 'call-site');
});

Deno.test("(3) FINDING-001 regression: JSDoc continuation quoting import statement → NO violation", () => {
  const src = ` *   - import logAuditEvent from _shared/audit.ts (audit-writer trap — engine writes to\n`;
  const violations = detectViolations(src, 'lifecycle.ts');
  assertEquals(violations.length, 0,
    `FINDING-001 regression: expected 0 violations on JSDoc continuation; got ${violations.length}`);
});

Deno.test("(4) Line comment with `import logAuditEvent` text → NO violation", () => {
  const src = `// NEVER import logAuditEvent — audit-writer trap is closed.\n`;
  const violations = detectViolations(src, 'test.ts');
  assertEquals(violations.length, 0);
});

Deno.test("(5) Block comment quoting symbol → NO violation", () => {
  const src = `/* The symbol logAuditEvent is banned per DEC-033 v4.1. */\n`;
  const violations = detectViolations(src, 'test.ts');
  assertEquals(violations.length, 0);
});

Deno.test("(6) Multi-line import containing symbol → violation", () => {
  const src = `import {\n  someFunc,\n  logAuditEvent,\n} from '_shared/audit.ts';\n`;
  const violations = detectViolations(src, 'test.ts');
  assert(violations.length >= 1,
    `Expected ≥1 violation on multi-line import; got ${violations.length}`);
  assertEquals(violations[0].reason, 'multi-line import containing logAuditEvent');
});

Deno.test("(7) Re-export → violation", () => {
  const src = `export { logAuditEvent } from '_shared/audit.ts';\n`;
  const violations = detectViolations(src, 'test.ts');
  assertEquals(violations.length, 1);
  assertEquals(violations[0].reason, 'export-statement');
});

Deno.test("(8) Symbol name in string literal → NO violation (heuristic)", () => {
  const src = `const banned = 'logAuditEvent';\n`;
  const violations = detectViolations(src, 'test.ts');
  assertEquals(violations.length, 0);
});