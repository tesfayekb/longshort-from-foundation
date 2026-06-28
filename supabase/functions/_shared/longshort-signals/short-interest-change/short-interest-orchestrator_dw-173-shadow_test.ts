// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
//
// DW-173 shadow stand-up tests.
//
// Two surfaces under test:
//   (1) `buildShortInterestShadowRows` — the pure shadow row builder.
//       Covers typed-absence (no fabricated 0 / no row for absent input),
//       both si_level + si_dtc variants, within-sector z-score reuse,
//       and singleton/missing-sector drop semantics.
//   (2) The orchestrator integration — shadow rows are written to
//       `short_interest_alpha_shadow` AND the live `signal_observations`
//       write is byte-identical to the no-shadow case (the must-not-move
//       guarantee). Plus: shadow upsert failure is swallowed and the run
//       still reports `outcome=completed`.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildShortInterestShadowRows,
  createShortInterestOrchestrator,
  SIGNAL_ID,
} from './short-interest-orchestrator.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-08T21:00:00Z');
const AS_OF_DATE = '2026-06-08';
const COMPUTED_AT = AS_OF.toISOString();

// ─────────────────────────────────────────────────────────────────────
// PART A — pure builder tests
// ─────────────────────────────────────────────────────────────────────

Deno.test('DW-173 builder: emits si_level + si_dtc rows for present inputs (within-sector z-score)', () => {
  const perTicker = [
    {
      kind: 'value', ticker: 'AAA', raw_signal: 0.1, gics_sector: 'Tech',
      latest_dtc: 2.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.05,
    },
    {
      kind: 'value', ticker: 'BBB', raw_signal: 0.2, gics_sector: 'Tech',
      latest_dtc: 4.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.10,
    },
    {
      kind: 'value', ticker: 'CCC', raw_signal: 0.3, gics_sector: 'Tech',
      latest_dtc: 6.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.15,
    },
  ] as const;

  const rows = buildShortInterestShadowRows(
    perTicker as unknown as Parameters<typeof buildShortInterestShadowRows>[0],
    OPERATOR_ID,
    AS_OF_DATE,
    COMPUTED_AT,
  );

  // 3 tickers × 2 variants = 6 rows.
  assertEquals(rows.length, 6);

  const levels = rows.filter((r) => r.variant === 'si_level');
  const dtcs = rows.filter((r) => r.variant === 'si_dtc');
  assertEquals(levels.length, 3);
  assertEquals(dtcs.length, 3);

  // Z-score within Tech sector: AAA(low), BBB(mid), CCC(high) → -1, 0, +1
  // (sample std with n=3 over [0.05,0.10,0.15] → std=0.05; (v-mean)/std).
  const levelByTicker = new Map(levels.map((r) => [r.ticker, r.raw_value]));
  assertEquals(Math.round((levelByTicker.get('AAA') as number) * 100) / 100, -1);
  assertEquals(Math.round((levelByTicker.get('BBB') as number) * 100) / 100, 0);
  assertEquals(Math.round((levelByTicker.get('CCC') as number) * 100) / 100, 1);

  // Every row carries operator_id, as_of_date, computed_at, gics_sector.
  for (const r of rows) {
    assertEquals(r.operator_id, OPERATOR_ID);
    assertEquals(r.as_of_date, AS_OF_DATE);
    assertEquals(r.computed_at, COMPUTED_AT);
    assertEquals(r.gics_sector, 'Tech');
  }
});

Deno.test('DW-173 builder: typed-absence — null inputs produce NO row, NEVER a fabricated 0', () => {
  const perTicker = [
    // AAA: missing si_level (null), has DTC → emits si_dtc only
    {
      kind: 'value', ticker: 'AAA', raw_signal: 0.1, gics_sector: 'Tech',
      latest_dtc: 3.0, latest_report_date: '2026-05-31', latest_si_pct_float: null,
    },
    // BBB: has both
    {
      kind: 'value', ticker: 'BBB', raw_signal: 0.2, gics_sector: 'Tech',
      latest_dtc: 5.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.10,
    },
    // CCC: has level, missing DTC → emits si_level only
    {
      kind: 'value', ticker: 'CCC', raw_signal: 0.3, gics_sector: 'Tech',
      latest_dtc: null, latest_report_date: '2026-05-31', latest_si_pct_float: 0.15,
    },
  ] as const;

  const rows = buildShortInterestShadowRows(
    perTicker as unknown as Parameters<typeof buildShortInterestShadowRows>[0],
    OPERATOR_ID,
    AS_OF_DATE,
    COMPUTED_AT,
  );

  // si_level inputs: BBB, CCC (2 tickers, std>0 → both emit)
  // si_dtc inputs:   AAA, BBB (2 tickers, std>0 → both emit)
  // 4 rows total — AAA si_level and CCC si_dtc are typed-absent (no row).
  assertEquals(rows.length, 4);
  const present = new Set(rows.map((r) => `${r.variant}:${r.ticker}`));
  assert(!present.has('si_level:AAA'), 'AAA si_level must NOT be emitted (null input)');
  assert(!present.has('si_dtc:CCC'), 'CCC si_dtc must NOT be emitted (null input)');
  assert(present.has('si_level:BBB'));
  assert(present.has('si_level:CCC'));
  assert(present.has('si_dtc:AAA'));
  assert(present.has('si_dtc:BBB'));

  // No row has raw_value === 0 by accident-of-fabrication. (Z-scores
  // could legitimately equal 0 at the mean, but with n=2 per group the
  // z-scores are ±1 — never 0. Asserts the anti-phantom property at
  // this fixture.)
  for (const r of rows) {
    assert(r.raw_value !== 0, `${r.variant}:${r.ticker} should not be exactly 0`);
  }
});

