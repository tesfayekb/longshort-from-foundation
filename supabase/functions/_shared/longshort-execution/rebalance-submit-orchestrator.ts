/**
 * rebalance-submit-orchestrator — extraction of the runRebalanceSubmit
 * orchestration entry + its private helpers from
 * `supabase/functions/longshort-rebalance-submit/index.ts`. Lives in
 * `_shared/` so BOTH the operator-gated edge function and the cron-sibling
 * (`longshort-rebalance-submit-cron`) can import it; per-function dirs
 * cannot cross-import, only `_shared/` can be shared.
 *
 * NO LOGIC CHANGE from the in-place version — pure relocation. The HTTP
 * handler stays in the per-function file (handles authn/RBAC/audit
 * envelope); only the testable orchestration + helpers move here.
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import type { BrokerInterfaces } from './broker-bootstrap.ts';
import {
  composePreflightResults,
  type PreflightCandidate,
  type PreflightComposerSummary,
  resolveShortDtcExcludeThreshold,
} from './preflight-composer.ts';
import {
  planRebalance,
  type CurrentPosition,
  type ExecutionDelta,
  type RankingRow,
  type WorkingOrderView,
  RANKING_FRESHNESS_TOLERANCE_S,
  SUBSTITUTION_SCAN_CAP_RANK,
} from './rebalance-planner.ts';
import {
  submitRebalance,
  type SubmissionResult,
} from './order-submitter.ts';
import type {
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import {
  classifySubmissionEvent,
} from './classify-submission-event.ts';
import type { BrokerPosition } from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';
import {
  createRejectionPropagator,
  createSupabaseHtbCacheWriter,
  createSupabaseHtbCacheReader,
  createSupabaseHtbCacheClearer,
  type RejectionPropagator,
  type HtbCacheReader,
  type HtbCacheClearer,
} from './cache-propagator-io.ts';
import {
  createSupabaseDaysToCoverReader,
  type DaysToCoverReader,
} from '../longshort-signals/shared/days-to-cover-store.ts';
import type { SameTickContradictoryPass } from './cache-propagator.ts';
import { preflightKey } from './rebalance-planner.ts';

export const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// ──────────────────────────────────────────────────────────────────────────
// Public request/response shapes.
// ──────────────────────────────────────────────────────────────────────────

export type RebalanceMode = 'full_rebalance' | 'spot_check' | 'writer_smoke';

export interface RebalanceSubmitRequest {
  mode: RebalanceMode;
  symbol?: string;
  qty?: number;
  operator_id?: string;
  allocationPct?: number;
  noopPct?: number;
  noopFloorUsd?: number;
}

export interface SubmissionResultSlim {
  kind: SubmissionResult['kind'];
  symbol: string;
  side: 'long' | 'short';
  intent?: ExecutionDelta['intent'];
  order_id?: string;
  client_order_id?: string;
  shares?: number;
  limit_price?: number;
  reason?: string;
  broker_status_code?: number | null;
}

export interface RebalanceSubmitResponse {
  status: 'ok';
  mode: RebalanceMode;
  operator_id: string;
  ts: string;
  correlation_id: string;
  preflight_summary?: PreflightComposerSummary;
  submission_counts: Record<SubmissionResult['kind'], number>;
  submissions: SubmissionResultSlim[];
  ssr_unavailable: boolean;
  shorts_placed_without_ssr_check: string[];
  long_only_mode: boolean;
  shorts_skipped_locate_unavailable: string[];
  htb_marks_persisted: string[];
  /** DEC-070 clause (c) — populated iff the planner refused to act because
   *  the latest `combiner_rankings.computed_at` was older than the tolerance
   *  vs the injected `ts`. When set, `submissions` is empty + counts zero. */
  refusal?: {
    reason: 'rankings_stale';
    latest_computed_at: string | null;
    tolerance_s: number;
    age_s: number | null;
  };
  /** DEC-070 clause (b) — count of broker working orders observed at fire
   *  time (informational; the planner subtracts these from effective
   *  current before computing deltas). */
  working_orders_observed?: number;
}

export interface RebalanceSubmitDeps {
  brokerFactory: () => BrokerInterfaces;
  eventWriter: ReconciliationEventWriter;
  rankingsReader: (operator_id: string) => Promise<RankingRow[]>;
  ts: Date;
  snapshotWriter?: EquitySnapshotWriter;
  htbCacheReader?: HtbCacheReader;
  htbCacheClearer?: HtbCacheClearer;
  rejectionPropagator?: RejectionPropagator;
  /**
   * Optional injection of the short-side days-to-cover reader (DW-165).
   * Defaults to the Supabase-backed reader in production; tests inject
   * an in-memory double to exercise the gate without DB access.
   */
  daysToCoverReader?: DaysToCoverReader;
}

