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
import type { RefreshExecutionContext, RefreshLogPersister, RefreshOutcome } from './types.ts';
import { STREAK_FAILURE_OUTCOMES } from './types.ts';
import type {
  UniverseMembershipPersister,
  HardExclusionsPersister,
  CrossCheckFn,
} from './types.ts';
import type { MetricsEmitter, RefreshMetricsInput } from '../health-monitoring/metrics-emitter.ts';
import type { UniverseConstituent } from '../../longshort-universe-interfaces.ts';
import type { EnrichedConstituent } from '../enrichment/types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date(Date.UTC(2026, 3, 1)); // Apr 1 2026 — Q2 first trading day

function mkConstituent(
  ticker: string,
  source: 'polygon' | 'ishares',
  gics_sector: string | null = null,
): UniverseConstituent {
  return { index: 'sp500', ticker, name: ticker, source, fetched_at: AS_OF, gics_sector };
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
    // FP-008.4 Commit 4 / D3 — `countConsecutiveFailures` is now required
    // on `RefreshLogPersister`. Base stub returns 0 (no prior failures) so
    // the breaker block is a no-op for all non-breaker test cases.
    async countConsecutiveFailures(_limit: number) {
      return 0;
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

function makeMetricsEmitter(opts: { throws?: boolean } = {}) {
  const calls: RefreshMetricsInput[] = [];
  const emitter: MetricsEmitter = {
    async emitRefreshMetrics(input) {
      calls.push(input);
      if (opts.throws) throw new Error('metrics_update_failed');
    },
  };
  return { emitter, calls };
}

function makeContext(opts: {
  polygonReturnsNull?: boolean;
  enrichmentThrows?: boolean;
  crossCheckOutcome?: 'false_positive_within_tolerance' | 'failure_handled' | 'failure_escalated' | 'expected_divergence_handled' | 'system_bug';
  withMetricsEmitter?: boolean;
  metricsEmitterThrows?: boolean;
  /**
   * FP-009 Bucket 0.1 — when set, the iShares-slot (Wikipedia-in-disguise per
   * FP-008.2 Step C legacy field name) mock returns this ticker→sector map.
   * Unset = no-sector behavior (preserves all pre-Bucket-0.1 tests verbatim).
   */
  iSharesSectorMap?: Record<string, string | null>;
  /**
   * FP-009 Bucket 0.1 — when true, the iShares-slot mock returns an empty
   * constituent array (Wikipedia-unavailable / zero-overlap degradation case).
   * Drives the all-NULL-sector graceful-degradation assertion.
   */
  iSharesReturnsEmpty?: boolean;
} = {}) {
  const { persister, calls } = makePersister();
  const ump = makeUniverseMembershipPersister();
  const hxp = makeHardExclusionsPersister();
  const cc = makeCrossCheck(opts.crossCheckOutcome ?? 'false_positive_within_tolerance');
  const me = (opts.withMetricsEmitter ?? false)
    ? makeMetricsEmitter({ throws: opts.metricsEmitterThrows })
    : null;
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
        if (opts.iSharesReturnsEmpty) return [];
        return sharesTickers.map((t) =>
          mkConstituent(t, 'ishares', opts.iSharesSectorMap?.[t] ?? null),
        );
      },
    },
    polygonEnrichment: {
      async enrich(constituents) {
        if (opts.enrichmentThrows) throw new Error('polygon_enrichment_500');
        // FP-008.4 #23 — enrich() returns { enriched, skipped }; happy-path
        // mock returns zero structural skips.
        return { enriched: constituents.map((c) => mkEnriched(c.ticker)), skipped: [] };
      },
    },
    exclusionInput: {
      earnings_calendar: { entries: [], fetched_at: AS_OF },
      ma_actions: [],
      halt_history: [],
      // §3.3d typed-absence: a ticker MISSING from `locate_data` fires
      // `htb_no_locate` per the rule's documented contract
      // (rule-3-3d-htb.ts:15-17 — "better to skip a short than enter one
      // blind"). For a happy-path fixture every polygon ticker therefore
      // requires a POSITIVE locate record; an empty array is NOT neutral.
      // §3.3e is the opposite polarity (missing → no firing); the
      // asymmetry is the hazard. See INC-26.
      locate_data: polyTickers.map((ticker) => ({
        ticker,
        locate_available: true,
        borrow_rate_bps: 0,
      })),
      short_interest: [],
    },
    refreshLogPersister: persister,
    universeMembershipPersister: ump.persister,
    hardExclusionsPersister: hxp.persister,
    crossCheck: cc.fn,
    ...(me === null ? {} : { metricsEmitter: me.emitter }),
  };
  return {
    ctx,
    calls,
    umpPersisted: ump.persisted,
    hxpPersisted: hxp.persisted,
    ccCalls: cc.calls,
    metricsCalls: me === null ? null : me.calls,
  };
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

