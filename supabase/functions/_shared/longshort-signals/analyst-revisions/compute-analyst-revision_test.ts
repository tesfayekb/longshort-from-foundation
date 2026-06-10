// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ANALYST_CREDIBILITY_WEIGHT,
  computeAnalystRevision,
  REVISION_DECAY_TAU_DAYS,
  REVISION_MAGNITUDE_CAP,
  REVISION_WINDOW_DAYS,
} from './compute-analyst-revision.ts';
import type { RawPriceTargetRow } from './analyst-identity.ts';

const AS_OF = new Date('2026-06-01T00:00:00Z');
const MS_PER_DAY = 86_400_000;

function isoMinusDays(d: Date, days: number): string {
  const ms = d.getTime() - days * MS_PER_DAY;
  // 'YYYY-MM-DD HH:MM:SS' — the FMP shape parseFmpDate accepts.
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

// ── (1) Decay pin: aged 0d → weight 1.0 ────────────────────────────────
Deno.test('(1) decay pin — single revision aged 0d, +20% Δ → magnitude * 1.0', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 10), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 0), priceTarget: 120 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  // dir=+1, |mag|=0.20 (< cap), weight=1.0, decay=exp(0)=1 → raw = 0.20
  assertAlmostEquals(r.raw, 0.20, 1e-12);
  assertEquals(r.meta.scoredCount, 1);
  assertEquals(r.meta.unrecoveredCount, 0);
});

Deno.test('(2) decay pin — aged 5d → exp(-1) ≈ 0.3679 to 4dp', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 5), priceTarget: 110 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  // dir=+1, |mag|=0.10, decay=exp(-5/5)=exp(-1)
  const expected = 0.10 * Math.exp(-1);
  assertAlmostEquals(r.raw, expected, 1e-12);
  // 4dp pin on the decay multiplier itself
  assertAlmostEquals(Math.exp(-1), 0.3679, 1e-4);
});

Deno.test('(3) decay pin — aged 30d → exp(-6)', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 60), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 30), priceTarget: 110 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  const expected = 0.10 * Math.exp(-6);
  assertAlmostEquals(r.raw, expected, 1e-12);
});

// ── (4) Sign convention — NKE-shaped cut → negative contribution ───────
Deno.test('(4) NKE-shaped cut $62→$50 (irrespective of spot) → negative contribution', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 15), priceTarget: 62 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 3), priceTarget: 50 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  const expectedMag = Math.min(Math.abs((50 - 62) / 62), REVISION_MAGNITUDE_CAP);
  const expected = -1 * expectedMag * Math.exp(-3 / REVISION_DECAY_TAU_DAYS);
  assertAlmostEquals(r.raw, expected, 1e-12);
  assert(r.raw < 0, 'cut MUST produce negative contribution (§4.4.5 sign convention)');
});

Deno.test('(5) raise → positive contribution', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 7), priceTarget: 200 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 1), priceTarget: 220 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value' && r.raw > 0);
});

// ── (6) Clip — +80% Δ uses 0.50 exactly ───────────────────────────────
Deno.test('(6) clip — Δ +80% uses |magnitude|=0.50 exactly', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 6), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 0), priceTarget: 180 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  // decay = exp(0) = 1
  assertAlmostEquals(r.raw, REVISION_MAGNITUDE_CAP, 1e-12);
});

Deno.test('(6b) clip — Δ −90% clamps to -0.50', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 6), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 0), priceTarget: 10 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  assertAlmostEquals(r.raw, -REVISION_MAGNITUDE_CAP, 1e-12);
});

// ── (7) Multi-revision sum — 3 revisions, mixed signs/ages ────────────
Deno.test('(7) multi-revision exact sum (3 revisions, mixed sign + age)', () => {
  const priorA = row({ analystName: 'A', publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100 });
  const focalA = row({ analystName: 'A', publishedDate: isoMinusDays(AS_OF, 2),  priceTarget: 110 }); // +10%, age 2d
  const priorB = row({ analystName: 'B', publishedDate: isoMinusDays(AS_OF, 25), priceTarget: 50  });
  const focalB = row({ analystName: 'B', publishedDate: isoMinusDays(AS_OF, 10), priceTarget: 45  }); // -10%, age 10d
  const priorC = row({ analystName: 'C', publishedDate: isoMinusDays(AS_OF, 40), priceTarget: 200 });
  const focalC = row({ analystName: 'C', publishedDate: isoMinusDays(AS_OF, 4),  priceTarget: 220 }); // +10%, age 4d

  const r = computeAnalystRevision({
    focalRows: [focalA, focalB, focalC],
    history: [priorA, priorB, priorC],
    asOf: AS_OF,
  });
  assert(r.kind === 'value');
  const cA = +0.10 * Math.exp(-2 / 5);
  const cB = -0.10 * Math.exp(-10 / 5);
  const cC = +0.10 * Math.exp(-4 / 5);
  assertAlmostEquals(r.raw, cA + cB + cC, 1e-12);
  assertEquals(r.meta.scoredCount, 3);
  assertEquals(r.meta.unrecoveredCount, 0);
});

