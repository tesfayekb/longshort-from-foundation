/**
 * rankings-generation-picker — DW-209 Fix B shared helper (single source of
 * truth for "which combiner_rankings generation is current").
 *
 * Prior to DW-209 the orchestrator reader and the snapshot writer each did
 * their own head-pick (order as_of_date DESC, computed_at DESC, LIMIT 1)
 * and their own body-read filtered ONLY by `as_of_date`. With intraday
 * multi-slot writes (see `combiner_rankings.intraday_slot`) the body-read
 * pulled ALL slots for the day → duplicate tickers across vintages →
 * planner book_size inflation → breadth collapse + nondeterministic
 * per-name notional. See DW-209 for the full mechanism.
 *
 * Fix: identify the current generation as the 3-tuple
 * `(as_of_date, intraday_slot, computed_at)` and require every consumer
 * to scope its body-read to that exact generation. Both the orchestrator
 * reader (`createSupabaseRankingsReader`) and the sidecar snapshot
 * writer (`snapshotRebalanceRankings`) now share this helper so drift
 * is impossible by construction.
 *
 * Empty-case semantics preserved: returns `null` iff no rows exist for
 * the operator — same as the prior head-pick's "no data" branch.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RankingsGeneration {
  as_of_date: string;
  /** MIG-122 keystone: smallint. Present on every post-migration row. */
  intraday_slot: number;
  /** Nullable per schema (rows pre-computed_at retro-fill). Freshness
   *  gates in the orchestrator handle the null case explicitly. */
  computed_at: string | null;
}

export async function pickLatestRankingsGeneration(
  supabase: SupabaseClient,
  operator_id: string,
): Promise<RankingsGeneration | null> {
  const { data, error } = await supabase
    .from('combiner_rankings')
    .select('as_of_date, intraday_slot, computed_at')
    .eq('operator_id', operator_id)
    .order('as_of_date', { ascending: false })
    .order('computed_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(
      `pickLatestRankingsGeneration head read failed: ${error.message}`,
    );
  }
  const rows = (data ?? []) as RankingsGeneration[];
  if (rows.length === 0) return null;
  return rows[0];
}