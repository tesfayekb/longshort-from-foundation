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
//
// ═══ TWO-CONSTANT DESIGN (DO NOT COLLAPSE) — INC-125.b (2026-07-22) ═══
// Two distinct SI-staleness constants coexist ON PURPOSE, at two different
// call sites. They measure two different things and must not be merged:
//
//   (1) DETECTOR_SI_STALENESS_MAX_DAYS = 20
//       Location: `overshoot-detection-run/index.ts` (near line 126).
//       Role: PER-ROW USABLE-DATA ENVELOPE. The windowed SQL clause
//       `as_of_date >= (asOf - 20)` bounds which short-interest rows are
//       admissible into the per-ticker detector map. A row outside the
//       envelope is unusable for THAT ticker's admission decision even
//       if the row exists — its price/float context is too old to gate
//       an entry.
//
//   (2) OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT = 21 (strict `>`)
//       Location: this file (below), consumed via `siStaleActive`.
//       Role: BOOK-LEVEL STALENESS FLAG. Decides whether the ENTIRE
//       short sleeve is in a stale-feed window and must reallocate to
//       LONG under DEC-504-4. Compared against the CORPUS-MAX
//       `as_of_date` from `overshoot_short_interest` (no window filter
//       — see MIG note in overshoot-detection-run for the decoupled
//       read). Strict `>` so a fresh-cycle-day-of doesn't misfire.
//
// TELL FOR NEXT READER — the pathology INC-125.b closed was the reverse:
// deriving the book-level freshest from the ALREADY-WINDOWED per-row map,
// which returns NULL whenever corpus-MAX > 20d, silently triggering the
// `si_corpus_absent` fail-closed branch when the true state is "corpus
// exists, just past the per-row envelope." The durable diagnostic is
// CORPUS-MAX-vs-FRESHEST divergence — if the two diverge, someone
// re-coupled the reads. Do NOT re-diagnose from scratch.

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
 * NULL / EMPTY CORPUS → TRUE (fail-closed). Symmetric with the sibling
 * analyst/M&A freshness guards (DEC-080-v2 / DEC-081-v2 / DEC-082):
 * absence of any freshest datapoint is treated as degraded feed state,
 * not "safely fresh". The book-level belt fires first (sleeves 40/0);
 * the per-ticker `si_unavailable` refusal remains the second belt.
 * Callers that need to distinguish "no corpus at all" from "corpus but
 * stale" should inspect `freshestSiAsOfDateIso === null` themselves —
 * the transition writer stamps `reason='si_corpus_absent'` in that
 * case so the audit row names WHICH degradation fired.
 */
export function siStaleActive(
  asOfIso: string,
  freshestSiAsOfDateIso: string | null,
  stalenessMaxDays: number,
): boolean {
  if (freshestSiAsOfDateIso === null) return true;
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
 *  older than this many calendar days relative to `asOf`.
 *
 *  WEEKDAY-CADENCE RATIONALE (2026-07-21 operator amendment):
 *  The upstream analyst-revision feed publishes on U.S. equity-market
 *  weekdays; ordinary weekends inject a 3-calendar-day gap
 *  (Fri 20:00Z → Mon 20:00Z re-fire) and a Friday-before-Monday-holiday
 *  inserts a 4-calendar-day gap (Fri → Tue, e.g. Memorial / Labor /
 *  MLK / Presidents' Day / Independence-day observed shifts). A 3-day
 *  fail-closed cap therefore blanks the book on every ordinary Tuesday
 *  after a long weekend — a false-positive class the operator ruled
 *  unacceptable. The ratified cap is 4d, which admits the 4-day holiday
 *  gap while still catching a genuinely dying feed (Wed→Mon = 5d > 4
 *  → stale). A WARN-level companion at 3d
 *  (see `OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT`
 *  + `analystRevisionStaleWarnActive`) surfaces the early-warning
 *  signal without refusing the book, so a real feed degradation is
 *  observable one operational day before the fail-closed edge fires. */
export const OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT = 4;

/** WARN-band threshold — engaged when the freshest analyst observation
 *  is > this-many calendar days old but ≤ the fail-closed max. Non-
 *  refusing signal: emit a structured warn event so a dying feed
 *  surfaces on the ordinary-weekend edge, without blanking the book on
 *  legitimate Tuesday-after-holiday runs. */
export const OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT = 3;

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
 * DEC-080-v2 / DEC-081-v2 (2026-07-21 amendment) — WARN-band predicate.
 * True iff the freshest analyst observation is strictly older than
 * `warnAtDays` AND NOT older than `maxDays` (i.e., in the observation
 * band between "healthy" and "fail-closed-stale"). Callers should emit
 * a structured warn event (NOT a refusal) so a dying feed surfaces on
 * the ordinary-weekend edge one operational day before the fail-closed
 * cap fires. See the file-header rationale for the weekday-cadence
 * ruling.
 *
 * Returns FALSE for null / empty corpus — same symmetry as
 * `analystRevisionStaleActive`.
 */
export function analystRevisionStaleWarnActive(
  asOfIso: string,
  freshestComputedAtIso: string | null,
  warnAtDays: number,
  maxDays: number,
): boolean {
  if (freshestComputedAtIso === null) return false;
  const dateIso = freshestComputedAtIso.slice(0, 10);
  const age = siCalendarDaysBetween(asOfIso, dateIso);
  return age > warnAtDays && age <= maxDays;
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
