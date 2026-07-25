// ACT-515 — SupabaseBarQueryExecutor: BarQueryExecutor implementation.
//
// SCOPE: implements the `BarQueryExecutor` contract from
// `db-bar-source.ts` against `public.overshoot_daily_bars`. Chunked
// preload semantics: session-windows split into REQUEST_SESSIONS_MAX-slot
// batches × REQUEST_TICKERS_MAX-slot batches so a single Supabase call
// never exceeds URL/row limits.
//
// USAGE (runner):
//   const executor = new SupabaseBarQueryExecutor(supabase);
//   const map = await preloadBars(executor, tickers, sessions);
//   const barSource = new MapBarSource(map);
//
// ANTI-PHANTOM: never fabricates a zero for a missing bar. Rows with
// `close = null` are OMITTED (Price | null contract; caller observes `null`
// via `close()`). Query errors bubble up — no silent empty return.
//
// SCOPE FENCE: no kernel imports. Read-only DB access.

import type { BarQueryExecutor, DailyBarRow } from './db-bar-source.ts';
import type { SessionDate } from '../kernel/clock.ts';

/** Batch size — chosen to stay well under Supabase's default 1000-row
 *  return limit while keeping round-trip count low. tickers × sessions ≤
 *  20k per request. */
export const REQUEST_TICKERS_MAX = 200;
export const REQUEST_SESSIONS_MAX = 100;

/** Minimal Supabase client contract (subset the executor calls). Keeps this
 *  file free of the @supabase/supabase-js type surface. */
export interface SupabaseLike {
  from(table: string): {
    select(cols: string): {
      in(col: string, values: readonly string[]): {
        in(col: string, values: readonly string[]): Promise<{
          data: DailyBarRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export class SupabaseBarQueryExecutor implements BarQueryExecutor {
  constructor(private readonly supabase: SupabaseLike,
              private readonly table: string = 'overshoot_daily_bars') {}

  async fetchBars(
    tickers: ReadonlyArray<string>,
    sessions: ReadonlyArray<SessionDate>,
  ): Promise<{ data: ReadonlyArray<DailyBarRow>; error: null } | { data: null; error: Error }> {
    // Deduplicate to shrink request volume (idempotent per contract).
    const uniqTickers = Array.from(new Set(tickers));
    const uniqSessions = Array.from(new Set(sessions));

    const all: DailyBarRow[] = [];
    for (let ti = 0; ti < uniqTickers.length; ti += REQUEST_TICKERS_MAX) {
      const tSlice = uniqTickers.slice(ti, ti + REQUEST_TICKERS_MAX);
      for (let si = 0; si < uniqSessions.length; si += REQUEST_SESSIONS_MAX) {
        const sSlice = uniqSessions.slice(si, si + REQUEST_SESSIONS_MAX);
        const res = await this.supabase
          .from(this.table)
          .select('ticker, session_date:trade_date, close')
          .in('ticker', tSlice)
          .in('trade_date', sSlice);
        if (res.error !== null) {
          return { data: null, error: new Error(
            `SupabaseBarQueryExecutor: chunk ti=${ti} si=${si} — ${res.error.message}`) };
        }
        if (res.data) all.push(...res.data);
      }
    }
    return { data: all, error: null };
  }
}
