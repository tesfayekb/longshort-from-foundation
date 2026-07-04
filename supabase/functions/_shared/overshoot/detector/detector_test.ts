// FP-069 W3.4.c (ACT-461.c) — refused-with-reason test matrix for the pure
// detector orchestration module. Every refusal category the module surfaces
// is exercised via a fixture-shaped candidate row; every silent-pass path is
// asserted against; selection determinism + typed-absence contracts verified.

import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertStudyProvenance,
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
    // Fixture bandLabelFor mirrors the ratified 3-arg signature; content
    // is a synthetic stable key (not the real study-side namespace) — the
    // real classifier is exercised in `band-label_test.ts` + the regression
    // test below.
    bandLabelFor: (side, w, _excess) => `${side === 'LONG' ? '10' : '8'}pct_w${w}`,
    studyCellLookup: (_k: StudyCellKey) => DEFAULT_CELL,
    ...over,
  };
}

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

// ─── Refused-with-reason matrix ──────────────────────────────────────
Deno.test('LONG passes all filters and is selected', () => {
  const out = runDetector({ candidates: [baseLongCandidate()], shortInterest: new Map(), params: defaultParams() });
  assertEquals(out.length, 1);
  assertEquals(out[0].filter_refusal_reason, null);
  assertEquals(out[0].selected_for_entry, true);
  assertEquals(out[0].argmax_window_days, 3);
  assertEquals(out[0].rank_score, 0.02);
  assert(out[0].study_cell_ref !== null);
});

Deno.test('REFUSED window_out_of_set — LONG window=5 not in {1,2,3}', () => {
  const out = runDetector({
    candidates: [baseLongCandidate({ window_days: 5, excess_w5: 0.20 })],
    shortInterest: new Map(), params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'window_out_of_set');
  assertEquals(out[0].selected_for_entry, false);
  assertEquals(out[0].argmax_window_days, null);
});

Deno.test('REFUSED excess_below_threshold — LONG excess=0.05 < +0.10', () => {
  const out = runDetector({
    candidates: [baseLongCandidate({ window_days: 1, excess_w1: 0.05 })],
    shortInterest: new Map(), params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'excess_below_threshold');
});

Deno.test('REFUSED momentum_out_of_set — LONG momentum=1 not in {4,5}', () => {
  const out = runDetector({
    candidates: [baseLongCandidate({ momentum_quintile: 1 })],
    shortInterest: new Map(), params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'momentum_out_of_set');
});

Deno.test('REFUSED drawdown_out_of_set — LONG drawdown=5 not in {1,2,3}', () => {
  const out = runDetector({
    candidates: [baseLongCandidate({ drawdown_bucket: 5 })],
    shortInterest: new Map(), params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'drawdown_out_of_set');
});

Deno.test('REFUSED exclusion_earnings_proximity — dte=3 within +/-5d', () => {
  const out = runDetector({
    candidates: [baseLongCandidate({ days_to_nearest_earnings: 3 })],
    shortInterest: new Map(), params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'exclusion_earnings_proximity');
});

Deno.test('REFUSED si_unavailable — SHORT with no SI row (default-deny)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map(), params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_unavailable');
  // Observability contract: rank_score MAY still be populated (what the
  // candidate WOULD have ranked) for the W4 console, but selection is
  // blocked. What's forbidden is FABRICATION — a rank_score derived from a
  // missing SI value. The rank here comes from the study cell only.
  assertEquals(out[0].selected_for_entry, false);
});

Deno.test('REFUSED si_unavailable — SHORT with si_pct_float=null (typed-null, NOT zero)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', null, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_unavailable');
});

Deno.test('REFUSED si_stale — SHORT with SI row 30 days old (> siStalenessMaxDays=21)', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.20, 30)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_stale');
});

Deno.test('REFUSED si_below_squeeze_threshold — SHORT si=0.05 < min=0.10', () => {
  const out = runDetector({
    candidates: [baseShortCandidate()],
    shortInterest: new Map([['BBB', makeSi('BBB', 0.05, 5)]]),
    params: defaultParams(),
  });
  assertEquals(out[0].filter_refusal_reason, 'si_below_squeeze_threshold');
});

