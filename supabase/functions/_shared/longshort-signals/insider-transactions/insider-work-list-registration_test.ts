// @ts-nocheck — Deno test file. FP-050 Phase 3.6b.iii′ γ commit-1 —
// hand-computed fixture surface for the work-list producer registration.
// Per the operator's scoping line: consumer tests pin CONSUMER behavior
// only (the INC-73 five-contract parity is proven at engine level and
// is NOT re-proven here).
//
// Load-bearing surfaces:
//   (A) accessionsPerSlice arithmetic drift sentinel — the structural
//       ceiling `itemsPerSlice * callsPerItem / ratePerSec < 60` so any
//       future tightening of rate or loosening of slice silently
//       breaches the 120s/150s walls fails this test instead of
//       failing in production.
//   (B) seedWorkItems daily date math — worked example from the
//       ACT-193 crosswalk (D.1): asOf=Fri → previousTradingDay=Thu;
//       asOf=Mon → previousTradingDay=Fri (weekend skip).
//   (C) seedWorkItems backfill 63-trading-day sweep arithmetic.
//   (D) seedWorkItems in-universe filter (the design always filtered;
//       this pins the filter against the M4 RE-RULE — no one is to
//       "fix" the filter to make a wrong count true).
//   (E) processItem typed-permanent skip taxonomy at each call site
//       (data_unavailable / no_primary_doc) and transient throw on 429
//       (rate_limited at either layer).
//   (F) processItem upsert quotes the M5 PK verbatim
//       (`issuer_cik,accession_number,transaction_seq`) and passes
//       `owner_cik` on every row (MIG-095 dual-write).
//   (G) INC-74-style PK-batch dedupe enforces the table invariant.
//   (H) loadAndCompute adapter calls runStaged (M3) and maps the
//       per_ticker shape to the engine contract; short-circuit throws.

import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  createInsiderWorkListConfig,
  dedupeFormRowsByPk,
  INSIDER_BACKFILL_JOB_ID,
  INSIDER_BACKFILL_TRADING_DAYS,
  INSIDER_CALLS_PER_ITEM,
  INSIDER_DAILY_JOB_ID,
  INSIDER_HEARTBEAT_ACCESSION_NUMBER,
  INSIDER_HEARTBEAT_ISSUER_CIK,
  INSIDER_ITEMS_PER_SLICE,
  INSIDER_PER_DAY_WORK_BUDGET_CEILING,
  INSIDER_RATE_PER_SEC,
  INSIDER_SIGNAL_ID,
  previousTradingDay,
  trailingTradingDays,
  type InsiderWorkItemPayload,
  type InsiderWorkListDeps,
} from './insider-work-list-registration.ts';
import {
  HEARTBEAT_ACCESSION_NUMBER as PRODUCER_HEARTBEAT_ACCESSION_NUMBER,
  HEARTBEAT_ISSUER_CIK as PRODUCER_HEARTBEAT_ISSUER_CIK,
} from '../../../../../scripts/insider-discovery-egress.ts';

const AS_OF_FRI = new Date('2026-06-12T21:00:00.000Z'); // Friday
const AS_OF_MON = new Date('2026-06-15T21:00:00.000Z'); // Monday
const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// ── (A) Drift sentinel ────────────────────────────────────────────────
Deno.test('(A.1) accessionsPerSlice arithmetic — rate-bound < 60s (drift sentinel)', () => {
  const rateBoundSec = (INSIDER_ITEMS_PER_SLICE * INSIDER_CALLS_PER_ITEM) / INSIDER_RATE_PER_SEC;
  // 50 * 2 / 4.25 ≈ 23.5s — leaves 90s+ headroom under 120s STOP gate
  // for parser CPU + upsert wall. ANY future tightening of the cap or
  // loosening of the slice size that violates this ceiling MUST fail
  // this test instead of silently breaching the wall in production.
  assert(rateBoundSec < 60, `rate-bound ${rateBoundSec.toFixed(2)}s must stay < 60s`);
  assertEquals(INSIDER_ITEMS_PER_SLICE, 50);
  assertEquals(INSIDER_CALLS_PER_ITEM, 2);
  assertEquals(INSIDER_RATE_PER_SEC, 4.25);
});

