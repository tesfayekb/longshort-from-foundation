// ACT-515 Matrix — Turn-2B: shared SlateRow shape + parser.
//
// One row of scripts/act-515/matrix/cache/slate-YYYY.jsonl as emitted by
// overshoot-matrix-export ?mode=slate (see supabase/functions/
// overshoot-matrix-export/index.ts:200-213). The `session` field IS the
// event_date (`event_date::text AS session`). Numeric-string columns are
// preserved verbatim (byte-identity is the parity invariant).

import type { BandLabel, SideDb } from '../../kernel/types.ts';
import type { SessionDate } from '../../kernel/clock.ts';

export interface SlateRow {
  readonly session: SessionDate;         // = event_date
  readonly side: SideDb;
  readonly slate_rank: number;
  readonly tier: 'T1' | 'T2';
  readonly band: BandLabel;
  readonly ticker: string;
  readonly event_id: number;
  readonly window_days: number;
  readonly momentum_quintile: number;
  readonly drawdown_bucket: number;
  readonly move_pct: string;
  readonly short_excess_at_argmax: string | null;
  readonly excess_w1: string | null;
  readonly excess_w2: string | null;
  readonly excess_w3: string | null;
  readonly excess_w4: string | null;
  readonly excess_w5: string | null;
  readonly days_to_nearest_earnings: number | null;
  readonly mean_fwd_return_5d: string;
  readonly rank_score: string;
}

export function parseSlateLine(line: string): SlateRow {
  const j = JSON.parse(line) as Record<string, unknown>;
  return {
    session: String(j.session),
    side: j.side as SideDb,
    slate_rank: Number(j.slate_rank),
    tier: j.tier as 'T1' | 'T2',
    band: j.band as BandLabel,
    ticker: String(j.ticker),
    event_id: Number(j.event_id),
    window_days: Number(j.window_days),
    momentum_quintile: Number(j.momentum_quintile),
    drawdown_bucket: Number(j.drawdown_bucket),
    move_pct: String(j.move_pct),
    short_excess_at_argmax: j.short_excess_at_argmax == null ? null : String(j.short_excess_at_argmax),
    excess_w1: j.excess_w1 == null ? null : String(j.excess_w1),
    excess_w2: j.excess_w2 == null ? null : String(j.excess_w2),
    excess_w3: j.excess_w3 == null ? null : String(j.excess_w3),
    excess_w4: j.excess_w4 == null ? null : String(j.excess_w4),
    excess_w5: j.excess_w5 == null ? null : String(j.excess_w5),
    days_to_nearest_earnings: j.days_to_nearest_earnings == null ? null : Number(j.days_to_nearest_earnings),
    mean_fwd_return_5d: String(j.mean_fwd_return_5d),
    rank_score: String(j.rank_score),
  };
}

export async function* streamSlateFile(path: string): AsyncGenerator<SlateRow> {
  const text = await Deno.readTextFile(path);
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    yield parseSlateLine(line);
  }
}

/** Compaction K per (event_date, side) partition. Matches SLATE_SQL LIMIT 25. */
export const SLATE_TOP_N = 25 as const;

/** Admit cap K per partition for pick-parity. Matches ACT-501 daily budget. */
export const PARITY_K = 5 as const;