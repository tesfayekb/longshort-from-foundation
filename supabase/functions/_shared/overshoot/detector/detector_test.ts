// FP-069 W3.8 T2.1b (ACT-479 DRIFT correction) — refused-with-reason + tiered-admission
// test matrix for the pure detector orchestration module. Every refusal category the
// module surfaces is exercised via a fixture-shaped candidate row; SHORT-byte-unchanged
// proofs pinned; grid-wide LONG cell-set admission (T1 = geometry, T2 = complement)
// verified end-to-end.

import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertStudyProvenance,
  DETECTOR_PREDICATE_SPEC_V1_JSON,
  DETECTOR_PREDICATE_SPEC_V2_JSON,
  DETECTOR_VERSION_HISTORY,
  isLongT1Geometry,
  LONG_ADMISSIBLE,
  LONG_ROI_MEAN_FWD_RETURN_5D_MIN,
  LONG_T1_GEOMETRY,
  LONG_TIER_ARRIVAL_COUNT_MIN,
  RATIFIED_DETECTOR_VERSION,
  RATIFIED_PARAM_GRID_HASH_PREFIX,
  RATIFIED_STUDY_RUN_ID,
  runDetector,
  type DetectorParams,
  type KernelCandidateRow,
  type ShortInterestRow,
  type StudyCellKey,
  type StudyCellStats,
} from './detector.ts';
import { bandLabelFor as realBandLabelFor } from './band-label.ts';

const RUN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const AS_OF = '2026-07-04';

function baseLongCandidate(over: Partial<KernelCandidateRow> = {}): KernelCandidateRow {
  return {
    run_id: RUN_ID,
    ticker: 'AAA',
    event_date: AS_OF,
    side: 'LONG',
    move_pct: 0.15,
    window_days: 3,
    excess_w1: 0.05, excess_w2: 0.08, excess_w3: 0.15,
    excess_w4: null, excess_w5: null,
    momentum_quintile: 5,
    drawdown_bucket: 2,
    days_to_nearest_earnings: 10,
    alias_used: null,
    ...over,
  };
}
function baseShortCandidate(over: Partial<KernelCandidateRow> = {}): KernelCandidateRow {
  return {
    run_id: RUN_ID,
    ticker: 'BBB',
    event_date: AS_OF,
    side: 'SHORT',
    move_pct: -0.12,
    window_days: 3,
    excess_w1: -0.05, excess_w2: -0.09, excess_w3: -0.12,
    excess_w4: -0.06, excess_w5: -0.04,
    momentum_quintile: 5,
    drawdown_bucket: 5,
    days_to_nearest_earnings: 10,
    alias_used: null,
    ...over,
  };
}
function makeSi(ticker: string, si_pct_float: number | null, ageDays: number, dtc: number | null = 3): ShortInterestRow {
  const ms = Date.UTC(2026, 6, 4) - ageDays * 86_400_000;
  const d = new Date(ms);
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { ticker, as_of_date: iso, si_pct_float, dtc };
}

const DEFAULT_CELL: StudyCellStats = { mean_fwd_return_5d: 0.02, arrival_count: 500 };

function defaultParams(over: Partial<DetectorParams> = {}): DetectorParams {
  return {
    runId: RUN_ID,
    asOf: AS_OF,
    capacityPerSide: 20,
    squeezeSiPctFloatMin: 0.10,
    siStalenessMaxDays: 21,
    exclusionWidthDays: 5,
    longExcessThreshold: 0.10,
    shortExcessThreshold: 0.08,
    longWindowSet: [1, 2, 3],
    shortWindowSet: [1, 2, 3, 4, 5],
    longMomentumSet: [4, 5],
    shortMomentumSet: [1, 5],
    longDrawdownSet: [1, 2, 3],
    shortDrawdownSet: [4, 5],
    bandLabelFor: (side, w, _excess) => `${side === 'LONG' ? '10' : '8'}pct_w${w}`,
    studyCellLookup: (_k: StudyCellKey) => DEFAULT_CELL,
    ...over,
  };
}

