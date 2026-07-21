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

// ═══════════════════════════════════════════════════════════════════════
// DEC-080-v2 / DEC-081-v2 / DEC-082 (2026-07-21) — analyst-revision + M&A
// feed-freshness siblings. Co-located with SI freshness per single-home
// discipline (see file-header rationale; INC-91 class). The three-guard
// atomic bundle stamps composite version `aff20a13` on the detector.
// ═══════════════════════════════════════════════════════════════════════

/** DEC-080-v2 / DEC-081-v2 ratified default — analyst feed considered
 *  stale if the freshest `analyst_revision_observations.computed_at` is
 *  older than this many calendar days relative to `asOf`. */
export const OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT = 3;

/** DEC-082 ratified default — corporate-actions feed considered stale
 *  if the freshest `corporate_actions.updated_at` is older than this
 *  many calendar days relative to `asOf`. 14d ≈ two operational weeks;
 *  M&A announcements are event-driven so the fail-closed bar is tighter
 *  than the FINRA short-interest cadence but looser than the ±3-day
 *  analyst-revision window. */
export const OVERSHOOT_MA_STALENESS_MAX_DAYS_DEFAULT = 14;

/**
 * DEC-082 ±5 trading-day exclusion window, approximated as ±7 calendar
 * days. A 5-trading-day span crosses a weekend ~always and (rarely) a
 * federal holiday, so 7 calendar days is a slightly-conservative
 * upper-bound that keeps the guard fail-safe (over-refuse before
 * under-refuse). This constant is the SINGLE source of truth for the
 * approximation — callers pass `maExclusionCalendarDays` on
 * DetectorParams which is initialized from here at the entry function
 * boot.
 */
export const OVERSHOOT_MA_EXCLUSION_CALENDAR_DAYS_DEFAULT = 7;

/**
 * DEC-080-v2 / DEC-081-v2 — is the analyst-revision feed itself stale
 * relative to `asOf`? True iff the freshest observation is older than
 * `maxDays`. Fail-closed: when TRUE, the detector refuses ALL rows
 * with `analyst_revision_feed_stale` (both legs — DEC-081 §3 inherits
 * DEC-080's run-level guard rather than doubling it).
 *
 * Returning FALSE for a NULL / empty corpus is deliberate for symmetry
 * with `siStaleActive` (see rationale there). Absence of any analyst
 * revisions is NOT the same class of failure as a feed that stopped
 * publishing 30 days ago; the caller signals empty-vs-stopped by
 * passing null-vs-old-timestamp.
 */
export function analystRevisionStaleActive(
  asOfIso: string,
  freshestComputedAtIso: string | null,
  maxDays: number,
): boolean {
  if (freshestComputedAtIso === null) return false;
  // computed_at is a timestamptz — take the date component only.
  const dateIso = freshestComputedAtIso.slice(0, 10);
  return siCalendarDaysBetween(asOfIso, dateIso) > maxDays;
}

/**
 * DEC-082 — is the corporate-actions feed itself stale relative to
 * `asOf`? True iff the freshest `updated_at` is older than `maxDays`.
 * Fail-closed: when TRUE, the detector refuses ALL rows (both legs)
 * with `ma_feed_stale` — we cannot trust the "no M&A on this ticker"
 * negative result when the feed hasn't updated recently.
 */
export function maStaleActive(
  asOfIso: string,
  freshestUpdatedAtIso: string | null,
  maxDays: number,
): boolean {
  if (freshestUpdatedAtIso === null) return false;
  const dateIso = freshestUpdatedAtIso.slice(0, 10);
  return siCalendarDaysBetween(asOfIso, dateIso) > maxDays;
}

/**
 * Per-row proximity predicate — is `eventDateIso` within ±`windowDays`
 * calendar days of `asOfIso` (inclusive)? Shared by DEC-080-v2 (analyst
 * downgrade), DEC-081-v2 (analyst upgrade), and DEC-082 (M&A announced/ex).
 * Pure integer arithmetic — no timezone, no wall-clock.
 */
export function withinCalendarDayWindow(
  asOfIso: string,
  eventDateIso: string,
  windowDays: number,
): boolean {
  return Math.abs(siCalendarDaysBetween(asOfIso, eventDateIso)) <= windowDays;
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
