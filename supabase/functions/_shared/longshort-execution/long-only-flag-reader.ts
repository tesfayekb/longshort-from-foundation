/**
 * long-only-flag-reader — Operator-imposed long-only source for the LONG-SHORT book.
 *
 * ACT-559 / DW-213. Consumed by `rebalance-submit-orchestrator.ts` at the
 * candidate-construction seam (line 407-409) to suppress SHORT-OPEN intents
 * only. Short-COVER intents (planner-generated close deltas against existing
 * currentPositions) are UNAFFECTED — see DW-213 for the seam analysis.
 *
 * The reader is injectable so tests can flip the flag without touching the
 * DB. Production wiring reads the `feature_flags` row keyed by
 * (operator_id, 'longshort.book.long_only').
 *
 * Injected clock only; this file reads no wall-clock (DEC-034 clause 4).
 */

import { supabaseAdmin } from '../supabase-admin.ts';

export interface LongOnlyFlagState {
  /** true when the operator has enabled the long-only flag for this operator_id. */
  enabled: boolean;
  /** Verbatim `reason` column, if present — surfaces in audit metadata. */
  reason: string | null;
}

export interface LongOnlyFlagReader {
  read(operator_id: string): Promise<LongOnlyFlagState>;
}

const FLAG_KEY = 'longshort.book.long_only';

/**
 * Supabase-backed reader. Absent row / disabled row → { enabled: false }.
 * Read failures fail SAFE (enabled=false) — never fabricate long-only when
 * the read errored, so a transient DB blip cannot silently disarm the flag.
 * Fail-safe direction (disabled on error) is documented in DW-213 as the
 * chosen posture: an operator-imposed suppression that cannot be read is a
 * MISSING suppression, not a fabricated one; the paired MISSING short book
 * (F11 universe short_eligible=false) already protects the money path
 * during the truthful-universe interregnum.
 */
export function createSupabaseLongOnlyFlagReader(): LongOnlyFlagReader {
  return {
    async read(operator_id: string): Promise<LongOnlyFlagState> {
      try {
        const { data, error } = await supabaseAdmin
          .from('feature_flags')
          .select('enabled, reason')
          .eq('operator_id', operator_id)
          .eq('flag_key', FLAG_KEY)
          .maybeSingle();
        if (error) {
          console.error('longshort.long_only_flag.read_failed', error.message);
          return { enabled: false, reason: null };
        }
        if (!data) return { enabled: false, reason: null };
        return {
          enabled: data.enabled === true,
          reason: typeof data.reason === 'string' ? data.reason : null,
        };
      } catch (e) {
        console.error(
          'longshort.long_only_flag.read_threw',
          e instanceof Error ? e.message : String(e),
        );
        return { enabled: false, reason: null };
      }
    },
  };
}