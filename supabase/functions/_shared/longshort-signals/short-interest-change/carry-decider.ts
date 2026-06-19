/**
 * DW-106-b — Pure carry-decider for Signal #9 (`short_interest_change_30d`).
 *
 * Implements DEC-060 (operator-locked 2026-06-19):
 *   §(i)  Hold-last-value (no decay). Short interest is a state variable;
 *         the signal value already encodes time-as-Δ across two SEC
 *         reports, so layering decay would double-discount.
 *   §(ii) 22-calendar-day staleness bound (INCLUSIVE — `staleness <= 22`
 *         emits a carry; `> 22` emits a typed-absence). Covers FINRA's
 *         ~15d cadence + one missed-publication slip + 2d buffer.
 *   §(iv) Forward-only — the decider is stateless and takes `as_of_date`
 *         as a parameter; the caller (DW-106-c cron) ensures it is never
 *         invoked on a pre-heal as_of.
 *   §(v)  `carried_forward` is audit-only. The decider returns a decision
 *         object; the caller (DW-106-c) maps `emit_carry` to a row with
 *         `(is_present=true, value=anchor.value, carried_forward=true)`
 *         and `emit_absence` to `(is_present=false, value=null,
 *         carried_forward=false)`. Both outcomes satisfy the two
 *         signal_observations CHECKs (MIG-064 value/is_present + MIG-101
 *         carried_forward/present).
 *
 * Purity contract (mirrors `feature-assembler.ts` / `compute-momentum.ts`):
 *   - No Supabase client, no IO.
 *   - No wall-clock — `as_of_date` is a parameter (DEC-034 clause 4 +
 *     the precedent of every other signal's pure layer).
 *   - Deterministic for replay: byte-identical output for byte-identical
 *     input.
 *
 * Bound anchoring (reconciled): the staleness window is measured from
 * the most-recent NATIVE publication (`carried_forward === false AND
 * is_present === true`), NOT from the most-recent row. Anchoring on the
 * latter would mean the bound never trips because each daily carry would
 * reset the clock — which would silently feed indefinitely-stale SI
 * into the combiner. The publication-anchored bound trips after 22
 * calendar days of no successor publication regardless of how many
 * carries have been emitted in between.
 *
 * Publication-day idempotency: when a fresh publication row already
 * exists at the current `as_of_date`, the decider returns
 * `skip_native_exists`. The caller MUST then skip the upsert for that
 * ticker — the composite-PK UPSERT is last-writer-wins and would
 * otherwise overwrite the native row with a `carried_forward=true`
 * duplicate.
 *
 * Past-bound emission (reconciled): when no publication exists within
 * the 22d window, the decider returns an `emit_absence` outcome (the
 * caller writes an explicit `is_present=false` row at the current
 * `as_of_date`). Both the no-row and the explicit-absence shapes are
 * combiner-equivalent (`feature-assembler.ts:isPresent()` returns false
 * in both cases), but the explicit row buys per-day past-bound-rate
 * forensic queryability + uniformity with the future DW-108 rewrite, at
 * sub-1% daily volume cost.
 *
 * Reader isolation: the assembler's `signal_observations` projection
 * (`feature-assembler-orchestrator.ts:179` —
 * `.select('ticker, signal_id, value, is_present, gics_sector')`) does
 * NOT include `carried_forward`, so a carried row is structurally
 * indistinguishable from a native row at the feature-vector layer. The
 * `feature-assembler_carry-flag-isolation_test.ts` regression test in
 * this commit pins that invariant.
 *
 * Owner: longshort (FP-053 / DW-106-b)
 * Classification: pure logic — Phase 2 signal-layer carry decider.
 */

/**
 * The carry-forward staleness bound (calendar days), INCLUSIVE.
 * Locked by DEC-060 §(ii) + §(vi); any change requires a superseding
 * DEC AND a fresh FP authored before the change is applied.
 */
export const SHORT_INTEREST_CARRY_BOUND_DAYS = 22;

