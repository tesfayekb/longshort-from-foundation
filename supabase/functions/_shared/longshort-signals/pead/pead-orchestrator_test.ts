// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createPeadOrchestrator,
  SIGNAL_ID,
} from './pead-orchestrator.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-08T21:00:00Z');
const AS_OF_DATE = '2026-06-08';
const LATEST_SNAPSHOT = '2026-06-05';

type EstBehavior =
  | { kind: 'estimates'; rows: Array<{ period: string; epsAvg: number; epsHigh: number; epsLow: number; numberAnalysts: number }> }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' }
  | { kind: 'throw'; err: unknown };

type EarnBehavior =
  | { kind: 'earnings'; rows: Array<{ period: string; actual: number | null; estimate: number | null }> }
  | { kind: 'unavailable'; reason: 'subscription_gated' | 'data_unavailable' }
  | { kind: 'throw'; err: unknown };

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  upsertError?: { message: string } | null;
}) {
  const calls = { upsertPayloads: [] as SignalRow[][] };
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;

  const supabase = {
    from(table: string) {
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const builder: Record<string, unknown> = {
          select(cols: string) {
            mode = cols === 'as_of_date' ? 'latest' : 'rows';
            return builder;
          },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(onFul: unknown, onRej: unknown) { return resolve().then(onFul, onRej); },
        };
        const resolve = () => {
          if (mode === 'latest') {
            return Promise.resolve({
              data: latestDate ? [{ as_of_date: latestDate }] : [],
              error: null,
            });
          }
          return Promise.resolve({ data: universe, error: null });
        };
        return builder;
      }
      if (table === 'signal_observations') {
        return {
          upsert(payload: SignalRow[]) {
            calls.upsertPayloads.push(payload);
            return Promise.resolve({
              error: opts.upsertError ?? null,
              count: opts.upsertError ? null : payload.length,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, calls };
}

function makeFetchers(
  est: Record<string, EstBehavior>,
  earn: Record<string, EarnBehavior>,
) {
  return {
    epsEstimate: {
      async fetchEpsEstimates(t: string) {
        const b = est[t];
        if (!b) return { kind: 'unavailable', reason: 'data_unavailable' };
        if (b.kind === 'throw') throw b.err;
        if (b.kind === 'unavailable') return { kind: 'unavailable', reason: b.reason };
        return { kind: 'estimates', rows: b.rows };
      },
    },
    earnings: {
      async fetchEarnings(t: string) {
        const b = earn[t];
        if (!b) return { kind: 'unavailable', reason: 'data_unavailable' };
        if (b.kind === 'throw') throw b.err;
        if (b.kind === 'unavailable') return { kind: 'unavailable', reason: b.reason };
        return { kind: 'earnings', rows: b.rows };
      },
    },
  };
}

/** Build a clean reported quarter ~26 trading days behind AS_OF. */
function happyEst(over: Partial<{ epsAvg: number; epsHigh: number; epsLow: number; numberAnalysts: number; period: string }> = {}) {
  return {
    period: over.period ?? '2026-05-01',
    epsAvg: over.epsAvg ?? 1.40,
    epsHigh: over.epsHigh ?? 1.55,
    epsLow: over.epsLow ?? 1.25,
    numberAnalysts: over.numberAnalysts ?? 8,
  };
}
function happyEarn(over: Partial<{ period: string; actual: number; estimate: number }> = {}) {
  return {
    period: over.period ?? '2026-05-01',
    actual: over.actual ?? 1.50,
    estimate: over.estimate ?? 1.40,
  };
}

// ── Happy path ────────────────────────────────────────────────────────

Deno.test('pead-orchestrator: computes + z-scores + persists for happy universe', async () => {
  const universe = [
    { ticker: 'AAA', gics_sector: 'Tech' },
    { ticker: 'BBB', gics_sector: 'Tech' },
    { ticker: 'CCC', gics_sector: 'Tech' },
  ];
  const { supabase, calls } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    {
      AAA: { kind: 'estimates', rows: [happyEst()] },
      BBB: { kind: 'estimates', rows: [happyEst({ epsAvg: 1.30 })] },
      CCC: { kind: 'estimates', rows: [happyEst({ epsAvg: 1.50 })] },
    },
    {
      AAA: { kind: 'earnings', rows: [happyEarn()] },
      BBB: { kind: 'earnings', rows: [happyEarn({ actual: 1.45 })] },
      CCC: { kind: 'earnings', rows: [happyEarn({ actual: 1.55 })] },
    },
  );
  const orch = createPeadOrchestrator({
    supabase,
    operator_id: OPERATOR_ID,
    epsEstimate: fetchers.epsEstimate,
    earnings: fetchers.earnings,
    concurrency: 2,
  });
  const result = await orch.run(AS_OF);
  assertEquals(result.outcome, 'completed');
  assertEquals(result.signal_id, SIGNAL_ID);
  assertEquals(result.as_of_date, AS_OF_DATE);
  assertEquals(result.universe_size, 3);
  assertEquals(result.persisted_count, 3);
  assertEquals(result.skipped.length, 0);
  assertEquals(calls.upsertPayloads.length, 1);
  for (const row of calls.upsertPayloads[0]) {
    assert(row.is_present === true);
    assert(typeof row.value === 'number');
    assert(Math.abs(row.value) <= 3.0); // ±3 z-score clip
  }
});

// ── DEC-052 floor ─────────────────────────────────────────────────────

Deno.test('pead-orchestrator: N<2 panel → pead_panel_below_floor typed skip (no value persisted)', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'estimates', rows: [happyEst({ numberAnalysts: 1 })] } },
    { AAA: { kind: 'earnings', rows: [happyEarn()] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.persisted_count, 0);
  const reasons = result.skipped.map((s: SignalSkip) => s.reason);
  assert(reasons.includes('pead_panel_below_floor'));
});

// ── DEC-051 / DEC-053 zero-dispersion typed absence ───────────────────

Deno.test('pead-orchestrator: epsHigh===epsLow → zero_dispersion typed skip (no ε-fallback)', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'estimates', rows: [happyEst({ epsHigh: 1.40, epsLow: 1.40 })] } },
    { AAA: { kind: 'earnings', rows: [happyEarn()] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.persisted_count, 0);
  assertEquals(result.skipped[0].reason, 'zero_dispersion');
  assert(result.skipped[0].detail!.includes('ε-fallback forbidden'));
});