Deno.test('DW-173 builder: skip-kind results with DTC contribute si_dtc only (alpha-skip but DTC available)', () => {
  // Mirrors the `missing_shares_outstanding` / `insufficient_history`
  // skip paths in the orchestrator — the alpha is skipped but DTC was
  // fetched. Skip results don't carry gics_sector → z-score helper
  // emits null → NO row (typed-absence). This is the correct, narrow
  // behavior: without sector we cannot produce a comparable z-score.
  const perTicker = [
    {
      kind: 'value', ticker: 'AAA', raw_signal: 0.1, gics_sector: 'Tech',
      latest_dtc: 3.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.05,
    },
    {
      kind: 'value', ticker: 'BBB', raw_signal: 0.2, gics_sector: 'Tech',
      latest_dtc: 5.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.10,
    },
    {
      kind: 'skip',
      skip: { ticker: 'CCC', reason: 'missing_shares_outstanding', detail: 'x' },
      ticker: 'CCC', latest_dtc: 9.0, latest_report_date: '2026-05-31',
    },
  ] as const;

  const rows = buildShortInterestShadowRows(
    perTicker as unknown as Parameters<typeof buildShortInterestShadowRows>[0],
    OPERATOR_ID,
    AS_OF_DATE,
    COMPUTED_AT,
  );

  // CCC: skip kind → no sector → its si_dtc row is dropped at z-score.
  // AAA + BBB: both variants emitted. 4 rows total.
  assertEquals(rows.length, 4);
  assertEquals(rows.filter((r) => r.ticker === 'CCC').length, 0);
});

Deno.test('DW-173 builder: singleton sector / missing sector → no row (no fabricated z-score)', () => {
  const perTicker = [
    // SOLO is alone in Energy → singleton sector → z undefined → no row
    {
      kind: 'value', ticker: 'SOLO', raw_signal: 0.1, gics_sector: 'Energy',
      latest_dtc: 4.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.20,
    },
    // PAIR1 + PAIR2 in Tech → valid z-score
    {
      kind: 'value', ticker: 'PAIR1', raw_signal: 0.1, gics_sector: 'Tech',
      latest_dtc: 2.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.05,
    },
    {
      kind: 'value', ticker: 'PAIR2', raw_signal: 0.2, gics_sector: 'Tech',
      latest_dtc: 6.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.10,
    },
    // NOSEC has null sector → passthrough as null → no row
    {
      kind: 'value', ticker: 'NOSEC', raw_signal: 0.3, gics_sector: null,
      latest_dtc: 8.0, latest_report_date: '2026-05-31', latest_si_pct_float: 0.30,
    },
  ] as const;

  const rows = buildShortInterestShadowRows(
    perTicker as unknown as Parameters<typeof buildShortInterestShadowRows>[0],
    OPERATOR_ID,
    AS_OF_DATE,
    COMPUTED_AT,
  );

  // Only PAIR1/PAIR2 produce rows (2 variants × 2 tickers = 4).
  assertEquals(rows.length, 4);
  const tickers = new Set(rows.map((r) => r.ticker));
  assert(tickers.has('PAIR1'));
  assert(tickers.has('PAIR2'));
  assert(!tickers.has('SOLO'));
  assert(!tickers.has('NOSEC'));
});

// ─────────────────────────────────────────────────────────────────────
// PART B — orchestrator integration: must-not-move + swallowed failure
// ─────────────────────────────────────────────────────────────────────