// Convenience: real bandLabelFor + seeded cell map keyed on the full StudyCellKey.
const cellKeyStr = (k: StudyCellKey) =>
  `${k.side}|${k.band}|${k.window_days}|${k.momentum_quintile}|${k.drawdown_bucket}|${k.exclusion_width_days}`;

// ─── Boot-assertion ──────────────────────────────────────────────────
Deno.test('assertStudyProvenance — accepts ratified run/hash', () => {
  assertStudyProvenance({ run_id: RATIFIED_STUDY_RUN_ID, param_grid_hash: `${RATIFIED_PARAM_GRID_HASH_PREFIX}deadbeef` });
});
Deno.test('assertStudyProvenance — hard-fail on run_id mismatch', () => {
  assertThrows(() => assertStudyProvenance({ run_id: 'wrong', param_grid_hash: `${RATIFIED_PARAM_GRID_HASH_PREFIX}x` }), Error, 'study_provenance_mismatch');
});
Deno.test('assertStudyProvenance — hard-fail on hash mismatch (mutated study run)', () => {
  assertThrows(() => assertStudyProvenance({ run_id: RATIFIED_STUDY_RUN_ID, param_grid_hash: 'mutated' }), Error, 'study_provenance_mismatch');
});

// ═══════════════════════════════════════════════════════════════════════
// FP-069 W3.8 T2.1b (ACT-479 DRIFT-CORRECTED) — geometry-based tiering
// ═══════════════════════════════════════════════════════════════════════

// ─── LONG_T1_GEOMETRY predicate unit tests ───────────────────────────
Deno.test('isLongT1Geometry — T1 iff band=L_10_INF ∧ w∈{1,2,3} ∧ mq∈{4,5} ∧ dd∈{1,2,3}', () => {
  const base = { side: 'LONG' as const, band: 'L_10_INF', window_days: 2, momentum_quintile: 5, drawdown_bucket: 1, exclusion_width_days: 5 };
  assert(isLongT1Geometry(base));
  assert(isLongT1Geometry({ ...base, window_days: 1 }));
  assert(isLongT1Geometry({ ...base, window_days: 3, momentum_quintile: 4, drawdown_bucket: 3 }));
  // Wrong band
  assert(!isLongT1Geometry({ ...base, band: 'L_08_10' }));
  assert(!isLongT1Geometry({ ...base, band: 'L_05_06' }));
  // Window out
  assert(!isLongT1Geometry({ ...base, window_days: 4 }));
  assert(!isLongT1Geometry({ ...base, window_days: 5 }));
  // Momentum out
  assert(!isLongT1Geometry({ ...base, momentum_quintile: 1 }));
  assert(!isLongT1Geometry({ ...base, momentum_quintile: 3 }));
  // Drawdown out
  assert(!isLongT1Geometry({ ...base, drawdown_bucket: 4 }));
  assert(!isLongT1Geometry({ ...base, drawdown_bucket: 5 }));
  // Wrong side
  assert(!isLongT1Geometry({ ...base, side: 'SHORT' as const, band: 'S_10_INF' }));
});

Deno.test('LONG_ADMISSIBLE — uniform ROI floor at 0.0010; arrival_count >= 1', () => {
  assert(LONG_ADMISSIBLE({ mean_fwd_return_5d: 0.0010, arrival_count: 1 }));
  assert(LONG_ADMISSIBLE({ mean_fwd_return_5d: 0.05, arrival_count: 500 }));
  assert(!LONG_ADMISSIBLE({ mean_fwd_return_5d: 0.0009, arrival_count: 1000 }));
  assert(!LONG_ADMISSIBLE({ mean_fwd_return_5d: null, arrival_count: 1000 }));
  assert(!LONG_ADMISSIBLE({ mean_fwd_return_5d: 0.10, arrival_count: 0 }));
});

