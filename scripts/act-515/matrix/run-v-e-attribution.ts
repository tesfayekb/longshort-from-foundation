// ACT-515 R1 · V-E ATTRIBUTION SLICE — REGIME-CONCENTRATION TEST.
//
// Zero fetch. Sealed inputs: lots-1x-const.jsonl (4,902 admitted lots),
// admit-trace.jsonl (per-session admits + typed refusals), slate-YYYY.jsonl
// (full corpus for undersampling ratio), bars-pairs.jsonl + bars-windows-*.jsonl
// (study-conv per-lot).
//
// STUDY-CONV convention (same ruler as run-crosscheck-v21.ts):
//   per-lot bps = sign × (close[entry + hold] / open[entry] − 1) × 10000
//   hold: T1 = 4 sessions (T+2→T+6), T2 (LONG or SHORT) = 9 sessions.
//   Rows missing entry-open or exit-close are typed-skipped and counted.
//
// DEMAND (per-session admit demand, post-slate) — mirrors run-attribution-v2:
//   demand(session) = admits(session, both sides)
//                   + typed refusals(session, both sides)
//                       (position_already_open + allocation_cap_reached
//                        + short_daily_budget_reached + daily_budget_reached)
//   BUCKETS: HIGH ≥ 10, MID 5–9, LOW < 5.
//
// UNDERSAMPLING: per calendar year, full-slate row count vs admitted lot count.

const CACHE = 'scripts/act-515/matrix/cache/';
const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const HOLD_BY_TIER: Record<'T1' | 'T2', number> = { T1: 4, T2: 9 };

interface Lot {
  eventId: number; ticker: string; side: 'long' | 'short';
  tier: 'T1' | 'T2'; entryDate: string; exitDate: string;
  holdingSessions: number; realizedBps: number; year: number;
}

interface AdmitTrace {
  session: string; side: 'long' | 'short';
  admits: Array<{ ticker: string; eventId: number; slateRank: number }>;
  typed_skips: Record<string, number | undefined>;
}

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
}

function fmtBps(x: number): string { return (x >= 0 ? '+' : '') + x.toFixed(1); }
function pct(a: number, b: number): string { return b === 0 ? '0.0' : ((a/b)*100).toFixed(1); }

