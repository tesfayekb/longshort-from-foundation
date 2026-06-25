/**
 * longshort-rebalance-submit — FP-056 E5.5 PHASE-2 (ACT-322).
 *
 * The PLACEMENT-TRIGGER edge function. Wires the previously orphaned
 * `planRebalance` (E1) + `submitRebalance` (E2) kernels + the §7
 * preflight composer (E5.5 Phase-1) into one operator-invokable seam:
 *
 *   read combiner_rankings (latest as_of_date)
 *   → fetch positions + equity via the edge-resident Alpaca layer
 *   → composePreflightResults  (§7 GATE; SSR typed-absence per DEC-068 (n))
 *   → planRebalance            (book construction + delta computation)
 *   → submitRebalance          (sequential POST /v2/orders)
 *   → emit reconciliation_events per SubmissionResult
 *   → return audit-rich response payload
 *
 * MODES (request body `mode`):
 *
 *   'full_rebalance' — the full path above; the executable caller the E1+E2
 *                       kernels never had.
 *
 *   'spot_check'     — the E_evidence_3 wiring-validation vehicle. ONE
 *                       hardcoded LONG-ONLY ExecutionDelta (intent='open',
 *                       side='long') from `{ symbol, qty? }`; bypasses
 *                       rankings + planner; exercises submitRebalance only.
 *                       LONG-ONLY by design (DEC-068 (n): longs aren't
 *                       SSR-gated; the first fire is long-clean).
 *
 * GUARDRAIL 2 (DEC-068 clause (n) — BINDING):
 *
 *   The full_rebalance response payload MUST surface:
 *     summary.ssr_unavailable: boolean
 *     shorts_placed_without_ssr_check: string[]
 *
 *   These come from the composer's `summary.ssr_unavailable` + the
 *   per-SubmissionResult `{kind:'accepted', side:'short'}` filter. They are
 *   NOT buried under a debug flag, NOT silently swallowed. A build that
 *   omits this FAILS the clause-(n) contract.
 *
 * SCOPE — what this function DOES and DOES NOT do:
 *
 *   DOES:
 *     - Gate on `longshort.execute` (same gate as longshort-execute; this
 *       IS the money path).
 *     - DIAGNOSTIC-503 creds pre-flight (mirrors longshort-execute).
 *     - Dual audit envelope: longshort.rebalance.triggered BEFORE;
 *       longshort.rebalance.completed / .failed AFTER.
 *     - Drive the E1+E2 kernels with REAL inputs (rankings from
 *       combiner_rankings; positions/equity from Alpaca paper).
 *     - SSR typed-absence per DEC-068 (n) — NO ssrStatusFetcher injected.
 *
 *   DOES NOT:
 *     - Arm a cron (operator-armed later).
 *     - Grant `longshort.execute` (MIG-120 seeded the key; granting is a
 *       separate operator action).
 *     - Inject a synthetic SSR sentinel (clause (n): typed-absence only).
 *     - Fire E_evidence_3 in CI (tests run via injected fetchImpl; the live
 *       fire is operator-triggered AFTER this lands).
 *     - Handle short-side spot_check (clause (n): long-clean first fire).
 *
 * Permission seed citation: MIG-120 (the seed) + DEC-068 clause (d).
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createLiveBrokerInterfaces } from '../_shared/longshort-execution/broker-bootstrap.ts';
import type { BrokerInterfaces } from '../_shared/longshort-execution/broker-bootstrap.ts';
import {
  composePreflightResults,
  type PreflightCandidate,
  type PreflightComposerSummary,
} from '../_shared/longshort-execution/preflight-composer.ts';
import {
  planRebalance,
  type CurrentPosition,
  type ExecutionDelta,
  type RankingRow,
  SUBSTITUTION_SCAN_CAP_RANK,
} from '../_shared/longshort-execution/rebalance-planner.ts';
import {
  submitRebalance,
  type SubmissionResult,
} from '../_shared/longshort-execution/order-submitter.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from '../_shared/longshort-execution/lifecycle-orchestrator.ts';
import { createSupabaseReconciliationEventWriter } from '../_shared/longshort-execution/reconciliation-event-writer.ts';
import {
  classifySubmissionEvent,
  PLACEMENT_CALL_NAME,
} from '../_shared/longshort-execution/classify-submission-event.ts';
import type { BrokerPosition } from '../_shared/longshort-broker-interfaces.ts';
import {
  createRejectionPropagator,
  createSupabaseHtbCacheWriter,
  createSupabaseHtbCacheReader,
  createSupabaseHtbCacheClearer,
  type RejectionPropagator,
  type HtbCacheReader,
  type HtbCacheClearer,
} from '../_shared/longshort-execution/cache-propagator-io.ts';
import type { SameTickContradictoryPass } from '../_shared/longshort-execution/cache-propagator.ts';
import { preflightKey } from '../_shared/longshort-execution/rebalance-planner.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** Same diagnostic-503 pre-flight as longshort-execute. Two-line check;
 *  prevents an opaque internal error when creds are rotated/removed. */
