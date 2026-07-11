/**
 * overshoot-entry-run -- FP-069 W3.6.e-ii (ACT-464.e-ii).
 *
 * Pre-open ENTRY cron handler + operator-manual entry path.
 * DISARMED at seed (MIG-155, `overshoot.entry.run`, enabled=false).
 * Operator arms at W3.6.e-arm (first-light bracket) via sql/33.
 *
 * Contract (all operator-ratified -- do NOT drift):
 *   Request  : POST { as_of?: 'YYYY-MM-DD', probe?: 'alpaca'|'polygon',
 *                     dry_run?: boolean, manual_confirm?: boolean,
 *                     second_confirm_token?: string, slot?: 'a'|'b' }
 *   Auth     : DEC-023 envelope via createHandler + authenticateRequest +
 *              overshoot.manage RBAC.
 *   Clock    : injected productionClock (Date.now() only in I6 window cutoff).
 *   Boot     : same shape as exit-run:
 *                (i) RATIFIED_STUDY_RUN_ID row in overshoot_study_runs
 *                (ii) drift-canary void-refs on the W3.6.e-i exported
 *                     constants (sizing + i5 + entry-price + detection-
 *                     linkage) AND sizing.ts constants so an e-i rename
 *                     surfaces at edge boot, not first money-path fire.
 *   Probes   : body.probe short-circuits BEFORE the three skip gates.
 *   Gates    : (i) kill-switch (strategy_key='overshoot' non-'active'),
 *              (ii) job-disarmed (overshoot.entry.run.enabled=false),
 *              (iii) probe (request-level short-circuit).
 *   I6 gate  : `manual_confirm=true` requires a matching
 *              `overshoot.entry.manual_triggered` audit row within
 *              OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS for the same actor.
 *   Pipeline :
 *     (a) /v2/clock (PIN-2; typed market_closed refusal + minutes_to_close)
 *     (b) run_already_exists idempotency gate (DUAL-SLOT DST collapse):
 *         checks for a same-session-date 'overshoot.entry.session_marker'
 *         audit row; second slot in the DUAL-SLOT pair returns typed
 *         no-op {reason:'run_already_exists'}.
 *     (c) detection-linkage (W3.6.e-i): fetch SPY prior-session dates +
 *         latest completed detection run for the computed prior session;
 *         three typed refusals surfaced + audited.
 *     (d) overshoot_strategy_config read (typed strategy_config_absent
 *         on missing row; NEVER schema-default silent fallback).
 *     (e) fresh account snapshot via OvershootAlpacaAccountFetcher
 *         (typed equity_snapshot_unavailable passthrough).
 *     (f) session marker written (idempotency anchor for slot-b).
 *     (g) per selected target:
 *           I5 pre-open re-check (W3.6.e-i, DEFAULT-DENY) ->
 *           computeTargetSizing (sizingBase = equity * alloc * margin) ->
 *           assertBuyingPowerCoversNotional (R-gamma; cumulative check
 *              BEFORE each submission) ->
 *           shortability gate for shorts (OvershootAlpacaShortabilityFetcher;
 *              typed not_shortable) ->
 *           Polygon snapshot -> constructEntryLimitPrice (W3.6.e-i;
 *              four typed refusals) ->
 *           submit LIMIT day-TIF with entry CID (attempt run-scoped) ->
 *           INC-83 RESOLUTION UPSERT of overshoot_target_positions
 *              (overwrites-on-commit; sentinel-persists-on-I5-refuse) ->
 *           fetch fill -> INSERT overshoot_lots on filled_qty > 0 (broker
 *              truth; partial-fill leaves lot at filled qty).
 *   Accounting identity (never-silent-drop; evidenced in response):
 *     targets_loaded
 *       = orders_submitted
 *       + i5_refusals
 *       + sizing_refusals
 *       + buying_power_refusals
 *       + shortability_refusals
 *       + entry_price_refusals (4 classes)
 *       + submissions_failed
 *       + fill_unfilled_no_lots
 *   dry_run  : full pipeline; ZERO order submissions; response marks
 *              dry_run=true so the identity is observable.
 *
 * Price source: POLYGON ONLY (LIVE-PRICE SOURCE CONTRACT 2026-07-04).
 * Alpaca market-data endpoints FORBIDDEN. Alpaca is used ONLY for broker
 * truth (clock, account, positions, orders, fills, shortability).
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
import { OvershootAlpacaAccountFetcher } from '../_shared/overshoot-broker/alpaca-account-fetcher.ts';
import { OvershootAlpacaOrderSubmitter } from '../_shared/overshoot-broker/alpaca-order-submitter.ts';
import { OvershootAlpacaFillFetcher } from '../_shared/overshoot-broker/alpaca-fill-fetcher.ts';
import { OvershootAlpacaShortabilityFetcher } from '../_shared/overshoot-broker/alpaca-shortability-fetcher.ts';
import { OvershootAlpacaPositionFetcher } from '../_shared/overshoot-broker/alpaca-position-fetcher.ts';
import {
  RATIFIED_STUDY_RUN_ID,
  RATIFIED_PARAM_GRID_HASH_PREFIX,
  RATIFIED_DETECTOR_VERSION,
} from '../_shared/overshoot/detector/detector.ts';

// ── W3.6.a CID + W3.6.e-i pure-module imports (boot-drift surface). ──
import { buildOvershootClientOrderId, type OvershootSide } from '../_shared/overshoot-execution/client-order-id.ts';
import {
  OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
  OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
  OVERSHOOT_CAPACITY_LONG,
  OVERSHOOT_CAPACITY_SHORT,
  computeTargetSizing,
  assertBuyingPowerCoversNotional,
  type OvershootSizeSide,
} from '../_shared/overshoot-execution/sizing.ts';
import {
  evaluateAllocationCap,
  computeOpenMVBySide,
  type BrokerPositionForCap,
  type OpenLotForCap,
  type MvBySideResult,
} from '../_shared/overshoot-execution/allocation-cap.ts';
import {
  OVERSHOOT_DAILY_ENTRY_BUDGET,
  evaluateDailyBudget,
} from '../_shared/overshoot-execution/daily-budget.ts';
import {
  OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS,
  OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS,
  constructEntryLimitPrice,
  type EntrySide,
} from '../_shared/overshoot-execution/entry-price-construction.ts';
import type { PolygonQuoteSnapshot } from '../_shared/overshoot-execution/exit-price-construction.ts';
import {
  OVERSHOOT_I5_REVERSION_MAX_LONG,
  OVERSHOOT_I5_REVERSION_MAX_SHORT,
  evaluateI5PreOpenRecheck,
} from '../_shared/overshoot-execution/i5-recheck.ts';
import {
  resolveDetectionRunForEntry,
  computePriorSpySessionDate,
  type OvershootDetectionRunRow,
} from '../_shared/overshoot-execution/detection-linkage.ts';
import {
  computeRegime,
  shouldThrottleUnderRegime,
  type RegimeResult,
  type OvershootRegime,
} from '../_shared/overshoot/regime.ts';

// I6 manual-confirm window (ratified: 15 minutes; parity with exit-run).
const OVERSHOOT_MANUAL_CONFIRM_WINDOW_MS = 15 * 60 * 1000;

// Single-account key ratified for v1 (A3, ACT-464 STEP A).
const OVERSHOOT_ACCOUNT_KEY = 'overshoot-paper-primary';

/**
 * Handler version echo — INC-84 §5 standing rule. Bumped by INC-96
 * (aggregate allocation-cap gate). Surfaced in every response envelope
 * as `handler_version` so operator triage / attestation can pin the
 * deployed shape without a source lookup.
 */