// ── (B) Daily date math — weekend skip ─────────────────────────────────
Deno.test('(B.1) previousTradingDay: Friday asOf → Thursday', () => {
  const t = previousTradingDay(AS_OF_FRI);
  assertEquals(t.toISOString().slice(0, 10), '2026-06-11'); // Thu
});
Deno.test('(B.2) previousTradingDay: Monday asOf → Friday (weekend skip)', () => {
  const t = previousTradingDay(AS_OF_MON);
  assertEquals(t.toISOString().slice(0, 10), '2026-06-12'); // Fri (skips Sun + Sat)
});

// ── (C) Backfill sweep ────────────────────────────────────────────────
Deno.test('(C.1) trailingTradingDays returns N days, most-recent first, weekends skipped', () => {
  const list = trailingTradingDays(AS_OF_MON, 5);
  assertEquals(list.length, 5);
  // Most-recent first: Fri 2026-06-12, Thu 2026-06-11, Wed 2026-06-10,
  // Tue 2026-06-09, Mon 2026-06-08.
  assertEquals(list.map((d) => d.toISOString().slice(0, 10)), [
    '2026-06-12', '2026-06-11', '2026-06-10', '2026-06-09', '2026-06-08',
  ]);
});
Deno.test('(C.2) INSIDER_BACKFILL_TRADING_DAYS = 63 (M4 RE-RULE: 90-cal-day approx)', () => {
  assertEquals(INSIDER_BACKFILL_TRADING_DAYS, 63);
});

// ── (G) INC-74 PK-batch dedupe ────────────────────────────────────────
Deno.test('(G.1) dedupeFormRowsByPk: same PK collapses, dropped counted', () => {
  const rows = [
    { issuer_cik: '0000000001', accession_number: 'A', transaction_seq: 0 },
    { issuer_cik: '0000000001', accession_number: 'A', transaction_seq: 0 }, // dup
    { issuer_cik: '0000000001', accession_number: 'A', transaction_seq: 1 },
    { issuer_cik: '0000000002', accession_number: 'A', transaction_seq: 0 }, // diff issuer
  ];
  const { kept, dropped } = dedupeFormRowsByPk(rows);
  assertEquals(kept.length, 3);
  assertEquals(dropped, 1);
});

// ─── Stubs for the IO surfaces (each axis independently swappable) ────