function alpacaCredsPresent(): boolean {
  const k = Deno.env.get('ALPACA_PAPER_KEY');
  const s = Deno.env.get('ALPACA_PAPER_SECRET');
  return typeof k === 'string' && k.length > 0 && typeof s === 'string' && s.length > 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Public request/response shapes + the orchestration entry (testable).
// ──────────────────────────────────────────────────────────────────────────

export type RebalanceMode = 'full_rebalance' | 'spot_check' | 'writer_smoke';

export interface RebalanceSubmitRequest {
  mode: RebalanceMode;
  /** Spot-check only. */
  symbol?: string;
  /** Spot-check only. Default 1. Translated to dollar notional internally
   *  via a single quote pre-fetch (qty * quote.ask * 1.001 buffer for the
   *  whole-share flooring in computeShares). */
  qty?: number;
  /** Optional operator override; defaults to DEFAULT_OPERATOR_ID. */
  operator_id?: string;
  /** Optional planner knobs (default to the DEC-068/067 ratified values). */
  allocationPct?: number;
  noopPct?: number;
  noopFloorUsd?: number;
}

/** Per-SubmissionResult slim projection for the response payload. */
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
  /** Always present on `full_rebalance`; absent on `spot_check`. */
  preflight_summary?: PreflightComposerSummary;
  /** Counts by SubmissionResult.kind. */
  submission_counts: Record<SubmissionResult['kind'], number>;
  /** Slim per-result projection (full payload lives in reconciliation_events). */
  submissions: SubmissionResultSlim[];
  // ── DEC-068 clause (n) GUARDRAIL 2 — BINDING. ────────────────────────────
  /** TRUE when no SSR fetcher was injected (clause (n) typed-absence). On
   *  spot_check this still reports the posture; the symbol-list below is
   *  empty because spot_check is LONG-only by design. */
  ssr_unavailable: boolean;
  /** Per clause (n) Guardrail 2: symbols of SHORTS that were placed
   *  (kind='accepted', side='short') while SSR was unavailable. The
   *  operator-facing surface must render this list on every short-inclusive
   *  placement. */
  shorts_placed_without_ssr_check: string[];
  // ── DEC-068 clause (p) — LONG-ONLY POSTURE DECLARATION. ─────────────────
  /** TRUE when the placement run was long-only by structural posture
   *  (locate source absent OR SSR source absent). Derived EXPLICITLY from
   *  `summary.locate_unavailable || summary.ssr_unavailable` — clause (p)
   *  line 532 forbids heuristic/inference-based detection. On `spot_check`
   *  (LONG-only by design) the posture flags still drive this surfacing. */
  long_only_mode: boolean;
  /** Per clause (p) DISTINGUISHABILITY INVARIANT: short symbols the
   *  composer skipped because the locate source was structurally absent
   *  (typed-absence at the composer; broker locate NEVER called). Parallel
   *  to clause-(n)'s `shorts_placed_without_ssr_check`. */
  shorts_skipped_locate_unavailable: string[];
  // ── ACT-331 (DEC-068 clause (q)) — propagator surfacing. ────────────────
  /** Symbols whose terminal htb rejection landed an htb-cache write via the
   *  §8.4 rejection propagator on this fire. The next-tick `htbCache.reader`
   *  consult will short-circuit these symbols. */
  htb_marks_persisted: string[];
}

