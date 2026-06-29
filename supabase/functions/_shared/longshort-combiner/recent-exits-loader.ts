/**
 * Recent-exits loader — FP-062 6I.4 / DW-105 §1.4 conditional 31-day
 * re-entry block.
 *
 * Thin I/O shell over `longshort_lots` (FP-061). Reads closed lots
 * whose exit_ts falls within the trailing REENTRY_BLOCK_DAYS window
 * before asOfDate, aggregates partial-fill closures into one row per
 * (operator_id, symbol, side, exit_date), and emits the SIGN of
 * SUM(realized_pnl) as `pnl_sign`. The pure state-machine consumes
 * the aggregated set — never the raw lot rows.
 *
 * Pre-flight-confirmed column literals on `longshort_lots`:
 *   - `realized_pnl` (numeric)
 *   - `exit_ts`      (timestamptz)
 *   - `status`       (text; closed lots carry 'closed')
 *   - `symbol`, `side`, `operator_id`
 *
 * No `any`. No `deno-lint-ignore`. Structural typing only.
 */

import type { RecentExit } from './book-state-machine.ts';
import { REENTRY_BLOCK_DAYS } from './book-state-machine.ts';

export interface RecentExitsSupabaseClient {
  from(table: string): RecentExitsFromBuilder;
}
interface RecentExitsFromBuilder {
  select(cols: string): RecentExitsSelectBuilder;
}
interface RecentExitsSelectBuilder {
  eq(col: string, val: string): RecentExitsSelectBuilder;
  gte(col: string, val: string): RecentExitsSelectBuilder;
  not(col: string, op: string, val: null): RecentExitsSelectBuilder;
  limit(n: number): Promise<{
    data: RecentExitReadRow[] | null;
    error: { message: string } | null;
  }>;
}

interface RecentExitReadRow {
  symbol: string;
  side: 'long' | 'short';
  exit_ts: string;        // ISO timestamptz
  realized_pnl: number | string | null;
}

export interface LoadRecentExitsArgs {
  supabase: RecentExitsSupabaseClient;
  operator_id: string;
  as_of_date: string;  // YYYY-MM-DD; window = [as_of - 31d, as_of)
}

/** Subtract `days` calendar days from a YYYY-MM-DD string, UTC, no clock. */
function subtractDays(asOfDate: string, days: number): string {
  const ms = Date.UTC(
    Number(asOfDate.slice(0, 4)),
    Number(asOfDate.slice(5, 7)) - 1,
    Number(asOfDate.slice(8, 10)),
  ) - days * 86400000;
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function loadRecentExits(
  args: LoadRecentExitsArgs,
): Promise<RecentExit[]> {
  const windowStart = subtractDays(args.as_of_date, REENTRY_BLOCK_DAYS);

  const res = await args.supabase
    .from('longshort_lots')
    .select('symbol, side, exit_ts, realized_pnl')
    .eq('operator_id', args.operator_id)
    .eq('status', 'closed')
    .gte('exit_ts', windowStart)
    .not('exit_ts', 'is', null)
    .limit(5000);

  if (res.error) {
    throw new Error(
      `recent-exits-loader: longshort_lots read failed: ${res.error.message}`,
    );
  }

  // Aggregate partial-fill closures: SUM(realized_pnl) per
  // (symbol, side, exit_date). pnl_sign is the sign of the SUM.
  const sumByKey = new Map<string, { side: 'long'|'short'; symbol: string; exit_date: string; sum: number }>();
  for (const r of res.data ?? []) {
    const exitDate = r.exit_ts.slice(0, 10);  // YYYY-MM-DD UTC slice
    const key = `${r.side}|${r.symbol}|${exitDate}`;
    const pnl = typeof r.realized_pnl === 'string'
      ? Number(r.realized_pnl)
      : (r.realized_pnl ?? 0);
    const existing = sumByKey.get(key);
    if (existing) {
      existing.sum += pnl;
    } else {
      sumByKey.set(key, { side: r.side, symbol: r.symbol, exit_date: exitDate, sum: pnl });
    }
  }

  const out: RecentExit[] = [];
  for (const agg of sumByKey.values()) {
    const sign: -1 | 0 | 1 = agg.sum > 0 ? 1 : agg.sum < 0 ? -1 : 0;
    out.push({
      side: agg.side,
      symbol: agg.symbol,
      exit_date: agg.exit_date,
      pnl_sign: sign,
    });
  }
  // Deterministic ordering for downstream consumers / tests.
  out.sort((a, b) => {
    if (a.side !== b.side) return a.side < b.side ? -1 : 1;
    if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
    return a.exit_date < b.exit_date ? -1 : a.exit_date > b.exit_date ? 1 : 0;
  });
  return out;
}