// ──────────────────────────────────────────────────────────────────────────
// Equity snapshot — ACT-324 / FP-057.
// ──────────────────────────────────────────────────────────────────────────

export type EquitySnapshotSource = 'rebalance_fire' | 'daily_cron';

export interface EquitySnapshotInput {
  operator_id: string;
  ts: Date;
  account_equity: number;
  cash: number | null;
  long_mv: number;
  short_mv: number;
  gross: number;
  net: number;
  source: EquitySnapshotSource;
  mode: RebalanceMode | null;
}

export interface EquitySnapshotWriter {
  write(snap: EquitySnapshotInput): Promise<void>;
}

export function computeEquitySnapshotComponents(
  positions: CurrentPosition[],
): { long_mv: number; short_mv: number; gross: number; net: number } {
  let long_mv = 0;
  let short_mv = 0;
  for (const p of positions) {
    if (p.side === 'long') long_mv += p.market_value;
    else short_mv += Math.abs(p.market_value);
  }
  return { long_mv, short_mv, gross: long_mv + short_mv, net: long_mv - short_mv };
}

function createSupabaseEquitySnapshotWriter(): EquitySnapshotWriter {
  return {
    async write(snap: EquitySnapshotInput): Promise<void> {
      const { error } = await supabaseAdmin.from('longshort_equity_snapshots').insert({
        operator_id: snap.operator_id,
        ts: snap.ts.toISOString(),
        account_equity: snap.account_equity,
        cash: snap.cash,
        long_mv: snap.long_mv,
        short_mv: snap.short_mv,
        gross: snap.gross,
        net: snap.net,
        source: snap.source,
        mode: snap.mode,
      });
      if (error) {
        throw new Error(`longshort_equity_snapshots insert failed: ${error.message}`);
      }
    },
  };
}

export function createSupabaseRankingsReader(): (operator_id: string) => Promise<RankingRow[]> {
  return async (operator_id: string): Promise<RankingRow[]> => {
    const { data: latest, error: e1 } = await supabaseAdmin
      .from('combiner_rankings')
      .select('as_of_date, computed_at')
      .eq('operator_id', operator_id)
      .order('as_of_date', { ascending: false })
      .order('computed_at', { ascending: false })
      .limit(1);
    if (e1) throw new Error(`combiner_rankings as_of_date read failed: ${e1.message}`);
    if (!latest || latest.length === 0) return [];
    const head = latest[0] as { as_of_date: string; computed_at: string | null };
    const as_of_date = head.as_of_date;

    const cap = SUBSTITUTION_SCAN_CAP_RANK;
    const { data: rows, error: e2 } = await supabaseAdmin
      .from('combiner_rankings')
      .select('ticker, long_rank, short_rank, long_score, short_score, gics_sector, ranker_source, computed_at')
      .eq('operator_id', operator_id)
      .eq('as_of_date', as_of_date)
      .or(`long_rank.lte.${cap},short_rank.lte.${cap}`);
    if (e2) throw new Error(`combiner_rankings rows read failed: ${e2.message}`);
    return (rows ?? []) as RankingRow[];
  };
}

/**
 * Read the configured ranking-freshness tolerance (seconds). Defaults to
 * the planner's `RANKING_FRESHNESS_TOLERANCE_S` (600s = 2 ticks × 5min;
 * §11.0.7 #1) unless `LONGSHORT_RANKING_FRESHNESS_TOLERANCE_S` is set in
 * the environment. Read at the boundary, never inside the kernel (purity
 * discipline j.4 + DEC-034 clause 4).
 */