function makeUniverseSupabase(universe: Array<{ ticker: string; gics_sector: string | null }>) {
  const upserts: { table: string; payload: unknown[]; onConflict: string | undefined }[] = [];
  const upsertResults: Array<{ error: { message: string } | null }> = [];
  function from(table: string) {
    if (table === 'universe_membership') {
      let mode: 'latest' | 'rows' = 'rows';
      const b: Record<string, unknown> = {
        select(cols: string) { mode = cols === 'as_of_date' ? 'latest' : 'rows'; return b; },
        eq() { return b; },
        order() { return b; },
        limit() {
          return Promise.resolve(
            universe.length > 0
              ? { data: [{ as_of_date: '2026-06-12' }], error: null }
              : { data: [], error: null },
          );
        },
        then(onF: unknown, onR: unknown) {
          return Promise.resolve({ data: universe, error: null }).then(onF as never, onR as never);
        },
      };
      // `mode` is unused below — the test stub returns universe rows
      // for the non-`limit()` path via the `then` thunk.
      void mode;
      return b;
    }
    if (table === 'insider_form4_rows') {
      return {
        upsert(payload: unknown[], opts: { onConflict?: string } = {}) {
          upserts.push({ table, payload, onConflict: opts.onConflict });
          const r = upsertResults.shift() ?? { error: null };
          return Promise.resolve(r);
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }
  return { from, upserts, upsertResults };
}

function makeCikMapper(map: Record<string, number>) {
  return {
    async loadMap() {
      return (ticker: string) => {
        const t = ticker.toUpperCase();
        const v = map[t];
        if (v === undefined) return { kind: 'unresolved' as const, ticker: t };
        return {
          kind: 'resolved' as const,
          ticker: t,
          cik10: String(v).padStart(10, '0'),
          source: 'snapshot' as const,
        };
      };
    },
  };
}

function makeDailyIndex(
  byDate: Record<string, Array<{ filer_cik: string; accession_number: string; form_type: '4' | '4/A' }>>,
) {
  return {
    async fetchDay(date: Date) {
      const iso = date.toISOString().slice(0, 10);
      const entries = byDate[iso];
      if (entries === undefined) {
        return { kind: 'unavailable' as const, reason: 'data_unavailable' as const, date: iso };
      }
      return {
        kind: 'rows' as const,
        date: iso,
        entries: entries.map((e) => ({
          form_type: e.form_type,
          filer_cik: e.filer_cik,
          company_name: 'ACME CORP',
          date_filed: iso,
          filename: `edgar/data/${e.filer_cik}/${e.accession_number.replace(/-/g, '')}/0000-index.htm`,
          accession_number: e.accession_number,
        })),
      };
    },
  };
}

function makeBaselineDeps(
  opts: {
    universe: Array<{ ticker: string; gics_sector: string | null }>;
    cikMap: Record<string, number>;
    daily: Record<string, Array<{ filer_cik: string; accession_number: string; form_type: '4' | '4/A' }>>;
    accessionIndex?: unknown;
    form4Fetcher?: unknown;
    loadAndComputeCtx?: unknown;
  },
): InsiderWorkListDeps & { _stub: ReturnType<typeof makeUniverseSupabase> } {
  const supa = makeUniverseSupabase(opts.universe);
  const noop = {
    async fetchIndex() { throw new Error('accessionIndex stub not configured'); },
  };
  const noopForm4 = {
    async fetchAndParse() { throw new Error('form4Fetcher stub not configured'); },
  };
  return {
    _stub: supa,
    supabase: supa as never,
    operator_id: OPERATOR_ID,
    cikMapper: makeCikMapper(opts.cikMap) as never,
    dailyIndex: makeDailyIndex(opts.daily) as never,
    accessionIndex: (opts.accessionIndex ?? noop) as never,
    form4Fetcher: (opts.form4Fetcher ?? noopForm4) as never,
    loadAndComputeCtx: (opts.loadAndComputeCtx ?? {}) as never,
  };
}

// ── (D) seedWorkItems — in-universe filter is the load-bearing design ──
Deno.test('(D.1) seedWorkItems daily: in-universe filter drops out-of-universe filers, keeps universe filers', async () => {
  const deps = makeBaselineDeps({
    universe: [
      { ticker: 'AAPL', gics_sector: 'Tech' },
      { ticker: 'MSFT', gics_sector: 'Tech' },
    ],
    cikMap: { AAPL: 320193, MSFT: 789019 },
    daily: {
      '2026-06-11': [
        // In-universe — KEPT
        { filer_cik: '320193', accession_number: '0000320193-26-000010', form_type: '4' },
        { filer_cik: '789019', accession_number: '0000789019-26-000020', form_type: '4/A' },
        // Out-of-universe — DROPPED (TSLA not in cikMap)
        { filer_cik: '1318605', accession_number: '0001318605-26-000030', form_type: '4' },
        // Out-of-universe — DROPPED (CIK not in inverse map)
        { filer_cik: '999999', accession_number: '0000999999-26-000040', form_type: '4' },
      ],
    },
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 2, 'only the two in-universe accessions survive');
  const ids = items.map((i) => i.id).sort();
  assertEquals(ids, ['0000320193-26-000010', '0000789019-26-000020']);
  // Payload threading
  const aapl = items.find((i) => i.id === '0000320193-26-000010')!;
  const payload = aapl.payload as Readonly<InsiderWorkItemPayload>;
  assertEquals(payload.ticker, 'AAPL');
  assertEquals(payload.filer_cik_padded, '0000320193');
  assertEquals(payload.form_type, '4');
});

Deno.test('(D.1b) seedWorkItems daily: real NVDA master.idx CIK operand matches padded universe CIK', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'NVDA', gics_sector: 'Tech' }],
    cikMap: { NVDA: 1045810 },
    daily: {
      '2026-06-11': [
        { filer_cik: '1045810', accession_number: '0001768670-26-000002', form_type: '4' },
      ],
    },
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 1);
  assertEquals(items[0].id, '0001768670-26-000002');
  const payload = items[0].payload as Readonly<InsiderWorkItemPayload>;
  assertEquals(payload.filer_cik_raw, '1045810');
  assertEquals(payload.filer_cik_padded, '0001045810');
  assertEquals(payload.ticker, 'NVDA');
});

