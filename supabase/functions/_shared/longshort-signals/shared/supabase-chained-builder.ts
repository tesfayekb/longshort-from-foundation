/**
 * Shared minimal supabase chained-builder type for edge resolver/store layer.
 *
 * Structural-prevention for the recurring "hand-rolled-SupabaseLike-too-precise"
 * class (Catalog #61, 3 firings: DTC store TS2589 + 2 in options-flow-subset-resolver).
 *
 * Each hand-rolled partial interface broke differently when the call site used a
 * method or row-shape the local interface didn't enumerate. The fix is one
 * GENERIC chained builder parameterized by row type, exposing the full method set
 * used across the edge layer (eq / in / order / limit + thenable). Tables that
 * return different row shapes use distinct TRow type parameters at the call site.
 *
 * SCOPE: edge `_shared/longshort-signals/**` resolvers/stores only — NOT the
 * `src/` production paths (those use the typed Supabase client directly).
 */

export interface SupabaseQueryError {
  message: string;
}

export interface SupabaseQueryResult<TRow> {
  data: ReadonlyArray<TRow> | null;
  error: SupabaseQueryError | null;
}

/**
 * Generic chained-select builder. All filter/order/limit methods return the
 * same builder so chains type-check end-to-end, and the row shape is carried
 * through via TRow so the awaited result has the correct typing.
 */
export interface ChainedSelectBuilder<TRow> extends PromiseLike<SupabaseQueryResult<TRow>> {
  eq(column: string, value: unknown): ChainedSelectBuilder<TRow>;
  in(column: string, values: ReadonlyArray<string | number>): ChainedSelectBuilder<TRow>;
  order(column: string, opts: { ascending: boolean }): ChainedSelectBuilder<TRow>;
  limit(n: number): ChainedSelectBuilder<TRow>;
}

/**
 * Table entry-point. `select<TRow>(cols)` returns a builder typed for TRow so
 * each query at the call site declares its own row shape.
 */
export interface ChainedTableBuilder {
  select<TRow>(columns: string): ChainedSelectBuilder<TRow>;
}

/** Minimal supabase-like surface used by edge resolvers/stores. */
export interface SupabaseChainedClient {
  from(table: string): ChainedTableBuilder;
}