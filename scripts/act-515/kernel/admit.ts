// ACT-515 Kernel — Module 3: Admit.
//
// SCOPE: pure decision function that maps a ranked candidate list + open book
// + budgets + cell lookup + injected clock → per-candidate {admit | typed
// refusal} decisions. No I/O, no mutation of inputs, no wall-clock, no RNG.
//
// FIVE PINS (per ruling 2026-07-25):
//
//   (a) GATE ORDER — byte-anchored to the deployed
//       overshoot-entry-run/index.ts per-target loop:
//         1. position_already_open  (SYMBOL-scoped dedup; pyramiding=NO)
//              index.ts:920-935 (pre-loop `heldTickers` Set) + :1121-1132
//              (per-target check `heldTickers.has(sel.ticker)` +
//              `overshoot.entry.position_already_open`).
//         2. allocation_cap         (side allocation cap; INC-96 aggregate)
//              index.ts:1246-1268 (`overshoot.entry.allocation_cap_reached`).
//         3. short_daily_budget     (DEC-084; SHORT-only; non-K-consuming)
//              index.ts:1286-1311 (`sel.side === 'short'` branch +
//              `overshoot.entry.short_daily_budget_reached`).
//         4. daily_budget           (ACT-501 K=5 global admission budget)
//              index.ts:1313-1332 (`overshoot.entry.daily_budget_reached`).
//       Kernel implements gates (1)-(4) verbatim. Gates NOT modelled here
//       are declared in the ABSTRACTIONS block below (PIN (e)).
//
//   (b) DETERMINISM — candidate iteration matches the production sort at
//       `selection-parity_test.ts:195-205`:
//         side ASC, tier ASC (T1<T2<null), rank_score DESC (NULLS LAST),
//         ticker ASC.
//       Same inputs → same admits, always. Verified by property test
//       (shuffled input → identical decisions[]) in admit_test.ts.
//
//   (c) PURE over injected state — the sole entry point `runAdmit(input)`
//       is a pure function: it does not read process env, does not touch
//       the network, does not call the clock (clock is present in the
//       input signature for downstream parity but is not consulted by any
//       gate in this module — session-boundary logic lives in Module 2).
//       Inputs are treated as readonly; a defensive copy is used before
//       any local sort.
//
//   (d) REFUSAL VOCABULARY — every non-admit decision carries exactly one
//       `RefusalTallyKey` from Module 1. No free-form strings.
//
//   (e) DECLARED ABSTRACTIONS — this kernel does NOT model:
//         · I5 snapshot gates (freshness / staleness of intraday snapshot)
//           — corpus events are pre-filtered to include only fresh-i5
//           rows; the matrix does not re-simulate the I5 layer.
//         · Shortability (Alpaca ETB/HTB state at admit time) — the
//           corpus is filtered to admissible names; short-side variants
//           inherit the same ratified filter.
//         · Earnings / analyst-downgrade / M&A proximity (DEC-080/081/082)
//           — encoded in the corpus events stream, not re-evaluated here.
//         · Fill mechanics (entry_price / buying_power / submit_failed) —
//           Module 6 (exit / fill) owns these. Admit's job stops at
//           "would this order be sent?".
//       This block is duplicated verbatim in
//       `scripts/act-515/estimator-assumptions.md` §"Kernel abstractions"
//       so the matrix's honesty section inherits the list; a test in
//       `admit_test.ts` asserts the header block exists in this file.

import type {
  BandLabel, CellKey, Clock, RefusalTallyKey, SideDb,
} from './types.ts';

// -----------------------------------------------------------------------------
// Candidate + input shapes
// -----------------------------------------------------------------------------

/** One ranked candidate from the detector's selection output.
 *  Fields mirror the subset consumed by the entry-run gates (index.ts:1246
 *  audit metadata + :1286 short-budget branch). */
export interface Candidate {
  readonly ticker: string;
  readonly side: SideDb;
  readonly tier: 'T1' | 'T2' | null;
  readonly rankScore: number | null;
  readonly band: BandLabel;
  /** Intended slot notional in USD. Sized upstream (Module 4 in this
   *  kernel; the entry-run computes it in the sizing block just above the
   *  allocation_cap gate). */
  readonly slotNotionalUsd: number;
}

/** Open-book snapshot (union of ledger + broker positions per index.ts:920). */
export interface OpenBookRow {
  readonly ticker: string;
  readonly side: SideDb;
  /** Signed MV in USD contributing to the side cap. */
  readonly marketValueUsd: number;
}

/** Side allocation-cap configuration (INC-96). */
export interface AllocationCapConfig {
  readonly sideCapUsd: Readonly<{ long: number; short: number }>;
}

/** Daily-budget configuration. `k` = global ACT-501 K.
 *  `shortDailyBudget` = DEC-084 per-side short budget. */
export interface BudgetConfig {
  readonly k: number;
  readonly shortDailyBudget: number;
}

/** Study-cell lookup — present here for downstream parity; admit does not
 *  consult it (kept to keep the kernel's public shapes stable across
 *  Modules 3-7). */
export type CellLookup = (key: CellKey) => unknown;

export interface AdmitInput {
  readonly candidates: ReadonlyArray<Candidate>;
  readonly openBook: ReadonlyArray<OpenBookRow>;
  readonly caps: AllocationCapConfig;
  readonly budgets: BudgetConfig;
  readonly cellLookup: CellLookup;
  readonly clock: Clock;
}

