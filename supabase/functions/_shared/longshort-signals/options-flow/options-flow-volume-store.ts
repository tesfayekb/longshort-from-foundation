/**
 * Options-flow daily-volume store — FP-057 Sub-step 4c (MIG-133).
 *
 * Persists the per-ticker `day_options_volume` (= `total_options_volume`
 * returned by `computeOptionsFlow`, currently discarded post-compute)
 * on every value-producing per-ticker compute. The intraday subset
 * resolver reads the PRIOR trading-day's top-N from this table to seed
 * its base tier.
 *
 * DESIGN INVARIANTS:
 *
 *   - SCOPING ONLY, not alpha. `day_options_volume` MUST NEVER enter
 *     `combiner_feature_vectors.features` (which would corrupt §4.4.3
 *     signal economics). This store is consumed exclusively by the
 *     resolver and is not read by the feature-assembler.
 *
 *   - Wall-clock discipline (DEC-034 cl.4): `computed_at` is written
 *     from the caller-supplied `ts` (= adapter's injected `asOf`) —
 *     NEVER `new Date()` / `Date.now()` in this file. Mirrors the
 *     `days-to-cover-store` ts-threading.
 *
 *   - Last-writer-wins by (ticker, as_of_date) PK. Daily + intraday
 *     runs may both upsert against the same row (intraday writes
 *     mid-session aggregates; daily overwrites at session close); the
 *     resolver reads PRIOR trading-day so today's writes never affect
 *     today's resolution.
 *
 *   - Read failure → typed-absence (`null`) at the resolver layer. A
 *     DB hiccup must not block intraday compute; the un-swept tail
 *     carries last-known via the combiner staleness rules.
 */

export interface OptionsFlowDailyVolumeRecord {
  ticker: string;
  as_of_date: string;    // ISO yyyy-mm-dd of the orchestrator run
  day_options_volume: number;
  /**
   * Injected `asOf.toISOString()` (the adapter's frozen ts). Used
   * verbatim as the row's `computed_at` so the write is replay-
   * deterministic (DEC-034 clause 4). Mirrors the sibling
   * `signal_observations.computed_at = ts` threading.
   */
  computed_at: string;
}

export interface OptionsFlowVolumeWriter {
  /** Upsert ONE record by (ticker, as_of_date) PK. Returns the underlying
   *  error (NOT a throw) so the adapter can soft-fail the persistence
   *  step without aborting the compute path. */
  upsert(record: OptionsFlowDailyVolumeRecord): Promise<{ error: { message: string } | null }>;
}

export interface OptionsFlowVolumeTopRow {
  ticker: string;
  day_options_volume: number;
}

export interface OptionsFlowVolumeReader {
  /**
   * Returns the top-N ticker rows for `as_of_date` ordered by
   * `day_options_volume` DESC. Caller supplies the PRIOR trading-day
   * date (resolver concern, not store concern). Returns `[]` on error
   * or absence (resolver treats as "no base tier" — fresh-active
   * names still seed via the UNION path).
   */
  topN(as_of_date: string, n: number): Promise<ReadonlyArray<OptionsFlowVolumeTopRow>>;
}

// Structural contract this module relies on. Tests inject in-memory
// doubles; the live supabase-js client surfaces a chained, thenable
// builder. Both paths await the terminal promise resolving `{ data, error }`.
interface OfvTopRowDto {
  ticker: string;
  day_options_volume: number;
}
interface OfvQueryResult {
  data: ReadonlyArray<OfvTopRowDto> | null;
  error: { message: string } | null;
}
interface OfvSelectBuilder extends PromiseLike<OfvQueryResult> {
  eq(column: string, value: string): OfvSelectBuilder;
  order(column: string, opts: { ascending: boolean }): OfvSelectBuilder;
  limit(n: number): OfvSelectBuilder;
}
interface OfvTableBuilder {
  upsert(
    payload: ReadonlyArray<Record<string, unknown>>,
    options?: { onConflict?: string },
  ): PromiseLike<{ error: { message: string } | null }>;
  select(columns: string): OfvSelectBuilder;
}
interface SupabaseLike {
  from(table: string): OfvTableBuilder;
}

export function createSupabaseOptionsFlowVolumeWriter(
  supabase: SupabaseLike,
): OptionsFlowVolumeWriter {
  return {
    async upsert(record) {
      const payload = [{
        ticker: record.ticker,
        as_of_date: record.as_of_date,
        day_options_volume: record.day_options_volume,
        computed_at: record.computed_at,
      }];
      const { error } = await supabase
        .from('options_flow_daily_volume')
        .upsert(payload, { onConflict: 'ticker,as_of_date' });
      return { error };
    },
  };
}

export function createSupabaseOptionsFlowVolumeReader(
  supabase: SupabaseLike,
): OptionsFlowVolumeReader {
  return {
    async topN(as_of_date, n) {
      const { data, error } = await supabase
        .from('options_flow_daily_volume')
        .select('ticker, day_options_volume')
        .eq('as_of_date', as_of_date)
        .order('day_options_volume', { ascending: false })
        .limit(n);
      if (error) {
        // Read failure → empty base tier; the resolver still UNIONs
        // fresh-active names from signal_observations. NEVER throw.
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      return rows.map((r) => ({
        ticker: r.ticker,
        day_options_volume: r.day_options_volume,
      }));
    },
  };
}