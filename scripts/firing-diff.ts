#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * firing-diff — Query helper for "new firing patterns since deploy" per §11.0.10 + §11.0.13.
 *
 * Per §11.0.10 + §12.5 evidence discipline: when supervisor or operator reviews a PR, the
 * canonical question is "did this PR introduce a new reconciliation firing pattern?" — answered
 * by querying reconciliation_events for events with:
 *
 *   ts > pr.deployed_at AND call_name NOT IN pre_pr_firing_calls
 *
 * CLI: `deno run --allow-net --allow-env scripts/firing-diff.ts --since=<ts> [--baseline-calls=<comma-list>]`
 * Mock mode: if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars absent, prints the query
 * that WOULD execute against reconciliation_events; does not require live DB access.
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';

export interface FiringDiffArgs {
  since: string;
  baselineCalls: string[];
}

export interface FiringDiffQuery {
  sql: string;
  params: Record<string, unknown>;
}

export function buildQuery(args: FiringDiffArgs): FiringDiffQuery {
  if (!args.since) {
    throw new Error('buildQuery: --since=<ts> is required');
  }
  const baselineFragment = args.baselineCalls.length > 0
    ? `AND call_name NOT IN (${args.baselineCalls.map((c) => `'${c.replace(/'/g, "''")}'`).join(', ')})`
    : '';
  const sql = `
SELECT call_name, COUNT(*) AS firing_count, MIN(ts) AS first_firing, MAX(ts) AS last_firing
FROM reconciliation_events
WHERE ts > $1::timestamptz
  ${baselineFragment}
GROUP BY call_name
ORDER BY firing_count DESC;
`.trim();
  return { sql, params: { since: args.since } };
}

export function parseArguments(argv: string[]): FiringDiffArgs {
  const parsed = parseArgs(argv, {
    string: ['since', 'baseline-calls'],
    default: { 'baseline-calls': '' },
  });
  return {
    since: parsed.since as string,
    baselineCalls: (parsed['baseline-calls'] as string)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

if (import.meta.main) {
  const args = parseArguments(Deno.args);
  const query = buildQuery(args);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    console.log('firing-diff: mock mode (SUPABASE_URL/KEY not set)');
    console.log('Query that would execute:');
    console.log(query.sql);
    console.log('Params:', JSON.stringify(query.params));
    Deno.exit(0);
  }

  const { supabaseAdmin } = await import('../supabase/functions/_shared/supabase-admin.ts');
  const { data, error } = await supabaseAdmin.rpc('execute_sql', {
    query_text: query.sql,
    query_params: query.params,
  });
  if (error) {
    console.error('firing-diff: query error', error);
    Deno.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}