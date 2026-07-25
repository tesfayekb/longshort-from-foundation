// ACT-515 Matrix — R1 `1x-const` full-window runner (SCAFFOLD).
//
// STATUS: NOT EXECUTED this turn. Landed under the C0 batch per operator
// ruling 2026-07-25 (Path A) so that (a) the wiring is code-reviewable
// against the C0-gate-green reconstructor, and (b) the R1 receipt turn only
// needs to invoke this script — no further authoring.
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
// SURVIVORSHIP-BIAS DISCLOSURE (estimator-assumptions.md §7, ratified 2026-07-25):
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

// TODO(R1-receipt-turn): implement main() body below. Signatures + wiring
// are frozen here so the R1 turn is pure-execution + numeric read-out.

import { reconstructSessionAdmits } from './reconstructor.ts';
import { SupabaseBarQueryExecutor } from '../adapters/supabase-bar-executor.ts';
import { preloadBars } from '../adapters/db-bar-source.ts';
import { runPipeline } from '../kernel/runner.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { EXIT_ANCHOR_BY_SIDE_TIER } from '../kernel/exit.ts';
import { SIZING_VARIANTS, KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import { FixedClock } from '../kernel/clock.ts';
import { money } from '../kernel/types.ts';

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

// Grep-anchor for the R1 receipt turn — every symbol the executor needs
// is imported here already, so the receipt turn is pure DB-preload + loop.
export const _WIRING_ANCHORS = Object.freeze({
  reconstructSessionAdmits,
  SupabaseBarQueryExecutor,
  preloadBars,
  runPipeline,
  MapBarSource,
  FixedClock,
  money,
});

// (Body deliberately empty — executed next turn.)
export async function main(): Promise<never> {
  throw new Error(
    'run-r1-const.ts: main() body is landed under R1-receipt turn; ' +
    'C0 landing is scaffold + wiring anchors only per Pin 5 scope fence.',
  );
}

if (import.meta.main) { await main(); }
