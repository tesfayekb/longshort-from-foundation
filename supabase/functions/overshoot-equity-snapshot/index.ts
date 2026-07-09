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

  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'overshoot.manage');

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
      }, { onConflict: 'operator_id,snapshot_date' });
    if (error) {
      return apiError(500, 'snapshot_write_failed', {
        correlationId, message: error.message,
      });
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
  });
}));