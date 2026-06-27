/**
 * FP-057 Sub-step 5 — persistence-check tests. Covers:
 *   (1) parsePersistN / parsePersistCooldownS strict-parse (defaults, ≥1, throws)
 *   (2) countConsecutiveUnexplained:
 *         - 3 consecutive unexplained → 3
 *         - in-band STOPS scan (reset)
 *         - exempt rows SKIP (neither reset nor advance)
 *         - NON-COMPOUNDING: short_stop@T then unexplained@T+1 → counter=1
 *         - mixed: exempt-then-unexplained-then-in-band → 0 (in-band resets)
 *   (3) buildRebalanceAggregatePersistenceCheck flow:
 *         - below threshold → no write
 *         - at threshold + no prior persistence → write (escalated)
 *         - at threshold + within cooldown → no write (latched)
 *         - at threshold + past cooldown → re-escalates (latch-released)
 *         - injects threaded ts (NEVER new Date())
 */
import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildRebalanceAggregatePersistenceCheck,
  countConsecutiveUnexplained,
  DEFAULT_PERSIST_COOLDOWN_S,
  DEFAULT_PERSIST_N,
  parsePersistCooldownS,
  parsePersistN,
  PERSIST_ACTION,
  PERSIST_CALL_NAME,
  type AggregateHistoryReader,
  type AggregateHistoryRow,
  type PersistenceEventWriter,
} from './rebalance-aggregate-persistence.ts';

function envOf(map: Record<string, string>): { get(k: string): string | undefined } {
  return { get: (k) => map[k] };
}

const TS = new Date('2026-06-24T20:30:00Z');
const opId = '00000000-0000-0000-0000-000000000001';

function unexplained(t: Date): AggregateHistoryRow {
  return { ts: t, outcome: 'failure_escalated', exempt_cause: null };
}
function exempt(t: Date, cause: 'short_stop' | 'partial_fill' | 'working_order'): AggregateHistoryRow {
  return { ts: t, outcome: 'failure_escalated', exempt_cause: cause };
}
function inBand(t: Date): AggregateHistoryRow {
  return { ts: t, outcome: 'false_positive_within_tolerance', exempt_cause: null };
}

/* ───── (1) env parse ───── */

Deno.test('parsePersistN — default = 3 when unset', () => {
  assertEquals(parsePersistN(envOf({})), 3);
  assertEquals(DEFAULT_PERSIST_N, 3);
});
Deno.test('parsePersistN — env override accepted (5)', () => {
  assertEquals(parsePersistN(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: '5' })), 5);
});
Deno.test('parsePersistN — STOP: 0 / negative / float / empty → throws (no silent 0)', () => {
  assertThrows(() => parsePersistN(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: '0' })));
  assertThrows(() => parsePersistN(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: '-1' })));
  assertThrows(() => parsePersistN(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: '2.5' })));
  assertThrows(() => parsePersistN(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: '' })));
  assertThrows(() => parsePersistN(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: 'three' })));
});
Deno.test('parsePersistCooldownS — default 3600, accepts overrides, rejects <1', () => {
  assertEquals(parsePersistCooldownS(envOf({})), 3600);
  assertEquals(DEFAULT_PERSIST_COOLDOWN_S, 3600);
  assertEquals(parsePersistCooldownS(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S: '60' })), 60);
  assertThrows(() => parsePersistCooldownS(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S: '0' })));
  assertThrows(() => parsePersistCooldownS(envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S: '' })));
});

/* ───── (2) pure counter ───── */

const t = (offsetSec: number): Date => new Date(TS.getTime() - offsetSec * 1000);

Deno.test('counter — 3 consecutive unexplained (most-recent-first) → 3', () => {
  const rows = [unexplained(t(0)), unexplained(t(60)), unexplained(t(120))];
  assertEquals(countConsecutiveUnexplained(rows), 3);
});

Deno.test('counter — in-band STOPS (RESET-ON-IN-BAND, not M-of-N)', () => {
  const rows = [unexplained(t(0)), unexplained(t(60)), inBand(t(120)), unexplained(t(180))];
  // Reset at t-120; counter is 2 at the stop point (the two more-recent unexplained).
  assertEquals(countConsecutiveUnexplained(rows), 2);
});

