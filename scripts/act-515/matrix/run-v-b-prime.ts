// ACT-515 R1 · V-B′ RECEIPT — CORRECTED-CAPS RE-RUN (post-multiplier notional).
//
// Fixes the V-B geometry-honesty gap surfaced in run-variants-bd receipt: the
// prior V-B hook (`slotMultiplierByTier`) multiplied SHARES after admit, so
// the reconstructor's cap arithmetic saw 1× slot notional while the book
// carried 2× exposure — a book that a production runner could not produce.
//
// V-B′ uses the new `preAdmitSlotMultiplierByTier` hook: the T1 ×2 lands on
// the candidate BEFORE runAdmit, so allocation-cap arithmetic AND cash entry
// both see 2× notional, AND the admitted share count is 2× via
// floor(slotNotional / entryPrice). Enforcement asserted by reconstructor test
// `V-B′ — preAdmit T1 ×2 halves admit count under tight allocation cap`.
//
// Sealed inputs: reuses turn2b cache. Zero fetch. Zero kernel edit.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD, type SizingVariantId } from '../kernel/size.ts';
import { runOrchestrator, type CompositeBarSource } from './orchestrator.ts';
import { entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup } from './reconstructor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const CACHE = 'scripts/act-515/matrix/cache/';
const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WSTART: SessionDate = '2022-06-29';
const WEND: SessionDate = '2026-07-10';
const WALLET_CAPS = { long: 0.90, short: 0.10 };
const BUDGETS = { k: 5, shortDailyBudget: 5 };
const CLOCK_MS = 1_704_000_000_000;

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
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
async function loadCorpus(calendar: ArraySessionCalendar): Promise<Map<SessionDate, CorpusCandidateRow[]>> {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  for (const y of YEARS) {
    for (const l of await readLines(`${CACHE}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l);
      const off = entryOffsetForSideTier(s.side, s.tier);
      const es = calendar.sessionAfter(s.session, off);
      if (es === null || es < WSTART || es > WEND) continue;
      const toN = (x: string | null) => x === null ? null : (Number.isFinite(Number(x)) ? Number(x) : null);
      const row: CorpusCandidateRow = {
        eventId: s.event_id, ticker: s.ticker, side: s.side, eventDate: s.session,
        windowDays: s.window_days, momentumQuintile: s.momentum_quintile,
        drawdownBucket: s.drawdown_bucket, daysToNearestEarnings: s.days_to_nearest_earnings,
        excessW1: toN(s.excess_w1), excessW2: toN(s.excess_w2), excessW3: toN(s.excess_w3),
        excessW4: toN(s.excess_w4), excessW5: toN(s.excess_w5),
      };
      const arr = bySession.get(es); if (arr) arr.push(row); else bySession.set(es, [row]);
    }
  }
  return bySession;
}
async function loadBars(): Promise<CompositeBarSource> {
  const opens = new Map<string, Price>(); const closes = new Map<string, Price>();
  const rd = async (p: string, m: Map<string, Price>, field: 'open' | 'close') => {
    for (const l of await readLines(p)) {
      const r = JSON.parse(l); const v = r[field];
      if (v === null || v === undefined) continue;
      const n = Number(v); if (!Number.isFinite(n) || n <= 0) continue;
      const k = MapBarSource.key(r.ticker, r.trade_date);
      if (!m.has(k)) m.set(k, price(n));
    }
  };
  await rd(`${CACHE}bars-pairs.jsonl`, opens, 'open');
  await rd(`${CACHE}bars-windows-delta.jsonl`, opens, 'open');
  for (const y of YEARS) await rd(`${CACHE}bars-windows-${y}.jsonl`, closes, 'close');
  await rd(`${CACHE}bars-windows-delta.jsonl`, closes, 'close');
  return {
    open: (t, s) => opens.get(MapBarSource.key(t, s)) ?? null,
    close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null,
  };
}

function fmtUsd(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(x: number): string { return `${(x*100).toFixed(2)}%`; }

function eligibility(sum: {
  totalReturnPct: number; drawdown: { maxDdPct: number }; worstCalendarYearReturnPct: number | null;
}, sessions: number, lots: number): { pass: boolean; parts: string[]; cagr: number } {
  const years = sessions / 252;
  const cagr = Math.pow(1 + sum.totalReturnPct, 1 / years) - 1;
  const parts = [
    `cagr=${fmtPct(cagr)} ≥ 15%: ${cagr >= 0.15}`,
    `max-dd=${fmtPct(sum.drawdown.maxDdPct)} ≤ 1.5×cagr=${fmtPct(1.5*cagr)}: ${sum.drawdown.maxDdPct <= 1.5*cagr}`,
    `worst-year=${sum.worstCalendarYearReturnPct === null ? 'n/a' : fmtPct(sum.worstCalendarYearReturnPct)} > -5%: ${sum.worstCalendarYearReturnPct !== null && sum.worstCalendarYearReturnPct > -0.05}`,
    `lots=${lots} ≥ 800: ${lots >= 800}`,
  ];
  const pass = cagr >= 0.15
    && sum.drawdown.maxDdPct <= 1.5*cagr
    && (sum.worstCalendarYearReturnPct !== null && sum.worstCalendarYearReturnPct > -0.05)
    && lots >= 800;
  return { pass, parts, cagr };
}

if (import.meta.main) {
  console.log('# ACT-515 R1 · V-B′ RECEIPT — CORRECTED-CAPS RE-RUN');
  console.log('');
  console.log(`**SELECT now();** → ${new Date().toISOString()}`);
  console.log('');
  console.log('**Spec:** default variant `2x-const` (matches V-B rail — the ×2 is on T1 slots,');
  console.log('NOT on leverage). `preAdmitSlotMultiplierByTier = {T1: 2}` — cap arithmetic +');
  console.log('cash entry + share count all see the ×2 ticket. Test proof:');
  console.log('`reconstructor_test.ts::V-B′ — preAdmit T1 ×2 halves admit count under tight allocation cap`.');
  console.log('');

  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const bs = await loadBars();
  const corpus = await loadCorpus(cal);
  const clock = new FixedClock(CLOCK_MS);

  const spec: { id: string; base: SizingVariantId } = { id: 'V-B′ T1-priority ×2 (post-multiplier caps)', base: '2x-const' };

  const res = runOrchestrator({
    variantId: spec.base, sessions, calendar: cal,
    corpusByEntrySession: corpus, cellMap, bars: bs,
    startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD, budgets: BUDGETS,
    walletCapFractions: WALLET_CAPS, haircutMode: 'study', clock,
    permitExitDegradation: true,
    preAdmitSlotMultiplierByTier: { T1: 2 },
  });
  if (!res.ok) {
    console.log(`RUN HALTED at ${res.sessionDate} — refusal=${res.refusal}: ${res.detail}`);
    Deno.exit(1);
  }
  const t = res.telemetry, sum = res.summary;
  const last = res.rows[res.rows.length - 1];

  console.log('## Verdict row');
  console.log('');
  console.log('| metric | value |');
  console.log('|---|---|');
  console.log(`| starting_equity | ${fmtUsd(sum.startingEquityUsd as number)} |`);
  console.log(`| ending_equity | ${fmtUsd(sum.endingEquityUsd as number)} |`);
  console.log(`| total_return | ${fmtPct(sum.totalReturnPct)} |`);
  console.log(`| max_drawdown | ${fmtPct(sum.drawdown.maxDdPct)} |`);
  console.log(`| dd_dates | ${sum.drawdown.peakDate} / ${sum.drawdown.troughDate} / ${sum.drawdown.recoveryDate ?? 'n/a'} |`);
  console.log(`| worst_year | ${sum.worstCalendarYear ?? 'n/a'} (${sum.worstCalendarYearReturnPct === null ? 'n/a' : fmtPct(sum.worstCalendarYearReturnPct)}) |`);
  console.log(`| cumulative_carry | ${fmtUsd(sum.cumulativeCarryUsd as number)} |`);
  console.log(`| admits | TOTAL=${t.totalAdmits} LONG=${t.totalAdmitsLong} SHORT=${t.totalAdmitsShort} |`);
  console.log(`| peak_concurrent | LONG=${t.maxConcurrentLongLots} SHORT=${t.maxConcurrentShortLots} |`);
  console.log('');
  console.log('### Cap telemetry');
  console.log(`refusals: allocation_cap=${t.allocationCapRefusalsTotal} position_already_open=${t.positionAlreadyOpenTotal} daily_budget=${t.dailyBudgetReachedTotal} short_daily=${t.shortDailyBudgetReachedTotal}`);
  console.log(`typed skips: exit_price_unavailable=${t.exitPriceUnavailableSkips.length} exit_calendar_exhausted=${t.exitCalendarExhaustedSkips.length}`);

  const startC = Math.round(KERNEL_CONST_BASE_EQUITY_USD * 100);
  const endC = Math.round((last.equityUsd as number) * 100);
  const realizedC = Math.round((t.totalRealizedUsd as number) * 100);
  const carryC = Math.round((sum.cumulativeCarryUsd as number) * 100);
  const unrealC = Math.round((last.unrealizedTotalUsd as number) * 100);
  const pred = startC + realizedC - carryC + unrealC;
  const drift = endC - pred;
  const env = t.totalAdmits + Math.max(0, last.openLots);
  console.log(`identity: Δ=${drift}c envelope=${env}c → ${Math.abs(drift) <= env ? 'WITHIN' : 'OUTSIDE'}`);

  const elig = eligibility(sum, res.rows.length, t.totalAdmits);
  console.log('');
  console.log('## Eligibility (cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800)');
  for (const p of elig.parts) console.log(`- ${p}`);
  console.log('');
  if (elig.pass) {
    console.log('**VERDICT: DECISION-ELIGIBLE** — V-B′ is the first row to clear the four-clause grammar.');
    console.log('');
    console.log('_V-B″ (T1 ×1.75) filed but NOT executed — no tuning-fallback needed; V-B′ passes clean._');
  } else {
    console.log('**VERDICT: TEXTURE (fails ≥1 clause)** — V-B′ carries the honest cap geometry but does not clear the grammar.');
    console.log('');
    console.log('**PRE-REGISTERED V-B″ CHARTER (armed):** T1 ×1.75 tuning fallback.');
    console.log('- Same `preAdmitSlotMultiplierByTier` hook, `{T1: 1.75}` (kernel enforces Math.floor');
    console.log('  ⇒ effective multiplier 1×; requires kernel change to accept fractional or, cheaper,');
    console.log('  a per-tier slot notional override — a bounded orchestrator additive change).');
    console.log('- Trigger: only if the V-B′ DD miss above is narrow (≤ 3pp above 1.5×cagr).');
    console.log(`- V-B′ observed cagr=${fmtPct(elig.cagr)} vs dd=${fmtPct(sum.drawdown.maxDdPct)} → ` +
      `slack = ${fmtPct(sum.drawdown.maxDdPct - 1.5*elig.cagr)} above 1.5×cagr. ` +
      `V-B″ ${sum.drawdown.maxDdPct - 1.5*elig.cagr <= 0.03 ? 'ARM' : 'HOLD — miss is not narrow'}.`);
  }
}