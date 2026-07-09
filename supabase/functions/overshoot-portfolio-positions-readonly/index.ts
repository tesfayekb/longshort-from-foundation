/**
 * overshoot-portfolio-positions-readonly — ACT-491 (1).
 *
 * READ-ONLY operator Portfolio view surface for the OVERSHOOT strategy.
 * Sibling of `longshort-portfolio-positions-readonly`. Returns:
 *   - broker_positions: OvershootAlpaca (paper-only URL allow-list) /v2/positions
 *     with additive P&L fields (unrealized_pl, unrealized_intraday_pl,
 *     current_price, market_value, lastday_price). Typed-absence when the
 *     broker omits a field; NEVER fabricated 0.
 *   - internal_lots: currently-open rows from overshoot_lots (status='open').
 *
 * ── LIVE-PRICE CONTRACT BOUNDARY (ACT-491 ratification, verbatim) ────────
 * The Polygon-only LIVE-PRICE contract governs DECISION paths: sizing,
 * exit pricing, I5, detection. Broker-reported marks on a display-only
 * console mirror are BROKER-TRUTH OBSERVABILITY, not market-data
 * consumption in an execution path. This function lives outside the
 * execution tree; any future DECISION consumer of prices stays
 * Polygon-fenced. The overshoot-separation guard remains authoritative.
 *
 * MONEY-PATH INVARIANT: ZERO writes; ZERO calls to money-path surfaces
 * (no submit / no rebalance / no order-submitter / no lot-writer / no
 * equity-snapshot writer). GET-only Alpaca endpoint under the paper-only
 * allow-list, plus a single SELECT on overshoot_lots.
 *
 * Gate: `overshoot.view` — matches the Portfolio route gate.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { OvershootAlpacaPaperClient } from '../_shared/overshoot-broker/alpaca-paper-client.ts';
import { OvershootAlpacaPositionFetcher } from '../_shared/overshoot-broker/alpaca-position-fetcher.ts';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'GET') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'overshoot.view');

  const ts = new Date();

  const client = new OvershootAlpacaPaperClient();
  const positionFetcher = new OvershootAlpacaPositionFetcher(client);
  const brokerPositions = (await positionFetcher.listOpenPositions?.(ts)) ?? [];

  const { data: lotsData, error: lotsError } = await supabaseAdmin
    .from('overshoot_lots')
    .select('lot_id,symbol,side,qty,cost_basis,entry_ts,status,source_order_id')
    .eq('status', 'open')
    .order('entry_ts', { ascending: false });
  if (lotsError) throw lotsError;

  return apiSuccess({
    correlation_id: correlationId,
    fetched_at: ts.toISOString(),
    broker_positions: brokerPositions.map((p) => ({
      symbol: p.symbol,
      side: p.qty < 0 ? 'short' : 'long',
      qty: p.qty,
      avg_entry_price: p.avg_entry_price,
      current_price: p.current_price ?? null,
      market_value: p.market_value ?? null,
      unrealized_pl: p.unrealized_pl ?? null,
      unrealized_intraday_pl: p.unrealized_intraday_pl ?? null,
      lastday_price: p.lastday_price ?? null,
    })),
    internal_lots: (lotsData ?? []).map((l) => ({
      lot_id: l.lot_id,
      symbol: l.symbol,
      side: l.side,
      qty: Number(l.qty),
      cost_basis: Number(l.cost_basis),
      entry_ts: l.entry_ts,
      source_order_id: l.source_order_id,
    })),
  });
}));