/**
 * Per-ticker prior observation shape the decider reads. Mirrors the
 * `signal_observations` columns the DW-106-c caller will project +
 * `carried_forward` (MIG-101) so the decider can distinguish native
 * publications from prior carries when anchoring the bound.
 */
export interface PriorObservation {
  as_of_date: string;          // 'YYYY-MM-DD'
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
  carried_forward: boolean;
}

/**
 * Decision outcomes — exhaustive 4-way union.
 *
 *   skip_native_exists      A native publication row already exists at
 *                           `as_of_date`; the caller MUST NOT upsert.
 *   emit_carry              Emit a row at `as_of_date` with
 *                           is_present=true, value=<held>,
 *                           carried_forward=true. `anchor_as_of` is the
 *                           publication date the held value originates
 *                           from (DW-106-c may write it to telemetry).
 *   emit_absence(past_bound)
 *                           The most-recent publication is >22 calendar
 *                           days stale; emit is_present=false, value=null,
 *                           carried_forward=false.
 *   emit_absence(no_prior_publication)
 *                           No usable publication exists in `priors`
 *                           (warm-up before the first SI report ever
 *                           lands, or only-carried rows survive —
 *                           defensive); same absence shape.
 */
export type CarryOutcome =
  | { kind: 'skip_native_exists' }
  | {
      kind: 'emit_carry';
      value: number;
      gics_sector: string | null;
      anchor_as_of: string;
    }
  | { kind: 'emit_absence'; reason: 'past_bound'; anchor_as_of: string }
  | { kind: 'emit_absence'; reason: 'no_prior_publication' };

/**
 * Calendar-day diff between two 'YYYY-MM-DD' strings (treated as UTC
 * midnight). MIRRORS `dateDiffCalDays` in
 * `_shared/longshort-combiner/forward-return-orchestrator.ts:113-118`
 * verbatim; the two impls MUST stay byte-identical. Consolidation to a
 * shared util is deferred to the next call site (>=3) per the existing
 * helper-extraction precedent in this codebase. Pure — no clock, no IO.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function calendarDaysBetween(later: string, earlier: string): number {
  const a = Date.parse(later + 'T00:00:00Z');
  const b = Date.parse(earlier + 'T00:00:00Z');
  return Math.floor((a - b) / MS_PER_DAY);
}

/**
 * The pure decider. Given a ticker's prior observations and the current
 * `as_of_date`, return what the DW-106-c caller should do.
 */
export function decideShortInterestCarry(
  priors: ReadonlyArray<PriorObservation>,
  as_of_date: string,
): CarryOutcome {
  // (B2) Publication-day idempotency — a native present row at the
  // current as_of wins over any carry decision, unconditionally.
  for (const p of priors) {
    if (
      p.as_of_date === as_of_date &&
      p.carried_forward === false &&
      p.is_present === true
    ) {
      return { kind: 'skip_native_exists' };
    }
  }

  // (B3) Anchor = max(as_of_date) over NATIVE present rows only. Carried
  // rows are EXCLUDED from anchor candidacy by construction so the bound
  // measures publication-to-present and trips on real staleness.
  let anchor: PriorObservation | null = null;
  for (const p of priors) {
    if (p.carried_forward !== false) continue;
    if (p.is_present !== true) continue; // defensive: ignore typed-absences
    if (p.value === null) continue;       // defensive: belt-and-suspenders vs CHECK
    if (anchor === null || p.as_of_date > anchor.as_of_date) {
      anchor = p;
    }
  }

  if (anchor === null) {
    return { kind: 'emit_absence', reason: 'no_prior_publication' };
  }

  const staleness = calendarDaysBetween(as_of_date, anchor.as_of_date);
  if (staleness <= SHORT_INTEREST_CARRY_BOUND_DAYS) {
    return {
      kind: 'emit_carry',
      value: anchor.value as number,
      gics_sector: anchor.gics_sector,
      anchor_as_of: anchor.as_of_date,
    };
  }
  return {
    kind: 'emit_absence',
    reason: 'past_bound',
    anchor_as_of: anchor.as_of_date,
  };
}