// -----------------------------------------------------------------------------
// Decision shape
// -----------------------------------------------------------------------------

export type Decision =
  | { readonly kind: 'admit'; readonly ticker: string; readonly side: SideDb; readonly slotNotionalUsd: number }
  | { readonly kind: 'refuse'; readonly ticker: string; readonly side: SideDb; readonly category: RefusalTallyKey };

export interface AdmitResult {
  readonly decisions: ReadonlyArray<Decision>;
  readonly tally: Readonly<Record<RefusalTallyKey, number>> & { readonly admits: number };
}

// -----------------------------------------------------------------------------
// Ordering — production parity (selection-parity_test.ts:195-205)
// -----------------------------------------------------------------------------

function tierRank(t: 'T1' | 'T2' | null): number {
  return t === 'T1' ? 0 : t === 'T2' ? 1 : 2;
}

/** Exported for property test. */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.side !== b.side) return a.side < b.side ? -1 : 1;
  const tr = tierRank(a.tier) - tierRank(b.tier);
  if (tr !== 0) return tr;
  const ar = a.rankScore === null ? -Infinity : a.rankScore;
  const br = b.rankScore === null ? -Infinity : b.rankScore;
  if (ar !== br) return br - ar;
  return a.ticker < b.ticker ? -1 : 1;
}

// -----------------------------------------------------------------------------
// runAdmit — pure kernel entry point
// -----------------------------------------------------------------------------

export function runAdmit(input: AdmitInput): AdmitResult {
  const decisions: Decision[] = [];
  const tally = {
    i5_refusals: 0,
    sizing_refusals: 0,
    buying_power_refusals: 0,
    shortability_refusals: 0,
    position_already_open: 0,
    allocation_cap_reached: 0,
    daily_budget_reached: 0,
    short_daily_budget_reached: 0,
    admits: 0,
  };

  // (a.1) Held-symbol dedup set — SYMBOL-scoped (pyramiding=NO), matching
  // index.ts:930-935. Any open row on EITHER side blocks re-entry on the
  // ticker. Defensive Set built from the input (input untouched).
  const heldTickers = new Set<string>();
  for (const row of input.openBook) heldTickers.add(row.ticker);

  // (a.2) Aggregate accepted notional per side (running with admits).
  const openMvBySide: { long: number; short: number } = { long: 0, short: 0 };
  for (const row of input.openBook) openMvBySide[row.side] += row.marketValueUsd;
  const acceptedNotionalBySide: { long: number; short: number } = { long: 0, short: 0 };

  // (a.3) Budget counters — mirror entry-run's `admittedByDailyBudget` and
  // `admittedShortsByDailyBudget`.
  let admittedByK = 0;
  let admittedShorts = 0;

  // Defensive copy before sort — PIN (c) purity: input.candidates is
  // readonly and MUST NOT be mutated.
  const ordered = [...input.candidates].sort(compareCandidates);

  for (const c of ordered) {
    // ── Gate 1: position_already_open ────────────────────────────────
    if (heldTickers.has(c.ticker)) {
      // `position_already_open` is a top-level tally in the entry-run
      // (index.ts:292 + :323 + :1126). Module 1's RefusalTallyKey was
      // extended in the same diff to include it (grep-anchor updated).
      tally.position_already_open += 1;
      decisions.push({
        kind: 'refuse', ticker: c.ticker, side: c.side,
        category: 'position_already_open',
      });
      continue;
    }

    // ── Gate 2: allocation_cap ───────────────────────────────────────
    const projected =
      openMvBySide[c.side] + acceptedNotionalBySide[c.side] + c.slotNotionalUsd;
    if (projected > input.caps.sideCapUsd[c.side]) {
      tally.allocation_cap_reached += 1;
      decisions.push({
        kind: 'refuse', ticker: c.ticker, side: c.side,
        category: 'allocation_cap_reached',
      });
      continue;
    }

    // ── Gate 3: short_daily_budget (DEC-084; SHORT-only) ─────────────
    // Placed BEFORE the global K gate so short refusals here do NOT
    // consume K (index.ts:1275-1284 rationale).
    if (c.side === 'short') {
      if (admittedShorts >= input.budgets.shortDailyBudget) {
        tally.short_daily_budget_reached += 1;
        decisions.push({
          kind: 'refuse', ticker: c.ticker, side: c.side,
          category: 'short_daily_budget_reached',
        });
        continue;
      }
    }

    // ── Gate 4: daily_budget (K) ─────────────────────────────────────
    if (admittedByK >= input.budgets.k) {
      tally.daily_budget_reached += 1;
      decisions.push({
        kind: 'refuse', ticker: c.ticker, side: c.side,
        category: 'daily_budget_reached',
      });
      continue;
    }

    // ── Admit ────────────────────────────────────────────────────────
    admittedByK += 1;
    if (c.side === 'short') admittedShorts += 1;
    acceptedNotionalBySide[c.side] += c.slotNotionalUsd;
    tally.admits += 1;
    decisions.push({
      kind: 'admit',
      ticker: c.ticker,
      side: c.side,
      slotNotionalUsd: c.slotNotionalUsd,
    });
  }

  return { decisions, tally };
}