// ============================================================================
// FP-008 sub-step 8.9 / ACT-115 — health metrics emission (step 7) coverage.
// Surface 1 Option γ + Surface 3 Option ii (emit only on outcome='completed').
// ============================================================================

Deno.test('metrics emitter invoked on outcome=completed with reason arrays', async () => {
  const { ctx, metricsCalls } = makeContext({ withMetricsEmitter: true });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
  assert(metricsCalls !== null);
  assertEquals(metricsCalls!.length, 1);
  assertEquals(metricsCalls![0].refresh_id, 'refresh-uuid-stub');
  // happy-path mkEnriched constituents all pass filters → no rejections, no firings.
  assertEquals(metricsCalls![0].filter_rejection_reasons.length, 0);
  assertEquals(metricsCalls![0].hard_exclusion_reasons.length, 0);
});

Deno.test('metrics emitter NOT invoked on outcome=failed (enrichment throws)', async () => {
  const { ctx, metricsCalls } = makeContext({ withMetricsEmitter: true, enrichmentThrows: true });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'failed');
  assertEquals(metricsCalls!.length, 0);
});

Deno.test('metrics emitter NOT invoked on cross-check abort (failure_escalated)', async () => {
  const { ctx, metricsCalls } = makeContext({
    withMetricsEmitter: true,
    crossCheckOutcome: 'failure_escalated',
  });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'failed');
  assertEquals(metricsCalls!.length, 0);
});

Deno.test('metrics emitter absent → orchestrator runs unchanged (backwards-compat)', async () => {
  const { ctx } = makeContext({ withMetricsEmitter: false });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
});

Deno.test('metrics emitter error does NOT fail refresh (observability, not correctness)', async () => {
  const { ctx, metricsCalls } = makeContext({ withMetricsEmitter: true, metricsEmitterThrows: true });
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
  assertEquals(result.failure_reason, null);
  assertEquals(metricsCalls!.length, 1);
});

// ============================================================================
// FP-008.4 Commit 3.5 — circuit-breaker D5 self-masking race fix +
// stay-tripped semantics.
//
// Tests use a persister whose `countConsecutiveFailures` simulates the
// production loop semantics (`.in()` filter excludes NULL in-flight rows;
// `STREAK_FAILURE_OUTCOMES.has(...)` predicate extends streak on
// 'failed' OR 'circuit_breaker_open'). The `filteredTail` parameter
// represents what the DB query returns POST-`.in(...)` — NULL rows are
// not present in the input by construction, matching server-side
// filtering. This mirrors the contract documented in
// `longshort-universe-quarterly-refresh/index.ts` countConsecutiveFailures
// without duplicating the supabase-js query chain in the fake.
// ============================================================================

function makeBreakerPersister(filteredTail: ReadonlyArray<RefreshOutcome>) {
  const calls: { kind: 'start' | 'finalize'; payload: unknown }[] = [];
  const persister: RefreshLogPersister = {
    async insertStart(row) {
      calls.push({ kind: 'start', payload: row });
      return { refresh_id: 'refresh-uuid-stub' };
    },
    async finalize(refresh_id, patch) {
      calls.push({ kind: 'finalize', payload: { refresh_id, ...patch } });
    },
    async countConsecutiveFailures(limit) {
      let count = 0;
      for (const outcome of filteredTail.slice(0, limit)) {
        if (STREAK_FAILURE_OUTCOMES.has(outcome)) count += 1;
        else break;
      }
      return count;
    },
  };
  return { persister, calls };
}

function makeBreakerContext(filteredTail: ReadonlyArray<RefreshOutcome>) {
  const base = makeContext();
  const { persister, calls } = makeBreakerPersister(filteredTail);
  base.ctx.refreshLogPersister = persister;
  return { ctx: base.ctx, calls, umpPersisted: base.umpPersisted };
}

