/**
 * overshoot-equity-snapshot — ACT-491 (5) / FP-069-CANDIDATE-iii (H5).
 *
 * Daily broker-equity + position-mark-total snapshot for the Overshoot
 * Equity Curve. One row per SPY session per operator; idempotent by
 * (operator_id, snapshot_date) — PK-guarded upsert.
 *
 * DEC-023 envelope via _shared/handler.ts (T7). Deployed disarmed
 * (enabled=false in job_registry per the migration); operator arms via
 * the standing INC-82 bracket after cold-boot proof.
 *
 * BROKER-TRUTH READ ONLY. Same LIVE-PRICE contract carve-out as
 * overshoot-portfolio-positions-readonly: broker-reported marks on a
 * post-close snapshot are observability, not a DECISION price consumer.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { OvershootAlpacaPaperClient } from '../_shared/overshoot-broker/alpaca-paper-client.ts';
import { OvershootAlpacaPositionFetcher } from '../_shared/overshoot-broker/alpaca-position-fetcher.ts';
import { OvershootAlpacaAccountFetcher } from '../_shared/overshoot-broker/alpaca-account-fetcher.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

interface Body {
  as_of?: string;   // YYYY-MM-DD; defaults to today (UTC session date)
  dry_run?: boolean;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  if (req.method === 'GET') {
    return apiSuccess({
      ok: true,
      handler: 'overshoot-equity-snapshot',
      correlation_id: correlationId,
      note: 'POST { as_of?, dry_run? } to compute+persist a snapshot',
    });
  }
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // INC-99 / ACT-503: cron-first branch mirrors overshoot-fill-sweep
  // (supabase/functions/overshoot-fill-sweep/index.ts:132-143).
  if (req.headers.has('X-Cron-Secret')) {
    const cronAuthError = verifyCronSecret(req);
    if (cronAuthError) return cronAuthError;
  } else {
    const auth = await authenticateRequest(req);
    await checkPermissionOrThrow(auth.user.id, 'overshoot.manage');
  }

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { body = {}; }
  const dryRun = body.dry_run === true;

  const nowTs = new Date();
  const asOf = body.as_of ?? nowTs.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return apiError(400, 'invalid_as_of', { correlationId, as_of: asOf });
  }

  const client = new OvershootAlpacaPaperClient();
  const positionFetcher = new OvershootAlpacaPositionFetcher(client);
  const accountFetcher = new OvershootAlpacaAccountFetcher(client);

  const acct = await accountFetcher.fetchAccountSnapshot(nowTs);
  if (acct.ok === false) {
    return apiError(422, 'equity_snapshot_unavailable', {
      correlationId, refusal: acct.refusal, reason: acct.reason,
    });
  }
  const brokerEquity = acct.equity;

  const positions = (await positionFetcher.listOpenPositions?.(nowTs)) ?? [];
  let longMv = 0, shortMv = 0, positionMarkTotal = 0;
  let priced = 0;
  for (const p of positions) {
    const mv = p.market_value;
    if (mv === undefined || mv === null || !Number.isFinite(mv)) continue;
    priced += 1;
    positionMarkTotal += mv;
    if (mv >= 0) longMv += mv; else shortMv += mv;
  }
  const cash = brokerEquity - positionMarkTotal;

  // ACT-562 — benchmark-relative equity curve. Read SPY close for the
  // same session date from `overshoot_daily_bars` (in-house, D3-clean;
  // no external fetch at write-time). Typed-Optional discipline: null
  // when the SPY bar has not landed for `asOf` yet — never a sentinel.
  let spyClose: number | null = null;
  let spySource: string | null = null;
  try {
    const { data: spyRow, error: spyErr } = await supabaseAdmin
      .from('overshoot_daily_bars')
      .select('close')
      .eq('ticker', 'SPY')
      .eq('trade_date', asOf)
      .maybeSingle();
    if (!spyErr && spyRow && typeof spyRow.close === 'number' && Number.isFinite(spyRow.close)) {
      spyClose = spyRow.close;
      spySource = 'overshoot_daily_bars';
    }
  } catch (_e) {
    // Non-fatal — snapshot writes proceed with spy_close=null; the UI
    // renders a typed-absence on that row.
  }

  if (!dryRun) {
    const { error } = await supabaseAdmin
      .from('overshoot_equity_snapshots')
      .upsert({
        operator_id: OPERATOR_ID,
        snapshot_date: asOf,
        broker_equity: brokerEquity,
        position_mark_total: positions.length === 0 ? null : positionMarkTotal,
        cash,
        long_market_value: longMv,
        short_market_value: shortMv,
        positions_priced: priced,
        positions_total: positions.length,
        source: 'alpaca_paper_overshoot',
        fetched_at: nowTs.toISOString(),
        correlation_id: correlationId,
        spy_close: spyClose,
        spy_source: spySource,
      }, { onConflict: 'operator_id,snapshot_date' });
    if (error) {
      return apiError(500, 'snapshot_write_failed', {
        correlationId, message: error.message,
      });
    }
  }

  // ── ACT-562 tail — idempotent SPY backfill for prior-day snapshots ──
  // INC-125.b sibling (2026-07-22): a snapshot writer that runs BEFORE
  // the daily-bar upsert lands (~50m gap on the 21:10Z snapshot vs the
  // 22:00Z detection-run bar upsert) leaves that session's `spy_close`
  // NULL. Repair it here on the next snapshot fire, in bounded scope:
  // scan the last 14 snapshot rows for this operator with `spy_close IS
  // NULL`, look up the matching `overshoot_daily_bars.SPY.close`, and
  // UPDATE in place. Idempotent — a row that still has no bar stays
  // NULL; a row that already has a value is never overwritten (we only
  // touch NULL rows). Non-fatal on error.
  let spyBackfillPatched = 0;
  if (!dryRun) {
    try {
      const { data: gaps } = await supabaseAdmin
        .from('overshoot_equity_snapshots')
        .select('snapshot_date')
        .eq('operator_id', OPERATOR_ID)
        .is('spy_close', null)
        .neq('snapshot_date', asOf)
        .order('snapshot_date', { ascending: false })
        .limit(14);
      for (const row of gaps ?? []) {
        const gapDate = row.snapshot_date as string;
        const { data: barRow } = await supabaseAdmin
          .from('overshoot_daily_bars')
          .select('close')
          .eq('ticker', 'SPY')
          .eq('trade_date', gapDate)
          .maybeSingle();
        if (barRow && typeof barRow.close === 'number' && Number.isFinite(barRow.close)) {
          const { error: patchErr } = await supabaseAdmin
            .from('overshoot_equity_snapshots')
            .update({ spy_close: barRow.close, spy_source: 'overshoot_daily_bars' })
            .eq('operator_id', OPERATOR_ID)
            .eq('snapshot_date', gapDate)
            .is('spy_close', null);          // guard: never overwrite a set value
          if (!patchErr) spyBackfillPatched += 1;
        }
      }
    } catch (_e) {
      // Non-fatal — the primary snapshot write already succeeded.
    }
  }

  return apiSuccess({
    outcome: 'completed',
    dry_run: dryRun,
    snapshot_date: asOf,
    broker_equity: brokerEquity,
    position_mark_total: positions.length === 0 ? null : positionMarkTotal,
    cash,
    long_market_value: longMv,
    short_market_value: shortMv,
    positions_priced: priced,
    positions_total: positions.length,
    fetched_at: nowTs.toISOString(),
    correlation_id: correlationId,
    spy_close: spyClose,
    spy_source: spySource,
    spy_backfill_patched: spyBackfillPatched,
  });
}));