Deno.test('counter — in-band as MOST RECENT row resets to 0', () => {
  const rows = [inBand(t(0)), unexplained(t(60)), unexplained(t(120)), unexplained(t(180))];
  assertEquals(countConsecutiveUnexplained(rows), 0);
});

Deno.test('counter — exempt rows SKIP (neither reset nor advance) — non-compounding', () => {
  // T (most recent): unexplained → counter 1
  // T-1: short_stop exempt → SKIP (does NOT reset, does NOT advance)
  // T-2: unexplained → counter 2
  // T-3: partial_fill exempt → SKIP
  // T-4: unexplained → counter 3
  const rows = [
    unexplained(t(0)),
    exempt(t(60), 'short_stop'),
    unexplained(t(120)),
    exempt(t(180), 'partial_fill'),
    unexplained(t(240)),
  ];
  assertEquals(countConsecutiveUnexplained(rows), 3);
});

Deno.test('counter — NON-COMPOUNDING: short_stop@T then unexplained@T+1 → unexplained counts (a single stop is NOT a permanent silencer)', () => {
  // Most-recent first: unexplained then short_stop. The short_stop does
  // NOT silence the more-recent unexplained tick — counter=1.
  const rows = [unexplained(t(0)), exempt(t(60), 'short_stop')];
  assertEquals(countConsecutiveUnexplained(rows), 1);
});

Deno.test('counter — only exempt rows → 0 (no unexplained = no escalation)', () => {
  const rows = [exempt(t(0), 'working_order'), exempt(t(60), 'partial_fill'), exempt(t(120), 'short_stop')];
  assertEquals(countConsecutiveUnexplained(rows), 0);
});

Deno.test('counter — system_bug_strong rows SKIP (treated like exempt — neither reset nor advance)', () => {
  const rows: AggregateHistoryRow[] = [
    unexplained(t(0)),
    { ts: t(60), outcome: 'system_bug_strong', exempt_cause: null },
    unexplained(t(120)),
  ];
  assertEquals(countConsecutiveUnexplained(rows), 2);
});

/* ───── (3) closure flow ───── */

function mkReader(
  rows: AggregateHistoryRow[],
  lastPersistenceTs: Date | null = null,
): { reader: AggregateHistoryReader; lastBeforeTs: { v: Date | null } } {
  const lastBeforeTs = { v: null as Date | null };
  return {
    lastBeforeTs,
    reader: {
      // deno-lint-ignore require-await
      async readRecent(beforeTs, _limit) {
        lastBeforeTs.v = beforeTs;
        return rows;
      },
      // deno-lint-ignore require-await
      async readLastPersistenceTs(_beforeTs) {
        return lastPersistenceTs;
      },
    },
  };
}

function mkWriter(): { writer: PersistenceEventWriter; calls: Array<Parameters<PersistenceEventWriter['write']>[0]> } {
  const calls: Array<Parameters<PersistenceEventWriter['write']>[0]> = [];
  return {
    calls,
    writer: {
      // deno-lint-ignore require-await
      async write(args) {
        calls.push(args);
        return `evt-persist-${calls.length}`;
      },
    },
  };
}

Deno.test('closure — below threshold → no write, returns below_threshold', async () => {
  const { reader } = mkReader([unexplained(t(0)), unexplained(t(60))]);
  const { writer, calls } = mkWriter();
  const check = buildRebalanceAggregatePersistenceCheck({
    operator_id: opId, reader, writer, fetcher_source: 'live', env: envOf({}),
  });
  const r = await check(TS);
  assertEquals(calls.length, 0);
  assert(!r.escalated);
  if (!r.escalated) {
    assertEquals(r.reason, 'below_threshold');
    assertEquals(r.consecutive, 2);
    assertEquals(r.threshold, 3);
  }
});

