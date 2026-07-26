// Docs-as-code pin for run-r1-const.ts × estimator-assumptions.md §7-survivorship.
//
// PINNED BY: RULING 2026-07-26 (H-1/G-1 batch, receipt-grammar pin) +
// estimator-assumptions.md §7-survivorship "Docs-as-code pin" clause.
//
// Enforces:
//   (i) The §7-survivorship section exists in estimator-assumptions.md with
//       the three bound-report field names verbatim.
//   (ii) The R1 receipt writer (run-r1-const.ts) emits those same three
//        field names verbatim (INC-143 header law: no paraphrase).
//   (iii) The PACING DISCLOSURE anchor line from RULING 2026-07-26 appears
//         verbatim in the reconstructor header.

import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const ROOT = new URL('../', import.meta.url);
const read = async (rel: string) =>
  await Deno.readTextFile(new URL(rel, ROOT).pathname);

const BOUND_FIELDS = [
  'corpus_rows_total',
  'corpus_rows_excluded_by_universe',
  'corpus_rows_consumed',
] as const;

Deno.test('docs-as-code: §7-survivorship exists in estimator-assumptions.md with bound-field names', async () => {
  const md = await read('estimator-assumptions.md');
  assertStringIncludes(md, '## §7-survivorship — Universe basis honesty');
  for (const f of BOUND_FIELDS) {
    assertStringIncludes(md, f);
  }
});

Deno.test('docs-as-code: run-r1-const.ts receipt emits the three bound-field names verbatim', async () => {
  const src = await read('matrix/run-r1-const.ts');
  for (const f of BOUND_FIELDS) {
    // Must appear at least twice: once in the R1Receipt interface, once in
    // the runR1() emit path. A single occurrence would mean the interface
    // declares the field but the runner never populates it.
    const count = src.split(f).length - 1;
    assert(count >= 2, `expected ≥2 occurrences of '${f}' in run-r1-const.ts, got ${count}`);
  }
});

Deno.test('docs-as-code: reconstructor.ts carries the SHORT PACING DISCLOSURE header line', async () => {
  const src = await read('matrix/reconstructor.ts');
  // Anchor phrase from RULING 2026-07-26 — never paraphrase.
  assertStringIncludes(src, 'live-era operational ramp');
});

Deno.test('docs-as-code: config-matrix.md carries the SHORT-PACING + SHORT-TIER + SHORT-ENTRY rows', async () => {
  const md = await read('config-matrix.md');
  assertStringIncludes(md, 'SHORT pacing');
  assertStringIncludes(md, 'SHORT tier convention');
  assertStringIncludes(md, 'SHORT entry offset');
  assertStringIncludes(md, 'RULING 2026-07-26');
});