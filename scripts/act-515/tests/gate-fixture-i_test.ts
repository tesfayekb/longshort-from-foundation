// ACT-515 INTEGRATION GATE — Fixture-I (Half-1 of the LAYER-1 gate).
//
// Landed 2026-07-25 per operator GATE RULING (Option A, TURN-1).
//
// GATE CONTRACT — FIXTURE-I ROW-PROJECTION (per operator PIN 2026-07-25):
//   Per-lot FOUR-field byte-equality in CENTS:
//     · sharesCount         == fixture.shares
//     · entryCashOutCents   == round(shares × entry_open × 100)
//     · exitCashInCents     == round(shares × exit_close × 100)
//     · realizedCents       == round(pnl_usd × 100)
//   Plus TERMINAL IDENTITY:
//     · equity_end_cents    == equity_start_cents + Σ realizedCents
//
//   haircutMode='none' for fixture-i (fixture pnl_rule declares no
//   haircut — header verbatim: "pnl_usd = shares * (exit_close −
//   entry_open)"). Stated here + in the gate artifact.
//
// The test prints the full 20-row diff table even on PASS (per operator
// pin: "print the full 20-row diff table even on pass").
//
// GATE-(iii) — scope note: `selection-parity_test.ts` (at
// supabase/functions/_shared/overshoot/detector/selection-parity_test.ts)
// certifies detector-layer reproducibility. The kernel consumes corpus
// events DOWNSTREAM of the detector; no kernel-vs-detector harness exists
// or is claimed. Selection-parity greenness is verified in the gate artifact
// (see docs/06-tracking/ACT-551-reproduction-ledger.md row Gate-half-1).

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseHandTruthFixture, reconstructFixtureI,
} from '../adapters/fixture-plan.ts';
import { runPipeline } from '../kernel/runner.ts';

const FIXTURE_PATH = new URL(
  '../../../fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl',
  import.meta.url,
);

