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

// ── (A.2) F2.c per-day work-budget ceiling drift sentinel ─────────────
Deno.test('(A.2) INSIDER_PER_DAY_WORK_BUDGET_CEILING = 800 (queue-evidence top + ~4% pad)', () => {
  // Real-evidence max measured at 770 (2026-04-02, post-earnings cluster)
  // per the F2.c backfill verification; 800 pads for variance robustness.
  // Supersedes the prior ~352 M4 RE-RULE estimate (Catalog #43 recursive
  // application). Any future relaxation that drives this past the daily
  // window MUST fail this test rather than silently sliding past
  // pre-market.
  assertEquals(INSIDER_PER_DAY_WORK_BUDGET_CEILING, 800);
  const slicesAtCeiling = Math.ceil(INSIDER_PER_DAY_WORK_BUDGET_CEILING / INSIDER_ITEMS_PER_SLICE);
  assertEquals(slicesAtCeiling, 16, '800 / 50 → 16 slices');
  // Each slice ~35-55s; 16 slices → 9.3-14.7 min, well inside the
  // ~21:15-UTC → next-day pre-market window.
  const worstCaseDrainSec = slicesAtCeiling * 55;
  assert(worstCaseDrainSec < 60 * 60, `worst-case drain ${worstCaseDrainSec}s must fit within 1h`);
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

/**
 * Per-test Supabase stub. Serves:
 *  - `universe_membership`: latest-as_of_date probe + row read.
 *  - `insider_accession_discovery_queue`: F2.c claim
 *      UPDATE … RETURNING (filtered by .eq/.is/.in/.or chain) AND the
 *      backfill distinct-dates SELECT.
 *  - `insider_form4_rows`: upsert capture for the (F.*) tests.
 *
 * Queue stub semantics:
 *  - Initial state = `queueRows` (the test's "discovery rows in the
 *    table"). Each row carries as_of_date / issuer_cik / accession_
 *    number / form_type / consumed_at.
 *  - `.update({consumed_at}).eq('as_of_date', d).is('consumed_at',
 *    null).in('issuer_cik', list).or(headerExclusion).select(...)`
 *    atomically flips consumed_at on matching rows and RETURNs them
 *    (mirrors Postgres UPDATE … RETURNING; mirrors the production
 *    single-statement atomicity claim).
 */
interface QueueRowFixture {
  as_of_date: string;
  issuer_cik: string;
  accession_number: string;
  form_type: '4' | '4/A';
  consumed_at: string | null;
}

function makeStubSupabase(opts: {
  universe: Array<{ ticker: string; gics_sector: string | null }>;
  queueRows?: QueueRowFixture[];
}) {
  const queueRows: QueueRowFixture[] = (opts.queueRows ?? []).map((r) => ({ ...r }));
  const upserts: { table: string; payload: unknown[]; onConflict: string | undefined }[] = [];
  const upsertResults: Array<{ error: { message: string } | null }> = [];
  const claimCalls: Array<{ as_of_date: string; in_list: string[]; or_filter: string }> = [];

  function from(table: string) {
    if (table === 'universe_membership') {
      const b: Record<string, unknown> = {
        select() { return b; },
        eq() { return b; },
        order() { return b; },
        limit() {
          return Promise.resolve(
            opts.universe.length > 0
              ? { data: [{ as_of_date: '2026-06-12' }], error: null }
              : { data: [], error: null },
          );
        },
        then(onF: unknown, onR: unknown) {
          return Promise.resolve({ data: opts.universe, error: null })
            .then(onF as never, onR as never);
        },
      };
      return b;
    }
    if (table === 'insider_accession_discovery_queue') {
      // Two shapes: (a) UPDATE…RETURNING claim, (b) SELECT distinct dates.
      let kind: 'update' | 'select' = 'select';
      let updateConsumedAt: string | null = null;
      const eqs: Record<string, unknown> = {};
      const gtes: Record<string, unknown> = {};
      const ltes: Record<string, unknown> = {};
      let isConsumedNull = false;
      let inIssuerCiks: string[] = [];
      let orFilter = '';
      let selectCols = '';

      const b: Record<string, unknown> = {
        update(payload: { consumed_at: string }) {
          kind = 'update';
          updateConsumedAt = payload.consumed_at;
          return b;
        },
        select(cols: string) { selectCols = cols; return b; },
        eq(col: string, v: unknown) { eqs[col] = v; return b; },
        gte(col: string, v: unknown) { gtes[col] = v; return b; },
        lte(col: string, v: unknown) { ltes[col] = v; return b; },
        is(col: string, v: unknown) {
          if (col === 'consumed_at' && v === null) isConsumedNull = true;
          return b;
        },
        in(col: string, list: unknown[]) {
          if (col === 'issuer_cik') inIssuerCiks = list as string[];
          return b;
        },
        or(filter: string) { orFilter = filter; return b; },
        then(onF: unknown, onR: unknown) {
          if (kind === 'update') {
            claimCalls.push({
              as_of_date: String(eqs['as_of_date']),
              in_list: inIssuerCiks.slice(),
              or_filter: orFilter,
            });
            const inSet = new Set(inIssuerCiks);
            const heartbeatExcl = orFilter.includes(
              `issuer_cik.neq.${PRODUCER_HEARTBEAT_ISSUER_CIK}`,
            );
            const claimed: QueueRowFixture[] = [];
            for (const r of queueRows) {
              if (r.as_of_date !== eqs['as_of_date']) continue;
              if (isConsumedNull && r.consumed_at !== null) continue;
              if (inSet.size > 0 && !inSet.has(r.issuer_cik)) continue;
              if (heartbeatExcl &&
                  r.issuer_cik === PRODUCER_HEARTBEAT_ISSUER_CIK &&
                  r.accession_number === PRODUCER_HEARTBEAT_ACCESSION_NUMBER) {
                continue;
              }
              r.consumed_at = updateConsumedAt; // atomic flip
              claimed.push({ ...r });
            }
            void selectCols;
            const projected = claimed.map((r) => ({
              issuer_cik: r.issuer_cik,
              accession_number: r.accession_number,
              form_type: r.form_type,
            }));
            return Promise.resolve({ data: projected, error: null })
              .then(onF as never, onR as never);
          }
          // SELECT path — two shapes:
          //   (i) backfill distinct-dates (gte/lte; projects as_of_date)
          //   (ii) ACT-211 processItem by-accession reconstruction
          //        (eq accession_number; projects issuer_cik, form_type)
          if (typeof eqs['accession_number'] === 'string') {
            const acc = eqs['accession_number'] as string;
            const matches = queueRows.filter((r) => r.accession_number === acc);
            const projected = matches.map((r) => ({
              issuer_cik: r.issuer_cik,
              form_type: r.form_type,
            }));
            void selectCols;
            return Promise.resolve({ data: projected, error: null })
              .then(onF as never, onR as never);
          }
          const rows = queueRows.filter((r) => {
            if (isConsumedNull && r.consumed_at !== null) return false;
            if (gtes['as_of_date'] && r.as_of_date < (gtes['as_of_date'] as string)) return false;
            if (ltes['as_of_date'] && r.as_of_date > (ltes['as_of_date'] as string)) return false;
            return true;
          }).map((r) => ({ as_of_date: r.as_of_date }));
          return Promise.resolve({ data: rows, error: null }).then(onF as never, onR as never);
        },
        limit(_n: number) { return b; },
      };
      return b;
    }
    if (table === 'insider_form4_rows') {
      return {
        upsert(payload: unknown[], optsU: { onConflict?: string } = {}) {
          upserts.push({ table, payload, onConflict: optsU.onConflict });
          const r = upsertResults.shift() ?? { error: null };
          return Promise.resolve(r);
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }
  return { from, upserts, upsertResults, claimCalls, _queueRows: queueRows };
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

// `makeDailyIndex` removed at F2.c — `seedWorkItems` no longer hits
// EDGAR; the on-EDGAR call site is the GHA-egress producer
// (`scripts/insider-discovery-egress.ts`). The consumer tests now
// fixture the discovery queue directly via `makeStubSupabase`.

function makeBaselineDeps(
  opts: {
    universe: Array<{ ticker: string; gics_sector: string | null }>;
    cikMap: Record<string, number>;
    queueRows?: QueueRowFixture[];
    accessionIndex?: unknown;
    form4Fetcher?: unknown;
    loadAndComputeCtx?: unknown;
  },
): InsiderWorkListDeps & { _stub: ReturnType<typeof makeStubSupabase> } {
  const supa = makeStubSupabase({ universe: opts.universe, queueRows: opts.queueRows });
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
    accessionIndex: (opts.accessionIndex ?? noop) as never,
    form4Fetcher: (opts.form4Fetcher ?? noopForm4) as never,
    loadAndComputeCtx: (opts.loadAndComputeCtx ?? {}) as never,
  };
}

// ── (D) seedWorkItems — F2.c queue-claim contract ──────────────────────
//
// F2.c switches the seed from EDGAR daily-index fetch to a Supabase
// claim against `insider_accession_discovery_queue` (rows pre-populated
// by the GHA-egress producer). The (D.*) tests pin: in-universe filter,
// empty-universe Q5, no-rows-for-day cleanly empty, backfill cross-day
// dedupe, AND the R1 heartbeat-exclusion structural predicate.

Deno.test('(D.1) seedWorkItems daily: in-universe IN-filter drops out-of-universe queue rows', async () => {
  const deps = makeBaselineDeps({
    universe: [
      { ticker: 'AAPL', gics_sector: 'Tech' },
      { ticker: 'MSFT', gics_sector: 'Tech' },
    ],
    cikMap: { AAPL: 320193, MSFT: 789019 },
    queueRows: [
      { as_of_date: '2026-06-11', issuer_cik: '0000320193', accession_number: '0000320193-26-000010', form_type: '4', consumed_at: null },
      { as_of_date: '2026-06-11', issuer_cik: '0000789019', accession_number: '0000789019-26-000020', form_type: '4/A', consumed_at: null },
      // Out-of-universe row (TSLA-shaped CIK) — DROPPED by .in('issuer_cik', universe).
      { as_of_date: '2026-06-11', issuer_cik: '0001318605', accession_number: '0001318605-26-000030', form_type: '4', consumed_at: null },
    ],
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 2, 'only the two in-universe accessions survive');
  const ids = items.map((i) => i.id).sort();
  assertEquals(ids, ['0000320193-26-000010', '0000789019-26-000020']);
  const aapl = items.find((i) => i.id === '0000320193-26-000010')!;
  const payload = aapl.payload as Readonly<InsiderWorkItemPayload>;
  assertEquals(payload.ticker, 'AAPL');
  assertEquals(payload.filer_cik_padded, '0000320193');
  assertEquals(payload.form_type, '4');
  // Claim flipped consumed_at on the two universe rows; left the
  // out-of-universe row unconsumed.
  const remainingUnconsumed = deps._stub._queueRows.filter((r) => r.consumed_at === null);
  assertEquals(remainingUnconsumed.length, 1);
  assertEquals(remainingUnconsumed[0].issuer_cik, '0001318605');
});

Deno.test('(D.1b) seedWorkItems daily: real NVDA CIK operand matches padded universe CIK', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'NVDA', gics_sector: 'Tech' }],
    cikMap: { NVDA: 1045810 },
    queueRows: [
      { as_of_date: '2026-06-11', issuer_cik: '0001045810', accession_number: '0001768670-26-000002', form_type: '4', consumed_at: null },
    ],
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
    queueRows: [
      { as_of_date: '2026-06-11', issuer_cik: '0000320193', accession_number: '0000320193-26-000001', form_type: '4', consumed_at: null },
    ],
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 0);
});

Deno.test('(D.3) seedWorkItems daily: no queue rows for the target day → empty items (NOT a throw)', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    queueRows: [],
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 0);
});