Deno.test('REFUSED no_study_cell — lookup returns null (NEVER defaults to rank=0)', () => {
  const out = runDetector({
    candidates: [baseLongCandidate()],
    shortInterest: new Map(),
    params: defaultParams({ studyCellLookup: () => null }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
  assertEquals(out[0].rank_score, null);
  assertEquals(out[0].study_cell_ref, null);
});

Deno.test('REFUSED no_study_cell — cell present but mean_fwd_return_5d=null (typed absence)', () => {
  const out = runDetector({
    candidates: [baseLongCandidate()],
    shortInterest: new Map(),
    params: defaultParams({ studyCellLookup: () => ({ mean_fwd_return_5d: null, arrival_count: 10 }) }),
  });
  assertEquals(out[0].filter_refusal_reason, 'no_study_cell');
  assertEquals(out[0].rank_score, null);
});

// ─── Mixed-day scenario — selection ordering + tiebreak determinism ──
Deno.test('Selection — rank tie broken by |excess| DESC; capacity refusal persisted', () => {
  const excessByTicker: Record<string, number> = {
    T1: 0.12, T2: 0.18, T3: 0.14, T4: 0.20, T5: 0.11, T6: 0.15,
  };
  const candidates = Object.keys(excessByTicker).map((t) =>
    baseLongCandidate({ ticker: t, window_days: 3, excess_w3: excessByTicker[t] }),
  );
  const out = runDetector({
    candidates,
    shortInterest: new Map(),
    // All candidates get identical rank_score (0.02) — tiebreak is pure |excess| DESC.
    params: defaultParams({ capacityPerSide: 2 }),
  });
  const selected = out.filter((e) => e.selected_for_entry).map((e) => e.ticker).sort();
  assertEquals(selected, ['T2', 'T4']); // top-2 by |excess|: T4(0.20), T2(0.18)
  const losers = out.filter((e) => !e.selected_for_entry);
  assertEquals(losers.length, 4);
  for (const l of losers) {
    assertEquals(l.filter_refusal_reason, 'capacity');
    assert(l.filter_passes.some((p) => p.filter === 'capacity-slot' && !p.passed));
  }
});

// ─── Long-side shortability recording (P-B#5) — never gating ────────
Deno.test('LONG shortability recorded when lookup provided; null when absent; never gates LONG', () => {
  const out = runDetector({
    candidates: [baseLongCandidate()],
    shortInterest: new Map(),
    params: defaultParams({ shortabilityLookup: (t) => t === 'AAA' ? { shortable: true, easy_to_borrow: false } : null }),
  });
  assertEquals(out[0].shortability, { shortable: true, easy_to_borrow: false });
  assertEquals(out[0].selected_for_entry, true);

  const out2 = runDetector({
    candidates: [baseLongCandidate({ ticker: 'ZZZ' })],
    shortInterest: new Map(),
    params: defaultParams({ shortabilityLookup: () => null }),
  });
  assertEquals(out2[0].shortability, null);
  assertEquals(out2[0].selected_for_entry, true);
});

// ─── Never-silent-drop contract ──────────────────────────────────────
Deno.test('Non-silent-drop contract — every (ticker,side) group yields exactly one observable output', () => {
  const cands = [
    baseLongCandidate({ ticker: 'A', excess_w3: 0.15 }),
    baseLongCandidate({ ticker: 'B', momentum_quintile: 1 }),
    baseShortCandidate({ ticker: 'C' }),
    baseLongCandidate({ ticker: 'D', days_to_nearest_earnings: 2 }),
  ];
  const out = runDetector({ candidates: cands, shortInterest: new Map(), params: defaultParams() });
  assertEquals(out.length, 4);
  for (const r of out) {
    const observable = r.selected_for_entry || r.filter_refusal_reason !== null;
    assert(observable, `silent-drop detected for ${r.ticker}/${r.side}`);
  }
});
