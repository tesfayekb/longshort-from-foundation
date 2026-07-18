/**
 * overshoot-short-interest-compute — FP-069 W3.3.b overshoot SI derivation
 * handler. First deployed W3 runtime surface (per operator sub-turn split).
 *
 * OWNER: overshoot (parallel-tree sibling of the longshort short-interest
 *   orchestrator — NEVER imports from `_shared/longshort-signals/**`).
 * CLASSIFICATION: signal-compute (money-path-adjacent — writes the
 *   `overshoot_short_interest` cache the detector kernel will read).
 *
 * CONTRACT (per operator W3.3.b brief):
 *   POST {
 *     as_of?: 'YYYY-MM-DD',   // injected clock; defaults to today UTC
 *     probe?: 'alpaca'|'polygon', // GATE-ZERO dual-vendor runtime probes
 *     tickers?: string[],     // explicit list; else full active universe
 *     batch_size?: number,    // default DEFAULT_FULL_BATCH_SIZE (40)
 *     resume_from?: string,   // exclusive cursor (ticker > resume_from)
 *   }
 *
 * AUTH: `authenticateRequest` + `checkPermissionOrThrow('overshoot.manage')`
 *   (DEC-023 envelope via `createHandler`). Cron wiring (`sql/30_*`) is
 *   authored in the same tranche as an operator-run artifact — cron.job
 *   rows do NOT exist until the operator arms + wires post-attestation
 *   (disarm-fire-enable convention: MIG-066 / MIG-074 / MIG-076 / MIG-102 /
 *   MIG-106 precedent).
 *
 * THREE SKIP GATES (mirroring the convention documented in
 * `longshort-combiner-assemble/index.ts:32-44`):
 *   1. Global kill-switch — `job_registry` row id='__kill_switch__' with
 *      `enabled=false` (active). Two-stage defense-in-depth.
 *   2. Job disarmed — `job_registry` row id='overshoot.short_interest.compute'
 *      with `enabled=false` (operator hasn't armed this cron yet — the
 *      disarm-fire-enable convention; seed lands with enabled=false, arm
 *      step is operator-applied via sql/30 at b.iii-arm).
 *   3. Probe modes — GATE-ZERO no-op vendor-credential reads that
 *      short-circuit BEFORE the skip gates so probes work regardless of
 *      the arm-state (a paused/disarmed system MUST still be probeable).
 *      Probes NEVER touch the DB and NEVER emit any secret material.
 *
 * WALL-CLOCK DISCIPLINE (DEC-034 clause 4): `productionClock.getWallClockTs()`
 * is the sole source; all timestamps derive from `as_of.toISOString()`. No
 * `new Date()` / `Date.now()` in this file.
 *
 * DERIVATION CONTRACT (byte-verbatim to
 * `_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts:319-335`,
 * captured verbatim at ACT-460.a A3):
 *
 *     const shares = shResult.shares;
 *     if (!Number.isFinite(shares) || shares <= 0) { ...skip... }
 *     reports.map(r => ({ report_date: r.report_date,
 *                         si_pct_float: r.short_interest / shares }))
 *
 * CONSCIOUS APPROXIMATION: current shares-outstanding is used to
 * denominate BOTH historical SI counts (same doc as the longshort
 * precedent; pinned in the sibling fetcher, in the schema COMMENT on
 * `overshoot_short_interest`, in the module doc, and here at the divide
 * site). Approximations are acceptable; hidden approximations are not.
 *
 * TYPED-ABSENCE (§9 anti-sentinel, DW-106 discipline):
 *   - SI fetch `unavailable` → NO row written for that ticker (no report
 *     date exists; NEVER a fabricated zero-SI row).
 *   - Shares fetch `unavailable` (or defensive `!Number.isFinite || <= 0`)
 *     → rows STILL written with `si_pct_float = NULL` and `dtc` carried
 *     through from the SI fetcher (typed null on the denominator side —
 *     never a fabricated denominator; see anti-phantom-defaults §22 in
 *     the module doc + orchestrator.ts:291-330 comment block).
 *   - `dtc` NULL when Polygon omits both `days_to_cover` and a positive
 *     `avg_daily_volume` (typed null preserved from
 *     `polygon-short-interest-fetcher.ts:116-142`).
 *
 * RUN ATTRIBUTION: `source_run_id` is a UUID minted per invocation and
 * stamped on every upserted row (the `overshoot_short_interest` schema
 * comment names this the source-run correlation field). A formal
 * `overshoot_signal_runs` table is NOT introduced this tranche — the
 * existing `overshoot_backfill_runs.kind CHECK` is scoped to
 * `{universe_seed, bars, earnings_finnhub, earnings_fmp}` (verified
 * against `pg_constraint` at authoring time) and extending it would
 * exceed b.i scope. Attribution across rows is preserved via the shared
 * UUID; a per-invocation runs table is tracked as a b.iii follow-up.
 *
 * IDEMPOTENT UPSERT: `onConflict: 'as_of_date,ticker'` — byte-matches
 * `overshoot_short_interest` PRIMARY KEY (as_of_date, ticker) per A6
 * (migration `20260704023836_*.sql:CREATE TABLE public.overshoot_short_interest`).
 * Re-invocation of the same batch produces zero net delta on the
 * (as_of_date, ticker) grain — only `si_pct_float`, `dtc`,
 * `source_run_id`, and `computed_at` refresh.
 *
 * PROBE RESPONSE CONTRACTS (GATE-ZERO):
 *   probe: 'alpaca' → { ok, account_last4, status, paper: true,
 *                       correlation_id }
 *     - `account_last4` is the LAST 4 CHARS of the account_number
 *       (PA37Y0DBAZD5 → 'AZD5' for overshoot's account #2 vs
 *       PA3CRAJBSVZO → 'SVZO' for longshort's account #1; INC-77 comparator).
 *     - NEVER emits `account_number`, `key`, `secret`, or any subset of
 *       secret material other than the audit-safe last-4 comparator.
 *   probe: 'polygon' → { ok, status, report_count?, reason?, correlation_id }
 *     - status is one of 'reports' | 'subscription_gated' | 'data_unavailable'.
 *     - report_count present only when status='reports'.
 *     - Writes NOTHING to the DB.
 *
 * IMPORT MEMBRANE: overshoot tree. Zero imports from
 * `_shared/longshort-signals/**`, `_shared/longshort-combiner/**`,
 * `_shared/longshort-broker/**`, `_shared/longshort-execution/**`,
 * `_shared/longshort-universe/**` (the A3 allowlist covers only three
 * leaf utils, none of which live under those subtrees other than
 * `longshort-universe/shared/fetch-with-timeout.ts` — imported transitively
 * via the overshoot fetchers, not directly here).
 *
 * Added by: ACT-460.b.i (FP-069 W3.3.b.i).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import {
  PolygonShortInterestFetcher,
  DEFAULT_SHORT_INTEREST_LIMIT,
  type RawShortInterestReport,
  type ShortInterestFetchResult,
} from '../_shared/overshoot/polygon-short-interest-fetcher.ts';
import {
  PolygonSharesOutstandingFetcher,
  type SharesOutstandingFetchResult,
} from '../_shared/overshoot/polygon-shares-outstanding-fetcher.ts';
import {
  OvershootAlpacaPaperClient,
  OvershootAlpacaApiError,
  OvershootAlpacaCredentialError,
  OvershootAlpacaNetworkError,
} from '../_shared/overshoot-broker/alpaca-paper-client.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'overshoot.short_interest.compute';
const KILL_SWITCH_ID = '__kill_switch__';

// DEFECT-3 remediation batch caps (bars fn precedent — heavier here because
// each ticker costs TWO Polygon requests: /stocks/v1/short-interest +
// /v3/reference/tickers/{T}). Lower default + max accordingly.
const DEFAULT_FULL_BATCH_SIZE = 40;
const MAX_FULL_BATCH_SIZE = 80;
const BATCH_HARD_CAP_EXPLICIT = 50;
const INTER_TICKER_PACING_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function isRowDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  return data ? data.enabled === false : false;
}

interface UpsertRow {
  as_of_date: string;
  ticker: string;
  si_pct_float: number | null;
  dtc: number | null;
  source_run_id: string;
  computed_at: string;
}

/**
 * Derive per-report `si_pct_float` byte-verbatim to the A3 contract at
 * `short-interest-orchestrator.ts:319-335`. `shares` may be `null` when
 * the shares-outstanding fetcher returned `unavailable` — in that case
 * every produced row carries `si_pct_float=NULL` (typed absence on the
 * denominator side; NEVER a fabricated denominator).
 */