Deno.test('LONG_T1_GEOMETRY constants — advertise the ratified envelope', () => {
  assertEquals([...LONG_T1_GEOMETRY.bands], ['L_10_INF']);
  assertEquals([...LONG_T1_GEOMETRY.windows], [1, 2, 3]);
  assertEquals([...LONG_T1_GEOMETRY.momentum_quintiles], [4, 5]);
  assertEquals([...LONG_T1_GEOMETRY.drawdown_buckets], [1, 2, 3]);
});

// ─── Happy-path admissions (with real bandLabelFor) ──────────────────
Deno.test('LONG T1 admission — L_10_INF/w=3/mq=5/dd=2 with high-mean cell → tier=T1', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.03, arrival_count: 500 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({ window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].selected_for_entry, true);
  assertEquals(out[0].tier, 'T1');
  assertEquals(out[0].rank_score, 0.03);
  assertEquals(out[0].study_cell_ref?.band, 'L_10_INF');
});

// ─── T2.1b FRONTIER ADMISSION — THE CASE THE LANDED T2.1 CANNOT PASS ─
Deno.test('T2.1b FRONTIER: below-10%-excess event admits as T2 when its grid cell qualifies', () => {
  // A LONG event with |excess|=0.065 → band L_06_08 (real bandLabelFor
  // per band-label.ts:50: [0.06, 0.08)). Under v1/T2.1 this refused at
  // excess-threshold. Under T2.1b it proceeds to cell lookup and admits
  // as T2 if the (L_06_08, w=3, mq=5, dd=2) cell has mean >= 0.0010.
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_06_08|3|5|2|5', { mean_fwd_return_5d: 0.0025, arrival_count: 200 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({
      ticker: 'FRONT', window_days: 3, excess_w3: 0.065, momentum_quintile: 5, drawdown_bucket: 2,
    })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, null, 'must admit under T2.1b grid-wide');
  assertEquals(out[0].selected_for_entry, true);
  assertEquals(out[0].tier, 'T2'); // L_06_08 is NOT in T1 geometry
  assertEquals(out[0].study_cell_ref?.band, 'L_06_08');
  assertEquals(out[0].rank_score, 0.0025);
});

Deno.test('T2.1b FRONTIER: momentum_quintile=1 LONG event admits as T2 when grid cell qualifies', () => {
  // Under v1/T2.1 mq=1 refused at momentum-quintile-in-set. Under T2.1b
  // mq becomes a cell-key input; admits as T2.
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|1|2|5', { mean_fwd_return_5d: 0.0040, arrival_count: 300 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({
      ticker: 'MOMLOW', window_days: 3, excess_w3: 0.15, momentum_quintile: 1, drawdown_bucket: 2,
    })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].tier, 'T2'); // mq=1 outside T1 geometry
  assertEquals(out[0].rank_score, 0.0040);
});

Deno.test('T2.1b FRONTIER: drawdown_bucket=5 LONG event admits as T2 when grid cell qualifies', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|5|5', { mean_fwd_return_5d: 0.0032, arrival_count: 150 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({
      ticker: 'DDDEEP', window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 5,
    })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].tier, 'T2');
});

Deno.test('T2.1b FRONTIER: window_days=5 LONG event admits (window is cell-key input, not gate)', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|5|5|2|5', { mean_fwd_return_5d: 0.0028, arrival_count: 100 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({
      ticker: 'W5', window_days: 5, excess_w5: 0.20, excess_w3: 0.15,
      momentum_quintile: 5, drawdown_bucket: 2,
    })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].tier, 'T2'); // w=5 outside T1 geometry
  assertEquals(out[0].argmax_window_days, 5);
});

