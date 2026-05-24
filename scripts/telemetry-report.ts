#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * telemetry-report — Auto-generated reconciliation telemetry report per §11.0.10 + §11.0.13.
 *
 * Per §11.0.10 dashboard views:
 *   - Per-call firing rate over time
 *   - Outcome distribution per call
 *   - Unresolved system_bug events queue
 *   - Per-call ratio of expected_divergence_handled to total firings
 *
 * Output: Markdown tables to stdout.
 * CLI: `deno run --allow-net --allow-env scripts/telemetry-report.ts --since=<ts> [--call=<name>]`
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';

export interface TelemetryReportArgs {
  since: string;
  call?: string;
}

export interface TelemetryReportQueries {
  firingRate: string;
  outcomeDistribution: string;
  unresolvedBugs: string;
  expectedDivergenceRatio: string;
}

export function buildQueries(args: TelemetryReportArgs): TelemetryReportQueries {
  if (!args.since) {
    throw new Error('buildQueries: --since=<ts> is required');
  }
  const callFilter = args.call ? `AND call_name = '${args.call.replace(/'/g, "''")}'` : '';
  return {
    firingRate: `
SELECT call_name, DATE_TRUNC('day', ts) AS day, COUNT(*) AS firings
FROM reconciliation_events
WHERE ts > $1::timestamptz ${callFilter}
GROUP BY call_name, day ORDER BY day DESC, call_name;
`.trim(),
    outcomeDistribution: `
SELECT call_name, outcome, COUNT(*) AS count
FROM reconciliation_events
WHERE ts > $1::timestamptz ${callFilter}
GROUP BY call_name, outcome ORDER BY call_name, outcome;
`.trim(),
    unresolvedBugs: `
SELECT event_id, call_name, symbol, ts, notes
FROM reconciliation_events
WHERE outcome = 'system_bug' AND resolved_at IS NULL ${callFilter}
ORDER BY ts DESC;
`.trim(),
    expectedDivergenceRatio: `
SELECT call_name,
  COUNT(*) FILTER (WHERE outcome = 'expected_divergence_handled') AS expected_div,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'expected_divergence_handled') / NULLIF(COUNT(*), 0), 2) AS expected_div_pct
FROM reconciliation_events
WHERE ts > $1::timestamptz ${callFilter}
GROUP BY call_name ORDER BY expected_div_pct DESC NULLS LAST;
`.trim(),
  };
}

export function parseArguments(argv: string[]): TelemetryReportArgs {
  const parsed = parseArgs(argv, { string: ['since', 'call'] });
  return {
    since: parsed.since as string,
    call: parsed.call as string | undefined,
  };
}

export function renderMockReport(args: TelemetryReportArgs, queries: TelemetryReportQueries): string {
  return [
    `# Reconciliation Telemetry Report (mock mode)`,
    ``,
    `**Since:** ${args.since}`,
    args.call ? `**Call filter:** ${args.call}` : `**Call filter:** (all)`,
    ``,
    `## Queries that would execute`,
    ``,
    `### Firing rate over time`,
    '```sql', queries.firingRate, '```',
    ``,
    `### Outcome distribution per call`,
    '```sql', queries.outcomeDistribution, '```',
    ``,
    `### Unresolved system_bug events queue`,
    '```sql', queries.unresolvedBugs, '```',
    ``,
    `### Expected-divergence ratio per call`,
    '```sql', queries.expectedDivergenceRatio, '```',
    ``,
  ].join('\n');
}

if (import.meta.main) {
  const args = parseArguments(Deno.args);
  const queries = buildQueries(args);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    console.log(renderMockReport(args, queries));
    Deno.exit(0);
  }

  console.log('# Reconciliation Telemetry Report');
  console.log(`\n**Since:** ${args.since}\n`);
  console.log('Live query execution not implemented in 6.4 scope — sub-step 6.6 A1 baseline integration adds it.');
  console.log('Run with env vars unset to see the queries that would execute.');
  Deno.exit(0);
}