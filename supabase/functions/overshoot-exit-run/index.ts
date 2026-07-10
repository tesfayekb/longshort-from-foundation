/**
 * overshoot-exit-run — FP-069 W3.6.d-ii (ACT-463.d-ii).
 *
 * T+5 time-stop exit-cron handler + operator-manual liquidation path.
 * DISARMED at seed (MIG-153, `overshoot.exit.run`, enabled=false).
 * Operator arms at post-W3.6.d attestation via sql/32.
 *
 * Contract (all operator-ratified — do NOT drift):
 *   Request  : POST { as_of?: 'YYYY-MM-DD', probe?: 'alpaca'|'polygon',
 *                     dry_run?: boolean, manual_confirm?: boolean,
 *                     second_confirm_token?: string }
 *   Auth     : DEC-023 envelope via createHandler + authenticateRequest +
 *              overshoot.manage RBAC.
 *   Clock    : injected productionClock (banned Date.now() in kernel path).
 *   Boot     : same shape as detection-run (RATIFIED_STUDY_RUN_ID row
 *              exists in overshoot_study_runs, param_grid_hash prefix,
 *              outcome='completed'). ALSO imports the three W3.6.d-i
 *              exported constants
 *                OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG (per-side, ACT-471)
 *                OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT (per-side, ACT-472)
 *                OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS
 *                OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS
 *              so a d-i export drift surfaces at edge boot, not at first
 *              money-path fire. T3a (ACT-480) — the uniform alias
 *              OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS was DELETED at this
 *              landing and computeSessionAge is called with the per-lot
 *              side; INC-84 §5 probe envelope now echoes
 *              RATIFIED_DETECTOR_VERSION on both alpaca + polygon probes.
 *   Probes   : body.probe short-circuits BEFORE the three skip gates.
 *              Returns probe-only envelope; no pipeline stage runs.
 *   Gates    : (i) kill-switch (strategy_key='overshoot' non-'active'),
 *              (ii) job-disarmed (overshoot.exit.run.enabled=false),
 *              (iii) probe (request-level short-circuit; see above).
 *   I6 gate  : `manual_confirm=true` requires a matching
 *              `overshoot.exit.manual_triggered` audit row written by the
 *              same actor within OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS whose
 *              metadata.confirm_token equals `second_confirm_token`.
 *              Missing / stale / mismatched → 428 typed refusal
 *              typed 428 refusal on missing/stale/mismatched token. Cron path
 *              (manual_confirm !== true) is exempt from this gate.
 *   Pipeline : /v2/clock (PIN-2 — record minutes_to_close; typed
 *              `market_closed` refusal on holidays/weekends) →
 *              broker positions (OvershootAlpacaPositionFetcher) →
 *              overshoot_lots WHERE status='open' →
 *              reconcileOpenPositions (d-i module; ALL FOUR refusal
 *              classes persisted to overshoot_audit_logs, never skipped)
 *              → per reconciled MATCHED lot:
 *                cron path : computeSessionAge (d-i; PIN-1 semantics);
 *                            skip when !shouldFireTimeExit.
 *                manual    : skip session-age (operator override).
 *                → Polygon /v2/snapshot/locale/us/markets/stocks/tickers
 *                  quote → constructExitLimitPrice (d-i; four typed
 *                  refusals).
 *                → submitter POST with exit_time / exit_manual CID
 *                  (attempt run-scoped; W3.6.a intents + CID).
 *   Persist  : run row (overshoot_exit_runs? — NOT built this wave;
 *              persistence is on overshoot_audit_logs per T4 + the
 *              response envelope for the operator response). Every
 *              named refusal writes ONE audit row with action
 *              'overshoot.exit.<class>' and full accounting metadata.
 *   Accounting identity (NEVER-SILENT-DROP, evidenced in response):
 *     positions_examined = exits_submitted
 *                        + reconciliation_refusals (4 classes)
 *                        + session_age_no_fire
 *                        + session_age_query_failed     -- ACT-468 H0
 *                        + snapshot_fetch_failed        -- ACT-468 H0
 *                        + per_lot_unexpected           -- ACT-468 H0
 *                        + exit_price_refusals (4 classes)
 *                        + market_closed_skips
 *   Per-lot isolation (ACT-468 H0): the per-lot for-body is wrapped so
 *   ANY per-lot failure (session-age SQL throw, polygon snapshot throw,
 *   or unexpected error in exit-price / submit) yields a TYPED per-lot
 *   outcome and the loop CONTINUES. Run-level failures (boot, kill-
 *   switch, disarmed, clock, broker positions, open-lots SELECT) stay
 *   run-level. See the boundary comment above the loop for details.
 *   dry_run  : full pipeline; ZERO order submissions; response marks
 *              dry_run=true so the accounting identity above is
 *              observable without moving money.
 *
 * Price source: POLYGON ONLY (Stocks Advanced, POLYGON_API_KEY_PROD_PROBE).
 * Alpaca market-data endpoints (the data-host / stocks-quotes surface) are
 * FORBIDDEN in this file -- see the separation-guard grep in W3.6.d-ii
 * gates. Alpaca is used ONLY for broker truth (clock, positions, orders).
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
import { OvershootAlpacaPositionFetcher } from '../_shared/overshoot-broker/alpaca-position-fetcher.ts';
import { OvershootAlpacaOrderSubmitter } from '../_shared/overshoot-broker/alpaca-order-submitter.ts';
import {
  RATIFIED_STUDY_RUN_ID,
  RATIFIED_PARAM_GRID_HASH_PREFIX,
  RATIFIED_DETECTOR_VERSION,
} from '../_shared/overshoot/detector/detector.ts';

// ── W3.6.a intent / CID + W3.6.d-i module imports (boot-drift surface). ──
import { buildOvershootClientOrderId, type OvershootSide } from '../_shared/overshoot-execution/client-order-id.ts';
import { computeSessionAge, type OvershootMarketClockSnapshot } from '../_shared/overshoot-execution/session-age.ts';
import {
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG,
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT,
} from '../_shared/overshoot-execution/intents.ts';
import {
  OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS,
  OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS,
  constructExitLimitPrice,
  type PolygonQuoteSnapshot,
} from '../_shared/overshoot-execution/exit-price-construction.ts';
import {
  reconcileOpenPositions,
  type ReconciliationSide,
} from '../_shared/overshoot-execution/position-reconciliation.ts';

// I6 manual-confirm window (ratified: 15 minutes).
const OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS = 15 * 60 * 1000;

interface Env {
  supabaseDbUrl: string;
  polygonKey: string;
  gitSha: string;
}
function readEnv(): Env {
  return {
    supabaseDbUrl: Deno.env.get('SUPABASE_DB_URL') ?? '',
    polygonKey:    Deno.env.get('POLYGON_API_KEY_PROD_PROBE') ?? '',
    gitSha:        Deno.env.get('BUILD_SHA') ?? 'unknown',
  };
}

interface AlpacaClockResponse {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

/** Polygon /v2/snapshot/locale/us/markets/stocks/tickers/{sym} response
 *  (partial; we consume only last-quote fields). Read-only fence: the
 *  ONLY market-data host allowed in this file. */
