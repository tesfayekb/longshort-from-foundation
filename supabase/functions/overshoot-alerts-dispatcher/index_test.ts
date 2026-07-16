import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

Deno.test('INC-97 watchdog owns an independent Alpaca-vs-ledger A5 scan', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes('async function scanBrokerLedgerDivergence('));
  assert(src.includes('new OvershootAlpacaPositionFetcher'));
  assert(src.includes(".from('overshoot_lots')"));
  assert(src.includes('computeIndependentA5Diff(brokerMap, ledgerMap)'));
  assert(src.includes("trigger_kind: 'a5_broker_ledger_divergence'"));
  assert(src.includes('scanBrokerLedgerDivergence(correlationId)'));
});

Deno.test('INC-97 fill-sweep overdue mapping uses sweep-owned heartbeat, never entry runs', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes("'overshoot.fill_sweep':             { table: 'overshoot_audit_logs',       tsCol: 'created_at', action: 'overshoot.fill_sweep.tick' }"));
  assert(!src.includes("'overshoot.fill_sweep':             { table: 'overshoot_entry_runs'"));
});

Deno.test('INC-97 dispatcher response echoes independent A5 count and version (INC-108 rebumped)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes('independent_a5: independentA5.length'));
  // INC-108 (2026-07-15) bumped the version echo to reflect the SI
  // mapping repoint from settlement date (as_of_date) to ingest time
  // (computed_at).
  assert(src.includes("'inc108-si-computed-at-mapping-20260715'"));
});

Deno.test('INC-108 SI overdue mapping uses computed_at (ingest time), never as_of_date (settlement date)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // Positive: the SI mapping must read the ingest-time column.
  assert(src.includes("'overshoot.short_interest.compute': { table: 'overshoot_short_interest',   tsCol: 'computed_at' }"));
  // Negative: the settlement-date column must NOT appear as a watchdog
  // heartbeat column for any leg. `as_of_date` is a publish/settlement
  // date, not a fire time. THIRD-instance guard against the trigger->
  // artifact mapping defect class (INC-97 / INC-107 / INC-108).
  assert(!src.includes("tsCol: 'as_of_date'"));
});

Deno.test('INC-107 exit.run overdue mapping repointed from overshoot_entry_runs to audit-prefix', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // Exit-run must NOT read entry-run artifacts (the two-sided defect).
  assert(!src.includes("'overshoot.exit.run':               { table: 'overshoot_entry_runs'"));
  // Exit-run must read overshoot_audit_logs with the overshoot.exit. prefix.
  assert(src.includes("'overshoot.exit.run':               { table: 'overshoot_audit_logs',       tsCol: 'created_at', actionPrefix: 'overshoot.exit.' }"));
  // Dispatcher plumbs actionPrefix through the query.
  assert(src.includes(".like('action' as never, `${m.actionPrefix}%` as never)"));
});

Deno.test('INC-107 armedAt floor plumbed through scanCronOverdue', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // Registry SELECT must include updated_at for the arm-time proxy.
  assert(src.includes(".select('id, schedule, enabled, status, updated_at')"));
  // Floor must be passed to evaluateOverdue as the 5th arg.
  assert(src.includes('evaluateOverdue(schedule, now, lastTs, TOLERANCE_MS, armedAtMs)'));
});

Deno.test('INC-97 fill-sweep alert scan reads real audit artifacts, not nonexistent entry-run counters', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes(".in('action', ['overshoot.fill_sweep.discovery_shortfall', 'overshoot.fill_sweep.a5_divergence'])"));
  assert(!src.includes(".select('run_id, submitted_count, adopted_count, created_at')"));
});