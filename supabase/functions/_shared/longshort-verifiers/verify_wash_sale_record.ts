/**
 * verify_wash_sale_record — Reconciliation verifier #16 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3d)
 * **Tier: strong_plus** (tax-regulatory; year-end 1099-B / Form 8949 reconciliation per §11.0.10)
 * Tolerance class: zero_tolerance (single firing escalates per §11.0.9 line 234)
 *
 * Per §11.0.7 verbatim: exact-match check on persisted fields {symbol, exit_ts,
 * realized_loss, lot_ids_affected, status, block_until OR attached_to_lot_id}.
 * Called after every wash_sale_events write per §7.7 Path A and §7.9 trim-loss path.
 *
 * NOTE: wash_sale_events table is Phase 1+ work; verifier ships its contract complete.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerWashSaleRecord,
  BrokerWashSaleRecordFetcher,
} from '../longshort-broker-interfaces.ts';

export const VERIFY_WASH_SALE_RECORD_TOLERANCE = {
  exact_match_required: true,
};

export interface InternalWashSaleRecord {
  event_id: string;
  symbol: string;
  exit_ts: Date;
  realized_loss: number;
  lot_ids_affected: string[];
  status: string;
  block_until: Date | null;
  attached_to_lot_id: string | null;
}

interface WashSaleDivergence extends Record<string, unknown> {
  fields_compared: number;
  fields_diverged: string[];
  diff_details: Record<string, { expected: unknown; observed: unknown }>;
}

const COMPARED_FIELDS: ReadonlyArray<keyof InternalWashSaleRecord> = [
  'symbol', 'exit_ts', 'realized_loss', 'lot_ids_affected', 'status',
  'block_until', 'attached_to_lot_id',
];

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  return a === b;
}

export function buildVerifyWashSaleRecordSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalWashSaleRecord, BrokerWashSaleRecord> {
  return {
    call_name: 'verify_wash_sale_record',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong_plus',
    tolerance_class: 'zero_tolerance',
    tolerance: { ...VERIFY_WASH_SALE_RECORD_TOLERANCE },

    compute_divergence: (expected, observed): WashSaleDivergence => {
      const diverged: string[] = [];
      const details: Record<string, { expected: unknown; observed: unknown }> = {};
      for (const f of COMPARED_FIELDS) {
        const e = (expected as unknown as Record<string, unknown>)[f];
        const o = (observed as unknown as Record<string, unknown>)[f];
        if (!valuesEqual(e, o)) {
          diverged.push(f);
          details[f] = { expected: e, observed: o };
        }
      }
      return {
        fields_compared: COMPARED_FIELDS.length,
        fields_diverged: diverged,
        diff_details: details,
      };
    },

    classify_outcome: (divergence): ReconciliationOutcome => {
      const d = divergence as WashSaleDivergence;
      if (d.fields_diverged.length === 0) return 'false_positive_within_tolerance';
      return 'failure_escalated';
    },

    failure_action: async (ctx) => {
      return {
        action_taken: 'wash_sale_record_divergence_tax_regulatory_alert_emitted',
        action_metadata: { symbol: args.symbol, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifyWashSaleRecord(
  args: {
    operator_id: string;
    expected: InternalWashSaleRecord;
  },
  fetcher: BrokerWashSaleRecordFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyWashSaleRecordSpec({
    symbol: args.expected.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchWashSaleRecord(args.expected.event_id, callTs);
      return { expected: args.expected, observed };
    },
    ts,
  );
}
