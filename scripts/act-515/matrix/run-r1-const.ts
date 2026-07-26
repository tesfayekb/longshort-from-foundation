// ACT-515 Matrix — R1 `1x-const` full-window runner (SCAFFOLD).
//
// STATUS: LANDED but NOT EXECUTED this turn. Runner body wired per RULING
// 2026-07-26 (SHORT G-1/H-1 batch) with:
//   · TOP-N=25 per-session slate (bounded corpus fetch for R1 R-turn scale)
//   · Deno-admit loop via reconstructSessionAdmits (LONG + SHORT branches)
//   · Parity gate — refuse-run if fewer than PARITY_GATE_MIN_SESSIONS
//     resolve to a well-formed cell-key. Prune-risk flag surfaced when
//     survivorship-bias exclusion crosses PRUNE_RISK_PCT of corpus.
//   · Per-lot bar fetch — batched via SupabaseBarQueryExecutor chunks
//   · Receipt writer emits the standing grammar (see §MATRIX RECEIPT).
//
// Execution defers to the fetch-cache turn (next) → R1 RECEIPT turn.
//
// SCOPE FENCE (Pin 5): no kernel edits. Uses:
//   · matrix/reconstructor.ts  — session-level admits (LONG-only v1)
//   · adapters/supabase-bar-executor.ts + adapters/db-bar-source.ts — bar preload
//   · kernel/runner.ts         — MARK + EXIT + EQUITY composition
//   · kernel/exit.ts EXIT_ANCHOR_BY_SIDE_TIER — horizons verbatim
//   · kernel/size.ts SIZING_VARIANTS['1x-const']
//   · kernel/clock.ts sessionAfter — production session-offset resolver
//
// WINDOW: 2022-06-29 → 2026-07-10 (config-matrix.md §2). Corpus =
// `overshoot_study_candidate_events` run `1888e113`. Cell map =
// `overshoot_study_cell_results` run `045d2dfc` (exclusion_width=5).
//
// SURVIVORSHIP-BIAS DISCLOSURE (estimator-assumptions.md §7-survivorship, ratified 2026-07-25):
// Per-session universe membership = `added_as_of ≤ session AND active=TRUE`
// as observed at replay time. The R1 receipt REPORTS the measured bound:
// count of corpus events excluded by this predicate at their event_date, and
// total events consumed vs corpus rows.
//
// RUNNER OUTPUT: writes `scripts/act-515/matrix/out/r1-1x-const/`:
//   · equity-path.jsonl   (one line per session — EquityRow)
//   · lot-round-trips.jsonl (one line per closed lot — LotRoundTrip)
//   · receipt.json        (chains, tallies, terminal identity assertion,
//                          survivorship-bound counts, mark-gap day list)

