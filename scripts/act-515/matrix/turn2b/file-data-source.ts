// ACT-515 Matrix — Turn-2B: FileR1DataSource.
//
// Implements the `R1DataSource` interface in run-r1-const.ts by reading from
// the pinned cache files (scripts/act-515/matrix/cache/*.jsonl) plus the
// Turn-2B Stage-A/B bars artifacts. Zero network. SHA-provenance is the
// caller's responsibility — this adapter reads bytes and returns rows.
//
// COMPACTED-CORPUS DISCLOSURE (RULING 2026-07-26): slate = TOP-N=25 per
// (event_date, side). This is INTENTIONAL for the R1 receipt turn: the
// compaction is the studied basis. Full-corpus reconstruction would require
// re-invoking the study writer, out of scope for Turn-2B.

import type {
  R1DataSource,
} from '../run-r1-const.ts';
import type { CorpusCandidateRow } from '../reconstructor.ts';
import { MapBarSource } from '../../kernel/mark.ts';
import { price } from '../../kernel/types.ts';
import type { BandLabel, Price, SideDb } from '../../kernel/types.ts';
import type { SessionDate } from '../../kernel/clock.ts';
import { parseSlateLine } from './slate-row.ts';

function toNumOrNull(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

async function readLines(path: string): Promise<string[]> {
  const text = await Deno.readTextFile(path);
  return text.split('\n').filter(l => l.length > 0);
}

export interface FileR1Paths {
  readonly cacheDir: string;              // e.g. scripts/act-515/matrix/cache/
  readonly slateYears: ReadonlyArray<number>; // e.g. [2022,2023,2024,2025,2026]
  readonly barsPairsPath: string;         // Stage-A output
  readonly barsWindowsPath?: string;      // Stage-B output (optional for parity turns)
}

export class FileR1DataSource implements R1DataSource {
  constructor(private readonly paths: FileR1Paths) {}

  async fetchCorpus(): Promise<ReadonlyArray<CorpusCandidateRow>> {
    const out: CorpusCandidateRow[] = [];
    for (const y of this.paths.slateYears) {
      const path = `${this.paths.cacheDir}slate-${y}.jsonl`;
      for (const line of await readLines(path)) {
        const s = parseSlateLine(line);
        out.push({
          eventId: s.event_id,
          ticker: s.ticker,
          side: s.side,
          eventDate: s.session,
          windowDays: s.window_days,
          momentumQuintile: s.momentum_quintile,
          drawdownBucket: s.drawdown_bucket,
          daysToNearestEarnings: s.days_to_nearest_earnings,
          excessW1: toNumOrNull(s.excess_w1),
          excessW2: toNumOrNull(s.excess_w2),
          excessW3: toNumOrNull(s.excess_w3),
          excessW4: toNumOrNull(s.excess_w4),
          excessW5: toNumOrNull(s.excess_w5),
        });
      }
    }
    return out;
  }

  async fetchCellMap() {
    const path = `${this.paths.cacheDir}cellmap.jsonl`;
    const out: Array<{
      side: SideDb; band: BandLabel;
      argmaxWindowDays: number; magnitudeQuintile: number; drawdownBucket: number;
      exclusionHorizonDays: number; meanFwdReturn5d: number;
    }> = [];
    for (const line of await readLines(path)) {
      const r = JSON.parse(line) as Record<string, unknown>;
      out.push({
        side: r.side as SideDb,
        band: r.band as BandLabel,
        argmaxWindowDays: Number(r.window_days),
        magnitudeQuintile: Number(r.momentum_quintile),
        drawdownBucket: Number(r.drawdown_bucket),
        exclusionHorizonDays: Number(r.exclusion_width_days),
        meanFwdReturn5d: Number(r.mean_fwd_return_5d),
      });
    }
    return out;
  }

  async fetchUniverse() {
    const path = `${this.paths.cacheDir}universe.jsonl`;
    const out: Array<{ ticker: string; addedAsOf: SessionDate; active: boolean }> = [];
    for (const line of await readLines(path)) {
      const r = JSON.parse(line) as Record<string, unknown>;
      if (r.trailer === true) continue;
      out.push({
        ticker: String(r.ticker),
        addedAsOf: String(r.added_as_of),
        active: r.active === true,
      });
    }
    return out;
  }

  async fetchSessions(windowStart: SessionDate, windowEnd: SessionDate) {
    const path = `${this.paths.cacheDir}calendar.jsonl`;
    const out: SessionDate[] = [];
    for (const line of await readLines(path)) {
      const r = JSON.parse(line) as { session: string };
      if (r.session >= windowStart && r.session <= windowEnd) out.push(r.session);
    }
    return out;
  }

  async fetchBarsChunk(
    tickers: ReadonlyArray<string>, sessions: ReadonlyArray<SessionDate>,
  ): Promise<Map<string, Price>> {
    void tickers; void sessions;
    const path = this.paths.barsPairsPath;
    const map = new Map<string, Price>();
    for (const line of await readLines(path)) {
      const r = JSON.parse(line) as { ticker: string; trade_date: string; open: string };
      const opn = Number(r.open);
      if (!Number.isFinite(opn) || opn <= 0) continue;
      map.set(MapBarSource.key(r.ticker, r.trade_date), price(opn));
    }
    return map;
  }

  /** Extra helper for Stage-A parity: returns null on unknown pair. */
  async loadStageACloses(): Promise<Map<string, number | null>> {
    const path = this.paths.barsPairsPath;
    const m = new Map<string, number | null>();
    for (const line of await readLines(path)) {
      const r = JSON.parse(line) as { ticker: string; trade_date: string; open: string | null };
      const opn = r.open === null ? null : Number(r.open);
      m.set(`${r.ticker}\u0000${r.trade_date}`, opn === null || !Number.isFinite(opn) ? null : opn);
    }
    return m;
  }
}

export function stageACloseKey(ticker: string, session: SessionDate): string {
  return `${ticker}\u0000${session}`;
}