if (import.meta.main) {
  console.log('# ACT-515 R1 · V-E ATTRIBUTION — REGIME-CONCENTRATION TEST');
  console.log('');
  console.log(`**SELECT now();** → ${new Date().toISOString()}`);
  console.log('');
  console.log('**Header — IN-SAMPLE.** Bucketing the 4,902 admitted lots by');
  console.log('[calendar year] × [session admit-demand]. Demand ≡ admits + typed');
  console.log('refusals (position_already_open + allocation_cap_reached +');
  console.log('short_daily_budget_reached + daily_budget_reached), summed across');
  console.log('both sides on the lot\'s admit (entry) session. Buckets:');
  console.log('**HIGH ≥ 10 / MID 5-9 / LOW < 5**.');
  console.log('');
  console.log('**Study-conv ruler.** Per-lot study-conv bps ='  );
  console.log('sign × (close[entry+hold] / open[entry] − 1) × 10000, hold = T1:4 T2:9.');
  console.log('Same ruler as `run-crosscheck-v21.ts`. Walk-realized bps shown alongside.');
  console.log('');

  // Load calendar
  const calendar: string[] = [];
  for (const l of await readLines(`${CACHE}calendar.jsonl`)) calendar.push(JSON.parse(l).session);
  calendar.sort();
  const calIdx = new Map<string, number>();
  calendar.forEach((s, i) => calIdx.set(s, i));

  // Load bars
  const opens = new Map<string, number>(), closes = new Map<string, number>();
  const rd = async (p: string, m: Map<string, number>, field: 'open' | 'close') => {
    for (const l of await readLines(p)) {
      const r = JSON.parse(l);
      const v = r[field]; if (v === null || v === undefined) continue;
      const n = Number(v); if (!Number.isFinite(n) || n <= 0) continue;
      const k = `${r.ticker}|${r.trade_date}`;
      if (!m.has(k)) m.set(k, n);
    }
  };
  await rd(`${CACHE}bars-pairs.jsonl`, opens, 'open');
  await rd(`${CACHE}bars-windows-delta.jsonl`, opens, 'open');
  for (const y of YEARS) await rd(`${CACHE}bars-windows-${y}.jsonl`, closes, 'close');
  await rd(`${CACHE}bars-windows-delta.jsonl`, closes, 'close');

  // Load lots
  const lots: Lot[] = [];
  for (const l of await readLines(`${CACHE}lots-1x-const.jsonl`)) lots.push(JSON.parse(l));

  // Load admit-trace → demand per session (both sides summed)
  const demandBySession = new Map<string, number>();
  for (const l of await readLines(`${CACHE}admit-trace.jsonl`)) {
    const r = JSON.parse(l) as AdmitTrace;
    const ts = r.typed_skips ?? {};
    const skips = (ts.position_already_open ?? 0) + (ts.allocation_cap_reached ?? 0)
      + (ts.short_daily_budget_reached ?? 0) + (ts.daily_budget_reached ?? 0);
    const d = (r.admits?.length ?? 0) + skips;
    demandBySession.set(r.session, (demandBySession.get(r.session) ?? 0) + d);
  }
  const bucketFor = (d: number): 'HIGH' | 'MID' | 'LOW' =>
    d >= 10 ? 'HIGH' : d >= 5 ? 'MID' : 'LOW';

  // Full-slate per-year count
  const slateByYear = new Map<number, number>();
  for (const y of YEARS) {
    let n = 0;
    for (const _ of await readLines(`${CACHE}slate-${y}.jsonl`)) n += 1;
    slateByYear.set(y, n);
  }

  // Per-lot study-conv
  type Row = Lot & { bucket: 'HIGH'|'MID'|'LOW'; studyBps: number | null; };
  const rows: Row[] = [];
  let missBar = 0, offCal = 0;
  for (const lot of lots) {
    const eIdx = calIdx.get(lot.entryDate);
    const hold = HOLD_BY_TIER[lot.tier];
    const eOpen = opens.get(`${lot.ticker}|${lot.entryDate}`);
    let studyBps: number | null = null;
    if (eIdx === undefined) { offCal += 1; }
    else {
      const xIdx = eIdx + hold;
      if (xIdx >= calendar.length) { offCal += 1; }
      else {
        const xDate = calendar[xIdx];
        const xClose = closes.get(`${lot.ticker}|${xDate}`);
        if (eOpen === undefined || xClose === undefined) missBar += 1;
        else {
          const sign = lot.side === 'short' ? -1 : 1;
          studyBps = sign * (xClose / eOpen - 1) * 10000;
        }
      }
    }
    const d = demandBySession.get(lot.entryDate) ?? 0;
    rows.push({ ...lot, bucket: bucketFor(d), studyBps });
  }

  const N = rows.length;
  const meanRealized = rows.reduce((s, r) => s + r.realizedBps, 0) / N;
  const withStudy = rows.filter(r => r.studyBps !== null);
  const meanStudy = withStudy.reduce((s, r) => s + (r.studyBps as number), 0) / withStudy.length;

  console.log('## Overall');
  console.log('');
  console.log('| metric | value |');
  console.log('|---|---|');
  console.log(`| lots | ${N.toLocaleString()} |`);
  console.log(`| walk-realized bps/lot (mean) | **${fmtBps(meanRealized)}** |`);
  console.log(`| study-conv bps/lot (mean, n=${withStudy.length}) | **${fmtBps(meanStudy)}** |`);
  console.log(`| lots skipped (missing bar) | ${missBar} |`);
  console.log(`| lots skipped (off-calendar tail) | ${offCal} |`);
  console.log('');

  // Bucket helpers
  const agg = (predicate: (r: Row) => boolean) => {
    const sub = rows.filter(predicate);
    const w = sub.reduce((s, r) => s + r.realizedBps, 0);
    const swStudy = sub.filter(r => r.studyBps !== null);
    const sStudy = swStudy.reduce((s, r) => s + (r.studyBps as number), 0);
    return {
      n: sub.length,
      realized: sub.length ? w / sub.length : 0,
      study: swStudy.length ? sStudy / swStudy.length : 0,
      studyN: swStudy.length,
    };
  };

  // Year × Demand bucket table
  console.log('## By calendar year × session admit-demand (HIGH≥10 / MID 5-9 / LOW<5)');
  console.log('');
  console.log('| year | bucket | n | walk-realized | study-conv | study-n |');
  console.log('|---|---|---|---|---|---|');
  for (const y of YEARS) {
    for (const b of ['HIGH', 'MID', 'LOW'] as const) {
      const a = agg(r => r.year === y && r.bucket === b);
      if (a.n === 0) { console.log(`| ${y} | ${b} | 0 | — | — | 0 |`); continue; }
      console.log(`| ${y} | ${b} | ${a.n} | ${fmtBps(a.realized)} | ${fmtBps(a.study)} | ${a.studyN} |`);
    }
  }
  console.log('');

  // Demand-bucket totals (across all years)
  console.log('## By demand bucket (all years)');
  console.log('');
  console.log('| bucket | n | walk-realized | study-conv | study-n |');
  console.log('|---|---|---|---|---|');
  let totHigh = 0, totMid = 0, totLow = 0;
  for (const b of ['HIGH', 'MID', 'LOW'] as const) {
    const a = agg(r => r.bucket === b);
    if (b === 'HIGH') totHigh = a.n; else if (b === 'MID') totMid = a.n; else totLow = a.n;
    console.log(`| ${b} | ${a.n} | ${a.n ? fmtBps(a.realized) : '—'} | ${a.studyN ? fmtBps(a.study) : '—'} | ${a.studyN} |`);
  }
  console.log('');

  // Undersampling ratio per year
  console.log('## Corpus context — undersampling per year');
  console.log('');
  console.log('| year | full-slate rows | admitted lots | ratio (admitted / slate) |');
  console.log('|---|---|---|---|');
  let totSlate = 0, totAdmit = 0;
  for (const y of YEARS) {
    const slate = slateByYear.get(y) ?? 0;
    const adm = rows.filter(r => r.year === y).length;
    totSlate += slate; totAdmit += adm;
    console.log(`| ${y} | ${slate.toLocaleString()} | ${adm.toLocaleString()} | ${pct(adm, slate)}% |`);
  }
  console.log(`| **total** | **${totSlate.toLocaleString()}** | **${totAdmit.toLocaleString()}** | **${pct(totAdmit, totSlate)}%** |`);
  console.log('');

  // ONE-LINE ANSWER — demand thesis
  const highA = agg(r => r.bucket === 'HIGH');
  const midA = agg(r => r.bucket === 'MID');
  const lowA = agg(r => r.bucket === 'LOW');
  const _2022 = agg(r => r.year === 2022);
  const nonUniform = Math.abs(highA.realized - lowA.realized) >= 30
    || Math.abs(_2022.realized - meanRealized) >= 30;
  const thesisConfirmed =
    (highA.n > 0 && highA.realized - lowA.realized >= 30) ||
    (_2022.n > 0 && _2022.realized - meanRealized >= 30);
  console.log('## ONE-LINE ANSWER — demand-concentration thesis');
  console.log('');
  console.log(`HIGH-demand (≥10): n=${highA.n}, walk-realized=${fmtBps(highA.realized)}.  ` +
    `MID (5-9): n=${midA.n}, ${fmtBps(midA.realized)}.  ` +
    `LOW (<5): n=${lowA.n}, ${fmtBps(lowA.realized)}.  ` +
    `2022 slice: n=${_2022.n}, ${fmtBps(_2022.realized)} vs overall ${fmtBps(meanRealized)}.`);
  console.log('');
  if (thesisConfirmed) {
    console.log('**VERDICT: THESIS CONFIRMED — edge concentrates in high-demand / 2022-class regimes.**');
    console.log('');
    console.log('**PRE-REGISTERED V-F CHARTER (armed):** demand-scaled K.');
    console.log('- K=5 base, K=15 on demand ≥ 10 sessions; slot notional $2,500 CONSTANT');
    console.log('  (more tickets per hot session, same ticket size).');
    console.log('- Implementation: additive orchestrator hook `perSessionBudgetResolver`');
    console.log('  computes K from prior-session demand tally; wallet caps unchanged.');
    console.log('- Eligibility grammar: cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800.');
  } else if (nonUniform) {
    console.log('**VERDICT: MIXED — dispersion present but no bucket clears the +30bps threshold.**');
    console.log('V-F charter stays SHELVED; edge is diffuse, not regime-concentrated.');
  } else {
    console.log('**VERDICT: THESIS DEAD — realized is uniformly ~+30 bps/lot across demand and year buckets.**');
    console.log('The ceiling is the ceiling. V-F charter (demand-scaled K) DOES NOT ARM;');
    console.log('more tickets on hot sessions would not lift the mean — the population is flat.');
  }
}