Deno.test('(D.4) seedWorkItems backfill: dedupes overlapping accessions across days', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    queueRows: [
      { as_of_date: '2026-06-12', issuer_cik: '0000320193', accession_number: 'DUP-ACC', form_type: '4', consumed_at: null },
      { as_of_date: '2026-06-11', issuer_cik: '0000320193', accession_number: 'DUP-ACC', form_type: '4', consumed_at: null },
    ],
  });
  const cfg = createInsiderWorkListConfig(deps, 'backfill');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_MON });
  const dupCount = items.filter((i) => i.id === 'DUP-ACC').length;
  assertEquals(dupCount, 1, 'duplicate accession across days collapses to 1 item via seenAccession set');
});

Deno.test('(D.5) seedWorkItems daily: R1 heartbeat row never reaches work-items (structural exclusion)', async () => {
  // Pin: producer + consumer use the SAME heartbeat sentinel literals
  // (re-imported from the producer module). Drift would silently let
  // heartbeat rows leak into the cursor.
  assertEquals(INSIDER_HEARTBEAT_ISSUER_CIK, PRODUCER_HEARTBEAT_ISSUER_CIK);
  assertEquals(INSIDER_HEARTBEAT_ACCESSION_NUMBER, PRODUCER_HEARTBEAT_ACCESSION_NUMBER);

  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    queueRows: [
      // R1 heartbeat (producer's empty-day sentinel; CIK + accession both
      // = '__heartbeat__'). The 63 inert pre-hardening rows from run
      // `658b8070-…` exercised this filter on first use (ACT-205 a).
      {
        as_of_date: '2026-06-11',
        issuer_cik: INSIDER_HEARTBEAT_ISSUER_CIK,
        accession_number: INSIDER_HEARTBEAT_ACCESSION_NUMBER,
        form_type: '4',
        consumed_at: null,
      },
      // Real in-universe row alongside the heartbeat.
      { as_of_date: '2026-06-11', issuer_cik: '0000320193', accession_number: '0000320193-26-000010', form_type: '4', consumed_at: null },
    ],
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  const items = await cfg.seedWorkItems!({ asOf: AS_OF_FRI });
  assertEquals(items.length, 1, 'heartbeat sentinel excluded; only the real row claimed');
  assertEquals(items[0].id, '0000320193-26-000010');
  // Claim predicate carried the operator-verbatim heartbeat-exclusion OR.
  const claim = deps._stub.claimCalls[0];
  assert(claim.or_filter.includes(`issuer_cik.neq.${INSIDER_HEARTBEAT_ISSUER_CIK}`));
  assert(claim.or_filter.includes(`accession_number.neq.${INSIDER_HEARTBEAT_ACCESSION_NUMBER}`));
  // Heartbeat row remained unconsumed in the queue (the IN-filter
  // dropped it before the heartbeat predicate even applied; both layers
  // independently keep it out).
  const hbRow = deps._stub._queueRows.find((r) =>
    r.issuer_cik === INSIDER_HEARTBEAT_ISSUER_CIK &&
    r.accession_number === INSIDER_HEARTBEAT_ACCESSION_NUMBER,
  )!;
  assertEquals(hbRow.consumed_at, null);
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
    queueRows: [],
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
    queueRows: [],
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
    queueRows: [],
    accessionIndex: makeAccessionIndex({ kind: 'rate_limited' }),
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  await assertRejects(() => cfg.processItem!({ item: ITEM, asOf: AS_OF_FRI }));
});

Deno.test('(E.4) processItem: form4 xml 404 → permanent_skip data_unavailable', async () => {
  const deps = makeBaselineDeps({
    universe: [{ ticker: 'AAPL', gics_sector: 'Tech' }],
    cikMap: { AAPL: 320193 },
    queueRows: [],
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
    queueRows: [],
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
    queueRows: [],
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
    queueRows: [],
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
    queueRows: [],
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
    queueRows: [],
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
    queueRows: [],
    loadAndComputeCtx,
  });
  const cfg = createInsiderWorkListConfig(deps, 'daily');
  await assertRejects(() => cfg.loadAndCompute!({ asOf: AS_OF_FRI }));
});

// ── Registry shape sanity ─────────────────────────────────────────────
Deno.test('(R.1) createInsiderWorkListConfig: daily vs backfill choose distinct jobIds', () => {
  const deps = makeBaselineDeps({ universe: [], cikMap: {} });
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