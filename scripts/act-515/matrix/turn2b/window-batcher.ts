// ACT-515 Matrix — Turn-2B: window-batcher.
//
// SCOPE: for each admitted lot, compute the bar-fetch window
//   [entryDate .. exitAnchorSession + maxCarry]
// then batch under BARS_WINDOWS_MAX_PER_REQ (500) and
// BARS_WINDOWS_SUM_DAYS_CAP (200,000) — mirrors envelope pins in
// supabase/functions/overshoot-matrix-export/index.ts:56-58.
//
// EXIT ANCHOR DISPATCH — verbatim from kernel/exit.ts:170-177
// (EXIT_ANCHOR_BY_SIDE_TIER):
//   long  T1  → { mode:'event', n:6 }
//   long  T2  → { mode:'entry', H:10, n:9 }
//   short T1  → { mode:'entry', H:5,  n:4 }
//   short T2  → { mode:'entry', H:5,  n:4 }
//
// The window END = sessionAfter(anchor, spec.n + maxCarry). If the anchor
// walk falls off the calendar (rare, near data horizon), the batcher clamps
// to the last available session and flags the lot in `clampedLotIds`.

import { EXIT_ANCHOR_BY_SIDE_TIER } from '../../kernel/exit.ts';
import type { SideDb } from '../../kernel/types.ts';
import type { SessionDate } from '../../kernel/clock.ts';

export const BARS_WINDOWS_MAX_PER_REQ_DEFAULT = 500;
export const BARS_WINDOWS_SUM_DAYS_CAP_DEFAULT = 200_000;
export const MAX_CARRY_DEFAULT = 5;

export interface AdmittedLotForBars {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly tier: 'T1' | 'T2';
  readonly eventDate: SessionDate;
  readonly entryDate: SessionDate;
}

export interface Window {
  readonly ticker: string;
  readonly from: SessionDate;
  readonly to: SessionDate;
}

export interface WindowBatchOptions {
  readonly maxPerReq?: number;
  readonly sumDaysCap?: number;
  readonly maxCarry?: number;
}

export interface SessionOffset {
  sessionAfter(s: SessionDate, n: number): SessionDate | null;
  /** Rewind n sessions strictly before `s`; used for exit clamp. */
  lastSession(): SessionDate;
}

export interface BuildResult {
  readonly windows: ReadonlyArray<Window>;
  readonly totalDays: number;
  readonly clampedLotIds: ReadonlyArray<string>;
}

function daysBetween(from: SessionDate, to: SessionDate): number {
  const df = Date.parse(from);
  const dt = Date.parse(to);
  if (!Number.isFinite(df) || !Number.isFinite(dt) || dt < df) {
    throw new Error(`daysBetween: bad range ${from}..${to}`);
  }
  return Math.floor((dt - df) / 86_400_000) + 1;
}

/** Build one window per admitted lot. Windows overlap when lots share a
 *  ticker; the export fn de-dupes bars by (ticker, trade_date). */
export function buildWindows(
  lots: ReadonlyArray<AdmittedLotForBars>,
  offset: SessionOffset,
  opts: WindowBatchOptions = {},
): BuildResult {
  const maxCarry = opts.maxCarry ?? MAX_CARRY_DEFAULT;
  const windows: Window[] = [];
  const clamped: string[] = [];
  const lastSess = offset.lastSession();
  let totalDays = 0;

  for (const lot of lots) {
    const key = `${lot.side}/${lot.tier}` as const;
    const spec = EXIT_ANCHOR_BY_SIDE_TIER[key];
    const anchorBase = spec.mode === 'event' ? lot.eventDate : lot.entryDate;
    let end = offset.sessionAfter(anchorBase, spec.n + maxCarry);
    if (end === null) {
      end = lastSess;
      clamped.push(lot.lotId);
    }
    if (end < lot.entryDate) end = lot.entryDate; // degenerate guard
    windows.push({ ticker: lot.ticker, from: lot.entryDate, to: end });
    totalDays += daysBetween(lot.entryDate, end);
  }

  return { windows, totalDays, clampedLotIds: clamped };
}

export interface Batch {
  readonly windows: ReadonlyArray<Window>;
  readonly sumDays: number;
}

/** Greedy pack into batches respecting BOTH caps (max windows + sum days).
 *  Never splits a single window across batches. Windows larger than
 *  `sumDaysCap` alone raise — caller must upstream-clamp. */
export function packBatches(
  windows: ReadonlyArray<Window>,
  opts: WindowBatchOptions = {},
): ReadonlyArray<Batch> {
  const maxPerReq = opts.maxPerReq ?? BARS_WINDOWS_MAX_PER_REQ_DEFAULT;
  const sumDaysCap = opts.sumDaysCap ?? BARS_WINDOWS_SUM_DAYS_CAP_DEFAULT;
  const out: Batch[] = [];
  let cur: Window[] = [];
  let curDays = 0;
  for (const w of windows) {
    const d = daysBetween(w.from, w.to);
    if (d > sumDaysCap) {
      throw new Error(`packBatches: single window (${w.ticker} ${w.from}..${w.to}) is ${d} days > cap ${sumDaysCap}`);
    }
    if (cur.length >= maxPerReq || curDays + d > sumDaysCap) {
      out.push({ windows: cur, sumDays: curDays });
      cur = []; curDays = 0;
    }
    cur.push(w); curDays += d;
  }
  if (cur.length > 0) out.push({ windows: cur, sumDays: curDays });
  return out;
}