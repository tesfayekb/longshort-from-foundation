// @ts-nocheck — Deno test file.
/**
 * Tests for quarterly-refresh-orchestrator.ts — FP-008 sub-step 8.4 / ACT-108.
 *
 * Coverage:
 *   (a) happy path → outcome='completed' + counts populated;
 *   (b) atomicity-on-failure → outcome='failed' + universe_refresh_log
 *       finalize still called (R3 mitigation);
 *   (c) iShares cross-check snapshot captured (Guardrail 2 — does NOT flow
 *       into enrichment input);
 *   (d) operator_id threaded into the start-row payload;
 *   (e) regression sentinel — orchestrator does NOT reach into platform
 *       audit_logs (DEC-033 v4.1 audit-writer trap).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createQuarterlyRefreshOrchestrator } from './quarterly-refresh-orchestrator.ts';
import type { RefreshExecutionContext, RefreshLogPersister } from './types.ts';
import type {
  UniverseMembershipPersister,
  HardExclusionsPersister,
  CrossCheckFn,
} from './types.ts';
import type { UniverseConstituent } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';
import type { EnrichedConstituent } from '../enrichment/types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date(Date.UTC(2026, 3, 1)); // Apr 1 2026 — Q2 first trading day

function mkConstituent(ticker: string, source: 'polygon' | 'ishares'): UniverseConstituent {
  return { index: 'sp500', ticker, name: ticker, source, fetched_at: AS_OF };
}

function mkEnriched(ticker: string): EnrichedConstituent {
  return {
    ...mkConstituent(ticker, 'polygon'),
    avg_daily_dollar_volume: 50_000_000,
    share_price: 100,
    market_cap: 5_000_000_000,
    listing_date: '2010-01-04',
    is_adr: false,
    is_reit: false,
  };
}

function makePersister() {
  const calls: { kind: 'start' | 'finalize'; payload: unknown }[] = [];
  const persister: RefreshLogPersister = {
    async insertStart(row) {
      calls.push({ kind: 'start', payload: row });
      return { refresh_id: 'refresh-uuid-stub' };
    },
    async finalize(refresh_id, patch) {
      calls.push({ kind: 'finalize', payload: { refresh_id, ...patch } });
    },
  };
  return { persister, calls };
}

function makeUniverseMembershipPersister() {
  const persisted: unknown[] = [];
  const persister: UniverseMembershipPersister = {
    async persist(input) { persisted.push(input); },
  };
  return { persister, persisted };
}

function makeHardExclusionsPersister() {
  const persisted: unknown[] = [];
  const persister: HardExclusionsPersister = {
    async persist(input) { persisted.push(input); },
  };
  return { persister, persisted };
}

function makeCrossCheck(outcome: 'false_positive_within_tolerance' | 'failure_handled' | 'failure_escalated' | 'expected_divergence_handled' | 'system_bug' = 'false_positive_within_tolerance') {
  const calls: unknown[] = [];
  const fn: CrossCheckFn = async (input) => {
    calls.push(input);
    return { outcome };
  };
  return { fn, calls };
}

function makeContext(opts: {
  polygonReturnsNull?: boolean;
  enrichmentThrows?: boolean;
  crossCheckOutcome?: 'false_positive_within_tolerance' | 'failure_handled' | 'failure_escalated' | 'expected_divergence_handled' | 'system_bug';
} = {}) {
  const { persister, calls } = makePersister();
  const ump = makeUniverseMembershipPersister();
  const hxp = makeHardExclusionsPersister();
  const cc = makeCrossCheck(opts.crossCheckOutcome ?? 'false_positive_within_tolerance');
  const polyTickers = ['AAA', 'BBB', 'CCC'];
  const sharesTickers = ['AAA', 'XXX'];
  const ctx: RefreshExecutionContext = {
    polygonConstituents: {
      async fetchConstituents() {
        if (opts.polygonReturnsNull) return null;
        return polyTickers.map((t) => mkConstituent(t, 'polygon'));
      },
    },
    iSharesConstituents: {
      async fetchConstituents() {
        return sharesTickers.map((t) => mkConstituent(t, 'ishares'));
      },
    },
    polygonEnrichment: {
      async enrich(constituents) {
        if (opts.enrichmentThrows) throw new Error('polygon_enrichment_500');
        return constituents.map((c) => mkEnriched(c.ticker));
      },
    },
    exclusionInput: {
      earnings_calendar: { entries: [], fetched_at: AS_OF },
      ma_actions: [],
      halt_history: [],
      locate_data: [],
      short_interest: [],
    },
    refreshLogPersister: persister,
    universeMembershipPersister: ump.persister,
    hardExclusionsPersister: hxp.persister,
    crossCheck: cc.fn,
  };
  return { ctx, calls, umpPersisted: ump.persisted, hxpPersisted: hxp.persisted, ccCalls: cc.calls };
}

Deno.test('happy path → outcome=completed; counts populated; eligible returned + persisted', async () => {
  const { ctx, calls, umpPersisted, hxpPersisted } = makeContext();
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);

  assertEquals(result.outcome, 'completed');
  assertEquals(result.as_of_date, '2026-04-01');
  assertEquals(result.quarter_label, 'Q2_2026');
  // 3 polygon tickers × 2 indices (sp500+sp400) = 6 raw constituents
  assertEquals(result.total_constituents_raw, 6);
  assertEquals(result.total_post_filters, 6);
  assertEquals(result.total_eligible_long, 6);
  assertEquals(result.total_eligible_short, 6);
  assertEquals(result.eligible.length, 6);
  assertEquals(result.failure_reason, null);

  // persister called: start + finalize, in that order
  assertEquals(calls.length, 2);
  assertEquals(calls[0].kind, 'start');
  assertEquals(calls[1].kind, 'finalize');
  const start = calls[0].payload as { operator_id: string; quarter_label: string };
  assertEquals(start.operator_id, OPERATOR_ID);
  assertEquals(start.quarter_label, 'Q2_2026');

  // Surface 5 Option q — universe_membership persistence invoked once
  // after pipeline success; no firings → hard_exclusions persister NOT invoked.
  assertEquals(umpPersisted.length, 1);
  assertEquals(hxpPersisted.length, 0);
});

Deno.test('atomicity-on-failure → outcome=failed; finalize still called with reason', async () => {
  const { ctx, calls } = makeContext({ enrichmentThrows: true });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);

  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'polygon_enrichment_500');
  // R3 mitigation: finalize STILL emitted (prior quarter intact; current row marked failed)
  assertEquals(calls.length, 2);
  const finalize = calls[1].payload as { outcome: string; failure_reason: string | null };
  assertEquals(finalize.outcome, 'failed');
  assertEquals(finalize.failure_reason, 'polygon_enrichment_500');
});

Deno.test('polygon null return → outcome=failed; no pipeline progression', async () => {
  const { ctx } = makeContext({ polygonReturnsNull: true });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'polygon_constituent_fetch_returned_null');
  assertEquals(result.total_constituents_raw, 0);
});

Deno.test('iShares snapshot captured separately — does NOT flow into enrichment (Guardrail 2)', async () => {
  const { ctx, calls } = makeContext();
  // Spy on enrichment input
  let enrichInputSources: string[] = [];
  const origEnrich = ctx.polygonEnrichment.enrich.bind(ctx.polygonEnrichment);
  ctx.polygonEnrichment.enrich = async (constituents, ts) => {
    enrichInputSources = constituents.map((c) => c.source);
    return origEnrich(constituents, ts);
  };
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);

  assert(enrichInputSources.length > 0);
  assert(enrichInputSources.every((s) => s === 'polygon'),
    'Guardrail 2: enrichment receives ONLY polygon-sourced constituents');
  // iShares snapshot still captured on the result
  assertEquals(result.ishares_cross_check.length, 4); // 2 per index × 2 indices

  const finalize = calls[1].payload as {
    ishares_cross_check_snapshot: { tickers: string[] };
  };
  assertEquals(finalize.ishares_cross_check_snapshot.tickers.length, 4);
});

// ============================================================================
// FP-008 sub-step 8.8 / ACT-114 — cross-check (step 2b) test coverage.
// Surface 4 Option a (OUTSIDE persistence, BEFORE enrichment) + Surface 5
// Option q (conditional abort on failure_escalated/system_bug).
// ============================================================================

Deno.test('cross-check pass path (false_positive_within_tolerance) → pipeline + persistence executes', async () => {
  const { ctx, ccCalls, umpPersisted } = makeContext({ crossCheckOutcome: 'false_positive_within_tolerance' });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
  assertEquals(ccCalls.length, 1);
  assertEquals(umpPersisted.length, 1);
});

Deno.test('cross-check expected_divergence_handled → proceed (full pipeline + persistence)', async () => {
  const { ctx, umpPersisted } = makeContext({ crossCheckOutcome: 'expected_divergence_handled' });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
  assertEquals(umpPersisted.length, 1);
});

Deno.test('cross-check failure_handled → proceed (logged divergence; persistence still happens)', async () => {
  const { ctx, umpPersisted } = makeContext({ crossCheckOutcome: 'failure_handled' });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
  assertEquals(umpPersisted.length, 1);
});

Deno.test('cross-check failure_escalated → ABORT (Surface 5 Option q); persistence NOT called', async () => {
  const { ctx, calls, umpPersisted, hxpPersisted } = makeContext({ crossCheckOutcome: 'failure_escalated' });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'cross_check_failure_escalated');
  // No persistence side-effects on abort.
  assertEquals(umpPersisted.length, 0);
  assertEquals(hxpPersisted.length, 0);
  // refresh-log finalize STILL emitted (R3 atomicity).
  const finalize = calls[1].payload as { outcome: string; failure_reason: string | null };
  assertEquals(finalize.outcome, 'failed');
  assertEquals(finalize.failure_reason, 'cross_check_failure_escalated');
});

Deno.test('cross-check system_bug → ABORT; failure_reason=cross_check_system_bug', async () => {
  const { ctx, calls, umpPersisted } = makeContext({ crossCheckOutcome: 'system_bug' });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'cross_check_system_bug');
  assertEquals(umpPersisted.length, 0);
  const finalize = calls[1].payload as { outcome: string; failure_reason: string | null };
  assertEquals(finalize.failure_reason, 'cross_check_system_bug');
});

Deno.test('AC-18 regression sentinel — orchestrator does NOT write reconciliation_events directly', async () => {
  // The orchestrator file MUST NOT contain a direct `.from('reconciliation_events')` insert.
  const src = await Deno.readTextFile(
    new URL('./quarterly-refresh-orchestrator.ts', import.meta.url),
  );
  assert(!src.includes("from('reconciliation_events')"),
    'AC-18: orchestrator must not write reconciliation_events directly; reconcile() owns the write');
});