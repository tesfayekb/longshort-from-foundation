/**
 * AlpacaOpenOrdersFetcher — list-currently-open-orders adapter consumed by
 * `broker-bootstrap.reconstructInFlight(ts)`. Endpoint: GET /v2/orders?status=open.
 *
 * FP-056 E6-build (ACT-314). Implements the E3 SURFACE-1 invariant —
 * "broker IS the authoritative in-flight state; no persisted projection
 * table." Each tick reconstructs the working set by listing open orders.
 *
 * Mapping discipline:
 *   - Only orders whose `client_order_id` matches the strategy prefix
 *     `lse-{symbol}-{intent}-{ts_ms}[-step{n}]` (the `order-submitter`
 *     buildClientOrderId convention) are included. Orders from other
 *     systems (or manual operator orders on the same paper account) are
 *     filtered out — out-of-scope for the longshort tick.
 *   - `intent` is parsed from the cid; `broker_side` from `side`; `side`
 *     ('long'/'short') is derived from (intent, broker_side):
 *         open  + buy  → long;  open  + sell → short
 *         close + sell → long;  close + buy  → short
 *         increase: same as open; decrease: same as close
 *   - `trade_type` is always 'entry' at v1 (rank_exit / short_stop are
 *     not reconstructed from broker — they'd carry their own cid
 *     convention or live entirely within a single tick's submit→advance).
 *   - `state` mapping: Alpaca `accepted`/`new`/`pending_new` → `phase1_pending`;
 *     `partially_filled` → `phase2_working` (atomic-fill criterion at kernel);
 *     anything terminal is filtered out (not in-flight).
 *   - `provenance` is synthesized as `reconstructed` sentinel — the prime
 *     SubmissionResult provenance does NOT survive a process restart by
 *     design (broker-as-prime per §2). Audit linkage flows through
 *     `client_order_id` instead.
 */
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';
import type { InFlightOrder, OrderState, TradeType } from '../../../../../../supabase/functions/_shared/longshort-execution/state-machine.ts';
import type { DeltaIntent } from '../../../../../../supabase/functions/_shared/longshort-execution/rebalance-planner.ts';
import type { DeltaProvenance } from '../../../../../../supabase/functions/_shared/longshort-execution/order-submitter.ts';

interface AlpacaOpenOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  status: string;
  limit_price: string | null;
  submitted_at: string | null;
}

const RECONSTRUCTED_PROVENANCE: DeltaProvenance = {
  selection_reason: 'primary',
  substituted_from_symbol: null,
  original_rank: -1,
  sector: 'reconstructed',
  computed_at: '1970-01-01T00:00:00.000Z',
};

const CID_RE = /^lse-([A-Z0-9.-]+)-(open|increase|decrease|close|noop)-(\d+)(?:-step(\d+))?$/;

const ACCEPTED_PHASE1 = new Set(['accepted', 'new', 'pending_new', 'accepted_for_bidding']);
const ACCEPTED_PHASE2 = new Set(['partially_filled']);

function deriveSide(intent: DeltaIntent, broker_side: 'buy' | 'sell'): 'long' | 'short' | null {
  if (intent === 'open' || intent === 'increase') return broker_side === 'buy' ? 'long' : 'short';
  if (intent === 'close' || intent === 'decrease') return broker_side === 'sell' ? 'long' : 'short';
  return null; // noop — should not appear as an open order
}

function mapStateForReconstruction(alpacaStatus: string): OrderState | null {
  if (ACCEPTED_PHASE1.has(alpacaStatus)) return 'phase1_pending';
  if (ACCEPTED_PHASE2.has(alpacaStatus)) return 'phase2_working';
  return null; // terminal / pending_cancel / pending_replace → not in-flight here
}

export class AlpacaOpenOrdersFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async listOpenInFlight(ts: Date): Promise<InFlightOrder[]> {
    const resp = await this.client.getJson<AlpacaOpenOrder[]>(
      '/v2/orders?status=open&limit=500&direction=asc',
    );
    const out: InFlightOrder[] = [];
    for (const o of resp) {
      const m = CID_RE.exec(o.client_order_id);
      if (!m) continue;
      const intent = m[2] as DeltaIntent;
      const ladder_step = m[4] ? Number(m[4]) : 0;
      const side = deriveSide(intent, o.side);
      if (!side) continue;
      const state = mapStateForReconstruction(o.status);
      if (!state) continue;
      const limit_price = o.limit_price != null
        ? parseFloat(o.limit_price) // allow-bare-parsefloat: DW-058-B1
        : 0;
      if (!(limit_price > 0)) continue;
      const qty = parseFloat(o.qty); // allow-bare-parsefloat: DW-058-B1
      if (!(qty > 0)) continue;
      const submitted = o.submitted_at ? new Date(o.submitted_at) : ts;
      const trade_type: TradeType = 'entry';
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
        accepted_at: state === 'phase2_working' ? submitted : null,
        pending_elapsed_s: Math.max(0, Math.floor((ts.getTime() - submitted.getTime()) / 1000)),
        provenance: RECONSTRUCTED_PROVENANCE,
      });
    }
    return out;
  }
}