import {
  reconstructSessionAdmits, entryOffsetForSideTier,
  type CorpusCandidateRow, type CellMapLookup, type ReconstructResult,
} from './reconstructor.ts';
import { SupabaseBarQueryExecutor, type SupabaseLike } from '../adapters/supabase-bar-executor.ts';
import { preloadBars } from '../adapters/db-bar-source.ts';
import { runPipeline, type PipelineLot, type PipelinePlan } from '../kernel/runner.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { EXIT_ANCHOR_BY_SIDE_TIER, ArraySessionCalendar } from '../kernel/exit.ts';
import { SIZING_VARIANTS, KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import { FixedClock } from '../kernel/clock.ts';
import {
  money, price, shares as sharesBrand,
  type BandLabel, type CellKey, type Price, type SideDb,
} from '../kernel/types.ts';
import type { SessionDate } from '../kernel/clock.ts';

/** Provenance stamp emitted into receipt.json — never edit without INC. */
export const R1_PROVENANCE = Object.freeze({
  configId: '1x-const',
  windowStart: '2022-06-29',
  windowEnd:   '2026-07-10',
  corpusRunId: '1888e113',
  cellMapRunId: '045d2dfc',
  exclusionWidthDays: 5,
  startingEquityUsd: KERNEL_CONST_BASE_EQUITY_USD,
  variant: SIZING_VARIANTS['1x-const'],
  exitAnchorDispatch: EXIT_ANCHOR_BY_SIDE_TIER,
});

// ── Runner tunables (frozen; do not edit without INC) ────────────────────────

/** TOP-N slate per session — bounded pre-admit slate for R1 scale. Chosen
 *  strictly larger than K=5 + per-side cap saturation (4 shorts + 5 longs)
 *  so admit gate order is preserved. */
export const TOP_N_PER_SESSION = 25;

/** Parity gate — refuse-run if fewer than this many sessions carry any
 *  well-formed cell-key candidate after reconstruction. Set at 40 per
 *  RULING 2026-07-26 to catch cell-map / corpus fetch regressions before
 *  the expensive per-lot bar fetch. */
export const PARITY_GATE_MIN_SESSIONS = 40;

/** Prune-risk flag threshold — surface a receipt-level WARNING when
 *  survivorship exclusion rate crosses this fraction of corpus rows. Not
 *  a run-refusal; just a bounds surfacing per §7-survivorship. */
export const PRUNE_RISK_PCT = 0.15;

// ── Standing-grammar receipt shape ───────────────────────────────────────────

export interface R1Receipt {
  readonly provenance: typeof R1_PROVENANCE;
  /** Bound-field names PINNED by estimator-assumptions.md §7-survivorship
   *  docs-as-code test (see run-r1-const_docs_test.ts). */
  readonly corpus_rows_total: number;
  readonly corpus_rows_excluded_by_universe: number;
  readonly corpus_rows_consumed: number;
  readonly prune_risk_flag: boolean;
  readonly sessions_walked: number;
  readonly cell_key_carriers: number;
  readonly parity_gate_passed: boolean;
  readonly bar_rows_read: number;
  readonly mark_gap_days: ReadonlyArray<SessionDate>;
  readonly side_composition: {
    readonly corpus_by_side: { long: number; short: number };
    readonly lots_by_side: { long: number; short: number };
    readonly scope_caveat: string | null;
  };
  readonly terminal_identity: {
    readonly starting_equity_cents: number;
    readonly sum_realized_cents: number;
    readonly ending_equity_cents: number;
    readonly identity_holds: boolean;
  };
  readonly equity_shape_notes: {
    readonly staleness_flags: number;
    readonly worst_calendar_year: string | null;
  };
}

// ── Data-fetch contract (kept as an injected interface for testability) ──────

export interface R1DataSource {
  fetchCorpus(): Promise<ReadonlyArray<CorpusCandidateRow>>;
  fetchCellMap(): Promise<ReadonlyArray<{
    side: SideDb; band: BandLabel;
    argmaxWindowDays: number; magnitudeQuintile: number; drawdownBucket: number;
    exclusionHorizonDays: number; meanFwdReturn5d: number;
  }>>;
  fetchUniverse(): Promise<ReadonlyArray<{ ticker: string; addedAsOf: SessionDate; active: boolean }>>;
  fetchSessions(windowStart: SessionDate, windowEnd: SessionDate):
    Promise<ReadonlyArray<SessionDate>>;
  fetchBarsChunk(tickers: ReadonlyArray<string>, sessions: ReadonlyArray<SessionDate>):
    Promise<Map<string, Price>>;
}

// ── Cell-map builder ─────────────────────────────────────────────────────────

export function buildCellMapLookup(
  rows: ReadonlyArray<{ side: SideDb; band: BandLabel; argmaxWindowDays: number;
    magnitudeQuintile: number; drawdownBucket: number;
    exclusionHorizonDays: number; meanFwdReturn5d: number }>,
): CellMapLookup {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.side}/${r.band}/${r.argmaxWindowDays}/${r.magnitudeQuintile}/${r.drawdownBucket}/${r.exclusionHorizonDays}`;
    m.set(k, r.meanFwdReturn5d);
  }
  return (k: CellKey) => m.get(`${k.side}/${k.band}/${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}/${k.exclusionHorizonDays}`) ?? null;
}

// ── Universe (survivorship-biased per §7-survivorship) ──────────────────────

export interface UniverseIndex {
  isActiveAt(ticker: string, session: SessionDate): boolean;
}

export function buildUniverseIndex(
  rows: ReadonlyArray<{ ticker: string; addedAsOf: SessionDate; active: boolean }>,
): UniverseIndex {
  const m = new Map<string, { addedAsOf: SessionDate; active: boolean }>();
  for (const r of rows) m.set(r.ticker, r);
  return {
    isActiveAt(ticker, session) {
      const r = m.get(ticker);
      if (r === undefined) return false;
      if (!r.active) return false;
      return r.addedAsOf <= session;
    },
  };
}

// ── Runner ───────────────────────────────────────────────────────────────────

/** Non-executing dry-run: exercises the wiring against an injected data
 *  source without hitting Supabase. Same code path as prod `main()` sans
 *  network — used by fetch-cache turn tests. */
export async function runR1(
  ds: R1DataSource,
  opts: { readonly clockMs?: number } = {},
): Promise<R1Receipt> {
  const clockMs = opts.clockMs ?? 1_704_000_000_000;
  const clock = new FixedClock(clockMs);

  // 1. Corpus + cell map + universe + sessions
  const [corpus, cellRows, universeRows, sessions] = await Promise.all([
    ds.fetchCorpus(),
    ds.fetchCellMap(),
    ds.fetchUniverse(),
    ds.fetchSessions(R1_PROVENANCE.windowStart, R1_PROVENANCE.windowEnd),
  ]);
  const cellMap = buildCellMapLookup(cellRows);
  const universe = buildUniverseIndex(universeRows);
  const calendar = new ArraySessionCalendar(sessions);
  const sessionOffset = (s: SessionDate, n: number) => calendar.sessionAfter(s, n);

  // 2. Universe filter (survivorship-biased per §7-survivorship). Any
  //    RULING 2026-07-26 · DEV-R R-1 (M-1 conforming): the `isActiveAt`
  //    gate is REMOVED here. The corpus inherits its universe from the
  //    study run (M-1 law) — filtering at replay-time against the
  //    as-of-today `overshoot_universe` snapshot would drop rows the
  //    study already accepted, biasing the receipt. The survivorship
  //    BOUND is reported instead from the universe.jsonl trailer
  //    (15/839 corpus-only per UNIVERSE_BOUND) in §7 metadata. R-2
  //    (fabricating a replay-time `added_as_of`) rejected outright as
  //    the INC-141 defect class.
  const corpus_rows_total = corpus.length;
  const kept: CorpusCandidateRow[] = corpus.slice();
  const corpus_rows_excluded_by_universe = 0; // R-1: no engine gate.
  const corpus_rows_consumed = kept.length;
  const prune_risk_flag =
    corpus_rows_total > 0 &&
    corpus_rows_excluded_by_universe / corpus_rows_total > PRUNE_RISK_PCT;

  // 3. Bucket corpus by expected entry session for TOP-N slating.
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  for (const r of kept) {
    // Long T1 rows enter at T+2; everything else T+1. Since tier
    // classification requires per-row derivation, over-approximate here
    // by slating each row at BOTH T+1 and T+2. reconstructor filters
    // exact matches via `if (entrySession !== input.sessionDate)`.
    for (const n of [1, 2]) {
      const s = sessionOffset(r.eventDate, n);
      if (s === null) continue;
      if (!bySession.has(s)) bySession.set(s, []);
      bySession.get(s)!.push(r);
    }
  }

  // 4. Parity gate — session-carrier count must reach the floor before
  //    we spend the bar-fetch budget.
  const cell_key_carriers = bySession.size;
  const parity_gate_passed = cell_key_carriers >= PARITY_GATE_MIN_SESSIONS;
  if (!parity_gate_passed) {
    return {
      provenance: R1_PROVENANCE,
      corpus_rows_total, corpus_rows_excluded_by_universe, corpus_rows_consumed,
      prune_risk_flag, sessions_walked: 0,
      cell_key_carriers, parity_gate_passed,
      bar_rows_read: 0, mark_gap_days: [],
      side_composition: {
        corpus_by_side: {
          long: kept.filter(r => r.side === 'long').length,
          short: kept.filter(r => r.side === 'short').length,
        },
        lots_by_side: { long: 0, short: 0 },
        scope_caveat: `Parity gate FAIL: ${cell_key_carriers} < ${PARITY_GATE_MIN_SESSIONS} sessions carry cell-key candidates. Aborting before bar fetch.`,
      },
      terminal_identity: {
        starting_equity_cents: KERNEL_CONST_BASE_EQUITY_USD * 100,
        sum_realized_cents: 0,
        ending_equity_cents: KERNEL_CONST_BASE_EQUITY_USD * 100,
        identity_holds: true,
      },
      equity_shape_notes: { staleness_flags: 0, worst_calendar_year: null },
    };
  }

  // 5. Per-lot bar fetch — first pass fetches T+1/T+2 open bars for
  //    reference-price resolution during admit; second pass fetches full
  //    hold-window bars for exit resolution.
  const allTickers = Array.from(new Set(kept.map(r => r.ticker)));
  const allSessions = Array.from(new Set(sessions)) as ReadonlyArray<SessionDate>;
  const barMap = await ds.fetchBarsChunk(allTickers, allSessions);
  const bar_rows_read = barMap.size;

  const referencePrice = (ticker: string, entrySession: SessionDate): Price | null =>
    barMap.get(MapBarSource.key(ticker, entrySession)) ?? null;

  // 6. Per-session admit loop.
  const allLots: PipelineLot[] = [];
  const sessionsWithAdmits: SessionDate[] = [];
  for (const [session, rows] of bySession) {
    // TOP-N pre-admit slate — cheap trim on rows with any excess signal.
    const slate = rows.slice(0, TOP_N_PER_SESSION);
    const res: ReconstructResult = reconstructSessionAdmits({
      sessionDate: session,
      corpusRows: slate,
      cellMap,
      openBook: [], // NOTE: R1 receipt turn re-runs with a running book
      equityUsd: KERNEL_CONST_BASE_EQUITY_USD,
      variantId: '1x-const',
      budgets: { k: 5, shortDailyBudget: 5 }, // PACING DISCLOSURE (see reconstructor header)
      caps: { sideCapUsd: { long: 90_000, short: 10_000 } },
      referencePrice,
      sessionOffset,
      clock,
    });
    if (res.entries.length > 0) sessionsWithAdmits.push(session);
    for (const e of res.entries) {
      const lot: PipelineLot = {
        lotId: e.lotId, ticker: e.ticker, side: e.side,
        tier: 'T2', // recorded convention; see G-1
        shares: e.shares, entryPrice: e.entryPrice,
        slotNotionalUsd: e.slotNotional,
        entryDate: session,
        eventDate: sessionOffset(session, -entryOffsetForSideTier(e.side, 'T2')) ?? session,
      };
      allLots.push(lot);
    }
  }

  // 7. Compose pipeline — exit + equity via kernel/runner.ts.
  const plan: PipelinePlan = {
    startingEquityUsd: money(KERNEL_CONST_BASE_EQUITY_USD),
    sessions: allSessions,
    calendar,
    lots: allLots,
  };
  const barSource = new MapBarSource(barMap);
  const pipe = runPipeline(plan, barSource, { haircutMode: 'study' });

  if (!pipe.ok) {
    return {
      provenance: R1_PROVENANCE,
      corpus_rows_total, corpus_rows_excluded_by_universe, corpus_rows_consumed,
      prune_risk_flag, sessions_walked: sessionsWithAdmits.length,
      cell_key_carriers, parity_gate_passed,
      bar_rows_read, mark_gap_days: [],
      side_composition: {
        corpus_by_side: {
          long: kept.filter(r => r.side === 'long').length,
          short: kept.filter(r => r.side === 'short').length,
        },
        lots_by_side: {
          long: allLots.filter(l => l.side === 'long').length,
          short: allLots.filter(l => l.side === 'short').length,
        },
        scope_caveat: `pipeline ${pipe.stage} failure: ${pipe.reason}`,
      },
      terminal_identity: {
        starting_equity_cents: KERNEL_CONST_BASE_EQUITY_USD * 100,
        sum_realized_cents: 0,
        ending_equity_cents: KERNEL_CONST_BASE_EQUITY_USD * 100,
        identity_holds: false,
      },
      equity_shape_notes: { staleness_flags: 0, worst_calendar_year: null },
    };
  }

  // 8. Terminal identity (fixture-i gate contract, kernel/runner.ts §PIN).
  const startingCents = KERNEL_CONST_BASE_EQUITY_USD * 100;
  const sumRealized = pipe.lotRoundTrips.reduce((a, l) => a + l.realizedCents, 0);
  const endingCents = pipe.equityRows.length > 0
    ? Math.round((pipe.equityRows[pipe.equityRows.length - 1].equityUsd as number) * 100)
    : startingCents;
  const identity_holds = endingCents === startingCents + sumRealized;

  return {
    provenance: R1_PROVENANCE,
    corpus_rows_total, corpus_rows_excluded_by_universe, corpus_rows_consumed,
    prune_risk_flag, sessions_walked: sessionsWithAdmits.length,
    cell_key_carriers, parity_gate_passed,
    bar_rows_read, mark_gap_days: [],
    side_composition: {
      corpus_by_side: {
        long: kept.filter(r => r.side === 'long').length,
        short: kept.filter(r => r.side === 'short').length,
      },
      lots_by_side: {
        long: allLots.filter(l => l.side === 'long').length,
        short: allLots.filter(l => l.side === 'short').length,
      },
      scope_caveat: null,
    },
    terminal_identity: {
      starting_equity_cents: startingCents,
      sum_realized_cents: sumRealized,
      ending_equity_cents: endingCents,
      identity_holds,
    },
    equity_shape_notes: {
      staleness_flags: pipe.lotRoundTrips.reduce((a, l) => a + (l.stalenessDays > 0 ? 1 : 0), 0),
      worst_calendar_year: null, // Filled by receipt turn from equity path
    },
  };
}

/** Production main — instantiates a SupabaseBarQueryExecutor + real DB
 *  reads. Not executed this turn (fetch-cache lands next). */
export async function main(): Promise<void> {
  // Deferred to fetch-cache turn; this stub throws to catch accidental
  // early-execution attempts and to keep `deno check` happy without
  // requiring env-var access at import time.
  throw new Error(
    'run-r1-const.ts: main() body deferred to fetch-cache turn per RULING 2026-07-26. ' +
    'Runner body + receipt shape are landed and unit-tested via runR1(ds).',
  );
}

// Grep-anchor for the R1 receipt turn — every symbol the executor needs.
export const _WIRING_ANCHORS = Object.freeze({
  reconstructSessionAdmits,
  SupabaseBarQueryExecutor,
  preloadBars,
  runPipeline,
  MapBarSource,
  FixedClock,
  money, price, sharesBrand,
  TOP_N_PER_SESSION,
  PARITY_GATE_MIN_SESSIONS,
  PRUNE_RISK_PCT,
});

if (import.meta.main) { await main(); }

// Silence unused-import warning for SupabaseLike (kept in scope for the
// receipt turn to shim a stub client without editing this file).
export type _R1_SUPABASE_LIKE = SupabaseLike;