function deriveRows(
  ticker: string,
  reports: RawShortInterestReport[],
  shares: number | null,
  runId: string,
  computedAtIso: string,
): UpsertRow[] {
  const out: UpsertRow[] = [];
  for (const r of reports) {
    let si_pct_float: number | null;
    if (shares !== null && Number.isFinite(shares) && shares > 0) {
      // A3 CONTRACT (byte-verbatim; conscious approximation documented above).
      si_pct_float = r.short_interest / shares;
      if (!Number.isFinite(si_pct_float)) si_pct_float = null;
    } else {
      // Typed absence — divide site refuses to fabricate a denominator.
      si_pct_float = null;
    }
    out.push({
      as_of_date: r.report_date,
      ticker,
      si_pct_float,
      dtc: r.days_to_cover,
      source_run_id: runId,
      computed_at: computedAtIso,
    });
  }
  return out;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // INC-99 / ACT-503: cron-first branch mirrors overshoot-fill-sweep
  // (supabase/functions/overshoot-fill-sweep/index.ts:132-143). Scheduled
  // invocations carry the anon Authorization header plus X-Cron-Secret; the
  // anon JWT is not a user session, so the cron branch MUST be authenticated
  // before the manual JWT/RBAC branch.
  if (req.headers.has('X-Cron-Secret')) {
    const cronAuthError = verifyCronSecret(req);
    if (cronAuthError) return cronAuthError;
  } else {
    const authCtx = await authenticateRequest(req);
    await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');
  }

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown> ?? {}; }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }

  // ─── GATE-ZERO PROBES (skip-gate #3 in convention; ordered FIRST so a
  //     disarmed / kill-switched system can still be probed for credential
  //     hygiene without touching the DB). Probes NEVER emit secret material. ───
  if (body.probe === 'alpaca') {
    try {
      const client = new OvershootAlpacaPaperClient();
      const account = await client.getJson<{ account_number?: string; status?: string }>(
        '/v2/account',
      );
      const acct = typeof account.account_number === 'string' ? account.account_number : '';
      const account_last4 = acct.length >= 4 ? acct.slice(-4) : null;
      return apiSuccess({
        ok: true,
        probe: 'alpaca',
        account_last4,
        status: typeof account.status === 'string' ? account.status : null,
        paper: true,
        correlation_id: correlationId,
      });
    } catch (e) {
      const detail =
        e instanceof OvershootAlpacaApiError
          ? `alpaca_api_error status=${e.status} endpoint=${e.endpoint}`
          : e instanceof OvershootAlpacaCredentialError
          ? 'alpaca_credential_missing'
          : e instanceof OvershootAlpacaNetworkError
          ? `alpaca_network_error endpoint=${e.endpoint}`
          : e instanceof Error ? e.message : String(e);
      console.error('[overshoot-si-compute] alpaca probe failed:', detail, { correlationId });
      return apiError(502, 'alpaca_probe_failed', { correlationId });
    }
  }

  const polygonKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonKey) return apiError(500, 'polygon_api_key_unset', { correlationId });

  if (body.probe === 'polygon') {
    const fetcher = new PolygonShortInterestFetcher(polygonKey);
    try {
      const result: ShortInterestFetchResult = await fetcher.fetchShortInterest(
        'AAPL',
        productionClock.getWallClockTs(),
      );
      if (result.kind === 'reports') {
        return apiSuccess({
          ok: true,
          probe: 'polygon',
          status: 'reports',
          report_count: result.reports.length,
          correlation_id: correlationId,
        });
      }
      return apiSuccess({
        ok: true,
        probe: 'polygon',
        status: result.reason,
        correlation_id: correlationId,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.error('[overshoot-si-compute] polygon probe failed:', detail, { correlationId });
      return apiError(502, 'polygon_probe_failed', { correlationId });
    }
  }

  // ─── SKIP GATE #1 — global kill-switch (mirrors combiner-assemble). ─────
  if (await isRowDisarmed(KILL_SWITCH_ID)) {
    await writeStrategyAuditEvent({
      strategyKey: 'overshoot',
      action: 'overshoot.short_interest.compute.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        reason: 'global_kill_switch_active',
        trigger: 'manual',
      },
    });
    return apiSuccess({
      ok: true,
      outcome: 'skipped',
      reason: 'global_kill_switch_active',
      correlation_id: correlationId,
    });
  }

  // ─── SKIP GATE #2 — job disarmed (this cron's own registry row). ────────
  if (await isRowDisarmed(JOB_REGISTRY_ID)) {
    await writeStrategyAuditEvent({
      strategyKey: 'overshoot',
      action: 'overshoot.short_interest.compute.skipped',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        reason: 'job_disarmed',
        job_registry_id: JOB_REGISTRY_ID,
        trigger: 'manual',
      },
    });
    return apiSuccess({
      ok: true,
      outcome: 'skipped',
      reason: 'job_disarmed',
      correlation_id: correlationId,
    });
  }

  // ─── as_of resolution (injected clock; DEC-034 clause 4 chokepoint). ────
  const asOfRaw = body.as_of;
  const as_of = asOfRaw ? parseAsOfDate(asOfRaw) : productionClock.getWallClockTs();
  if (!as_of) {
    return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  }

  // ─── Ticker resolution: explicit list OR full active universe. ──────────
  let tickers: string[] = [];
  let done = false;
  if (Array.isArray(body.tickers)) {
    tickers = (body.tickers as unknown[])
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .map((t) => t.toUpperCase());
    if (tickers.length === 0) {
      return apiError(400, 'no_tickers_resolved', { correlationId });
    }
    if (tickers.length > BATCH_HARD_CAP_EXPLICIT) {
      console.error('[overshoot-si-compute] batch exceeds hard cap:', tickers.length, { correlationId });
      return apiError(400, 'batch_exceeds_hard_cap_50', { correlationId });
    }
    done = true;
  } else {
    const q = supabaseAdmin
      .from('overshoot_universe')
      .select('ticker')
      .eq('active', true)
      .order('ticker', { ascending: true });
    const { data, error } = await q;
    if (error) {
      console.error('[overshoot-si-compute] universe read failed:', error.message, { correlationId });
      return apiError(500, 'universe_read_failed', { correlationId });
    }
    tickers = (data ?? []).map((r) => r.ticker as string);
    if (typeof body.resume_from === 'string' && body.resume_from.length > 0) {
      tickers = tickers.filter((t) => t > (body.resume_from as string));
    }
    const requested = typeof body.batch_size === 'number' && body.batch_size > 0
      ? Math.floor(body.batch_size) : DEFAULT_FULL_BATCH_SIZE;
    const batchSize = Math.min(requested, MAX_FULL_BATCH_SIZE);
    if (tickers.length <= batchSize) {
      done = true;
    } else {
      tickers = tickers.slice(0, batchSize);
    }
    if (tickers.length === 0) {
      // Resume cursor is past the last universe ticker — batch is empty, run complete.
      return apiSuccess({
        ok: true,
        run_id: null,
        ticker_count: 0,
        row_count: 0,
        failure_count: 0,
        failures: [],
        last_cursor: null,
        done: true,
        correlation_id: correlationId,
      });
    }
  }

  // ─── Run attribution (invocation-scoped UUID; no runs-table INSERT
  //     because overshoot_backfill_runs.kind CHECK does not permit
  //     'short_interest' — extending it exceeds b.i scope). ─────────────
  const runId = crypto.randomUUID();
  const computedAtIso = as_of.toISOString();

  // ACT-527 historical backfill: optional `limit` overrides the default
  // fetcher window (6 reports ≈ 3 months bi-monthly). limit=120 covers
  // ~5 years of settlement dates in one call/ticker. Bounded [1, 200] for
  // safety. Same wire cost per ticker regardless (single Polygon call).
  const rawLimit = typeof body.limit === 'number' ? Math.floor(body.limit) : NaN;
  const siLimit: number = Number.isFinite(rawLimit) && rawLimit >= 1 && rawLimit <= 200
    ? rawLimit
    : DEFAULT_SHORT_INTEREST_LIMIT;

  await writeStrategyAuditEvent({
    strategyKey: 'overshoot',
    action: 'overshoot.short_interest.compute.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      run_id: runId,
      as_of: computedAtIso,
      ticker_count: tickers.length,
      done,
      si_limit: siLimit,
      trigger: 'manual',
    },
  });

  // ─── Iterate: fetch SI, fetch shares, derive, upsert. ────────────────────
  const siFetcher = new PolygonShortInterestFetcher(polygonKey);
  const shFetcher = new PolygonSharesOutstandingFetcher(polygonKey);
  let totalRows = 0;
  let reqCount = 0;
  let siUnavailableCount = 0;
  let sharesUnavailableCount = 0;
  const failures: Array<{ ticker: string; error: string }> = [];
  let lastCursor: string | null = null;

  for (const ticker of tickers) {
    reqCount++;
    let siResult: ShortInterestFetchResult;
    try {
      siResult = await siFetcher.fetchShortInterest(
        ticker,
        as_of,
        siLimit,
      );
    } catch (e) {
      failures.push({ ticker, error: `si_fetch: ${e instanceof Error ? e.message : String(e)}` });
      lastCursor = ticker;
      await sleep(INTER_TICKER_PACING_MS);
      continue;
    }

    if (siResult.kind === 'unavailable') {
      // No SI record for this ticker (subscription_gated or data_unavailable).
      // Anti-phantom: NO row written. NEVER a fabricated zero-SI row.
      siUnavailableCount++;
      lastCursor = ticker;
      await sleep(INTER_TICKER_PACING_MS);
      continue;
    }
    if (siResult.reports.length === 0) {
      // Zero reports in-window — nothing to derive. Not a failure.
      lastCursor = ticker;
      await sleep(INTER_TICKER_PACING_MS);
      continue;
    }

    let shResult: SharesOutstandingFetchResult;
    try {
      shResult = await shFetcher.fetchShares(ticker);
    } catch (e) {
      failures.push({ ticker, error: `shares_fetch: ${e instanceof Error ? e.message : String(e)}` });
      lastCursor = ticker;
      await sleep(INTER_TICKER_PACING_MS);
      continue;
    }

    // Typed-absence: shares unavailable ⇒ rows STILL written with
    // si_pct_float=NULL (dtc carried through). The denominator side is
    // typed-null; the SI report exists so the (as_of_date, ticker) grain
    // is legitimate.
    const shares: number | null = shResult.kind === 'shares' ? shResult.shares : null;
    if (shares === null) sharesUnavailableCount++;

    const rows = deriveRows(ticker, siResult.reports, shares, runId, computedAtIso);
    if (rows.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from('overshoot_short_interest')
        .upsert(rows, { onConflict: 'as_of_date,ticker' });
      if (upErr) {
        failures.push({ ticker, error: `upsert: ${upErr.message}` });
      } else {
        totalRows += rows.length;
      }
    }
    lastCursor = ticker;
    await sleep(INTER_TICKER_PACING_MS);
  }

  const outcome: 'completed' | 'partial' | 'failed' =
    failures.length === 0 ? 'completed' : (totalRows > 0 ? 'partial' : 'failed');

  await writeStrategyAuditEvent({
    strategyKey: 'overshoot',
    action: outcome === 'completed'
      ? 'overshoot.short_interest.compute.completed'
      : 'overshoot.short_interest.compute.failed',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      run_id: runId,
      as_of: computedAtIso,
      ticker_count: tickers.length,
      row_count: totalRows,
      failure_count: failures.length,
      si_unavailable_count: siUnavailableCount,
      shares_unavailable_count: sharesUnavailableCount,
      last_cursor: lastCursor,
      done,
      trigger: 'manual',
    },
  });

  return apiSuccess({
    ok: true,
    run_id: runId,
    ticker_count: tickers.length,
    row_count: totalRows,
    failure_count: failures.length,
    failures: failures.slice(0, 10),
    si_unavailable_count: siUnavailableCount,
    shares_unavailable_count: sharesUnavailableCount,
    last_cursor: lastCursor,
    done,
    outcome,
    correlation_id: correlationId,
  });
}));