// ── (8) Boundary — INCLUSIVE rule ─────────────────────────────────────
Deno.test('(8) 30d-boundary INCLUSIVE — exactly 30d in-window; 31d excluded', () => {
  const prior30 = row({ analystName: 'A', publishedDate: isoMinusDays(AS_OF, 200), priceTarget: 100 });
  const focal30 = row({ analystName: 'A', publishedDate: isoMinusDays(AS_OF, REVISION_WINDOW_DAYS), priceTarget: 110 });
  const prior31 = row({ analystName: 'B', publishedDate: isoMinusDays(AS_OF, 200), priceTarget: 100 });
  const focal31 = row({ analystName: 'B', publishedDate: isoMinusDays(AS_OF, REVISION_WINDOW_DAYS + 1), priceTarget: 110 });

  const r30 = computeAnalystRevision({ focalRows: [focal30], history: [prior30], asOf: AS_OF });
  assert(r30.kind === 'value', '30d boundary must be IN-window (inclusive)');

  const r31 = computeAnalystRevision({ focalRows: [focal31], history: [prior31], asOf: AS_OF });
  assert(r31.kind === 'skip' && r31.reason === 'no_revisions_in_window', '31d must be excluded');
});

// ── (9) Skip taxonomy ─────────────────────────────────────────────────
Deno.test('(9a) skip — no_revisions_in_window (empty focal)', () => {
  const r = computeAnalystRevision({ focalRows: [], history: [], asOf: AS_OF });
  assert(r.kind === 'skip' && r.reason === 'no_revisions_in_window');
});

Deno.test('(9b) skip — revision_prior_unavailable (all unrecovered)', () => {
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 1), priceTarget: 110 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [], asOf: AS_OF });
  assert(r.kind === 'skip' && r.reason === 'revision_prior_unavailable');
});

Deno.test('(9c) skip — zero_magnitude_only (all reiterations)', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 2),  priceTarget: 100 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'skip' && r.reason === 'zero_magnitude_only');
});

Deno.test('(9d) skip — data_unavailable (all malformed: priorTarget ≤ 0)', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 0 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 2),  priceTarget: 100 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'skip' && r.reason === 'data_unavailable');
});

Deno.test('(9e) mixed — 1 recovered + 2 unrecovered → value with unrecoveredCount=2', () => {
  const priorA = row({ analystName: 'A', publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100 });
  const focalA = row({ analystName: 'A', publishedDate: isoMinusDays(AS_OF, 1),  priceTarget: 110 });
  const focalB = row({ analystName: 'B', publishedDate: isoMinusDays(AS_OF, 1),  priceTarget: 90 });
  const focalC = row({ analystName: 'C', publishedDate: isoMinusDays(AS_OF, 1),  priceTarget: 80 });
  const r = computeAnalystRevision({
    focalRows: [focalA, focalB, focalC],
    history: [priorA],
    asOf: AS_OF,
  });
  assert(r.kind === 'value');
  assertEquals(r.meta.scoredCount, 1);
  assertEquals(r.meta.unrecoveredCount, 2);
});

// ── (10) Adjusted/unadjusted pairing rule ─────────────────────────────
Deno.test('(10a) pairing — both rows have adjPriceTarget → adjusted used', () => {
  // raw 100→110 would be +10%, but adj 80→100 is +25% — assert adj wins.
  const prior = row({
    publishedDate: isoMinusDays(AS_OF, 20),
    priceTarget: 100, adjPriceTarget: 80,
  });
  const focal = row({
    publishedDate: isoMinusDays(AS_OF, 0),
    priceTarget: 110, adjPriceTarget: 100,
  });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  assertAlmostEquals(r.raw, 0.25, 1e-12);
});

Deno.test('(10b) pairing — mixed availability (focal has adj, prior does not) → falls back to raw on BOTH; never mixes', () => {
  const prior = row({
    publishedDate: isoMinusDays(AS_OF, 20),
    priceTarget: 100, adjPriceTarget: null,
  });
  const focal = row({
    publishedDate: isoMinusDays(AS_OF, 0),
    priceTarget: 110, adjPriceTarget: 55,
  });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'value');
  // MUST use raw 100→110 = +10%, NOT mix adj 55 with raw 100.
  assertAlmostEquals(r.raw, 0.10, 1e-12);
});

// ── (11) Purity — same input twice → identical output ─────────────────
Deno.test('(11) purity — repeated invocations are bit-identical', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, 3),  priceTarget: 117 });
  const inputs = { focalRows: [focal], history: [prior], asOf: AS_OF };
  const r1 = computeAnalystRevision(inputs);
  const r2 = computeAnalystRevision(inputs);
  assertEquals(JSON.stringify(r1), JSON.stringify(r2));
});

// ── (12) Credibility weight is uniform 1.0 ────────────────────────────
Deno.test('(12) DEC-055 §(a) — credibility weight is 1.0 uniform', () => {
  assertEquals(ANALYST_CREDIBILITY_WEIGHT, 1.0);
});

// ── (13) Future-dated row defence (look-ahead) ────────────────────────
Deno.test('(13) future-dated focal row dropped (look-ahead defence)', () => {
  const prior = row({ publishedDate: isoMinusDays(AS_OF, 20), priceTarget: 100 });
  const focal = row({ publishedDate: isoMinusDays(AS_OF, -1), priceTarget: 110 });
  const r = computeAnalystRevision({ focalRows: [focal], history: [prior], asOf: AS_OF });
  assert(r.kind === 'skip' && r.reason === 'no_revisions_in_window');
});