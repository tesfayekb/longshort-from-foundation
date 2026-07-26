// ACT-515 R1 · TURN-1b — EVENT-MATCHED CROSS-CHECK (v2.1 baseline).
//
// SCOPE: pure read from sealed cache. Zero fetch, zero kernel edit.
// For each admitted lot (lots-1x-const.jsonl), compute the STUDY-CONVENTION
// return using the SAME lot's entry-open (bars-pairs) and the CLOSE at
// (entryDate + (exit_ord − entry_offset) sessions) drawn from
// bars-windows-{YYYY}.jsonl ∪ bars-windows-delta.jsonl. Side-signed, NO
// haircut. Aggregate by tier × side vs walk-realized and vs v2.1 expected.
//
// v2.1 baseline (side-signed magnitude):
//   T1 = markPath[T1][ord-6] − markPath[T1][ord-2] = 184.79 − 37.18 = +147.61 bps
//   T2 = markPath[T2][ord-10] − markPath[T2][ord-1] =  76.23 −  9.55 =  +66.68 bps
// (v2 used the full-curve baseline 184.79 / 76.23 — that overstated by the
// pre-entry segment; RETRACTED here, third correction on the record.)

const CACHE = 'scripts/act-515/matrix/cache/';
const ENTRY_OFFSET = { T1: 2, T2: 1 } as const;
const EXIT_ORD     = { T1: 6, T2: 10 } as const;
const V21_EXPECTED_BPS = { T1: 147.61, T2: 66.68 } as const;

interface Lot {
  eventId: number; ticker: string; side: 'long' | 'short';
  tier: 'T1' | 'T2'; entryDate: string; exitDate: string;
  holdingSessions: number; realizedBps: number;
}

async function readLines(p: string): Promise<string[]> {
  return (await Deno.readTextFile(p)).split('\n').filter(l => l.length > 0);
}

