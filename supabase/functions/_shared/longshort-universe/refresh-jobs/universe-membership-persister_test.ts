// @ts-nocheck — Deno test file.
/**
 * Tests for universe-membership-persister.ts — FP-008.4 Commit 6 / #5.
 *
 * Pins the re-run idempotency contract introduced by Commit 6:
 *   .upsert(rows, { onConflict: 'operator_id,ticker,as_of_date',
 *                   ignoreDuplicates: false })
 *
 * Coverage (per Commit 6 prompt):
 *  Test 1 — re-run with mutated payload: same (operator,ticker,as_of) keys,
 *           different long_eligible/short_eligible/refresh_id values. Asserts
 *           DO UPDATE fired (not DO NOTHING) — the critical assertion that
 *           distinguishes ignoreDuplicates:false from ignoreDuplicates:true.
 *  Test 2 — partial overlap: pins the stale-row property (rows present in
 *           run 1 only remain with run 1's refresh_id).
 *
 * Test 3 (orchestrator-level double-run smoke) lives in
 * quarterly-refresh-orchestrator_test.ts — it exercises the integration
 * (orch.run twice → both 'completed'), not the persister's UPSERT call.
 *
 * The fake supabase client below emulates PostgREST upsert semantics for the
 * `universe_membership` table only: rows keyed by (operator_id,ticker,as_of_date)
 * are overwritten on conflict when ignoreDuplicates:false, matching the
 * production .upsert() onConflict target.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { makeUniverseMembershipPersister } from './universe-membership-persister.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = '2026-04-01';

type Row = {
  operator_id: string;
  ticker: string;
  as_of_date: string;
  long_eligible: boolean;
  short_eligible: boolean;
  quarter_label: string;
  refresh_id: string;
  // FP-009 Bucket 0 / MIG-063: persisted alongside eligibility flags.
  gics_sector: string | null;
};

/**
 * Minimal fake supabase client. Supports only the call shape used by the
 * persister: client.from('universe_membership').upsert(rows, options).
 * Stores rows in a Map keyed by `${operator_id}|${ticker}|${as_of_date}` and
 * applies DO UPDATE semantics when ignoreDuplicates:false.
 */
