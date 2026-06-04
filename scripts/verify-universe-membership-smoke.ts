#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * verify-universe-membership-smoke — FP-008.2 Step B checkpoint helper.
 *
 * Mirrors the scripts/quarterly-refresh-smoke.ts precedent: a thin CLI
 * shell that wires the live UniverseMembershipFetcher (universe_membership
 * + hard_exclusions reads) into the verify_universe_membership reconciler
 * (#10 per CROSSWIND §11.0.7) for a handful of symbols, then prints the
 * resulting reconciliation_events rows so the operator can confirm
 *
 *   - the verifier executes end-to-end against the seeded universe (Step C
 *     output),
 *   - no `system_bug` outcomes fire (i.e. the fetcher + reconciler wiring
 *     is healthy),
 *   - consistent in/out names classify as
 *     `false_positive_within_tolerance` (no divergence), and
 *   - a known-absent ticker (FAKE123) handled with internal_in_universe
 *     =false is also a consistent-exclusion (no firing).
 *
 * This script does NOT modify production state beyond the
 * reconciliation_events rows the reconciler itself persists. It is
 * intentionally narrow: 5 in-universe symbols (drawn live from
 * universe_membership) + 1 known-not-in-universe sentinel.
 *
 * Usage:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   deno run --allow-net --allow-env scripts/verify-universe-membership-smoke.ts [--as-of=YYYY-MM-DD]
 */
import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { createUniverseMembershipFetcher } from '../supabase/functions/_shared/longshort-universe/verify-membership/universe-membership-fetcher.ts';
import { verifyUniverseMembership } from '../supabase/functions/_shared/longshort-verifiers/verify_universe_membership.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const NOT_IN_UNIVERSE_SENTINEL = 'FAKE123';
const IN_UNIVERSE_SAMPLE_SIZE = 5;

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`smoke: missing required env var ${name}`);
    Deno.exit(2);
  }
  return v;
}

