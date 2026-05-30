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
} from '../../longshort-broker-interfaces.ts';
import type { UniverseEligibilityRow, HardExclusionRow } from './types.ts';

/**
 * FP-008.3 — `applies_to` is persisted inside `hard_exclusions.firing_reasons`
 * keyed by §3.3 rule key (e.g., `'3.3d'`), shape
 * `{ reason, applies_to: 'long' | 'short' | 'both', evidence }` per
 * quarterly-refresh-orchestrator.groupFiringsByTicker. Filtering at SQL level
 * would require jsonb traversal per row; client-side filtering on the single
 * row read keeps the chokepoint query simple and the side-resolution
 * deterministic.
 */
interface FiringReason {
  readonly reason?: unknown;
  readonly applies_to?: unknown;
  readonly evidence?: unknown;
}

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
      side: 'long' | 'short',
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
          .select('firing_rules,firing_reasons')
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
        | Pick<HardExclusionRow, 'firing_rules' | 'firing_reasons'>
        | null;

      // Surface 3 Option i: null-with-narrowing typed-absence. No row →
      // not-in-universe.
      const in_universe = membership !== null;
      const eligible_for_side = membership !== null
        ? (side === 'long' ? membership.long_eligible : membership.short_eligible)
        : false;

      // FP-008.3 — side-filter firings. A firing's `applies_to` value lives
      // inside firing_reasons[rule_key]. Defensive defaults treat unparseable
      // / missing `applies_to` as `'both'` (most-restrictive — surfaces the
      // firing to both sides rather than silently dropping it).
      const reasonsMap: Record<string, FiringReason> =
        exclusion !== null && exclusion.firing_reasons !== null &&
          typeof exclusion.firing_reasons === 'object'
          ? (exclusion.firing_reasons as Record<string, FiringReason>)
          : {};
      const allFiringRules: ReadonlyArray<string> = exclusion !== null
        ? exclusion.firing_rules
        : [];
      const exclusion_reasons = allFiringRules.filter((rule) => {
        const meta = reasonsMap[rule];
        const appliesTo = typeof meta?.applies_to === 'string'
          ? (meta.applies_to as string)
          : 'both';
        return appliesTo === side || appliesTo === 'both';
      });
      const excluded = exclusion_reasons.length > 0;

      return {
        symbol,
        side,
        in_universe,
        eligible_for_side,
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