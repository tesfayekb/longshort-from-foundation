/**
 * OvershootAlpacaOpenOrdersFetcher (EDGE-RESIDENT) — enumerates in-flight
 * overshoot orders at Alpaca account #2. Endpoint: GET /v2/orders?status=open.
 *
 * FP-069 W3.6.b (ACT-463.b) — the B2-deferred open-orders enumerator now
 * due. Structural sibling of
 *   supabase/functions/_shared/longshort-broker/alpaca-open-orders-fetcher.ts
 * (I4 pattern source). The longshort copy remains untouched — the overshoot
 * tree owns its execution contract per the W3.2.a Blocker B1 ruling and the
 * W3.6.a state-machine/CID ratification.
 *
 * OVERSHOOT-SPECIFIC REBINDINGS (only differences vs the longshort copy):
 *   1. CID_RE is imported from
 *      '../overshoot-execution/client-order-id.ts' as OVERSHOOT_CID_RE.
 *      NEVER a local regex copy — that would be duplication (the W3.6.a
 *      module owns the ratified pattern; drift here would silently
 *      accept malformed CIDs on either side of the parse).
 *   2. State mapping — Alpaca lifecycle status → the 6-state machine per I2.
 *      /v2/orders?status=open only returns still-live rows (accepted /
 *      new / pending_new / partially_filled / etc.). All map to the
 *      transient 'submitted' state — none of the 6 ratified terminals
 *      is reachable from an /orders?status=open row (terminals are
 *      populated by the fill-fetcher + engine transitions, not here).
 *   3. Non-overshoot CIDs are IGNORED-WITH-COUNT, never thrown. Account #2
 *      may carry manual operator orders whose CID does not match
 *      OVERSHOOT_CID_RE; those are legitimate cross-tenant rows and must
 *      not break enumeration.
 *   4. Malformed overshoot rows (CID matches OVERSHOOT_CID_RE but the row
 *      body is unparseable — bad qty, bad limit_price, unmapped status)
 *      are SURFACED (thrown) — never silently skipped, per the W3.2
 *      typed-absence discipline extended to enumeration paths.
 *
 * Per DEC-034 (3): errors propagate typed from the client layer AND from
 * this fetcher for malformed overshoot rows.
 * Per DEC-034 (4): fetched_at is the injected `ts` — no wall-clock read.
 */
import {
  OVERSHOOT_CID_RE,
  type OvershootIntent,
  type OvershootSide,
} from '../overshoot-execution/client-order-id.ts';
import type { OvershootExecutionState } from '../overshoot-execution/state-machine.ts';
import type { OvershootAlpacaPaperClient } from './alpaca-paper-client.ts';

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

/**
 * Alpaca statuses that legitimately appear on /v2/orders?status=open. Any
 * status outside this set on an overshoot-CID row is a contract surprise
 * (broker semantics drift) and is surfaced — never silently mapped.
 */
const OPEN_STATUSES = new Set([
  'accepted',
  'new',
  'pending_new',
  'accepted_for_bidding',
  'partially_filled',
]);

/**
 * Parsed overshoot open order. CID components are exposed so downstream
 * engines (W3.6.d/e) can idempotency-anchor on the ratified tuple
 * (run_id, ticker, side, intent, attempt) without re-parsing. `state` is
 * always 'submitted' on this surface — terminals live in the engine layer.
 */
export interface OvershootOpenOrder {
  order_id: string;
  client_order_id: string;
  symbol: string;
  /** Broker-reported side. Long-entry → 'buy'; short-entry → 'sell'. */
  broker_side: 'buy' | 'sell';
  /** Requested share count. > 0 (Alpaca invariant on open rows). */
  qty: number;
  /** Working limit price. > 0 (Alpaca invariant on open limit rows). */
  limit_price: number;
  /** Broker-reported partial fill segment. 0 if not partially filled. */
  filled_qty: number;
  /** Raw Alpaca lifecycle status (preserved for reconciliation audit). */
  alpaca_status: string;
  /** State-machine projection — always 'submitted' for open rows. */
  state: OvershootExecutionState;
  /** CID-anchored idempotency components (parsed from client_order_id). */
  run8: string;
  ticker: string;
  side: OvershootSide;
  intent: OvershootIntent;
  attempt: number;
  submitted_at: Date;
}