export interface RebalanceSubmitDeps {
  brokerFactory: () => BrokerInterfaces;
  eventWriter: ReconciliationEventWriter;
  rankingsReader: (operator_id: string) => Promise<RankingRow[]>;
  ts: Date;
  /**
   * ACT-324 / FP-057 — equity-snapshot writer. Called inside the
   * full_rebalance path AFTER submitRebalance completes, on the equity +
   * positions ALREADY in hand (NO new broker call). The write is
   * NON-FATAL: a snapshot-write failure MUST NOT fail the fire — the
   * order placement is authoritative; the snapshot is observational
   * (mirrors the strategy-audit "write_failed" tolerance pattern).
   * Optional — defaults to a `supabaseAdmin`-backed writer.
   */
  snapshotWriter?: EquitySnapshotWriter;
  /** ACT-331 (DEC-068 clause (q)) — htb-cache reader + clearer injected
   *  into the composer's `htbCache` slot. Defaults to the supabaseAdmin
   *  pair. The reader+clearer pair MUST be threaded together for the E4
   *  load-bearing wiring (consult-before-shortability + clear-on-success). */
  htbCacheReader?: HtbCacheReader;
  htbCacheClearer?: HtbCacheClearer;
  /** ACT-331 — §8.4 rejection propagator. Fires on every terminal htb
   *  rejection from `submitRebalance` so the cache reader picks it up next
   *  tick (the loop-break the E4 closure depends on, now on the placement
   *  path too). Defaults to a supabaseAdmin-backed pair (writer +
   *  reconciliation-event writer reuse of `deps.eventWriter`). */
  rejectionPropagator?: RejectionPropagator;
}

// ──────────────────────────────────────────────────────────────────────────
// ACT-324 / FP-057 — equity snapshot (the portfolio growth chart's data
// source). One row per full_rebalance fire on the equity + positions
// ALREADY fetched at lines 343-346 below — NO new broker call.
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

/** Pure: derive long_mv / short_mv / gross / net from the positions
 *  already returned by `listOpenPositions` (which populates market_value).
 *  Shorts carry negative market_value per Alpaca convention; the
 *  absolute value is used so `gross = long_mv + short_mv >= 0`. */
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

/** Production rankings reader — `supabaseAdmin` → latest as_of_date for
 *  the operator, top-SUBSTITUTION_SCAN_CAP_RANK rows per side. */