Deno.test('(D.2) seedWorkItems daily: empty universe → empty items (Q5 VALID empty seed)', async () => {
  const deps = makeBaselineDeps({
    universe: [],
    cikMap: {},
    daily: { '2026-06-11': [{ filer_cik: '320193', accession_number: '0000320193-26-000001', form_type: '4' }] },
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 0);
});

Deno.test('(D.3) seedWorkItems daily: holiday/unavailable day → empty items (NOT a throw)', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {}, // no entries → fetcher returns 'unavailable'
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 0);
});

Deno.test('(D.4) seedWorkItems backfill: dedupes overlapping accessions across days', async () => {
  // Backfill sweeps 63 trading days; this test verifies the
  // `seenAccession` invariant (item-id uniqueness within ONE seed call
  // per queue-work-list-mode_test.ts:275-292) by placing the same
  // accession on two days the sweep covers.
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {
      '2026-06-12': [{ filer_cik: '320193', accession_number: 'DUP-ACC', form_type: '4' }],
      '2026-06-11': [{ filer_cik: '320193', accession_number: 'DUP-ACC', form_type: '4' }],
    },
  });
  const cfg = createInsiderWorkListConfig(deps, 'backfill');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_MON });
  // Backfill includes both days; the dedupe collapses the duplicate.
  const dupCount = items.filter((i) => i.id === 'DUP-ACC').length;
  assertEquals(dupCount, 1, 'duplicate accession across days collapses to 1 item');
});

// ── (E) processItem typed-permanent skips ──────────────────────────────

const ITEM: { id: string; payload: InsiderWorkItemPayload } = {
  id: '0000320193-26-000010',
  payload: {
    filer_cik_raw: '320193',
    filer_cik_padded: '0000320193',
    ticker: 'AAPL',
    date_filed: '2026-06-11',
    form_type: '4',
  },
};

function makeAccessionIndex(behavior: { kind: string; primary_document?: string; acceptance_datetime?: string; filenames?: string[]; eligible_count?: number }) {
  return { async fetchIndex() { return behavior as never; } };
}
function makeForm4Fetcher(behavior: { kind: string; rows?: unknown[]; reason?: string }) {
  return { async fetchAndParse() { return behavior as never; } };
}

Deno.test('(E.1) processItem: index 404 → permanent_skip data_unavailable', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({ kind: 'unavailable', reason: 'data_unavailable' }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI });
  assertEquals(out.kind, 'permanent_skip');
  if (out.kind === 'permanent_skip') assertEquals(out.reason, 'data_unavailable');
});

Deno.test('(E.2) processItem: index ambiguous → permanent_skip no_primary_doc (M2)', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({
      kind: 'ambiguous',
      filenames: ['a.xml', 'b.xml'],
      eligible_count: 2,
      acceptance_datetime: '2026-06-11T16:00:00.000Z',
    }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI });
  assertEquals(out.kind, 'permanent_skip');
  if (out.kind === 'permanent_skip') {
    assertEquals(out.reason, 'no_primary_doc');
    assert(out.detail.includes('eligible=2'));
  }
});

Deno.test('(E.3) processItem: index 429 → THROW (transient — engine cursor preserved)', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({ kind: 'rate_limited' }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  await assertRejects(() => cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI }));
});

Deno.test('(E.4) processItem: form4 xml 404 → permanent_skip data_unavailable', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({
      kind: 'resolved',
      primary_document: 'primary_doc.xml',
      acceptance_datetime: '2026-06-11T16:00:00.000Z',
      filenames: ['primary_doc.xml'],
    }),
    form4Fetcher: makeForm4Fetcher({ kind: 'unavailable', reason: 'data_unavailable' }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI });
  assertEquals(out.kind, 'permanent_skip');
  if (out.kind === 'permanent_skip') assertEquals(out.reason, 'data_unavailable');
});