function mockSupabaseWith(opts: { shadowError?: { message: string } | null } = {}) {
  const universe = [
    { ticker: 'AAA', gics_sector: 'Tech' },
    { ticker: 'BBB', gics_sector: 'Tech' },
    { ticker: 'CCC', gics_sector: 'Tech' },
  ];
  const calls = {
    signal_observations_upserts: [] as unknown[][],
    shadow_upserts: [] as unknown[][],
  };

  return {
    supabase: {
      from(table: string) {
        if (table === 'universe_membership') {
          let mode: 'latest' | 'rows' = 'rows';
          const b: Record<string, unknown> = {
            select(cols: string) { mode = cols === 'as_of_date' ? 'latest' : 'rows'; return b; },
            eq() { return b; },
            order() { return b; },
            limit() { return resolve(); },
            then(onFul: unknown, onRej: unknown) { return resolve().then(onFul, onRej); },
          };
          const resolve = () => mode === 'latest'
            ? Promise.resolve({ data: [{ as_of_date: '2026-06-05' }], error: null })
            : Promise.resolve({ data: universe, error: null });
          return b;
        }
        if (table === 'signal_observations') {
          return {
            upsert(payload: unknown[]) {
              calls.signal_observations_upserts.push(payload);
              return Promise.resolve({ error: null, count: payload.length });
            },
          };
        }
        if (table === 'short_interest_alpha_shadow') {
          return {
            upsert(payload: unknown[]) {
              calls.shadow_upserts.push(payload);
              return Promise.resolve({ error: opts.shadowError ?? null, count: payload.length });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
    calls,
  };
}

function makeFetchers() {
  // Three reports per ticker so computeShortInterestChange returns a
  // numeric raw_signal (length ≥ 3) — keeps the live #5 path successful.
  const siReports = (base: number) => [
    { report_date: '2026-04-30', short_interest: base, days_to_cover: base * 10 },
    { report_date: '2026-05-15', short_interest: base + 0.01, days_to_cover: base * 10 + 0.5 },
    { report_date: '2026-05-31', short_interest: base + 0.02, days_to_cover: base * 10 + 1 },
  ];
  const map: Record<string, number> = { AAA: 0.05, BBB: 0.10, CCC: 0.15 };
  return {
    shortInterest: {
      async fetchShortInterest(ticker: string) {
        return { kind: 'reports' as const, reports: siReports(map[ticker]) };
      },
    },
    sharesOutstanding: {
      async fetchShares(_ticker: string) {
        return { kind: 'shares' as const, shares: 1.0 };
      },
    },
  };
}

Deno.test('DW-173 orchestrator: shadow rows written; live signal_observations write UNCHANGED (must-not-move)', async () => {
  const m = mockSupabaseWith();
  const fetchers = makeFetchers();
  const orch = createShortInterestOrchestrator({
    supabase: m.supabase as unknown as never,
    operator_id: OPERATOR_ID,
    ...fetchers,
  });
  const result = await orch.run(AS_OF);

  assertEquals(result.outcome, 'completed');
  assertEquals(result.signal_id, SIGNAL_ID);

  // Live signal_observations: exactly one upsert call carrying #5 rows
  // for the three tickers — the must-not-move property.
  assertEquals(m.calls.signal_observations_upserts.length, 1);
  const livePayload = m.calls.signal_observations_upserts[0] as Array<{ signal_id: string; ticker: string }>;
  assertEquals(livePayload.length, 3);
  for (const row of livePayload) {
    assertEquals(row.signal_id, SIGNAL_ID); // ΔSI signal id unchanged
  }

  // Shadow: one upsert into the new table carrying 2 variants × 3 tickers.
  assertEquals(m.calls.shadow_upserts.length, 1);
  const shadowPayload = m.calls.shadow_upserts[0] as Array<{ variant: string; ticker: string }>;
  assertEquals(shadowPayload.length, 6);
  assertEquals(shadowPayload.filter((r) => r.variant === 'si_level').length, 3);
  assertEquals(shadowPayload.filter((r) => r.variant === 'si_dtc').length, 3);
});

Deno.test('DW-173 orchestrator: shadow upsert FAILURE is swallowed — live run still completes', async () => {
  const m = mockSupabaseWith({ shadowError: { message: 'simulated shadow write failure' } });
  const fetchers = makeFetchers();
  const orch = createShortInterestOrchestrator({
    supabase: m.supabase as unknown as never,
    operator_id: OPERATOR_ID,
    ...fetchers,
  });
  const result = await orch.run(AS_OF);

  // The live path completes — shadow failure MUST be telemetry-only.
  assertEquals(result.outcome, 'completed');
  assertEquals(result.persisted_count, 3);
  // The live signal_observations write still happened.
  assertEquals(m.calls.signal_observations_upserts.length, 1);
  // Shadow upsert was attempted (and failed at the mock).
  assertEquals(m.calls.shadow_upserts.length, 1);
});
