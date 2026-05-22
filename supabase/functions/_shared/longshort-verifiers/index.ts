/**
 * longshort-verifiers — Registry for verify_* batches A (#1-#5) + B (#6-#10).
 *
 * Extended at 6.3c with batch C (#11-#14). Future batch D (6.3d) adds #15-#17.
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

/** Implemented verify_*'s as of sub-step 6.3c closure. */
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
] as const;

export function isVerifierImplemented(name: VerifyCallName): boolean {
  return (IMPLEMENTED_VERIFIERS as readonly string[]).includes(name);
}