/**
 * AlpacaCorporateActionFetcher (EDGE-RESIDENT) — FP-062 sub-step 6I.2b / ACT-382.
 *
 * Real broker-side implementation of `BrokerCorporateActionFetcher`. Replaces
 * (composes) the internal stand-in `createInternalCorporateActionStatusFetcher`
 * for the `broker_basis_adjusted` cross-check, while DELEGATING the
 * recent-action provenance (`recent_action_within_lookback`, `action_type`,
 * `action_ts`, `hours_since_action`) to the internal fetcher — Alpaca paper
 * exposes no CA-feed endpoint, so the `corporate_actions` table remains the
 * only recent-action source on paper.
 *
 * BUILD DISCIPLINE — §2 axiom 2 (cross-check posture):
 *   The real fetcher runs ALONGSIDE the internal stand-in. Internal asserts
 *   "applier ran" (applied_at IS NOT NULL); broker asserts "values agree"
 *   (Alpaca `/v2/positions/{symbol}.avg_entry_price` ≈ our internal
 *   `SUM(cost_basis)/SUM(qty)` over open lots — `cost_basis` is PER-SHARE).
 *   The composer's separate `unappliedCorporateActionReader` BLOCK gate is
 *   unchanged.
 *
 * ERROR DISCIPLINE — typed-throw, NO sentinel (DEC-034 (3) + anti-phantom):
 *   - No `|| 0`, no `?? false`, no synthetic `broker_basis_adjusted`.
 *   - Non-404 errors from `/v2/positions/{symbol}` propagate.
 *   - 404 with `recent_action_within_lookback=true` →
 *     `BrokerPositionMissingForCAReconciliation` (typed absence — the
 *     reconciliation lifecycle records `system_bug`, never a fabricated
 *     "adjusted" value).
 *   - When `!recent_action_within_lookback` the internal result is returned
 *     unchanged (no broker call; verifier path →
 *     `false_positive_within_tolerance`).
 *
 * NO WALL-CLOCK (DEC-034 (4)): all `fetched_at` timestamps derive from the
 * injected `ts`.
 */

import type {
  BrokerCorporateActionFetcher,
  BrokerCorporateActionSnapshot,
} from '../longshort-broker-interfaces.ts';
import { AlpacaApiError, type AlpacaPaperClient } from './alpaca-paper-client.ts';
import { supabaseAdmin } from '../supabase-admin.ts';

/** 1¢ tolerance — same class as `verify_realized_pnl` cents-rounding. */
const BASIS_TOLERANCE_USD = 0.01;

/** Narrow read surface for the lots aggregate (structural, no `as any`). */
export interface LotBasisReaderClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

/** Thrown when Alpaca returns 404 for `/v2/positions/{symbol}` while the
 *  internal corporate_actions table reports a recent action within lookback —
 *  a structural inconsistency the verifier must surface as `system_bug`,
 *  NEVER mask with a synthetic `broker_basis_adjusted` value. */
export class BrokerPositionMissingForCAReconciliation extends Error {
  readonly kind = 'broker_position_missing_for_ca_reconciliation';
  constructor(public readonly symbol: string) {
    super(
      `BrokerPositionMissingForCAReconciliation: Alpaca /v2/positions/${symbol} ` +
        `returned 404 while corporate_actions reports a recent action within lookback. ` +
        `Typed absence per DEC-034 (3) — refusing to fabricate broker_basis_adjusted.`,
    );
    this.name = 'BrokerPositionMissingForCAReconciliation';
  }
}

interface AlpacaPositionForCAResponse {
  symbol: string;
  qty: string;
  avg_entry_price: string;
}

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

export interface AlpacaCorporateActionFetcherOptions {
  /** Override the lots-aggregate client (tests). Defaults to `supabaseAdmin`. */
  lotsClient?: LotBasisReaderClient;
  /** Operator scope for the lots aggregate. Defaults to DEFAULT_OPERATOR_ID
   *  (mirrors the lot-ledger-writer convention in single-operator mode). */
  operatorId?: string;
}

