// LINT-AS-TEST — `build-fixture-2023q2.ts` MUST NOT import kernel or adapter
// code. The fixture builder is the "ground truth" side of the ACT-515 gate;
// if it imports kernel modules, it can no longer certify the kernel
// independently. The emitted hand-truth fixture header declares this
// invariant verbatim ("independence" field). This test grep-anchors it.
//
// Backing rule for INC-143 instance #3 corrective law — the fixture is
// authored WITHOUT kernel help; the gate then asserts kernel agreement
// against fixture-declared bytes.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const BUILDER_PATH = new URL('../build-fixture-2023q2.ts', import.meta.url);

Deno.test('LINT — builder imports zero kernel/adapter code', async () => {
  const src = await Deno.readTextFile(BUILDER_PATH);
  const importLines = src.split('\n').filter((l) => /^\s*import\b/.test(l));
  const violations: string[] = [];
  for (const l of importLines) {
    if (/from\s+['"]\.\.?\/kernel\//.test(l)) violations.push(l.trim());
    if (/from\s+['"]\.\.?\/adapters\//.test(l)) violations.push(l.trim());
    if (/kernel\/(types|clock|admit|size|mark|exit|equity|runner)\b/.test(l)) violations.push(l.trim());
  }
  assertEquals(
    violations.length,
    0,
    `builder imports kernel/adapter code (forbidden):\n  ${violations.join('\n  ')}`,
  );
});