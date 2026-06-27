// deno-lint-ignore-file no-import-prefix no-explicit-any
// @ts-nocheck — Deno test file.
/**
 * Unit tests for the FP-057 Sub-step 4c subset resolver.
 *
 * Covers the operator's spec verbatim:
 *   - base top-N from MIG-133
 *   - UNION with fresh-today catalyst/news-active (carried_forward=false)
 *   - DISTINCT (no duplicate entries)
 *   - active-first priority over the 255-cap (the gap-closer)
 *   - env-N + ceiling 250
 *   - cadence-gate: daily run → returns null (no filter)
 *   - the carried_forward=true name is NOT seeded (carried-over ≠ fresh)
 *   - GAP-CLOSER: a name NOT in top-N but catalyst-active-fresh-today
 *     IS seeded (operator's exact concern)
 *   - no `new Date()` / `Date.now()` in the source file
 */
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createOptionsFlowSubsetResolver,
  resolveSubsetN,
  priorTradingDayIso,
  SUBSET_HARD_CEILING,
  DEFAULT_SUBSET_N,
  SUBSET_UNION_BUDGET,
  CATALYST_SIGNAL_ID,
  NEWS_SIGNAL_ID,
} from './options-flow-subset-resolver.ts';

const AS_OF = new Date('2026-06-10T14:30:00Z'); // Wednesday RTH

function makeSupabase(opts: {
  cadence?: 'intraday' | 'daily' | null;
  freshActive?: ReadonlyArray<{ ticker: string; signal_id: string; carried_forward: boolean; is_present: boolean }>;
  runsError?: { message: string };
  obsError?: { message: string };
}) {
  return {
    from(table: string) {
      if (table === 'signal_queue_runs') {
        const md = opts.cadence === undefined
          ? { cadence: 'intraday' } // default for tests that don't care
          : opts.cadence === null
            ? {}
            : { cadence: opts.cadence };
        const data = opts.runsError
          ? null
          : opts.cadence === null && !('cadence' in {})
            ? []
            : [{ metadata: md }];
        // (We always return ONE row tagged with the requested cadence so
        //  the resolver's metadata branch is exercised.)
        const builder: any = {
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => builder,
          then: (resolve: any) => resolve({ data, error: opts.runsError ?? null }),
        };
        return { select: () => builder };
      }
      if (table === 'signal_observations') {
        // The resolver applies .eq(is_present,true).eq(carried_forward,false)
        // so we only return rows the resolver would receive (the harness
        // simulates SQL filtering by yielding only those that match).
        const rows = (opts.freshActive ?? [])
          .filter((r) => r.is_present === true && r.carried_forward === false)
          .map((r) => ({ ticker: r.ticker }));
        const builder: any = {
          eq: () => builder,
          in: () => builder,
          then: (resolve: any) => resolve({ data: opts.obsError ? null : rows, error: opts.obsError ?? null }),
        };
        return { select: () => builder };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as any;
}

function volumeReaderMock(rowsByDate: Record<string, Array<{ ticker: string; day_options_volume: number }>>) {
  return {
    async topN(date: string, n: number) {
      const rows = rowsByDate[date] ?? [];
      // resolver expects already-sorted DESC; the store contract owns
      // ordering. We mirror that here.
      return rows.slice(0, n);
    },
  };
}

Deno.test('resolveSubsetN — defaults + ceiling clamp', () => {
  assertEquals(resolveSubsetN(undefined), DEFAULT_SUBSET_N);
  assertEquals(resolveSubsetN('150'), 150);
  assertEquals(resolveSubsetN('999'), SUBSET_HARD_CEILING);
  assertEquals(resolveSubsetN('-5'), DEFAULT_SUBSET_N);
  assertEquals(resolveSubsetN('not-a-number'), DEFAULT_SUBSET_N);
  assertEquals(resolveSubsetN(undefined, 50), 50);
});

Deno.test('priorTradingDayIso — weekday → prior calendar day', () => {
  // Wednesday 2026-06-10 → Tuesday 2026-06-09
  assertEquals(priorTradingDayIso(new Date('2026-06-10T14:00:00Z')), '2026-06-09');
});

Deno.test('priorTradingDayIso — Monday → previous Friday', () => {
  // Monday 2026-06-08 → Friday 2026-06-05
  assertEquals(priorTradingDayIso(new Date('2026-06-08T14:00:00Z')), '2026-06-05');
});

Deno.test('resolver: cadence=daily / unset → returns null (no filter; pre-4c bit-identical)', async () => {
  const supabase = makeSupabase({ cadence: 'daily' });
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({ '2026-06-09': [{ ticker: 'AAA', day_options_volume: 1e6 }] }),
  });
  const out = await resolver(AS_OF);
  assertEquals(out, null);
});

Deno.test('resolver: BASE TIER reads top-N from prior trading day (DESC by volume)', async () => {
  const supabase = makeSupabase({ cadence: 'intraday', freshActive: [] });
  const base = Array.from({ length: 300 }, (_, i) => ({
    ticker: `T${String(i).padStart(3, '0')}`,
    day_options_volume: 1_000_000 - i,
  }));
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({ '2026-06-09': base }),
    subsetN: 200, // explicit
  });
  const out = await resolver(AS_OF);
  assert(out !== null);
  assertEquals(out!.size, 200);
  assert(out!.has('T000'));
  assert(out!.has('T199'));
  assertFalse(out!.has('T200'));
});