function createSupabaseRankingsReader() {
  return async (operator_id: string): Promise<RankingRow[]> => {
    // 1. Resolve latest as_of_date for this operator.
    const { data: latest, error: e1 } = await supabaseAdmin
      .from('combiner_rankings')
      .select('as_of_date')
      .eq('operator_id', operator_id)
      .order('as_of_date', { ascending: false })
      .limit(1);
    if (e1) throw new Error(`combiner_rankings as_of_date read failed: ${e1.message}`);
    if (!latest || latest.length === 0) return [];
    const as_of_date = (latest[0] as { as_of_date: string }).as_of_date;

    // 2. Read the top-SUBSTITUTION_SCAN_CAP_RANK rows per side for that date.
    //    We pull anything with long_rank<=cap OR short_rank<=cap (one query;
    //    the planner ignores rows whose rank falls outside its scan window).
    const cap = SUBSTITUTION_SCAN_CAP_RANK;
    const { data: rows, error: e2 } = await supabaseAdmin
      .from('combiner_rankings')
      .select('ticker, long_rank, short_rank, long_score, short_score, gics_sector, ranker_source')
      .eq('operator_id', operator_id)
      .eq('as_of_date', as_of_date)
      .or(`long_rank.lte.${cap},short_rank.lte.${cap}`);
    if (e2) throw new Error(`combiner_rankings rows read failed: ${e2.message}`);
    return (rows ?? []) as RankingRow[];
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

// classifySubmissionEvent has moved to
// `_shared/longshort-execution/classify-submission-event.ts` (ACT-326)
// — the decomposed (expected/observed/divergence) shape replaces the
// payload-only output that produced the corr-`bb3810bf` schema throw.

/**
 * The orchestration entry — testable in isolation with injected deps. The
 * Deno.serve handler below wraps this with authn/RBAC/diagnostic-503/audit.
 */
export async function runRebalanceSubmit(
  req: RebalanceSubmitRequest,
  deps: RebalanceSubmitDeps,
  correlationId: string,
): Promise<RebalanceSubmitResponse> {
  const operator_id = req.operator_id ?? DEFAULT_OPERATOR_ID;
  const ts = deps.ts;

  // writer_smoke short-circuits BEFORE broker instantiation — by design the
  // smoke verifies only the writer mapping against `reconciliation_events`,
  // so it must run without any broker call (and without creds).
  if (req.mode === 'writer_smoke') {
    return await runWriterSmoke({ operator_id, ts, correlationId, eventWriter: deps.eventWriter });
  }

  const broker = deps.brokerFactory();

  // Narrow the placement-path fetchers (Phase-1 made them optional on the
  // interface — they are PRESENT from the live factory; we assert at boundary).
  const quoteFetcher = broker.quoteFetcher;
  const buyingPowerFetcher = broker.buyingPowerFetcher;
  const positionFetcher = broker.positionFetcher;
  // DEC-068 clause (p): locateFetcher is OPTIONAL — env-flag-gated at
  // broker-bootstrap. When omitted, the composer takes the typed-absence
  // path (no broker call) and the trigger declares `long_only_mode`.
  const locateFetcher = broker.locateFetcher;
  const haltStatusFetcher = broker.haltStatusFetcher;
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
  // 1. Read rankings (latest as_of_date).
  const rankings = await deps.rankingsReader(operator_id);

  // 2. Fetch positions + buying power (one BP fetch supplies both equity +
  //    composer BP gate). listOpenPositions populates market_value/current_price.
  const positions = await listOpenPositions.call(positionFetcher, ts);
  const currentPositions: CurrentPosition[] = positions.map(brokerPositionToCurrent);
  const bp = await buyingPowerFetcher.fetchBuyingPower(ts);
  const capitalBase = bp.account_equity;

  // 3. Build candidates from the rankings (anything with rank<=cap on either
  //    side enters the candidate set with the per-name notional we'd plan
  //    if it were primary — used as the BP gate's per-candidate sizing input).
  const cap = SUBSTITUTION_SCAN_CAP_RANK;
  const candidates: PreflightCandidate[] = [];
  // Per-name notional approximation for the BP gate: capital_base / (2 * top-N).
  // The planner re-derives the precise per-name notional after substitution;
  // this is the GATE-level estimate so the BP-insufficient short-circuit fires
  // on a realistic batch dollar load.
  const allocationPct = req.allocationPct ?? 1.0;
  const expectedBookSize = 40; // 2 * PRIMARY_BOOK_TOP_N_PER_SIDE
  const perNameEstimate = capitalBase * allocationPct / expectedBookSize;
  for (const r of rankings) {
    if (r.long_rank >= 1 && r.long_rank <= cap) {
      candidates.push({ symbol: r.ticker, side: 'long', requested_position_size: perNameEstimate });
    }
    if (r.short_rank >= 1 && r.short_rank <= cap) {
      candidates.push({ symbol: r.ticker, side: 'short', requested_position_size: perNameEstimate });
    }
  }

  // 4. §7 PRE-FLIGHT GATE — ssrStatusFetcher OMITTED per DEC-068 (n) typed-absence.
  //    locateFetcher is conditionally injected per DEC-068 (p) env-flag gate;
  //    when omitted the composer routes short candidates through typed-absence.
  const preflight = await composePreflightResults(
    { candidates, internal_expected_bp: bp.available_bp, ts },
    {
      haltStatusFetcher, buyingPowerFetcher,
      ...(locateFetcher ? { locateFetcher } : {}),
      // ssrStatusFetcher: undefined — DEC-068 clause (n) typed-absence.
      operator_id,
      fetcher_source: 'live',
    },
  );

  // 5. planRebalance — the orphaned kernel's first executable invocation.
  const plan = planRebalance({
    rankings,
    preflightResults: preflight.results,
    currentPositions,
    capitalBase,
    ts,
    allocationPct: req.allocationPct,
    noopPct: req.noopPct,
    noopFloorUsd: req.noopFloorUsd,
  });

  // 6. submitRebalance — the orphaned shell's first executable invocation.
  const submissions = await submitRebalance({
    deltas: plan.deltas,
    quoteFetcher,
    buyingPowerFetcher,
    orderSubmitter: broker.submitter,
    acceptanceFetcher: broker.acceptanceFetcher,
    ts,
  });

  // 7. Emit reconciliation_events per result. Throws propagate (DEC-034 (3)).
  for (const r of submissions) {
    await deps.eventWriter.emit(classifySubmissionEvent(r), ts);
  }

  // 8. ACT-324 / FP-057 — equity snapshot. NON-FATAL (the order placement
  //    already succeeded; the snapshot is observational). Uses the equity
  //    + positions ALREADY in hand at steps 2 — NO new broker call. Wrapped
  //    in try/catch like the strategy-audit "write_failed" tolerance pattern.
  const snapshotWriter = deps.snapshotWriter ?? createSupabaseEquitySnapshotWriter();
  try {
    const components = computeEquitySnapshotComponents(currentPositions);
    await snapshotWriter.write({
      operator_id,
      ts,
      account_equity: bp.account_equity,
      cash: null, // BrokerBuyingPower carries available_bp + account_equity; no cash field.
      long_mv: components.long_mv,
      short_mv: components.short_mv,
      gross: components.gross,
      net: components.net,
      source: 'rebalance_fire',
      mode: 'full_rebalance',
    });
  } catch (snapErr) {
    // Non-fatal: log + continue. The placement succeeded; missing snapshot
    // costs one chart point, not order correctness.
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

  // Pre-fetch ONE quote to size the spot-check delta precisely. We pad the
  // notional by 0.1% so submitter's whole-share flooring lands on `qty` even
  // if the limit-price tier kicks in. This pre-fetch is deliberate: spot_check
  // is the WIRING vehicle; sizing precision matters for the operator-visible
  // qty-1 semantics. (Submitter will fetch the quote again — bounded; paper.)
  const refQuote = await args.quoteFetcher.fetchQuote(symbol, ts);
  const refPrice = refQuote.ask > 0
    ? refQuote.ask
    : (refQuote.last !== null && refQuote.last > 0 ? refQuote.last : 1);
  const delta_notional = qty * refPrice * 1.001;

  // ONE LONG-only delta — DEC-068 (n): the first fire is long-clean.
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
  });
}

/**
 * runWriterSmoke — ACT-326 §22.5.1 verification harness.
 *
 * Drives the REAL `eventWriter.emit` code path (which is the production
 * `createSupabaseReconciliationEventWriter` factory in production calls)
 * against the REAL `reconciliation_events` table with a synthesized,
 * schema-distinct SubmissionResult set — ZERO broker calls, ZERO POST
 * /v2/orders. Verifies the writer's mapping against MIG-043 columns +
 * enums + NOT-NULL constraints (the exact code path that failed at corr
 * `bb3810bf` with a payload-column throw).
 *
 * Returns the inserted rows' synthesized SubmissionResults in the standard
 * response envelope so the operator + supervisor can confirm the
 * decomposition shape via the subsequent live-DB read_query.
 */
async function runWriterSmoke(args: {
  operator_id: string;
  ts: Date;
  correlationId: string;
  eventWriter: ReconciliationEventWriter;
}): Promise<RebalanceSubmitResponse> {
  const { operator_id, ts, correlationId, eventWriter } = args;
  // Synthesize one accepted + one rejected SubmissionResult — the two
  // distinct outcome paths (false_positive_within_tolerance / failure_handled)
  // that map to BOTH the divergent and non-divergent column shapes. Symbols
  // are 'SMOKE-A' / 'SMOKE-R' so the rows are trivially queryable + clearly
  // synthetic (no real ticker collision).
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
  });
}