Deno.test('D5 fix — 3 prior failed (NULL self-row excluded by .in filter) → breaker trips', async () => {
  // Production .in('outcome', [...]) filters NULL server-side; the fake's
  // filteredTail is post-filter, so the in-flight self-row is absent.
  const { ctx, calls, umpPersisted } = makeBreakerContext(['failed', 'failed', 'failed']);
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'circuit_breaker_open');
  // insertStart + finalize both called (R3 atomicity preserved on trip path).
  assertEquals(calls.length, 2);
  assertEquals(calls[0].kind, 'start');
  const finalize = calls[1].payload as { outcome: string; failure_reason: string | null };
  assertEquals(finalize.outcome, 'circuit_breaker_open');
  assert(finalize.failure_reason !== null);
  assert(finalize.failure_reason!.includes('Circuit breaker open'));
  // Pipeline did NOT run → no universe_membership persistence on trip path.
  assertEquals(umpPersisted.length, 0);
});

Deno.test('stay-tripped — prior circuit_breaker_open + 2 failed → breaker trips again (auto-rearm rejected)', async () => {
  // Tail [circuit_breaker_open, failed, failed]: STREAK_FAILURE_OUTCOMES
  // includes 'circuit_breaker_open' so all 3 count → trips.
  const { ctx, calls } = makeBreakerContext(['circuit_breaker_open', 'failed', 'failed']);
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'circuit_breaker_open');
  const finalize = calls[1].payload as { outcome: string };
  assertEquals(finalize.outcome, 'circuit_breaker_open');
});

Deno.test('clean break — prior completed breaks the streak → breaker does NOT trip', async () => {
  // Tail [completed, failed, failed]: 'completed' is not in STREAK_FAILURE_OUTCOMES
  // → loop breaks at index 0 → count=0 → pipeline proceeds.
  const { ctx } = makeBreakerContext(['completed', 'failed', 'failed']);
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  // Happy-path pipeline runs to completion (cross-check default = pass).
  assertEquals(result.outcome, 'completed');
});

Deno.test('NULL-as-in-flight convention pin — persister source contains the .in() 4-value filter', async () => {
  // Load-bearing regression sentinel: the .in() filter is what excludes the
  // NULL self-row (D5). If a future refactor drops it, the breaker silently
  // reverts to never-tripping. This test pins the filter at source level.
  const src = await Deno.readTextFile(
    new URL('../../../longshort-universe-quarterly-refresh/index.ts', import.meta.url),
  );
  assert(
    src.includes(".in('outcome', ['completed', 'failed', 'partial', 'circuit_breaker_open'])"),
    'D5 fix: countConsecutiveFailures must exclude NULL in-flight rows via .in() filter on the 4 CHECK-constraint values',
  );
  assert(
    src.includes('STREAK_FAILURE_OUTCOMES.has'),
    'Stay-tripped semantics: streak predicate must use STREAK_FAILURE_OUTCOMES.has(...)',
  );
});

Deno.test('set-vs-union-vs-CHECK pin — STREAK_FAILURE_OUTCOMES is a subset of the sql/12 4-value CHECK set', async () => {
  // Hard-coded sql/12 CHECK values. If sql/12 ever widens/narrows, update
  // both this array AND the production .in() filter — drift = test failure.
  const CHECK_CONSTRAINT_VALUES: ReadonlyArray<RefreshOutcome> = [
    'completed',
    'failed',
    'partial',
    'circuit_breaker_open',
  ];
  // Every STREAK_FAILURE_OUTCOMES member must be a valid CHECK value.
  for (const outcome of STREAK_FAILURE_OUTCOMES) {
    assert(
      CHECK_CONSTRAINT_VALUES.includes(outcome),
      `STREAK_FAILURE_OUTCOMES member '${outcome}' is not in the sql/12 CHECK constraint value set — TS union, predicate set, and DB CHECK have drifted`,
    );
  }
  // Stay-tripped semantics: 'circuit_breaker_open' MUST be in the streak set
  // (auto-rearm would be a Tier-A safety hazard — see types.ts comment).
  assert(
    STREAK_FAILURE_OUTCOMES.has('circuit_breaker_open'),
    'Stay-tripped semantics regression: circuit_breaker_open must extend the streak so a tripped breaker stays tripped',
  );
  assert(
    STREAK_FAILURE_OUTCOMES.has('failed'),
    'failed must extend the streak (baseline breaker behavior)',
  );
  // 'completed' and 'partial' MUST NOT extend the streak — a successful or
  // partial-success run breaks the failure run.
  assert(
    !STREAK_FAILURE_OUTCOMES.has('completed'),
    "'completed' must NOT extend the streak (a successful run breaks the failure run)",
  );
  assert(
    !STREAK_FAILURE_OUTCOMES.has('partial'),
    "'partial' must NOT extend the streak (partial-success is non-failure)",
  );
});