interface PolygonSnapshotResponse {
  status?: string;
  ticker?: {
    ticker?: string;
    lastQuote?: { p?: number; P?: number; s?: number; S?: number; t?: number };
  };
}

async function fetchPolygonSnapshot(
  polygonKey: string,
  symbol: string,
): Promise<PolygonQuoteSnapshot | null> {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(symbol)}?apiKey=${polygonKey}`;
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) { try { await resp.text(); } catch { /* noop */ } return null; }
  const j = await resp.json() as PolygonSnapshotResponse;
  const lq = j?.ticker?.lastQuote;
  if (!lq || typeof lq.p !== 'number' || typeof lq.P !== 'number' || typeof lq.t !== 'number') {
    return null;
  }
  return {
    symbol,
    bid: lq.p,
    ask: lq.P,
    // Polygon `t` for stocks quotes is nanoseconds. Convert to ms Date.
    capturedAt: new Date(Math.floor(lq.t / 1_000_000)),
  };
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

interface OpenLotRow {
  lot_id: string;
  symbol: string;
  qty: number;
  side: ReconciliationSide;
  entry_ts: string; // ISO
}

interface RefusalTally {
  reconciliation: { lot_without_broker_position: number; unknown_broker_position: number; side_mismatch: number; qty_mismatch: number };
  exit_price:     { polygon_snapshot_unavailable: number; polygon_snapshot_stale: number; polygon_snapshot_malformed: number; polygon_snapshot_crossed: number };
  session_age_no_fire: number;
  session_age_query_failed: number;
  snapshot_fetch_failed: number;
  per_lot_unexpected: number;
  submissions_failed: number;
}
function newTally(): RefusalTally {
  return {
    reconciliation: { lot_without_broker_position: 0, unknown_broker_position: 0, side_mismatch: 0, qty_mismatch: 0 },
    exit_price:     { polygon_snapshot_unavailable: 0, polygon_snapshot_stale: 0, polygon_snapshot_malformed: 0, polygon_snapshot_crossed: 0 },
    session_age_no_fire: 0,
    session_age_query_failed: 0,
    snapshot_fetch_failed: 0,
    per_lot_unexpected: 0,
    submissions_failed: 0,
  };
}

/**
 * DEC-023 handler. Ordering (STRICT):
 *   (1) method + JSON parse (BEFORE auth so 4xx are clean).
 *   (2) RBAC overshoot.manage.
 *   (3) Boot assertion (RATIFIED_STUDY_RUN_ID row exists + d-i constants
 *       imported statically — an import drift surfaces at module load).
 *   (4) Probe short-circuit — BEFORE the three skip gates.
 *   (5) Skip gates: kill-switch, disarmed.
 *   (6) I6 manual-confirm gate (manual path only).
 *   (7) Pipeline: clock → positions → lots → reconcile → per-lot (session
 *       age, snapshot, exit price, submit) → response with accounting.
 */
Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // INC-99 / ACT-503: cron-first branch mirrors overshoot-fill-sweep
  // (supabase/functions/overshoot-fill-sweep/index.ts:132-143). Scheduled
  // invocations carry the anon Authorization header plus X-Cron-Secret; the
  // anon JWT is not a user session, so the cron branch MUST be authenticated
  // before the manual JWT/RBAC branch. Cron path substitutes a synthetic
  // operator id (matches fill-sweep CRON_OPERATOR_ID).
  const CRON_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
  let authCtx: { user: { id: string } };
  let isCronAuth = false;
  if (req.headers.has('X-Cron-Secret')) {
    const cronAuthError = verifyCronSecret(req);
    if (cronAuthError) return cronAuthError;
    authCtx = { user: { id: CRON_OPERATOR_ID } };
    isCronAuth = true;
  } else {
    const jwtCtx = await authenticateRequest(req);
    await checkPermissionOrThrow(jwtCtx.user.id, 'overshoot.manage');
    authCtx = { user: { id: jwtCtx.user.id } };
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
  const manualConfirm = body.manual_confirm === true;
  const secondConfirmToken = typeof body.second_confirm_token === 'string' ? body.second_confirm_token : null;
  const probeMode = body.probe as ('alpaca' | 'polygon' | undefined);
  if (probeMode !== undefined && probeMode !== 'alpaca' && probeMode !== 'polygon') {
    return apiError(400, 'probe_invalid_expected_alpaca_or_polygon', { correlationId });
  }

  const env = readEnv();
  if (!env.supabaseDbUrl) return apiError(500, 'db_url_unset', { correlationId });

  const sql = postgres(env.supabaseDbUrl, { max: 1, prepare: false, connect_timeout: 10 });

  try {
    // ── (3) Boot assertion — before ANY pipeline stage or gate. ─────────
    const priors = await sql<{ run_id: string }[]>`
      SELECT run_id
      FROM overshoot_study_runs
      WHERE run_id = ${RATIFIED_STUDY_RUN_ID}::uuid
        AND param_grid_hash LIKE ${RATIFIED_PARAM_GRID_HASH_PREFIX + '%'}
        AND outcome = 'completed'
    `;
    if (priors.length !== 1) {
      await sql.end({ timeout: 5 });
      console.error(JSON.stringify({
        event: 'boot_assertion_failed_priors_not_found',
        correlationId,
        expected_run_id: RATIFIED_STUDY_RUN_ID,
        expected_hash_prefix: RATIFIED_PARAM_GRID_HASH_PREFIX,
        rows_found: priors.length,
      }));
      return apiError(500, 'boot_assertion_failed_priors_not_found', { correlationId });
    }
    // Drift-canary: the three d-i constants are statically imported above;
    // a `void` reference guarantees they are not tree-shaken and any
    // rename lands as a compile-time break at deploy, not at first fire.
    void OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG;
    void OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT;
    void OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS;
    void OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS;

    // T3a (ACT-480) — INC-84 §5 generalization: every engine's probe
    // envelope echoes the ratified detector_version so deploys are
    // self-attesting via unauthenticated probe rather than SHA stamp.
    if (typeof RATIFIED_DETECTOR_VERSION !== 'string' || !/^[0-9a-f]{8}$/.test(RATIFIED_DETECTOR_VERSION)) {
      await sql.end({ timeout: 5 });
      console.error(JSON.stringify({
        event: 'boot_assertion_failed_detector_version_malformed',
        correlationId,
        loaded_value_typeof: typeof RATIFIED_DETECTOR_VERSION,
      }));
      return apiError(500, 'boot_assertion_failed_detector_version_malformed', { correlationId });
    }

    // ── (4) Probe short-circuit — BEFORE the three skip gates. ──────────
    if (probeMode !== undefined) {
      await sql.end({ timeout: 5 });
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
          });
        } catch (e) {
          const detail =
            e instanceof OvershootAlpacaApiError ? `alpaca_api_error status=${e.status} endpoint=${e.endpoint}`
            : e instanceof OvershootAlpacaCredentialError ? 'alpaca_credential_missing'
            : e instanceof OvershootAlpacaNetworkError ? `alpaca_network_error endpoint=${e.endpoint}`
            : e instanceof Error ? e.message : String(e);
          console.error('[overshoot-exit-run] alpaca probe failed:', detail, { correlationId });
          return apiError(502, 'alpaca_probe_failed', { correlationId });
        }
      }
      // probeMode === 'polygon' — snapshot round-trip on SPY (universe-safe).
      if (!env.polygonKey) return apiError(500, 'polygon_key_unset', { correlationId });
      try {
        const snap = await fetchPolygonSnapshot(env.polygonKey, 'SPY');
        return apiSuccess({
          ok: true, probe: 'polygon',
          snapshot_present: snap !== null,
          correlation_id: correlationId,
          detector_version: RATIFIED_DETECTOR_VERSION,
        });
      } catch (e) {
        console.error('[overshoot-exit-run] polygon probe failed:', String(e), { correlationId });
        return apiError(502, 'polygon_probe_failed', { correlationId });
      }
    }

    // ── (5) Skip gates ──────────────────────────────────────────────────
    const [ks] = await sql<{ state: string | null }[]>`
      SELECT state FROM kill_switches
      WHERE strategy_key = 'overshoot'
      LIMIT 1
    `;
    if (ks && ks.state && ks.state !== 'active') {
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: `kill_switch_${ks.state}`,
        positions_examined: 0, exits_submitted: 0,
        correlation_id: correlationId,
      });
    }
    const [jr] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM job_registry WHERE id = 'overshoot.exit.run'
    `;
    if (jr && jr.enabled === false) {
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'job_disarmed',
        positions_examined: 0, exits_submitted: 0,
        correlation_id: correlationId,
      });
    }

    // ── (6) I6 second-confirm token gate (manual path only) ─────────────
    if (manualConfirm) {
      // INC-99 ruling (a): cron-authenticated caller can NEVER submit via
      // the manual path. The shim widens auth, never narrows the two-man
      // rule. Hard-reject before the token lookup so the operator_id ==
      // CRON_OPERATOR_ID coincidence can never be exploited.
      if (isCronAuth) {
        await sql.end({ timeout: 5 });
        return apiError(428, 'manual_confirm_forbidden_on_cron_auth', { correlationId });
      }
      if (!secondConfirmToken) {
        await sql.end({ timeout: 5 });
        return apiError(428, 'manual_confirm_token_missing_or_invalid', { correlationId });
      }
      const cutoff = new Date(Date.now() - OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS).toISOString();
      const trigger = await sql<{ id: string }[]>`
        SELECT id FROM overshoot_audit_logs
        WHERE action = 'overshoot.exit.manual_triggered'
          AND operator_id = ${authCtx.user.id}::uuid
          AND created_at >= ${cutoff}::timestamptz
          AND metadata->>'confirm_token' = ${secondConfirmToken}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (trigger.length !== 1) {
        await sql.end({ timeout: 5 });
        return apiError(428, 'manual_confirm_token_missing_or_invalid', { correlationId });
      }
    }

    // ── (7) Pipeline ────────────────────────────────────────────────────
    if (!env.polygonKey) { await sql.end({ timeout: 5 }); return apiError(500, 'polygon_key_unset', { correlationId }); }

    const nowTs = productionClock.getWallClockTs();
    const client = new OvershootAlpacaPaperClient();

    // (a) /v2/clock — PIN-2 seam. Broker STATE (not market-data).
    let clockSnap: OvershootMarketClockSnapshot | null;
    try {
      const raw = await client.getJson<AlpacaClockResponse>('/v2/clock');
      const nextClose = new Date(raw.next_close);
      const minutesToClose = Math.max(0, Math.round((nextClose.getTime() - nowTs.getTime()) / 60_000));
      // Session date in NY, ISO date; use next_open/next_close date bracket.
      const sessionDate = (raw.is_open ? new Date(raw.timestamp) : new Date(raw.next_open))
        .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      clockSnap = {
        sessionDate,
        isMarketOpen: raw.is_open,
        minutesToClose,
        isHoliday: false, // Alpaca /v2/clock does not expose holiday flag; weekend/holiday collapses to !is_open.
      };
    } catch (e) {
      clockSnap = null;
      console.error('[overshoot-exit-run] clock fetch failed:', String(e), { correlationId });
    }
    if (clockSnap === null) {
      await sql.end({ timeout: 5 });
      return apiError(502, 'market_clock_unavailable', { correlationId });
    }
    if (!clockSnap.isMarketOpen) {
      // PIN-2: exits do NOT fire when the market is closed. Cron-attributed
      // no-op with truthful accounting. Manual path also refuses — never
      // submit outside RTH from this engine.
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'market_closed',
        minutes_to_close: clockSnap.minutesToClose,
        positions_examined: 0, exits_submitted: 0,
        correlation_id: correlationId, dry_run: dryRun,
      });
    }

    // (b) broker positions + (c) open lots.
    const positionFetcher = new OvershootAlpacaPositionFetcher(client);
    const brokerPositionsRaw = await positionFetcher.listOpenPositions(nowTs);
    const brokerPositions = brokerPositionsRaw.map((p) => ({
      symbol: p.symbol,
      qty: Math.abs(p.qty),
      side: (p.qty < 0 ? 'short' : 'long') as ReconciliationSide,
    }));

    const openLots = await sql<OpenLotRow[]>`
      SELECT lot_id::text AS lot_id, symbol, qty::float8 AS qty, side, entry_ts::text AS entry_ts
      FROM overshoot_lots
      WHERE status = 'open'
    `;

    const positionsExamined = brokerPositions.length + openLots.length;

    // (d) reconcile.
    const report = reconcileOpenPositions({
      brokerPositions,
      openLots: openLots.map((l) => ({ lot_id: l.lot_id, symbol: l.symbol, qty: Number(l.qty), side: l.side })),
    });

    const tally = newTally();

    // Persist each reconciliation refusal to overshoot_audit_logs (T4).
    for (const r of report.refusals) {
      tally.reconciliation[r.status] = (tally.reconciliation[r.status] ?? 0) + 1;
      await writeStrategyAuditEvent({
        strategyKey: 'overshoot',
        action: `overshoot.exit.reconciliation_refusal.${r.status}`,
        actorId: authCtx.user.id,
        targetType: 'overshoot_lots',
        targetId: r.symbol,
        correlationId,
        metadata: {
          symbol: r.symbol,
          reason: r.reason,
          brokerSide: r.brokerSide, brokerQty: r.brokerQty,
          lotSide: r.lotSide, lotQty: r.lotQty,
          lot_ids: r.lotIds,
          dry_run: dryRun,
          manual: manualConfirm,
        },
      });
    }

    // Group matched entries so we can attribute per (symbol, side) with all
    // constituent lot_ids captured in the CID metadata / audit rows.
    const submissions: Array<{
      symbol: string; side: ReconciliationSide; qty: number; lot_ids: readonly string[];
      order_id: string | null; client_order_id: string; limit_price: number; refusal?: string;
    }> = [];

    // Deterministic run_id for CID scoping. Attempt=0 for the first pass.
    // Retry (attempt++) is not handled inside a single cron tick; the next
    // cron tick creates a fresh run_id.
    const runId = crypto.randomUUID();
    const intent = manualConfirm ? 'exit_manual' : 'exit_time';

    for (const m of report.matched) {
      // ── ACT-468 H0: PER-LOT ERROR ISOLATION BOUNDARY ────────────────────
      // Wrap the ENTIRE per-lot body so ANY per-lot failure (session-age
      // SQL throw, polygon snapshot network throw, or an unexpected error
      // in exit-price / submit path) produces a TYPED per-lot outcome,
      // persists an audit row with the error class + correlation, and lets
      // the loop CONTINUE to the next lot. One bad lot MUST NOT abandon
      // the rest of the day's exits.
      //
      // BOUNDARY (explicit): RUN-LEVEL failures — boot assertion, kill-
      // switch / disarmed / probe branches, /v2/clock, broker positions
      // fetch, open-lots SELECT, reconciliation setup, DB URL / polygon
      // key config — are NOT per-lot-wrapped. They stay run-level and
      // abort the entire tick (caught by the outer try/catch that returns
      // 500 exit_run_unhandled_error). Per-lot wrap begins here and ends
      // at the end of the for-body.
      //
      // `perLotStage` tags the risky call in flight so the catch can emit
      // the correct typed class without brittle error-message parsing.
      let perLotStage: 'session_age_query' | 'snapshot_fetch' | 'exit_price' | 'submit' = 'session_age_query';
      try {
      // (e) session-age (cron path only). Manual override bypasses.
      if (!manualConfirm) {
        perLotStage = 'session_age_query';
        const spyPriorSessionDates = await sql<{ trade_date: string }[]>`
          SELECT trade_date::text AS trade_date
          FROM overshoot_daily_bars
          WHERE ticker = 'SPY'
            AND trade_date > (
              SELECT MIN(entry_ts)::date FROM overshoot_lots
              WHERE status='open' AND symbol=${m.symbol} AND side=${m.side}
            )
          ORDER BY trade_date ASC
        `;
        // Anchor entryDate at the EARLIEST open-lot entry date for this
        // (symbol, side) — the T+5 stop fires when the OLDEST lot ages out.
        const [earliest] = await sql<{ d: string | null }[]>`
          SELECT MIN(entry_ts)::date::text AS d FROM overshoot_lots
          WHERE status='open' AND symbol=${m.symbol} AND side=${m.side}
        `;
        const entryDate = earliest?.d ?? clockSnap.sessionDate;
        const age = computeSessionAge({
          entryDate,
          side: m.side.toUpperCase() as 'LONG' | 'SHORT',
          spyPriorSessionDates: spyPriorSessionDates.map((r) => r.trade_date),
          clock: clockSnap,
        });
        if (!age.ok || !age.shouldFireTimeExit) {
          tally.session_age_no_fire += 1;
          continue;
        }
      }

      // (f) Polygon snapshot.
      perLotStage = 'snapshot_fetch';
      const snap = await fetchPolygonSnapshot(env.polygonKey, m.symbol);
      // (g) exit-price construction (d-i module).
      perLotStage = 'exit_price';
      const priced = constructExitLimitPrice({
        snapshot: snap, side: m.side.toUpperCase() as OvershootSide, asOf: nowTs,
      });
      if (!priced.ok) {
        tally.exit_price[priced.refusal] = (tally.exit_price[priced.refusal] ?? 0) + 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.exit.price_refusal.${priced.refusal}`,
          actorId: authCtx.user.id, targetType: 'overshoot_lots', targetId: m.symbol,
          correlationId,
          metadata: { symbol: m.symbol, side: m.side, reason: priced.reason, lot_ids: m.lotIds, dry_run: dryRun, manual: manualConfirm },
        });
        continue;
      }

      // (h) build CID + submit.
      perLotStage = 'submit';
      const cid = buildOvershootClientOrderId({
        runId, ticker: m.symbol, side: m.side.toUpperCase() as OvershootSide,
        intent, attempt: 0,
      });

      if (dryRun) {
        submissions.push({ symbol: m.symbol, side: m.side, qty: m.qty, lot_ids: m.lotIds, order_id: null, client_order_id: cid, limit_price: priced.limitPrice });
        continue;
      }

      try {
        const submitter = new OvershootAlpacaOrderSubmitter(client);
        const acc = await submitter.submitOrder({
          symbol: m.symbol, qty: m.qty, side: priced.orderSide,
          type: 'limit', time_in_force: 'day',
          limit_price: priced.limitPrice, client_order_id: cid,
        }, nowTs);
        submissions.push({ symbol: m.symbol, side: m.side, qty: m.qty, lot_ids: m.lotIds, order_id: acc.order_id, client_order_id: acc.client_order_id, limit_price: priced.limitPrice });
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.exit.submitted.${intent}`,
          actorId: authCtx.user.id, targetType: 'overshoot_lots', targetId: m.symbol,
          correlationId,
          metadata: {
            symbol: m.symbol, side: m.side, qty: m.qty, lot_ids: m.lotIds,
            order_id: acc.order_id, client_order_id: acc.client_order_id,
            limit_price: priced.limitPrice, slippage_bps: priced.slippageBps,
            snapshot_age_ms: priced.snapshotAgeMs, minutes_to_close: clockSnap.minutesToClose,
            intent, attempt: 0, run_id: runId,
          },
        });
      } catch (err) {
        tally.submissions_failed += 1;
        const reason = err instanceof OvershootAlpacaApiError ? `alpaca_api_${err.status}`
          : err instanceof OvershootAlpacaNetworkError ? 'alpaca_network_error'
          : err instanceof OvershootAlpacaCredentialError ? 'alpaca_credential_missing'
          : 'submit_unexpected';
        submissions.push({ symbol: m.symbol, side: m.side, qty: m.qty, lot_ids: m.lotIds, order_id: null, client_order_id: cid, limit_price: priced.limitPrice, refusal: reason });
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.exit.submit_failed',
          actorId: authCtx.user.id, targetType: 'overshoot_lots', targetId: m.symbol,
          correlationId,
          metadata: { symbol: m.symbol, side: m.side, reason, lot_ids: m.lotIds, dry_run: dryRun, manual: manualConfirm, run_id: runId },
        });
      }
      } catch (perLotErr) {
        // ── ACT-468 H0: typed per-lot failure — loop CONTINUES. ──
        // The submit stage owns its own try/catch above; if we land here
        // with stage='submit' it means the try/catch itself threw
        // (writeStrategyAuditEvent, etc.) — classify as per_lot_unexpected
        // rather than double-count submissions_failed.
        const cls: 'session_age_query_failed' | 'snapshot_fetch_failed' | 'per_lot_unexpected' =
          perLotStage === 'session_age_query' ? 'session_age_query_failed'
          : perLotStage === 'snapshot_fetch'  ? 'snapshot_fetch_failed'
          : 'per_lot_unexpected';
        if (cls === 'session_age_query_failed') tally.session_age_query_failed += 1;
        else if (cls === 'snapshot_fetch_failed') tally.snapshot_fetch_failed += 1;
        else tally.per_lot_unexpected += 1;
        const errMsg = perLotErr instanceof Error ? perLotErr.message : String(perLotErr);
        try {
          await writeStrategyAuditEvent({
            strategyKey: 'overshoot',
            action: `overshoot.exit.${cls}`,
            actorId: authCtx.user.id, targetType: 'overshoot_lots', targetId: m.symbol,
            correlationId,
            metadata: {
              symbol: m.symbol, side: m.side, lot_ids: m.lotIds,
              stage: perLotStage, error: errMsg,
              dry_run: dryRun, manual: manualConfirm, run_id: runId,
            },
          });
        } catch (auditErr) {
          // Audit write itself failed — log to stderr so the tick is not
          // aborted; the tally increment above still records the event.
          console.error(JSON.stringify({
            event: 'per_lot_audit_write_failed',
            correlationId, symbol: m.symbol, stage: perLotStage,
            per_lot_err: errMsg, audit_err: auditErr instanceof Error ? auditErr.message : String(auditErr),
          }));
        }
        continue;
      }
    }

    await sql.end({ timeout: 5 });

    const exitsSubmitted = submissions.filter((s) => s.order_id !== null || (dryRun && !s.refusal)).length;
    return apiSuccess({
      outcome: 'completed',
      run_id: runId,
      intent,
      dry_run: dryRun,
      manual: manualConfirm,
      positions_examined: positionsExamined,
      matched_count: report.matched.length,
      exits_submitted: exitsSubmitted,
      refusals: tally,
      submissions,
      minutes_to_close: clockSnap.minutesToClose,
      correlation_id: correlationId,
    });
  } catch (err) {
    try { await sql.end({ timeout: 5 }); } catch { /* noop */ }
    console.error(JSON.stringify({ event: 'exit_run_unhandled', correlationId, err: String(err) }));
    return apiError(500, 'exit_run_unhandled_error', { correlationId });
  }
}));