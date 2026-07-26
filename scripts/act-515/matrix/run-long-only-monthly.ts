// ACT-580 S5-L BLEND STEP — R1 LONG-ONLY monthly return emitter.
// Reuses run-daily-equity-emitter wiring; single config = 1x-const with
// disableShortAdmits=true (matches R1-long-only capstone). Emits a
// monthly-return matrix so S5-L can be monthly-aligned for blend receipts.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import { runOrchestrator, type CompositeBarSource } from './orchestrator.ts';
import { entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup } from './reconstructor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const CACHE = 'scripts/act-515/matrix/cache/';
const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WSTART: SessionDate = '2022-06-29';
const WEND: SessionDate = '2026-07-10';

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
}
async function loadCalendar(): Promise<SessionDate[]> {
  const out: SessionDate[] = [];
  for (const l of await readLines(`${CACHE}calendar.jsonl`)) {
    const r = JSON.parse(l) as { session: string };
    if (r.session >= WSTART && r.session <= WEND) out.push(r.session);
  }
  out.sort(); return out;
}
async function loadCellMap(): Promise<CellMapLookup> {
  const m = new Map<string, { entryOffset: number; slateRank: number }>();
  for (const l of await readLines(`${CACHE}cellmap.jsonl`)) {
    const r = JSON.parse(l) as { eventId: number; side: 'long'|'short'; tier: string; slateRank: number };
    const off = entryOffsetForSideTier(r.side, r.tier);
    m.set(`${r.eventId}`, { entryOffset: off, slateRank: r.slateRank });
  }
  return { get: (eid: number) => m.get(`${eid}`) ?? null };
}
async function loadCorpus(cal: ArraySessionCalendar): Promise<Map<SessionDate, CorpusCandidateRow[]>> {
  const out = new Map<SessionDate, CorpusCandidateRow[]>();
  for (const yr of YEARS) {
    for (const l of await readLines(`${CACHE}slate-${yr}.jsonl`)) {
      const rows = parseSlateLine(l, cal);
      for (const r of rows) {
        const arr = out.get(r.entrySession) ?? [];
        arr.push(r); out.set(r.entrySession, arr);
      }
    }
  }
  return out;
}
async function loadBars() {
  const opens = new Map<string, Price>();
  const closes = new Map<string, Price>();
  const readP = async (p: string, target: Map<string, Price>, kind: 'open'|'close') => {
    for (const l of await readLines(p)) {
      const r = JSON.parse(l) as { ticker: string; session: string; open?: string; close?: string };
      const v = kind === 'open' ? r.open : r.close;
      if (v == null) continue;
      target.set(MapBarSource.key(r.ticker, r.session), price(Number(v)));
    }
  };
  await readP(`${CACHE}bars-pairs.jsonl`, opens, 'open');
  await readP(`${CACHE}bars-windows-delta.jsonl`, opens, 'open');
  for (const y of YEARS) await readP(`${CACHE}bars-windows-${y}.jsonl`, closes, 'close');
  await readP(`${CACHE}bars-windows-delta.jsonl`, closes, 'close');
  return { opens, closes };
}
function bs(opens: Map<string, Price>, closes: Map<string, Price>): CompositeBarSource {
  return { open: (t, s) => opens.get(MapBarSource.key(t, s)) ?? null,
           close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null };
}

if (import.meta.main) {
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const corpus = await loadCorpus(cal);
  const { opens, closes } = await loadBars();
  const bars = bs(opens, closes);
  const res = runOrchestrator({
    variantId: '1x-const', sessions, calendar: cal, corpusByEntrySession: corpus,
    cellMap, bars, startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD,
    budgets: { k: 5, shortDailyBudget: 5 },
    walletCapFractions: { long: 0.90, short: 0.10 },
    haircutMode: 'study', clock: new FixedClock(1_704_000_000_000),
    permitExitDegradation: true, disableShortAdmits: true,
  });
  if (!res.ok) throw new Error(`halted at ${res.sessionDate}: ${res.detail}`);
  // Emit YYYY-MM: monthly_return_pct
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