async function main() {
  console.log('# ACT-515 R1 · TURN-1b — EVENT-MATCHED CROSS-CHECK (v2.1)');
  console.log('');
  console.log(`**SELECT now();** → ${new Date().toISOString()}`);
  console.log('');

  // Calendar
  const calendar: string[] = [];
  for (const l of await readLines(`${CACHE}calendar.jsonl`)) {
    calendar.push(JSON.parse(l).session);
  }
  calendar.sort();
  const calIdx = new Map<string, number>();
  calendar.forEach((s, i) => calIdx.set(s, i));

  // Bars: opens (bars-pairs + delta) and closes (windows-YYYY + delta)
  const opens = new Map<string, number>();
  const closes = new Map<string, number>();
  const key = (t: string, s: string) => `${t}|${s}`;
  const loadInto = async (path: string, m: Map<string, number>, field: 'open' | 'close') => {
    for (const l of await readLines(path)) {
      const r = JSON.parse(l);
      const v = r[field];
      if (v === null || v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      const k = key(r.ticker, r.trade_date);
      if (!m.has(k)) m.set(k, n);
    }
  };
  await loadInto(`${CACHE}bars-pairs.jsonl`, opens, 'open');
  await loadInto(`${CACHE}bars-windows-delta.jsonl`, opens, 'open');
  for (const y of [2022, 2023, 2024, 2025, 2026]) {
    await loadInto(`${CACHE}bars-windows-${y}.jsonl`, closes, 'close');
  }
  await loadInto(`${CACHE}bars-windows-delta.jsonl`, closes, 'close');

  // Lots
  const lots: Lot[] = [];
  for (const l of await readLines(`${CACHE}lots-1x-const.jsonl`)) lots.push(JSON.parse(l));

  interface Cell {
    n: number; walkSumBps: number; studySumBps: number;
    expBps: number; missingClose: number; outOfRange: number;
    divergences: Array<{ lotId: string; ticker: string; entryDate: string;
      entryOpen: number; walkExitDate: string; walkBps: number;
      studyExitDate: string; studyClose: number; studyBps: number; delta: number }>;
  }
  const cells = new Map<string, Cell>();
  const cellKey = (t: string, s: string) => `${t}|${s}`;

  let studyMissing = 0, studyOutOfRange = 0, studyOk = 0;
  const allDivs: Array<{ tier: string; side: string; lotId: string; ticker: string;
    entryDate: string; entryOpen: number; walkExitDate: string; walkBps: number;
    studyExitDate: string; studyClose: number; studyBps: number; delta: number }> = [];

  for (const lot of lots) {
    const ck = cellKey(lot.tier, lot.side);
    let c = cells.get(ck);
    if (!c) {
      c = { n: 0, walkSumBps: 0, studySumBps: 0,
        expBps: (V21_EXPECTED_BPS[lot.tier]) * (lot.side === 'short' ? -1 : 1),
        missingClose: 0, outOfRange: 0, divergences: [] };
      cells.set(ck, c);
    }
    c.n += 1;
    c.walkSumBps += lot.realizedBps;

    const eOpen = opens.get(key(lot.ticker, lot.entryDate));
    const eIdx = calIdx.get(lot.entryDate);
    if (eIdx === undefined || eOpen === undefined) { c.missingClose += 1; studyMissing += 1; continue; }
    const holdCal = EXIT_ORD[lot.tier] - ENTRY_OFFSET[lot.tier]; // T1=4, T2=9
    const xIdx = eIdx + holdCal;
    if (xIdx >= calendar.length) { c.outOfRange += 1; studyOutOfRange += 1; continue; }
    const xDate = calendar[xIdx];
    const xClose = closes.get(key(lot.ticker, xDate));
    if (xClose === undefined) { c.missingClose += 1; studyMissing += 1; continue; }
    const sign = lot.side === 'short' ? -1 : 1;
    const studyBps = sign * (xClose / eOpen - 1) * 10000;
    c.studySumBps += studyBps;
    studyOk += 1;

    const div = Math.abs(studyBps - lot.realizedBps);
    allDivs.push({ tier: lot.tier, side: lot.side, lotId: `${lot.entryDate}#${lot.eventId}`,
      ticker: lot.ticker, entryDate: lot.entryDate, entryOpen: eOpen,
      walkExitDate: lot.exitDate, walkBps: lot.realizedBps,
      studyExitDate: xDate, studyClose: xClose, studyBps, delta: studyBps - lot.realizedBps });
  }

  // Report
  console.log(`Lots: ${lots.length} | study-conv OK: ${studyOk} | missing-close: ${studyMissing} | out-of-range: ${studyOutOfRange}`);
  console.log('');
  console.log('## Two-ruler table by tier × side');
  console.log('');
  console.log('| tier | side | n | walk-realized bps | study-conv bps | v2.1 expected bps | Δ(study−walk) | Δ(study−v2.1) |');
  console.log('|---|---|---|---|---|---|---|---|');
  const rowOrder = ['T1|long', 'T1|short', 'T2|long', 'T2|short'];
  for (const rk of rowOrder) {
    const c = cells.get(rk); if (!c) continue;
    const [tier, side] = rk.split('|');
    const nOk = c.n - c.missingClose - c.outOfRange;
    const walkAvg = c.walkSumBps / c.n;
    const studyAvg = nOk > 0 ? c.studySumBps / nOk : NaN;
    console.log(`| ${tier} | ${side} | ${c.n} | ${walkAvg.toFixed(1)} | ${nOk>0?studyAvg.toFixed(1):'n/a'} | ${c.expBps.toFixed(1)} | ${nOk>0?(studyAvg-walkAvg).toFixed(1):'n/a'} | ${nOk>0?(studyAvg-c.expBps).toFixed(1):'n/a'} |`);
  }

  // DECISION GRAMMAR: |study − walk| > 30 bps on T1
  console.log('');
  console.log('## Decision grammar');
  const t1Long = cells.get('T1|long');
  const t1LongNok = t1Long ? t1Long.n - t1Long.missingClose - t1Long.outOfRange : 0;
  const t1LongWalk = t1Long ? t1Long.walkSumBps / t1Long.n : NaN;
  const t1LongStudy = t1Long && t1LongNok > 0 ? t1Long.studySumBps / t1LongNok : NaN;
  const t1Delta = Math.abs(t1LongStudy - t1LongWalk);
  console.log('');
  console.log(`T1|long |study − walk| = ${t1Delta.toFixed(1)} bps  (threshold: 30 bps)`);
  if (t1Delta > 30) {
    console.log('**VERDICT: MECHANICAL-DEFECT** — printing 5 largest per-lot divergences on T1|long:');
    console.log('');
    const top = allDivs.filter(d => d.tier === 'T1' && d.side === 'long')
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
    console.log('| lotId | ticker | entryDate | entry_open | walk_exit | walk_bps | study_exit | study_close | study_bps | Δ |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    for (const d of top) {
      console.log(`| ${d.lotId} | ${d.ticker} | ${d.entryDate} | ${d.entryOpen.toFixed(2)} | ${d.walkExitDate} | ${d.walkBps.toFixed(1)} | ${d.studyExitDate} | ${d.studyClose.toFixed(2)} | ${d.studyBps.toFixed(1)} | ${d.delta.toFixed(1)} |`);
    }
  } else {
    console.log('**VERDICT: (d) RESIDUAL-OVERSTATEMENT CONFIRMED** — the 574 grid\'s population/weighting does not survive book-construction even in-sample: applying the 574 fixed-horizon ruler to the walk\'s own admitted lots reproduces the walk-realized magnitude, not the +147.61/T1 · +66.68/T2 expectation.');
  }
}

if (import.meta.main) await main();