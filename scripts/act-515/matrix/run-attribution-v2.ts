// ACT-515 R1 · ATTRIBUTION-v2 — corrected baseline (ACT-574 mark-path).
//
// SUPERSEDES: receipts/R1-attribution.md v1 (×2.2 linear scaling RETRACTED).
// Baseline is the ACT-574 §2.1 per-ordinal cumulative bps at the lot's
// ACTUAL exit ordinal (T1 uses ord-6 row = +184.79, T2 uses ord-10 row = +76.23),
// side-signed (short → × −1). Clamp: holdingSessions > 10 → ord-10 (counted).
//
// Crowding axis (D-2.a EXTENDED, operator-frozen 2026-07-26):
//   admit-demand (post-slate) per session = admits + typed refusals
//     (position_already_open + allocation_cap_reached + short_daily_budget_reached
//      + daily_budget_reached), summed across both sides for that admit session.
//   Bucketed: ≥15 / 6-14 / ≤5. Note: LONG K=5 truncates silently — captured
//   here via allocation_cap_reached and daily_budget_reached tallies where
//   present in admit-trace.
//
// Scope: readonly; consumes lots-1x-const.jsonl + admit-trace.jsonl + inputs/act-574-mark-path.json.

const CACHE = 'scripts/act-515/matrix/cache/';
const TABLE_PATH = 'scripts/act-515/matrix/inputs/act-574-mark-path.json';

type Lot = {
  eventId: number; ticker: string; side: 'long' | 'short';
  tier: 'T1' | 'T2'; entryDate: string; exitDate: string;
  holdingSessions: number; notionalUsd: number;
  realizedUsd: number; realizedBps: number;
  studiedMeanFwd5d: number; studiedScaledBps: number;
  year: number; slateRank: number; rankBand: '1-5' | '6-15' | '16-25';
  band: string; mag: number; dd: number; cellKey: string;
};

type AdmitTrace = {
  session: string; side: 'long' | 'short'; rows: number;
  admits: Array<{ ticker: string; eventId: number; slateRank: number }>;
  typed_skips: {
    entry_price_missing?: number;
    no_cell_or_rank_null?: number;
    position_already_open?: number;
    allocation_cap_reached?: number;
    short_daily_budget_reached?: number;
    daily_budget_reached?: number;
  };
};

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
}

function fmtBps(x: number): string { return (x >= 0 ? '+' : '') + x.toFixed(1); }
function pct(a: number, b: number): string { return b === 0 ? '0.0' : ((a/b)*100).toFixed(1); }