Deno.test('closure — at threshold + no prior persistence → ESCALATES (writes pager event)', async () => {
  const { reader } = mkReader([unexplained(t(0)), unexplained(t(60)), unexplained(t(120))]);
  const { writer, calls } = mkWriter();
  const check = buildRebalanceAggregatePersistenceCheck({
    operator_id: opId, reader, writer, fetcher_source: 'live', env: envOf({}),
  });
  const r = await check(TS);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].ts.getTime(), TS.getTime(), 'must use the THREADED ts (no new Date())');
  assertEquals(calls[0].operator_id, opId);
  assertEquals(calls[0].threshold, 3);
  assertEquals(calls[0].consecutive, 3);
  assert(r.escalated);
  if (r.escalated) assertEquals(r.event_id, 'evt-persist-1');
});

Deno.test('closure — at threshold + within cooldown → no write (LATCH holds)', async () => {
  const recentPersistence = new Date(TS.getTime() - 60_000); // 60s ago
  const { reader } = mkReader(
    [unexplained(t(0)), unexplained(t(60)), unexplained(t(120))],
    recentPersistence,
  );
  const { writer, calls } = mkWriter();
  const check = buildRebalanceAggregatePersistenceCheck({
    operator_id: opId, reader, writer, fetcher_source: 'live',
    env: envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S: '3600' }),
  });
  const r = await check(TS);
  assertEquals(calls.length, 0, 'no re-page within cooldown — alert-spam guard');
  assert(!r.escalated);
  if (!r.escalated) assertEquals(r.reason, 'within_cooldown');
});

Deno.test('closure — at threshold + PAST cooldown → RE-ESCALATES (latch released; persistent break gets re-surfaced)', async () => {
  const oldPersistence = new Date(TS.getTime() - 7200_000); // 2h ago
  const { reader } = mkReader(
    [unexplained(t(0)), unexplained(t(60)), unexplained(t(120))],
    oldPersistence,
  );
  const { writer, calls } = mkWriter();
  const check = buildRebalanceAggregatePersistenceCheck({
    operator_id: opId, reader, writer, fetcher_source: 'live',
    env: envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_COOLDOWN_S: '3600' }),
  });
  const r = await check(TS);
  assertEquals(calls.length, 1, 'past cooldown → re-page (do NOT silently drop persistent break)');
  assert(r.escalated);
});

Deno.test('closure — reader uses THREADED ts (no new Date() leak)', async () => {
  const { reader, lastBeforeTs } = mkReader([]);
  const { writer } = mkWriter();
  const check = buildRebalanceAggregatePersistenceCheck({
    operator_id: opId, reader, writer, fetcher_source: 'live', env: envOf({}),
  });
  await check(TS);
  assertEquals(lastBeforeTs.v?.getTime(), TS.getTime());
});

Deno.test('closure — malformed env N at build time → throws (NO silent N=0)', () => {
  const { reader } = mkReader([]);
  const { writer } = mkWriter();
  assertThrows(() =>
    buildRebalanceAggregatePersistenceCheck({
      operator_id: opId, reader, writer, fetcher_source: 'live',
      env: envOf({ LONGSHORT_REBALANCE_AGGREGATE_PERSIST_N: '0' }),
    }),
  );
});

Deno.test('closure — reader throw propagates (caller swallow contract is at the seam, NOT here)', async () => {
  const reader: AggregateHistoryReader = {
    readRecent: () => Promise.reject(new Error('db_down')),
    readLastPersistenceTs: () => Promise.resolve(null),
  };
  const { writer } = mkWriter();
  const check = buildRebalanceAggregatePersistenceCheck({
    operator_id: opId, reader, writer, fetcher_source: 'live', env: envOf({}),
  });
  await assertRejects(() => check(TS), Error, 'db_down');
});

Deno.test('constants — PERSIST_CALL_NAME + PERSIST_ACTION are stable strings (pager attribution)', () => {
  assertEquals(PERSIST_CALL_NAME, 'verify_rebalance_aggregate_persistence');
  assertEquals(PERSIST_ACTION, 'persistent_band_violation_operator_alert_N_consecutive_ticks');
});