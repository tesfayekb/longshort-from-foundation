// ACT-515 R1 — ATTRIBUTION (in-sample recovery analysis on sealed walk)
//
// Charter: decompose the realized-vs-studied bps/lot gap (~29 vs ~75 bps/lot)
// on the 1x-const walk. This is IN-SAMPLE recovery — the same corpus that
// generated the studied cells is being back-scored against them. Any
// out-of-sample claim requires a separate holdout charter.
//
// Buckets (all applied per-lot):
//   · calendar year        (from actualExitDate)
//   · tier                 (T1 / T2)
//   · side                 (long / short)
//   · slate-rank band      (1-5 / 6-15 / 16-25) — from slate_rank per lot
//   · top-10 cells by lot count (cell = side/band/window/mag/dd/exclusion)
//
// Studied baseline per lot = mean_fwd_return_5d from cellmap.jsonl for the
// lot's cell key. HOLDING-HORIZON ADJUSTMENT (D3, header):
//   studied_scaled = mean_fwd_return_5d × (actual_holding_sessions / 5)
// This aligns the studied 5-day horizon with the lot's realized hold length.
//
// SCOPE FENCE: readonly kernel imports; no fetches. Kernel-safe.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import { runOrchestrator, type CompositeBarSource } from './orchestrator.ts';
import { entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup } from './reconstructor.ts';
import { parseSlateLine, type SlateRow } from './turn2b/slate-row.ts';

const CACHE_DIR = 'scripts/act-515/matrix/cache/';
const SLATE_YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WINDOW_START: SessionDate = '2022-06-29';
const WINDOW_END:   SessionDate = '2026-07-10';
const WALLET_CAPS = { long: 0.90, short: 0.10 } as const;
const BUDGETS = { k: 5, shortDailyBudget: 5 } as const;
const RECEIPT_CLOCK_MS = 1_704_000_000_000;

async function readLines(path: string): Promise<string[]> {
  const t = await Deno.readTextFile(path);
  return t.split('\n').filter(l => l.length > 0);
}
async function loadCalendar(): Promise<SessionDate[]> {
  const out: SessionDate[] = [];
  for (const l of await readLines(`${CACHE_DIR}calendar.jsonl`)) {
    const r = JSON.parse(l) as { session: string };
    if (r.session >= WINDOW_START && r.session <= WINDOW_END) out.push(r.session);
  }
  out.sort();
  return out;
}
async function loadCellMap(): Promise<{
  lookup: CellMapLookup;
  raw: Array<{ key: string; side: string; band: string; window: number; mag: number; dd: number; excl: number; meanFwd5d: number }>;
}> {
  const m = new Map<string, number>();
  const raw: Array<{ key: string; side: string; band: string; window: number; mag: number; dd: number; excl: number; meanFwd5d: number }> = [];
  for (const l of await readLines(`${CACHE_DIR}cellmap.jsonl`)) {
    const r = JSON.parse(l) as Record<string, unknown>;
    const key = [r.side, r.band, Number(r.window_days), Number(r.momentum_quintile), Number(r.drawdown_bucket), Number(r.exclusion_width_days)].join('/');
    const mfwd = Number(r.mean_fwd_return_5d);
    m.set(key, mfwd);
    raw.push({ key, side: String(r.side), band: String(r.band), window: Number(r.window_days), mag: Number(r.momentum_quintile), dd: Number(r.drawdown_bucket), excl: Number(r.exclusion_width_days), meanFwd5d: mfwd });
  }
  const lookup: CellMapLookup = (k) => m.get(`${k.side}/${k.band}/${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}/${k.exclusionHorizonDays}`) ?? null;
  return { lookup, raw };
}

