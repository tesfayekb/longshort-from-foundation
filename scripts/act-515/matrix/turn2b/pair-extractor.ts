// ACT-515 Matrix — Turn-2B: pair-extractor.
//
// SCOPE: reduce the pinned slate (5 yearly slices, 50,300 rows) to the
// UNIQUE `(ticker, entrySession)` pairs needed by Stage-A bars_pairs.
//
// The slate's `session` column is event_date. Entry offset per H-1 ruling
// (RULING 2026-07-26): LONG T1 = event+2, LONG T2 = event+1, SHORT = event+1.
// Both offsets are already encoded in matrix/reconstructor.ts
// (`entryOffsetForSideTier`); this module lifts those semantics without
// duplication.
//
// A `SessionCalendar` is REQUIRED — the pinned calendar.jsonl (SPY-marker,
// 1,011 sessions) is the only authority. Off-calendar event_dates yield a
// null entry session which the caller counts and skips.

import { entryOffsetForSideTier } from '../reconstructor.ts';
import type { SideDb } from '../../kernel/types.ts';
import type { SessionDate } from '../../kernel/clock.ts';
import type { SlateRow } from './slate-row.ts';

export interface SessionOffset {
  sessionAfter(s: SessionDate, n: number): SessionDate | null;
}

export interface PairExtractResult {
  readonly pairs: ReadonlyArray<readonly [string, SessionDate]>;
  readonly rowsSeen: number;
  readonly offCalendar: number;
  readonly byYear: Readonly<Record<string, number>>;
  readonly bySide: Readonly<Record<SideDb, number>>;
}

export function extractPairs(
  rows: Iterable<SlateRow>,
  calendar: SessionOffset,
): PairExtractResult {
  const seen = new Set<string>();
  const pairs: Array<readonly [string, SessionDate]> = [];
  const byYear: Record<string, number> = {};
  const bySide: Record<SideDb, number> = { long: 0, short: 0 };
  let rowsSeen = 0;
  let offCalendar = 0;

  for (const r of rows) {
    rowsSeen += 1;
    const n = entryOffsetForSideTier(r.side, r.tier);
    const entry = calendar.sessionAfter(r.session, n);
    if (entry === null) {
      offCalendar += 1;
      continue;
    }
    const key = `${r.ticker}\u0000${entry}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([r.ticker, entry]);
    bySide[r.side] += 1;
    const y = entry.slice(0, 4);
    byYear[y] = (byYear[y] ?? 0) + 1;
  }
  // Deterministic order: ticker ASC, session ASC.
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  return { pairs, rowsSeen, offCalendar, byYear, bySide };
}

/** Chunk pairs into ≤`maxPerReq` batches for POST mode=bars_pairs. */
export function chunkPairs<T>(
  pairs: ReadonlyArray<T>, maxPerReq: number,
): Array<ReadonlyArray<T>> {
  if (maxPerReq <= 0) throw new Error(`chunkPairs: maxPerReq must be positive`);
  const out: Array<ReadonlyArray<T>> = [];
  for (let i = 0; i < pairs.length; i += maxPerReq) {
    out.push(pairs.slice(i, i + maxPerReq));
  }
  return out;
}