function makeFakeSupabase() {
  const store = new Map<string, Row>();
  const upsertCalls: Array<{ rows: Row[]; options: unknown }> = [];
  const client = {
    from(table: string) {
      assertEquals(table, 'universe_membership', 'persister must target universe_membership');
      return {
        async upsert(rows: Row[], options: { onConflict: string; ignoreDuplicates: boolean }) {
          upsertCalls.push({ rows, options });
          // Contract assertions: the persister MUST set onConflict to the PK
          // and ignoreDuplicates to false (DO UPDATE). If either drifts, the
          // fake fails fast and the test surfaces the regression.
          assertEquals(
            options.onConflict,
            'operator_id,ticker,as_of_date',
            'onConflict must target the PK',
          );
          assertEquals(
            options.ignoreDuplicates,
            false,
            'ignoreDuplicates must be false (DO UPDATE, not DO NOTHING)',
          );
          for (const r of rows) {
            const k = `${r.operator_id}|${r.ticker}|${r.as_of_date}`;
            store.set(k, { ...r }); // last-writer-wins overwrite
          }
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as Parameters<typeof makeUniverseMembershipPersister>[0], store, upsertCalls };
}

Deno.test('Test 1 — re-run with mutated payload: DO UPDATE fires (last-writer-wins on PK)', async () => {
  const { client, store, upsertCalls } = makeFakeSupabase();
  const persister = makeUniverseMembershipPersister(client);

  // Run 1: A, B, C all long-eligible, short-ineligible, refresh R1.
  await persister.persist({
    operator_id: OPERATOR_ID,
    as_of_date: AS_OF,
    quarter_label: 'Q2_2026',
    refresh_id: 'R1',
    rows: [
      { ticker: 'AAA', long_eligible: true, short_eligible: false, gics_sector: null },
      { ticker: 'BBB', long_eligible: true, short_eligible: false, gics_sector: null },
      { ticker: 'CCC', long_eligible: true, short_eligible: false, gics_sector: null },
    ],
  });

  // Run 2: same tickers, MUTATED eligibility (now short-eligible too), refresh R2.
  await persister.persist({
    operator_id: OPERATOR_ID,
    as_of_date: AS_OF,
    quarter_label: 'Q2_2026',
    refresh_id: 'R2',
    rows: [
      { ticker: 'AAA', long_eligible: true, short_eligible: true, gics_sector: null },
      { ticker: 'BBB', long_eligible: false, short_eligible: true, gics_sector: null },
      { ticker: 'CCC', long_eligible: true, short_eligible: true, gics_sector: null },
    ],
  });

  // (a) Neither call threw — implicit (would have rejected above).
  // (b) Row count = 3, not 6, not error.
  assertEquals(store.size, 3);
  // (c) Rows reflect the second call's eligibility values (DO UPDATE fired).
  const aaa = store.get(`${OPERATOR_ID}|AAA|${AS_OF}`)!;
  const bbb = store.get(`${OPERATOR_ID}|BBB|${AS_OF}`)!;
  const ccc = store.get(`${OPERATOR_ID}|CCC|${AS_OF}`)!;
  assertEquals(aaa.short_eligible, true, 'AAA short_eligible must be overwritten to true');
  assertEquals(bbb.long_eligible, false, 'BBB long_eligible must be overwritten to false');
  assertEquals(ccc.short_eligible, true, 'CCC short_eligible must be overwritten to true');
  // (d) refresh_id = R2 on all rows (last-writer-wins on the refresh reference).
  assertEquals(aaa.refresh_id, 'R2');
  assertEquals(bbb.refresh_id, 'R2');
  assertEquals(ccc.refresh_id, 'R2');
  // Two upsert calls issued (one per persist).
  assertEquals(upsertCalls.length, 2);
});

Deno.test('Test 2 — partial overlap: stale-row property (A from run 1 remains untouched)', async () => {
  const { client, store } = makeFakeSupabase();
  const persister = makeUniverseMembershipPersister(client);

  // Run 1: [A, B, C] with refresh R1.
  await persister.persist({
    operator_id: OPERATOR_ID,
    as_of_date: AS_OF,
    quarter_label: 'Q2_2026',
    refresh_id: 'R1',
    rows: [
      { ticker: 'AAA', long_eligible: true, short_eligible: false, gics_sector: null },
      { ticker: 'BBB', long_eligible: true, short_eligible: false, gics_sector: null },
      { ticker: 'CCC', long_eligible: true, short_eligible: false, gics_sector: null },
    ],
  });

  // Run 2: [B, C, D] with refresh R2. A is NOT in this batch.
  await persister.persist({
    operator_id: OPERATOR_ID,
    as_of_date: AS_OF,
    quarter_label: 'Q2_2026',
    refresh_id: 'R2',
    rows: [
      { ticker: 'BBB', long_eligible: true, short_eligible: true, gics_sector: null },
      { ticker: 'CCC', long_eligible: true, short_eligible: true, gics_sector: null },
      { ticker: 'DDD', long_eligible: true, short_eligible: false, gics_sector: null },
    ],
  });

  // (a) Row count = 4 (A from run 1 stays, B+C updated, D inserted).
  assertEquals(store.size, 4);
  // (b) A's refresh_id = R1 (not touched by call 2 — stale-row property).
  const aaa = store.get(`${OPERATOR_ID}|AAA|${AS_OF}`)!;
  assertEquals(aaa.refresh_id, 'R1', 'A must retain R1 (run 2 did not include it)');
  // (c) B and C's refresh_id = R2 (updated in place).
  assertEquals(store.get(`${OPERATOR_ID}|BBB|${AS_OF}`)!.refresh_id, 'R2');
  assertEquals(store.get(`${OPERATOR_ID}|CCC|${AS_OF}`)!.refresh_id, 'R2');
  // (d) D exists with refresh_id = R2 (newly inserted by run 2).
  const ddd = store.get(`${OPERATOR_ID}|DDD|${AS_OF}`);
  assert(ddd !== undefined, 'D must have been inserted by run 2');
  assertEquals(ddd!.refresh_id, 'R2');
});