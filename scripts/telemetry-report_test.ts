import { assertEquals, assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildQueries, parseArguments, renderMockReport } from './telemetry-report.ts';

Deno.test("buildQueries: --since required", () => {
  assertThrows(() => buildQueries({ since: '' }), Error, '--since=<ts> is required');
});

Deno.test("buildQueries: includes all 4 dashboard views per §11.0.10", () => {
  const q = buildQueries({ since: '2026-05-22T00:00:00Z' });
  assert(q.firingRate.includes('DATE_TRUNC'));
  assert(q.outcomeDistribution.includes('outcome'));
  assert(q.unresolvedBugs.includes("outcome = 'system_bug'"));
  assert(q.expectedDivergenceRatio.includes('expected_divergence_handled'));
});

Deno.test("renderMockReport: produces Markdown with all 4 query sections", () => {
  const args = { since: '2026-05-22T00:00:00Z' };
  const queries = buildQueries(args);
  const md = renderMockReport(args, queries);
  assert(md.includes('# Reconciliation Telemetry Report'));
  assert(md.includes('### Firing rate'));
  assert(md.includes('### Outcome distribution'));
  assert(md.includes('### Unresolved system_bug'));
  assert(md.includes('### Expected-divergence ratio'));
});