function slateToCorpus(s: SlateRow): CorpusCandidateRow {
  const toN = (x: string | null): number | null => { if (x === null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
  return {
    eventId: s.event_id, ticker: s.ticker, side: s.side, eventDate: s.session,
    windowDays: s.window_days, momentumQuintile: s.momentum_quintile,
    drawdownBucket: s.drawdown_bucket, daysToNearestEarnings: s.days_to_nearest_earnings,
    excessW1: toN(s.excess_w1), excessW2: toN(s.excess_w2), excessW3: toN(s.excess_w3),
    excessW4: toN(s.excess_w4), excessW5: toN(s.excess_w5),
  };
}

interface SlateMeta { slateRank: number; tier: 'T1'|'T2'; band: string; mag: number; dd: number; meanFwd5d: number; }

async function loadSlate(calendar: ArraySessionCalendar): Promise<{
  bySession: Map<SessionDate, CorpusCandidateRow[]>;
  metaByEventId: Map<number, SlateMeta>;
  totalRows: number;
}> {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  const metaByEventId = new Map<number, SlateMeta>();
  let totalRows = 0;
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l);
      totalRows += 1;
      metaByEventId.set(s.event_id, {
        slateRank: s.slate_rank, tier: s.tier, band: s.band,
        mag: s.momentum_quintile, dd: s.drawdown_bucket,
        meanFwd5d: Number(s.mean_fwd_return_5d),
      });
      const offset = entryOffsetForSideTier(s.side, s.tier);
      const entrySession = calendar.sessionAfter(s.session, offset);
      if (entrySession === null || entrySession < WINDOW_START || entrySession > WINDOW_END) continue;
      const row = slateToCorpus(s);
      const arr = bySession.get(entrySession);
      if (arr) arr.push(row); else bySession.set(entrySession, [row]);
    }
  }
  return { bySession, metaByEventId, totalRows };
}

