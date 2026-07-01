/**
 * longshort-portfolio-positions-readonly — FP-068 W1 (ACT-438).
 *
 * READ-ONLY operator Portfolio view surface. Returns:
 *   - broker_positions: Alpaca /v2/positions (bulk) via the shared
 *     AlpacaPaperClient + AlpacaPositionFetcher.listOpenPositions (paper-only
 *     URL allow-list enforced at client construction, INC-77 / DEC-068 (f)+(k).8).
 *     Includes the additive FP-068 P&L fields (unrealized_pl,
 *     unrealized_intraday_pl, lastday_price) — typed-absence when the broker
 *     omits a field; NEVER fabricated 0.
 *   - internal_lots: currently-open rows from longshort_lots (status='open'),
 *     the reconciled internal ledger side. Read via supabaseAdmin bypassing
 *     RLS only for the projection this endpoint returns; no write path.
 *
 * MONEY-PATH INVARIANT (LOAD-BEARING — do not weaken): this function performs
 *   ZERO writes and calls ZERO money-path surface (no submit-rebalance, no
 *   plan-rebalance, no order-submitter, no lot-writer, no equity-snapshot
 *   writer). GET-only Alpaca endpoint under the paper-only allow-list plus
 *   a single SELECT on longshort_lots. If a future edit adds a write path
 *   here, that edit violates the FP-068 W1 charter.
 *
 * Least-privilege gate: `longshort.view` (same permission the Portfolio route
 *   is already gated on in src/features/longshort/index.ts). The probe-alpaca-
 *   positions-readonly precedent uses `longshort.execute` because it was
 *   flat-state verification before arming an autonomous cron; a passive
 *   Portfolio VIEW is a read scope, not an execution scope.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { AlpacaPaperClient } from '../_shared/longshort-broker/alpaca-paper-client.ts';
import { AlpacaPositionFetcher } from '../_shared/longshort-broker/alpaca-position-fetcher.ts';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'GET') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  const auth = await authenticateRequest(req);
  await checkPermissionOrThrow(auth.user.id, 'longshort.view');

  const ts = new Date();

  // ── Broker side: Alpaca /v2/positions via the shared client + fetcher.
  //    Paper-only URL allow-list is enforced at AlpacaPaperClient construction.
  const client = new AlpacaPaperClient();
  const positionFetcher = new AlpacaPositionFetcher(client);
  const brokerPositions = await positionFetcher.listOpenPositions(ts);

  // ── Internal side: currently-open longshort_lots. Projection only —
  //    the columns the UI renders + the reconciliation banner needs.
  const { data: lotsData, error: lotsError } = await supabaseAdmin
    .from('longshort_lots')
    .select('lot_id,symbol,side,qty,cost_basis,entry_ts,status,source_order_id')
    .eq('status', 'open')
    .order('entry_ts', { ascending: false });
  if (lotsError) throw lotsError;

  return apiSuccess({
    correlation_id: correlationId,
    fetched_at: ts.toISOString(),
    broker_positions: brokerPositions.map((p) => ({
      symbol: p.symbol,
      // BrokerPosition does not carry an explicit `side`; Alpaca signs `qty`
      // (negative for shorts). Derive here for the UI join key. Zero-qty
      // is defensively treated as 'long' (should never occur on an open
      // position; broker returns no row when flat).
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
      qty: l.qty,
      cost_basis: l.cost_basis,
      entry_ts: l.entry_ts,
      source_order_id: l.source_order_id,
    })),
  });
}));