function buildResponse(args: {
  mode: RebalanceMode;
  operator_id: string;
  ts: Date;
  correlationId: string;
  preflight_summary: PreflightComposerSummary | undefined;
  submissions: SubmissionResult[];
  /** Candidate set the composer was invoked with — used to derive
   *  `shorts_skipped_locate_unavailable` on the typed-absence path
   *  (clause (p)). Empty on `spot_check` / `writer_smoke`. */
  candidates: readonly PreflightCandidate[];
}): RebalanceSubmitResponse {
  const counts: Record<SubmissionResult['kind'], number> = {
    accepted: 0, rejected: 0, pending_timeout: 0,
    zero_share_skipped: 0, quote_stale_skipped: 0,
    insufficient_buying_power_skipped: 0, noop_skipped: 0,
  };
  for (const r of args.submissions) counts[r.kind]++;

  // GUARDRAIL 2: SSR is unavailable on both modes (clause (n) typed-absence).
  // The composer carries the bit explicitly on full_rebalance; spot_check
  // mirrors the posture (no SSR fetcher injected anywhere on this trigger).
  const ssr_unavailable = args.preflight_summary?.ssr_unavailable ?? true;
  const shorts_placed_without_ssr_check: string[] = ssr_unavailable
    ? args.submissions
        .filter((r): r is Extract<SubmissionResult, { kind: 'accepted' }> =>
          r.kind === 'accepted' && r.side === 'short')
        .map((r) => r.symbol)
    : [];

  // ── DEC-068 clause (p) — explicit (not inferred) long-only declaration. ──
  const locate_unavailable = args.preflight_summary?.locate_unavailable ?? true;
  const long_only_mode = locate_unavailable || ssr_unavailable;
  const shorts_skipped_locate_unavailable: string[] = locate_unavailable
    ? args.candidates.filter((c) => c.side === 'short').map((c) => c.symbol)
    : [];

  return {
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
  };
}

