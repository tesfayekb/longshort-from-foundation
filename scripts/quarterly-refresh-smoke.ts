#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * quarterly-refresh-smoke — FP-008.2 Step C / B checkpoint helper.
 *
 * Force-runs the longshort universe quarterly-refresh pipeline directly
 * against the orchestrator, bypassing the production edge function's
 * calendar-guard (which short-circuits on non-quarter-start days once
 * universe_refresh_log has any completed row).
 *
 * This is the operator's "force-run the pipeline" tool. It parallels the
 * existing scripts/replay-pass.ts precedent: a thin CLI shell that imports
 * the same production module the handler imports, wires the same context,
 * and invokes the same entry point — only without the cron handler's
 * calendar/auth surface. The production handler's guard is untouched.
 *
 * Usage:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   POLYGON_API_KEY=... \
 *   deno run --allow-net --allow-env scripts/quarterly-refresh-smoke.ts [--as-of=YYYY-MM-DD]
 *
 * Side effects:
 *   - Writes one universe_refresh_log row (outcome=completed | failed).
 *   - Writes one reconciliation_events row (universe_cross_check) via reconcile().
 *   - On outcome=completed: writes universe_membership + hard_exclusions rows.
 *
 * Removable after Phase 1 closure OR kept as the canonical force-run tool.
 */
import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { createQuarterlyRefreshOrchestrator } from '../supabase/functions/_shared/longshort-universe/refresh-jobs/quarterly-refresh-orchestrator.ts';
import type { RefreshExecutionContext } from '../supabase/functions/_shared/longshort-universe/refresh-jobs/types.ts';
import { SeededMembershipFetcher } from '../supabase/functions/_shared/longshort-universe/constituent-ingestion/seeded-membership-fetcher.ts';
import { WikipediaConstituentFetcher } from '../supabase/functions/_shared/longshort-universe/constituent-ingestion/wikipedia-constituent-fetcher.ts';
import { PolygonEnrichmentFetcher } from '../supabase/functions/_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts';
import { makeUniverseMembershipPersister } from '../supabase/functions/_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts';
import { makeHardExclusionsPersister } from '../supabase/functions/_shared/longshort-universe/refresh-jobs/hard-exclusions-persister.ts';
import { buildUniverseCrossCheckSpec } from '../supabase/functions/_shared/longshort-universe/constituent-ingestion/cross-check-spec.ts';
import { reconcile } from '../supabase/functions/_shared/longshort-reconciliation-lifecycle.ts';
import { makeMetricsEmitter } from '../supabase/functions/_shared/longshort-universe/health-monitoring/metrics-emitter.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`smoke: missing required env var ${name}`);
    Deno.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, { string: ['as-of'] });
  const asOf = args['as-of'] ? new Date(`${args['as-of']}T13:00:00Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    console.error(`smoke: invalid --as-of value: ${args['as-of']}`);
    Deno.exit(2);
  }

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const polygonApiKey = requireEnv('POLYGON_API_KEY');

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const ctx: RefreshExecutionContext = {
    polygonConstituents: new SeededMembershipFetcher(supabaseAdmin, DEFAULT_OPERATOR_ID),
    iSharesConstituents: new WikipediaConstituentFetcher(),
    polygonEnrichment: new PolygonEnrichmentFetcher(polygonApiKey),
    exclusionInput: {
      earnings_calendar: { entries: [], fetched_at: asOf },
      ma_actions: [],
      halt_history: [],
      locate_data: [],
      short_interest: [],
    },
    refreshLogPersister: {
      async insertStart(row) {
        const { data, error } = await supabaseAdmin
          .from('universe_refresh_log')
          .insert(row)
          .select('refresh_id')
          .single();
        if (error || !data) {
          throw new Error(`universe_refresh_log_insert_failed: ${error?.message ?? 'no data'}`);
        }
        return { refresh_id: (data as { refresh_id: string }).refresh_id };
      },
      async finalize(refresh_id, patch) {
        const { error } = await supabaseAdmin
          .from('universe_refresh_log')
          .update({
            refresh_completed_at: patch.refresh_completed_at,
            total_constituents_raw: patch.total_constituents_raw,
            total_post_filters: patch.total_post_filters,
            total_eligible_long: patch.total_eligible_long,
            total_eligible_short: patch.total_eligible_short,
            outcome: patch.outcome,
            failure_reason: patch.failure_reason,
            ishares_cross_check_snapshot: patch.ishares_cross_check_snapshot,
          })
          .eq('refresh_id', refresh_id);
        if (error) {
          throw new Error(`universe_refresh_log_finalize_failed: ${error.message}`);
        }
      },
      // Smoke script intentionally omits countConsecutiveFailures — the
      // circuit breaker is a production safeguard against runaway
      // automated retries; an operator running the smoke knowingly is the
      // intervention point the breaker is supposed to surface to.
    },
    universeMembershipPersister: makeUniverseMembershipPersister(supabaseAdmin),
    hardExclusionsPersister: makeHardExclusionsPersister(supabaseAdmin),
    crossCheck: async ({ operator_id, polygon_tickers, ishares_tickers, as_of }) => {
      const spec = buildUniverseCrossCheckSpec({ operator_id });
      const result = await reconcile(
        spec,
        async () => ({
          expected: { primary_tickers: new Set(polygon_tickers) },
          observed: { secondary_tickers: new Set(ishares_tickers) },
        }),
        as_of,
        // FP-008.4 Commit 9 / MIG-059 — smoke script reconciles real Polygon vs real
        // iShares data: 'live'. Liveness predicate scopes by call_name and excludes
        // 'universe_cross_check', so this row does not confuse the periodic-sweep rule.
        'live',
      );
      return { outcome: result.outcome };
    },
    metricsEmitter: makeMetricsEmitter({ supabaseAdmin }),
  };

  console.error(`smoke: invoking orchestrator with as_of=${asOf.toISOString()}`);
  const orch = createQuarterlyRefreshOrchestrator(ctx, DEFAULT_OPERATOR_ID);
  const result = await orch.run(asOf);

  // Fetch the cross-check event row this run wrote so the checkpoint
  // evidence is in-band.
  const { data: lastEvent, error: eventErr } = await supabaseAdmin
    .from('reconciliation_events')
    .select('event_id, call_name, outcome, expected_value, observed_value, divergence, tolerance, ts')
    .eq('call_name', 'universe_cross_check')
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log(JSON.stringify({
    refresh: {
      refresh_id: result.refresh_id,
      as_of_date: result.as_of_date,
      quarter_label: result.quarter_label,
      outcome: result.outcome,
      failure_reason: result.failure_reason,
      counts: {
        raw: result.total_constituents_raw,
        post_filters: result.total_post_filters,
        eligible_long: result.total_eligible_long,
        eligible_short: result.total_eligible_short,
      },
    },
    latest_cross_check_event: eventErr ? { read_error: eventErr.message } : lastEvent,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`smoke: fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    Deno.exit(1);
  });
}