// ACT-515 Matrix — Turn-2B: admit + parity driver.
//
// Executes the certified reconstructor over the pinned slate + Stage-A
// closes + pinned calendar, emits:
//   · scripts/act-515/matrix/cache/admit-trace.jsonl  (per-partition summary)
//   · scripts/act-515/matrix/cache/turn-2b-lots.jsonl (admitted lots → Stage-B)
//   · stdout: parity table for ≥40 sampled partitions per DEV-U contract.
//
// Zero network. All inputs are sealed cache files. Emits summary JSON at
// end for the Turn-2B manifest.

import { streamSlateFile, PARITY_K } from './slate-row.ts';
import type { SlateRow } from './slate-row.ts';
import { ArraySessionCalendar } from '../../kernel/exit.ts';
import {
  checkPartition, selectSampleSessions, summarize, emptyBookProbe,
} from './parity-harness.ts';
import type { PartitionParityResult } from './parity-harness.ts';
import { FileR1DataSource, stageACloseKey } from './file-data-source.ts';
import { entryOffsetForSideTier } from '../reconstructor.ts';
import type { SideDb } from '../../kernel/types.ts';
import type { SessionDate } from '../../kernel/clock.ts';

const CACHE_DIR = new URL('../cache/', import.meta.url).pathname;
const SLATE_YEARS = [2022, 2023, 2024, 2025, 2026] as const;

type PartKey = string; // `${session}|${side}`

async function main() {
  // 1. Load calendar.
  const calText = await Deno.readTextFile(`${CACHE_DIR}calendar.jsonl`);
  const calSessions = calText.split('\n').filter(l => l.length > 0)
    .map(l => (JSON.parse(l) as { session: string }).session);
  const cal = new ArraySessionCalendar(calSessions);
  const offset = { sessionAfter: (s: string, n: number) => cal.sessionAfter(s, n) };

  // 2. Load Stage-A closes into a Map lookup.
  const src = new FileR1DataSource({
    cacheDir: CACHE_DIR, slateYears: [...SLATE_YEARS],
    barsPairsPath: `${CACHE_DIR}bars-pairs.jsonl`,
  });
  const closesMap = await src.loadStageACloses();
  const closes = (t: string, s: SessionDate) => {
    const v = closesMap.get(stageACloseKey(t, s));
    return v ?? null;
  };

  // 3. Load and partition slate by (session, side), preserving slate_rank order.
  const parts = new Map<PartKey, SlateRow[]>();
  let slateRows = 0;
  for (const y of SLATE_YEARS) {
    for await (const r of streamSlateFile(`${CACHE_DIR}slate-${y}.jsonl`)) {
      slateRows += 1;
      const k = `${r.session}|${r.side}`;
      let arr = parts.get(k);
      if (!arr) { arr = []; parts.set(k, arr); }
      arr.push(r);
    }
  }
  for (const arr of parts.values()) arr.sort((a, b) => a.slate_rank - b.slate_rank);

  // 4. Run checkPartition over EVERY partition. Emit admit-trace + lots.
  const traceOut = await Deno.open(`${CACHE_DIR}admit-trace.jsonl`,
    { create: true, write: true, truncate: true });
  const lotsOut = await Deno.open(`${CACHE_DIR}turn-2b-lots.jsonl`,
    { create: true, write: true, truncate: true });
  const traceW = traceOut.writable.getWriter();
  const lotsW = lotsOut.writable.getWriter();
  const enc = new TextEncoder();

  const allResults: PartitionParityResult[] = [];
  const stopsAll: unknown[] = [];
  let admitsTotal = 0;
  let pruneRiskSessions = 0;   // partitions with admits<K AND rows==SLATE_TOP_N
  const admitsBySide: Record<SideDb, number> = { long: 0, short: 0 };
  const typedTotals: Record<string, number> = {
    entry_price_missing: 0, no_cell_or_rank_null: 0,
    position_already_open: 0, allocation_cap_reached: 0, short_daily_budget_reached: 0,
  };
  const sortedParts = [...parts.keys()].sort();
  for (const k of sortedParts) {
    const [session, sideS] = k.split('|');
    const side = sideS as SideDb;
    const rows = parts.get(k)!;
    const res = checkPartition(session, side, rows, closes, offset, emptyBookProbe(), PARITY_K);
    allResults.push(res);
    admitsTotal += res.denoAdmits.length;
    admitsBySide[side] += res.denoAdmits.length;
    for (const [c, n] of Object.entries(res.typedSkipsByClass)) typedTotals[c] += n;
    if (res.stops.length > 0) for (const s of res.stops) stopsAll.push(s);
    if (rows.length === 25 && res.denoAdmits.length < PARITY_K) pruneRiskSessions += 1;

    // admit-trace line: full per-partition record.
    await traceW.write(enc.encode(JSON.stringify({
      session, side, rows: rows.length,
      admits: res.denoAdmits,
      typed_skips: res.typedSkipsByClass,
      stops: res.stops.map(s => ({ reason: s.reason, ticker: s.ticker, event_id: s.eventId,
        rank: s.slateRank, detail: s.detail })),
      passed: res.passed,
    }) + '\n'));

    // lots for Stage-B: derive entryDate and tier from originating slate row.
    for (const a of res.denoAdmits) {
      const row = rows.find(r => r.event_id === a.eventId && r.ticker === a.ticker)!;
      const entry = offset.sessionAfter(row.session, entryOffsetForSideTier(row.side, row.tier));
      if (!entry) continue;
      await lotsW.write(enc.encode(JSON.stringify({
        lotId: `${row.session}:${row.side}:${row.tier}:${row.ticker}:${row.event_id}`,
        ticker: row.ticker, side: row.side, tier: row.tier,
        eventDate: row.session, entryDate: entry,
      }) + '\n'));
    }
  }
  await traceW.close();
  await lotsW.close();

  // 5. Parity table: ≥40 sampled partitions.
  const sessSorted = [...new Set(sortedParts.map(k => k.split('|')[0]))].sort();
  const sampled = selectSampleSessions(sessSorted);
  const table: unknown[] = [];
  let sampledCount = 0;
  for (const s of sampled) for (const side of ['long', 'short'] as const) {
    const r = allResults.find(x => x.session === s && x.side === side);
    if (!r) continue;
    sampledCount += 1;
    table.push({
      session: s, side, rows: r.rowsChecked, admits: r.denoAdmits.length,
      stops: r.stops.length, passed: r.passed,
      typed_skips: r.typedSkipsByClass,
    });
  }

  const sum = summarize(allResults);
  const manifest = {
    slate_rows_seen: slateRows,
    partitions_total: allResults.length,
    partitions_sampled: sampledCount,
    admits_total: admitsTotal,
    admits_by_side: admitsBySide,
    typed_skip_totals: typedTotals,
    stops_total: stopsAll.length,
    all_green: stopsAll.length === 0,
    prune_risk_sessions: pruneRiskSessions,
    parity_table_first_10: table.slice(0, 10),
    parity_table_total_rows: table.length,
    summary: sum,
  };
  console.log(JSON.stringify(manifest, null, 2));
  if (stopsAll.length > 0) {
    console.error(`PARITY STOP: ${stopsAll.length} stops`);
    console.error(JSON.stringify(stopsAll.slice(0, 5), null, 2));
    Deno.exit(3);
  }
  // dump full parity table for the manifest
  await Deno.writeTextFile(`${CACHE_DIR}parity-table.json`, JSON.stringify(table, null, 2));
  console.log(`parity table written: ${table.length} partitions -> parity-table.json`);
}

if (import.meta.main) await main();