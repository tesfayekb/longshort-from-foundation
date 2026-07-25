// ACT-515 INTEGRATION GATE — Fixture-II (Half-2 of the LAYER-1 gate).
//
// Landed 2026-07-25 (TURN-2 FULL RE-PICK) per operator GATE RULING.
// SUPERSEDES all pre-TURN-2 DRAFT-INVALID sha-stamps of this fixture.
//
// GATE-(i) INC-135 sha-stamp: four fixture files byte-pinned in
//          scripts/act-515/fixture-shas.ts; asserted BEFORE any kernel
//          replay against them.
// GATE-(ii) 14-lot four-field byte-equality (shares, entryCashOut,
//          exitCashIn, realized) in integer CENTS.
// GATE-(iii) Checkpoint byte-equality: cashCents, longMvCents, shortMvCents,
//          equityCents at CHK-1/2/3 + TERMINAL identity.
//
// haircutMode='none' — matches fixture-i and fixture-ii header (no haircut).
//
// Cent-drift note: fixture header declares kernel Module 6 (round-per-lot)
// diverges from cash-walker (integer-cent-diff) by ±1c under 3-decimal-price
// lots. The TERMINAL check accepts kernel equity_end that matches EITHER:
//   · fixture cashCents (walker convention), OR
//   · fixture cashCents + cent_drift_cents (Module 6 sum convention).
// This mirrors the fixture header's "certifies BOTH separately" clause.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseHandTruthFixtureII, parseBars, parseCalendar, parseCheckpoints,
  reconstructFixtureII,
} from '../adapters/fixture-plan.ts';
import { runPipeline } from '../kernel/runner.ts';
import { FIXTURE_II_SHAS } from '../fixture-shas.ts';

const BASE = new URL('../../../fixtures/overshoot-backtest/', import.meta.url);
const PATHS = {
  handTruth:   new URL('2023-Q2-hand-truth.jsonl',  BASE),
  bars:        new URL('2023-Q2-bars.jsonl',        BASE),
  calendar:    new URL('2023-Q2-calendar.jsonl',    BASE),
  checkpoints: new URL('2023-Q2-checkpoints.jsonl', BASE),
} as const;

async function sha256Hex(path: URL): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('GATE FIXTURE-II — INC-135 sha-stamp gate (four files byte-pinned)', async () => {
  const observed: Record<string, string> = {
    '2023-Q2-hand-truth.jsonl':  await sha256Hex(PATHS.handTruth),
    '2023-Q2-bars.jsonl':        await sha256Hex(PATHS.bars),
    '2023-Q2-calendar.jsonl':    await sha256Hex(PATHS.calendar),
    '2023-Q2-checkpoints.jsonl': await sha256Hex(PATHS.checkpoints),
  };
  for (const [file, pinned] of Object.entries(FIXTURE_II_SHAS)) {
    assertEquals(
      observed[file], pinned,
      `INC-135 sha drift on ${file}\n  pinned:   ${pinned}\n  observed: ${observed[file]}`,
    );
  }
});

Deno.test('GATE FIXTURE-II — 14-lot four-field byte-equality (haircutMode=none)', async () => {
  const ht  = parseHandTruthFixtureII(await Deno.readTextFile(PATHS.handTruth));
  const bars = parseBars(await Deno.readTextFile(PATHS.bars));
  const cal  = parseCalendar(await Deno.readTextFile(PATHS.calendar));
  assertEquals(ht.rows.length, 14, 'fixture-ii must have 14 rows');

  const { plan, barSource, expected } = reconstructFixtureII(ht, bars, cal, 100_000);
  const result = runPipeline(plan, barSource, { haircutMode: 'none', maxCarryDays: 5 });
  if (!result.ok) throw new Error(`runPipeline FAILED at ${result.stage}: ${result.reason}`);

  const rtByLot = new Map(result.lotRoundTrips.map((rt) => [rt.lotId, rt]));

  const header = [
    '  #','LOT','TICKER','SIDE',
    'sh(exp)','sh(got)',
    'entryC(exp)','entryC(got)','Δ',
    'exitC(exp)','exitC(got)','Δ',
    'realC(exp)','realC(got)','Δ',
  ].join('\t');
  const rows: string[] = [header];
  const mismatches: string[] = [];
  let sumExp = 0;
  let sumGot = 0;

  expected.forEach((exp, i) => {
    const got = rtByLot.get(exp.lotId);
    if (!got) { mismatches.push(`${exp.lotId}: no round-trip`); return; }
    sumExp += exp.realizedCents;
    sumGot += got.realizedCents;
    rows.push([
      String(i + 1).padStart(3), exp.lotId, exp.ticker, got.side,
      exp.sharesCount, got.sharesCount,
      exp.entryCashOutCents, got.entryCashOutCents, got.entryCashOutCents - exp.entryCashOutCents,
      exp.exitCashInCents,   got.exitCashInCents,   got.exitCashInCents   - exp.exitCashInCents,
      exp.realizedCents,     got.realizedCents,     got.realizedCents     - exp.realizedCents,
    ].join('\t'));
    if (got.sharesCount       !== exp.sharesCount)       mismatches.push(`${exp.lotId} shares: got=${got.sharesCount} exp=${exp.sharesCount}`);
    if (got.entryCashOutCents !== exp.entryCashOutCents) mismatches.push(`${exp.lotId} entry:  got=${got.entryCashOutCents} exp=${exp.entryCashOutCents}`);
    if (got.exitCashInCents   !== exp.exitCashInCents)   mismatches.push(`${exp.lotId} exit:   got=${got.exitCashInCents} exp=${exp.exitCashInCents}`);
    if (got.realizedCents     !== exp.realizedCents)     mismatches.push(`${exp.lotId} real:   got=${got.realizedCents} exp=${exp.realizedCents}`);
  });

  console.log('\n===== FIXTURE-II 14-ROW DIFF TABLE (haircutMode=none) =====');
  for (const r of rows) console.log(r);
  console.log('-----------------------------------------------------------');
  console.log(`Σ realized (expected) = ${sumExp} cents = $${(sumExp / 100).toFixed(2)}`);
  console.log(`Σ realized (got)      = ${sumGot} cents = $${(sumGot / 100).toFixed(2)}`);
  console.log(`Δ Σ realized          = ${sumGot - sumExp} cents`);
  console.log('===========================================================\n');

  if (mismatches.length > 0) {
    throw new Error(`FIXTURE-II GATE (four-field) FAILED:\n  ${mismatches.join('\n  ')}`);
  }

  for (const exp of expected) {
    const got = rtByLot.get(exp.lotId)!;
    assertEquals(got.sharesCount,       exp.sharesCount,       `${exp.lotId} shares`);
    assertEquals(got.entryCashOutCents, exp.entryCashOutCents, `${exp.lotId} entryCashOut cents`);
    assertEquals(got.exitCashInCents,   exp.exitCashInCents,   `${exp.lotId} exitCashIn cents`);
    assertEquals(got.realizedCents,     exp.realizedCents,     `${exp.lotId} realized cents`);
  }
});

