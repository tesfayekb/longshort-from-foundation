/**
 * AlpacaRecentlyFilledOrdersFetcher (EDGE-RESIDENT) — ACT-403 (Finding-B Option-1).
 *
 * Problem: the 15-min advance-only tick reconstructs in-flight via
 * `AlpacaOpenOrdersFetcher` (status=open). Paper orders typically reach
 * status=filled between ticks → they are GONE from the open set before
 * the next reconstruction runs → `fillFetcher.fetchFill` is never called
 * for them → `terminal_filled` never emits → `longshort_lots` never accrues.
 *
 * Fix (Option 1, lower blast radius): pull recently-filled broker orders
 * with a bounded lookback (default 2× tick interval = safety floor that
 * survives one missed tick), shape them as InFlightOrder{state:phase2_working},
 * and hand them to the same advanceTick pipeline. The fill-poll observes
 * filled:true on the next call → terminal_filled emits → LotLedgerSink fires.
 *
 * Idempotency across the overlapping window is enforced by the lot-ledger
 * writer's `source_order_id` dedup pre-check + the MIG-148 partial unique
 * index. The same broker order seen on two consecutive ticks records ONCE.
 *
 * Endpoint: GET /v2/orders?status=closed&after=<ts-LOOKBACK>&direction=asc.
 * The Alpaca closed bucket includes status=filled (and others); we filter
 * to `status==='filled' && filled_qty>0` AND `client_order_id` matching
 * our `lse-` CID prefix (the literal output of buildClientOrderId).
 */
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';
import type { InFlightOrder, OrderState, TradeType } from '../longshort-execution/state-machine.ts';
import type { DeltaIntent } from '../longshort-execution/rebalance-planner.ts';
import type { DeltaProvenance } from '../longshort-execution/order-submitter.ts';

interface AlpacaClosedOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  status: string;
  limit_price: string | null;
  submitted_at: string | null;
  filled_at?: string | null;
  filled_qty?: string | null;
  filled_avg_price?: string | null;
}

const RECONSTRUCTED_PROVENANCE: DeltaProvenance = {
  selection_reason: 'primary',
  substituted_from_symbol: null,
  original_rank: -1,
  sector: 'reconstructed_filled',
  computed_at: '1970-01-01T00:00:00.000Z',
};

// MUST match `buildClientOrderId` (order-submitter.ts:197):
//   `lse-${symbol}-${intent}-${ts.getTime()}`
// Mirrors AlpacaOpenOrdersFetcher's CID_RE — single source of shape would
// require a cross-file export refactor (scope-out for ACT-403); the two
// regexes are byte-identical and asserted by the fetcher's own test.
const CID_RE = /^lse-([A-Z0-9.-]+)-(open|increase|decrease|close|noop)-(\d+)(?:-step(\d+))?$/;

function deriveSide(intent: DeltaIntent, broker_side: 'buy' | 'sell'): 'long' | 'short' | null {
  if (intent === 'open' || intent === 'increase') return broker_side === 'buy' ? 'long' : 'short';
  if (intent === 'close' || intent === 'decrease') return broker_side === 'sell' ? 'long' : 'short';
  return null;
}

/** Default lookback = 2× the 15-min tick interval. Survives one missed
 *  tick without needing a persisted high-water mark. Overridable via
 *  `LONGSHORT_RECENT_FILL_LOOKBACK_S`. */
export const DEFAULT_RECENT_FILL_LOOKBACK_S = 1800;

export class AlpacaRecentlyFilledOrdersFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async listRecentlyFilledAsInFlight(ts: Date, lookbackS: number): Promise<InFlightOrder[]> {
    if (!(lookbackS > 0)) return [];
    const afterIso = new Date(ts.getTime() - lookbackS * 1000).toISOString();
    // direction=asc + status=closed: Alpaca returns terminal-state orders
    // (filled / canceled / rejected / expired / done_for_day) submitted
    // after `after`. We filter to filled.
    const url = `/v2/orders?status=closed&after=${encodeURIComponent(afterIso)}&limit=500&direction=asc`;
    const resp = await this.client.getJson<AlpacaClosedOrder[]>(url);
    const out: InFlightOrder[] = [];
    for (const o of resp) {
      if (o.status !== 'filled') continue;
      const filled_qty_raw = o.filled_qty != null && o.filled_qty !== ''
        ? parseFloat(o.filled_qty) // allow-bare-parsefloat: DW-058-B1
        : 0;
      if (!Number.isFinite(filled_qty_raw) || filled_qty_raw <= 0) continue;
      const m = CID_RE.exec(o.client_order_id);
      if (!m) continue; // not ours — different strategy / manual order
      const intent = m[2] as DeltaIntent;
      const ladder_step = m[4] ? Number(m[4]) : 0;
      const side = deriveSide(intent, o.side);
      if (!side) continue;
      const qty = parseFloat(o.qty); // allow-bare-parsefloat: DW-058-B1
      if (!(qty > 0)) continue;
      // limit_price absent on a filled-at-market order is acceptable here
      // (the kernel does not advance step when state==='phase2_working';
      // it observes the fill and transitions terminal). Use 0 sentinel
      // ONLY because the field is unused downstream for this code path.
      const limit_price = o.limit_price != null && o.limit_price !== ''
        ? parseFloat(o.limit_price) // allow-bare-parsefloat: DW-058-B1
        : 0;
      const submitted = o.submitted_at ? new Date(o.submitted_at) : ts;
      const filled_at = o.filled_at ? new Date(o.filled_at) : submitted;
      const trade_type: TradeType = 'entry';
      const state: OrderState = 'phase2_working';
      out.push({
        order_id: o.id,
        client_order_id: o.client_order_id,
        symbol: o.symbol,
        side,
        trade_type,
        intent,
        broker_side: o.side,
        shares: qty,
        current_limit_price: limit_price,
        state,
        ladder_step,
        submitted_at: submitted,
        accepted_at: filled_at,
        pending_elapsed_s: Math.max(
          0,
          Math.floor((ts.getTime() - submitted.getTime()) / 1000),
        ),
        provenance: RECONSTRUCTED_PROVENANCE,
        filled_qty: Math.min(filled_qty_raw, qty),
      });
    }
    return out;
  }
}