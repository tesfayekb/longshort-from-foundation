// ACT-563 + INC-129 co-landing — persist-shape drift-guard.
// Byte-scans supabase/functions/overshoot-detection-run/index.ts to prove:
//   (1) insertRunRow writes detector_version and refusal_class_counts columns;
//   (2) all three insertRunRow call sites pass detectorVersion +
//       emptyRefusalCounts() (no bare inserts that would silently omit
//       the new columns — MIG-165 columns are nullable but that would
//       defeat the whole "two stamps, two truths" purpose);
//   (3) finalizeRun completed-path passes tallyRefusalCounts(events);
//   (4) git_sha is still written unchanged (INC-126 pipeline stamp
//       stays honest — no masking).
import { assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('ACT-563: insertRunRow persists detector_version + refusal_class_counts', () => {
  assertStringIncludes(SRC, 'append_run_ids, detector_version, refusal_class_counts');
  assertStringIncludes(SRC, '${args.detectorVersion}');
  assertStringIncludes(SRC, '${sql.json(args.refusalCounts)}::jsonb');
});

Deno.test('INC-126: git_sha column write preserved (pipeline BUILD_SHA stamp stays honest)', () => {
  assertStringIncludes(SRC, 'correlation_id, git_sha,');
  assertStringIncludes(SRC, '${args.gitSha}');
});

Deno.test('ACT-563: every insertRunRow call site passes detectorVersion + refusalCounts', () => {
  const callSites = SRC.split('insertRunRow(sql, {').slice(1);
  // Three call sites: kill-switch no_op, job-disarmed no_op, running seed.
  if (callSites.length < 3) {
    throw new Error(`expected ≥3 insertRunRow call sites, found ${callSites.length}`);
  }
  for (const [i, chunk] of callSites.entries()) {
    const head = chunk.slice(0, chunk.indexOf('});'));
    if (!head.includes('detectorVersion: RATIFIED_DETECTOR_VERSION')) {
      throw new Error(`call site #${i} missing detectorVersion: RATIFIED_DETECTOR_VERSION`);
    }
    if (!head.includes('refusalCounts: emptyRefusalCounts()')) {
      throw new Error(`call site #${i} missing refusalCounts: emptyRefusalCounts()`);
    }
  }
});

Deno.test('INC-129: completed finalizeRun passes tallyRefusalCounts(events)', () => {
  assertStringIncludes(SRC, 'dryRun, tallyRefusalCounts(events));');
});