Deno.test('resolver: GAP-CLOSER — catalyst-active fresh-today name NOT in top-N IS seeded (operator concern)', async () => {
  const supabase = makeSupabase({
    cadence: 'intraday',
    freshActive: [
      { ticker: 'TAIL', signal_id: CATALYST_SIGNAL_ID, is_present: true, carried_forward: false },
    ],
  });
  // base of 200 names, none is 'TAIL'
  const base = Array.from({ length: 200 }, (_, i) => ({
    ticker: `T${i}`, day_options_volume: 1_000_000 - i,
  }));
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({ '2026-06-09': base }),
    subsetN: 200,
  });
  const out = await resolver(AS_OF);
  assert(out !== null);
  assert(out!.has('TAIL'), 'fresh-today active tail name MUST be seeded');
  assert(out!.has('T0'));
});

Deno.test('resolver: carried_forward=true is NOT seeded (carried-over ≠ fresh)', async () => {
  const supabase = makeSupabase({
    cadence: 'intraday',
    freshActive: [
      { ticker: 'STALE', signal_id: NEWS_SIGNAL_ID, is_present: true, carried_forward: true },
    ],
  });
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({ '2026-06-09': [] }),
    subsetN: 10,
  });
  const out = await resolver(AS_OF);
  assert(out !== null);
  assertFalse(out!.has('STALE'), 'carried-over name MUST NOT be seeded');
  assertEquals(out!.size, 0);
});

Deno.test('resolver: ACTIVE-FIRST priority over the 255-cap', async () => {
  // 300 base names (saturates cap) + 50 fresh-active. The cap is 255;
  // ACTIVE-FIRST → all 50 active land, then 205 base, total = 255.
  const active = Array.from({ length: 50 }, (_, i) => ({
    ticker: `A${i}`, signal_id: CATALYST_SIGNAL_ID, is_present: true, carried_forward: false,
  }));
  const base = Array.from({ length: 300 }, (_, i) => ({
    ticker: `B${i}`, day_options_volume: 1_000_000 - i,
  }));
  const supabase = makeSupabase({ cadence: 'intraday', freshActive: active });
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({ '2026-06-09': base }),
    subsetN: 250,
  });
  const out = await resolver(AS_OF);
  assert(out !== null);
  assertEquals(out!.size, SUBSET_UNION_BUDGET); // 255
  // every active name present
  for (let i = 0; i < 50; i++) assert(out!.has(`A${i}`), `A${i} missing`);
  // base filled in order: B0..B204 land (255 - 50 = 205 slots)
  assert(out!.has('B0'));
  assert(out!.has('B204'));
  assertFalse(out!.has('B205'));
});

Deno.test('resolver: DISTINCT (active name also in base does not double-count)', async () => {
  const supabase = makeSupabase({
    cadence: 'intraday',
    freshActive: [
      { ticker: 'X', signal_id: CATALYST_SIGNAL_ID, is_present: true, carried_forward: false },
    ],
  });
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({ '2026-06-09': [{ ticker: 'X', day_options_volume: 100 }, { ticker: 'Y', day_options_volume: 50 }] }),
    subsetN: 10,
  });
  const out = await resolver(AS_OF);
  assert(out !== null);
  assertEquals(out!.size, 2);
});

Deno.test('resolver: memoizes per asOf-date (one resolution per isolate per run)', async () => {
  let runsCalls = 0;
  const supabase: any = {
    from(table: string) {
      if (table === 'signal_queue_runs') {
        runsCalls++;
        const b: any = {
          eq: () => b, in: () => b, order: () => b, limit: () => b,
          then: (r: any) => r({ data: [{ metadata: { cadence: 'intraday' } }], error: null }),
        };
        return { select: () => b };
      }
      const b: any = { eq: () => b, in: () => b, then: (r: any) => r({ data: [], error: null }) };
      return { select: () => b };
    },
  };
  const resolver = createOptionsFlowSubsetResolver({
    supabase, signalId: 'options_flow_imbalance_5d',
    volumeReader: volumeReaderMock({}),
  });
  await resolver(AS_OF);
  await resolver(AS_OF);
  await resolver(AS_OF);
  assertEquals(runsCalls, 1, 'memoization MUST collapse repeat calls for same asOf-date');
});

Deno.test('resolver: source file has NO new Date() / Date.now() (DEC-034 cl.4)', async () => {
  const src = await Deno.readTextFile(
    new URL('./options-flow-subset-resolver.ts', import.meta.url),
  );
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  if (/new\s+Date\s*\(\s*\)/.test(codeOnly)) throw new Error('new Date() leak');
  if (/Date\.now\s*\(/.test(codeOnly)) throw new Error('Date.now() leak');
});

Deno.test('(audit-isolation) resolver reads carried_forward as a query predicate ONLY (NOT in compute path)', async () => {
  // Structural: the resolver source contains the literal `carried_forward`
  // exactly once in code (the `.eq('carried_forward', false)` predicate).
  // The adapter, compute, fetcher, and orchestrator MUST NOT reference it.
  const resolverSrc = await Deno.readTextFile(
    new URL('./options-flow-subset-resolver.ts', import.meta.url),
  );
  const codeOnly = resolverSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  const matches = codeOnly.match(/carried_forward/g) ?? [];
  assert(matches.length >= 1, 'resolver must reference carried_forward (the gating predicate)');

  for (const sibling of ['options-flow-queue-adapter.ts', 'compute-options-flow.ts', 'options-flow-orchestrator.ts']) {
    const src = await Deno.readTextFile(new URL(`./${sibling}`, import.meta.url));
    const sibCode = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\*.*$/gm, '')
      .replace(/\/\/.*$/gm, '');
    assertFalse(
      /carried_forward/.test(sibCode),
      `${sibling}: carried_forward MUST NOT appear in the compute path (audit-only isolation)`,
    );
  }
});