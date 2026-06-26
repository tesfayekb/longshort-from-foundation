/**
 * AlpacaOpenOrdersFetcher (EDGE-RESIDENT) — consumed by
 * `broker-bootstrap.reconstructInFlight(ts)`. Endpoint: GET /v2/orders?status=open.
 *
 * ACT-316 transcription of src/.../alpaca-open-orders-fetcher.ts. Behavior is
 * byte-identical; only the import paths differ. Carries the FIXED cid regex
 * `[A-Z0-9.-]` (no useless backslash — Gate-0b stays green).
 *
 * Implements the E3 SURFACE-1 invariant — broker IS the authoritative in-flight
 * state; each tick reconstructs the working set from the open-orders list.
 */
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';
import type { InFlightOrder, OrderState, TradeType } from '../longshort-execution/state-machine.ts';
import type { DeltaIntent } from '../longshort-execution/rebalance-planner.ts';
import type { DeltaProvenance } from '../longshort-execution/order-submitter.ts';

interface AlpacaOpenOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  status: string;
  limit_price: string | null;
  submitted_at: string | null;
  filled_qty?: string | null;
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
  return null;
}

function mapStateForReconstruction(alpacaStatus: string): OrderState | null {
  if (ACCEPTED_PHASE1.has(alpacaStatus)) return 'phase1_pending';
  if (ACCEPTED_PHASE2.has(alpacaStatus)) return 'phase2_working';
  return null;
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
      // DEC-070 clause (b): preserve the broker-reported filled segment so
      // the planner subtracts it when computing the working remainder. Bad
      // values (NaN / negative) collapse to 0 — the conservative choice
      // (treats the whole qty as still working, which can only OVER-noop,
      // never under-noop, preserving safety).
      const filled_qty_raw = o.filled_qty != null && o.filled_qty !== ''
        ? parseFloat(o.filled_qty) // allow-bare-parsefloat: DW-058-B1
        : 0;
      const filled_qty = Number.isFinite(filled_qty_raw) && filled_qty_raw > 0
        ? Math.min(filled_qty_raw, qty)
        : 0;
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
        filled_qty,
      });
    }
    return out;
  }
}