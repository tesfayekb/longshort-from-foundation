/**
 * Live UniverseMembershipFetcher — FP-008 sub-step 8.7 / ACT-113.
 *
 * Per Surface 1 Option A (operator-locked at pre-flight): the
 * verify_universe_membership #10 "stub-to-real" transition described in
 * DEC-038.1 clause (3) lands at the FETCHER implementation level (not the
 * verifier body, which is already complete per FP-006 Gate 6.3 closure).
 * The verifier signature + body remain unchanged per AC-16.
 *
 * Per Surface 2 Option γ (operator-locked): this fetcher is the PER-SYMBOL
 * tier; queries universe_membership + hard_exclusions tables directly per
 * `UniverseMembershipFetcher` contract at _shared/longshort-broker-
 * interfaces.ts. The BULK tier lives in universe-service.ts
 * (`getEligibleUniverse(as_of)` chokepoint).
 *
 * REPLACES MOCK_UNIVERSE_FETCHER in supabase/functions/
 * longshort-reconciliation-tick/index.ts.
 *
 * DEC-038.1 clause (3) spec-vs-repo terminology drift logged as DW-066.
 *
 * Owner: longshort (FP-008 sub-step 8.7)
 * Classification: financial-critical.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  UniverseMembershipFetcher,
  UniverseMembershipStatus,
} from '../../../../../../supabase/functions/_shared/longshort-broker-interfaces.ts';
import type { UniverseEligibilityRow, HardExclusionRow } from './types.ts';

/**
 * Materially-excluded reason codes per §11.0.9 line 273. Re-exported for
 * verifier callers that wish to align escalation logic against the same
 * structured-reason vocabulary.
 */
const MATERIALLY_EXCLUDED_REASONS: ReadonlySet<string> = new Set([
  'in_ma',
  'halted_5d_plus',
]);

export interface UniverseMembershipFetcherDeps {
  readonly supabaseAdmin: SupabaseClient;
  readonly operator_id: string;
}

/**
 * Constructs a live UniverseMembershipFetcher backed by supabaseAdmin reads
 * of universe_membership + hard_exclusions. Per §11.0.7 #10 + §11.0.6
 * stale-ranking detection contract.
 */
export function createUniverseMembershipFetcher(
  deps: UniverseMembershipFetcherDeps,
): UniverseMembershipFetcher {
  return {
    async fetchUniverseMembership(
      symbol: string,
      ts: Date,
    ): Promise<UniverseMembershipStatus> {
      const as_of_date = isoDateOf(ts);

      const [membershipResult, exclusionResult] = await Promise.all([
        deps.supabaseAdmin
          .from('universe_membership')
          .select('long_eligible,short_eligible')
          .eq('operator_id', deps.operator_id)
          .eq('ticker', symbol)
          .eq('as_of_date', as_of_date)
          .maybeSingle(),
        deps.supabaseAdmin
          .from('hard_exclusions')
          .select('firing_rules')
          .eq('operator_id', deps.operator_id)
          .eq('ticker', symbol)
          .eq('as_of_date', as_of_date)
          .maybeSingle(),
      ]);

      if (membershipResult.error) {
        throw new Error(
          `verify_universe_membership fetcher: universe_membership query failed for ${symbol} @ ${as_of_date}: ${membershipResult.error.message}`,
        );
      }
      if (exclusionResult.error) {
        throw new Error(
          `verify_universe_membership fetcher: hard_exclusions query failed for ${symbol} @ ${as_of_date}: ${exclusionResult.error.message}`,
        );
      }

      const membership = membershipResult.data as
        | Pick<UniverseEligibilityRow, 'long_eligible' | 'short_eligible'>
        | null;
      const exclusion = exclusionResult.data as
        | Pick<HardExclusionRow, 'firing_rules'>
        | null;

      // Surface 3 Option i: null-with-narrowing typed-absence. No row →
      // not-in-universe. UniverseMembershipStatus contract requires
      // structured booleans + reason codes.
      const in_universe = membership !== null;
      const exclusion_reasons = exclusion !== null
        ? [...exclusion.firing_rules]
        : [];
      const excluded = exclusion_reasons.length > 0;

      return {
        symbol,
        in_universe,
        excluded,
        exclusion_reasons,
        fetched_at: ts,
      };
    },
  };
}

/**
 * ISO date helper — Postgres date column expects 'YYYY-MM-DD'. Pure formatter
 * over the injected `ts` parameter; NOT a wall-clock read per §11.9.
 */
function isoDateOf(ts: Date): string {
  const y = ts.getUTCFullYear();
  const m = String(ts.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ts.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export { MATERIALLY_EXCLUDED_REASONS };