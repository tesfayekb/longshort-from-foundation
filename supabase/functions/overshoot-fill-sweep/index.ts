/**
 * overshoot-fill-sweep — ACT-489 (H1 fill-adoption) Tier A landing.
 *
 * PURPOSE: entry-run's fill-adoption pipeline (INSERT overshoot_lots on
 * filled_qty > 0) closes when the run's own poll window closes. In live
 * paper it is normal for LIMIT day-TIF orders to fill AFTER that window
 * — leaving live positions at Alpaca with no ledger row and no
 * downstream exit clock. This sweep is the catch-up mechanism: it
 * discovers our OWN submitted orders (by CID recorded in
 * overshoot_audit_logs), reads BROKER TRUTH via GET /v2/orders/{id},
 * and idempotently mints overshoot_lots rows keyed on the broker
 * order_id. Read + adopt only — issues ZERO broker orders — so the I6
 * manual-confirm token gate is intentionally NOT required.
 *
 * Charter (ACT-489, operator-ratified):
 *   Request  : POST { as_of?: 'YYYY-MM-DD', probe?: 'alpaca'|'polygon',
 *                     dry_run?: boolean }
 *   Auth     : X-Cron-Secret for pg_cron, otherwise DEC-023 envelope via
 *              authenticateRequest + overshoot.manage RBAC.
 *   Clock    : injected productionClock; no Date.now() in kernel.
 *   Gates    : (i) kill-switch (strategy_key='overshoot' non-'active'),
 *              (ii) job-disarmed (overshoot.fill_sweep.enabled=false),
 *              (iii) probe (request-level short-circuit; INC-84 §5
 *                   uniform probe envelope echoes RATIFIED_DETECTOR_VERSION).
 *   Pipeline :
 *     (a) discover open CIDs — SELECT DISTINCT (metadata->>'order_id',
 *         'ticker', 'side', 'client_order_id') FROM overshoot_audit_logs
 *         WHERE action='overshoot.entry.submitted.entry'
 *           AND created_at is inside the bounded session-date window
 *           AND (metadata->>'order_id') NOT IN
 *               (SELECT source_order_id::text FROM overshoot_lots
 *                 WHERE source_order_id IS NOT NULL).
 *     (b) per order: fetchFill via OvershootAlpacaFillFetcher
 *         (broker truth: filled_qty, filled_avg_price verbatim; NEVER
 *         our own numbers).
 *     (c) if filled_qty > 0 AND filled_avg_price !== null:
 *         idempotent INSERT INTO overshoot_lots (symbol, entry_ts, qty,
 *         cost_basis, side, status='open', settlement_state='pending',
 *         source_order_id) ON CONFLICT (source_order_id) DO NOTHING
 *         (partial UNIQUE idx from ACT-489 migration guarantees this).
 *         entry_ts = broker filled_at when the fetcher exposes it, else
 *         productionClock (v1 uses now — per-fill-time upgrade path
 *         noted; today's fetcher does not surface filled_at).
 *     (d) emit `overshoot.lot.opened` audit row PER lot — OBSERVABILITY
 *         ONLY. The T+10 exit clock's source of truth is
 *         overshoot_lots.entry_ts consumed by
 *         session-age.computeSessionAge in overshoot-exit-run; this
 *         audit event is NEVER a second home for exit timing.
 *     (e) A5 SET-EQUALITY reconcile: GET /v2/positions vs open lots
 *         grouped by (symbol, side, SUM(qty)). Divergence → INSERT
 *         audit row + RPC
 *         kill_switch_system_pause(strategy_key='overshoot',
 *         source_ref='overshoot.fill_sweep.a5_divergence'), EXCEPT the
 *         artifact-guard case candidates=0 && ledger=0 && broker>0, which
 *         emits overshoot.fill_sweep.discovery_shortfall and DOES NOT pause.
 *
 *   Response accounting (never-silent):
 *     candidates_discovered
 *       = lots_adopted
 *       + already_ledgered_skipped        (CID matched existing lot pre-fetch)
 *       + fill_unfilled_still_working     (filled_qty === 0)
 *       + fill_partial_no_price           (filled_qty > 0 && avg null)
 *       + fetch_errors
 *     a5_reconciliation: { ok, symmetric_diff:[…], soft_paused }
 *
 *   dry_run  : full pipeline; ZERO INSERT / RPC / kill-switch side-effects
 *              (reads only). Response marks dry_run=true.
 *
 * Price/broker source: ALPACA ONLY (broker truth per LIVE-PRICE SOURCE
 * CONTRACT 2026-07-04 — no Polygon reads in this file; the polygon probe
 * short-circuits before pipeline).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

import {
  OvershootAlpacaPaperClient,
  OvershootAlpacaApiError,
  OvershootAlpacaCredentialError,
  OvershootAlpacaNetworkError,
} from '../_shared/overshoot-broker/alpaca-paper-client.ts';
import { OvershootAlpacaFillFetcher } from '../_shared/overshoot-broker/alpaca-fill-fetcher.ts';
import { OvershootAlpacaPositionFetcher } from '../_shared/overshoot-broker/alpaca-position-fetcher.ts';
import { RATIFIED_DETECTOR_VERSION } from '../_shared/overshoot/detector/detector.ts';
import {
  OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
  OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT,
  OVERSHOOT_FILL_SWEEP_VERSION,
  toEtSessionDate,
  computeA5SymmetricDiff,
  shouldInvokePauseForA5Divergence,
  shouldSuppressPauseForDiscoveryShortfall,
  allocateExitFillToLots,
  nextAvgExitPrice,
  realizedPnlDelta,
  type A5Diff,
  type ExitFillAllocationInputLot,
} from './pure.ts';
export { toEtSessionDate, computeA5SymmetricDiff } from './pure.ts';

// ACT-490 gate-0B corrective: postgres-js `Sql` tagged-template surface has
// no exported handle in the driver's ambient types, so we derive it from the
// constructor return type. Narrow, honest, no `any`, no lint-directive.
type Sql = ReturnType<typeof postgres>;
const CRON_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

interface Env {
  supabaseDbUrl: string;
  gitSha: string;
}
function readEnv(): Env {
  return {
    supabaseDbUrl: Deno.env.get('SUPABASE_DB_URL') ?? '',
    gitSha:        Deno.env.get('BUILD_SHA') ?? 'unknown',
  };
}

interface CandidateRow {
  order_id: string;
  ticker: string;
  side: 'long' | 'short';
  client_order_id: string;
  run_id: string | null;
  // M8 (ACT-493 v1 Turn 3B) — provenance carried at INSERT forward. Read
  // verbatim from the entry-run's `overshoot.entry.submitted.entry` audit
  // metadata; these fields are ADDITIVE (older audit rows without them
  // simply write NULL to overshoot_lots.tier_source_*).
  tier: string | null;
  event_run_id: string | null;
  as_of_date: string | null;
}

// ACT-493 v1 Turn 3B — M7 exit-fill discovery row.
interface ExitCandidateRow {
  order_id: string;
  client_order_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  intent: string;
  lot_ids: string[];
  audit_created_at: string;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });

  // INC-97: scheduled invocations carry the anon Authorization header plus
  // X-Cron-Secret. The anon JWT is not a user session, so the cron branch must
  // be authenticated before the manual JWT/RBAC branch.
  let actorId = CRON_OPERATOR_ID;
  if (req.headers.has('X-Cron-Secret')) {
    const cronAuthError = verifyCronSecret(req);
    if (cronAuthError) return cronAuthError;
  } else {
    const authCtx = await authenticateRequest(req);
    await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');
    actorId = authCtx.user.id;
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    return apiError(400, 'invalid_json_body', { correlationId });
  }

  const asOfRaw = body.as_of as string | undefined;
  const asOfDate = asOfRaw ? parseAsOfDate(asOfRaw) : productionClock.getWallClockTs();
  if (!asOfDate) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  const dryRun = body.dry_run === true;
  const probeMode = body.probe as ('alpaca' | 'polygon' | undefined);
  if (probeMode !== undefined && probeMode !== 'alpaca' && probeMode !== 'polygon') {
    return apiError(400, 'probe_invalid_expected_alpaca_or_polygon', { correlationId });
  }

  const env = readEnv();
  if (!env.supabaseDbUrl) return apiError(500, 'db_url_unset', { correlationId });

  // INC-84 §5 boot format assertion (self-attesting deploy).
  if (typeof RATIFIED_DETECTOR_VERSION !== 'string' || !/^[0-9a-f]{8}$/.test(RATIFIED_DETECTOR_VERSION)) {
    return apiError(500, 'boot_assertion_failed_detector_version_malformed', { correlationId });
  }

  // Probe short-circuit — BEFORE the two skip gates (parity with siblings).
  if (probeMode !== undefined) {
    if (probeMode === 'alpaca') {
      try {
        const client = new OvershootAlpacaPaperClient();
        const account = await client.getJson<{ account_number?: string; status?: string }>('/v2/account');
        const acct = typeof account.account_number === 'string' ? account.account_number : '';
        return apiSuccess({
          ok: true, probe: 'alpaca',
          account_last4: acct.length >= 4 ? acct.slice(-4) : null,
          status: typeof account.status === 'string' ? account.status : null,
          paper: true, correlation_id: correlationId,
          detector_version: RATIFIED_DETECTOR_VERSION,
          sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
          discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
        });
      } catch (e) {
        const detail =
          e instanceof OvershootAlpacaApiError ? `alpaca_api_error status=${e.status} endpoint=${e.endpoint}`
          : e instanceof OvershootAlpacaCredentialError ? 'alpaca_credential_missing'
          : e instanceof OvershootAlpacaNetworkError ? `alpaca_network_error endpoint=${e.endpoint}`
          : e instanceof Error ? e.message : String(e);
        console.error('[overshoot-fill-sweep] alpaca probe failed:', detail, { correlationId });
        return apiError(502, 'alpaca_probe_failed', { correlationId });
      }
    }
    // polygon probe: read-through no-op envelope (fill-sweep does no polygon reads).
    return apiSuccess({
      ok: true, probe: 'polygon', snapshot_present: null,
      note: 'fill-sweep does not consume polygon; probe returned for envelope uniformity only.',
      correlation_id: correlationId,
      detector_version: RATIFIED_DETECTOR_VERSION,
      sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
      discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
    });
  }

  const sql: Sql = postgres(env.supabaseDbUrl, { max: 1, prepare: false, connect_timeout: 10 });

  try {
    // ── Skip gates ─────────────────────────────────────────────────────
    const [ks] = await sql<{ state: string | null }[]>`
      SELECT state FROM kill_switches
      WHERE strategy_key = 'overshoot'
      LIMIT 1
    `;
    if (ks && ks.state && ks.state !== 'active') {
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: `kill_switch_${ks.state}`,
        candidates_discovered: 0, lots_adopted: 0,
        sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
        discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
        correlation_id: correlationId,
      });
    }
    const [jr] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM job_registry WHERE id = 'overshoot.fill_sweep'
    `;
    if (!jr || jr.enabled === false) {
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'job_disarmed',
        candidates_discovered: 0, lots_adopted: 0,
        sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
        discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
        correlation_id: correlationId,
      });
    }

    const nowTs = productionClock.getWallClockTs();
    // Session-date single-homing: entry-run tags submitted.entry rows with the
    // UTC calendar date of the broker clock at RTH (see overshoot-entry-run
    // sessionDate derivation). When the operator supplies `as_of` as a
    // YYYY-MM-DD string, treat it verbatim as the session date so discovery
    // joins the entry-run ledger. Only fall back to ET conversion when we are
    // deriving from the wall clock (no `as_of` supplied) — and even then, the
    // UTC-date shape matches entry-run during RTH.
    const sessionDate = asOfRaw ? asOfRaw : toEtSessionDate(asOfDate);

    // ── (a) discover open CIDs from audit ledger ───────────────────────
    // Discovery scoping — entry-run's submitted.entry metadata does NOT
    // carry a session_date field (verified 2026-07-08 against 18 live
    // audit rows on run 3ab99ad5: keys are order_id/ticker/side/
    // client_order_id/run_id/correlation_id/limit_price/qty/regime/etc.,
    // no session_date). Filtering on it returned zero candidates and left
    // 18 broker positions unledgered. Scope by created_at instead
    // (bounded 14-day lookback for scan safety); the authoritative
    // idempotency invariant remains the NOT IN overshoot_lots guard,
    // which is enforced regardless of date window and backed by the
    // partial UNIQUE index on overshoot_lots.source_order_id.
    const candidates = await sql<CandidateRow[]>`
      SELECT DISTINCT
        metadata->>'order_id'         AS order_id,
        metadata->>'ticker'           AS ticker,
        (metadata->>'side')::text     AS side,
        metadata->>'client_order_id'  AS client_order_id,
        metadata->>'run_id'           AS run_id,
        metadata->>'tier'             AS tier,
        metadata->>'event_run_id'     AS event_run_id,
        metadata->>'as_of_date'       AS as_of_date
      FROM overshoot_audit_logs
      WHERE action = 'overshoot.entry.submitted.entry'
        AND created_at >= (${sessionDate}::date - interval '14 days')
        AND created_at <  (${sessionDate}::date + interval '2 days')
        AND metadata->>'order_id' IS NOT NULL
        AND (metadata->>'order_id') NOT IN (
          SELECT source_order_id::text
          FROM overshoot_lots
          WHERE source_order_id IS NOT NULL
        )
      ORDER BY metadata->>'ticker'
    `;

    const client = new OvershootAlpacaPaperClient();
    const fillFetcher = new OvershootAlpacaFillFetcher(client);
    const positionFetcher = new OvershootAlpacaPositionFetcher(client);

    const tally = {
      candidates_discovered: candidates.length,
      lots_adopted: 0,
      already_ledgered_skipped: 0,
      fill_unfilled_still_working: 0,
      fill_partial_no_price: 0,
      fetch_errors: 0,
      // ACT-493 v1 Turn 3B — M7 exit-fill loop tallies.
      exit_candidates_discovered: 0,
      exit_fills_applied_lots: 0,
      exit_fills_no_delta: 0,
      exit_fills_unfilled_still_working: 0,
      exit_fills_partial_no_price: 0,
      exit_fill_overflow_halted: 0,
      exit_fetch_errors: 0,
      lots_closed_by_exit_fill: 0,
    };
    const adopted: Array<{ ticker: string; side: string; qty: number; avg_price: number; lot_id: string | null; order_id: string }> = [];

    for (const c of candidates) {
      try {
        const fill = await fillFetcher.fetchFill(c.order_id, nowTs);
        if (fill.filled_qty === 0) {
          tally.fill_unfilled_still_working += 1;
          continue;
        }
        if (fill.avg_fill_price === null) {
          tally.fill_partial_no_price += 1;
          continue;
        }
        const qty = fill.filled_qty;
        const avg = fill.avg_fill_price;
        const costBasis = avg * qty;

        let lotId: string | null = null;
        if (!dryRun) {
          const rows = await sql<{ lot_id: string }[]>`
            INSERT INTO overshoot_lots
              (symbol, entry_ts, qty, cost_basis, side, status, settlement_state, source_order_id,
               tier, tier_source_event_run_id, tier_source_as_of_date,
               remaining_qty, filled_qty, exit_attempts)
            VALUES
              (${c.ticker}, ${nowTs.toISOString()}::timestamptz, ${qty}, ${costBasis},
               ${c.side}, 'open', 'pending', ${c.order_id},
               ${c.tier}, ${c.event_run_id}, ${c.as_of_date},
               ${qty}, 0, 0)
            ON CONFLICT (source_order_id) WHERE source_order_id IS NOT NULL DO NOTHING
            RETURNING lot_id::text AS lot_id
          `;
          if (rows.length === 0) {
            // ON CONFLICT hit — some other pass adopted it since discovery.
            tally.already_ledgered_skipped += 1;
            continue;
          }
          lotId = rows[0].lot_id;

          // (d) OBSERVABILITY-ONLY audit — NOT a second home for exit clock.
          await writeStrategyAuditEvent({
            strategyKey: 'overshoot',
            action: 'overshoot.lot.opened',
            actorId,
            targetType: 'overshoot_lots',
            targetId: lotId,
            correlationId,
            metadata: {
              symbol: c.ticker, side: c.side, qty, avg_fill_price: avg,
              source_order_id: c.order_id, client_order_id: c.client_order_id,
              run_id: c.run_id, session_date: sessionDate,
              tier: c.tier, tier_source_event_run_id: c.event_run_id,
              tier_source_as_of_date: c.as_of_date,
              adopted_at: nowTs.toISOString(),
              exit_clock_source_of_truth: 'overshoot_lots.entry_ts via computeSessionAge',
              note: 'observability_only_never_consumed_for_exit_timing',
            },
          });
        }
        tally.lots_adopted += 1;
        adopted.push({ ticker: c.ticker, side: c.side, qty, avg_price: avg, lot_id: lotId, order_id: c.order_id });
      } catch (e) {
        tally.fetch_errors += 1;
        console.error('[overshoot-fill-sweep] fetch/insert error', {
          correlationId, order_id: c.order_id, ticker: c.ticker,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ── (M7) exit-fill adoption loop ──────────────────────────────────
    // Charter (ACT-493 v1 Turn 3B, operator-ratified):
    //   Discover our OWN exit orders by `overshoot.exit.submitted.%` audit
    //   rows, read broker truth via GET /v2/orders/{id}, and apply
    //   per-lot fill deltas atomically under the M9 status/closed_at
    //   invariant trigger. Overfill (Σ fills > lot.qty) HALTS the order's
    //   update with a HIGH-severity audit — silent clamp is FORBIDDEN
    //   because it would hide exactly the defect class the in-flight
    //   guard exists to prevent (double-submit / CID collision that
    //   slipped every gate). Partial-exit accounting resets
    //   exit_attempts to 0 on ANY fill (M4a: consecutive fruitless
    //   attempts only).
    const exitAdopted: Array<{
      order_id: string; symbol: string; side: string;
      broker_filled_qty: number; broker_avg_price: number;
      delta_applied: number; lots_touched: number; lots_closed: number;
      overflow: boolean;
    }> = [];
    try {
      const exitCandidates = await sql<ExitCandidateRow[]>`
        SELECT DISTINCT ON (metadata->>'order_id')
          metadata->>'order_id'         AS order_id,
          metadata->>'client_order_id'  AS client_order_id,
          metadata->>'symbol'           AS symbol,
          (metadata->>'side')::text     AS side,
          (metadata->>'qty')::float8    AS qty,
          metadata->>'intent'           AS intent,
          COALESCE(
            (SELECT array_agg(x::text) FROM jsonb_array_elements_text(metadata->'lot_ids') x),
            ARRAY[]::text[]
          )                             AS lot_ids,
          created_at::text              AS audit_created_at
        FROM overshoot_audit_logs
        WHERE action LIKE 'overshoot.exit.submitted.%'
          AND created_at >= (${sessionDate}::date - interval '14 days')
          AND created_at <  (${sessionDate}::date + interval '2 days')
          AND metadata->>'order_id' IS NOT NULL
          AND jsonb_typeof(metadata->'lot_ids') = 'array'
        ORDER BY metadata->>'order_id', created_at DESC
      `;
      tally.exit_candidates_discovered = exitCandidates.length;

      for (const ec of exitCandidates) {
        // CID sanity: filter to our own exit intents; belt-and-braces
        // (the action-prefix filter already scopes to overshoot exit
        // submissions, but reject anything whose CID does not match the
        // strategy regex — INC-99-class defense).
        if (!/^ovs-[0-9a-f]{8}-[A-Z0-9.]{1,10}-[LS]-(exit_time|exit_manual)-\d+$/.test(ec.client_order_id)) {
          continue;
        }
        if (!ec.lot_ids || ec.lot_ids.length === 0) continue;

        let fill;
        try {
          fill = await fillFetcher.fetchFill(ec.order_id, nowTs);
        } catch (fe) {
          tally.exit_fetch_errors += 1;
          console.error('[overshoot-fill-sweep] exit fetch error', {
            correlationId, order_id: ec.order_id, symbol: ec.symbol,
            error: fe instanceof Error ? fe.message : String(fe),
          });
          continue;
        }
        if (fill.filled_qty === 0) {
          tally.exit_fills_unfilled_still_working += 1;
          continue;
        }
        if (fill.avg_fill_price === null) {
          tally.exit_fills_partial_no_price += 1;
          continue;
        }

        // Atomic per-order transaction: SELECT ... FOR UPDATE the lots,
        // compute pure allocation (overfill-safety), then UPDATE inside
        // the same transaction so the M9 trigger applies to the same
        // (status, closed_at) tuple we compute.
        let overflowed = false;
        let deltaAppliedThisOrder = 0;
        let lotsClosedThisOrder = 0;
        let lotsTouchedThisOrder = 0;
        try {
          await sql.begin(async (tx) => {
            const lots = await tx<{
              lot_id: string; symbol: string; side: string;
              qty: number; filled_qty: number; remaining_qty: number;
              cost_basis: number; status: string;
              avg_exit_price: number | null; realized_pnl_partial: number;
            }[]>`
              SELECT lot_id::text AS lot_id, symbol, side,
                     qty::float8 AS qty,
                     filled_qty::float8 AS filled_qty,
                     remaining_qty::float8 AS remaining_qty,
                     cost_basis::float8 AS cost_basis,
                     status,
                     avg_exit_price::float8 AS avg_exit_price,
                     realized_pnl_partial::float8 AS realized_pnl_partial
              FROM overshoot_lots
              WHERE lot_id::text = ANY(${ec.lot_ids})
              ORDER BY array_position(${ec.lot_ids}::text[], lot_id::text)
              FOR UPDATE
            `;
            if (lots.length === 0) return;

            const allocInputs: ExitFillAllocationInputLot[] = lots.map((l) => ({
              lot_id: l.lot_id,
              qty: l.qty,
              filled_qty: l.filled_qty,
              remaining_qty: l.remaining_qty,
            }));
            const alloc = allocateExitFillToLots({
              brokerFilledQty: fill.filled_qty,
              lots: allocInputs,
            });

            if (alloc.overflow) {
              overflowed = true;
              // HALT: emit HIGH-severity audit; do NOT mutate lots. A5
              // reconcile (SUM(remaining_qty) below) provides independent
              // catchment for any residue.
              if (!dryRun) {
                await writeStrategyAuditEvent({
                  strategyKey: 'overshoot',
                  action: 'overshoot.exit_fill_overflow',
                  actorId,
                  targetType: 'overshoot_lots',
                  targetId: ec.order_id,
                  correlationId,
                  metadata: {
                    severity: 'high',
                    order_id: ec.order_id,
                    client_order_id: ec.client_order_id,
                    symbol: ec.symbol,
                    side: ec.side,
                    intent: ec.intent,
                    broker_filled_qty: alloc.broker_filled_qty,
                    already_applied_total: alloc.already_applied_total,
                    delta_to_apply: alloc.delta_to_apply,
                    unallocated_residual: alloc.unallocated_residual,
                    lot_ids: ec.lot_ids,
                    reason: alloc.overflow_reason,
                    action_taken: 'halted_no_clamp',
                    guidance:
                      'Silent clamp is forbidden. This means a double-submit or CID collision slipped every guard; a human must investigate before re-arming exits.',
                    sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
                    exit_discovery_query_fingerprint:
                      OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT,
                  },
                });
              }
              return; // abort tx body; no UPDATE
            }

            if (alloc.per_lot_deltas.length === 0) {
              // No delta — cumulative broker fill equals already-applied
              // total; idempotent no-op.
              return;
            }

            for (const d of alloc.per_lot_deltas) {
              const lot = lots.find((l) => l.lot_id === d.lot_id)!;
              const entryAvg = lot.qty > 0 ? lot.cost_basis / lot.qty : 0;
              const nextAvg = nextAvgExitPrice({
                prevFilledQty: lot.filled_qty,
                prevAvgExitPrice: lot.avg_exit_price,
                deltaQty: d.delta_qty,
                brokerAvgFillPrice: fill.avg_fill_price!,
              });
              const pnlInc = realizedPnlDelta({
                side: (lot.side === 'long' ? 'long' : 'short'),
                deltaQty: d.delta_qty,
                brokerAvgFillPrice: fill.avg_fill_price!,
                entryAvgPrice: entryAvg,
              });
              const newFilled = lot.filled_qty + d.delta_qty;
              const newRemaining = lot.qty - newFilled;
              const willClose = d.will_close;

              if (!dryRun) {
                await tx`
                  UPDATE overshoot_lots
                     SET filled_qty            = ${newFilled},
                         remaining_qty         = ${newRemaining},
                         avg_exit_price        = ${nextAvg},
                         realized_pnl_partial  = realized_pnl_partial + ${pnlInc},
                         exit_attempts         = 0,
                         status                = ${willClose ? 'closed' : 'open'},
                         closed_at             = ${willClose ? nowTs.toISOString() : null},
                         updated_at            = now()
                   WHERE lot_id = ${d.lot_id}::uuid
                `;
                await writeStrategyAuditEvent({
                  strategyKey: 'overshoot',
                  action: 'overshoot.exit.fill.applied',
                  actorId,
                  targetType: 'overshoot_lots',
                  targetId: d.lot_id,
                  correlationId,
                  metadata: {
                    order_id: ec.order_id,
                    client_order_id: ec.client_order_id,
                    symbol: ec.symbol,
                    side: ec.side,
                    intent: ec.intent,
                    lot_id: d.lot_id,
                    delta_qty: d.delta_qty,
                    filled_qty_after: newFilled,
                    remaining_qty_after: newRemaining,
                    avg_exit_price_after: nextAvg,
                    realized_pnl_partial_delta: pnlInc,
                    broker_filled_qty: fill.filled_qty,
                    broker_avg_fill_price: fill.avg_fill_price,
                    lot_closed: willClose,
                    exit_attempts_reset_to_zero: true,
                    sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
                    exit_discovery_query_fingerprint:
                      OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT,
                  },
                });
              }
              deltaAppliedThisOrder += d.delta_qty;
              lotsTouchedThisOrder += 1;
              if (willClose) lotsClosedThisOrder += 1;
            }
          });
        } catch (txErr) {
          tally.exit_fetch_errors += 1;
          console.error('[overshoot-fill-sweep] exit tx error', {
            correlationId, order_id: ec.order_id,
            error: txErr instanceof Error ? txErr.message : String(txErr),
          });
          continue;
        }

        if (overflowed) {
          tally.exit_fill_overflow_halted += 1;
        } else if (deltaAppliedThisOrder === 0) {
          tally.exit_fills_no_delta += 1;
        } else {
          tally.exit_fills_applied_lots += lotsTouchedThisOrder;
          tally.lots_closed_by_exit_fill += lotsClosedThisOrder;
        }
        exitAdopted.push({
          order_id: ec.order_id, symbol: ec.symbol, side: ec.side,
          broker_filled_qty: fill.filled_qty,
          broker_avg_price: fill.avg_fill_price ?? 0,
          delta_applied: deltaAppliedThisOrder,
          lots_touched: lotsTouchedThisOrder,
          lots_closed: lotsClosedThisOrder,
          overflow: overflowed,
        });
      }
    } catch (m7err) {
      console.error('[overshoot-fill-sweep] M7 exit-fill loop failed', {
        correlationId, error: m7err instanceof Error ? m7err.message : String(m7err),
      });
    }

    // ── (e) A5 set-equality reconcile ──────────────────────────────────
    let a5: {
      ok: boolean;
      symmetric_diff: A5Diff[];
      soft_paused: boolean;
      broker_count: number;
      ledger_count: number;
      error?: string;
      discovery_shortfall?: boolean;
      warning?: string;
    } = { ok: true, symmetric_diff: [], soft_paused: false, broker_count: 0, ledger_count: 0 };
    const warnings: string[] = [];
    try {
      const brokerPositions = await positionFetcher.listOpenPositions(nowTs);
      // ACT-493 v1 Turn 3B — A5 now compares broker qty against
      // SUM(remaining_qty) — not SUM(qty) — so partial-exit adoption
      // reconciles correctly (a lot in status='open' with filled_qty>0
      // has a smaller residual than its original qty). Closed lots are
      // filtered out; their remaining_qty=0 anyway.
      const openLots = await sql<{ symbol: string; side: string; qty: number }[]>`
        SELECT symbol, side, SUM(remaining_qty)::float8 AS qty
        FROM overshoot_lots
        WHERE status = 'open'
          AND remaining_qty > 0
        GROUP BY symbol, side
        HAVING SUM(remaining_qty) > 0
      `;
      const brokerMap = new Map<string, { side: string; qty: number }>();
      for (const p of brokerPositions) {
        // Broker side is 'long' | 'short'; take absolute qty.
        const key = `${p.symbol}|${(p as unknown as { side?: string }).side ?? (p.qty >= 0 ? 'long' : 'short')}`;
        const side = (p as unknown as { side?: string }).side ?? (p.qty >= 0 ? 'long' : 'short');
        brokerMap.set(key, { side, qty: Math.abs(p.qty) });
      }
      const ledgerMap = new Map<string, { side: string; qty: number }>();
      for (const l of openLots) {
        ledgerMap.set(`${l.symbol}|${l.side}`, { side: l.side, qty: Number(l.qty) });
      }
      const diffs = computeA5SymmetricDiff(brokerMap, ledgerMap);
      const discoveryShortfall = shouldSuppressPauseForDiscoveryShortfall({
        candidatesDiscovered: tally.candidates_discovered,
        brokerCount: brokerMap.size,
        ledgerCount: ledgerMap.size,
      });
      const discoveryShortfallWarning = 'discovery_shortfall: broker positions exist while discovery and ledger are both zero; suppressed kill-switch pause and emitted audit on live run';
      a5 = {
        ok: diffs.length === 0,
        symmetric_diff: diffs,
        soft_paused: false,
        broker_count: brokerMap.size,
        ledger_count: ledgerMap.size,
        discovery_shortfall: discoveryShortfall,
        warning: discoveryShortfall ? discoveryShortfallWarning : undefined,
      };
      if (discoveryShortfall) {
        warnings.push(discoveryShortfallWarning);
        if (!dryRun) {
          await writeStrategyAuditEvent({
            strategyKey: 'overshoot',
            action: 'overshoot.fill_sweep.discovery_shortfall',
            actorId,
            targetType: 'overshoot_lots',
            correlationId,
            metadata: {
              session_date: sessionDate,
              broker_count: brokerMap.size,
              ledger_count: ledgerMap.size,
              candidates_discovered: tally.candidates_discovered,
              divergence_count: diffs.length,
              diffs,
              kill_switch_pause_suppressed: true,
              sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
              discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
            },
          });
        }
      }
      if (shouldInvokePauseForA5Divergence({ diffCount: diffs.length, dryRun, discoveryShortfall })) {
        // Persist divergence as an audit row (T4 per-strategy audit table).
        // overshoot_reconciliation_state is a firing-frequency tracker with
        // per-(operator,symbol,call_name) shape — wrong home for a full-diff
        // event. The audit row is the durable divergence record; the
        // soft-pause RPC below is the operational side-effect.
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.fill_sweep.a5_divergence',
          actorId,
          targetType: 'overshoot_lots',
          correlationId,
          metadata: {
            session_date: sessionDate,
            broker_count: brokerMap.size,
            ledger_count: ledgerMap.size,
            divergence_count: diffs.length,
            diffs,
            sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
            discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
          },
        });
        await sql`
          SELECT public.kill_switch_system_pause(
            'overshoot'::text,
            ${`A5 divergence: broker=${brokerMap.size} ledger=${ledgerMap.size} diffs=${diffs.length}`}::text,
            'overshoot.fill_sweep.a5_divergence'::text
          )
        `.catch((err: unknown) => {
          console.error('[overshoot-fill-sweep] kill_switch_system_pause failed', {
            correlationId, error: err instanceof Error ? err.message : String(err),
          });
        });
        a5.soft_paused = true;
      }
    } catch (e) {
      a5.ok = false;
      a5.error = e instanceof Error ? e.message : String(e);
      console.error('[overshoot-fill-sweep] A5 reconcile failed', { correlationId, error: a5.error });
    }

    // INC-97: durable per-tick artifact. The watchdog must observe the sweep's
    // own execution, never borrow a fresh entry-run timestamp as a proxy.
    if (!dryRun) {
      const tickAudit = await writeStrategyAuditEvent({
        strategyKey: 'overshoot',
        action: 'overshoot.fill_sweep.tick',
        actorId,
        targetType: 'job_registry',
        targetId: 'overshoot.fill_sweep',
        correlationId,
        metadata: {
          session_date: sessionDate,
          candidates_discovered: tally.candidates_discovered,
          lots_adopted: tally.lots_adopted,
          fill_unfilled_still_working: tally.fill_unfilled_still_working,
          fetch_errors: tally.fetch_errors,
          a5_ok: a5.ok,
          broker_count: a5.broker_count,
          ledger_count: a5.ledger_count,
          sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
        },
      });
      if (!tickAudit.success) warnings.push(`tick_audit_failed:${tickAudit.code}`);
    }

    await sql.end({ timeout: 5 });

    return apiSuccess({
      outcome: 'completed',
      dry_run: dryRun,
      session_date: sessionDate,
      candidates_discovered: tally.candidates_discovered,
      lots_adopted: tally.lots_adopted,
      already_ledgered_skipped: tally.already_ledgered_skipped,
      fill_unfilled_still_working: tally.fill_unfilled_still_working,
      fill_partial_no_price: tally.fill_partial_no_price,
      fetch_errors: tally.fetch_errors,
      adopted,
      // ACT-493 v1 Turn 3B — M7 exit-fill accounting (never-silent).
      exit_candidates_discovered: tally.exit_candidates_discovered,
      exit_fills_applied_lots: tally.exit_fills_applied_lots,
      exit_fills_no_delta: tally.exit_fills_no_delta,
      exit_fills_unfilled_still_working: tally.exit_fills_unfilled_still_working,
      exit_fills_partial_no_price: tally.exit_fills_partial_no_price,
      exit_fill_overflow_halted: tally.exit_fill_overflow_halted,
      exit_fetch_errors: tally.exit_fetch_errors,
      lots_closed_by_exit_fill: tally.lots_closed_by_exit_fill,
      exit_adopted: exitAdopted,
      exit_discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT,
      a5_reconciliation: a5,
      warnings,
      detector_version: RATIFIED_DETECTOR_VERSION,
      sweep_version: OVERSHOOT_FILL_SWEEP_VERSION,
      discovery_query_fingerprint: OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT,
      git_sha: env.gitSha,
      correlation_id: correlationId,
    });
  } catch (err) {
    try { await sql.end({ timeout: 5 }); } catch { /* noop */ }
    console.error('[overshoot-fill-sweep] unhandled', {
      correlationId, error: err instanceof Error ? err.message : String(err),
    });
    return apiError(500, 'fill_sweep_unhandled_error', { correlationId });
  }
}));