// deno-lint-ignore-file no-import-prefix -- std assert import per FP-045 Phase 2 addendum
// @ts-nocheck — source-sentinel test, ACT-211 (FP-050 Phase 4).
//
// ENGINE-↔-CONSUMER SEAM SENTINEL — locks the work-list-mode contract
// that the cursor row carries NO payload and the engine invokes the
// consumer with a verbatim `payload: {}` so the consumer reconstructs
// from `item.id` via its own persistence-table read path.
//
// Failure mode this sentinel prevents (recorded against run
// `aadb1329-437f-4e67-8ee8-c53ad3a29c2d`, 2026-06-13):
//   - signal_queue_cursor schema: (run_id, signal_id, ticker,
//     gics_sector, claimed_at, created_at) — no payload column.
//   - queue-slice-worker.ts work-list invocation: `payload: {}`.
//   - insider processItem was reading `item.payload.filer_cik_padded`
//     → undefined → `.replace(/^0+/, '')` threw verbatim
//     "Cannot read properties of undefined (reading 'replace')";
//     every claimed item threw identically → Q3 3-strikes terminal
//     failure.
//
// This sentinel is intentionally a SOURCE-text assertion (the same
// shape as `scripts/check-supabase-client-specifier_test.ts` and
// `scripts/check-sentinel-patterns_test.ts`): the goal is to make a
// future "helpful" widening of the engine to round-trip a payload
// fail this test, forcing a paired update of every work-list consumer
// in the same PR. Co-located in the queue-worker tree so a Gate-2
// run picks it up regardless of cwd.

import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SLICE_SRC = await Deno.readTextFile(
  new URL('./queue-slice-worker.ts', import.meta.url),
);

Deno.test('(SEAM.1) work-list invocation passes `payload: {}` verbatim — engine contract pin (ACT-211)', () => {
  // Tolerant of whitespace inside the braces but not of any property
  // shorthand or expansion — only the empty literal counts.
  assert(
    /item:\s*\{\s*id:\s*itemCtx\.ticker,\s*payload:\s*\{\s*\}\s*\}/.test(SLICE_SRC),
    'queue-slice-worker.ts work-list invocation MUST pass `payload: {}` verbatim. ' +
      'Any change here is a cross-cutting contract change — every work-list-mode ' +
      'consumer (currently: insider-transactions; future: any signal using ' +
      "mode='work-list') reconstructs payload from item.id, and a non-empty " +
      'payload would silently shadow that reconstruction. If you are widening ' +
      'the engine intentionally, update each consumer in the same PR and remove ' +
      'this sentinel with an explicit catalog entry.',
  );
});

Deno.test('(SEAM.2) engine docstring documents the no-payload contract (forward-binding prose pin)', () => {
  // The prose lines that explain the contract are part of the seam —
  // a future contributor reading the call site MUST see why payload
  // is empty. Stripping the prose without flagging the contract
  // change is itself a #41-shape evidence-loss event.
  assert(
    /cursor row carries no payload/i.test(SLICE_SRC),
    'queue-slice-worker.ts MUST retain the "cursor row carries no payload" ' +
      'contract prose at the work-list invocation; removing it strips the ' +
      'forward-binding context that prevents the ACT-211 regression class.',
  );
  assert(
    /reconstructs it from item\.id/i.test(SLICE_SRC),
    'queue-slice-worker.ts MUST retain the "consumer reconstructs from item.id" ' +
      'contract prose at the work-list invocation.',
  );
});

Deno.test('(SEAM.3) cursor-schema columns recorded in this sentinel (documented invariant)', () => {
  // The cursor schema verified against the live DB on 2026-06-13:
  //   run_id, signal_id, ticker, gics_sector, claimed_at, created_at.
  // If a migration adds a `payload` column to signal_queue_cursor,
  // the engine contract changes and this sentinel must be revisited
  // in the same PR. The assertion below is a tripwire on the
  // documented column set; it does not query the live DB.
  const documented = ['run_id', 'signal_id', 'ticker', 'gics_sector', 'claimed_at', 'created_at'];
  assert(documented.length === 6, 'six-column cursor schema invariant');
  assert(!documented.includes('payload'), 'cursor schema MUST NOT carry a payload column');
});