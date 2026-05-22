/**
 * verify_lot_record — Reconciliation verifier #15 per CROSSWIND §11.0.7.
 *
 * Owner: longshort (sub-step 6.3d)
 * **Tier: strong_plus** (tax-regulatory; retention indefinite per §11.0.10 line 334)
 * Tolerance class: zero_tolerance (single firing escalates per §11.0.9 line 234)
 *
 * Per §11.0.7 verbatim: `verify_lot_record(lot_id, expected_fields)` — exact-match check
 * on persisted fields {lot_id, symbol, entry_ts, qty, cost_basis, side, status, locate_id}.
 * Called after every lot write/update per §7.5/§7.6/§7.9.
 *
 * NOTE: lot ledger table is Phase 1+ work; verifier ships its contract complete with mock
 * fetcher path. Real DB integration awaits the lot ledger schema.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerLotRecord,
  BrokerLotRecordFetcher,
} from '../longshort-broker-interfaces.ts';

export const VERIFY_LOT_RECORD_TOLERANCE = {
  exact_match_required: true,
};

export interface InternalLotRecord {
  lot_id: string;
  symbol: string;
  entry_ts: Date;
  qty: number;
  cost_basis: number;
  side: 'long' | 'short';
  status: string;
  locate_id: string | null;
}

interface LotRecordDivergence extends Record<string, unknown> {
  fields_compared: number;
  fields_diverged: string[];
  diff_details: Record<string, { expected: unknown; observed: unknown }>;
}

const COMPARED_FIELDS: ReadonlyArray<keyof InternalLotRecord> = [
  'lot_id', 'symbol', 'entry_ts', 'qty', 'cost_basis', 'side', 'status', 'locate_id',
];

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

export function buildVerifyLotRecordSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<InternalLotRecord, BrokerLotRecord> {
  return {
    call_name: 'verify_lot_record',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong_plus',
    tolerance_class: 'zero_tolerance',
    tolerance: { ...VERIFY_LOT_RECORD_TOLERANCE },

    compute_divergence: (expected, observed): LotRecordDivergence => {
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
      const d = divergence as LotRecordDivergence;
      if (d.fields_diverged.length === 0) return 'false_positive_within_tolerance';
      return 'failure_escalated';
    },

    failure_action: async (ctx) => {
      return {
        action_taken: 'lot_record_divergence_tax_regulatory_alert_emitted',
        action_metadata: { symbol: args.symbol, divergence: ctx.divergence },
      };
    },
  };
}

export async function verifyLotRecord(
  args: {
    operator_id: string;
    expected: InternalLotRecord;
  },
  fetcher: BrokerLotRecordFetcher,
  ts: Date,
): Promise<ReconcileResult> {
  const spec = buildVerifyLotRecordSpec({
    symbol: args.expected.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const observed = await fetcher.fetchLotRecord(args.expected.lot_id, callTs);
      return { expected: args.expected, observed };
    },
    ts,
  );
}