if (import.meta.main) {
  console.log('# ACT-515 R1 · ATTRIBUTION-v2 — CORRECTED BASELINE (ACT-574 mark-path)');
  console.log('');
  console.log(`**SELECT now();** → ${new Date().toISOString()}`);
  console.log('');
  console.log('**Header — IN-SAMPLE RECOVERY.** Expected-per-lot is the ACT-574 §2.1');
  console.log('mark-path value at the lot\'s ACTUAL exit ordinal per tier (T1 ord-6, T2');
  console.log('ord-10), side-signed. Ordinal > 10 → clamp-to-ord-10 (counted).');
  console.log('');
  console.log('**Baseline source:** ACT-574 mark-path table pinned at');
  console.log(`\`${TABLE_PATH}\` (sha 48977f73…30332b). Verbatim from`);
  console.log('`docs/06-tracking/ACT-574-phase1-entry-day-offset-grid.md` §2.1.');
  console.log('');
  console.log('**Retraction:** v1 receipt used studied_mean_fwd_5d × (holdingSessions/5)');
  console.log('linear scaling — that horizon-linear projection RETRACTED. v2 uses the');
  console.log('empirical mark-path from ACT-574 which is the operator-audited ground truth.');
  console.log('');
  console.log('**Crowding axis (D-2.a EXTENDED):** admit-demand (post-slate) per session =');
  console.log('admits + (position_already_open + allocation_cap_reached + daily_budget_reached');
  console.log('+ short_daily_budget_reached), summed across sides on that admit session.');
  console.log('Buckets: **HIGH ≥15 / MID 6-14 / LOW ≤5**.');
  console.log('');

  // Load 574 table
  const tbl = JSON.parse(await Deno.readTextFile(TABLE_PATH)) as {
    table: Array<{ day: number; T1: number; T2: number }>;
  };
  const T1_ORD_END = 6, T2_ORD_END = 10;
  const t1Row = tbl.table.find(r => r.day === T1_ORD_END)!;
  const t2Row = tbl.table.find(r => r.day === T2_ORD_END)!;
  const expectedByTier: Record<'T1'|'T2', number> = { T1: t1Row.T1, T2: t2Row.T2 };
  console.log(`**Pinned baselines:** T1 ord-6 = **${fmtBps(expectedByTier.T1)} bps**  ·  T2 ord-10 = **${fmtBps(expectedByTier.T2)} bps** (side-signed at consume).`);
  console.log('');

  // Load lots
  const lots: Lot[] = [];
  for (const l of await readLines(`${CACHE}lots-1x-const.jsonl`)) lots.push(JSON.parse(l));

  // Load admit trace, compute per-session demand
  const demandBySession = new Map<string, number>();
  for (const l of await readLines(`${CACHE}admit-trace.jsonl`)) {
    const r = JSON.parse(l) as AdmitTrace;
    const ts = r.typed_skips ?? {};
    const skips = (ts.position_already_open ?? 0) + (ts.allocation_cap_reached ?? 0)
      + (ts.short_daily_budget_reached ?? 0) + (ts.daily_budget_reached ?? 0);
    const demand = (r.admits?.length ?? 0) + skips;
    demandBySession.set(r.session, (demandBySession.get(r.session) ?? 0) + demand);
  }

  const bucketForDemand = (d: number): 'HIGH' | 'MID' | 'LOW' =>
    d >= 15 ? 'HIGH' : d >= 6 ? 'MID' : 'LOW';

  // Compute expected + attach crowding
  type Enriched = Lot & { expectedBps: number; crowding: 'HIGH'|'MID'|'LOW'; clamped: boolean };
  const enriched: Enriched[] = [];
  let clampedCount = 0;
  let missingDemand = 0;
  for (const lot of lots) {
    const baseTierBps = expectedByTier[lot.tier];
    const sign = lot.side === 'short' ? -1 : +1;
    const clamped = lot.holdingSessions > (lot.tier === 'T1' ? T1_ORD_END : T2_ORD_END);
    if (clamped) clampedCount += 1;
    const expected = baseTierBps * sign;
    // Demand keyed by the lot's admit session = entryDate for LONG-T1, entryDate for SHORT-T2;
    // orchestrator admit-trace keys by session-of-admit = entryDate for both here.
    const d = demandBySession.get(lot.entryDate);
    if (d === undefined) missingDemand += 1;
    enriched.push({
      ...lot,
      expectedBps: expected,
      crowding: bucketForDemand(d ?? 0),
      clamped,
    });
  }

  // Cell/group aggregator
  const agg = <K extends string>(
    rows: Enriched[], keyFn: (r: Enriched) => K,
  ): Map<K, { n: number; realized: number; expected: number }> => {
    const m = new Map<K, { n: number; realized: number; expected: number }>();
    for (const r of rows) {
      const k = keyFn(r);
      const e = m.get(k) ?? { n: 0, realized: 0, expected: 0 };
      e.n += 1; e.realized += r.realizedBps; e.expected += r.expectedBps;
      m.set(k, e);
    }
    return m;
  };
  const summarize = (
    m: Map<string, { n: number; realized: number; expected: number }>,
    totalN: number,
  ) => Array.from(m.entries()).map(([k, v]) => {
    const meanR = v.realized / v.n, meanE = v.expected / v.n;
    const gap = meanR - meanE;
    const shareGap = (v.n / totalN) * gap;
    return { k, n: v.n, meanR, meanE, gap, shareGap };
  }).sort((a, b) => Math.abs(b.shareGap) - Math.abs(a.shareGap));

  const N = enriched.length;
  const meanRealized = enriched.reduce((s, r) => s + r.realizedBps, 0) / N;
  const meanExpected = enriched.reduce((s, r) => s + r.expectedBps, 0) / N;
  const overallGap = meanRealized - meanExpected;

  console.log('## Overall');
  console.log('');
  console.log('| metric | value |');
  console.log('|---|---|');
  console.log(`| lots | ${N.toLocaleString()} |`);
  console.log(`| realized bps/lot | **${fmtBps(meanRealized)}** |`);
  console.log(`| expected bps/lot (574 mark-path) | **${fmtBps(meanExpected)}** |`);
  console.log(`| gap (realized − expected) | **${fmtBps(overallGap)}** |`);
  console.log(`| clamped to ord-10 | ${clampedCount} (${pct(clampedCount, N)}%) |`);
  console.log(`| missing demand (session key not in trace) | ${missingDemand} |`);
  console.log('');

  // Axis: year × side
  console.log('## By calendar year × side');
  console.log('');
  console.log('| year | side | n | realized | expected | gap | share×gap |');
  console.log('|---|---|---|---|---|---|---|');
  const yearSide = summarize(agg(enriched, r => `${r.year}|${r.side}`), N);
  for (const r of yearSide.slice().sort((a, b) => a.k.localeCompare(b.k))) {
    console.log(`| ${r.k.split('|')[0]} | ${r.k.split('|')[1]} | ${r.n} | ${fmtBps(r.meanR)} | ${fmtBps(r.meanE)} | ${fmtBps(r.gap)} | ${fmtBps(r.shareGap)} |`);
  }
  console.log('');

  // Axis: tier × side
  console.log('## By tier × side');
  console.log('');
  console.log('| tier | side | n | realized | expected | gap | share×gap |');
  console.log('|---|---|---|---|---|---|---|');
  const tierSide = summarize(agg(enriched, r => `${r.tier}|${r.side}`), N);
  for (const r of tierSide.slice().sort((a, b) => a.k.localeCompare(b.k))) {
    console.log(`| ${r.k.split('|')[0]} | ${r.k.split('|')[1]} | ${r.n} | ${fmtBps(r.meanR)} | ${fmtBps(r.meanE)} | ${fmtBps(r.gap)} | ${fmtBps(r.shareGap)} |`);
  }
  console.log('');

  // Axis: rank-band × side
  console.log('## By rank-band × side');
  console.log('');
  console.log('| band | side | n | realized | expected | gap | share×gap |');
  console.log('|---|---|---|---|---|---|---|');
  const bandSide = summarize(agg(enriched, r => `${r.rankBand}|${r.side}`), N);
  for (const r of bandSide.slice().sort((a, b) => a.k.localeCompare(b.k))) {
    console.log(`| ${r.k.split('|')[0]} | ${r.k.split('|')[1]} | ${r.n} | ${fmtBps(r.meanR)} | ${fmtBps(r.meanE)} | ${fmtBps(r.gap)} | ${fmtBps(r.shareGap)} |`);
  }
  console.log('');

  // Axis: CROWDING × side
  console.log('## By crowding (admit-demand, post-slate) × side');
  console.log('');
  console.log('| bucket | side | n | realized | expected | gap | share×gap |');
  console.log('|---|---|---|---|---|---|---|');
  const crowdSide = summarize(agg(enriched, r => `${r.crowding}|${r.side}`), N);
  const bucketOrder: Record<string, number> = { HIGH: 0, MID: 1, LOW: 2 };
  for (const r of crowdSide.slice().sort((a, b) => {
    const [ba, sa] = a.k.split('|'), [bb, sb] = b.k.split('|');
    return bucketOrder[ba] - bucketOrder[bb] || sa.localeCompare(sb);
  })) {
    console.log(`| ${r.k.split('|')[0]} | ${r.k.split('|')[1]} | ${r.n} | ${fmtBps(r.meanR)} | ${fmtBps(r.meanE)} | ${fmtBps(r.gap)} | ${fmtBps(r.shareGap)} |`);
  }
  console.log('');

  // Cross-cut: year × tier × band × crowding — top 20 by |share×gap|
  console.log('## Top 20 cross-cut cells (year × tier × rank-band × crowding), sorted by |share×gap|');
  console.log('');
  console.log('| year | tier | band | crowding | side | n | realized | expected | gap | share×gap |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const cross = summarize(
    agg(enriched, r => `${r.year}|${r.tier}|${r.rankBand}|${r.crowding}|${r.side}`),
    N,
  );
  for (const r of cross.slice(0, 20)) {
    const [y, t, b, c, s] = r.k.split('|');
    console.log(`| ${y} | ${t} | ${b} | ${c} | ${s} | ${r.n} | ${fmtBps(r.meanR)} | ${fmtBps(r.meanE)} | ${fmtBps(r.gap)} | ${fmtBps(r.shareGap)} |`);
  }
  console.log('');

  // Dominant-cause ranking
  const causes = [
    { name: 'year-concentration',    m: summarize(agg(enriched, r => r.year.toString()), N) },
    { name: 'rank-anti-selection',   m: summarize(agg(enriched, r => r.rankBand), N) },
    { name: 'crowding-regime',       m: summarize(agg(enriched, r => r.crowding), N) },
    { name: 'residual-tier-side',    m: summarize(agg(enriched, r => `${r.tier}|${r.side}`), N) },
  ];
  console.log('## Dominant-cause ranking — sum of |share×gap| within each axis');
  console.log('');
  console.log('| axis | Σ |share×gap| | top bucket | top share×gap |');
  console.log('|---|---|---|---|');
  const summaries = causes.map(c => {
    const total = c.m.reduce((s, r) => s + Math.abs(r.shareGap), 0);
    const top = c.m[0];
    return { name: c.name, total, top };
  }).sort((a, b) => b.total - a.total);
  for (const s of summaries) {
    console.log(`| ${s.name} | ${s.total.toFixed(1)} | ${s.top.k} | ${fmtBps(s.top.shareGap)} |`);
  }
  console.log('');
  const winner = summaries[0].name;
  console.log(`**ONE-LINE ANSWER:** overall gap = **${fmtBps(overallGap)} bps/lot** on ${N} lots against ACT-574 mark-path baseline (T1 ord-6 +${expectedByTier.T1.toFixed(2)} / T2 ord-10 +${expectedByTier.T2.toFixed(2)}, side-signed). Dominant verified cause: **${winner}** (Σ|share×gap| = ${summaries[0].total.toFixed(1)} bps, top bucket = \`${summaries[0].top.k}\`).`);
  console.log('');
  console.log('_Haircut-mechanics is NOT enumerable from this artifact set (would require a per-lot pre/post-haircut price emitter on the receipt walk); flagged as a **PENDING-EMITTER** axis, not a verified negative._');
}
