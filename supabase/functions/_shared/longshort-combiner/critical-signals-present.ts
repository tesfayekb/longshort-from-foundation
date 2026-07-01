/**
 * critical-signals-present — shared DW-203 / DW-206 Fix B presence guard.
 *
 * Single source of truth for the "did the daily-cadence critical
 * producers emit for `as_of_date` yet?" check. Extracted from the
 * inline copy in `longshort-combiner-tick/index.ts` (Gate 3, DW-203 /
 * ACT-407) so the shadow-rank path can share the EXACT same logic
 * (DW-206 Fix B / ACT-434) — preventing the tick↔shadow drift that
 * caused the 06-30 gap where the gated arm wrote zero-includable seeds
 * on critical-absent fires and corrupted the DW-109 gate-ablation
 * baseline.
 *
 * Contract:
 *   - Returns TRUE iff EVERY id in `SIGNAL_IDS_CRITICAL` has ≥1
 *     `signal_observations` row for (operator_id, as_of_date).
 *   - STRICT equality on `as_of_date` (T8 replay-determinism —
 *     feature-assembler-orchestrator.ts:16-18); a T-1 row does NOT
 *     satisfy today.
 *   - Pure / injected-supabase; no wall-clock read.
 *   - Throws on read error (callers wrap and emit `.failed`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { SIGNAL_IDS_CRITICAL } from './signal-catalog.ts';

export async function criticalSignalsPresentForDate(
  supabase: SupabaseClient,
  operator_id: string,
  as_of_date: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('signal_observations')
    .select('signal_id')
    .eq('operator_id', operator_id)
    .eq('as_of_date', as_of_date)
    .in('signal_id', SIGNAL_IDS_CRITICAL as unknown as string[]);
  if (error) {
    throw new Error(`criticalSignalsPresentForDate failed: ${error.message}`);
  }
  const present = new Set<string>(
    (data ?? []).map((r) => (r as { signal_id: string }).signal_id),
  );
  for (const id of SIGNAL_IDS_CRITICAL) {
    if (!present.has(id)) return false;
  }
  return true;
}