// ─── Uniform ROI floor — the behavior delta vs v1 ────────────────────
Deno.test('LONG uniform ROI floor: T1-geometry cell with mean=0.0005 REFUSES (delta vs v1)', () => {
  // Explicit behavior delta recorded in DETECTOR_VERSION_HISTORY[v2]:
  // v1 admitted any non-null-mean LONG cell; v2b refuses below the ROI
  // floor regardless of geometry.
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.0005, arrival_count: 500 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({ window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
  assertEquals(out[0].tier, null);
  assertEquals(out[0].rank_score, null);
});

Deno.test('LONG uniform ROI floor: T2-geometry cell with mean=0.0005 REFUSES', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_05_06|3|5|2|5', { mean_fwd_return_5d: 0.0005, arrival_count: 500 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({ window_days: 3, excess_w3: 0.06, momentum_quintile: 5, drawdown_bucket: 2 })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
});

Deno.test('LONG arrival_count=0 refuses no_study_cell regardless of mean', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.05, arrival_count: 0 }],
  ]);
  const out = runDetector({
    candidates: [baseLongCandidate({ window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 })],
    shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
  assertEquals(out[0].tier, null);
});

// ─── Tier partition (grid-wide) ──────────────────────────────────────
Deno.test('Tier partition — LONG admitted event is exactly one of T1 xor T2 (grid-wide)', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.010, arrival_count: 500 }], // T1
    ['LONG|L_10_INF|4|5|2|5', { mean_fwd_return_5d: 0.010, arrival_count: 500 }], // T2 (w=4)
    ['LONG|L_10_INF|3|3|2|5', { mean_fwd_return_5d: 0.010, arrival_count: 500 }], // T2 (mq=3)
    ['LONG|L_10_INF|3|5|4|5', { mean_fwd_return_5d: 0.010, arrival_count: 500 }], // T2 (dd=4)
    ['LONG|L_08_10|3|5|2|5', { mean_fwd_return_5d: 0.010, arrival_count: 500 }],  // T2 (band)
  ]);
  const cands: KernelCandidateRow[] = [
    baseLongCandidate({ ticker: 'T1',   window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 }),
    baseLongCandidate({ ticker: 'W4',   window_days: 4, excess_w4: 0.15, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 }),
    baseLongCandidate({ ticker: 'MQ3',  window_days: 3, excess_w3: 0.15, momentum_quintile: 3, drawdown_bucket: 2 }),
    baseLongCandidate({ ticker: 'DD4',  window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 4 }),
    baseLongCandidate({ ticker: 'BAND', window_days: 3, excess_w3: 0.085, momentum_quintile: 5, drawdown_bucket: 2 }),
  ];
  const out = runDetector({
    candidates: cands, shortInterest: new Map(),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  const by = Object.fromEntries(out.map((e) => [e.ticker, e]));
  assertEquals(by.T1.tier, 'T1');
  assertEquals(by.W4.tier, 'T2');
  assertEquals(by.MQ3.tier, 'T2');
  assertEquals(by.DD4.tier, 'T2');
  assertEquals(by.BAND.tier, 'T2');
  for (const t of ['T1', 'W4', 'MQ3', 'DD4', 'BAND']) {
    assert(by[t].tier === 'T1' || by[t].tier === 'T2', `${t} must be T1 xor T2`);
    assert(by[t].filter_refusal_reason === null, `${t} must admit`);
  }
});

