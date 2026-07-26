// ACT-515 R1 · Daily-equity emitter → Sharpe/Sortino/monthly matrix for the
// 3 R1 configs + SPY-BH, on sealed cache. TURN-3 deliverable.
//
// Runs the certified orchestrator with the same inputs as run-r1-receipts.ts
// then computes daily log-returns → Sharpe (rf=0), Sortino (mar=0), and a
// monthly-return matrix (year × month) for each config.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD, type SizingVariantId } from '../kernel/size.ts';
import { runOrchestrator, type CompositeBarSource, type OrchestratorRow } from './orchestrator.ts';
import { entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup } from './reconstructor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const CACHE = 'scripts/act-515/matrix/cache/';
const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WSTART: SessionDate = '2022-06-29';
const WEND: SessionDate = '2026-07-10';
const WALLET_CAPS = { long: 0.90, short: 0.10 };
const BUDGETS = { k: 5, shortDailyBudget: 5 };

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
}

function fmtPct(x: number): string { return `${(x*100).toFixed(2)}%`; }

// Sharpe/Sortino over daily log-returns, annualized 252.
function stats(equity: number[]): { sharpe: number; sortino: number; nDays: number } {
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    if (equity[i-1] > 0 && equity[i] > 0) rets.push(Math.log(equity[i] / equity[i-1]));
  }
  if (rets.length < 2) return { sharpe: 0, sortino: 0, nDays: rets.length };
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(varr);
  const downRets = rets.filter(r => r < 0);
  const downVar = downRets.length > 0
    ? downRets.reduce((a, b) => a + b * b, 0) / downRets.length : 0;
  const downSd = Math.sqrt(downVar);
  const ann = Math.sqrt(252);
  return {
    sharpe: sd > 0 ? (mean / sd) * ann : 0,
    sortino: downSd > 0 ? (mean / downSd) * ann : 0,
    nDays: rets.length,
  };
}

// Monthly return matrix. Buckets by YYYY-MM, uses last-of-month equity.
function monthlyMatrix(dates: string[], equity: number[]): Map<string, Map<string, number>> {
  const eom = new Map<string, number>(); // ym → equity at last session of month
  for (let i = 0; i < dates.length; i++) eom.set(dates[i].slice(0, 7), equity[i]);
  const sortedKeys = Array.from(eom.keys()).sort();
  // For each month, return = eom[m] / eom[prev_m] - 1 (or startingEquity for first)
  const out = new Map<string, Map<string, number>>(); // year → month → ret
  let prevEq = KERNEL_CONST_BASE_EQUITY_USD;
  for (const ym of sortedKeys) {
    const [y, m] = ym.split('-');
    const eq = eom.get(ym)!;
    const ret = eq / prevEq - 1;
    if (!out.has(y)) out.set(y, new Map());
    out.get(y)!.set(m, ret);
    prevEq = eq;
  }
  return out;
}

