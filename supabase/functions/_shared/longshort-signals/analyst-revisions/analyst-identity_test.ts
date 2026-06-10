// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  analystKeysEqual,
  findSameAnalystPrior,
  normalizeAnalystKey,
  parseFmpDate,
  type RawPriceTargetRow,
} from './analyst-identity.ts';

function row(partial: Partial<RawPriceTargetRow>): RawPriceTargetRow {
  return {
    symbol: partial.symbol ?? 'XYZ',
    publishedDate: partial.publishedDate ?? '2026-05-01 12:00:00',
    analystName: partial.analystName ?? '',
    analystCompany: partial.analystCompany ?? '',
    priceTarget: partial.priceTarget ?? null,
    adjPriceTarget: partial.adjPriceTarget ?? null,
    priceWhenPosted: partial.priceWhenPosted ?? null,
    newsTitle: partial.newsTitle ?? '',
  };
}

Deno.test('(1) normalizeAnalystKey lowercases and strips non-alnum', () => {
  const k = normalizeAnalystKey('Jay  Sole', 'UBS, Inc.');
  assertEquals(k.name, 'jaysole');
  assertEquals(k.company, 'ubsinc');
});

Deno.test('(2) analystKeysEqual: empty name never matches', () => {
  const a = normalizeAnalystKey('', 'UBS');
  const b = normalizeAnalystKey('', 'UBS');
  assertEquals(analystKeysEqual(a, b), false);
});

Deno.test('(3) analystKeysEqual: both fields must match', () => {
  const a = normalizeAnalystKey('Dan Ives', 'Wedbush');
  const b = normalizeAnalystKey('Dan Ives', 'Wedbush Securities');
  assertEquals(analystKeysEqual(a, b), false);
  const c = normalizeAnalystKey('Dan Ives', 'Wedbush');
  assertEquals(analystKeysEqual(a, c), true);
});

Deno.test('(4) parseFmpDate accepts space-separated, ISO, and date-only', () => {
  const a = parseFmpDate('2026-05-14 13:32:00');
  const b = parseFmpDate('2026-05-14T13:32:00Z');
  const c = parseFmpDate('2026-05-14');
  assert(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c));
  assertEquals(a, b);
});

// ── NKE-shaped: true revision delta recovered ─────────────────────────
Deno.test('(5) NKE-shaped focal: same-analyst prior returned (true Δ −19.35%)', () => {
  const focal = row({
    symbol: 'NKE',
    publishedDate: '2026-05-14 13:32:00',
    analystName: 'Jay Sole',
    analystCompany: 'UBS',
    priceTarget: 50,
    priceWhenPosted: 44.3,
  });
  const history: RawPriceTargetRow[] = [
    row({ symbol: 'NKE', publishedDate: '2025-12-20 09:00:00', analystName: 'Jay Sole', analystCompany: 'UBS', priceTarget: 62 }),
    row({ symbol: 'NKE', publishedDate: '2025-09-15 09:00:00', analystName: 'Jay Sole', analystCompany: 'UBS', priceTarget: 75 }),
    row({ symbol: 'NKE', publishedDate: '2026-04-10 09:00:00', analystName: 'Other Analyst', analystCompany: 'Morgan Stanley', priceTarget: 70 }),
  ];
  const out = findSameAnalystPrior(focal, history);
  assertEquals(out.kind, 'found');
  if (out.kind !== 'found') throw new Error('unreachable');
  assertEquals(out.row.priceTarget, 62);
  const delta = (focal.priceTarget! - out.row.priceTarget!) / out.row.priceTarget!;
  assert(Math.abs(delta - -0.1935) < 0.001, `expected ~-19.35%, got ${delta}`);
});

// ── DDOG-shaped (canonical normalization hazard) ──────────────────────
Deno.test('(6) DDOG-shaped: firm-only history with EMPTY analystName → typed absence (NOT $220)', () => {
  const focal = row({
    symbol: 'DDOG',
    publishedDate: '2026-05-20 10:00:00',
    analystName: 'Dan Ives',
    analystCompany: 'Wedbush',
    priceTarget: 260,
  });
  const history: RawPriceTargetRow[] = [
    row({ symbol: 'DDOG', publishedDate: '2026-04-01 10:00:00', analystName: '', analystCompany: 'Wedbush', priceTarget: 220 }),
    row({ symbol: 'DDOG', publishedDate: '2026-03-01 10:00:00', analystName: '', analystCompany: 'Wedbush', priceTarget: 215 }),
  ];
  const out = findSameAnalystPrior(focal, history);
  assertEquals(out.kind, 'absent');
  if (out.kind !== 'absent') throw new Error('unreachable');
  assertEquals(out.reason, 'no_history_match');
});

