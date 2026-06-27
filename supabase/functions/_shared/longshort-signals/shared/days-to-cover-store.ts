/**
 * DaysToCover store — Squeeze-Protection Component 2 (DW-165).
 *
 * Persists the latest reported `days_to_cover` (DTC) per (operator_id, ticker)
 * so the short-side pre-flight composer can hard-exclude squeeze-prone
 * short candidates (DTC ≥ SHORT_DTC_EXCLUDE_THRESHOLD).
 *
 * DESIGN INVARIANTS:
 *
 *   - DTC is a RISK GATE, NOT alpha. It MUST NEVER enter the combiner
 *     feature vector (`combiner_feature_vectors.features`). The sibling
 *     `signal_observations` row carries the §4.4.3 SI-as-%-of-float
 *     value; this store is the ONLY persistence site for DTC and is
 *     deliberately not consumed by the feature-assembler.
 *
 *   - Last-writer-wins by (operator_id, ticker). Twice-monthly SI cadence
 *     overwrites the row each run with the latest report's DTC.
 *
 *   - Typed-absence: `latest_days_to_cover` may be `null` (Polygon omits
 *     ADV or returns non-finite values for illiquid names). The
 *     pre-flight treats null DTC as PASSING + logs a metric.
 */

export interface DaysToCoverRecord {
  operator_id: string;
  ticker: string;
  as_of_date: string;   // ISO yyyy-mm-dd of the orchestrator run
  latest_days_to_cover: number | null;
  report_date: string;  // settlement_date of the latest report used
}

export interface DaysToCoverWriter {
  /** Upsert a batch of latest-DTC records by (operator_id, ticker) PK. */
  upsertLatest(records: readonly DaysToCoverRecord[]): Promise<{ error: { message: string } | null }>;
}

export interface DaysToCoverReader {
  /**
   * Returns the latest DTC value for `ticker`, or `null` if unknown
   * (no row OR row's `latest_days_to_cover` is null). The pre-flight
   * gate treats `null` as PASSING (per DW-165 null-policy).
   */
  read(ticker: string): Promise<number | null>;
}

type FromTable = {
  from(table: string): {
    upsert(records: unknown, options?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
    select(cols: string): {
      eq(col: string, val: string): {
        in(col: string, vals: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
        eq(col: string, val: string): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
  };
};

export function createSupabaseDaysToCoverWriter(
  supabase: FromTable,
): DaysToCoverWriter {
  return {
    async upsertLatest(records) {
      if (records.length === 0) return { error: null };
      const payload = records.map((r) => ({
        operator_id: r.operator_id,
        ticker: r.ticker,
        as_of_date: r.as_of_date,
        latest_days_to_cover: r.latest_days_to_cover,
        report_date: r.report_date,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from('short_interest_days_to_cover')
        .upsert(payload, { onConflict: 'operator_id,ticker' });
      return { error };
    },
  };
}

export function createSupabaseDaysToCoverReader(
  supabase: FromTable,
  operator_id: string,
): DaysToCoverReader {
  return {
    async read(ticker) {
      const { data, error } = await supabase
        .from('short_interest_days_to_cover')
        .select('latest_days_to_cover')
        .eq('operator_id', operator_id)
        .eq('ticker', ticker);
      if (error) {
        // Read failure → typed-absence (null = PASSING). Never throw — a
        // DB hiccup must not block the pre-flight; the −15% short-stop
        // is the active backstop.
        return null;
      }
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) return null;
      const v = (rows[0] as { latest_days_to_cover: number | null }).latest_days_to_cover;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    },
  };
}