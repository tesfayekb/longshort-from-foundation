/**
 * AlpacaOrderAcceptanceFetcher (EDGE-RESIDENT) — implements BrokerOrderAcceptanceFetcher
 * against Alpaca paper. Endpoint: GET /v2/orders/{order_id}.
 *
 * ACT-316 — transcription of src/.../alpaca-order-acceptance-fetcher.ts. Behavior
 * is byte-identical to the src/ copy; only the import paths differ (interface +
 * client resolved within `_shared/`, no src/ crossing).
 *
 * Per §11.0.7 #13 tri-state mapping:
 *   Alpaca 'accepted' | 'new' | 'partially_filled' | 'filled' | 'done_for_day' → 'accepted'
 *   Alpaca 'rejected' | 'canceled' | 'expired' | 'suspended'                   → 'rejected'
 *   Alpaca 'pending_new' | 'accepted_for_bidding' | 'pending_cancel' | 'pending_replace' → 'pending'
 * Per DEC-034 clause (4): pending_elapsed_s derived from caller-injected `ts` minus
 * Alpaca's `submitted_at` ISO string; no Date.now / performance.now.
 */
import type {
  BrokerOrderAcceptanceResult,
  BrokerOrderAcceptanceFetcher,
  OrderAcceptanceState,
} from '../longshort-broker-interfaces.ts';
import type { AlpacaPaperClient } from './alpaca-paper-client.ts';

interface AlpacaOrderResponse {
  id: string;
  symbol: string | null;
  status: string;
  rejected_reason?: string | null;
  submitted_at?: string | null;
}

const ACCEPTED_STATES = new Set(['accepted', 'new', 'partially_filled', 'filled', 'done_for_day']);
const REJECTED_STATES = new Set(['rejected', 'canceled', 'expired', 'suspended']);

function mapStatus(alpacaStatus: string): OrderAcceptanceState {
  if (ACCEPTED_STATES.has(alpacaStatus)) return 'accepted';
  if (REJECTED_STATES.has(alpacaStatus)) return 'rejected';
  return 'pending';
}

export class AlpacaOrderAcceptanceFetcher implements BrokerOrderAcceptanceFetcher {
  constructor(private readonly client: AlpacaPaperClient) {}

  async fetchOrderAcceptance(
    order_id: string,
    _timeout_s: number,
    ts: Date,
  ): Promise<BrokerOrderAcceptanceResult> {
    const resp = await this.client.getJson<AlpacaOrderResponse>(
      `/v2/orders/${encodeURIComponent(order_id)}`,
    );
    const state = mapStatus(resp.status);
    const submittedMs = resp.submitted_at ? new Date(resp.submitted_at).getTime() : null;
    const pending_elapsed_s = submittedMs !== null
      ? Math.max(0, Math.floor((ts.getTime() - submittedMs) / 1000))
      : 0;
    return {
      order_id: resp.id,
      symbol: resp.symbol ?? null,
      state,
      rejection_reason: state === 'rejected' ? (resp.rejected_reason ?? null) : null,
      pending_elapsed_s,
      fetched_at: ts,
    };
  }
}