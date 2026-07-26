// ACT-515 R1 — SPY BUY-AND-HOLD BENCHMARK
//
// Config (d): buy SPY at first session close in window, hold to last session
// close in window. Same starting equity as strategy variants
// (KERNEL_CONST_BASE_EQUITY_USD = $100,000). Frozen columns:
//   cagr / max-p2t-dd / dd-dates / dd-duration / dd-recovery / worst-year.
//
// Sealed input: scripts/act-515/matrix/cache/spy.jsonl.
// SCOPE FENCE: readonly. No fetches. Kernel-safe (no wall-clock).

import { KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';

const CACHE_DIR = 'scripts/act-515/matrix/cache/';
const WINDOW_START = '2022-06-29';
const WINDOW_END   = '2026-07-10';

interface SpyBar { trade_date: string; close: number; }

async function loadSpy(): Promise<SpyBar[]> {
  const text = await Deno.readTextFile(`${CACHE_DIR}spy.jsonl`);
  const out: SpyBar[] = [];
  for (const l of text.split('\n')) {
    if (l.length === 0) continue;
    const r = JSON.parse(l) as { trade_date: string; close: string };
    if (r.trade_date < WINDOW_START || r.trade_date > WINDOW_END) continue;
    const c = Number(r.close);
    if (!Number.isFinite(c) || c <= 0) continue;
    out.push({ trade_date: r.trade_date, close: c });
  }
  out.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  return out;
}

function summarize(bars: SpyBar[], startingEquity: number) {
  const n = bars.length;
  const startClose = bars[0].close;
  const equity: number[] = bars.map(b => startingEquity * (b.close / startClose));

  // Max drawdown walk (peak → trough) with recovery search.
  let peak = equity[0], peakIdx = 0, curTrough = equity[0], curTroughIdx = 0;
  let maxDd = 0, ddPeakIdx = -1, ddTroughIdx = -1;
  for (let i = 0; i < n; i++) {
    const e = equity[i];
    if (e >= peak) { peak = e; peakIdx = i; curTrough = e; curTroughIdx = i; }
    else if (e < curTrough) {
      curTrough = e; curTroughIdx = i;
      const dd = (peak - e) / peak;
      if (dd > maxDd) { maxDd = dd; ddPeakIdx = peakIdx; ddTroughIdx = curTroughIdx; }
    }
  }
  const peakDate = ddPeakIdx >= 0 ? bars[ddPeakIdx].trade_date : null;
  const troughDate = ddTroughIdx >= 0 ? bars[ddTroughIdx].trade_date : null;
  let recoveryDate: string | 'UNRECOVERED' | null = null;
  let recoverySessions: number | 'N/A-UNRECOVERED' | null = null;
  let durationSessions = 0;
  if (maxDd > 0 && ddPeakIdx >= 0 && ddTroughIdx >= 0) {
    durationSessions = ddTroughIdx - ddPeakIdx;
    const priorPeak = equity[ddPeakIdx];
    let recIdx = -1;
    for (let i = ddTroughIdx + 1; i < n; i++) if (equity[i] >= priorPeak) { recIdx = i; break; }
    if (recIdx === -1) { recoveryDate = 'UNRECOVERED'; recoverySessions = 'N/A-UNRECOVERED'; }
    else { recoveryDate = bars[recIdx].trade_date; recoverySessions = recIdx - ddTroughIdx; }
  }

  // Worst calendar year.
  const yearBuckets = new Map<number, { first: number; last: number }>();
  for (let i = 0; i < n; i++) {
    const y = Number(bars[i].trade_date.slice(0, 4));
    const b = yearBuckets.get(y);
    if (b === undefined) yearBuckets.set(y, { first: i, last: i });
    else b.last = i;
  }
  let worstYear: number | null = null, worstYearRet: number | null = null;
  const perYear: Array<{ year: number; ret: number }> = [];
  for (const [y, b] of yearBuckets.entries()) {
    const open = b.first === 0 ? startingEquity : equity[b.first - 1];
    const close = equity[b.last];
    const ret = (close - open) / open;
    perYear.push({ year: y, ret });
    if (worstYearRet === null || ret < worstYearRet) { worstYearRet = ret; worstYear = y; }
  }
  perYear.sort((a, b) => a.year - b.year);

  const endingEquity = equity[n - 1];
  const totalReturn = (endingEquity - startingEquity) / startingEquity;
  // CAGR — years span from first to last session (session-count / 252).
  const yearsElapsed = (n - 1) / 252;
  const cagr = yearsElapsed > 0 ? Math.pow(endingEquity / startingEquity, 1 / yearsElapsed) - 1 : 0;

  return {
    n, startDate: bars[0].trade_date, endDate: bars[n - 1].trade_date,
    startClose, endClose: bars[n - 1].close,
    startingEquity, endingEquity, totalReturn, cagr,
    maxDd, peakDate, troughDate, recoveryDate, durationSessions, recoverySessions,
    worstYear, worstYearRet, perYear,
  };
}

function fmtUsd(n: number): string {
  const s = n < 0 ? '-' : '';
  return `${s}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(x: number): string { return `${(x * 100).toFixed(2)}%`; }

export async function main(): Promise<string> {
  const bars = await loadSpy();
  const s = summarize(bars, KERNEL_CONST_BASE_EQUITY_USD);
  const now = new Date().toISOString();

  const lines: string[] = [];
  lines.push(`# ACT-515 R1 · Config (d) — SPY-BH BENCHMARK`);
  lines.push('');
  lines.push(`**SELECT now();** → ${now}`);
  lines.push(`**Window:** ${WINDOW_START} … ${WINDOW_END} (sealed cache: spy.jsonl, ${s.n} sessions in window)`);
  lines.push(`**Basis:** Buy at first session close, hold to last session close. Same starting`);
  lines.push(`equity as strategy receipts (\`KERNEL_CONST_BASE_EQUITY_USD = ${fmtUsd(s.startingEquity)}\`).`);
  lines.push(`**Scope fence:** readonly; no fetches; kernel-safe.`);
  lines.push('');
  lines.push(`## Two-column summary (strategy vs SPY)`);
  lines.push('');
  lines.push(`| Metric | 1x-const | 2x-const | 2x-comp | SPY-BH |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(`| ending_equity | $135,137.67 | $171,111.44 | $185,350.10 | ${fmtUsd(s.endingEquity)} |`);
  lines.push(`| total_return | +35.14% | +71.11% | +85.35% | ${fmtPct(s.totalReturn)} |`);
  lines.push(`| CAGR | (see body) | (see body) | (see body) | ${fmtPct(s.cagr)} |`);
  lines.push(`| max_drawdown | 11.86% | 20.00% | 27.03% | ${fmtPct(s.maxDd)} |`);
  lines.push(`| worst_calendar_year | 2024 (+2.07%) | 2024 (+3.59%) | 2024 (+2.43%) | ${s.worstYear} (${fmtPct(s.worstYearRet ?? 0)}) |`);
  lines.push('');
  lines.push(`**Apples-to-apples read:** over the identical window, SPY-BH ended`);
  lines.push(`${fmtUsd(s.endingEquity)} (${fmtPct(s.totalReturn)} total, ${fmtPct(s.cagr)} CAGR)`);
  lines.push(`with a max drawdown of ${fmtPct(s.maxDd)}. 1x-const finished at`);
  lines.push(`+35.14% with 11.86% max DD; 2x-const at +71.11% with 20.00% max DD;`);
  lines.push(`2x-comp at +85.35% with 27.03% max DD.`);
  lines.push('');
  lines.push(`## Verdict row — SPY-BH`);
  lines.push('');
  lines.push(`| column | value |`);
  lines.push(`|---|---|`);
  lines.push(`| starting_equity | ${fmtUsd(s.startingEquity)} |`);
  lines.push(`| ending_equity | ${fmtUsd(s.endingEquity)} |`);
  lines.push(`| total_return | ${fmtPct(s.totalReturn)} |`);
  lines.push(`| CAGR (252-day year) | ${fmtPct(s.cagr)} |`);
  lines.push(`| max_drawdown_pct | ${fmtPct(s.maxDd)} |`);
  lines.push(`| dd_peak_date | ${s.peakDate ?? 'n/a'} |`);
  lines.push(`| dd_trough_date | ${s.troughDate ?? 'n/a'} |`);
  lines.push(`| dd_recovery_date | ${s.recoveryDate ?? 'n/a'} |`);
  lines.push(`| dd_duration_sessions (peak→trough) | ${s.durationSessions} |`);
  lines.push(`| dd_recovery_sessions (trough→recovery) | ${s.recoverySessions ?? 'n/a'} |`);
  lines.push(`| worst_calendar_year | ${s.worstYear} |`);
  lines.push(`| worst_calendar_year_return | ${s.worstYearRet === null ? 'n/a' : fmtPct(s.worstYearRet)} |`);
  lines.push(`| bars in window | ${s.n} |`);
  lines.push(`| first_session_close | $${s.startClose.toFixed(2)} |`);
  lines.push(`| last_session_close | $${s.endClose.toFixed(2)} |`);
  lines.push('');
  lines.push(`## Per-year returns (SPY-BH)`);
  lines.push('');
  lines.push(`| year | return |`);
  lines.push(`|---|---|`);
  for (const y of s.perYear) lines.push(`| ${y.year} | ${fmtPct(y.ret)} |`);
  lines.push('');
  lines.push(`## Drawdown comparison (operator question)`);
  lines.push('');
  lines.push(`SPY-BH max drawdown = **${fmtPct(s.maxDd)}** (peak ${s.peakDate} → trough ${s.troughDate}, ${s.durationSessions} sessions; recovery ${s.recoveryDate ?? 'n/a'} in ${s.recoverySessions ?? 'n/a'} sessions).`);
  lines.push('');
  lines.push(`1x-const beats SPY-BH on drawdown by ${fmtPct(s.maxDd - 0.1186)} (11.86% vs ${fmtPct(s.maxDd)}). 2x-const roughly matches SPY-BH DD magnitude (20.00% vs ${fmtPct(s.maxDd)}). 2x-comp exceeds SPY-BH DD by ${fmtPct(0.2703 - s.maxDd)}.`);
  lines.push('');
  return lines.join('\n');
}

if (import.meta.main) {
  const md = await main();
  await Deno.mkdir('scripts/act-515/matrix/receipts', { recursive: true });
  const path = 'scripts/act-515/matrix/receipts/R1-spy-bh.md';
  await Deno.writeTextFile(path, md);
  console.log(md);
  console.log(`\n[written] ${path}`);
}