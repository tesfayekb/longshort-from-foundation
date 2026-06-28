/**
 * Missingness capture — writes a row to `signal_observations`
 * per (operator_id, signal_id, as_of_date, ticker). Idempotent UPSERT on
 * the composite PK; re-runs for the same key tuple overwrite the prior
 * observation (last-writer-wins, same convention as MIG-052
 * universe_membership idempotency from FP-008.4 #5).
 *
 * Called by signal orchestrators at end-of-tick (Bucket C wiring). The
 * Phase 3 combiner training pipeline consumes the resulting table via
 * offline aggregation (`scripts/generate-missingness-profile.ts`,
 * future scope per §6.5.3).
 *
 * Contract:
 *   - Empty `rows` → returns `{ inserted: 0, error: null }` and makes no
 *     network call (cheap fast-path; the orchestrator may legitimately
 *     have zero observations to capture if every ticker errored).
 *   - Any PostgREST error → returns `{ inserted: 0, error }` (does NOT
 *     throw — orchestrators decide whether a capture failure is
 *     pipeline-fatal or telemetry-only).
 *   - The `value` / `is_present` consistency check is enforced at the
 *     database (MIG-064 `signal_observations_value_is_present_check`);
 *     the `SignalRow` type provides the matching contract at the type
 *     layer so any inconsistency is a compile-time or DB-rejection
 *     failure rather than silently-bad data.
 *
 * Owner: longshort (FP-009 Bucket A Commit A3)
 * Classification: shared infrastructure — Phase 2 missingness capture.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalRow } from './signal-types.ts';

export interface MissingnessCaptureResult {
  inserted: number;
  error: Error | null;
}

export async function captureSignalObservations(
  supabase: SupabaseClient,
  rows: ReadonlyArray<SignalRow>,
): Promise<MissingnessCaptureResult> {
  if (rows.length === 0) return { inserted: 0, error: null };

  const payload = rows.map((r) => ({
    operator_id: r.operator_id,
    signal_id: r.signal_id,
    as_of_date: r.as_of_date,
    ticker: r.ticker,
    value: r.value,
    is_present: r.is_present,
    gics_sector: r.gics_sector,
    computed_at: r.computed_at,
    // DW-106-c (FP-053): optional carry-forward audit flag. Default-false
    // semantics — every existing signal orchestrator leaves
    // `r.carried_forward` undefined, which coerces to `false` and matches
    // the MIG-101 column DEFAULT (byte-equivalent vs pre-DW-106-c). Only
    // the short-interest CARRY orchestrator sets `true` on `emit_carry`.
    carried_forward: r.carried_forward ?? false,
    // DEC-071 sub-step 3a — optional typed-absence discriminator. Default-
    // null semantics: every pre-DEC-071 orchestrator leaves `r.skip_reason`
    // undefined, which coerces to `null` and matches the migration's
    // nullable column (no DEFAULT) — byte-equivalent vs pre-DEC-071 for
    // every existing writer. Only the reversal orchestrator (sub-step 3b)
    // sets this on gated emits.
    skip_reason: r.skip_reason ?? null,
  }));

  const { error, count } = await supabase
    .from('signal_observations')
    .upsert(payload, {
      onConflict: 'operator_id,signal_id,as_of_date,ticker',
      count: 'exact',
    });

  if (error) {
    return {
      inserted: 0,
      error: new Error(`signal_observations upsert failed: ${error.message}`),
    };
  }
  return { inserted: count ?? rows.length, error: null };
}