// ── HYLN-shaped: sparse ───────────────────────────────────────────────
Deno.test('(7) HYLN-shaped: zero same-analyst rows → typed absence', () => {
  const focal = row({
    symbol: 'HYLN',
    publishedDate: '2026-05-10 10:00:00',
    analystName: 'Some One',
    analystCompany: 'Cantor',
    priceTarget: 4,
  });
  const history: RawPriceTargetRow[] = [
    row({ symbol: 'HYLN', publishedDate: '2026-02-10 10:00:00', analystName: 'Other Person', analystCompany: 'BoA', priceTarget: 3 }),
  ];
  const out = findSameAnalystPrior(focal, history);
  assertEquals(out.kind, 'absent');
  if (out.kind !== 'absent') throw new Error('unreachable');
  assertEquals(out.reason, 'no_history_match');
});

// ── Empty focal analyst → typed absence (specific reason) ─────────────
Deno.test('(8) empty focal analystName → empty_focal_analyst absence', () => {
  const focal = row({
    symbol: 'XYZ',
    publishedDate: '2026-05-01 12:00:00',
    analystName: '',
    analystCompany: 'SomeFirm',
    priceTarget: 100,
  });
  const history: RawPriceTargetRow[] = [
    row({ symbol: 'XYZ', publishedDate: '2026-04-01 12:00:00', analystName: '', analystCompany: 'SomeFirm', priceTarget: 90 }),
  ];
  const out = findSameAnalystPrior(focal, history);
  assertEquals(out.kind, 'absent');
  if (out.kind !== 'absent') throw new Error('unreachable');
  assertEquals(out.reason, 'empty_focal_analyst');
});

// ── Boundary: 366d excluded, 365d included ────────────────────────────
Deno.test('(9) boundary: prior exactly 366d old → excluded; 365d → included', () => {
  const focal = row({
    publishedDate: '2026-05-01 00:00:00',
    analystName: 'A B',
    analystCompany: 'Firm',
    priceTarget: 100,
  });
  // 366d before focal: 2025-04-30 (366d = 2025-04-30 00:00:00; 365d = 2025-05-01)
  const tooOld: RawPriceTargetRow = row({
    publishedDate: '2025-04-30 00:00:00',
    analystName: 'A B',
    analystCompany: 'Firm',
    priceTarget: 80,
  });
  const justIn: RawPriceTargetRow = row({
    publishedDate: '2025-05-01 00:00:00',
    analystName: 'A B',
    analystCompany: 'Firm',
    priceTarget: 90,
  });

  const out1 = findSameAnalystPrior(focal, [tooOld]);
  assertEquals(out1.kind, 'absent');
  if (out1.kind !== 'absent') throw new Error('unreachable');
  assertEquals(out1.reason, 'beyond_window');

  const out2 = findSameAnalystPrior(focal, [justIn]);
  assertEquals(out2.kind, 'found');
  if (out2.kind !== 'found') throw new Error('unreachable');
  assertEquals(out2.row.priceTarget, 90);
});

// ── Boundary: equal timestamp excluded (strictly before) ──────────────
Deno.test('(10) boundary: prior dated equal to focal publishedDate → excluded', () => {
  const focal = row({
    publishedDate: '2026-05-01 12:00:00',
    analystName: 'A B',
    analystCompany: 'Firm',
    priceTarget: 100,
  });
  const sameMoment: RawPriceTargetRow = row({
    publishedDate: '2026-05-01 12:00:00',
    analystName: 'A B',
    analystCompany: 'Firm',
    priceTarget: 95,
  });
  const out = findSameAnalystPrior(focal, [sameMoment]);
  assertEquals(out.kind, 'absent');
});

Deno.test('(11) most-recent prior wins over older same-analyst rows', () => {
  const focal = row({
    publishedDate: '2026-05-01 12:00:00',
    analystName: 'A B',
    analystCompany: 'Firm',
    priceTarget: 100,
  });
  const history: RawPriceTargetRow[] = [
    row({ publishedDate: '2025-12-01 12:00:00', analystName: 'A B', analystCompany: 'Firm', priceTarget: 85 }),
    row({ publishedDate: '2026-03-15 12:00:00', analystName: 'A B', analystCompany: 'Firm', priceTarget: 92 }),
    row({ publishedDate: '2026-01-10 12:00:00', analystName: 'A B', analystCompany: 'Firm', priceTarget: 88 }),
  ];
  const out = findSameAnalystPrior(focal, history);
  assertEquals(out.kind, 'found');
  if (out.kind !== 'found') throw new Error('unreachable');
  assertEquals(out.row.priceTarget, 92);
});