// ============================================================================
// FP-008.4 Commit 4 — D2 fail-closed read + D3 required-method tests.
//
// D2 (b-prime): a read failure in `countConsecutiveFailures` finalizes the
// in-flight start-row as `outcome='failed'` and early-returns. Read errors
// are streak-eligible (per STREAK_FAILURE_OUTCOMES) so three consecutive
// read failures converge to a normal breaker trip via the standard streak
// path — surfacing a persistent observability outage through the breaker's
// own halt-and-surface rather than a quieter stream of HTTP 500s.
//
// D3 (x): `countConsecutiveFailures` is required on `RefreshLogPersister`;
// the `?` optional marker was removed. A missing implementation is now a
// compile error, eliminating the silent fail-open footgun.
// ============================================================================

function makeThrowingCountPersister(errorMessage: string) {
  const calls: { kind: 'start' | 'finalize'; payload: unknown }[] = [];
  const persister: RefreshLogPersister = {
    async insertStart(row) {
      calls.push({ kind: 'start', payload: row });
      return { refresh_id: 'refresh-uuid-stub' };
    },
    async finalize(refresh_id, patch) {
      calls.push({ kind: 'finalize', payload: { refresh_id, ...patch } });
    },
    async countConsecutiveFailures(_limit) {
      throw new Error(errorMessage);
    },
  };
  return { persister, calls };
}

Deno.test('D2 fail-closed — countConsecutiveFailures throws → finalize failed, pipeline skipped, no fetcher called', async () => {
  const base = makeContext();
  const { persister, calls } = makeThrowingCountPersister('db_connection_refused');
  base.ctx.refreshLogPersister = persister;

  // Sentinel: track whether any pipeline fetcher was invoked. A correct D2
  // fail-closed read MUST early-return before the pipeline runs.
  let polygonCalled = false;
  let isharesCalled = false;
  let enrichCalled = false;
  base.ctx.polygonConstituents = {
    async fetchConstituents() { polygonCalled = true; return []; },
  };
  base.ctx.iSharesConstituents = {
    async fetchConstituents() { isharesCalled = true; return []; },
  };
  base.ctx.polygonEnrichment = {
    async enrich() { enrichCalled = true; return { enriched: [], skipped: [] }; },
  };

  const orch = createQuarterlyRefreshOrchestrator(base.ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);

  assertEquals(result.outcome, 'failed');
  assertEquals(result.eligible.length, 0);
  assertEquals(result.total_constituents_raw, 0);
  assert(result.failure_reason !== null);
  assert(
    result.failure_reason!.includes('count_consecutive_failures_read_failed'),
    `expected failure_reason to contain 'count_consecutive_failures_read_failed', got: ${result.failure_reason}`,
  );
  assert(
    result.failure_reason!.includes('db_connection_refused'),
    `expected failure_reason to include underlying error message, got: ${result.failure_reason}`,
  );

  // Pipeline must NOT have run.
  assertEquals(polygonCalled, false);
  assertEquals(isharesCalled, false);
  assertEquals(enrichCalled, false);

  // insertStart + EXACTLY ONE finalize — the read-error path must not
  // double-finalize against the trip block or the post-try finalize.
  const finalizeCalls = calls.filter((c) => c.kind === 'finalize');
  assertEquals(finalizeCalls.length, 1);
  const finalize = finalizeCalls[0].payload as { refresh_id: string; outcome: string; failure_reason: string | null };
  assertEquals(finalize.outcome, 'failed');
  // Finalize targets the same refresh_id returned by insertStart (patches
  // the in-flight row, does NOT create a second row).
  assertEquals(finalize.refresh_id, 'refresh-uuid-stub');
});

Deno.test('D2 single-finalize pin — read-error path invokes finalize exactly once', async () => {
  // Hardens the four-path control-flow guarantee: read-error / breaker-trip /
  // pipeline-success / pipeline-failure each terminate via exactly one
  // finalize. This test pins the read-error branch.
  const { persister, calls } = makeThrowingCountPersister('read_blip');
  const base = makeContext();
  base.ctx.refreshLogPersister = persister;
  const orch = createQuarterlyRefreshOrchestrator(base.ctx, OPERATOR_ID);
  await orch.run(AS_OF);
  const finalizeCalls = calls.filter((c) => c.kind === 'finalize');
  assertEquals(
    finalizeCalls.length,
    1,
    'read-error path must finalize exactly once (no double-finalize against the trip block or post-try finalize)',
  );
});

