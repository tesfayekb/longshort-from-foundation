/**
 * Prior-book loader — FP-062 6I.4 / DW-105 §1.4.
 *
 * Thin I/O shell. Reads the MOST-RECENT combiner_book as_of_date STRICTLY
 * LESS THAN the supplied asOfDate (same operator_id + same intraday_slot
 * for substrate parity), projects to PriorBookRow shape. Returns [] when
 * no prior as_of_date exists (first-run / gap case) — the state-machine
 * treats this as all-seeded.
 *
 * No `any`. No `deno-lint-ignore`. Structural typing only — CI's ESLint
 * runs against this file and does NOT honor deno-lint-ignore.
 */

import type { PriorBookRow } from './book-state-machine.ts';

/** Minimal structural Supabase client surface this loader needs. */
export interface PriorBookSupabaseClient {
  from(table: string): PriorBookFromBuilder;
}
interface PriorBookFromBuilder {
  select(cols: string): PriorBookSelectBuilder;
}
interface PriorBookSelectBuilder {
  eq(col: string, val: string | number): PriorBookSelectBuilder;
  lt(col: string, val: string): PriorBookSelectBuilder;
  order(col: string, opts: { ascending: boolean }): PriorBookSelectBuilder;
  limit(n: number): Promise<{
    data: PriorBookReadRow[] | null;
    error: { message: string } | null;
  }>;
}

interface PriorBookReadRow {
  as_of_date: string;
  side: 'long' | 'short';
  ticker: string;
  entered_at: string | null;
  computed_at: string;
}

export interface LoadPriorBookArgs {
  supabase: PriorBookSupabaseClient;
  operator_id: string;
  as_of_date: string;     // today's as_of (YYYY-MM-DD); loader picks the most-recent < this
  intraday_slot: number;  // DEC-070 clause (e) — daily writer = slot 0
}

/**
 * Load yesterday's (or the most-recent prior) combiner_book rows for
 * the (operator, slot). Two-step read so the loader can pick the
 * single most-recent as_of_date < today (in case there is a gap) and
 * then read that day's rows only.
 */
export async function loadPriorBook(
  args: LoadPriorBookArgs,
): Promise<PriorBookRow[]> {
  // Step 1: find the most-recent as_of_date strictly < today.
  const recent = await args.supabase
    .from('combiner_book')
    .select('as_of_date')
    .eq('operator_id', args.operator_id)
    .eq('intraday_slot', args.intraday_slot)
    .lt('as_of_date', args.as_of_date)
    .order('as_of_date', { ascending: false })
    .limit(1);

  if (recent.error) {
    throw new Error(
      `prior-book-loader: as_of probe failed: ${recent.error.message}`,
    );
  }
  const data = recent.data ?? [];
  if (data.length === 0) return [];
  const priorAsOf = data[0].as_of_date;

  // Step 2: read every row at that prior as_of_date.
  const rows = await args.supabase
    .from('combiner_book')
    .select('as_of_date, side, ticker, entered_at, computed_at')
    .eq('operator_id', args.operator_id)
    .eq('intraday_slot', args.intraday_slot)
    .eq('as_of_date', priorAsOf)
    .limit(1000);  // 25 cap per side × 2 sides = 50 max; 1000 is comfortable.

  if (rows.error) {
    throw new Error(
      `prior-book-loader: read failed for as_of=${priorAsOf}: ${rows.error.message}`,
    );
  }
  const out: PriorBookRow[] = [];
  for (const r of rows.data ?? []) {
    out.push({
      side: r.side,
      ticker: r.ticker,
      // Backfill safety: pre-MIG-147 rows have entered_at populated by
      // the migration backfill. Defense-in-depth: if a row somehow lacks
      // entered_at (NULL), fall back to computed_at (the migration's
      // backfill semantic). Never throw — this loader is best-effort
      // and the state-machine tolerates degraded entered_at.
      entered_at: r.entered_at ?? r.computed_at,
    });
  }
  return out;
}