Deno.test('GATE FIXTURE-I — 4-field byte-equality + terminal identity (haircutMode=none)', async () => {
  const src = await Deno.readTextFile(FIXTURE_PATH);
  const fixture = parseHandTruthFixture(src);
  assertEquals(fixture.rows.length, 20, 'fixture-i must have 20 rows');

  const { plan, barSource, expected, startingEquityUsd, endingEquityExpectedUsd } =
    reconstructFixtureI(fixture, 100_000);

  const result = runPipeline(plan, barSource, { haircutMode: 'none', maxCarryDays: 5 });
  if (!result.ok) {
    throw new Error(`runPipeline FAILED at ${result.stage}: ${result.reason}`);
  }

  // Index round-trips by lotId.
  const rtByLot = new Map(result.lotRoundTrips.map((rt) => [rt.lotId, rt]));

  // Print the FULL 20-row diff table (per operator pin — even on PASS).
  const rows: string[] = [];
  rows.push(
    [
      '  #', 'TICKER',
      'sh(exp)', 'sh(got)',
      'entryCents(exp)', 'entryCents(got)', 'Δ',
      'exitCents(exp)', 'exitCents(got)',  'Δ',
      'realCents(exp)', 'realCents(got)',  'Δ',
    ].join('\t'),
  );

  let totalRealizedExpected = 0;
  let totalRealizedGot = 0;
  const mismatches: string[] = [];

  expected.forEach((exp, i) => {
    const got = rtByLot.get(exp.lotId);
    if (!got) {
      mismatches.push(`ROW ${i} ${exp.ticker}: no round-trip produced`);
      return;
    }
    const dEntry = got.entryCashOutCents - exp.entryCashOutCents;
    const dExit = got.exitCashInCents - exp.exitCashInCents;
    const dReal = got.realizedCents - exp.realizedCents;
    rows.push(
      [
        String(i + 1).padStart(3), exp.ticker,
        exp.sharesCount, got.sharesCount,
        exp.entryCashOutCents, got.entryCashOutCents, dEntry,
        exp.exitCashInCents, got.exitCashInCents, dExit,
        exp.realizedCents, got.realizedCents, dReal,
      ].join('\t'),
    );
    totalRealizedExpected += exp.realizedCents;
    totalRealizedGot += got.realizedCents;
    if (got.sharesCount !== exp.sharesCount) mismatches.push(`${exp.ticker}: shares ${got.sharesCount} != ${exp.sharesCount}`);
    if (got.entryCashOutCents !== exp.entryCashOutCents) mismatches.push(`${exp.ticker}: entry ${got.entryCashOutCents} != ${exp.entryCashOutCents}`);
    if (got.exitCashInCents !== exp.exitCashInCents) mismatches.push(`${exp.ticker}: exit  ${got.exitCashInCents} != ${exp.exitCashInCents}`);
    if (got.realizedCents !== exp.realizedCents) mismatches.push(`${exp.ticker}: real  ${got.realizedCents} != ${exp.realizedCents}`);
  });

  console.log('\n===== FIXTURE-I 20-ROW DIFF TABLE (haircutMode=none) =====');
  for (const r of rows) console.log(r);
  console.log('----------------------------------------------------------');
  console.log(`Σ realized (expected) = ${totalRealizedExpected} cents = $${(totalRealizedExpected / 100).toFixed(2)}`);
  console.log(`Σ realized (got)      = ${totalRealizedGot} cents = $${(totalRealizedGot / 100).toFixed(2)}`);

  const finalRow = result.equityRows[result.equityRows.length - 1];
  const startCents = Math.round(startingEquityUsd * 100);
  const endCentsGot = Math.round((finalRow.equityUsd as number) * 100);
  const endCentsExp = Math.round(endingEquityExpectedUsd * 100);
  console.log(`Terminal equity: start=${startCents}c, expected=${endCentsExp}c, got=${endCentsGot}c, Δ=${endCentsGot - endCentsExp}c`);
  console.log(`Terminal identity: equity_start + Σ realized = ${startCents + totalRealizedGot}c; kernel equity_end = ${endCentsGot}c`);
  console.log('==========================================================\n');

  if (mismatches.length > 0) {
    throw new Error(`FIXTURE-I GATE FAILED:\n  ${mismatches.join('\n  ')}`);
  }

  // Byte-exact assertions.
  for (const exp of expected) {
    const got = rtByLot.get(exp.lotId)!;
    assertEquals(got.sharesCount, exp.sharesCount, `${exp.ticker} shares`);
    assertEquals(got.entryCashOutCents, exp.entryCashOutCents, `${exp.ticker} entryCashOut cents`);
    assertEquals(got.exitCashInCents, exp.exitCashInCents, `${exp.ticker} exitCashIn cents`);
    assertEquals(got.realizedCents, exp.realizedCents, `${exp.ticker} realized cents`);
  }

  // Terminal identity.
  assertEquals(endCentsGot, startCents + totalRealizedGot, 'terminal equity != start + Σ realized');
  assertEquals(endCentsGot, endCentsExp, 'terminal equity != hand-computed expected ending equity');
});

Deno.test('GATE FIXTURE-I — session grid matches fixture ordinal-10 exit convention', async () => {
  const src = await Deno.readTextFile(FIXTURE_PATH);
  const fixture = parseHandTruthFixture(src);
  const { plan } = reconstructFixtureI(fixture, 100_000);
  // event_date = 2024-05-02 (ord-0); T2 → ord-10 → 2024-05-16.
  const exitDate = plan.calendar.sessionAfter(fixture.header.as_of_event_date, 10);
  assertEquals(exitDate, fixture.header.exit_date, 'calendar sessionAfter(event, 10) must equal fixture exit_date');
  // Entry = ord-1.
  const entryDate = plan.calendar.sessionAfter(fixture.header.as_of_event_date, 1);
  assertEquals(entryDate, fixture.header.entry_date, 'calendar sessionAfter(event, 1) must equal fixture entry_date');
});