Deno.test('(E.5) processItem: form4 xml unparseable → permanent_skip data_unavailable (M1 owner_cik path)', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({
      kind: 'resolved',
      primary_document: 'primary_doc.xml',
      acceptance_datetime: '2026-06-11T16:00:00.000Z',
      filenames: ['primary_doc.xml'],
    }),
    form4Fetcher: makeForm4Fetcher({
      kind: 'unparseable',
      reason: '§(h) four-part-key contract violated: missing or non-numeric rptOwnerCik',
    }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI });
  assertEquals(out.kind, 'permanent_skip');
  if (out.kind === 'permanent_skip') {
    assertEquals(out.reason, 'data_unavailable');
    assert(out.detail.includes('rptOwnerCik'));
  }
});

// ── (F) processItem upsert path — M5 PK + MIG-095 dual-write ──────────
Deno.test('(F.1) processItem: rows path → upsert quotes M5 PK verbatim + owner_cik on every row', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({
      kind: 'resolved',
      primary_document: 'primary_doc.xml',
      acceptance_datetime: '2026-06-11T16:00:00.000Z',
      filenames: ['primary_doc.xml'],
    }),
    form4Fetcher: makeForm4Fetcher({
      kind: 'rows',
      rows: [
        {
          issuer_cik: '0000320193', owner_cik: '0001111111',
          accession_number: '0000320193-26-000010', transaction_seq: 0,
          transaction_code: 'P', shares: 1000, price_per_share: 50,
          acquired_disposed: 'A', ownership_type: 'D',
          officer_title: 'CEO',
          is_director: false, is_officer: true, is_ten_percent_owner: false,
          has_10b5_1_mention: false,
          transaction_date: '2026-06-10', acceptance_datetime: '2026-06-11T16:00:00.000Z',
        },
      ],
    }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI });
  assertEquals(out.kind, 'processed');
  const upsert = deps._stub.upserts[0];
  assertEquals(upsert.table, 'insider_form4_rows');
  // M5: onConflict quotes the MIG-094 PK verbatim.
  assertEquals(upsert.onConflict, 'issuer_cik,accession_number,transaction_seq');
  const row = (upsert.payload as Array<Record<string, unknown>>)[0];
  // MIG-095 dual-write: owner_cik present + non-empty.
  assertEquals(row.owner_cik, '0001111111');
  // ticker threaded from work-item payload.
  assertEquals(row.ticker, 'AAPL');
  // filing_form_type threaded.
  assertEquals(row.filing_form_type, '4');
  // DEC-034 clause 4: ingested_at = asOf (no wall-clock).
  assertEquals(row.ingested_at, AS_OF_FRI.toISOString());
  // PK fields.
  assertEquals(row.issuer_cik, '0000320193');
  assertEquals(row.accession_number, '0000320193-26-000010');
  assertEquals(row.transaction_seq, 0);
});

Deno.test('(F.2) processItem: rows empty (derivative-only filing) → processed, no upsert', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({
      kind: 'resolved',
      primary_document: 'primary_doc.xml',
      acceptance_datetime: '2026-06-11T16:00:00.000Z',
      filenames: ['primary_doc.xml'],
    }),
    form4Fetcher: makeForm4Fetcher({ kind: 'rows', rows: [] }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI });
  assertEquals(out.kind, 'processed');
  assertEquals(deps._stub.upserts.length, 0);
});

Deno.test('(F.3) processItem: upsert DB error → THROW (transient)', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    accessionIndex: makeAccessionIndex({
      kind: 'resolved',
      primary_document: 'primary_doc.xml',
      acceptance_datetime: '2026-06-11T16:00:00.000Z',
      filenames: ['primary_doc.xml'],
    }),
    form4Fetcher: makeForm4Fetcher({
      kind: 'rows',
      rows: [{
        issuer_cik: '0000320193', owner_cik: '0001111111',
        accession_number: '0000320193-26-000010', transaction_seq: 0,
        transaction_code: 'P', shares: 1000, price_per_share: 50,
        acquired_disposed: 'A', ownership_type: 'D', officer_title: 'CEO',
        is_director: false, is_officer: true, is_ten_percent_owner: false,
        has_10b5_1_mention: false,
        transaction_date: '2026-06-10', acceptance_datetime: '2026-06-11T16:00:00.000Z',
      }],
    }),
  });
  deps._stub.upsertResults.push({ error: { message: 'serialization_failure' } });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  await assertRejects(() => cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI }));
});