function isoDateOf(ts: Date): string {
  const y = ts.getUTCFullYear();
  const m = String(ts.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ts.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Find the most recent as_of_date in universe_membership at-or-before
  // the requested asOf — the verifier reads exact-date rows, so we align
  // the run to the seeded universe rather than today's calendar date.
  const asOfIso = isoDateOf(asOf);
  const { data: latestRow, error: latestErr } = await supabaseAdmin
    .from('universe_membership')
    .select('as_of_date')
    .eq('operator_id', DEFAULT_OPERATOR_ID)
    .lte('as_of_date', asOfIso)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) {
    console.error(`smoke: universe_membership lookup failed: ${latestErr.message}`);
    Deno.exit(1);
  }
  if (!latestRow) {
    console.error(`smoke: no universe_membership rows at-or-before ${asOfIso} — run quarterly-refresh-smoke first`);
    Deno.exit(1);
  }
  const seededAsOf = (latestRow as { as_of_date: string }).as_of_date;
  const verifyTs = new Date(`${seededAsOf}T13:00:00Z`);

  // Sample 5 in-universe symbols (deterministic order — alphabetical).
  const { data: sampleRows, error: sampleErr } = await supabaseAdmin
    .from('universe_membership')
    .select('ticker')
    .eq('operator_id', DEFAULT_OPERATOR_ID)
    .eq('as_of_date', seededAsOf)
    .order('ticker', { ascending: true })
    .limit(IN_UNIVERSE_SAMPLE_SIZE);
  if (sampleErr || !sampleRows || sampleRows.length === 0) {
    console.error(`smoke: universe_membership sample failed: ${sampleErr?.message ?? 'empty'}`);
    Deno.exit(1);
  }
  const inUniverseSymbols = sampleRows.map((r) => (r as { ticker: string }).ticker);

  const fetcher = createUniverseMembershipFetcher({
    supabaseAdmin,
    operator_id: DEFAULT_OPERATOR_ID,
  });

  type CallReport = {
    symbol: string;
    side: 'long' | 'short';
    internal_in_universe: boolean;
    expected_outcome: string;
    outcome: string;
    matches_expected: boolean;
    event_id: string | null;
    action_taken: string | null;
    divergence: unknown;
  };

  const reports: CallReport[] = [];

  // FP-008.3 side-aware contract: long lookups against the in-universe
  // sample MUST classify clean (false_positive_within_tolerance) — the long
  // book is unaffected by §3.3d short-only htb_no_locate typed-absence
  // default-firings that dominate Phase-1 hard_exclusions until broker
  // locate integration lands at Phase 5+.
  for (const symbol of inUniverseSymbols) {
    const r = await verifyUniverseMembership(
      { symbol, side: 'long', operator_id: DEFAULT_OPERATOR_ID, internal_in_universe: true },
      fetcher,
      verifyTs,
      'live',
    );
    reports.push({
      symbol,
      side: 'long',
      internal_in_universe: true,
      expected_outcome: 'false_positive_within_tolerance',
      outcome: r.outcome,
      matches_expected: r.outcome === 'false_positive_within_tolerance',
      event_id: r.event_id ?? null,
      action_taken: r.action_taken ?? null,
      divergence: r.divergence,
    });
  }

  // Short lookups against the same names MUST classify as failure_handled
  // (count-based, non-material) with §3.3d htb_no_locate in the
  // exclusion_reasons — this is the correct surfacing of "shorts are
  // blocked because no locate provider is configured" pending Phase 5+.
  for (const symbol of inUniverseSymbols) {
    const r = await verifyUniverseMembership(
      { symbol, side: 'short', operator_id: DEFAULT_OPERATOR_ID, internal_in_universe: true },
      fetcher,
      verifyTs,
      'live',
    );
    reports.push({
      symbol,
      side: 'short',
      internal_in_universe: true,
      expected_outcome: 'failure_handled',
      outcome: r.outcome,
      matches_expected: r.outcome === 'failure_handled',
      event_id: r.event_id ?? null,
      action_taken: r.action_taken ?? null,
      divergence: r.divergence,
    });
  }

  // Sentinel: internal cache says not-in-universe AND observed not-in-universe.
  // Both sides → consistent exclusion → false_positive_within_tolerance.
  for (const side of ['long', 'short'] as const) {
    const r = await verifyUniverseMembership(
      {
        symbol: NOT_IN_UNIVERSE_SENTINEL,
        side,
        operator_id: DEFAULT_OPERATOR_ID,
        internal_in_universe: false,
      },
      fetcher,
      verifyTs,
      'live',
    );
    reports.push({
      symbol: NOT_IN_UNIVERSE_SENTINEL,
      side,
      internal_in_universe: false,
      expected_outcome: 'false_positive_within_tolerance',
      outcome: r.outcome,
      matches_expected: r.outcome === 'false_positive_within_tolerance',
      event_id: r.event_id ?? null,
      action_taken: r.action_taken ?? null,
      divergence: r.divergence,
    });
  }

  const systemBugs = reports.filter((r) => r.outcome === 'system_bug');
  const failuresEscalated = reports.filter((r) => r.outcome === 'failure_escalated');
  const offExpected = reports.filter((r) => !r.matches_expected);

  // Pull the persisted reconciliation_events rows for this run so the
  // checkpoint evidence is in-band.
  const eventIds = reports.map((r) => r.event_id).filter((id): id is string => id !== null);
  let persistedEvents: unknown = null;
  let persistedErr: string | null = null;
  if (eventIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('reconciliation_events')
      .select('event_id, call_name, symbol, outcome, failure_action, divergence, ts')
      .in('event_id', eventIds)
      .order('ts', { ascending: true });
    if (error) {
      persistedErr = error.message;
    } else {
      persistedEvents = data;
    }
  }

  console.log(JSON.stringify({
    as_of_date_resolved: seededAsOf,
    verify_ts: verifyTs.toISOString(),
    in_universe_symbols: inUniverseSymbols,
    not_in_universe_symbol: NOT_IN_UNIVERSE_SENTINEL,
    invariants: {
      contract: 'FP-008.3 side-aware verify_universe_membership',
      expected_outcomes: {
        in_universe_long: 'false_positive_within_tolerance',
        in_universe_short: 'failure_handled (3.3d htb_no_locate)',
        not_in_universe_either_side: 'false_positive_within_tolerance',
      },
      total_calls: reports.length,
      system_bug_count: systemBugs.length,
      failure_escalated_count: failuresEscalated.length,
      off_expected_outcome_count: offExpected.length,
      off_expected_outcome_calls: offExpected.map((r) => ({
        symbol: r.symbol,
        side: r.side,
        expected: r.expected_outcome,
        actual: r.outcome,
      })),
      all_pass:
        systemBugs.length === 0 &&
        failuresEscalated.length === 0 &&
        offExpected.length === 0,
    },
    spec_notes: {
      outcome_enum_overloading:
        "`false_positive_within_tolerance` in CROSSWIND §11.0.10 / MIG-043 labels (a) consistent-inclusion clean match, (b) consistent-exclusion clean match, and (c) in-tolerance numeric divergence. DRIFT-class spec smell; non-blocking; tracked in Step E follow-ups.",
      short_side_htb_default:
        '§3.3d `htb_no_locate` fires for every constituent when `locate_data` is empty (typed-absence per §2 axiom 3). This is correct per spec; broker locate integration arrives at Phase 5+. Until then, all short verifications surface `failure_handled` with `3.3d` in exclusion_reasons.',
    },
    call_reports: reports,
    persisted_reconciliation_events: persistedErr
      ? { read_error: persistedErr }
      : persistedEvents,
  }, null, 2));

  if (systemBugs.length > 0 || failuresEscalated.length > 0 || offExpected.length > 0) {
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`smoke: fatal: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    Deno.exit(1);
  });
}