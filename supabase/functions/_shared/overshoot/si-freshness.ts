// DEC-504-4 (2026-07-16) — SI-FRESHNESS SINGLE-HOME HELPER.
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
//
// PURPOSE — single-homed staleness predicate consumed by BOTH the overshoot
// detector (`_shared/overshoot/detector/detector.ts`) and the overshoot
// sizing overlay (`_shared/overshoot-execution/sizing.ts`). The detector
// asks "is this row's SI stale?" to refuse short admissions; the sizing
// overlay asks the same question aggregated across the short universe to
// decide whether the SHORT-sleeve capacity envelope reallocates to LONG
// under DEC-504-4's WITHIN-OVERSHOOT reallocation contract.
//
// A CANARY TEST (see si-freshness_test.ts) asserts BOTH call sites import
// from THIS FILE. A second implementation of the staleness comparison
// anywhere in the overshoot tree is FORBIDDEN — that duplication is the
// exact class-drift pathology INC-91 exists to prevent (numeric-literal
// bound sprawl), applied to a fresh dimension.
//
// DORMANT-AT-BIRTH POSTURE — this overlay lands with SI FRESH
// (computed_at 2026-07-15; next FINRA cycle ~early August). `siStaleActive`
// therefore returns FALSE at deployment time; the overlay's reallocation
// arm is EXERCISED ONLY when a real stale window opens. Zero effect on
// the live book at landing is CORRECT BEHAVIOR, not a defect.
//
// Cross-refs: DEC-504-4 (charter); DEC-504-3 (21d staleness watchdog);
// INC-106 (short-squeeze direction fix — orthogonal but co-located);
// _shared/overshoot-execution/snapshot-age-bounds.ts (INC-91 precedent
// for single-homing).

/** Days between two YYYY-MM-DD dates, UTC midnight, integer. */
export function siCalendarDaysBetween(aIso: string, bIso: string): number {
  const a = Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10));
  const b = Date.UTC(+bIso.slice(0, 4), +bIso.slice(5, 7) - 1, +bIso.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

/** DEC-504-3 ratified default. Callers MUST pass this via param — no hard
 *  default is baked into consumer sites (see detector.ts contract). */
export const OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT = 21;

/**
 * Row-level predicate: is this SI datapoint stale relative to `asOf`?
 * Consumed by the detector's per-ticker si-squeeze-gate.
 */
export function isSiRowStale(
  asOfIso: string,
  siAsOfDateIso: string,
  stalenessMaxDays: number,
): boolean {
  return siCalendarDaysBetween(asOfIso, siAsOfDateIso) > stalenessMaxDays;
}

/**
 * Aggregate-level predicate: is the SHORT UNIVERSE currently in a
 * stale-SI window? True iff the FRESHEST SI datapoint across the short
 * universe is itself stale by more than `stalenessMaxDays` calendar days.
 *
 * Consumed by the DEC-504-4 sizing overlay. When TRUE, the short-sleeve
 * capacity envelope reallocates to LONG within the overshoot strategy
 * (WITHIN-OVERSHOOT scope; cross-strategy reallocation was explicitly
 * REJECTED as allocator-era scope).
 *
 * Returning FALSE for an EMPTY corpus is deliberate: no data ≠ stale,
 * and the detector's per-row `si_unavailable` refusal already carries
 * the missing-data semantics. The overlay must not fabricate a stale
 * verdict from absence.
 */
export function siStaleActive(
  asOfIso: string,
  freshestSiAsOfDateIso: string | null,
  stalenessMaxDays: number,
): boolean {
  if (freshestSiAsOfDateIso === null) return false;
  return isSiRowStale(asOfIso, freshestSiAsOfDateIso, stalenessMaxDays);
}

/**
 * DEC-504-4 reallocation transform. Under si_stale_active, the SHORT
 * sleeve's capacity + allocation-pct are folded into LONG within the
 * SAME strategy (overshoot). Returns the effective (long, short)
 * allocation + capacity pair for the run.
 *
 *   NOT active: (0.90, 0.10) capacity (36, 4) — untouched.
 *   Active    : (1.00, 0.00) capacity (40, 0)  — short arm dark, long
 *               absorbs the envelope. Selectors, tier constants, and
 *               slot-concentration invariant (2.5%) are UNCHANGED.
 *
 * Pure math. Blast radius: one strategy (overshoot). No cross-strategy
 * flow. Audit-log emission is the caller's responsibility — the sizing
 * overlay writes a typed `overshoot.sleeve_reallocation.{engaged,released}`
 * transition with the reason (`si_stale_active` / `si_freshness_restored`)
 * and a W5 reallocation ref (uuid) that annotates every lot / target
 * position created during the reallocation window.
 */
export interface SleeveAllocation {
  longAllocationPct: number;
  shortAllocationPct: number;
  longCapacity: number;
  shortCapacity: number;
  reallocationActive: boolean;
}

export function overshootSleeveAllocation(
  active: boolean,
  baseline: {
    longAllocationPct: number;
    shortAllocationPct: number;
    longCapacity: number;
    shortCapacity: number;
  },
): SleeveAllocation {
  if (!active) {
    return { ...baseline, reallocationActive: false };
  }
  return {
    longAllocationPct: baseline.longAllocationPct + baseline.shortAllocationPct,
    shortAllocationPct: 0,
    longCapacity: baseline.longCapacity + baseline.shortCapacity,
    shortCapacity: 0,
    reallocationActive: true,
  };
}
