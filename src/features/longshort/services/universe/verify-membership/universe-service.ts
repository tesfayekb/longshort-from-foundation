/**
 * universeService — chokepoint for universe-component consumption per
 * DEC-038.1 clause (5).
 *
 * Per Surface 2 Option γ (operator-locked): BULK tier (vs per-symbol fetcher
 * tier at universe-membership-fetcher.ts). Consumers call
 * `getEligibleUniverse(as_of)` to obtain the current eligible universe;
 * per-symbol consumers (verify_universe_membership) use the fetcher.
 *
 * Per Surface 3 Option i (operator-locked): typed-absence via
 * `null`-with-narrowing per §2 axiom 3. `Optional.none()` from DEC-038.1
 * clause (5) is spec-side drift logged as DW-067; clause is operationally
 * interpretable via null return.
 *
 * Consumer pattern:
 *   const universe = await universeService.getEligibleUniverse(as_of, operator_id);
 *   if (universe === null) {
 *     // Feature flag disabled — typed-absence path.
 *     return;
 *   }
 *
 * Owner: longshort (FP-008 sub-step 8.7 / ACT-113)
 * Classification: financial-critical.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EligibleUniverse, UniverseEligibilityRow } from './types.ts';

export interface UniverseServiceDeps {
  readonly supabaseAdmin: SupabaseClient;
}

export interface UniverseService {
  /**
   * Returns the eligible universe for `as_of` date. Returns `null`
   * (typed-absence per §2 axiom 3) when `feature_flags.universe.enabled =
   * false` (or row absent) for the operator. Returns an EligibleUniverse
   * with eligible_long + eligible_short partitioned when enabled (empty
   * arrays + empty refresh_id/quarter_label when enabled-but-no-rows-yet,
   * distinct from feature-flag-disabled null return).
   */
  getEligibleUniverse(
    as_of: Date,
    operator_id: string,
  ): Promise<EligibleUniverse | null>;
}

export function createUniverseService(deps: UniverseServiceDeps): UniverseService {
  return {
    async getEligibleUniverse(
      as_of: Date,
      operator_id: string,
    ): Promise<EligibleUniverse | null> {
      // Step 1: feature-flag gate per DEC-038.1 clause (5).
      const flagResult = await deps.supabaseAdmin
        .from('feature_flags')
        .select('enabled')
        .eq('operator_id', operator_id)
        .eq('flag_key', 'universe.enabled')
        .maybeSingle();

      if (flagResult.error) {
        throw new Error(
          `universeService.getEligibleUniverse: feature_flags read failed for operator ${operator_id}: ${flagResult.error.message}`,
        );
      }

      // No row OR enabled=false → typed-absence per Surface 3 Option i.
      const flagRow = flagResult.data as { enabled: boolean } | null;
      if (flagRow === null || flagRow.enabled !== true) {
        return null;
      }

      // Step 2: query universe_membership for as_of_date.
      const as_of_date = isoDateOf(as_of);
      const membershipResult = await deps.supabaseAdmin
        .from('universe_membership')
        .select(
          'operator_id,ticker,as_of_date,long_eligible,short_eligible,quarter_label,refresh_id,created_at',
        )
        .eq('operator_id', operator_id)
        .eq('as_of_date', as_of_date);

      if (membershipResult.error) {
        throw new Error(
          `universeService.getEligibleUniverse: universe_membership query failed for operator ${operator_id} @ ${as_of_date}: ${membershipResult.error.message}`,
        );
      }

      const rows = (membershipResult.data ?? []) as UniverseEligibilityRow[];

      const eligible_long = rows.filter((r) => r.long_eligible === true);
      const eligible_short = rows.filter((r) => r.short_eligible === true);

      // refresh_id + quarter_label are denormalized in universe_membership
      // rows; take from first row if present (all rows for a given
      // as_of_date share the same values per persister design).
      const first = rows[0];
      return {
        as_of_date,
        eligible_long,
        eligible_short,
        refresh_id: first?.refresh_id ?? '',
        quarter_label: first?.quarter_label ?? '',
      };
    },
  };
}

function isoDateOf(ts: Date): string {
  const y = ts.getUTCFullYear();
  const m = String(ts.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ts.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}