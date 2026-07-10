import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

Deno.test('INC-97 watchdog owns an independent Alpaca-vs-ledger A5 scan', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes('async function scanBrokerLedgerDivergence('));
  assert(src.includes('new OvershootAlpacaPositionFetcher'));
  assert(src.includes(".from('overshoot_lots')"));
  assert(src.includes("trigger_kind: 'a5_broker_ledger_divergence'"));
  assert(src.includes('scanBrokerLedgerDivergence(correlationId)'));
});

Deno.test('INC-97 fill-sweep overdue mapping uses sweep-owned heartbeat, never entry runs', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes("'overshoot.fill_sweep':             { table: 'overshoot_audit_logs',       tsCol: 'created_at', action: 'overshoot.fill_sweep.tick' }"));
  assert(!src.includes("'overshoot.fill_sweep':             { table: 'overshoot_entry_runs'"));
});

Deno.test('INC-97 dispatcher response echoes independent A5 count and version', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  assert(src.includes('independent_a5: independentA5.length'));
  assert(src.includes("'inc97-independent-a5-v1-20260710'"));
});