export const OVERSHOOT_ENTRY_RUN_VERSION = 'act501-daily-budget-k5-v1-20260711';

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
    capturedAt: new Date(Math.floor(lq.t / 1_000_000)),
  };
}

interface SelectionRow {
  ticker: string;
  side: 'long' | 'short';
  rank_score: number | null;
  tier: 'T1' | 'T2' | null;
  // ACT-485 Option A (INC-90 structural fix) — sourced by LATERAL JOIN
  // to `overshoot_daily_bars`; numeric-typed on the DB side, postgresjs
  // hands them back as strings (numeric type) so the loader coerces via
  // Number() after the explicit non-null check. NULL-impossible after the
  // typed `reference_bar_missing` refusal branch.
  t_close_ref: string | number | null;
  pre_event_ref: string | number | null;
  // Metadata for reference_bar_missing audit rows (never-silent-drop).
  as_of: string;                // detection_runs.as_of (YYYY-MM-DD)
  argmax_window_days: number;   // events row window used for pre_event bar offset
}

interface RefusalTally {
  detection_linkage: number;
  strategy_config_absent: number;
  equity_snapshot_unavailable: number;
  position_already_open: number;
  regime_throttled_t2: number;
  i5_refusals: number;
  sizing_refusals: number;
  buying_power_refusals: number;
  shortability_refusals: number;
  entry_price: { polygon_snapshot_unavailable: number; polygon_snapshot_stale: number; polygon_snapshot_malformed: number; polygon_snapshot_crossed: number };
  submissions_failed: number;
  fill_unfilled_no_lots: number;
  // INC-96: aggregate per-side allocation-cap refusals. Counted alongside
  // the existing typed refusal reasons; identity extends to
  // targets_loaded = orders_submitted + ... + allocation_cap_reached.
  allocation_cap_reached: number;
  // ACT-501: daily entry budget (K=5, ACT-500 Part 1 DEC). Counted AFTER
  // allocation_cap_reached in the evaluation order and the identity —
  // a name refused by the cap does NOT consume budget.
  daily_budget_reached: number;
}
function newTally(): RefusalTally {
  return {
    detection_linkage: 0,
    strategy_config_absent: 0,
    equity_snapshot_unavailable: 0,
    position_already_open: 0,
    regime_throttled_t2: 0,
    i5_refusals: 0,
    sizing_refusals: 0,
    buying_power_refusals: 0,
    shortability_refusals: 0,
    entry_price: { polygon_snapshot_unavailable: 0, polygon_snapshot_stale: 0, polygon_snapshot_malformed: 0, polygon_snapshot_crossed: 0 },
    submissions_failed: 0,
    fill_unfilled_no_lots: 0,
    allocation_cap_reached: 0,
    daily_budget_reached: 0,
  };
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

/**
 * DEC-023 handler. Ordering (STRICT):
 *   (1) method + JSON parse
 *   (2) RBAC overshoot.manage
 *   (3) Boot assertion + e-i drift-canaries
 *   (4) Probe short-circuit
 *   (5) Skip gates: kill-switch, disarmed
 *   (6) I6 manual-confirm gate (manual path only)
 *   (7) Pipeline: clock -> run_already_exists -> detection linkage ->
 *       config read -> account snapshot -> session marker -> per-target:
 *       I5 -> sizing -> BP guard -> shortability -> polygon snap ->
 *       entry price -> UPSERT target_positions -> submit -> fill ->
 *       insert overshoot_lots
 */
Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // INC-99 / ACT-503: cron-first branch mirrors overshoot-fill-sweep
  // (supabase/functions/overshoot-fill-sweep/index.ts:132-143). Cron path
  // substitutes a synthetic operator id (matches fill-sweep CRON_OPERATOR_ID).
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
  const slot = typeof body.slot === 'string' ? body.slot : null;

  const env = readEnv();
  if (!env.supabaseDbUrl) return apiError(500, 'db_url_unset', { correlationId });

  const sql: Sql = postgres(env.supabaseDbUrl, { max: 1, prepare: false, connect_timeout: 10 });

  try {
    // ── (3) Boot assertion + drift-canaries ─────────────────────────────
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
    // Drift-canaries: e-i module constants statically imported above.
    void OVERSHOOT_SIDE_ALLOCATION_PCT_LONG;
    void OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT;
    void OVERSHOOT_CAPACITY_LONG;
    void OVERSHOOT_CAPACITY_SHORT;
    void OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS;
    void OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS;
    void OVERSHOOT_I5_REVERSION_MAX_LONG;
    void OVERSHOOT_I5_REVERSION_MAX_SHORT;
    // ACT-501 drift canary: single-homed daily-budget constant.
    void OVERSHOOT_DAILY_ENTRY_BUDGET;

    // T3b (ACT-480) — INC-84 §5 generalization: detector_version boot
    // format assertion + probe-envelope echo (self-attesting deploys).
    if (typeof RATIFIED_DETECTOR_VERSION !== 'string' || !/^[0-9a-f]{8}$/.test(RATIFIED_DETECTOR_VERSION)) {
      await sql.end({ timeout: 5 });
      console.error(JSON.stringify({
        event: 'boot_assertion_failed_detector_version_malformed',
        correlationId,
        loaded_value_typeof: typeof RATIFIED_DETECTOR_VERSION,
      }));
      return apiError(500, 'boot_assertion_failed_detector_version_malformed', { correlationId });
    }

    // ── (4) Probe short-circuit ─────────────────────────────────────────
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
          console.error('[overshoot-entry-run] alpaca probe failed:', detail, { correlationId });
          return apiError(502, 'alpaca_probe_failed', { correlationId });
        }
      }
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
        console.error('[overshoot-entry-run] polygon probe failed:', String(e), { correlationId });
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
        targets_loaded: 0, orders_submitted: 0,
        correlation_id: correlationId,
      });
    }
    const [jr] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM job_registry WHERE id = 'overshoot.entry.run'
    `;
    if (jr && jr.enabled === false) {
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'job_disarmed',
        targets_loaded: 0, orders_submitted: 0,
        correlation_id: correlationId,
      });
    }

    // ── (6) I6 second-confirm token gate (manual path only) ─────────────
    if (manualConfirm) {
      // INC-99 ruling (a): cron-authenticated caller can NEVER submit via
      // the manual path. Hard-reject before the token lookup.
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
        WHERE action = 'overshoot.entry.manual_triggered'
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
    let sessionDate: string; let minutesToClose: number; let isMarketOpen: boolean;
    try {
      const raw = await client.getJson<AlpacaClockResponse>('/v2/clock');
      const nextClose = new Date(raw.next_close);
      minutesToClose = Math.max(0, Math.round((nextClose.getTime() - nowTs.getTime()) / 60_000));
      sessionDate = (raw.is_open ? new Date(raw.timestamp) : new Date(raw.next_open))
        .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      isMarketOpen = raw.is_open;
    } catch (e) {
      await sql.end({ timeout: 5 });
      console.error('[overshoot-entry-run] clock fetch failed:', String(e), { correlationId });
      return apiError(502, 'market_clock_unavailable', { correlationId });
    }
    if (!isMarketOpen) {
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'market_closed',
        minutes_to_close: minutesToClose, session_date: sessionDate,
        targets_loaded: 0, orders_submitted: 0,
        correlation_id: correlationId, dry_run: dryRun, slot,
      });
    }

    // (b) run_already_exists idempotency gate (DUAL-SLOT DST collapse).
    // A same-session-date session marker means slot-a fired already; slot-b
    // returns typed no-op. Cron and manual paths both consult the gate;
    // manual path is exempt from the no-op (operator re-fire is deliberate).
    if (!manualConfirm) {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM overshoot_audit_logs
        WHERE action = 'overshoot.entry.session_marker'
          AND metadata->>'session_date' = ${sessionDate}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (existing) {
        await sql.end({ timeout: 5 });
        return apiSuccess({
          outcome: 'no_op', reason: 'run_already_exists',
          session_date: sessionDate,
          targets_loaded: 0, orders_submitted: 0,
          correlation_id: correlationId, dry_run: dryRun, slot,
        });
      }
    }

    // (c) detection-linkage (W3.6.e-i).
    const spyDates = await sql<{ trade_date: string }[]>`
      SELECT trade_date::text AS trade_date
      FROM overshoot_daily_bars
      WHERE ticker = 'SPY'
        AND trade_date < ${sessionDate}::date
      ORDER BY trade_date DESC
      LIMIT 30
    `;
    const spyPriorSessionDates: string[] = (spyDates as { trade_date: string }[]).map((r) => r.trade_date).sort();
    const priorSpySession = computePriorSpySessionDate(sessionDate, spyPriorSessionDates);
    let detectionRun: OvershootDetectionRunRow | null = null;
    if (priorSpySession !== null) {
      const [row] = await sql<{ run_id: string; as_of: string; outcome: string; selected_count: number }[]>`
        SELECT run_id::text AS run_id, as_of::text AS as_of, outcome, selected_count
        FROM overshoot_detection_runs
        WHERE as_of = ${priorSpySession}::date
        ORDER BY detected_at DESC
        LIMIT 1
      `;
      if (row) detectionRun = row;
    }
    const linkage = resolveDetectionRunForEntry({
      asOf: sessionDate, spyPriorSessionDates, detectionRun,
    });
    if (!linkage.ok) {
      await writeStrategyAuditEvent({
        strategyKey: 'overshoot',
        action: `overshoot.entry.detection_linkage_refusal.${linkage.refusal}`,
        actorId: authCtx.user.id, targetType: 'overshoot_detection_runs', targetId: sessionDate,
        correlationId,
        metadata: { reason: linkage.reason, priorSessionExpected: linkage.priorSessionExpected, runAsOfActual: linkage.runAsOfActual, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot },
      });
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: `detection_linkage_${linkage.refusal}`,
        session_date: sessionDate,
        targets_loaded: 0, orders_submitted: 0,
        correlation_id: correlationId, dry_run: dryRun, slot,
      });
    }

    // (d) strategy config read — typed strategy_config_absent (never default).
    const [cfg] = await sql<{ strategy_allocation_pct: string; margin_multiplier: string }[]>`
      SELECT strategy_allocation_pct::text, margin_multiplier::text
      FROM overshoot_strategy_config
      WHERE account_key = ${OVERSHOOT_ACCOUNT_KEY}
    `;
    if (!cfg) {
      await writeStrategyAuditEvent({
        strategyKey: 'overshoot',
        action: 'overshoot.entry.strategy_config_absent',
        actorId: authCtx.user.id, targetType: 'overshoot_strategy_config', targetId: OVERSHOOT_ACCOUNT_KEY,
        correlationId,
        metadata: { account_key: OVERSHOOT_ACCOUNT_KEY, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot },
      });
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'strategy_config_absent',
        session_date: sessionDate,
        targets_loaded: 0, orders_submitted: 0,
        correlation_id: correlationId, dry_run: dryRun, slot,
      });
    }
    const strategyAllocationPct = Number(cfg.strategy_allocation_pct);
    const marginMultiplier = Number(cfg.margin_multiplier);

    // (e) fresh account snapshot.
    const accountFetcher = new OvershootAlpacaAccountFetcher(client);
    const accountSnapshot = await accountFetcher.fetchAccountSnapshot(nowTs);
    if (accountSnapshot.ok === false) {
      await writeStrategyAuditEvent({
        strategyKey: 'overshoot',
        action: 'overshoot.entry.equity_snapshot_unavailable',
        actorId: authCtx.user.id, targetType: 'overshoot_strategy_config', targetId: OVERSHOOT_ACCOUNT_KEY,
        correlationId,
        metadata: { reason: accountSnapshot.reason, raw_equity: accountSnapshot.raw_equity, raw_buying_power: accountSnapshot.raw_buying_power, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot },
      });
      await sql.end({ timeout: 5 });
      return apiSuccess({
        outcome: 'no_op', reason: 'equity_snapshot_unavailable',
        session_date: sessionDate,
        targets_loaded: 0, orders_submitted: 0,
        correlation_id: correlationId, dry_run: dryRun, slot,
      });
    }
    const sizingBase = accountSnapshot.equity * strategyAllocationPct * marginMultiplier;

    // ── T3b (ACT-480) REGIME GOVERNOR ────────────────────────────────────
    // Compute the SPY-drawdown regime BEFORE loading selections so the
    // regime + full signal context is stamped on the entry-run row + every
    // regime_throttled_t2 refusal. Fail-open discipline: `regime.ok=false`
    // (empty_input / insufficient_bars / non_positive_close) never
    // throttles — the audit row surfaces `regime_indeterminate` and the
    // per-selection admission proceeds as if regime were BULL. The
    // phantom-BEAR invariant (regime_test.ts T3b PIN) locks this seam.
    const spyClosesRows = await sql<{ close: number }[]>`
      SELECT close::float8 AS close
      FROM overshoot_daily_bars
      WHERE ticker = 'SPY'
        AND trade_date <= ${sessionDate}::date
      ORDER BY trade_date DESC
      LIMIT 60
    `;
    const spyClosesAscending: number[] = (spyClosesRows as { close: number }[])
      .map((r) => Number(r.close))
      .reverse();
    const regime: RegimeResult = computeRegime({ spyClosesAscending });
    const regimeSignalContext = regime.ok
      ? {
          bars_consumed: regime.barsConsumed,
          drawdown_from_peak_pct: regime.drawdownFromPeakPct,
          last_close: regime.lastClose,
          peak_close: regime.peakClose,
        }
      : { bars_consumed: spyClosesAscending.length, refusal: regime.refusal, reason: regime.reason };
    if (regime.ok !== true) {
      // FAIL-OPEN audit. The engine proceeds; no T2 selections are gated.
      await writeStrategyAuditEvent({
        strategyKey: 'overshoot',
        action: 'overshoot.entry.regime_indeterminate',
        actorId: authCtx.user.id, targetType: 'overshoot_daily_bars', targetId: 'SPY',
        correlationId,
        metadata: {
          reason: regime.reason, refusal: regime.refusal,
          bars_available: spyClosesAscending.length,
          session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot,
        },
      });
    }
    const regimeLabel: OvershootRegime | null = regime.ok ? regime.regime : null;

    // (f) load selections + write session marker.
    // ACT-485 Option A (INC-90 structural fix) — REAL reference-price
    // wiring. Sources per the I5 contract docstring (`_shared/overshoot-
    // execution/i5-recheck.ts` lines 22-32): `tCloseRef` = close at the
    // T-close session (the detection run's `as_of` date); `preEventRef` =
    // close of the pre-event reference bar, offset `argmax_window_days`
    // TRADING SESSIONS before the T-close (never calendar-day math —
    // uses OFFSET on trade-date DESC to walk sessions inside
    // `overshoot_daily_bars`, honouring holidays and weekends). LEFT
    // JOIN LATERAL yields NULL when a bar is missing; the handler
    // converts that NULL to the typed `reference_bar_missing` refusal
    // (never NaN, never a silent default) — see the loop body below.
    // The `NULL::` placeholder pattern is anti-patterned by INC-90 and
    // guarded by `.github/workflows/overshoot-guards.yml`.
    const selections = await sql<SelectionRow[]>`
      SELECT
        e.ticker,
        e.side,
        e.rank_score,
        e.tier,
        e.argmax_window_days,
        dr.as_of::text AS as_of,
        tclose.close  AS t_close_ref,
        preref.close  AS pre_event_ref
      FROM overshoot_events e
      JOIN overshoot_detection_runs dr
        ON dr.run_id = e.run_id
      LEFT JOIN LATERAL (
        SELECT close
        FROM overshoot_daily_bars
        WHERE ticker = e.ticker AND trade_date = dr.as_of
        LIMIT 1
      ) tclose ON true
      LEFT JOIN LATERAL (
        SELECT close
        FROM overshoot_daily_bars
        WHERE ticker = e.ticker AND trade_date <= dr.as_of
        ORDER BY trade_date DESC
        OFFSET e.argmax_window_days
        LIMIT 1
      ) preref ON true
      WHERE e.run_id = ${linkage.runId}::uuid
        AND e.selected_for_entry = true
      ORDER BY e.side, e.rank_score DESC NULLS LAST, e.ticker
    `;
    const targetsLoaded = selections.length;

    // Per-side capacity counts (used by sizing to slice equally across
    // slots within a side). Capacity is the SELECTED count per side —
    // capacity_per_side that survived detection.
    const longSelections = (selections as SelectionRow[]).filter((s) => s.side === 'long');
    const shortSelections = (selections as SelectionRow[]).filter((s) => s.side === 'short');

    await writeStrategyAuditEvent({
      strategyKey: 'overshoot',
      action: 'overshoot.entry.session_marker',
      actorId: authCtx.user.id, targetType: 'overshoot_detection_runs', targetId: linkage.runId,
      correlationId,
      metadata: {
        session_date: sessionDate, prior_spy_session: linkage.priorSessionExpected,
        detection_run_id: linkage.runId, selected_count: linkage.selectedCount,
        targets_loaded: targetsLoaded, long_capacity: longSelections.length, short_capacity: shortSelections.length,
        capacity_long_ratified: OVERSHOOT_CAPACITY_LONG, capacity_short_ratified: OVERSHOOT_CAPACITY_SHORT,
        regime: regimeLabel, regime_ok: regime.ok, regime_signal_context: regimeSignalContext,
        detector_version: RATIFIED_DETECTOR_VERSION,
        dry_run: dryRun, manual: manualConfirm, slot, minutes_to_close: minutesToClose,
      },
    });

    const runId = crypto.randomUUID();
    const intent = 'entry' as const;
    const tally = newTally();
    const submissions: Array<{
      symbol: string; side: 'long' | 'short'; qty: number; lot_ids: readonly string[];
      order_id: string | null; client_order_id: string; limit_price: number; refusal?: string;
      filled_qty?: number; avg_fill_price?: number | null;
    }> = [];
    let cumulativeIntendedNotional = 0;
    let ordersSubmitted = 0;
    // ACT-501 daily-budget counter. Incremented AFTER a slot passes the
    // allocation-cap gate (and thus consumes budget). Cap-refused names
    // never touch this counter — identity + rank-preservation guarantee.
    let admittedByDailyBudget = 0;

    const shortabilityFetcher = new OvershootAlpacaShortabilityFetcher(client);
    const fillFetcher = new OvershootAlpacaFillFetcher(client);
    const submitter = new OvershootAlpacaOrderSubmitter(client);

    // ── ACT-466 position_already_open gate (SOURCES) ────────────────────
    // Pre-fetch open lots + broker positions ONCE before the loop; the
    // per-target check is a Set lookup (no vendor calls spent on refused
    // names). Blocks entry when EITHER source shows the ticker held on
    // EITHER side, including manual broker positions with no matching lot
    // (broker truth per §2 axiom 2). Pyramiding is not a v1 default.
    const openLotRows = await sql<{ symbol: string; side: 'long' | 'short' }[]>`
      SELECT symbol, side FROM overshoot_lots WHERE status = 'open'
    `;
    const positionFetcher = new OvershootAlpacaPositionFetcher(client);
    const brokerPositions = await positionFetcher.listOpenPositions(nowTs);
    const heldTickers = new Set<string>();
    for (const r of openLotRows as { symbol: string; side: 'long' | 'short' }[]) heldTickers.add(r.symbol);
    for (const p of brokerPositions) if (p.qty !== 0) heldTickers.add(p.symbol);

    // ── INC-96 aggregate allocation-cap pre-loop state ────────────────────
    // Fetch open lots WITH cost_basis so the ledger-only fallback path in
    // computeOpenMVBySide can contribute for any symbol the broker doesn't
    // report (never silently understates exposure vs the ledger).
    const openLotsForCap = await sql<{ symbol: string; side: 'long' | 'short'; cost_basis: string | number }[]>`
      SELECT symbol, side, cost_basis::float8 AS cost_basis
      FROM overshoot_lots
      WHERE status = 'open'
    `;
    const brokerPositionsForCap: BrokerPositionForCap[] = (brokerPositions as Array<{
      symbol: string; qty: number; avg_entry_price: number; market_value?: number;
    }>).map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      avg_entry_price: p.avg_entry_price,
      ...(typeof p.market_value === 'number' ? { market_value: p.market_value } : {}),
    }));
    const openLotsForCapTyped: OpenLotForCap[] = (openLotsForCap as { symbol: string; side: 'long' | 'short'; cost_basis: string | number }[]).map((l) => ({
      symbol: l.symbol,
      side: l.side,
      cost_basis: Number(l.cost_basis),
    }));
    const openMV: MvBySideResult = computeOpenMVBySide(brokerPositionsForCap, openLotsForCapTyped);
    const acceptedNotionalBySide: { long: number; short: number } = { long: 0, short: 0 };
    const sideAllocationPctByKey = {
      long:  OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
      short: OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
    } as const;
    const sideCapUsd = {
      long:  sizingBase * OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
      short: sizingBase * OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
    } as const;

    for (const sel of selections) {
      const sideUpper: OvershootSide = sel.side === 'long' ? 'LONG' : 'SHORT';
      const sizeSide: OvershootSizeSide = sideUpper;
      const entrySide: EntrySide = sideUpper;
      // INC-87 STRUCTURAL FIX (T3b, ACT-480): sizing denominator is the
      // ratified per-side CAPACITY constant, NOT the per-side selection
      // count. Under-fill (selections < capacity) yields idle slots that
      // tick, not concentration; the pre-fix defect sized a 4-selection
      // morning at ~12.5%/name (LONG) vs the ratified 2.5%/name.
      const capacityPerSide = sideUpper === 'LONG'
        ? OVERSHOOT_CAPACITY_LONG
        : OVERSHOOT_CAPACITY_SHORT;

      // T3b (ACT-480) — REGIME GOVERNOR per-selection gate. Reachable
      // ONLY through regime.ok===true (phantom-BEAR invariant, locked by
      // regime_test.ts). Full signal context persisted for W5 slicing.
      const admission = shouldThrottleUnderRegime(regime, sel.tier);
      if (admission.throttle) {
        tally.regime_throttled_t2 += 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.entry.${admission.reason}`,
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: {
            ticker: sel.ticker, side: sel.side, tier: sel.tier, rank_score: sel.rank_score,
            regime: regimeLabel, regime_signal_context: regimeSignalContext,
            session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId,
          },
        });
        continue;
      }

      // ── ACT-466 position_already_open per-target check ────────────────
      // Placed BEFORE any vendor call (Polygon snapshot / I5 / sizing /
      // shortability / entry-price). Refusal persists full signal context
      // so W5 can measure forgone repeat-signal / pyramiding value.
      if (heldTickers.has(sel.ticker)) {
        tally.position_already_open += 1;
        const lotHit    = (openLotRows as { symbol: string; side: 'long' | 'short' }[])
                            .filter((r) => r.symbol === sel.ticker);
        const brokerHit = brokerPositions.filter((p) => p.symbol === sel.ticker);
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.entry.position_already_open',
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: {
            ticker: sel.ticker, side: sel.side, tier: sel.tier, rank_score: sel.rank_score,
            regime: regimeLabel,
            open_lot_sides: lotHit.map((r) => r.side),
            broker_position_qty: brokerHit.length > 0 ? brokerHit[0].qty : null,
            broker_position_side: brokerHit.length > 0 ? (brokerHit[0].qty > 0 ? 'long' : 'short') : null,
            manual_broker_position: lotHit.length === 0 && brokerHit.length > 0,
            session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId,
          },
        });
        continue;
      }

      // Fetch pre-open Polygon snapshot (reused for I5 + entry-price).
      const snap = await fetchPolygonSnapshot(env.polygonKey, sel.ticker);

      // ACT-485 Option A (INC-90 fix) — reference_bar_missing typed
      // refusal. Sourced by LATERAL JOIN above (never `NULL::` placeholder).
      // NULL from the JOIN means the daily bar is missing for the T-close
      // session or the pre-event bar (argmax_window_days sessions back).
      // Refuse with a NAMED refusal + full context — never NaN, never a
      // silent default. Counted under `i5_refusals` (semantically: cannot
      // evaluate the I5 recheck). INC-83 sentinel persists (no UPSERT).
      if (sel.t_close_ref === null || sel.pre_event_ref === null) {
        tally.i5_refusals += 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.entry.reference_bar_missing',
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: {
            ticker: sel.ticker, side: sel.side,
            reason: `daily-bar reference price missing (t_close_ref=${sel.t_close_ref} pre_event_ref=${sel.pre_event_ref}); detection as_of=${sel.as_of}; argmax_window_days=${sel.argmax_window_days}`,
            t_close_ref: sel.t_close_ref, pre_event_ref: sel.pre_event_ref,
            detection_as_of: sel.as_of, argmax_window_days: sel.argmax_window_days,
            session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId,
            inc83_sentinel_persists: true,
          },
        });
        continue;
      }
      // Coerce numeric-strings from postgresjs (numeric type default).
      // Non-null by the branch above; Number() is total on the string form.
      const tCloseRef = Number(sel.t_close_ref);
      const preEventRef = Number(sel.pre_event_ref);
      const i5 = evaluateI5PreOpenRecheck({
        snapshot: snap, side: sideUpper, tCloseRef, preEventRef, asOf: nowTs,
      });
      if (!i5.ok) {
        tally.i5_refusals += 1;
        // INC-83 RESOLUTION: on I5 refuse, the target_positions row is
        // NOT UPSERTed — the pre-existing sentinel (target_shares=0,
        // target_notional=0) from detection PERSISTS as the truthful
        // "no entry taken" record. Proof obligation:
        //   sentinel-persists-on-I5-refuse.
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.entry.i5_refusal.${i5.refusal}`,
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: { ticker: sel.ticker, side: sel.side, reason: i5.reason, reversionPct: i5.reversionPct, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId, inc83_sentinel_persists: true },
        });
        continue;
      }

      // Entry-time sizing. entryReferencePrice = the I5 pre-open mid.
      const sizing = computeTargetSizing({
        snapshot: accountSnapshot, side: sizeSide, capacityPerSide,
        entryReferencePrice: i5.preOpenMid, sizingBase,
        strategyAllocationPct, marginMultiplier,
      });
      if (!sizing.ok) {
        tally.sizing_refusals += 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.entry.sizing_refusal.${sizing.refusal}`,
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: { ticker: sel.ticker, side: sel.side, reason: sizing.reason, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId },
        });
        continue;
      }

      // ── INC-96 aggregate allocation-cap gate ─────────────────────────
      // Refuses when projected_side_MV = currentOpenMV_side
      //                                + acceptedNotionalThisRun_side
      //                                + this_order_notional
      // would exceed sizingBase × OVERSHOOT_SIDE_ALLOCATION_PCT_<SIDE>.
      // Rank-order preserved (iteration order unchanged). This gate is
      // orthogonal to the RegT-margin BP guard below — the BP guard
      // enforces broker-margin availability; this guard enforces
      // OPERATOR-RATIFIED gross-leverage. Both must pass.
      const capSide: 'long' | 'short' = sel.side === 'short' ? 'short' : 'long';
      const capEval = evaluateAllocationCap({
        side: capSide,
        sizingBase,
        sideAllocationPct: sideAllocationPctByKey[capSide],
        currentOpenMV: openMV[capSide],
        acceptedNotionalThisRun: acceptedNotionalBySide[capSide],
        thisOrderNotional: sizing.slotNotional,
      });
      if (!capEval.ok) {
        tally.allocation_cap_reached += 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.entry.allocation_cap_reached',
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: {
            ticker: sel.ticker, side: sel.side, tier: sel.tier, rank_score: sel.rank_score,
            reason: capEval.reason,
            side_cap_usd: capEval.side_cap_usd,
            projected_side_mv_usd: capEval.projected_side_mv_usd,
            overshoot_usd: capEval.overshoot_usd,
            current_open_mv_usd: capEval.current_open_mv_usd,
            accepted_notional_this_run_usd: capEval.accepted_notional_this_run_usd,
            this_order_notional_usd: capEval.this_order_notional_usd,
            side_allocation_pct: sideAllocationPctByKey[capSide],
            sizing_base_usd: sizingBase,
            mv_basis_mix: openMV.basis_mix[capSide],
            handler_version: OVERSHOOT_ENTRY_RUN_VERSION,
            session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId,
          },
        });
        continue;
      }

      // ── ACT-501 daily entry budget gate ──────────────────────────────
      // Positioned AFTER allocation_cap_reached (cap-refused names do NOT
      // consume budget) and BEFORE the R-gamma BP guard (no BP spent on
      // budget-refused names). Rank-order preserved by upstream ORDER BY
      // (side, rank_score DESC): the top-K eligible names claim the
      // budget; the tail truncates cleanly with `daily_budget_reached`.
      // Ratified K=5 by ACT-500 Part 1 DEC; W5 4-week live tripwire may
      // drop to 4 on evidence.
      const budgetEval = evaluateDailyBudget({
        budget: OVERSHOOT_DAILY_ENTRY_BUDGET,
        admittedThisRun: admittedByDailyBudget,
      });
      if (!budgetEval.ok) {
        tally.daily_budget_reached += 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.entry.daily_budget_reached',
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: {
            ticker: sel.ticker, side: sel.side, tier: sel.tier, rank_score: sel.rank_score,
            reason: budgetEval.reason,
            budget: budgetEval.budget,
            admitted_this_run: budgetEval.admitted_this_run,
            handler_version: OVERSHOOT_ENTRY_RUN_VERSION,
            session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId,
          },
        });
        continue;
      }
      // Budget consumed on admission through this gate. Downstream
      // refusals (BP / shortability / entry-price / submit_failed) still
      // count as a consumed slot — the sim modeled K as ADMISSIONS/day,
      // not as SUCCESSFUL FILLS/day. This is the same accounting the W5
      // live-tripwire will measure against.
      admittedByDailyBudget += 1;

      // R-gamma cumulative BP guardrail BEFORE this submission.
      const bpCheck = assertBuyingPowerCoversNotional({
        snapshot: accountSnapshot,
        intendedNotional: cumulativeIntendedNotional + sizing.slotNotional,
      });
      if (!bpCheck.ok) {
        tally.buying_power_refusals += 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.entry.buying_power_refusal.${bpCheck.refusal}`,
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: { ticker: sel.ticker, side: sel.side, reason: bpCheck.reason, buying_power: bpCheck.buyingPower, intended_notional: bpCheck.intendedNotional, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId },
        });
        continue;
      }

      // Shortability gate (shorts only).
      if (sel.side === 'short') {
        const shortability = await shortabilityFetcher.fetchShortability(sel.ticker, nowTs);
        if (!shortability.shortable) {
          tally.shortability_refusals += 1;
          await writeStrategyAuditEvent({
            strategyKey: 'overshoot',
            action: 'overshoot.entry.shortability_refusal.not_shortable',
            actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
            correlationId,
            metadata: { ticker: sel.ticker, side: sel.side, easy_to_borrow: shortability.easy_to_borrow, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId },
          });
          continue;
        }
      }

      // Entry-price construction (W3.6.e-i).
      const priced = constructEntryLimitPrice({ snapshot: snap, side: entrySide, asOf: nowTs });
      if (!priced.ok) {
        tally.entry_price[priced.refusal] = (tally.entry_price[priced.refusal] ?? 0) + 1;
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.entry.price_refusal.${priced.refusal}`,
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: { ticker: sel.ticker, side: sel.side, reason: priced.reason, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId },
        });
        continue;
      }

      // INC-83 RESOLUTION UPSERT — overwrites-on-commit. The detection
      // sentinel row (target_shares=0, target_notional=0) is REPLACED
      // with the sized entry values BEFORE order submission. Proof
      // obligation: overwrites-on-commit.
      await sql`
        INSERT INTO overshoot_target_positions (run_id, ticker, side, target_shares, target_notional, rank_score, computed_at)
        VALUES (${linkage.runId}::uuid, ${sel.ticker}, ${sel.side}, ${sizing.shares}, ${sizing.slotNotional}, ${sel.rank_score}, ${nowTs.toISOString()}::timestamptz)
        ON CONFLICT (run_id, ticker, side) DO UPDATE
          SET target_shares    = EXCLUDED.target_shares,
              target_notional  = EXCLUDED.target_notional,
              computed_at      = EXCLUDED.computed_at
      `;

      cumulativeIntendedNotional += sizing.slotNotional;
      // INC-96: mirror per-side tracker for the aggregate cap gate.
      // Incremented on the same path as cumulativeIntendedNotional so
      // downstream iterations see the same commitment view.
      acceptedNotionalBySide[capSide] += sizing.slotNotional;

      const cid = buildOvershootClientOrderId({
        runId, ticker: sel.ticker, side: sideUpper, intent, attempt: 0,
      });

      if (dryRun) {
        submissions.push({ symbol: sel.ticker, side: sel.side, qty: sizing.shares, lot_ids: [], order_id: null, client_order_id: cid, limit_price: priced.limitPrice });
        continue;
      }

      try {
        // Alpaca accepts 'sell' to open a short when the account has no
        // long shares. The overshoot broker-interface constrains to
        // 'buy'|'sell'; the CID + audit metadata carry the semantic
        // 'sell_short' intent via `side1='S'` + intent='entry'.
        const alpacaSide: 'buy' | 'sell' = sideUpper === 'LONG' ? 'buy' : 'sell';
        const acc = await submitter.submitOrder({
          symbol: sel.ticker, qty: sizing.shares, side: alpacaSide,
          type: 'limit', time_in_force: 'day',
          limit_price: priced.limitPrice, client_order_id: cid,
        }, nowTs);
        ordersSubmitted += 1;

        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: `overshoot.entry.submitted.${intent}`,
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: {
            ticker: sel.ticker, side: sel.side, tier: sel.tier, qty: sizing.shares,
            regime: regimeLabel, capacity_per_side: capacityPerSide,
            order_id: acc.order_id, client_order_id: acc.client_order_id,
            limit_price: priced.limitPrice, slippage_bps: priced.slippageBps,
            snapshot_age_ms: priced.snapshotAgeMs, minutes_to_close: minutesToClose,
            intent, attempt: 0, run_id: runId,
            sizingBase, strategy_allocation_pct: strategyAllocationPct, margin_multiplier: marginMultiplier,
            i5_reversion_pct: i5.reversionPct, orderSide_semantic: priced.orderSide,
          },
        });

        // Fetch fill; INSERT overshoot_lots for filled qty > 0.
        // Partial fills leave the order in-flight for later reconciliation;
        // we persist WHAT filled (broker truth).
        const fill = await fillFetcher.fetchFill(acc.order_id, nowTs);
        let lotId: string | null = null;
        if (fill.filled_qty > 0 && fill.avg_fill_price !== null) {
          const [lot] = await sql<{ lot_id: string }[]>`
            INSERT INTO overshoot_lots (symbol, entry_ts, qty, cost_basis, side, status, settlement_state, source_order_id)
            VALUES (${sel.ticker}, ${nowTs.toISOString()}::timestamptz, ${fill.filled_qty}, ${fill.avg_fill_price * fill.filled_qty}, ${sel.side}, 'open', 'pending', ${acc.order_id})
            RETURNING lot_id::text AS lot_id
          `;
          lotId = lot?.lot_id ?? null;
        } else {
          tally.fill_unfilled_no_lots += 1;
        }
        submissions.push({
          symbol: sel.ticker, side: sel.side, qty: sizing.shares,
          lot_ids: lotId ? [lotId] : [],
          order_id: acc.order_id, client_order_id: acc.client_order_id,
          limit_price: priced.limitPrice,
          filled_qty: fill.filled_qty, avg_fill_price: fill.avg_fill_price,
        });
      } catch (err) {
        tally.submissions_failed += 1;
        const reason = err instanceof OvershootAlpacaApiError ? `alpaca_api_${err.status}`
          : err instanceof OvershootAlpacaNetworkError ? 'alpaca_network_error'
          : err instanceof OvershootAlpacaCredentialError ? 'alpaca_credential_missing'
          : 'submit_unexpected';
        submissions.push({ symbol: sel.ticker, side: sel.side, qty: sizing.shares, lot_ids: [], order_id: null, client_order_id: cid, limit_price: priced.limitPrice, refusal: reason });
        await writeStrategyAuditEvent({
          strategyKey: 'overshoot',
          action: 'overshoot.entry.submit_failed',
          actorId: authCtx.user.id, targetType: 'overshoot_events', targetId: sel.ticker,
          correlationId,
          metadata: { ticker: sel.ticker, side: sel.side, reason, session_date: sessionDate, dry_run: dryRun, manual: manualConfirm, slot, run_id: runId },
        });
      }
    }

    await sql.end({ timeout: 5 });

    // T3b (ACT-480) — persist the entry-run row (MIG-157). Regime label
    // and signal context recorded for W5 slicing; NULL regime iff
    // regime.ok===false (regime_indeterminate audit written above).
    try {
      const persistSql: Sql = postgres(env.supabaseDbUrl, { max: 1, prepare: false, connect_timeout: 10 });
      try {
        await persistSql`
          INSERT INTO overshoot_entry_runs
            (run_id, session_date, detection_run_id, outcome, targets_loaded,
             orders_submitted, correlation_id, git_sha, regime,
             regime_signal_context, dry_run)
          VALUES (${runId}::uuid, ${sessionDate}::date, ${linkage.runId}::uuid,
                  'completed', ${targetsLoaded}, ${ordersSubmitted},
                  ${correlationId}, ${env.gitSha}, ${regimeLabel},
                  ${persistSql.json(regimeSignalContext)}::jsonb, ${dryRun})
        `;
      } finally {
        await persistSql.end({ timeout: 5 });
      }
    } catch (persistErr) {
      // Non-blocking: the run-level audit row is the historical truth;
      // the entry-runs table is the additive W5-slicing surface. A write
      // failure here logs to stderr and does NOT alter the response
      // envelope's outcome (money-path decisions have already committed).
      console.error(JSON.stringify({
        event: 'overshoot_entry_runs_insert_failed',
        correlationId, run_id: runId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      }));
    }

    return apiSuccess({
      outcome: 'completed',
      run_id: runId,
      intent,
      dry_run: dryRun,
      manual: manualConfirm,
      slot,
      session_date: sessionDate,
      detection_run_id: linkage.runId,
      prior_spy_session: linkage.priorSessionExpected,
      targets_loaded: targetsLoaded,
      orders_submitted: ordersSubmitted,
      refusals: tally,
      submissions,
      minutes_to_close: minutesToClose,
      sizingBase,
      strategy_allocation_pct: strategyAllocationPct,
      margin_multiplier: marginMultiplier,
      regime: regimeLabel,
      regime_signal_context: regimeSignalContext,
      detector_version: RATIFIED_DETECTOR_VERSION,
      capacity_long: OVERSHOOT_CAPACITY_LONG,
      capacity_short: OVERSHOOT_CAPACITY_SHORT,
      // INC-96 diagnostics: pin the deployed handler + surface the cap
      // decision surface every response for operator triage / attestation.
      handler_version: OVERSHOOT_ENTRY_RUN_VERSION,
      allocation_cap: {
        side_allocation_pct: {
          long:  OVERSHOOT_SIDE_ALLOCATION_PCT_LONG,
          short: OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT,
        },
        side_cap_usd:            sideCapUsd,
        open_mv_usd_by_side:     { long: openMV.long, short: openMV.short },
        mv_basis_mix:            openMV.basis_mix,
        accepted_notional_usd:   acceptedNotionalBySide,
        projected_side_mv_usd: {
          long:  openMV.long  + acceptedNotionalBySide.long,
          short: openMV.short + acceptedNotionalBySide.short,
        },
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    try { await sql.end({ timeout: 5 }); } catch { /* noop */ }
    console.error(JSON.stringify({ event: 'entry_run_unhandled', correlationId, err: String(err) }));
    return apiError(500, 'entry_run_unhandled_error', { correlationId });
  }
}));