export class AlpacaCorporateActionFetcher implements BrokerCorporateActionFetcher {
  private readonly lotsClient: LotBasisReaderClient;
  private readonly operatorId: string;

  constructor(
    private readonly client: AlpacaPaperClient,
    private readonly internalFetcher: BrokerCorporateActionFetcher,
    options: AlpacaCorporateActionFetcherOptions = {},
  ) {
    this.lotsClient = options.lotsClient
      ?? (supabaseAdmin as unknown as LotBasisReaderClient);
    this.operatorId = options.operatorId ?? DEFAULT_OPERATOR_ID;
  }

  async fetchCorporateActionSnapshot(
    symbol: string,
    lookback_days: number,
    ts: Date,
  ): Promise<BrokerCorporateActionSnapshot> {
    // STEP 1 — delegate recent-action provenance to the internal stand-in.
    const internal = await this.internalFetcher.fetchCorporateActionSnapshot(
      symbol,
      lookback_days,
      ts,
    );
    if (!internal.recent_action_within_lookback) {
      // No broker call — verifier short-circuits to
      // `false_positive_within_tolerance` via `!recent_action`.
      return internal;
    }

    // STEP 2 — real cross-check: broker avg_entry_price vs internal basis.
    let brokerAvgEntryPrice: number;
    try {
      const resp = await this.client.getJson<AlpacaPositionForCAResponse>(
        `/v2/positions/${encodeURIComponent(symbol)}`,
      );
      brokerAvgEntryPrice = parseFloat(resp.avg_entry_price); // allow-bare-parsefloat: DW-058-B1
    } catch (e) {
      if (e instanceof AlpacaApiError && e.status === 404) {
        // Typed absence — recent action exists internally but the broker has
        // no open position for the symbol. Do NOT fabricate a value.
        throw new BrokerPositionMissingForCAReconciliation(symbol);
      }
      throw e;
    }

    const internalBasis = await this.readInternalBasisPerShare(symbol);
    if (internalBasis === null) {
      // No open lots for (operator, symbol) yet the broker holds a position
      // for it — same structural inconsistency class; refuse to fabricate.
      throw new BrokerPositionMissingForCAReconciliation(symbol);
    }

    const broker_basis_adjusted =
      Math.abs(brokerAvgEntryPrice - internalBasis) < BASIS_TOLERANCE_USD;

    return {
      symbol: internal.symbol,
      recent_action_within_lookback: true,
      action_type: internal.action_type,
      action_ts: internal.action_ts,
      hours_since_action: internal.hours_since_action,
      broker_basis_adjusted,
      fetched_at: ts,
    };
  }

  /** Internal basis per share = SUM(cost_basis * qty) / SUM(qty) over open
   *  lots for (operator_id, symbol). `cost_basis` is per-share (verified
   *  against `lot-ledger-writer.ts`), so a qty-weighted mean recovers the
   *  broker's `avg_entry_price` semantic. Returns `null` when there are no
   *  open lots — caller surfaces as typed absence. */
  private async readInternalBasisPerShare(symbol: string): Promise<number | null> {
    const { data, error } = await this.lotsClient
      .from('longshort_lots')
      .select('qty, cost_basis, status')
      .eq('operator_id', this.operatorId)
      .eq('symbol', symbol);
    if (error) {
      throw new Error(`internal_lot_basis_read_failed: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{
      qty: number | string;
      cost_basis: number | string;
      status: string;
    }>;
    let qtySum = 0;
    let weightedSum = 0;
    for (const r of rows) {
      if (r.status !== 'open' && r.status !== 'partial') continue;
      const q = typeof r.qty === 'string' ? Number(r.qty) : r.qty;
      const cb = typeof r.cost_basis === 'string' ? Number(r.cost_basis) : r.cost_basis;
      if (!Number.isFinite(q) || !Number.isFinite(cb) || q <= 0) continue;
      qtySum += q;
      weightedSum += cb * q;
    }
    if (qtySum <= 0) return null;
    return weightedSum / qtySum;
  }
}