function printMonthlyMatrix(name: string, mtx: Map<string, Map<string, number>>): void {
  console.log(`### ${name} — monthly returns (%)`);
  console.log('');
  console.log('| year | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | YTD |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const years = Array.from(mtx.keys()).sort();
  for (const y of years) {
    const yr = mtx.get(y)!;
    const cells: string[] = [];
    let ytd = 1;
    for (let mi = 1; mi <= 12; mi++) {
      const mk = String(mi).padStart(2, '0');
      const v = yr.get(mk);
      if (v === undefined) cells.push('–');
      else { cells.push((v * 100).toFixed(2)); ytd *= 1 + v; }
    }
    console.log(`| ${y} | ${cells.join(' | ')} | ${((ytd - 1) * 100).toFixed(2)} |`);
  }
  console.log('');
}

async function loadCalendar(): Promise<SessionDate[]> {
  const out: SessionDate[] = [];
  for (const l of await readLines(`${CACHE}calendar.jsonl`)) {
    const r = JSON.parse(l);
    if (r.session >= WSTART && r.session <= WEND) out.push(r.session);
  }
  return out.sort();
}
async function loadCellMap(): Promise<CellMapLookup> {
  const m = new Map<string, number>();
  for (const l of await readLines(`${CACHE}cellmap.jsonl`)) {
    const r = JSON.parse(l);
    const k = [r.side, r.band, +r.window_days, +r.momentum_quintile, +r.drawdown_bucket, +r.exclusion_width_days].join('/');
    m.set(k, Number(r.mean_fwd_return_5d));
  }
  return (k) => m.get(`${k.side}/${k.band}/${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}/${k.exclusionHorizonDays}`) ?? null;
}
async function loadCorpus(cal: ArraySessionCalendar): Promise<Map<SessionDate, CorpusCandidateRow[]>> {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  for (const y of YEARS) {
    for (const l of await readLines(`${CACHE}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l);
      const off = entryOffsetForSideTier(s.side, s.tier);
      const es = cal.sessionAfter(s.session, off);
      if (es === null || es < WSTART || es > WEND) continue;
      const toN = (x: string | null) => { if (x === null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
      const row: CorpusCandidateRow = {
        eventId: s.event_id, ticker: s.ticker, side: s.side, eventDate: s.session,
        windowDays: s.window_days, momentumQuintile: s.momentum_quintile,
        drawdownBucket: s.drawdown_bucket, daysToNearestEarnings: s.days_to_nearest_earnings,
        excessW1: toN(s.excess_w1), excessW2: toN(s.excess_w2), excessW3: toN(s.excess_w3),
        excessW4: toN(s.excess_w4), excessW5: toN(s.excess_w5),
      };
      const arr = bySession.get(es);
      if (arr) arr.push(row); else bySession.set(es, [row]);
    }
  }
  return bySession;
}
async function loadBars() {
  const opens = new Map<string, Price>(), closes = new Map<string, Price>();
  const readP = async (p: string, m: Map<string, Price>, f: 'open'|'close') => {
    for (const l of await readLines(p)) {
      const r = JSON.parse(l); const v = r[f]; if (v === null) continue;
      const n = Number(v); if (!Number.isFinite(n) || n <= 0) continue;
      const k = MapBarSource.key(r.ticker, r.trade_date);
      if (!m.has(k)) m.set(k, price(n));
    }
  };
  await readP(`${CACHE}bars-pairs.jsonl`, opens, 'open');
  await readP(`${CACHE}bars-windows-delta.jsonl`, opens, 'open');
  for (const y of YEARS) await readP(`${CACHE}bars-windows-${y}.jsonl`, closes, 'close');
  await readP(`${CACHE}bars-windows-delta.jsonl`, closes, 'close');
  return { opens, closes };
}
function bs(opens: Map<string, Price>, closes: Map<string, Price>): CompositeBarSource {
  return {
    open: (t, s) => opens.get(MapBarSource.key(t, s)) ?? null,
    close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null,
  };
}

async function runOne(vid: SizingVariantId, sessions: SessionDate[], cal: ArraySessionCalendar,
  corpus: Map<SessionDate, CorpusCandidateRow[]>, cellMap: CellMapLookup,
  bars: CompositeBarSource): Promise<{ rows: OrchestratorRow[] }> {
  const res = runOrchestrator({
    variantId: vid, sessions, calendar: cal, corpusByEntrySession: corpus,
    cellMap, bars, startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD,
    budgets: BUDGETS, walletCapFractions: WALLET_CAPS, haircutMode: 'study',
    clock: new FixedClock(1_704_000_000_000), permitExitDegradation: true,
  });
  if (!res.ok) throw new Error(`${vid} halted at ${res.sessionDate}: ${res.detail}`);
  return { rows: res.rows };
}

if (import.meta.main) {
  console.log('# ACT-515 R1 · TURN-3 — Daily-equity Sharpe/Sortino + Monthly matrices + SPY-BH footnote');
  console.log('');
  console.log(`**SELECT now();** → ${new Date().toISOString()}`);
  console.log('');
  console.log('## SPY-BH fairness footnote');
  console.log('');
  console.log('The sealed corpus window starts **2022-06-29** — a post-crash entry point');
  console.log('for SPY (SPY 2022-01-03 close ≈ $476.30 vs 2022-06-29 close $380.34). The');
  console.log('R1-spy-bh receipt CAGR of **18.66%** consequently understates the strategy');
  console.log('challenge because SPY had already absorbed 2022\'s H1 drawdown by our start.');
  console.log('');
  console.log('**Out-of-corpus context (labeled OOC — not part of the sealed comparison):**');
  console.log('SPY 2022-01-03 close $476.30 → 2026-07-10 close $754.95 = **58.51% total /**');
  console.log('**~10.83% CAGR over 4.52y**. This is the "peak-to-tape" SPY read that would');
  console.log('apply if the strategy had been forced to open its book at the 2022 peak.');
  console.log('Neither the strategy corpus nor the R1 walk cover 2022-01..2022-06 — so this');
  console.log('is context only, not a receipt row. The sealed benchmark remains 18.66% CAGR');
  console.log('over 2022-06-29..2026-07-10.');
  console.log('');
  console.log('## Daily-equity Sharpe/Sortino (rf=0, mar=0, annualized 252)');
  console.log('');
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const corpus = await loadCorpus(cal);
  const { opens, closes } = await loadBars();
  const bars = bs(opens, closes);

  const configs: SizingVariantId[] = ['1x-const', '2x-const', '2x-comp'];
  const emitted: Array<{ name: string; dates: string[]; equity: number[]; stats: ReturnType<typeof stats> }> = [];

  for (const vid of configs) {
    const { rows } = await runOne(vid, sessions, cal, corpus, cellMap, bars);
    const dates = rows.map(r => r.sessionDate);
    const equity = rows.map(r => r.equityUsd as number);
    emitted.push({ name: vid, dates, equity, stats: stats(equity) });
  }
  // SPY-BH daily equity
  const spy = new Map<string, number>();
  for (const l of await readLines(`${CACHE}spy.jsonl`)) {
    const r = JSON.parse(l) as { session?: string; trade_date?: string; close: string | number };
    const s = r.session ?? r.trade_date;
    if (!s) continue;
    if (s < WSTART || s > WEND) continue;
    const c = Number(r.close);
    if (Number.isFinite(c) && c > 0) spy.set(s, c);
  }
  const spyDates = Array.from(spy.keys()).sort();
  const spyStart = spy.get(spyDates[0])!;
  const spyEq = spyDates.map(d => KERNEL_CONST_BASE_EQUITY_USD * (spy.get(d)! / spyStart));
  emitted.push({ name: 'SPY-BH', dates: spyDates, equity: spyEq, stats: stats(spyEq) });

  console.log('| config | n_days | annualized Sharpe | annualized Sortino |');
  console.log('|---|---|---|---|');
  for (const e of emitted) {
    console.log(`| ${e.name} | ${e.stats.nDays} | ${e.stats.sharpe.toFixed(3)} | ${e.stats.sortino.toFixed(3)} |`);
  }
  console.log('');
  console.log('_Interpretation note: rf=0 assumption inflates absolute values relative to a T-bill-adjusted Sharpe; the RELATIVE ranking between configs is what carries signal here._');
  console.log('');
  console.log('## Monthly returns (%) by config');
  console.log('');
  for (const e of emitted) {
    printMonthlyMatrix(e.name, monthlyMatrix(e.dates, e.equity));
  }
}
