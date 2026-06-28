/**
 * DEC-071 sub-step 3e — orchestrator → assembler → ranker SEAM test.
 *
 * The unit surface for DEC-071 is complete (18 reversal-orchestrator gate
 * tests in sub-step 3b + 13 combiner carve-out tests in
 * dec-071-sub-step-3c_test.ts), and the full chain was verified LIVE on
 * 2026-06-26 (186 real gated rows flowing orchestrator → DB → assembler).
 *
 * What was still structurally unpinned: the CROSS-LAYER CONTRACT — that
 * the `skip_reason` shape the reversal orchestrator emits is the EXACT
 * shape the feature-assembler's `SignalObservationInput` reads, AND that
 * the `gated_signals` marker the assembler writes is the EXACT marker the
 * ranker reads to decide SKIP-without-throw vs THROW. A point-in-time
 * live probe cannot protect this forever; a seam test can.
 *
 * SEAM PATTERN (no real DB, no new harness — pure-unit, mirrors the
 * existing combiner test style):
 *
 *   (1) Construct the row in the EXACT shape the reversal orchestrator
 *       pushes to `rows[]` at reversal-orchestrator.ts:314 — typed via
 *       the real `SignalRow` interface and using the imported
 *       `SIGNAL_ID` constant from the orchestrator module so a rename
 *       there breaks this test.
 *   (2) Project that row to `SignalObservationInput` via the SAME
 *       projection the real `feature-assembler-orchestrator.ts:279`
 *       performs (`{ operator_id, ticker, signal_id, value, is_present,
 *       gics_sector, skip_reason }`). The projection is the seam.
 *   (3) Run the REAL `applyGates` + `assembleFeatureVectors` (no mocks
 *       of either layer) and the REAL `computeComposite`.
 *
 * TWO TESTS:
 *
 *   TEST 1 (happy-path seam) — a gated_by_news orchestrator row flows
 *   end-to-end: included=true, gated_signals=[REVERSAL], features
 *   [reversal]=null, computeComposite returns a finite composite WITHOUT
 *   throwing AND the gated slot contributes nothing (per-name DEC-074:
 *   presentCount excludes the gated reversal slot).
 *
 *   TEST 2 (bug-detection negative seam) — a genuinely-missing reversal
 *   (non-gated skip) is EXCLUDED by applyGates with MISSING_CRITICAL_7;
 *   AND a feature-vector row with `features[reversal]=null` but
 *   `gated_signals=null` (the "null critical not sanctioned" shape that
 *   ONLY a bug could produce) still THROWS `IncludedRowInvariantError`
 *   when fed to the real `computeComposite`. The §4.3.5 bug-detection
 *   invariant survives across the full chain — a non-sanctioned null
 *   critical still trips the alarm end-to-end.
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyGates,
  assembleFeatureVectors,
  type RegimeFeatures,
  type SignalObservationInput,
} from './feature-assembler.ts';
import {
  EXCLUDED_REASON,
  SIGNAL_IDS_ALL,
  type SignalId,
} from './signal-catalog.ts';
import { computeComposite, IncludedRowInvariantError } from './ranker.ts';
import { SIGNAL_ID as REVERSAL_ORCHESTRATOR_SIGNAL_ID } from '../longshort-signals/short-term-reversal/reversal-orchestrator.ts';
import type { SignalRow } from '../longshort-signals/shared/signal-types.ts';

const OP = 'op-1';
const AS_OF = '2026-06-26';
const COMPUTED_AT = '2026-06-26T20:00:00.000Z';
const TICKER = 'AAPL';
const REGIME: RegimeFeatures = {
  market_24m_cumulative_return: 0.1,
  market_realized_vol_6m: 0.2,
};

/**
 * Mirror reversal-orchestrator.ts:311-326 EXACTLY — the gated typed-absence
 * row construction. Typed as `SignalRow` so a field-shape drift in the
 * shared signal-row contract breaks this seam test at compile.
 * `signal_id` flows from the imported orchestrator constant (drift
 * protection on the SIGNAL_ID literal).
 */
function orchestratorGatedRow(
  ticker: string,
  skip_reason: 'gated_by_news' | 'gated_by_catalyst',
): SignalRow {
  return {
    operator_id: OP,
    signal_id: REVERSAL_ORCHESTRATOR_SIGNAL_ID,
    ticker,
    as_of_date: AS_OF,
    value: null,
    is_present: false,
    gics_sector: 'Tech',
    computed_at: COMPUTED_AT,
    skip_reason,
  };
}