export interface OvershootOpenOrdersSnapshot {
  orders: OvershootOpenOrder[];
  /**
   * Rows whose client_order_id did NOT match OVERSHOOT_CID_RE. Counted, not
   * thrown — account #2 may legitimately carry manual operator orders.
   * Persisted into reconciliation audit so the count is observable.
   */
  ignored_foreign_count: number;
  fetched_at: Date;
}

export class OvershootAlpacaOpenOrdersFetcher {
  constructor(private readonly client: OvershootAlpacaPaperClient) {}

  async listOpenOvershootOrders(ts: Date): Promise<OvershootOpenOrdersSnapshot> {
    const resp = await this.client.getJson<AlpacaOpenOrder[]>(
      '/v2/orders?status=open&limit=500&direction=asc',
    );
    const orders: OvershootOpenOrder[] = [];
    let ignored_foreign_count = 0;
    for (const o of resp) {
      const m = OVERSHOOT_CID_RE.exec(o.client_order_id);
      if (!m) {
        ignored_foreign_count += 1;
        continue;
      }
      const [, run8, ticker, side1, intentStr, attemptStr] = m;

      // Malformed-row surfacing (W3.2 discipline). Any of these throws
      // rather than silently coercing to a default — the caller reconciles
      // by inspecting the thrown error, not by receiving a phantom row.
      if (!OPEN_STATUSES.has(o.status)) {
        throw new Error(
          `overshoot-open-orders: unexpected status='${o.status}' on overshoot CID '${o.client_order_id}' (expected one of ${[...OPEN_STATUSES].join(',')})`,
        );
      }
      const qty = parseFloat(o.qty); // allow-bare-parsefloat: DW-058-B1 parity
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(
          `overshoot-open-orders: unparseable qty='${o.qty}' on overshoot CID '${o.client_order_id}'`,
        );
      }
      const limit_raw = o.limit_price;
      if (limit_raw == null || limit_raw === '') {
        throw new Error(
          `overshoot-open-orders: missing limit_price on overshoot CID '${o.client_order_id}' (open overshoot rows are limit-priced)`,
        );
      }
      const limit_price = parseFloat(limit_raw); // allow-bare-parsefloat: DW-058-B1 parity
      if (!Number.isFinite(limit_price) || limit_price <= 0) {
        throw new Error(
          `overshoot-open-orders: unparseable limit_price='${limit_raw}' on overshoot CID '${o.client_order_id}'`,
        );
      }
      const attempt = Number.parseInt(attemptStr, 10);
      if (!Number.isFinite(attempt) || attempt < 0) {
        throw new Error(
          `overshoot-open-orders: unparseable attempt='${attemptStr}' on overshoot CID '${o.client_order_id}'`,
        );
      }
      // filled_qty typed-absence — never fabricated. Broker-reported partial
      // segment (0 if omitted / empty / non-finite). Non-finite/negative
      // collapses to 0 (conservative: treats whole qty as still working).
      const filled_raw = o.filled_qty != null && o.filled_qty !== ''
        ? parseFloat(o.filled_qty) // allow-bare-parsefloat: DW-058-B1 parity
        : 0;
      const filled_qty = Number.isFinite(filled_raw) && filled_raw > 0
        ? Math.min(filled_raw, qty)
        : 0;

      orders.push({
        order_id: o.id,
        client_order_id: o.client_order_id,
        symbol: o.symbol,
        broker_side: o.side,
        qty,
        limit_price,
        filled_qty,
        alpaca_status: o.status,
        state: 'submitted',
        run8,
        ticker,
        side: side1 === 'L' ? 'LONG' : 'SHORT',
        intent: intentStr as OvershootIntent,
        attempt,
        submitted_at: o.submitted_at ? new Date(o.submitted_at) : ts,
      });
    }
    return { orders, ignored_foreign_count, fetched_at: ts };
  }
}