// ─── ROI-ordering MEANINGFUL: higher-mean T2 DOES outrank lower-mean T1 ─
Deno.test('ROI-ordering (T2.1b meaningful): higher-mean T2 cell OUTRANKS lower-mean T1 cell', () => {
  // T1-geometry cell mean 0.0011 (just above floor); T2-geometry cell
  // mean 0.0080. Under T2.1b uniform floor both admit; T2 rank_score
  // (0.0080) > T1 rank_score (0.0011) → T2 selected first, T1 second.
  // Tier is a W5 attribution tag, NOT priority.
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.0011, arrival_count: 500 }], // T1 weak
    ['LONG|L_08_10|3|5|2|5',  { mean_fwd_return_5d: 0.0080, arrival_count: 500 }], // T2 strong
  ]);
  const cands: KernelCandidateRow[] = [
    baseLongCandidate({ ticker: 'WEAK_T1',   window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 }),
    baseLongCandidate({ ticker: 'STRONG_T2', window_days: 3, excess_w3: 0.085, momentum_quintile: 5, drawdown_bucket: 2 }),
  ];
  const out = runDetector({
    candidates: cands, shortInterest: new Map(),
    params: defaultParams({
      capacityPerSide: 2,
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  const by = Object.fromEntries(out.map((e) => [e.ticker, e]));
  assertEquals(by.WEAK_T1.tier, 'T1');
  assertEquals(by.STRONG_T2.tier, 'T2');
  assert(by.WEAK_T1.selected_for_entry && by.STRONG_T2.selected_for_entry);
  const rank = (t: string) =>
    (by[t].filter_passes.find((f) => f.filter === 'capacity-slot')?.detail as { rank?: number } | undefined)?.rank;
  assertEquals(rank('STRONG_T2'), 1, 'higher-mean T2 must be selected first');
  assertEquals(rank('WEAK_T1'), 2);
});

Deno.test('Tier-tie-break determinism — identical rank_score AND |excess|: T1 before T2', () => {
  // Fabricate an EXACT tie via a custom bandLabelFor that ignores excess
  // magnitude and returns the band selected by a per-ticker hook. This
  // lets us construct two admitted events with identical rank_score AND
  // identical |excess| but one T1-geometry, one T2-geometry — the ONLY
  // scenario where the tier-tiebreak fires.
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.005, arrival_count: 100 }], // T1 geometry
    ['LONG|L_08_10|3|5|2|5',  { mean_fwd_return_5d: 0.005, arrival_count: 100 }], // T2 geometry
  ]);
  // Custom band label: T1E → L_10_INF; T2E → L_08_10; identical excess 0.15.
  // (bandLabelFor doesn't receive ticker; use a stateful call counter to
  // return different bands per call — deterministic given fixed call order.)
  let call = 0;
  const perCandBand = (side: 'LONG' | 'SHORT', w: number, ex: number): string => {
    if (side === 'SHORT') return realBandLabelFor(side, w, ex);
    const bands = ['L_10_INF', 'L_08_10'];
    return bands[call++ % 2];
  };
  const cands: KernelCandidateRow[] = [
    baseLongCandidate({ ticker: 'T1E', window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 }),
    baseLongCandidate({ ticker: 'T2E', window_days: 3, excess_w3: 0.15, momentum_quintile: 5, drawdown_bucket: 2 }),
  ];
  const out = runDetector({
    candidates: cands, shortInterest: new Map(),
    params: defaultParams({
      capacityPerSide: 1,
      bandLabelFor: perCandBand,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  const by = Object.fromEntries(out.map((e) => [e.ticker, e]));
  assertEquals(by.T1E.tier, 'T1');
  assertEquals(by.T2E.tier, 'T2');
  assertEquals(by.T1E.rank_score, 0.005);
  assertEquals(by.T2E.rank_score, 0.005);
  // Tier ASC tie-break → T1 selected first; T2 refuses capacity.
  assertEquals(by.T1E.selected_for_entry, true);
  assertEquals(by.T2E.selected_for_entry, false);
  assertEquals(by.T2E.filter_refusal_reason, 'capacity');
});

// ─── SHORT byte-unchanged proofs ─────────────────────────────────────
Deno.test('SHORT byte-unchanged — passes all v1 filters and is selected', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].selected_for_entry, true);
  assertEquals(out[0].tier, null);
  assertEquals(out[0].rank_score, -0.02); // -1 sign flip preserved
  // v1 filter_passes ordinal shape preserved for SHORT.
  const names = out[0].filter_passes.map((p) => p.filter);
  assertEquals(names[0], 'side-window-set');
  assertEquals(names[1], 'excess-threshold');
  assertEquals(names[2], 'momentum-quintile-in-set');
  assertEquals(names[3], 'drawdown-bucket-in-set');
});

