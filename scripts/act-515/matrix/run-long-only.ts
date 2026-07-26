// ACT-515 CAPSTONE (2026-07-26) — LONG-ONLY MICRO-RECEIPT RUNNER.
//
// Hypothesis under test: with SHORT admits disabled at the reconstructor
// input (`disableShortAdmits: true` — smallest additive input flag; test
// pinned in reconstructor_test.ts::"LONG-ONLY — disableShortAdmits refuses
// every SHORT candidate; LONG unaffected"), the 1x-const config settles
// at ≈ +37% total return with a similar drawdown envelope to the R1
// baseline (+35.14% / 11.86% DD). Prints ONE verdict row to feed the
// capstone table.
//
// SCOPE FENCE: reuses run-r1-receipts loaders + orchestrator invocation
// pattern; zero kernel edits. haircutMode='study' with ledger-foot
// envelope assertion.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import {
  runOrchestrator, type CompositeBarSource,
} from './orchestrator.ts';
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
  out.sort();
  return out;
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
  let total = 0, off = 0; const bySide = { long: 0, short: 0 };
  const toN = (x: string | null): number | null => {
    if (x === null) return null;
    const n = Number(x); return Number.isFinite(n) ? n : null;
  };
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l); total += 1; bySide[s.side] += 1;
      const offset = entryOffsetForSideTier(s.side, s.tier);
      const es = cal.sessionAfter(s.session, offset);
      if (es === null || es < WINDOW_START || es > WINDOW_END) { off += 1; continue; }
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
  return { bySession, total, bySide, off };
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

function fmtUsd(n: number): string {
  const s = n < 0 ? '-' : ''; const a = Math.abs(n);
  return `${s}$${a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}
function fmtPct(x: number): string { return `${(x*100).toFixed(2)}%`; }
function fmtInt(n: number): string { return n.toLocaleString('en-US'); }

export async function runLongOnly(): Promise<{ ok: boolean }> {
  console.log('ACT-515 CAPSTONE — LONG-ONLY MICRO-RECEIPT (1x-const, disableShortAdmits=true)');
  console.log(`FixedClock=${CLOCK_MS}ms  window=${WINDOW_START}..${WINDOW_END}`);
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const bucket = await loadSlate(cal);
  const bars = await loadBars();
  const clock = new FixedClock(CLOCK_MS);
  console.log(`Loaded: sessions=${sessions.length}  slate=${bucket.total} (L ${bucket.bySide.long} / S ${bucket.bySide.short})  carriers=${bucket.bySession.size}  off_cal=${bucket.off}`);

  const startEq = KERNEL_CONST_BASE_EQUITY_USD;
  const res = runOrchestrator({
    variantId: '1x-const', sessions, calendar: cal,
    corpusByEntrySession: bucket.bySession, cellMap, bars,
    startingEquityUsd: startEq, budgets: BUDGETS,
    walletCapFractions: WALLET_CAPS, haircutMode: 'study',
    clock, permitExitDegradation: true,
    disableShortAdmits: true,
  });

  console.log('');
  console.log(`SELECT now();  →  ${new Date().toISOString()}`);
  if (!res.ok) {
    console.log(`HALTED at ${res.sessionDate}  refusal=${res.refusal}  detail=${res.detail}`);
    return { ok: false };
  }
  const rows = res.rows; const t = res.telemetry; const sum = res.summary;
  const last = rows[rows.length - 1];
  const startCents = Math.round(startEq * 100);
  const endCents = Math.round((last.equityUsd as number) * 100);
  const sumRealCents = Math.round((t.totalRealizedUsd as number) * 100);
  const carryCents = Math.round((sum.cumulativeCarryUsd as number) * 100);
  const unrealCents = Math.round((last.unrealizedTotalUsd as number) * 100);
  const predicted = startCents + sumRealCents - carryCents + unrealCents;
  const drift = endCents - predicted;
  const envelope = t.totalAdmits + Math.max(0, last.openLots);
  const within = Math.abs(drift) <= envelope;

  console.log('');
  console.log('── INVOCATION + COUNTS ────────────────────────────────────────────');
  console.log(`  admits: TOTAL=${fmtInt(t.totalAdmits)}  LONG=${fmtInt(t.totalAdmitsLong)}  SHORT=${fmtInt(t.totalAdmitsShort)}  (SHORT expected 0)`);
  console.log(`  refusals: allocation_cap=${fmtInt(t.allocationCapRefusalsTotal)}  daily_budget=${fmtInt(t.dailyBudgetReachedTotal)}  short_daily_budget=${fmtInt(t.shortDailyBudgetReachedTotal)}`);
  console.log(`  max_concurrent: LONG=${fmtInt(t.maxConcurrentLongLots)}  SHORT=${fmtInt(t.maxConcurrentShortLots)}`);
  console.log(`  exit_price_unavailable=${t.exitPriceUnavailableSkips.length}   exit_calendar_exhausted=${t.exitCalendarExhaustedSkips.length}`);

  console.log('');
  console.log('── VERDICT ROW ────────────────────────────────────────────────────');
  console.log(`  starting_equity          = ${fmtUsd(sum.startingEquityUsd as number)}`);
  console.log(`  ending_equity            = ${fmtUsd(sum.endingEquityUsd as number)}`);
  console.log(`  total_return_pct         = ${fmtPct(sum.totalReturnPct)}`);
  console.log(`  cumulative_carry_usd     = ${fmtUsd(sum.cumulativeCarryUsd as number)}`);
  console.log(`  worst_calendar_year      = ${sum.worstCalendarYear ?? 'n/a'}`);
  console.log(`  worst_calendar_year_ret  = ${sum.worstCalendarYearReturnPct === null ? 'n/a' : fmtPct(sum.worstCalendarYearReturnPct)}`);
  console.log(`  max_drawdown_pct         = ${fmtPct(sum.drawdown.maxDdPct)}`);
  console.log(`  dd_peak_date             = ${sum.drawdown.peakDate ?? 'n/a'}`);
  console.log(`  dd_trough_date           = ${sum.drawdown.troughDate ?? 'n/a'}`);
  console.log(`  dd_recovery_date         = ${sum.drawdown.recoveryDate ?? 'n/a'}`);

  console.log('');
  console.log('── TERMINAL IDENTITY (study envelope) ─────────────────────────────');
  console.log(`  start=${startCents}c  Σrealized=${sumRealCents}c  −carry=${carryCents}c  +unreal=${unrealCents}c  → predicted=${predicted}c`);
  console.log(`  actual=${endCents}c   Δ=${drift>=0?'+':''}${drift}c  envelope=${envelope}c → ${within ? 'WITHIN' : 'OUTSIDE'}`);
  return { ok: within };
}

if (import.meta.main) {
  const { ok } = await runLongOnly();
  if (!ok) Deno.exit(1);
}