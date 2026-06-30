/**
 * rebalance-ranking-snapshot-writer — FP-062 ranking-snapshot sidecar (MIG-149).
 *
 * INVARIANT (absolute separation): this writer does NOT share rows with
 * `runRebalanceSubmit`, does NOT thread through the orchestrator, does NOT
 * touch the reader/planner/submitter/sink. It performs an INDEPENDENT
 * read of `combiner_rankings` (mirroring the orchestrator reader query
 * verbatim) and persists rank/score state per (long, short) side to
 * `longshort_rebalance_ranking_snapshot`.
 *
 * Race posture (operator-authorized): under normal cadence the independent
 * read pins the same generation the submit consumed. When a
 * `submit_reference_computed_at` is provided AND differs from this read's
 * `computed_at`, the snapshot rows are tagged `generation_skew=true`.
 * When the submit's generation is not obtainable (no signature change to
 * the orchestrator), both `submit_reference_computed_at` and
 * `generation_skew` are recorded HONESTLY as null/false respectively with
 * `submit_reference_computed_at = null` meaning "skew unknowable, not
 * skew-clean" — never assumed-clean.
 *
 * Fire-and-forget: callers MUST wrap in try/catch so failure cannot
 * propagate to the submit response.
 */

// deno-lint-ignore no-explicit-any
type AnySupabase = any;

interface RankingsHeadRow {
  as_of_date: string;
  computed_at: string | null;
}

interface RankingsBodyRow {
  ticker: string;
  long_rank: number | null;
  short_rank: number | null;
  long_score: number | null;
  short_score: number | null;
  gics_sector: string | null;
  ranker_source: string;
  computed_at: string | null;
}

export interface SnapshotResult {
  snapshotted: number;
  generation_skew: boolean;
  snapshot_computed_at: string | null;
  submit_reference_computed_at: string | null;
}

/**
 * Mirror of `SUBSTITUTION_SCAN_CAP_RANK` consumed by
 * `createSupabaseRankingsReader`. Kept local to preserve the invariant
 * that this file imports nothing from the planner/submitter/sink. If the
 * orchestrator's cap diverges, the snapshot's row set will diverge in
 * the same direction (both reads are filtered identically) — which is
 * the correctness property we need.
 */
const SNAPSHOT_SCAN_CAP_RANK = 1000;

export async function snapshotRebalanceRankings(
  supabase: AnySupabase,
  operator_id: string,
  opts?: { submit_reference_computed_at?: string | null },
): Promise<SnapshotResult> {
  // Step 1 — head read (mirrors orchestrator reader at lines 195-201).
  const headResp = await supabase
    .from('combiner_rankings')
    .select('as_of_date, computed_at')
    .eq('operator_id', operator_id)
    .order('as_of_date', { ascending: false })
    .order('computed_at', { ascending: false })
    .limit(1);

  if (headResp.error) {
    throw new Error(
      `snapshotRebalanceRankings head read failed: ${headResp.error.message}`,
    );
  }
  const latest = (headResp.data ?? []) as RankingsHeadRow[];
  if (latest.length === 0) {
    return {
      snapshotted: 0,
      generation_skew: false,
      snapshot_computed_at: null,
      submit_reference_computed_at: opts?.submit_reference_computed_at ?? null,
    };
  }
  const head = latest[0];
  const snapshot_computed_at = head.computed_at;
  if (snapshot_computed_at == null) {
    // The orchestrator tolerates a null head computed_at by treating the
    // generation as legacy; the snapshot mirrors that and records nothing
    // (PK requires snapshot_computed_at NOT NULL).
    return {
      snapshotted: 0,
      generation_skew: false,
      snapshot_computed_at: null,
      submit_reference_computed_at: opts?.submit_reference_computed_at ?? null,
    };
  }

  // Step 2 — body read (mirrors orchestrator reader at lines 208-214).
  const bodyResp = await supabase
    .from('combiner_rankings')
    .select(
      'ticker, long_rank, short_rank, long_score, short_score, gics_sector, ranker_source, computed_at',
    )
    .eq('operator_id', operator_id)
    .eq('as_of_date', head.as_of_date)
    .or(
      `long_rank.lte.${SNAPSHOT_SCAN_CAP_RANK},short_rank.lte.${SNAPSHOT_SCAN_CAP_RANK}`,
    );

  if (bodyResp.error) {
    throw new Error(
      `snapshotRebalanceRankings body read failed: ${bodyResp.error.message}`,
    );
  }
  const rows = (bodyResp.data ?? []) as RankingsBodyRow[];

  // Step 3 — derive skew. Null submit ref => skew-unknowable, recorded
  // as generation_skew=false + submit_reference_computed_at=null. This
  // is the "honest-null" posture: not assumed-clean, not assumed-skewed.
  const submitRef = opts?.submit_reference_computed_at ?? null;
  const generation_skew =
    submitRef !== null && submitRef !== snapshot_computed_at;

  // Step 4 — expand each ranking into long+short rows (skip side when no
  // rank present on that side; the orchestrator's planner uses the same
  // null-rank semantics).
  const inserts: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    if (r.long_rank != null && r.long_score != null) {
      inserts.push({
        operator_id,
        as_of_date: head.as_of_date,
        snapshot_computed_at,
        side: 'long',
        ticker: r.ticker,
        rank_within_side: r.long_rank,
        score: r.long_score,
        ranker_source: r.ranker_source,
        gics_sector: r.gics_sector,
        generation_skew,
        submit_reference_computed_at: submitRef,
      });
    }
    if (r.short_rank != null && r.short_score != null) {
      inserts.push({
        operator_id,
        as_of_date: head.as_of_date,
        snapshot_computed_at,
        side: 'short',
        ticker: r.ticker,
        rank_within_side: r.short_rank,
        score: r.short_score,
        ranker_source: r.ranker_source,
        gics_sector: r.gics_sector,
        generation_skew,
        submit_reference_computed_at: submitRef,
      });
    }
  }

  if (inserts.length === 0) {
    return {
      snapshotted: 0,
      generation_skew,
      snapshot_computed_at,
      submit_reference_computed_at: submitRef,
    };
  }

  // Bulk INSERT — ON CONFLICT DO NOTHING via PostgREST's upsert with
  // ignoreDuplicates so re-fires within the same (op, as_of, computed_at,
  // side, ticker) are idempotent.
  const insertResp = await supabase
    .from('longshort_rebalance_ranking_snapshot')
    .upsert(inserts, {
      onConflict: 'operator_id,as_of_date,snapshot_computed_at,side,ticker',
      ignoreDuplicates: true,
    });
  if (insertResp.error) {
    throw new Error(
      `snapshotRebalanceRankings insert failed: ${insertResp.error.message}`,
    );
  }

  return {
    snapshotted: inserts.length,
    generation_skew,
    snapshot_computed_at,
    submit_reference_computed_at: submitRef,
  };
}