export function readRankingFreshnessToleranceS(): number {
  try {
    const raw = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
      .Deno?.env.get('LONGSHORT_RANKING_FRESHNESS_TOLERANCE_S');
    if (raw != null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    // env access denied (e.g. test runner without --allow-env) → default.
  }
  return RANKING_FRESHNESS_TOLERANCE_S;
}

/**
 * Extract the latest `computed_at` from a rankings set. Returns null if
 * no row carries one (back-compat with fixtures that omit the field; the
 * gate is then DISABLED for that call).
 */
function latestRankingsComputedAt(rows: readonly RankingRow[]): Date | null {
  let best: number | null = null;
  for (const r of rows) {
    if (r.computed_at == null || r.computed_at === '') continue;
    const t = Date.parse(r.computed_at);
    if (!Number.isFinite(t)) continue;
    if (best == null || t > best) best = t;
  }
  return best == null ? null : new Date(best);
}

/**
 * Map a broker `InFlightOrder` to the planner's narrow `WorkingOrderView`.
 * Note: in-flight orders the planner considers are those still working
 * (phase1_pending or phase2_working — both states reconstructed by
 * `AlpacaOpenOrdersFetcher`). The planner only cares about working
 * remainder × limit_price; the lifecycle/state metadata is dropped here.
 */
function inFlightToWorkingView(o: InFlightOrder): WorkingOrderView {
  return {
    symbol: o.symbol,
    side: o.side,
    broker_side: o.broker_side,
    shares: o.shares,
    filled_qty: o.filled_qty ?? 0,
    current_limit_price: o.current_limit_price,
  };
}

function brokerPositionToCurrent(p: BrokerPosition): CurrentPosition {
  if (p.market_value === undefined || p.current_price === undefined) {
    throw new Error(
      `broker_position_missing_market_value_or_current_price symbol=${p.symbol}`,
    );
  }
  return {
    symbol: p.symbol,
    side: p.qty >= 0 ? 'long' : 'short',
    qty: p.qty,
    market_value: p.market_value,
    current_price: p.current_price,
  };
}

function slimResult(r: SubmissionResult): SubmissionResultSlim {
  const base = { kind: r.kind, symbol: r.symbol, side: r.side } as SubmissionResultSlim;
  if ('intent' in r) base.intent = r.intent;
  if ('order_id' in r) base.order_id = r.order_id;
  if ('client_order_id' in r) base.client_order_id = r.client_order_id;
  if ('shares' in r) base.shares = r.shares;
  if ('limit_price' in r) base.limit_price = r.limit_price;
  if ('reason' in r) base.reason = r.reason;
  if ('broker_status_code' in r) base.broker_status_code = r.broker_status_code;
  return base;
}

export async function runRebalanceSubmit(
  req: RebalanceSubmitRequest,
  deps: RebalanceSubmitDeps,
  correlationId: string,
): Promise<RebalanceSubmitResponse> {
  const operator_id = req.operator_id ?? DEFAULT_OPERATOR_ID;
  const ts = deps.ts;

  if (req.mode === 'writer_smoke') {
    return await runWriterSmoke({ operator_id, ts, correlationId, eventWriter: deps.eventWriter });
  }

  const broker = deps.brokerFactory();

  const quoteFetcher = broker.quoteFetcher;
  const buyingPowerFetcher = broker.buyingPowerFetcher;
  const positionFetcher = broker.positionFetcher;
  const locateFetcher = broker.locateFetcher;
  const haltStatusFetcher = broker.haltStatusFetcher;
  const shortabilityFetcher = broker.shortabilityFetcher;
  if (!quoteFetcher || !buyingPowerFetcher || !positionFetcher || !haltStatusFetcher) {
    throw new Error('placement_path_broker_fetchers_missing');
  }
  const listOpenPositions = positionFetcher.listOpenPositions;
  if (!listOpenPositions) throw new Error('position_fetcher_missing_listOpenPositions');

  if (req.mode === 'spot_check') {
    return await runSpotCheck({
      req, operator_id, ts, correlationId,
      quoteFetcher, buyingPowerFetcher,
      orderSubmitter: broker.submitter,
      acceptanceFetcher: broker.acceptanceFetcher,
      eventWriter: deps.eventWriter,
    });
  }

  // ── FULL_REBALANCE ─────────────────────────────────────────────────────
  const rankings = await deps.rankingsReader(operator_id);

  // ── DEC-070 clause (c) — RANKING-FRESHNESS GATE ──────────────────────
  // Uses the INJECTED ts (not wall-clock; DEC-034 clause 4). The gate is
  // SKIPPED when no row carries computed_at (back-compat with legacy
  // fixtures + the once-daily path's tests). For the production once-
  // daily strategy: the daily ranking computed at ~10:30 is acted on
  // within the same fire, so `ts - computed_at` is wall-clock-adjacent
  // — comfortably under the 600s tolerance. The gate only bites when a
  // ranking is genuinely stale (the intraday-cadence protection).
  const tolerance_s = readRankingFreshnessToleranceS();
  const latestComputedAt = latestRankingsComputedAt(rankings);
  if (latestComputedAt !== null) {
    const age_ms = ts.getTime() - latestComputedAt.getTime();
    const age_s = age_ms / 1000;
    if (age_s > tolerance_s) {
      console.warn(
        'longshort_rebalance.refused.rankings_stale',
        JSON.stringify({
          operator_id,
          ts: ts.toISOString(),
          latest_computed_at: latestComputedAt.toISOString(),
          age_s,
          tolerance_s,
          correlation_id: correlationId,
        }),
      );
      const resp = buildResponse({
        mode: 'full_rebalance', operator_id, ts, correlationId,
        preflight_summary: undefined,
        submissions: [],
        candidates: [],
        htb_marks_persisted: [],
      });
      resp.refusal = {
        reason: 'rankings_stale',
        latest_computed_at: latestComputedAt.toISOString(),
        tolerance_s,
        age_s,
      };
      resp.working_orders_observed = 0;
      return resp;
    }
  }

  const positions = await listOpenPositions.call(positionFetcher, ts);
  const currentPositions: CurrentPosition[] = positions.map(brokerPositionToCurrent);
  const bp = await buyingPowerFetcher.fetchBuyingPower(ts);
  const capitalBase = bp.account_equity;

  // ── DEC-070 clause (b) — WORKING-ORDER VISIBILITY ─────────────────────
  // Reuses the EXISTING broker.reconstructInFlight(ts) path (the same
  // surface the advance-tick uses at tick-scheduler.ts:86). No new
  // fetcher, no projection table — broker is authoritative in-flight
  // (E3 SURFACE-1). The planner subtracts working notional from the
  // effective-current so a name already moving toward target via a
  // working order does not get double-placed (DW-164).
  const inFlight = await broker.reconstructInFlight(ts);
  const workingOrders: WorkingOrderView[] = inFlight.map(inFlightToWorkingView);

  const cap = SUBSTITUTION_SCAN_CAP_RANK;
  const candidates: PreflightCandidate[] = [];
  const allocationPct = req.allocationPct ?? 1.0;
  const expectedBookSize = 40;
  const perNameEstimate = capitalBase * allocationPct / expectedBookSize;
  for (const r of rankings) {
    if (r.long_rank >= 1 && r.long_rank <= cap) {
      candidates.push({ symbol: r.ticker, side: 'long', requested_position_size: perNameEstimate });
    }
    if (r.short_rank >= 1 && r.short_rank <= cap) {
      candidates.push({ symbol: r.ticker, side: 'short', requested_position_size: perNameEstimate });
    }
  }

  const htbCacheReader = deps.htbCacheReader
    ?? createSupabaseHtbCacheReader(supabaseAdmin as unknown as Parameters<typeof createSupabaseHtbCacheReader>[0]);
  const htbCacheClearer = deps.htbCacheClearer
    ?? createSupabaseHtbCacheClearer(supabaseAdmin as unknown as Parameters<typeof createSupabaseHtbCacheClearer>[0]);
  // DW-165 — short-side squeeze-avoidance reader + threshold are resolved
  // at this boundary (env access stays out of the composer kernel). When
  // a caller injects `deps.daysToCoverReader` (e.g. tests) we honour it;
  // production wires the Supabase reader unconditionally so the gate
  // fires on every short candidate.
  const daysToCoverReader: DaysToCoverReader = deps.daysToCoverReader
    ?? createSupabaseDaysToCoverReader(supabaseAdmin as unknown as Parameters<typeof createSupabaseDaysToCoverReader>[0], operator_id);
  const shortDtcExcludeThreshold = resolveShortDtcExcludeThreshold((k) => {
    try {
      return (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
        .Deno?.env.get(k);
    } catch {
      return undefined;
    }
  });
  const preflight = await composePreflightResults(
    { candidates, internal_expected_bp: bp.available_bp, ts },
    {
      haltStatusFetcher, buyingPowerFetcher,
      ...(locateFetcher ? { locateFetcher } : {}),
      ...(shortabilityFetcher ? { shortabilityFetcher } : {}),
      htbCache: { reader: htbCacheReader, clearer: htbCacheClearer },
      operator_id,
      fetcher_source: 'live',
      daysToCoverReader,
      shortDtcExcludeThreshold,
    },
  );

  const plan = planRebalance({
    rankings,
    preflightResults: preflight.results,
    currentPositions,
    capitalBase,
    ts,
    allocationPct: req.allocationPct,
    noopPct: req.noopPct,
    noopFloorUsd: req.noopFloorUsd,
    workingOrders,
  });

  const submissions = await submitRebalance({
    deltas: plan.deltas,
    quoteFetcher,
    buyingPowerFetcher,
    orderSubmitter: broker.submitter,
    acceptanceFetcher: broker.acceptanceFetcher,
    ts,
  });

  for (const r of submissions) {
    await deps.eventWriter.emit(classifySubmissionEvent(r), ts);
  }

  const rejectionPropagator = deps.rejectionPropagator ?? createRejectionPropagator({
    htbWriter: createSupabaseHtbCacheWriter(
      supabaseAdmin as unknown as Parameters<typeof createSupabaseHtbCacheWriter>[0],
    ),
    eventWriter: deps.eventWriter,
  });
  const sameTickPasses: SameTickContradictoryPass[] = [];
  for (const c of candidates) {
    if (c.side !== 'short') continue;
    const r = preflight.results.get(preflightKey(c.symbol, 'short'));
    if (r?.passed) sameTickPasses.push({ symbol: c.symbol, class: 'htb' });
  }
  const htb_marks_persisted: string[] = [];
  for (const r of submissions) {
    if (r.kind !== 'rejected') continue;
    try {
      const decision = await rejectionPropagator.propagate({
        symbol: r.symbol,
        rejection_reason: r.reason,
        sameTickPasses,
        ts,
        client_order_id: r.client_order_id,
      });
      if (decision?.persist) {
        htb_marks_persisted.push(r.symbol);
      }
    } catch (propErr) {
      console.error(
        'longshort_rejection_propagator.failed',
        r.symbol,
        propErr instanceof Error ? propErr.message : String(propErr),
      );
    }
  }

  const snapshotWriter = deps.snapshotWriter ?? createSupabaseEquitySnapshotWriter();
  try {
    const components = computeEquitySnapshotComponents(currentPositions);
    await snapshotWriter.write({
      operator_id,
      ts,
      account_equity: bp.account_equity,
      cash: null,
      long_mv: components.long_mv,
      short_mv: components.short_mv,
      gross: components.gross,
      net: components.net,
      source: 'rebalance_fire',
      mode: 'full_rebalance',
    });
  } catch (snapErr) {
    console.error(
      'longshort_equity_snapshot.write_failed',
      snapErr instanceof Error ? snapErr.message : String(snapErr),
    );
  }

  return buildResponse({
    mode: 'full_rebalance', operator_id, ts, correlationId,
    preflight_summary: preflight.summary,
    submissions,
    candidates,
    htb_marks_persisted,
    working_orders_observed: workingOrders.length,
  });
}

async function runSpotCheck(args: {
  req: RebalanceSubmitRequest;
  operator_id: string;
  ts: Date;
  correlationId: string;
  quoteFetcher: NonNullable<BrokerInterfaces['quoteFetcher']>;
  buyingPowerFetcher: NonNullable<BrokerInterfaces['buyingPowerFetcher']>;
  orderSubmitter: BrokerInterfaces['submitter'];
  acceptanceFetcher: BrokerInterfaces['acceptanceFetcher'];
  eventWriter: ReconciliationEventWriter;
}): Promise<RebalanceSubmitResponse> {
  const { req, operator_id, ts, correlationId } = args;
  const symbol = req.symbol;
  if (typeof symbol !== 'string' || symbol.length === 0) {
    throw new Error('spot_check_missing_symbol');
  }
  const qty = typeof req.qty === 'number' && req.qty > 0 ? req.qty : 1;

  const refQuote = await args.quoteFetcher.fetchQuote(symbol, ts);
  const refPrice = refQuote.ask > 0
    ? refQuote.ask
    : (refQuote.last !== null && refQuote.last > 0 ? refQuote.last : 1);
  const delta_notional = qty * refPrice * 1.001;

  const delta: ExecutionDelta = {
    symbol, side: 'long', intent: 'open',
    delta_notional,
    target_notional: delta_notional,
    current_market_value: 0,
    noop_band_usd: 0,
    selection_reason: 'primary',
    substituted_from_symbol: null,
    original_rank: null,
    sector: null,
    computed_at: ts.toISOString(),
  };

  const submissions = await submitRebalance({
    deltas: [delta],
    quoteFetcher: args.quoteFetcher,
    buyingPowerFetcher: args.buyingPowerFetcher,
    orderSubmitter: args.orderSubmitter,
    acceptanceFetcher: args.acceptanceFetcher,
    ts,
  });

  for (const r of submissions) {
    await args.eventWriter.emit(classifySubmissionEvent(r), ts);
  }

  return buildResponse({
    mode: 'spot_check', operator_id, ts, correlationId,
    preflight_summary: undefined,
    submissions,
    candidates: [],
    htb_marks_persisted: [],
  });
}

async function runWriterSmoke(args: {
  operator_id: string;
  ts: Date;
  correlationId: string;
  eventWriter: ReconciliationEventWriter;
}): Promise<RebalanceSubmitResponse> {
  const { operator_id, ts, correlationId, eventWriter } = args;
  const provenance = {
    selection_reason: 'primary' as const,
    substituted_from_symbol: null,
    original_rank: null,
    sector: null,
    computed_at: ts.toISOString(),
  };
  const submissions: SubmissionResult[] = [
    {
      kind: 'accepted',
      symbol: 'SMOKE-A',
      side: 'long',
      intent: 'open',
      broker_side: 'buy',
      order_id: `smoke-${correlationId}-A`,
      client_order_id: `smoke-coid-${correlationId}-A`,
      shares: 1,
      limit_price: 1.0,
      offset_applied_usd: 0,
      tier_selection_mid_usd: 1.0,
      accepted_at: ts.toISOString(),
      provenance,
    },
    {
      kind: 'rejected',
      symbol: 'SMOKE-R',
      side: 'long',
      intent: 'open',
      broker_side: 'buy',
      client_order_id: `smoke-coid-${correlationId}-R`,
      shares: 1,
      limit_price: 1.0,
      reason: 'writer_smoke_synthetic_rejection',
      broker_status_code: null,
      rejected_at: ts.toISOString(),
      provenance,
    },
  ];
  for (const r of submissions) {
    await eventWriter.emit(classifySubmissionEvent(r), ts);
  }
  return buildResponse({
    mode: 'writer_smoke', operator_id, ts, correlationId,
    preflight_summary: undefined,
    submissions,
    candidates: [],
    htb_marks_persisted: [],
  });
}

function buildResponse(args: {
  mode: RebalanceMode;
  operator_id: string;
  ts: Date;
  correlationId: string;
  preflight_summary: PreflightComposerSummary | undefined;
  submissions: SubmissionResult[];
  candidates: readonly PreflightCandidate[];
  htb_marks_persisted: string[];
  working_orders_observed?: number;
}): RebalanceSubmitResponse {
  const counts: Record<SubmissionResult['kind'], number> = {
    accepted: 0, rejected: 0, pending_timeout: 0,
    zero_share_skipped: 0, quote_stale_skipped: 0,
    insufficient_buying_power_skipped: 0, noop_skipped: 0,
  };
  for (const r of args.submissions) counts[r.kind]++;

  const ssr_unavailable = args.preflight_summary?.ssr_unavailable ?? true;
  const shorts_placed_without_ssr_check: string[] = ssr_unavailable
    ? args.submissions
        .filter((r): r is Extract<SubmissionResult, { kind: 'accepted' }> =>
          r.kind === 'accepted' && r.side === 'short')
        .map((r) => r.symbol)
    : [];

  const locate_unavailable = args.preflight_summary?.locate_unavailable ?? true;
  const shortability_unavailable = args.preflight_summary?.shortability_unavailable ?? true;
  const long_only_mode = locate_unavailable && shortability_unavailable;
  const shorts_skipped_locate_unavailable: string[] = (locate_unavailable && shortability_unavailable)
    ? args.candidates.filter((c) => c.side === 'short').map((c) => c.symbol)
    : [];

  const resp: RebalanceSubmitResponse = {
    status: 'ok',
    mode: args.mode,
    operator_id: args.operator_id,
    ts: args.ts.toISOString(),
    correlation_id: args.correlationId,
    preflight_summary: args.preflight_summary,
    submission_counts: counts,
    submissions: args.submissions.map(slimResult),
    ssr_unavailable,
    shorts_placed_without_ssr_check,
    long_only_mode,
    shorts_skipped_locate_unavailable,
    htb_marks_persisted: args.htb_marks_persisted,
  };
  if (args.working_orders_observed !== undefined) {
    resp.working_orders_observed = args.working_orders_observed;
  }
  return resp;
}