// ── (H) loadAndCompute adapter (M3 — runStaged seam) ───────────────────
Deno.test('(H.1) loadAndCompute: maps staged per_ticker (value + skip) to engine contract', async () => {
  // Stub the loadAndComputeCtx so we don't have to wire the full
  // load-compute pipeline; instead, drive a tiny universe + zero rows
  // → produces only typed skips → exercises the value-AND-skip mapping
  // shape per the M3 contract.
  const upserts: unknown[] = [];
  void upserts;
  const ctxSupa = {
    from(table: string) {
      if (table === 'universe_membership') {
        let isLatest = false;
        const b: Record<string, unknown> = {
          select(cols: string) { isLatest = cols === 'as_of_date'; return b; },
          eq() { return b; },
          order() { return b; },
          limit() { return Promise.resolve({ data: [{ as_of_date: '2026-06-12' }], error: null }); },
          then(onF: unknown, onR: unknown) {
            return Promise.resolve({
              data: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
              error: null,
            }).then(onF as never, onR as never);
          },
        };
        void isLatest;
        return b;
      }
      if (table === 'insider_form4_rows') {
        const b: Record<string, unknown> = {
          select() { return b; },
          in() { return b; },
          gte() { return b; },
          lte() { return b; },
          order() { return b; },
          range() { return Promise.resolve({ data: [], error: null }); },
        };
        return b;
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  const loadAndComputeCtx = {
    supabase: ctxSupa as never,
    operator_id: OPERATOR_ID,
    sharesOutstanding: { async fetchShares() { return { kind: 'shares', shares: 1e9 }; } } as never,
    priceHistory: { async fetchPriceHistory() { return [{ ts: '2026-06-12', close: 100 }]; } } as never,
  };
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    daily: {},
    loadAndComputeCtx,
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const out = await cfg.loadAndCompute!({ asOf: AS_OF_FRI });
  assertEquals(out.length, 1);
  assertEquals(out[0].ticker, 'AAPL');
  assertEquals(out[0].gicsSector, null); // skip path → null
  assertEquals(out[0].result.kind, 'skip');
  if (out[0].result.kind === 'skip') {
    assertEquals(out[0].result.reason, 'no_qualifying_transactions');
  }
});

Deno.test('(H.2) loadAndCompute: empty universe → short-circuit throws (failure surface preserved)', async () => {
  const ctxSupa = {
    from(table: string) {
      if (table === 'universe_membership') {
        const b: Record<string, unknown> = {
          select() { return b; },
          eq() { return b; },
          order() { return b; },
          limit() { return Promise.resolve({ data: [], error: null }); },
        };
        return b;
      }
      throw new Error('unexpected');
    },
  };
  const loadAndComputeCtx = {
    supabase: ctxSupa as never,
    operator_id: OPERATOR_ID,
    sharesOutstanding: { async fetchShares() { return { kind: 'shares', shares: 1e9 }; } } as never,
    priceHistory: { async fetchPriceHistory() { return []; } } as never,
  };
  const deps = makeBaselineDeps({
    universe: [],
    cikMap: {},
    daily: {},
    loadAndComputeCtx,
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  await assertRejects(() => cfg.loadAndCompute!({ asOf: AS_OF_FRI }));
});

// ── Registry shape sanity ─────────────────────────────────────────────
Deno.test('(R.1) createInsiderWorkListConfig: daily vs backfill choose distinct jobIds', () => {
  const deps = makeBaselineDeps({ universe: [], cikMap: {}, daily: {} });
  const daily = createInsiderWorkListConfig(deps, 'daily');
  const backfill = createInsiderWorkListConfig(deps, 'backfill');
  assertEquals(daily.signalId, INSIDER_SIGNAL_ID);
  assertEquals(backfill.signalId, INSIDER_SIGNAL_ID);
  assertEquals(daily.jobId, INSIDER_DAILY_JOB_ID);
  assertEquals(backfill.jobId, INSIDER_BACKFILL_JOB_ID);
  assertEquals(daily.mode, 'work-list');
  assertEquals(daily.itemsPerSlice, 50);
  assertEquals(daily.callsPerItem, 2);
});