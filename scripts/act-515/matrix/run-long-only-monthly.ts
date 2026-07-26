// ACT-580 S5-L BLEND STEP — R1 LONG-ONLY monthly-return emitter (CSV out).
// Runs the sealed orchestrator with `disableShortAdmits=true` (matches the
// R1-LONG-ONLY capstone: same window, same K=5, 1x-const, wallet caps
// 0.90/0.10, FixedClock 1_704_000_000_000ms). Emits one CSV row per YM:
//   YYYY-MM,eom_date,eom_equity,monthly_return_pct
// so S5-L can be monthly-aligned for blend receipts. Reads sealed cache
// unchanged; NO kernel edits.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import { runOrchestrator, type CompositeBarSource } from './orchestrator.ts';
import {
  entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup,
} from './reconstructor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const CACHE_DIR = 'scripts/act-515/matrix/cache/';
const SLATE_YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WINDOW_START: SessionDate = '2022-06-29';
const WINDOW_END:   SessionDate = '2026-07-10';
const WALLET_CAPS = { long: 0.90, short: 0.10 } as const;
const BUDGETS = { k: 5, shortDailyBudget: 5 } as const;
const CLOCK_MS = 1_704_000_000_000;

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
}
async function loadCalendar(): Promise<SessionDate[]> {
  const out: SessionDate[] = [];
  for (const l of await readLines(`${CACHE_DIR}calendar.jsonl`)) {
    const r = JSON.parse(l) as { session: string };
    if (r.session >= WINDOW_START && r.session <= WINDOW_END) out.push(r.session);
  }
  out.sort(); return out;
}
async function loadCellMap(): Promise<CellMapLookup> {
  const m = new Map<string, number>();
  for (const l of await readLines(`${CACHE_DIR}cellmap.jsonl`)) {
    const r = JSON.parse(l) as Record<string, unknown>;
    const k = [r.side, r.band, Number(r.window_days), Number(r.momentum_quintile),
      Number(r.drawdown_bucket), Number(r.exclusion_width_days)].join('/');
    m.set(k, Number(r.mean_fwd_return_5d));
  }
  return (k) => m.get(
    `${k.side}/${k.band}/${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}/${k.exclusionHorizonDays}`,
  ) ?? null;
}
async function loadSlate(cal: ArraySessionCalendar) {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  const toN = (x: string | null): number | null => {
    if (x === null) return null;
    const n = Number(x); return Number.isFinite(n) ? n : null;
  };
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l);
      const offset = entryOffsetForSideTier(s.side, s.tier);
      const es = cal.sessionAfter(s.session, offset);
      if (es === null || es < WINDOW_START || es > WINDOW_END) continue;
      const row: CorpusCandidateRow = {
        eventId: s.event_id, ticker: s.ticker, side: s.side, eventDate: s.session,
        windowDays: s.window_days, momentumQuintile: s.momentum_quintile,
        drawdownBucket: s.drawdown_bucket, daysToNearestEarnings: s.days_to_nearest_earnings,
        excessW1: toN(s.excess_w1), excessW2: toN(s.excess_w2),
        excessW3: toN(s.excess_w3), excessW4: toN(s.excess_w4), excessW5: toN(s.excess_w5),
      };
      const arr = bySession.get(es); if (arr) arr.push(row); else bySession.set(es, [row]);
    }
  }
  return bySession;
}
async function loadBars(): Promise<CompositeBarSource> {
  const opens = new Map<string, Price>(), closes = new Map<string, Price>();
  const put = (m: Map<string, Price>, r: {ticker:string;trade_date:string;open?:string|null;close?:string|null}, field: 'open'|'close') => {
    const v = r[field]; if (v === null || v === undefined) return;
    const n = Number(v); if (!Number.isFinite(n) || n <= 0) return;
    m.set(MapBarSource.key(r.ticker, r.trade_date), price(n));
  };
  for (const l of await readLines(`${CACHE_DIR}bars-pairs.jsonl`)) {
    const r = JSON.parse(l); put(opens, r, 'open');
  }
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}bars-windows-${y}.jsonl`)) {
      const r = JSON.parse(l); put(closes, r, 'close');
    }
  }
  for (const l of await readLines(`${CACHE_DIR}bars-windows-delta.jsonl`)) {
    const r = JSON.parse(l);
    if (!opens.has(MapBarSource.key(r.ticker, r.trade_date))) put(opens, r, 'open');
    if (!closes.has(MapBarSource.key(r.ticker, r.trade_date))) put(closes, r, 'close');
  }
  return {
    open:  (t, s) => opens.get(MapBarSource.key(t, s)) ?? null,
    close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null,
  };
}

if (import.meta.main) {
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const corpus = await loadSlate(cal);
  const bars = await loadBars();
  const res = runOrchestrator({
    variantId: '1x-const', sessions, calendar: cal, corpusByEntrySession: corpus,
    cellMap, bars, startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD,
    budgets: BUDGETS, walletCapFractions: WALLET_CAPS, haircutMode: 'study',
    clock: new FixedClock(CLOCK_MS), permitExitDegradation: true,
    disableShortAdmits: true,
  });
  if (!res.ok) throw new Error(`halted at ${res.sessionDate}: ${res.detail}`);
  const eomEq = new Map<string, number>();
  const eomDate = new Map<string, string>();
  for (const r of res.rows) {
    const ym = r.sessionDate.slice(0, 7);
    eomEq.set(ym, r.equityUsd as number);
    eomDate.set(ym, r.sessionDate);
  }
  const keys = Array.from(eomEq.keys()).sort();
  let prev = KERNEL_CONST_BASE_EQUITY_USD;
  console.log('YYYY-MM,eom_date,eom_equity,monthly_return_pct');
  for (const ym of keys) {
    const eq = eomEq.get(ym)!;
    const ret = (eq / prev - 1) * 100;
    console.log(`${ym},${eomDate.get(ym)},${eq.toFixed(2)},${ret.toFixed(4)}`);
    prev = eq;
  }
}