/**
 * Source-sentinel + dirty-bit / slot-assignment behavior tests for the
 * `longshort-combiner-tick` cron edge fn — FP-057 Sub-step 3 /
 * DEC-070 clause (d) regression contract.
 *
 * Tests prove the STOP-condition shape: cron-auth, productionClock
 * sole-source (DEC-034 cl.4), JOB_REGISTRY_ID identity, the
 * dirty-bit basis (signal_observations.computed_at — no new column),
 * the monotonic data-derived slot counter, the slot-aware audit
 * envelope, and the partial-assemble guard wiring (`.completed`
 * emitted ONLY after orch.run returns).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

// Code-only view (strip block comments, leading-star jsdoc lines, and
// trailing line comments) so audit-marker substring scans don't false-
// match on the file's narrative jsdoc header.
const CODE_ONLY = HANDLER_SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\*.*$/gm, '')
  .replace(/\/\/.*$/gm, '');

Deno.test('(t1) cron auth wired via verifyCronSecret (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes('verifyCronSecret(req)'), 'missing verifyCronSecret call');
  assert(HANDLER_SOURCE.includes("'../_shared/cron-auth.ts'"), 'missing cron-auth import');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron handler');
});

Deno.test('(t2) productionClock is the sole wall-clock source — slot is DATA-derived (DEC-034 cl.4)', () => {
  assert(CODE_ONLY.includes('productionClock.getWallClockTs()'),
    'missing productionClock.getWallClockTs() call');
  assert(!/new\s+Date\s*\(\s*\)/.test(CODE_ONLY), 'wall-clock leak: new Date()');
  assert(!/Date\.now\s*\(/.test(CODE_ONLY), 'wall-clock leak: Date.now()');
  assert(!/performance\.now\s*\(/.test(CODE_ONLY), 'wall-clock leak: performance.now()');
});

Deno.test('(t3) JOB_REGISTRY_ID is "longshort.combiner.tick" (own primitive — NOT reusing the date-grain crons)', () => {
  assert(CODE_ONLY.includes("JOB_REGISTRY_ID = 'longshort.combiner.tick'"),
    'missing JOB_REGISTRY_ID literal');
  assert(!CODE_ONLY.includes("'longshort.combiner_assemble.compute'"),
    'must not reuse the assemble cron job id');
  assert(!CODE_ONLY.includes("'longshort.combiner_rank.compute'"),
    'must not reuse the rank cron job id');
});

Deno.test('(t4) DIRTY-bit basis is signal_observations.computed_at — NO new column', () => {
  assert(CODE_ONLY.includes("from('signal_observations')"),
    'must read signal_observations directly');
  assert(CODE_ONLY.includes("select('computed_at')"),
    'must select computed_at (the free basis — no new column)');
  // The dirty comparator uses strict-gt on computed_at strings (ISO-8601
  // monotone) — captured by the `maxSig > maxRank` predicate.
  assert(CODE_ONLY.includes('maxSig > maxRank'),
    'missing strict-gt dirty comparator');
});

Deno.test('(t5) SLOT is DATA-DERIVED monotonic MAX+1 (NOT wall-clock)', () => {
  // The slot-assignment helper queries combiner_rankings, orders by
  // intraday_slot desc, and increments. No wall-clock fallback.
  assert(CODE_ONLY.includes("from('combiner_rankings')"),
    'must read combiner_rankings for slot derivation');
  assert(CODE_ONLY.includes("order('intraday_slot'"),
    'must order by intraday_slot for monotonic MAX');
  assert(CODE_ONLY.includes('maxSlot + 1'),
    'slot must be MAX+1 (monotonic; daily build = 0; first intraday = 1)');
  // Crash-recovery / replay-determinism: no Date.now / new Date in the
  // slot helper paths — already covered by (t2).
});

Deno.test('(t6) audit envelope — tick.started / .skipped / .completed / .failed all carry trigger:tick', () => {
  for (const marker of [
    "'longshort.combiner.tick.started'",
    "'longshort.combiner.tick.skipped'",
    "'longshort.combiner.tick.completed'",
    "'longshort.combiner.tick.failed'",
  ]) {
    assert(CODE_ONLY.includes(marker), `missing audit marker ${marker}`);
  }
  assert(CODE_ONLY.includes("trigger: 'tick'"),
    'audit metadata must carry trigger:"tick"');
});

Deno.test('(t7) THREE skip gates emit .skipped with typed reason BEFORE any orchestrator runs', () => {
  for (const reason of [
    "'global_kill_switch_active'",
    "'job_disarmed'",
    "'clean_no_new_signals'",
  ]) {
    assert(CODE_ONLY.includes(`reason: ${reason}`), `missing skip reason ${reason}`);
  }
  // The three skip branches all return BEFORE the first createFeatureAssemblyOrchestrator call:
  const orchIdx = CODE_ONLY.indexOf('createFeatureAssemblyOrchestrator(');
  assert(orchIdx > 0, 'orchestrator construction must exist');
  for (const reason of [
    "'global_kill_switch_active'",
    "'job_disarmed'",
    "'clean_no_new_signals'",
  ]) {
    const idx = CODE_ONLY.indexOf(`reason: ${reason}`);
    assert(idx > 0 && idx < orchIdx,
      `skip reason ${reason} must be emitted BEFORE assembler construction`);
  }
});

Deno.test('(t8) PARTIAL-ASSEMBLE GUARD — .completed emitted AFTER orch.run returns (the slot atomicity barrier)', () => {
  // The handler awaits assembleOrch.run BEFORE the assemble.completed/.failed
  // emit. Substring-order check: orch.run call appears textually before the
  // assemble.completed audit marker in the source.
  const runIdx = CODE_ONLY.indexOf('assembleOrch.run(');
  const completedIdx = CODE_ONLY.indexOf("'longshort.combiner.assemble.completed'");
  assert(runIdx > 0, 'missing assembleOrch.run invocation');
  assert(completedIdx > 0, 'missing assemble.completed marker');
  assertEquals(
    runIdx < completedIdx,
    true,
    'assemble.completed must be emitted AFTER assembleOrch.run returns (partial-assemble guard)',
  );
});

Deno.test('(t9) slot is threaded into BOTH assemble.run AND rank.run (slot-aware sequencing)', () => {
  assert(CODE_ONLY.includes('assembleOrch.run(as_of, { intraday_slot })'),
    'assembler must receive { intraday_slot }');
  assert(CODE_ONLY.includes('rankOrch.run(as_of, { intraday_slot })'),
    'ranker must receive { intraday_slot }');
});

Deno.test('(t10) failure-handling contract: 500 reserved for unexpected throw (skips and orchestrator-failed return 200)', () => {
  // apiError(500, ...) only on dirty-bit-read / slot-assignment / orch throw.
  // assemble-failed and rank-failed go via apiSuccess.
  const errorCalls = (CODE_ONLY.match(/apiError\(500/g) ?? []).length;
  assert(errorCalls === 3,
    `expected exactly 3 apiError(500) sites (dirty-bit-read, slot-assignment, orchestrator throw); got ${errorCalls}`);
});