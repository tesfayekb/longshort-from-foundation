// ACT-515 R1 · TURN-1b — V-B / V-D VARIANT RECEIPTS.
//
// V-B: T1-priority, T1 slots ×2 (post-admit share doubling via the new
//      orchestrator hook `slotMultiplierByTier`). Default variant: 2x-const
//      (matches V-A base — the ×2 is on T1 slots, NOT on leverage).
//      CAVEAT: the reconstructor's cap-binding still sees 1× slot notionals;
//      the multiplier lands after cap arithmetic (documented in the hook).
//
// V-D: regime-gated 2×-comp with 1×-comp warmup (first 200 sessions of
//      the pinned calendar per operator ruling), then per-session:
//        prior-session SPY close > SPY 200-SMA(prior 200 sessions) → 2x-comp
//        else                                                       → 1x-comp
//      Both variants share the same equity path (comp basis).
//
// Sealed inputs: reuses turn2b cache. Zero fetch. Zero kernel edit.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price, type Tier } from '../kernel/types.ts';
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
const VD_WARMUP_SESSIONS = 200;
const VD_SMA_WINDOW = 200;

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
      const toN = (x: string | null): number | null => {
        if (x === null) return null;
        const n = Number(x); return Number.isFinite(n) ? n : null;
      };
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

async function loadBars(): Promise<CompositeBarSource> {
  const opens = new Map<string, Price>(); const closes = new Map<string, Price>();
  const rd = async (p: string, m: Map<string, Price>, field: 'open' | 'close') => {
    for (const l of await readLines(p)) {
      const r = JSON.parse(l);
      const v = r[field];
      if (v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
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

/** Build V-D per-session resolver against sealed spy.jsonl. */
async function buildVdResolver(sessions: ReadonlyArray<SessionDate>): Promise<{
  resolve: (s: SessionDate) => SizingVariantId | null;
  telemetry: { warmupSessions: number; regime2xSessions: number; regime1xSessions: number; missingSpy: number };
}> {
  const spyClose = new Map<SessionDate, number>();
  for (const l of await readLines(`${CACHE}spy.jsonl`)) {
    const r = JSON.parse(l);
    const n = Number(r.close);
    if (Number.isFinite(n) && n > 0) spyClose.set(r.trade_date as SessionDate, n);
  }
  const sessionIdx = new Map<SessionDate, number>();
  sessions.forEach((s, i) => sessionIdx.set(s, i));

  // Precompute per-session decision.
  const decision = new Map<SessionDate, SizingVariantId | null>();
  let warm = 0, reg2 = 0, reg1 = 0, miss = 0;
  for (let i = 0; i < sessions.length; i++) {
    if (i < VD_WARMUP_SESSIONS) { decision.set(sessions[i], '1x-comp'); warm += 1; continue; }
    // Look at prior session close vs 200-SMA of prior 200 sessions.
    const priorSession = sessions[i - 1];
    const priorClose = spyClose.get(priorSession);
    // Assemble the 200 prior closes ending at priorSession.
    let sum = 0; let cnt = 0;
    for (let j = i - VD_SMA_WINDOW; j < i; j++) {
      if (j < 0) continue;
      const c = spyClose.get(sessions[j]);
      if (c !== undefined) { sum += c; cnt += 1; }
    }
    if (priorClose === undefined || cnt < 150) { decision.set(sessions[i], '1x-comp'); miss += 1; continue; }
    const sma = sum / cnt;
    if (priorClose > sma) { decision.set(sessions[i], '2x-comp'); reg2 += 1; }
    else { decision.set(sessions[i], '1x-comp'); reg1 += 1; }
  }
  return {
    resolve: (s) => decision.get(s) ?? null,
    telemetry: { warmupSessions: warm, regime2xSessions: reg2, regime1xSessions: reg1, missingSpy: miss },
  };
}

function fmtUsd(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(x: number): string { return `${(x*100).toFixed(2)}%`; }

function eligibility(sum: {
  totalReturnPct: number; drawdown: { maxDdPct: number }; worstCalendarYearReturnPct: number | null;
}, sessions: number, lots: number): { pass: boolean; parts: string[] } {
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
  return { pass, parts };
}

if (import.meta.main) {
  console.log('# ACT-515 R1 · TURN-1b — V-B / V-D RECEIPTS');
  console.log('');
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const bs = await loadBars();
  const corpus = await loadCorpus(cal);
  const clock = new FixedClock(CLOCK_MS);

  const vd = await buildVdResolver(sessions);

  interface Spec {
    id: string; base: SizingVariantId; note: string;
    tierMul?: Partial<Record<Tier, number>>;
    resolver?: (s: SessionDate) => SizingVariantId | null;
    resolverTelemetry?: string;
  }
  const specs: Spec[] = [
    { id: 'V-B T1-priority', base: '2x-const',
      note: 'default 2x-const rail; T1 slots doubled post-admit (slotMultiplierByTier={T1:2})',
      tierMul: { T1: 2 } },
    { id: 'V-D regime-gated', base: '1x-comp',
      note: `default 1x-comp; per-session variantResolver: warmup first ${VD_WARMUP_SESSIONS} sessions=1x-comp, then SPY-prior-close vs SPY ${VD_SMA_WINDOW}-SMA → 2x-comp above / 1x-comp below`,
      resolver: vd.resolve,
      resolverTelemetry: `warmup=${vd.telemetry.warmupSessions} regime2x=${vd.telemetry.regime2xSessions} regime1x=${vd.telemetry.regime1xSessions} spyMissing=${vd.telemetry.missingSpy}` },
  ];

  for (const spec of specs) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`## ${spec.id}`);
    console.log('');
    console.log(`**SELECT now();** → ${new Date().toISOString()}`);
    console.log(`**Spec:** ${spec.note}`);
    if (spec.resolverTelemetry) console.log(`**Resolver telemetry:** ${spec.resolverTelemetry}`);

    const res = runOrchestrator({
      variantId: spec.base, sessions, calendar: cal,
      corpusByEntrySession: corpus, cellMap, bars: bs,
      startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD, budgets: BUDGETS,
      walletCapFractions: WALLET_CAPS, haircutMode: 'study', clock,
      permitExitDegradation: true,
      slotMultiplierByTier: spec.tierMul,
      variantResolver: spec.resolver,
    });

    if (!res.ok) {
      console.log(`RUN HALTED at ${res.sessionDate} — refusal=${res.refusal}: ${res.detail}`);
      continue;
    }
    const t = res.telemetry, sum = res.summary;
    const last = res.rows[res.rows.length - 1];

    console.log('');
    console.log('### Verdict row');
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
    console.log(`### Eligibility (cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800)`);
    for (const p of elig.parts) console.log(`- ${p}`);
    console.log(`**VERDICT: ${elig.pass ? 'ELIGIBLE' : 'TEXTURE (fails ≥1 clause)'}**`);
    console.log('');
  }
}