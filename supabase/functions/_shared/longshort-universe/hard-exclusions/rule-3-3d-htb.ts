/**
 * §3.3d — Hard-to-borrow / locate / borrow-rate exclusion (SHORT BOOK ONLY).
 *
 * Per CROSSWIND v0.9 §3.3 LOCKED rule: exclude a name from the SHORT book if
 *   (a) no locate is available, OR
 *   (b) annualized borrow rate exceeds HTB_BORROW_RATE_THRESHOLD_BPS
 *       (1000 bps / 10% LOCKED).
 *
 * Consumes existing FP-006 infrastructure (`BrokerLocateFetcher` +
 * `verify_borrow_rate`) via the `LocateRecord[]` bundle pre-fetched at the
 * refresh-job entry point (sub-step 8.4 / 8.5).
 *
 * `applies_to: 'short'` — long-book eligibility is unaffected.
 *
 * Typed-absence per §2 axiom 3: tickers MISSING from `locate_data` are
 * treated as "no locate" (defensive — better to skip a short than enter one
 * blind). This is NOT a silent default; it is the documented contract.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical.
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import {
  HTB_BORROW_RATE_THRESHOLD_BPS,
  type HardExclusionFiring,
  type LocateRecord,
} from './types.ts';

export function rule3_3d_HTB(
  c: EnrichedConstituent,
  locate_data: ReadonlyArray<LocateRecord>,
  _as_of: Date,
): HardExclusionFiring | null {
  const record = locate_data.find((r) => r.ticker === c.ticker) ?? null;

  // Missing record OR explicit no-locate → fire 'htb_no_locate' (short only).
  if (record === null || !record.locate_available) {
    return {
      constituent: c,
      reason: 'htb_no_locate',
      applies_to: 'short',
      evidence: record === null
        ? 'no locate record for ticker'
        : 'locate explicitly unavailable',
    };
  }

  if (record.borrow_rate_bps !== null && record.borrow_rate_bps > HTB_BORROW_RATE_THRESHOLD_BPS) {
    return {
      constituent: c,
      reason: 'htb_borrow_rate_excessive',
      applies_to: 'short',
      evidence: `borrow_rate=${record.borrow_rate_bps}bps > threshold=${HTB_BORROW_RATE_THRESHOLD_BPS}bps`,
    };
  }

  return null;
}