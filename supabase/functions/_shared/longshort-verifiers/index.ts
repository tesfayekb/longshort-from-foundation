/**
 * longshort-verifiers — Registry for all 17 §11.0.7 verifiers.
 *
 * Batches: A (#1-#5, 6.3a), B (#6-#10, 6.3b), C (#11-#14, 6.3c), D (#15-#17, 6.3d).
 * Sub-step 6.3d closes the §11.0.7 17-verifier roster.
 */

import type { VerifyCallName } from '../longshort-reconciliation-types.ts';

export { buildVerifyPositionSpec, verifyPosition } from './verify_position.ts';
export { buildVerifyQuoteSpec, verifyQuote } from './verify_quote.ts';
export { buildVerifyQuoteFreshnessSpec, verifyQuoteFreshness } from './verify_quote_freshness.ts';
export { buildVerifyShortAvailabilitySpec, verifyShortAvailability } from './verify_short_availability.ts';
export { buildVerifySSRStatusSpec, verifySSRStatus } from './verify_ssr_status.ts';
export { buildVerifyHaltStatusSpec, verifyHaltStatus } from './verify_halt_status.ts';
export { buildVerifyBorrowRateSpec, verifyBorrowRate } from './verify_borrow_rate.ts';
export { buildVerifyBorrowPersistenceSpec, verifyBorrowPersistence } from './verify_borrow_persistence.ts';
export { buildVerifyBuyingPowerSpec, verifyBuyingPower } from './verify_buying_power.ts';
export { buildVerifyUniverseMembershipSpec, verifyUniverseMembership } from './verify_universe_membership.ts';
export { buildVerifyCorporateActionCleanSpec, verifyCorporateActionClean } from './verify_corporate_action_clean.ts';
export { buildVerifySettlementStatusSpec, verifySettlementStatus } from './verify_settlement_status.ts';
export { buildVerifyOrderAcceptanceSpec, verifyOrderAcceptance } from './verify_order_acceptance.ts';
export { buildVerifyRealizedPnLSpec, verifyRealizedPnL } from './verify_realized_pnl.ts';
export { buildVerifyLotRecordSpec, verifyLotRecord } from './verify_lot_record.ts';
export { buildVerifyWashSaleRecordSpec, verifyWashSaleRecord } from './verify_wash_sale_record.ts';
export { buildVerifyRebalanceAggregateSpec, verifyRebalanceAggregate } from './verify_rebalance_aggregate.ts';

/** Implemented verify_*'s as of sub-step 6.3d closure — full §11.0.7 17-verifier roster. */
export const IMPLEMENTED_VERIFIERS: readonly VerifyCallName[] = [
  'verify_position',
  'verify_quote',
  'verify_quote_freshness',
  'verify_short_availability',
  'verify_ssr_status',
  'verify_halt_status',
  'verify_borrow_rate',
  'verify_borrow_persistence',
  'verify_buying_power',
  'verify_universe_membership',
  'verify_corporate_action_clean',
  'verify_settlement_status',
  'verify_order_acceptance',
  'verify_realized_pnl',
  'verify_lot_record',
  'verify_wash_sale_record',
  'verify_rebalance_aggregate',
] as const;

export function isVerifierImplemented(name: VerifyCallName): boolean {
  return (IMPLEMENTED_VERIFIERS as readonly string[]).includes(name);
}