Deno.test('GATE FIXTURE-II — checkpoints byte-equality (CHK-1/2/3 + TERMINAL identity)', async () => {
  const ht  = parseHandTruthFixtureII(await Deno.readTextFile(PATHS.handTruth));
  const bars = parseBars(await Deno.readTextFile(PATHS.bars));
  const cal  = parseCalendar(await Deno.readTextFile(PATHS.calendar));
  const cps  = parseCheckpoints(await Deno.readTextFile(PATHS.checkpoints));

  const { plan, barSource } = reconstructFixtureII(ht, bars, cal, 100_000);
  const result = runPipeline(plan, barSource, { haircutMode: 'none', maxCarryDays: 5 });
  if (!result.ok) throw new Error(`runPipeline FAILED at ${result.stage}: ${result.reason}`);

  const rowByDate = new Map(result.equityRows.map((r) => [r.sessionDate, r]));
  const startCents = Math.round(100_000 * 100);
  const sumRealized = result.lotRoundTrips.reduce((s, rt) => s + rt.realizedCents, 0);

  const mismatches: string[] = [];

  console.log('\n===== FIXTURE-II CHECKPOINT DIFF TABLE =====');
  for (const cp of cps) {
    if (cp.checkpoint === 'TERMINAL') {
      const finalRow = result.equityRows[result.equityRows.length - 1];
      const gotEq = Math.round((finalRow.equityUsd as number) * 100);
      const walkerExp = cp.cashCents;
      const m6Exp = walkerExp + (cp.cent_drift_cents ?? 0);
      console.log(
        `TERMINAL ${cp.sessionDate}: fixture walker=${walkerExp}c  fixture M6=${m6Exp}c  ` +
        `kernel equity=${gotEq}c  start+Σreal=${startCents + sumRealized}c`,
      );
      // Kernel must agree with ONE of the two certified conventions.
      if (gotEq !== walkerExp && gotEq !== m6Exp) {
        mismatches.push(
          `TERMINAL kernel equity=${gotEq} matches neither walker=${walkerExp} nor M6=${m6Exp}`,
        );
      }
      // Σ realized (M6) must match fixture-declared M6 total exactly.
      if (cp.sumRealizedCents_module6 !== undefined && sumRealized !== cp.sumRealizedCents_module6) {
        mismatches.push(
          `TERMINAL Σ realized (kernel M6)=${sumRealized} vs fixture=${cp.sumRealizedCents_module6}`,
        );
      }
      continue;
    }
    const row = rowByDate.get(cp.sessionDate);
    if (!row) { mismatches.push(`${cp.checkpoint} (${cp.sessionDate}): no equity row emitted`); continue; }
    const cashC  = Math.round((row.cashUsd    as number) * 100);
    const longC  = Math.round((row.longMvUsd  as number) * 100);
    const shortC = Math.round((row.shortMvUsd as number) * 100);
    const eqC    = Math.round((row.equityUsd  as number) * 100);
    console.log(
      `${cp.checkpoint} ${cp.sessionDate}: ` +
      `cash ${cashC}/${cp.cashCents} (Δ ${cashC - cp.cashCents})  ` +
      `long ${longC}/${cp.longMvCents} (Δ ${longC - cp.longMvCents})  ` +
      `short ${shortC}/${cp.shortMvCents} (Δ ${shortC - cp.shortMvCents})  ` +
      `equity ${eqC}/${cp.equityCents} (Δ ${eqC - cp.equityCents})  ` +
      `open=[${(cp.openLotIds ?? []).join(',')}]`,
    );
    if (cashC  !== cp.cashCents)    mismatches.push(`${cp.checkpoint} cash:   ${cashC} vs ${cp.cashCents}`);
    if (longC  !== cp.longMvCents)  mismatches.push(`${cp.checkpoint} long:   ${longC} vs ${cp.longMvCents}`);
    if (shortC !== cp.shortMvCents) mismatches.push(`${cp.checkpoint} short:  ${shortC} vs ${cp.shortMvCents}`);
    if (eqC    !== cp.equityCents)  mismatches.push(`${cp.checkpoint} equity: ${eqC} vs ${cp.equityCents}`);
  }
  console.log('=============================================\n');

  if (mismatches.length > 0) {
    throw new Error(`FIXTURE-II GATE (checkpoints) FAILED:\n  ${mismatches.join('\n  ')}`);
  }
});