Deno.test('SHORT byte-unchanged — REFUSED window_out_of_set (SHORT gate preserved)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate({ window_days: 99 })],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'window_out_of_set');
});

Deno.test('SHORT byte-unchanged — REFUSED excess_below_threshold', () => {
  const out = runDetector({
    candidates: [baseShortCandidate({ window_days: 1, excess_w1: -0.03 })],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'excess_below_threshold');
});

Deno.test('SHORT byte-unchanged — REFUSED momentum_out_of_set', () => {
  const out = runDetector({
    candidates: [baseShortCandidate({ momentum_quintile: 3 })],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'momentum_out_of_set');
});

Deno.test('SHORT byte-unchanged — REFUSED drawdown_out_of_set', () => {
  const out = runDetector({
    candidates: [baseShortCandidate({ drawdown_bucket: 2 })],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'drawdown_out_of_set');
});

Deno.test('SHORT byte-unchanged — earnings-exclusion still gates', () => {
  const out = runDetector({
    candidates: [baseShortCandidate({ days_to_nearest_earnings: 3 })],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'exclusion_earnings_proximity');
});

Deno.test('SHORT byte-unchanged — si_unavailable (no SI row)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map(),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_unavailable');
});

Deno.test('SHORT byte-unchanged — si_pct_float=null → si_unavailable (typed-null)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', null, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_unavailable');
});

Deno.test('SHORT byte-unchanged — si_stale (age > staleness_max_days)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.20, 30)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_stale');
});

Deno.test('SHORT byte-unchanged — si_below_squeeze_threshold', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.05, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_below_squeeze_threshold');
});

Deno.test('SHORT byte-unchanged — low-mean cell (below LONG ROI floor) still admits on SHORT (no floor)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.25, 5)]]),
    params: defaultParams({
      studyCellLookup: () => ({ mean_fwd_return_5d: 0.0005, arrival_count: 10 }),
    }),
  });
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].tier, null);
  assertEquals(out[0].rank_score, -0.0005);
});

