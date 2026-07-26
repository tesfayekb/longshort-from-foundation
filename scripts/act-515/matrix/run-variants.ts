// ACT-515 R1 · VARIANTS RUNNER (V-A / V-C via rank filter + existing sizing).
//
// Executes on sealed Turn-2B cache via the certified orchestrator.
// SCOPE FENCE: zero kernel edits.
//
// V-A rank-elite: pre-filter slate to slate_rank ≤ 5, run with 2x-const
//   (leverage=2.0 on the const $100k rail → 5% concentration = $5k slot,
//    exactly matching the operator's V-A spec).
// V-C = V-A × 2x-comp: same pre-filter, run with 2x-comp.
//
// V-B (T1-priority, T1 slots ×2) and V-D (regime-gated leverage) require
// per-lot / per-session sizing hooks in the orchestrator that do not yet
// exist. Filed here as DEFERRED-SCOPE-FENCE (typed) — see receipt tail.

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

async function loadCorpusFiltered(
  calendar: ArraySessionCalendar,
  maxRank: number,
): Promise<{ bySession: Map<SessionDate, CorpusCandidateRow[]>; keptRows: number; skippedByRank: number }> {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  let keptRows = 0, skippedByRank = 0;
  for (const y of YEARS) {
    for (const l of await readLines(`${CACHE}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l);
      if (s.slate_rank > maxRank) { skippedByRank += 1; continue; }
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
      keptRows += 1;
    }
  }
  return { bySession, keptRows, skippedByRank };
}

async function loadBars(): Promise<{ opens: Map<string, Price>; closes: Map<string, Price> }> {
  const opens = new Map<string, Price>(); const closes = new Map<string, Price>();
  const readPair = async (p: string, m: Map<string, Price>, field: 'open' | 'close') => {
    for (const l of await readLines(p)) {
      const r = JSON.parse(l);
      const v = r[field];
      if (v === null) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      const k = MapBarSource.key(r.ticker, r.trade_date);
      if (!m.has(k)) m.set(k, price(n));
    }
  };
  await readPair(`${CACHE}bars-pairs.jsonl`, opens, 'open');
  await readPair(`${CACHE}bars-windows-delta.jsonl`, opens, 'open');
  for (const y of YEARS) await readPair(`${CACHE}bars-windows-${y}.jsonl`, closes, 'close');
  await readPair(`${CACHE}bars-windows-delta.jsonl`, closes, 'close');
  return { opens, closes };
}

function bars(opens: Map<string, Price>, closes: Map<string, Price>): CompositeBarSource {
  return {
    open: (t, s) => opens.get(MapBarSource.key(t, s)) ?? null,
    close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null,
  };
}

function fmtUsd(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(x: number): string { return `${(x*100).toFixed(2)}%`; }

interface VariantSpec { id: string; sizingVariant: SizingVariantId; maxRank: number; note: string; }
const SPECS: VariantSpec[] = [
  { id: 'V-A rank-elite',       sizingVariant: '2x-const', maxRank: 5, note: 'admit rank≤5; slot=$5k via leverage=2 on $100k const rail' },
  { id: 'V-C rank-elite×2xcomp', sizingVariant: '2x-comp',  maxRank: 5, note: 'admit rank≤5; leverage=2 on running-equity comp basis' },
];

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
  console.log('# ACT-515 R1 · VARIANT RECEIPTS (V-A / V-C on sealed artifacts)');
  console.log('');
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const { opens, closes } = await loadBars();
  const bs = bars(opens, closes);
  const clock = new FixedClock(CLOCK_MS);

  for (const spec of SPECS) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`## ${spec.id}`);
    console.log('');
    console.log(`**SELECT now();** → ${new Date().toISOString()}`);
    console.log(`**Spec:** ${spec.note}`);
    console.log('');
    const { bySession, keptRows, skippedByRank } = await loadCorpusFiltered(cal, spec.maxRank);
    console.log(`Corpus filter: kept ${keptRows} slate rows, skipped ${skippedByRank} by rank>${spec.maxRank}.`);

    const res = runOrchestrator({
      variantId: spec.sizingVariant, sessions, calendar: cal,
      corpusByEntrySession: bySession, cellMap, bars: bs,
      startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD, budgets: BUDGETS,
      walletCapFractions: WALLET_CAPS, haircutMode: 'study', clock,
      permitExitDegradation: true,
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

    // Identity envelope
    const startC = Math.round(KERNEL_CONST_BASE_EQUITY_USD * 100);
    const endC = Math.round((last.equityUsd as number) * 100);
    const realizedC = Math.round((t.totalRealizedUsd as number) * 100);
    const carryC = Math.round((sum.cumulativeCarryUsd as number) * 100);
    const unrealC = Math.round((last.unrealizedTotalUsd as number) * 100);
    const pred = startC + realizedC - carryC + unrealC;
    const drift = endC - pred;
    const env = t.totalAdmits + Math.max(0, last.openLots);
    console.log(`identity: Δ=${drift}c envelope=${env}c → ${Math.abs(drift) <= env ? 'WITHIN' : 'OUTSIDE'}`);

    // Eligibility
    const elig = eligibility(sum, res.rows.length, t.totalAdmits);
    console.log('');
    console.log(`### Eligibility (cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800)`);
    for (const p of elig.parts) console.log(`- ${p}`);
    console.log(`**VERDICT: ${elig.pass ? 'ELIGIBLE' : 'TEXTURE (fails ≥1 clause)'}**`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('## V-B / V-D — DEFERRED-SCOPE-FENCE (typed)');
  console.log('');
  console.log('**V-B (T1-priority, T1 slots ×2):** requires a per-lot sizing hook on the');
  console.log('orchestrator to override `KERNEL_SLOT_CONCENTRATION` for T1 admits. Not');
  console.log('expressible via the existing `SizingVariantId` enum (which is fixed at');
  console.log('four values; slot-concentration is a kernel constant, not per-tier).');
  console.log('Implementation path: add `slotMultiplierByTier?: Record<Tier, number>` to');
  console.log('`OrchestratorInput`; kernel size.ts already isolates slot math to one line.');
  console.log('Change is bounded and testable; deferred for a dedicated build turn.');
  console.log('');
  console.log('**V-D (regime-gated leverage):** requires per-session variant switching');
  console.log('(2×-comp when prior-session SPY close > its 200-SMA, else 1×-comp). Needs');
  console.log('a `variantResolver: (session: SessionDate) => SizingVariantId` hook plus');
  console.log('a warmup fallback for the first 200 sessions (operator-frozen: regime=1×');
  console.log('during warmup). Both are additive orchestrator changes with kernel scope');
  console.log('preserved. Deferred to the same build turn as V-B.');
  console.log('');
  console.log('Neither deferred variant fabricates numbers here.');
}