Deno.test('D2 converges to breaker trip — 3 prior failed rows from read errors → next run trips', async () => {
  // Substitute shape (per Commit 4 prompt): rather than wiring three
  // sequential throwing runs against the fake harness, this test asserts
  // the convergence property directly — that 'failed' rows produced by
  // read-error finalizes are streak-eligible via STREAK_FAILURE_OUTCOMES
  // and therefore reach the breaker's >= 3 trip threshold via the same
  // code path as 'failed' rows produced by pipeline failures.
  //
  // (a) Source-level proof: read-error finalize writes outcome:'failed'
  // (asserted by the D2 fail-closed test above), and STREAK_FAILURE_OUTCOMES
  // includes 'failed' (asserted by the set-vs-CHECK pin earlier in this file).
  // (b) Behavioural proof: simulate the post-state after three throwing runs
  // by handing the breaker fake a tail of three 'failed' outcomes and assert
  // the breaker trips on the fourth run.
  const { ctx, calls } = makeBreakerContext(['failed', 'failed', 'failed']);
  const orch = createQuarterlyRefreshOrchestrator(ctx, OPERATOR_ID);
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'circuit_breaker_open');
  const finalize = calls[1].payload as { outcome: string; failure_reason: string | null };
  assertEquals(finalize.outcome, 'circuit_breaker_open');
  // Convergence guarantee: read-error rows (outcome:'failed') and pipeline-
  // failure rows (outcome:'failed') are indistinguishable to the streak
  // counter — both extend the streak, both can trip the breaker.
  assert(STREAK_FAILURE_OUTCOMES.has('failed'));
});

// ============================================================================
// FP-008.4 Commit 6 / #5 — universe_membership re-run idempotency (UPSERT).
//
// Test 3: orchestrator-level double-run smoke. Pins the breaker-streak
// interaction — a legitimate re-run for the same as_of_date must NOT feed a
// false-failure signal toward Commit 3.5's streak counter. Both runs must
// outcome='completed'; final membership row count = N (eligible set size),
// not 2N, not error.
//
// Uses a local fake universe-membership persister that emulates UPSERT
// semantics against a Map keyed by (operator_id,ticker,as_of_date) — same
// onConflict target as the production persister. Without Commit 6's UPSERT
// fix, a duplicate-key throw inside .persist() would surface as a
// pipeline-failure finalize ('failed' outcome) on the second run.
// ============================================================================

Deno.test('Commit 6 / #5 — double orch.run() for same as_of_date: both complete, no false failure', async () => {
  const base = makeContext();
  // Replace the trivial push-only ump fake with one that emulates UPSERT
  // semantics on the PK key. Production persister calls .upsert() with
  // onConflict='operator_id,ticker,as_of_date' — same key shape here.
  const store = new Map<string, unknown>();
  let upsertCalls = 0;
  base.ctx.universeMembershipPersister = {
    async persist(input) {
      upsertCalls += 1;
      for (const r of input.rows) {
        if (r.long_eligible === true || r.short_eligible === true) {
          const k = `${input.operator_id}|${r.ticker}|${input.as_of_date}`;
          store.set(k, { ...r, refresh_id: input.refresh_id }); // last-writer-wins
        }
      }
    },
  };

  const orch = createQuarterlyRefreshOrchestrator(base.ctx, OPERATOR_ID);

  const first = await orch.run(AS_OF);
  assertEquals(first.outcome, 'completed', 'first run must complete');

  const firstRunSize = store.size;
  assert(firstRunSize > 0, 'first run must persist at least one row');

  const second = await orch.run(AS_OF);
  assertEquals(second.outcome, 'completed',
    're-run for same as_of_date must complete (not throw 23505 → failed)');

  // Final store size MUST equal the first run's size — re-run did not double
  // the row count (no duplicates) and did not collapse to 0 (no error path).
  // The exact N depends on PK-deduplication of the happy-path fixture; what
  // pins the contract is "= first-run size, not 2× and not 0".
  assertEquals(store.size, firstRunSize,
    're-run row count must equal first-run row count (UPSERT deduplicated by PK; not 2×, not 0)');
  assertEquals(upsertCalls, 2, 'persister called once per run');

  // Breaker-streak interaction pin: neither finalize emitted 'failed', so the
  // streak counter sees no false-failure signal from the re-run path.
});