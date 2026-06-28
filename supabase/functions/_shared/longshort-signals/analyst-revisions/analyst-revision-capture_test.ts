// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import (DW-178)
// @ts-nocheck — Deno test file; runs via `deno test`.
/**
 * DW-178 — analyst_revision_observations capture test.
 *
 * Anti-fabrication pins:
 *   - Captured rows equal the kernel's `meta.scoredRevisions`
 *     byte-for-byte (no fabricated defaults, no dropped real fields).
 *   - Unrecovered focals (no same-analyst prior) produce NO row.
 *   - Reiteration (direction === 0) IS captured — it's a real
 *     observation, not absence.
 *   - Conflict posture is ON CONFLICT DO NOTHING (ignoreDuplicates),
 *     NOT upsert. Pure compute → re-fire must be a clean no-op, never
 *     a silent overwrite that masks drift.
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeAnalystRevision } from './compute-analyst-revision.ts';
import type { RawPriceTargetRow } from './analyst-identity.ts';
import { captureAnalystRevisions } from './analyst-revision-capture.ts';

const AS_OF = new Date('2026-06-01T00:00:00Z');
const MS_PER_DAY = 86_400_000;

function isoMinusDays(d: Date, days: number): string {
  const ms = d.getTime() - days * MS_PER_DAY;
  const iso = new Date(ms).toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 19);
}

function row(p: Partial<RawPriceTargetRow>): RawPriceTargetRow {
  return {
    symbol: p.symbol ?? 'XYZ',
    publishedDate: p.publishedDate ?? isoMinusDays(AS_OF, 1),
    analystName: p.analystName ?? 'Jane Doe',
    analystCompany: p.analystCompany ?? 'AcmeCo',
    priceTarget: p.priceTarget ?? null,
    adjPriceTarget: p.adjPriceTarget ?? null,
    priceWhenPosted: p.priceWhenPosted ?? null,
    newsTitle: p.newsTitle ?? '',
  };
}

function makeMockSupabase() {
  const calls: Array<{ payload: unknown[]; opts: { onConflict?: string; ignoreDuplicates?: boolean } }> = [];
  const supabase: unknown = {
    from(table: string) {
      return {
        upsert(payload: unknown[], opts: { onConflict?: string; ignoreDuplicates?: boolean }) {
          assertStrictEquals(table, 'analyst_revision_observations');
          calls.push({ payload, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { supabase, calls };
}

// ── PIN 1: captured rows equal kernel scoredRevisions byte-for-byte ────
Deno.test('captureAnalystRevisions: rows equal compute scoredRevisions (real fixture)', async () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 10), priceTarget: 100, analystName: 'Jane Doe', analystCompany: 'AcmeCo' });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 2), priceTarget: 120, analystName: 'Jane Doe', analystCompany: 'AcmeCo' });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  assertEquals(r.meta.scoredRevisions.length, 1);
  const d = r.meta.scoredRevisions[0];

  const { supabase, calls } = makeMockSupabase();
  await captureAnalystRevisions({
    supabase,
    operator_id: 'op-1',
    signal_id: 'analyst_revision_drift',
    as_of_date: '2026-06-01',
    computed_at: '2026-06-01T21:00:00.000Z',
    rows: [{ ticker: 'XYZ', meta: r.meta }],
  });

  assertEquals(calls.length, 1);
  // Conflict posture is DO NOTHING, NOT upsert.
  assertStrictEquals(calls[0].opts.ignoreDuplicates, true);
  assertStrictEquals(
    calls[0].opts.onConflict,
    'operator_id,signal_id,as_of_date,ticker,analyst_name_key,analyst_company_key,focal_published_at',
  );

  assertEquals(calls[0].payload.length, 1);
  const p = calls[0].payload[0] as Record<string, unknown>;
  assertStrictEquals(p.ticker, 'XYZ');
  assertStrictEquals(p.operator_id, 'op-1');
  assertStrictEquals(p.signal_id, 'analyst_revision_drift');
  assertStrictEquals(p.as_of_date, '2026-06-01');
  assertStrictEquals(p.analyst_name, d.analystName);
  assertStrictEquals(p.analyst_company, d.analystCompany);
  assertStrictEquals(p.analyst_name_key, d.analystNameKey);
  assertStrictEquals(p.analyst_company_key, d.analystCompanyKey);
  assertStrictEquals(p.new_target, d.newTarget);
  assertStrictEquals(p.prior_target, d.priorTarget);
  assertStrictEquals(p.target_delta, d.targetDelta);
  assertStrictEquals(p.magnitude_pct, d.magnitudePct);
  assertStrictEquals(p.direction, d.direction);
  assertStrictEquals(p.contribution, d.contribution);
  assertStrictEquals(p.age_days, Math.trunc(d.ageDays));
  assertStrictEquals(p.pair_basis, d.pairBasis);
  assertStrictEquals(
    p.focal_published_at,
    new Date(d.focalPublishedAtMs).toISOString(),
  );
  assertStrictEquals(
    p.prior_published_at,
    new Date(d.priorPublishedAtMs).toISOString(),
  );
});

// ── PIN 2: reiteration (direction=0) IS captured — real observation ────
Deno.test('captureAnalystRevisions: reiteration (direction=0) writes a row (real observation, not absence)', async () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 10), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 2), priceTarget: 100 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  // All-zero-magnitude → typed skip (no value path); the compute classifies
  // this as `zero_magnitude_only`. To exercise direction=0 in a value run,
  // pair it with a real revision so scoredSum is non-zero overall.
  assert(r.kind === 'skip');

  // Now mix: one real +Δ + one reiteration. The reiteration must appear
  // as a captured row with direction=0 (REAL observation).
  const reiterFocal = row({ publishedDate: isoMinusDays(AS_OF, 3), priceTarget: 100, analystName: 'Re Iter', analystCompany: 'Firm' });
  const reiterPrior = row({ publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100, analystName: 'Re Iter', analystCompany: 'Firm' });
  const realFocal = row({ publishedDate: isoMinusDays(AS_OF, 1), priceTarget: 110, analystName: 'Jane Doe', analystCompany: 'AcmeCo' });
  const realPrior = row({ publishedDate: isoMinusDays(AS_OF, 12), priceTarget: 100, analystName: 'Jane Doe', analystCompany: 'AcmeCo' });
  const r2 = computeAnalystRevision({
    focalRows: [realFocal, reiterFocal],
    history: [realPrior, reiterPrior],
    asOf: AS_OF,
  });
  assert(r2.kind === 'value');
  assertEquals(r2.meta.scoredRevisions.length, 2);
  const dirs = r2.meta.scoredRevisions.map((x) => x.direction).sort();
  assertEquals(dirs, [0, 1]);

  const { supabase, calls } = makeMockSupabase();
  await captureAnalystRevisions({
    supabase,
    operator_id: 'op-1',
    signal_id: 'analyst_revision_drift',
    as_of_date: '2026-06-01',
    computed_at: '2026-06-01T21:00:00.000Z',
    rows: [{ ticker: 'XYZ', meta: r2.meta }],
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].payload.length, 2);
  const directions = (calls[0].payload as Array<Record<string, unknown>>)
    .map((p) => p.direction as number)
    .sort();
  assertEquals(directions, [0, 1]);
});

// ── PIN 3: unrecovered focal → NO row (typed absence in meta counts) ───
Deno.test('captureAnalystRevisions: unrecovered focals produce NO row (anti-fabrication)', async () => {
  // Focal with no matching prior in history → unrecovered.
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 2), priceTarget: 110, analystName: 'Solo Analyst', analystCompany: 'NoPrior' });
  // Also one scored revision so we get a value (not a pure skip).
  const scoredFocal = row({ publishedDate: isoMinusDays(AS_OF, 1), priceTarget: 110, analystName: 'Jane Doe', analystCompany: 'AcmeCo' });
  const scoredPrior = row({ publishedDate: isoMinusDays(AS_OF, 12), priceTarget: 100, analystName: 'Jane Doe', analystCompany: 'AcmeCo' });
  const r = computeAnalystRevision({
    focalRows: [scoredFocal, focal],
    history: [scoredPrior],
    asOf: AS_OF,
  });
  assert(r.kind === 'value');
  assertEquals(r.meta.scoredCount, 1);
  assertEquals(r.meta.unrecoveredCount, 1);
  // scoredRevisions only contains the scored one — unrecovered is absent.
  assertEquals(r.meta.scoredRevisions.length, 1);

  const { supabase, calls } = makeMockSupabase();
  await captureAnalystRevisions({
    supabase,
    operator_id: 'op-1',
    signal_id: 'analyst_revision_drift',
    as_of_date: '2026-06-01',
    computed_at: '2026-06-01T21:00:00.000Z',
    rows: [{ ticker: 'XYZ', meta: r.meta }],
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].payload.length, 1);
  // The single row is the scored one, not the unrecovered one.
  const p = calls[0].payload[0] as Record<string, unknown>;
  assertStrictEquals(p.analyst_name, 'Jane Doe');
});

// ── PIN 4: empty / no scored → no DB call ──────────────────────────────
Deno.test('captureAnalystRevisions: no scored revisions → no DB call', async () => {
  const { supabase, calls } = makeMockSupabase();
  await captureAnalystRevisions({
    supabase,
    operator_id: 'op-1',
    signal_id: 'analyst_revision_drift',
    as_of_date: '2026-06-01',
    computed_at: '2026-06-01T21:00:00.000Z',
    rows: [],
  });
  assertEquals(calls.length, 0);

  // Also: a row whose meta has empty scoredRevisions makes no call.
  await captureAnalystRevisions({
    supabase,
    operator_id: 'op-1',
    signal_id: 'analyst_revision_drift',
    as_of_date: '2026-06-01',
    computed_at: '2026-06-01T21:00:00.000Z',
    rows: [{ ticker: 'XYZ', meta: { scoredCount: 0, unrecoveredCount: 0, malformedCount: 0, scoredRevisions: [] } }],
  });
  assertEquals(calls.length, 0);
});

// ── PIN 5: DB error throws (orchestrator surfaces as failed) ───────────
Deno.test('captureAnalystRevisions: DB error throws', async () => {
  const supabase: unknown = {
    from(_t: string) {
      return {
        upsert(_p: unknown, _o?: unknown) {
          return Promise.resolve({ error: { message: 'boom' } });
        },
      };
    },
  };
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 10), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 1), priceTarget: 110 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');

  let threw = false;
  try {
    await captureAnalystRevisions({
      supabase,
      operator_id: 'op-1',
      signal_id: 'analyst_revision_drift',
      as_of_date: '2026-06-01',
      computed_at: '2026-06-01T21:00:00.000Z',
      rows: [{ ticker: 'XYZ', meta: r.meta }],
    });
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes('analyst_revision_observations insert failed'));
    assert(String((e as Error).message).includes('boom'));
  }
  assert(threw, 'expected captureAnalystRevisions to throw on DB error');
});