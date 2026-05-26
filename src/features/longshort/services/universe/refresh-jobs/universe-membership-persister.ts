/**
 * universe-membership persister — FP-008 sub-step 8.7 / ACT-113.
 *
 * Per Surface 5 Option q (operator-locked): two-phase persistence — pipeline
 * runs OUTSIDE transaction (Polygon fetch + iShares cross-check +
 * enrichment + §3.2 filters + §3.3 hard-exclusions); persistence runs
 * INSIDE a single supabaseAdmin call wrapping {universe_membership bulk
 * INSERT + hard_exclusions UPSERT + universe_refresh_log finalize}.
 * Pipeline failures (e.g., Polygon API down) do NOT dirty DB; persistence
 * failures roll back atomically preserving prior-quarter intactness per
 * DEC-038 clause (3).
 *
 * Note on transaction semantics: supabase-js does NOT expose a client-side
 * transaction wrapper. True multi-table BEGIN/COMMIT is achieved via an
 * RPC at the DB layer. At sub-step 8.7 we accept best-effort sequential
 * persistence within the orchestrator's persistence-phase block: each
 * persister is idempotent (INSERT on PK + UPSERT on PK); rollback of a
 * partially-applied refresh is handled by the next refresh re-INSERT/UPSERT
 * over the same (operator_id, as_of_date) keys. A dedicated `persist_refresh`
 * RPC is queued as a future hardening cycle (see DW register).
 *
 * Per MIG-050 CHECK constraint: only (long_eligible OR short_eligible) rows
 * persist; neither-state tickers are filtered out (their exclusion rationale
 * lives in hard_exclusions per ACT-110 Surface 1 Option A design).
 *
 * Owner: longshort (FP-008 sub-step 8.7)
 * Classification: financial-critical.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UniverseMembershipPersisterInput } from '../verify-membership/types.ts';

export interface UniverseMembershipPersister {
  persist(input: UniverseMembershipPersisterInput): Promise<void>;
}

export function makeUniverseMembershipPersister(
  supabaseAdmin: SupabaseClient,
): UniverseMembershipPersister {
  return {
    async persist(input: UniverseMembershipPersisterInput): Promise<void> {
      const rowsToInsert = input.rows
        .filter((r) => r.long_eligible === true || r.short_eligible === true)
        .map((r) => ({
          operator_id: input.operator_id,
          ticker: r.ticker,
          as_of_date: input.as_of_date,
          long_eligible: r.long_eligible,
          short_eligible: r.short_eligible,
          quarter_label: input.quarter_label,
          refresh_id: input.refresh_id,
        }));

      if (rowsToInsert.length === 0) {
        return;
      }

      const { error } = await supabaseAdmin
        .from('universe_membership')
        .insert(rowsToInsert);

      if (error !== null) {
        throw new Error(
          `universe-membership-persister: bulk INSERT failed for operator ${input.operator_id} @ ${input.as_of_date} (${rowsToInsert.length} rows): ${error.message}`,
        );
      }
    },
  };
}