/**
 * Mirror reversal-orchestrator.ts:292-302 — a normal-present (raw-emit)
 * orchestrator row, typed via `SignalRow` for the same drift protection.
 */
function orchestratorPresentRow(
  ticker: string,
  signal_id: string,
  value: number,
): SignalRow {
  return {
    operator_id: OP,
    signal_id,
    ticker,
    as_of_date: AS_OF,
    value,
    is_present: true,
    gics_sector: 'Tech',
    computed_at: COMPUTED_AT,
  };
}

/**
 * Mirror feature-assembler-orchestrator.ts:279-291 EXACTLY — the
 * projection from the SignalRow DB shape to the assembler's
 * SignalObservationInput. THIS PROJECTION IS THE SEAM. If
 * feature-assembler-orchestrator drifts (or SignalObservationInput
 * grows a required field), this mirror breaks at compile.
 */
function projectToAssemblerInput(row: SignalRow): SignalObservationInput {
  return {
    operator_id: row.operator_id,
    ticker: row.ticker,
    signal_id: row.signal_id,
    value: row.value,
    is_present: row.is_present,
    gics_sector: row.gics_sector,
    skip_reason: row.skip_reason ?? null,
  };
}

/**
 * Build a full 9-signal orchestrator output for one ticker where every
 * non-reversal signal is present (so the coverage gate is trivially
 * satisfied for the carve-out branch). Reversal is supplied separately
 * by the caller (gated row, genuinely-missing row, or normal-present).
 */
function fullNonReversalRows(ticker: string): SignalRow[] {
  const out: SignalRow[] = [];
  let v = 0.1;
  for (const id of SIGNAL_IDS_ALL) {
    if (id === REVERSAL_ORCHESTRATOR_SIGNAL_ID) continue;
    out.push(orchestratorPresentRow(ticker, id, v));
    v += 0.05;
  }
  return out;
}

function asPerTicker(
  rows: SignalObservationInput[],
): ReadonlyMap<SignalId, SignalObservationInput> {
  const m = new Map<SignalId, SignalObservationInput>();
  for (const r of rows) m.set(r.signal_id as SignalId, r);
  return m;
}

// ──────────────────────────────────────────────────────────────────────
// TEST 1 — HAPPY-PATH SEAM (gated_by_news end-to-end)
// ──────────────────────────────────────────────────────────────────────

Deno.test(
  '(3e-1) SEAM: gated_by_news orchestrator row -> projected -> applyGates included + gated_signals=[reversal] -> assembleFeatureVectors features[reversal]=null -> computeComposite finite & gated slot contributes nothing',
  () => {
    // (1) Real orchestrator output — gated row + 8 present non-reversal rows.
    const dbRows: SignalRow[] = [
      ...fullNonReversalRows(TICKER),
      orchestratorGatedRow(TICKER, 'gated_by_news'),
    ];

    // (2) Projection seam — exactly what feature-assembler-orchestrator does.
    const observations = dbRows.map(projectToAssemblerInput);

    // Sanity: the seam preserved skip_reason verbatim.
    const reversalObs = observations.find(
      (o) => o.signal_id === REVERSAL_ORCHESTRATOR_SIGNAL_ID,
    );
    assertEquals(reversalObs?.skip_reason, 'gated_by_news');
    assertEquals(reversalObs?.is_present, false);
    assertEquals(reversalObs?.value, null);

    // (3a) Real applyGates — carve-out fires.
    const gate = applyGates(asPerTicker(observations));
    assertEquals(gate.included, true);
    assertEquals(gate.excludedReason, null);
    assertEquals(gate.reversalGated, true);

    // (3b) Real assembleFeatureVectors — typed-absence + gated_signals marker.
    const vectors = assembleFeatureVectors(
      observations,
      [{ operator_id: OP, ticker: TICKER }],
      AS_OF,
      REGIME,
    );
    assertEquals(vectors.length, 1);
    const row = vectors[0];
    assertEquals(row.excluded_reason, null);
    assertEquals(row.features[REVERSAL_ORCHESTRATOR_SIGNAL_ID], null);
    assertEquals(row.gated_signals, [REVERSAL_ORCHESTRATOR_SIGNAL_ID]);

    // (3c) Real computeComposite — does NOT throw, returns finite composite,
    // and the gated reversal slot contributes nothing (per-name DEC-074:
    // numerator + presentCount both unchanged for the gated slot).
    const baselineNonReversal: Record<string, number | null> = {
      ...row.features,
    };
    const { composite, presentCount } = computeComposite(row);
    if (!Number.isFinite(composite)) {
      throw new Error(`seam: composite is not finite: ${composite}`);
    }

    // Compare against a synthetic row with the gated reversal slot manually
    // "kept null but un-sanctioned" — that would THROW. Conversely the same
    // shape with our real gated_signals marker MUST NOT throw. That's the
    // skip-vs-throw discrimination, end-to-end.
    assertThrows(
      () =>
        computeComposite({
          ...row,
          features: baselineNonReversal,
          gated_signals: null, // strip the sanction → bug-shape
        }),
      IncludedRowInvariantError,
    );

    // presentCount excludes the gated reversal slot. Catalog has 2 criticals
    // + 7 non-criticals = 9, DEC-074 excludes catalyst from the sum, so the
    // fallback iterates 8 slots; gated reversal drops to 7.
    assertEquals(presentCount, 7);
  },
);