// ─── LONG earnings-exclusion still gates in T2.1b ────────────────────
Deno.test('LONG earnings-exclusion still gates in T2.1b (event-level gate remains for all LONG tiers)', () => {
  const out = runDetector({
    candidates: [baseLongCandidate({ days_to_nearest_earnings: 3 })],
    shortInterest: new Map(),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'exclusion_earnings_proximity');
});

// ─── no_study_cell — lookup returns null (LONG + SHORT) ──────────────
Deno.test('LONG no_study_cell — lookup returns null (never defaults to rank=0)', () => {
  const out = runDetector({
    candidates: [baseLongCandidate()],
    shortInterest: new Map(),
    params: defaultParams({ studyCellLookup: () => null }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
  assertEquals(out[0].rank_score, null);
  assertEquals(out[0].study_cell_ref, null);
  assertEquals(out[0].tier, null);
});

Deno.test('LONG no_study_cell — cell present but mean=null (typed absence)', () => {
  const out = runDetector({
    candidates: [baseLongCandidate()],
    shortInterest: new Map(),
    params: defaultParams({ studyCellLookup: () => ({ mean_fwd_return_5d: null, arrival_count: 10 }) }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
});

// ─── Non-silent-drop contract ────────────────────────────────────────
Deno.test('Non-silent-drop contract — every (ticker,side) group yields exactly one observable output', () => {
  const seeded = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5', { mean_fwd_return_5d: 0.02, arrival_count: 500 }],
    ['LONG|L_05_06|3|1|2|5',  { mean_fwd_return_5d: 0.005, arrival_count: 100 }],
  ]);
  const cands = [
    baseLongCandidate({ ticker: 'A', excess_w3: 0.15 }),
    baseLongCandidate({ ticker: 'B', excess_w3: 0.06, momentum_quintile: 1 }),
    baseShortCandidate({ ticker: 'C' }),
    baseLongCandidate({ ticker: 'D', days_to_nearest_earnings: 2 }),
  ];
  const out = runDetector({
    candidates: cands,
    shortInterest: new Map([['C', makeSi('C', 0.25, 5)]]),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seeded.get(cellKeyStr(k)) ?? null,
    }),
  });
  assertEquals(out.length, 4);
  for (const r of out) {
    const observable = r.selected_for_entry || r.filter_refusal_reason !== null;
    assert(observable, `silent-drop detected for ${r.ticker}/${r.side}`);
  }
});

// ─── W3.5.c regression preserved under T2.1b ────────────────────────
Deno.test('W3.5.c regression: |excess|=0.11 routes to L_10_INF / S_10_INF cells and is selected', () => {
  const seededCells = new Map<string, StudyCellStats>([
    ['LONG|L_10_INF|3|5|2|5',  { mean_fwd_return_5d: 0.025, arrival_count: 500 }],
    ['SHORT|S_10_INF|3|5|5|5', { mean_fwd_return_5d: -0.030, arrival_count: 500 }],
  ]);
  const longRow = baseLongCandidate({
    ticker: 'LNG', window_days: 3, excess_w3: 0.11,
    momentum_quintile: 5, drawdown_bucket: 2, days_to_nearest_earnings: 10,
  });
  const shortRow = baseShortCandidate({
    ticker: 'SHT', window_days: 3, excess_w3: -0.11,
    momentum_quintile: 5, drawdown_bucket: 5, days_to_nearest_earnings: 10,
  });
  const out = runDetector({
    candidates: [longRow, shortRow],
    shortInterest: new Map([['SHT', { ticker: 'SHT', as_of_date: '2026-07-01', si_pct_float: 0.25, dtc: 4 }]]),
    params: defaultParams({
      bandLabelFor: realBandLabelFor,
      studyCellLookup: (k) => seededCells.get(cellKeyStr(k)) ?? null,
    }),
  });
  const long  = out.find((e) => e.ticker === 'LNG')!;
  const short = out.find((e) => e.ticker === 'SHT')!;
  assertEquals(long.filter_refusal_reason, null);
  assertEquals(long.selected_for_entry, true);
  assertEquals(long.study_cell_ref?.band, 'L_10_INF');
  assertEquals(long.tier, 'T1'); // T2.1b: L_10_INF/w=3/mq=5/dd=2 is T1 geometry
  assertEquals(long.rank_score, 0.025);
  assertEquals(short.filter_refusal_reason, null);
  assertEquals(short.selected_for_entry, true);
  assertEquals(short.study_cell_ref?.band, 'S_10_INF');
  assertEquals(short.tier, null); // SHORT: never tier-tagged
  assertEquals(short.rank_score, 0.030);
});

// ─── LONG-side shortability recording (P-B#5) — never gating ────────
Deno.test('LONG shortability recorded when lookup provided; null when absent; never gates LONG', () => {
  const out = runDetector({
    candidates: [baseLongCandidate()],
    shortInterest: new Map(),
    params: defaultParams({ shortabilityLookup: (t) => t === 'AAA' ? { shortable: true, easy_to_borrow: false } : null }),
  });
  assertEquals(out[0].shortability, { shortable: true, easy_to_borrow: false });
  assertEquals(out[0].selected_for_entry, true);
});

// ─── Version-hash reproducibility ────────────────────────────────────
Deno.test('RATIFIED_DETECTOR_VERSION — reproducible from study_full_hash + spec_v2_json (T2.1b)', async () => {
  const STUDY_FULL = 'a37e4b963c0ff13f0962e231b6322d11f1210df44812cdd24dcf06e66f354e80';
  const input = new TextEncoder().encode(STUDY_FULL + '||' + DETECTOR_PREDICATE_SPEC_V2_JSON);
  const digest = await crypto.subtle.digest('SHA-256', input);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  assertEquals(hex.slice(0, 8), RATIFIED_DETECTOR_VERSION);
  const inputV1 = new TextEncoder().encode(STUDY_FULL + '||' + DETECTOR_PREDICATE_SPEC_V1_JSON);
  const digestV1 = await crypto.subtle.digest('SHA-256', inputV1);
  const hexV1 = Array.from(new Uint8Array(digestV1))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const v1Entry = DETECTOR_VERSION_HISTORY.find((e) => e.version === 'v1')!;
  assertEquals(hexV1.slice(0, 8), v1Entry.prefix);
});

Deno.test('DETECTOR_VERSION_HISTORY — v1 + v2 entries with ACT-479 provenance; v2 rationale documents DRIFT', () => {
  assertEquals(DETECTOR_VERSION_HISTORY.length, 2);
  const v2 = DETECTOR_VERSION_HISTORY[1];
  assertEquals(v2.version, 'v2');
  assertEquals(v2.prefix, RATIFIED_DETECTOR_VERSION);
  assertEquals(v2.act_ref, 'ACT-479');
  assertEquals(v2.predicate_spec_json, DETECTOR_PREDICATE_SPEC_V2_JSON);
  // Rationale MUST document the T2.1b DRIFT correction + uniform-floor delta.
  assert(v2.rationale.includes('T2.1b'), 'v2 rationale must reference T2.1b');
  assert(v2.rationale.includes('DRIFT'), 'v2 rationale must document DRIFT correction');
  assert(v2.rationale.includes('491'), 'v2 rationale must cite 491 cells frontier');
  assert(v2.rationale.includes('uniform ROI floor') || v2.rationale.includes('uniform_roi_floor') || v2.rationale.includes('BEHAVIOR DELTA'), 'v2 rationale must document uniform-floor behavior delta');
  assert(v2.rationale.includes('BYTE-UNCHANGED'), 'v2 rationale must attest SHORT byte-unchanged');
});

Deno.test('Predicate-spec constants — v2 JSON floors match code constants', () => {
  const spec = JSON.parse(DETECTOR_PREDICATE_SPEC_V2_JSON);
  assertEquals(spec.long.uniform_roi_floor.mean_fwd_return_5d_min, LONG_ROI_MEAN_FWD_RETURN_5D_MIN);
  assertEquals(spec.long.tiers.T1.cell_gate.mean_fwd_return_5d_min, LONG_ROI_MEAN_FWD_RETURN_5D_MIN);
  assertEquals(spec.long.tiers.T2.cell_gate.mean_fwd_return_5d_min, LONG_ROI_MEAN_FWD_RETURN_5D_MIN);
  assertEquals(spec.long.tiers.T1.cell_gate.arrival_count_min, LONG_TIER_ARRIVAL_COUNT_MIN);
  assertEquals(spec.long.tiers.T2.cell_gate.arrival_count_min, LONG_TIER_ARRIVAL_COUNT_MIN);
  assertEquals(spec.long.tiers.T1.geometry.bands, [...LONG_T1_GEOMETRY.bands]);
  assertEquals(spec.long.tiers.T1.geometry.windows, [...LONG_T1_GEOMETRY.windows]);
  assertEquals(spec.long.tiers.T1.geometry.momentum_quintiles, [...LONG_T1_GEOMETRY.momentum_quintiles]);
  assertEquals(spec.long.tiers.T1.geometry.drawdown_buckets, [...LONG_T1_GEOMETRY.drawdown_buckets]);
  assertEquals(spec.short.byte_unchanged_from_v1, true);
});
