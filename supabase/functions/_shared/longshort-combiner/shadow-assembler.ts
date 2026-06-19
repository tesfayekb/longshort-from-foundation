/**
 * Shadow feature assembler — FP-052 3.M-ii / ACT-242.
 *
 * PURE LAYER (no Supabase, no clock, no -999, no randomness). Consumes
 * the same in-process projection of `signal_observations` the live
 * `feature-assembler.ts` consumes (fields: ticker, signal_id, value,
 * is_present, gics_sector) and emits one `ShadowVector` per ticker —
 * NO EXCLUSION, NO GATE. Inclusion is applied downstream by the
 * shadow ranker per the variant's `inclusion_rule`.
 *
 * Intentional duplication contract:
 *   This module does NOT import or modify `feature-assembler.ts`. The
 *   live assembler enforces the §4.3.5 exclusion gate as a load-bearing
 *   pre-condition of the live ranker — that invariant must remain
 *   loud and untouched. The shadow path is the gate-relaxed variant
 *   surface; conflating the two modules would re-introduce the very
 *   coupling DW-109 + DEC-059 exist to measure against.
 *
 * Typed absence (ADR-008a): a row with `is_present===false` and
 * `value===null` contributes NOTHING and is NEVER coerced. The shadow
 * `present` map only carries signals with finite numeric `value` and
 * `is_present===true`. The missing half of the typed-absence pair is
 * never read.
 */

import { SIGNAL_IDS_ALL, type SignalId } from './signal-catalog.ts';

/**
 * Per-(ticker, signal_id) observation — minimal projection the shadow
 * assembler consumes. Shape mirrors the live
 * `SignalObservationInput` (operator_id stripped — the shadow
 * orchestrator pre-filters by operator at SELECT time).
 */
export interface ShadowObservationInput {
  ticker: string;
  signal_id: string;
  /** Finite number when `is_present=true`; otherwise MUST be `null`. */
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
}

/**
 * One emitted shadow vector per ticker. `present` is a Map keyed by
 * catalog `SignalId` carrying ONLY finite-numeric, is_present=true
 * observations. `presentCount === present.size` is exposed as a
 * pre-computed field so the ranker doesn't pay the .size lookup
 * inside its hot inclusion/composite path.
 */
export interface ShadowVector {
  ticker: string;
  gics_sector: string | null;
  present: Map<SignalId, number>;
  presentCount: number;
}

const CATALOG_SET = new Set<string>(SIGNAL_IDS_ALL as readonly string[]);

/**
 * Group raw observation rows by ticker — NO exclusion. Output is
 * sorted by ticker ASC for byte-deterministic replay (catalog-not-
 * discovery iteration order at the ranker is the second determinism
 * guarantee; this is the first).
 */
export function assembleShadowVectors(
  observations: readonly ShadowObservationInput[],
): ShadowVector[] {
  const byTicker = new Map<string, ShadowVector>();

  for (const obs of observations) {
    // Unknown signal_id is silently ignored — defense-in-depth catalog
    // filter (matches the live assembler's F7 contract).
    if (!CATALOG_SET.has(obs.signal_id)) continue;

    let v = byTicker.get(obs.ticker);
    if (v === undefined) {
      v = {
        ticker: obs.ticker,
        gics_sector: obs.gics_sector,
        present: new Map<SignalId, number>(),
        presentCount: 0,
      };
      byTicker.set(obs.ticker, v);
    } else if (v.gics_sector === null && obs.gics_sector !== null) {
      // First non-null sector wins (matches the live assembler precedent).
      v.gics_sector = obs.gics_sector;
    }

    // Typed-absence skip. is_present=false ⇒ value must be null per the
    // signal_observations CHECK; we DO NOT coerce — never read value.
    if (obs.is_present !== true) continue;
    if (obs.value === null || obs.value === undefined) continue;
    if (typeof obs.value !== 'number' || !Number.isFinite(obs.value)) continue;

    // Last-write-wins on duplicate (ticker, signal_id) — the upstream
    // signal_observations UNIQUE constraint makes duplicates a fixture
    // concern only.
    const id = obs.signal_id as SignalId;
    if (!v.present.has(id)) {
      v.present.set(id, obs.value);
      v.presentCount += 1;
    } else {
      v.present.set(id, obs.value);
    }
  }

  // Sort by ticker ASC for deterministic emission order.
  const out = Array.from(byTicker.values());
  out.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  return out;
}