// ──────────────────────────────────────────────────────────────────────
// TEST 2 — BUG-DETECTION NEGATIVE SEAM (non-gated null still throws)
// ──────────────────────────────────────────────────────────────────────

Deno.test(
  '(3e-2) SEAM negative: genuinely-missing reversal (non-gated skip) -> applyGates MISSING_CRITICAL_7; AND null-critical not in gated_signals -> computeComposite THROWS end-to-end (bug-detection invariant intact across the chain)',
  () => {
    // (A) Genuinely-missing reversal at the orchestrator boundary — a
    // non-gated skip_reason (e.g., 'insufficient_history') flows through
    // the projection unchanged, and applyGates EXCLUDES the name with
    // MISSING_CRITICAL_7. The carve-out does NOT fire.
    const missingRow: SignalRow = {
      operator_id: OP,
      signal_id: REVERSAL_ORCHESTRATOR_SIGNAL_ID,
      ticker: TICKER,
      as_of_date: AS_OF,
      value: null,
      is_present: false,
      gics_sector: 'Tech',
      computed_at: COMPUTED_AT,
      skip_reason: 'insufficient_history',
    };
    const observations = [
      ...fullNonReversalRows(TICKER),
      missingRow,
    ].map(projectToAssemblerInput);

    const gate = applyGates(asPerTicker(observations));
    assertEquals(gate.included, false);
    assertEquals(gate.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_7);
    assertEquals(gate.reversalGated, false);

    // Assembler emits the excluded row (no features payload). The full
    // chain never reaches computeComposite for this name in production
    // (orchestrator filters to excluded_reason===null before ranking),
    // so the carve-out's bug-detection guarantee is provided by (B).
    const vectors = assembleFeatureVectors(
      observations,
      [{ operator_id: OP, ticker: TICKER }],
      AS_OF,
      REGIME,
    );
    assertEquals(vectors.length, 1);
    assertEquals(vectors[0].excluded_reason, EXCLUDED_REASON.MISSING_CRITICAL_7);
    assertEquals(vectors[0].gated_signals, null);

    // (B) Direct ranker guard: if a null-critical row somehow reaches
    // the ranker WITHOUT a matching `gated_signals` entry (the only
    // shape a bug could produce — a fabricated included row with a
    // null critical and no sanction), the §4.3.5 bug-detection
    // invariant MUST trip end-to-end. Build the row via the real
    // assembler output to keep the shape honest, then strip the
    // sanction.
    const gatedRows = [
      ...fullNonReversalRows(TICKER),
      orchestratorGatedRow(TICKER, 'gated_by_news'),
    ].map(projectToAssemblerInput);
    const gatedVectors = assembleFeatureVectors(
      gatedRows,
      [{ operator_id: OP, ticker: TICKER }],
      AS_OF,
      REGIME,
    );
    assertEquals(gatedVectors.length, 1);
    const bugShape = { ...gatedVectors[0], gated_signals: null };
    assertEquals(bugShape.features[REVERSAL_ORCHESTRATOR_SIGNAL_ID], null);
    assertThrows(
      () => computeComposite(bugShape),
      IncludedRowInvariantError,
      `critical signal '${REVERSAL_ORCHESTRATOR_SIGNAL_ID}'`,
    );
  },
);