// ── Staleness window ──────────────────────────────────────────────────

Deno.test('pead-orchestrator: stale (>60 trading days) report → no_recent_earnings skip', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'estimates', rows: [happyEst({ period: '2026-01-30' })] } },
    { AAA: { kind: 'earnings', rows: [happyEarn({ period: '2026-01-30' })] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.skipped[0].reason, 'no_recent_earnings');
});

Deno.test('pead-orchestrator: no reported quarter with matching estimate → no_recent_earnings skip', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    // Estimate exists for FUTURE period only
    { AAA: { kind: 'estimates', rows: [happyEst({ period: '2026-09-01' })] } },
    // Earnings has only future / no-actual rows
    { AAA: { kind: 'earnings', rows: [{ period: '2026-09-01', actual: null, estimate: 1.40 }] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.skipped[0].reason, 'no_recent_earnings');
});

// ── Entitlement / availability ────────────────────────────────────────

Deno.test('pead-orchestrator: eps-estimate subscription_gated → subscription_gated skip', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'unavailable', reason: 'subscription_gated' } },
    { AAA: { kind: 'earnings', rows: [happyEarn()] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.skipped[0].reason, 'subscription_gated');
});

Deno.test('pead-orchestrator: eps-estimate data_unavailable → data_unavailable skip', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'unavailable', reason: 'data_unavailable' } },
    { AAA: { kind: 'earnings', rows: [happyEarn()] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.skipped[0].reason, 'data_unavailable');
});

Deno.test('pead-orchestrator: earnings data_unavailable → no_recent_earnings (more diagnostic)', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'estimates', rows: [happyEst()] } },
    { AAA: { kind: 'unavailable', reason: 'data_unavailable' } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.skipped[0].reason, 'no_recent_earnings');
});

Deno.test('pead-orchestrator: fetcher throw → fetch_error skip with ticker context', async () => {
  const universe = [{ ticker: 'AAA', gics_sector: 'Tech' }];
  const { supabase } = makeSupabase({ universe });
  const fetchers = makeFetchers(
    { AAA: { kind: 'throw', err: new Error('network boom') } },
    { AAA: { kind: 'earnings', rows: [happyEarn()] } },
  );
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.skipped[0].reason, 'fetch_error');
  assert(result.skipped[0].detail!.includes('network boom'));
});

// ── Empty universe ────────────────────────────────────────────────────

Deno.test('pead-orchestrator: empty universe → outcome=failed with empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const fetchers = makeFetchers({}, {});
  const result = await orchRun(supabase, fetchers);
  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'empty_universe');
});

// ── helper ────────────────────────────────────────────────────────────
function orchRun(supabase: unknown, fetchers: { epsEstimate: unknown; earnings: unknown }) {
  const orch = createPeadOrchestrator({
    supabase: supabase as never,
    operator_id: OPERATOR_ID,
    epsEstimate: fetchers.epsEstimate as never,
    earnings: fetchers.earnings as never,
    concurrency: 2,
  });
  return orch.run(AS_OF);
}