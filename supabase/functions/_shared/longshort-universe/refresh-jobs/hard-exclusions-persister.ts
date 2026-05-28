/**
 * hard-exclusions persister — FP-008 sub-step 8.7 / ACT-113.
 *
 * Per Surface 4 Option b + c (operator-locked): orchestrator-internal
 * persistence (Option b — consumed by BOTH quarterly + continuous-refresh
 * orchestrators) with UPSERT-with-array-union for multi-rule firings
 * (Option c — when 3.3a + 3.3d fire on same (ticker, as_of_date), produces
 * one row with firing_rules=['3.3a','3.3d'] not two rows per MIG-051 PK).
 *
 * refresh_id semantics per MIG-051 design:
 *  - Quarterly-refresh firings: refresh_id populated (FK to
 *    universe_refresh_log).
 *  - Continuous-refresh firings (3.3a daily / 3.3b event-triggered /
 *    3.3e twice-monthly): refresh_id = NULL (ON DELETE SET NULL preserves
 *    rows if refresh_log row removed).
 *
 * Array-union note: native Postgres array-union ON CONFLICT requires raw
 * SQL / RPC; supabase-js .upsert() performs a full UPDATE on conflict.
 * Sub-step 8.7 implementation: the CALLER (orchestrator) groups per-rule
 * firings into firing_rules arrays per ticker BEFORE invoking persist();
 * cross-refresh merging (e.g., a continuous 3.3a refresh appending to an
 * existing quarterly row) is an emergent property of orchestrator-layer
 * read-merge-write discipline (queued as a future hardening cycle).
 *
 * Owner: longshort (FP-008 sub-step 8.7)
 * Classification: financial-critical.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HardExclusionsPersisterInput } from '../verify-membership/types.ts';

export interface HardExclusionsPersister {
  persist(input: HardExclusionsPersisterInput): Promise<void>;
}

export function makeHardExclusionsPersister(
  supabaseAdmin: SupabaseClient,
): HardExclusionsPersister {
  return {
    async persist(input: HardExclusionsPersisterInput): Promise<void> {
      if (input.rows.length === 0) {
        return;
      }

      const rowsToUpsert = input.rows.map((r) => ({
        operator_id: input.operator_id,
        ticker: r.ticker,
        as_of_date: input.as_of_date,
        firing_rules: dedupePreserveOrder([...r.firing_rules]),
        firing_reasons: r.firing_reasons,
        refresh_id: input.refresh_id,
      }));

      const { error } = await supabaseAdmin
        .from('hard_exclusions')
        .upsert(rowsToUpsert, {
          onConflict: 'operator_id,ticker,as_of_date',
          ignoreDuplicates: false,
        });

      if (error !== null) {
        throw new Error(
          `hard-exclusions-persister: UPSERT failed for operator ${input.operator_id} @ ${input.as_of_date} (${rowsToUpsert.length} rows): ${error.message}`,
        );
      }
    },
  };
}

function dedupePreserveOrder(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}