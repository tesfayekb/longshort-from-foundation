/**
 * longshort-verifiers — Registry for verify_* batch A (#1-#5).
 *
 * Future batches (6.3b/c/d) extend this registry with their verify_*'s.
 */

import type { VerifyCallName } from '../longshort-reconciliation-types.ts';

export { buildVerifyPositionSpec, verifyPosition } from './verify_position.ts';
export { buildVerifyQuoteSpec, verifyQuote } from './verify_quote.ts';
export { buildVerifyQuoteFreshnessSpec, verifyQuoteFreshness } from './verify_quote_freshness.ts';
export { buildVerifyShortAvailabilitySpec, verifyShortAvailability } from './verify_short_availability.ts';
export { buildVerifySSRStatusSpec, verifySSRStatus } from './verify_ssr_status.ts';

/** Implemented verify_*'s as of sub-step 6.3a closure. */
export const IMPLEMENTED_VERIFIERS: readonly VerifyCallName[] = [
  'verify_position',
  'verify_quote',
  'verify_quote_freshness',
  'verify_short_availability',
  'verify_ssr_status',
] as const;

export function isVerifierImplemented(name: VerifyCallName): boolean {
  return (IMPLEMENTED_VERIFIERS as readonly string[]).includes(name);
}