async function loadOpens(): Promise<Map<string, Price>> {
  const m = new Map<string, Price>();
  const files = [`${CACHE_DIR}bars-pairs.jsonl`, `${CACHE_DIR}bars-windows-delta.jsonl`];
  for (const path of files) {
    for (const l of await readLines(path)) {
      const r = JSON.parse(l) as { ticker: string; trade_date: string; open: string | null };
      if (r.open === null) continue;
      const n = Number(r.open);
      if (!Number.isFinite(n) || n <= 0) continue;
      const k = MapBarSource.key(r.ticker, r.trade_date);
      if (!m.has(k)) m.set(k, price(n));
    }
  }
  return m;
}
async function loadCloses(): Promise<Map<string, Price>> {
  const m = new Map<string, Price>();
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}bars-windows-${y}.jsonl`)) {
      const r = JSON.parse(l) as { ticker: string; trade_date: string; close: string | null };
      if (r.close === null) continue;
      const n = Number(r.close); if (!Number.isFinite(n) || n <= 0) continue;
      m.set(MapBarSource.key(r.ticker, r.trade_date), price(n));
    }
  }
  for (const l of await readLines(`${CACHE_DIR}bars-windows-delta.jsonl`)) {
    const r = JSON.parse(l) as { ticker: string; trade_date: string; close: string | null };
    if (r.close === null) continue;
    const n = Number(r.close); if (!Number.isFinite(n) || n <= 0) continue;
    const k = MapBarSource.key(r.ticker, r.trade_date);
    if (!m.has(k)) m.set(k, price(n));
  }
  return m;
}

function rankBand(r: number): '1-5' | '6-15' | '16-25' {
  if (r <= 5) return '1-5';
  if (r <= 15) return '6-15';
  return '16-25';
}

interface EnrichedLot {
  eventId: number; ticker: string; side: 'long' | 'short'; tier: 'T1' | 'T2';
  entryDate: SessionDate; exitDate: SessionDate; holdingSessions: number;
  notionalUsd: number; realizedUsd: number;
  realizedBps: number;              // realizedUsd / notionalUsd × 10000, signed by lot P&L
  studiedMeanFwd5d: number;         // signed studied mean (positive-for-LONG framing)
  studiedScaledBps: number;         // × (hold / 5), aligned so positive = "predicted to make money on this side"
  year: number; slateRank: number; rankBand: '1-5' | '6-15' | '16-25';
  band: string; mag: number; dd: number;
  cellKey: string;                  // side|band|mag|dd (top-10 cells basis)
}

function meanOf(xs: number[]): number { if (xs.length === 0) return 0; let s = 0; for (const x of xs) s += x; return s / xs.length; }

function fmtBps(x: number): string { const s = x >= 0 ? '+' : ''; return `${s}${x.toFixed(1)}`; }
function fmtInt(n: number): string { return n.toLocaleString('en-US'); }

async function main(): Promise<void> {
  const now = new Date().toISOString();
  const sessions = await loadCalendar();
  const calendar = new ArraySessionCalendar(sessions);
  const { lookup: cellMap } = await loadCellMap();
  const { bySession, metaByEventId, totalRows } = await loadSlate(calendar);
  const opens = await loadOpens();
  const closes = await loadCloses();
  const bars: CompositeBarSource = {
    open:  (t, s) => opens.get(MapBarSource.key(t, s))  ?? null,
    close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null,
  };
  const clock = new FixedClock(RECEIPT_CLOCK_MS);

  const res = runOrchestrator({
    variantId: '1x-const', sessions, calendar,
    corpusByEntrySession: bySession, cellMap, bars,
    startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD,
    budgets: BUDGETS, walletCapFractions: WALLET_CAPS,
    haircutMode: 'study', clock, permitExitDegradation: true,
  });
  if (!res.ok) { console.error(`STOP: orchestrator refused at ${res.sessionDate}: ${res.refusal}`); Deno.exit(1); }

  // Enrich per-lot with slate metadata.
  const enriched: EnrichedLot[] = [];
  let missingMeta = 0;
  for (const l of res.telemetry.perLot) {
    const meta = metaByEventId.get(l.eventId);
    if (!meta) { missingMeta += 1; continue; }
    const realizedBps = l.notionalUsd > 0 ? (l.realizedUsd / l.notionalUsd) * 10_000 : 0;
    // Studied mean_fwd_return_5d is signed such that positive = LONG price↑; for
    // SHORT lots we flip the sign so "studied edge on this trade" is comparable
    // in the same "positive = made money" frame as realizedBps for that side.
    // SHORT realizedUsd is already signed by the P&L path.
    const studiedForSide = l.side === 'long' ? meta.meanFwd5d : -meta.meanFwd5d;
    const holdRatio = l.holdingSessions <= 0 ? 1 : (l.holdingSessions / 5);
    const studiedScaledBps = studiedForSide * holdRatio * 10_000;
    enriched.push({
      eventId: l.eventId, ticker: l.ticker, side: l.side, tier: l.tier,
      entryDate: l.entryDate, exitDate: l.actualExitDate, holdingSessions: l.holdingSessions,
      notionalUsd: l.notionalUsd, realizedUsd: l.realizedUsd, realizedBps,
      studiedMeanFwd5d: meta.meanFwd5d, studiedScaledBps,
      year: Number(l.actualExitDate.slice(0, 4)),
      slateRank: meta.slateRank, rankBand: rankBand(meta.slateRank),
      band: meta.band, mag: meta.mag, dd: meta.dd,
      cellKey: `${l.side}|${meta.band}|mag${meta.mag}|dd${meta.dd}`,
    });
  }

  // Write per-lot JSONL sidecar.
  await Deno.mkdir('scripts/act-515/matrix/cache', { recursive: true });
  const lotsPath = `${CACHE_DIR}lots-1x-const.jsonl`;
  const enc = new TextEncoder();
  const f = await Deno.open(lotsPath, { create: true, write: true, truncate: true });
  for (const e of enriched) await f.write(enc.encode(JSON.stringify(e) + '\n'));
  f.close();

  // Aggregators.
  const groupBy = <K extends string>(keyFn: (e: EnrichedLot) => K) => {
    const g = new Map<K, EnrichedLot[]>();
    for (const e of enriched) { const k = keyFn(e); const a = g.get(k); if (a) a.push(e); else g.set(k, [e]); }
    return g;
  };

  // OVERALL
  const realizedAll = meanOf(enriched.map(e => e.realizedBps));
  const studiedAll = meanOf(enriched.map(e => e.studiedScaledBps));

  // BY YEAR × SIDE
  const byYearSide = groupBy(e => `${e.year}|${e.side}` as string);
  // BY TIER × SIDE
  const byTierSide = groupBy(e => `${e.tier}|${e.side}` as string);
  // BY RANK BAND × SIDE
  const byRankSide = groupBy(e => `${e.rankBand}|${e.side}` as string);
  // BY CELL (top-10 by lot count)
  const byCell = groupBy(e => e.cellKey);
  const topCells = [...byCell.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);

  // Where did the edge go? Diagnose largest gap contributor.
  const gapBps = realizedAll - studiedAll;
  const yearGapContribs = [...byYearSide.entries()].map(([k, arr]) => {
    const gap = meanOf(arr.map(e => e.realizedBps - e.studiedScaledBps));
    return { k, n: arr.length, gap, contribution: (arr.length / enriched.length) * gap };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const rankGapContribs = [...byRankSide.entries()].map(([k, arr]) => {
    const gap = meanOf(arr.map(e => e.realizedBps - e.studiedScaledBps));
    return { k, n: arr.length, gap, contribution: (arr.length / enriched.length) * gap };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const cellGapContribs = topCells.map(([k, arr]) => {
    const gap = meanOf(arr.map(e => e.realizedBps - e.studiedScaledBps));
    return { k, n: arr.length, gap, contribution: (arr.length / enriched.length) * gap };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Diagnose the dominant driver.
  const drivers: string[] = [];
  if (Math.abs(yearGapContribs[0]?.contribution ?? 0) >= Math.abs(rankGapContribs[0]?.contribution ?? 0)
   && Math.abs(yearGapContribs[0]?.contribution ?? 0) >= Math.abs(cellGapContribs[0]?.contribution ?? 0)) {
    drivers.push('regime concentration');
  }
  if (Math.abs(rankGapContribs[0]?.contribution ?? 0) >= Math.abs(yearGapContribs[0]?.contribution ?? 0)
   && Math.abs(rankGapContribs[0]?.contribution ?? 0) >= Math.abs(cellGapContribs[0]?.contribution ?? 0)) {
    drivers.push('rank-depth dilution');
  }
  if (Math.abs(cellGapContribs[0]?.contribution ?? 0) >= Math.abs(yearGapContribs[0]?.contribution ?? 0)
   && Math.abs(cellGapContribs[0]?.contribution ?? 0) >= Math.abs(rankGapContribs[0]?.contribution ?? 0)) {
    drivers.push('specific-cell overstatement');
  }
  // Horizon-decay probe: mean realized/hold vs studied/5.
  const perDayRealized = meanOf(enriched.filter(e => e.holdingSessions > 0).map(e => e.realizedBps / e.holdingSessions));
  const perDayStudied  = meanOf(enriched.map(e => (e.studiedMeanFwd5d * (e.side === 'long' ? 1 : -1)) * 10_000 / 5));
  const horizonDecay = perDayStudied - perDayRealized;

  // Render markdown.
  const lines: string[] = [];
  lines.push(`# ACT-515 R1 · ATTRIBUTION — IN-SAMPLE RECOVERY (1x-const)`);
  lines.push('');
  lines.push(`**SELECT now();** → ${now}`);
  lines.push(`**Header — IN-SAMPLE:** this decomposition scores the same corpus that`);
  lines.push(`generated the studied cell means against those cell means on the sealed`);
  lines.push(`walk. It is a recovery analysis (does the frozen matrix produce the`);
  lines.push(`predicted bps/lot when the live orchestrator drives it?), NOT an`);
  lines.push(`out-of-sample edge test.`);
  lines.push('');
  lines.push(`**Holding-horizon adjustment:** studied mean_fwd_return_5d is a 5-session`);
  lines.push(`forward-return in the study. Per-lot studied baseline is scaled by`);
  lines.push(`\`× (actual_holding_sessions / 5)\` so both terms cover the same window.`);
  lines.push(`Actual holds vary by tier (LONG T2 anchor / SHORT tier convention per`);
  lines.push(`\`kernel/exit.ts::EXIT_ANCHOR_BY_SIDE_TIER\`).`);
  lines.push('');
  lines.push(`**Slate-rank source:** \`slate_rank\` column of sealed slate-YYYY.jsonl`);
  lines.push(`(top-N=25 per event_date × side, per overshoot-matrix-export). Banding`);
  lines.push(`= 1-5 / 6-15 / 16-25 per operator chain.`);
  lines.push('');
  lines.push(`**Sample:** ${fmtInt(enriched.length)} lots enriched (missing_slate_meta=${missingMeta})`);
  lines.push(`from ${fmtInt(totalRows)} slate rows. Cell taxonomy \`side | band | mag | dd\`.`);
  lines.push('');
  lines.push(`## ONE-LINE ANSWER`);
  lines.push('');
  lines.push(`Overall realized = **${fmtBps(realizedAll)} bps/lot** vs studied_scaled = **${fmtBps(studiedAll)} bps/lot** → gap = **${fmtBps(gapBps)} bps/lot**. Dominant driver (largest absolute contribution to gap): **${drivers[0] ?? 'mixed'}**. Horizon-decay probe = ${fmtBps(horizonDecay)} bps/day (studied_per_day − realized_per_day; positive = studied over-predicts per-day return).`);
  lines.push('');
  lines.push(`## Overall`);
  lines.push('');
  lines.push(`| metric | value |`);
  lines.push(`|---|---|`);
  lines.push(`| lots (perLot) | ${fmtInt(enriched.length)} |`);
  lines.push(`| realized bps/lot (mean) | ${fmtBps(realizedAll)} |`);
  lines.push(`| studied_scaled bps/lot (mean) | ${fmtBps(studiedAll)} |`);
  lines.push(`| gap (realized − studied_scaled) | ${fmtBps(gapBps)} |`);
  lines.push(`| studied_per_day − realized_per_day | ${fmtBps(horizonDecay)} bps/day |`);
  lines.push('');
  lines.push(`## By calendar year × side`);
  lines.push('');
  lines.push(`| year | side | n | realized | studied_scaled | gap | share×gap (contrib) |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const yrKeys = [...byYearSide.keys()].sort();
  for (const k of yrKeys) {
    const arr = byYearSide.get(k)!;
    const [yr, side] = k.split('|');
    const r = meanOf(arr.map(e => e.realizedBps));
    const s = meanOf(arr.map(e => e.studiedScaledBps));
    const g = r - s;
    const c = (arr.length / enriched.length) * g;
    lines.push(`| ${yr} | ${side} | ${fmtInt(arr.length)} | ${fmtBps(r)} | ${fmtBps(s)} | ${fmtBps(g)} | ${fmtBps(c)} |`);
  }
  lines.push('');
  lines.push(`## By tier × side`);
  lines.push('');
  lines.push(`| tier | side | n | realized | studied_scaled | gap |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const k of [...byTierSide.keys()].sort()) {
    const arr = byTierSide.get(k)!;
    const [tier, side] = k.split('|');
    const r = meanOf(arr.map(e => e.realizedBps));
    const s = meanOf(arr.map(e => e.studiedScaledBps));
    lines.push(`| ${tier} | ${side} | ${fmtInt(arr.length)} | ${fmtBps(r)} | ${fmtBps(s)} | ${fmtBps(r - s)} |`);
  }
  lines.push('');
  lines.push(`## By slate-rank band × side`);
  lines.push('');
  lines.push(`| band | side | n | realized | studied_scaled | gap | share×gap |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  const order: Record<string, number> = { '1-5': 0, '6-15': 1, '16-25': 2 };
  const rk = [...byRankSide.keys()].sort((a, b) => {
    const [ba, sa] = a.split('|'); const [bb, sb] = b.split('|');
    if (order[ba] !== order[bb]) return order[ba] - order[bb];
    return sa.localeCompare(sb);
  });
  for (const k of rk) {
    const arr = byRankSide.get(k)!;
    const [band, side] = k.split('|');
    const r = meanOf(arr.map(e => e.realizedBps));
    const s = meanOf(arr.map(e => e.studiedScaledBps));
    const g = r - s;
    const c = (arr.length / enriched.length) * g;
    lines.push(`| ${band} | ${side} | ${fmtInt(arr.length)} | ${fmtBps(r)} | ${fmtBps(s)} | ${fmtBps(g)} | ${fmtBps(c)} |`);
  }
  lines.push('');
  lines.push(`## Top-10 cells by lot count`);
  lines.push('');
  lines.push(`| # | cell (side\\|band\\|mag\\|dd) | n | realized | studied_scaled | gap | share×gap |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  let i = 1;
  for (const [k, arr] of topCells) {
    const r = meanOf(arr.map(e => e.realizedBps));
    const s = meanOf(arr.map(e => e.studiedScaledBps));
    const g = r - s;
    const c = (arr.length / enriched.length) * g;
    lines.push(`| ${i} | \`${k}\` | ${fmtInt(arr.length)} | ${fmtBps(r)} | ${fmtBps(s)} | ${fmtBps(g)} | ${fmtBps(c)} |`);
    i += 1;
  }
  lines.push('');
  lines.push(`## Gap contribution — largest absolute share×gap`);
  lines.push('');
  lines.push(`**By year×side (top 5):**`);
  for (const c of yearGapContribs.slice(0, 5)) lines.push(`  · ${c.k} — n=${fmtInt(c.n)} gap=${fmtBps(c.gap)} share×gap=${fmtBps(c.contribution)}`);
  lines.push('');
  lines.push(`**By rank×side (top 5):**`);
  for (const c of rankGapContribs.slice(0, 5)) lines.push(`  · ${c.k} — n=${fmtInt(c.n)} gap=${fmtBps(c.gap)} share×gap=${fmtBps(c.contribution)}`);
  lines.push('');
  lines.push(`**By cell (top 5 of top-10):**`);
  for (const c of cellGapContribs.slice(0, 5)) lines.push(`  · ${c.k} — n=${fmtInt(c.n)} gap=${fmtBps(c.gap)} share×gap=${fmtBps(c.contribution)}`);
  lines.push('');
  lines.push(`## Sidecar`);
  lines.push('');
  lines.push(`Per-lot JSONL: \`${lotsPath}\` (${fmtInt(enriched.length)} rows).`);
  lines.push('');

  await Deno.mkdir('scripts/act-515/matrix/receipts', { recursive: true });
  const path = 'scripts/act-515/matrix/receipts/R1-attribution.md';
  await Deno.writeTextFile(path, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\n[written] ${path}`);
  console.log(`[written] ${lotsPath}`);
}

if (import.meta.main) await main();