// ──────────────────────────────────────────────────────────────────────────
// HTTP handler — DEC-023 envelope.
// ──────────────────────────────────────────────────────────────────────────

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  // THE money-path gate — same as longshort-execute.
  await checkPermissionOrThrow(authCtx.user.id, 'longshort.execute');

  const correlationId = authCtx.correlationId;
  const ts = productionClock.getWallClockTs();

  // Diagnostic-503 pre-flight (mirrors longshort-execute).
  if (!alpacaCredsPresent()) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.rebalance.failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: { ts: ts.toISOString(), stage: 'broker_credentials_not_provisioned', trigger: 'manual' },
    });
    return apiError(503, 'broker_credentials_not_provisioned', { correlationId });
  }

  let body: RebalanceSubmitRequest;
  try {
    body = (await req.json()) as RebalanceSubmitRequest;
  } catch {
    return apiError(400, 'invalid_request_body', { correlationId });
  }
  if (body.mode !== 'full_rebalance' && body.mode !== 'spot_check' && body.mode !== 'writer_smoke') {
    return apiError(400, 'invalid_mode', { correlationId });
  }

  const operator_id = body.operator_id ?? DEFAULT_OPERATOR_ID;

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.rebalance.triggered',
    actorId: authCtx.user.id,
    correlationId,
    ipAddress: authCtx.ipAddress ?? undefined,
    userAgent: authCtx.userAgent ?? undefined,
    metadata: { operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'manual' },
  });

  try {
    const result = await runRebalanceSubmit(body, {
      brokerFactory: () => createLiveBrokerInterfaces(),
      eventWriter: createSupabaseReconciliationEventWriter({
        operator_id,
        fetcher_source: 'live',
      }),
      rankingsReader: createSupabaseRankingsReader(),
      ts,
    }, correlationId);

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.rebalance.completed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'manual',
        submission_counts: result.submission_counts,
        ssr_unavailable: result.ssr_unavailable,
        shorts_placed_without_ssr_check_count: result.shorts_placed_without_ssr_check.length,
        // DEC-068 clause (p) §22.5.1 audit-shape gate. The full list of
        // typed-absence short symbols lands here so the operator-gated
        // post-landing re-fire verifies these fields are present in a real
        // longshort_audit_logs row.
        long_only_mode: result.long_only_mode,
        shorts_skipped_locate_unavailable: result.shorts_skipped_locate_unavailable,
      },
    });

    return apiSuccess(result);
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.rebalance.failed',
      actorId: authCtx.user.id,
      correlationId,
      ipAddress: authCtx.ipAddress ?? undefined,
      userAgent: authCtx.userAgent ?? undefined,
      metadata: {
        operator_id, ts: ts.toISOString(), mode: body.mode, trigger: 'manual',
        error: e instanceof Error ? e.message : String(e),
      },
    });
    return apiError(500, 'rebalance_submit_failed', { correlationId });
  }
}));