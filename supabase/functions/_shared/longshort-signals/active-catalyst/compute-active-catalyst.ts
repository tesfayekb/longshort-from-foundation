/**
 * Active Catalyst Flag (Signal #9) per CROSSWIND §4.4.9.
 *
 * Formula (spec-literal, copied verbatim from
 * `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:546-567`):
 *
 *   For each catalyst event E for name N in trailing 5 trading days:
 *     catalyst_weight(E) = 3.0 (Tier 1) | 1.5 (Tier 2) | 0.5 (Tier 3)
 *     age_weight(E) = exp(-age_in_hours / catalyst_specific_half_life)
 *   raw_signal_N = sum(catalyst_weight(E) × age_weight(E))
 *
 *   Sign: Unsigned (always positive). Direction captured by other signals.
 *
 * Half-life table (DEC-057 §(a), frozen): Earnings 48h · M&A 96h ·
 * FDA 72h · Regulatory 96h · Guidance 48h · Executive change 72h ·
 * Analyst change 24h · Partnership 36h · Buyback/Dividend change 36h ·
 * Splits 24h. Compute consumes the frozen `CATALYST_HALF_LIFE_HOURS`
 * lookup keyed by event_type — no per-event re-derivation.
 *
 * Tier table (CROSSWIND §4.4.9, frozen via DEC-057 §(g) IN-set):
 * Tier 1 (3.0): earnings, ma, fda_advisory, regulatory_action, guidance,
 *               executive_change.
 * Tier 2 (1.5): analyst_rating, partnership, dividend_change, splits.
 * Tier 3 (0.5): (no IN-set members at v1; all §4.4.9 Tier-3 types are
 *               in the DEC-057 §(g) OUT-set — deferred to v2).
 *
 * Inputs: `classifyCatalystEvents` outputs (deduped, window-bounded,
 * look-ahead-gated `RawCatalystEventInput[]`). Compute TRUSTS the
 * classifier's tier / dedup / source — no re-classification, no
 * re-windowing, no re-deduping. Phase 3 orchestrator is responsible for
 * invoking the classifier first and handing the result here.
 *
 * ─── Semantics rulings (pinned per operator brief) ─────────────────────
 *
 * (a) ≥1 deduped in-window event → ALWAYS a value. Signal #9 is a
 *     presence-intensity signal: a single Tier-3 event yields a small
 *     positive value (0.5 × decay), NEVER a skip. Contrast Signal #8
 *     (news sentiment): there all-neutral coverage yields raw=0.0
 *     because zero is meaningful; here a single event is meaningful too
 *     and is the smallest non-skip output.
 *
 * (b) Zero in-window events → `no_catalyst_events_in_window` typed skip.
 *     This is the §4.4.9 "expected case for most names" — most stocks
 *     have no in-window catalysts. Combiner imputes (-999, 0) in Phase 3.
 *
 * (c) Malformed rows (non-finite `event_at`, unknown / unmapped
 *     `event_type`) → `data_unavailable` skip with detail when the
 *     ALL-malformed case is the only in-window content. Malformed rows
 *     are NEVER coerced to 0 and NEVER counted toward presence.
 *
 * (d) `raw >= 0` by construction. Every term is a positive tier weight
 *     × a positive exp() — sum cannot be negative. The Phase-3
 *     within-sector z-normalization centers the panel; this compute does
 *     NOT mean-subtract, NOT clip, NOT sign-flip.
 *
 * NO sentinel numerics. NO fabricated decay. NO wall-clock.
 *
 * Owner: longshort (FP-049 Phase 2 — Signal #9)
 * Classification: shared infrastructure — pure compute, no I/O, no clock.
 */
import {
  CATALYST_HALF_LIFE_HOURS,
  CATALYST_TIER_BY_EVENT_TYPE,
  CATALYST_TIER_WEIGHT,
  type CatalystEventType,
  type CatalystTier,
  type RawCatalystEventInput,
} from './catalyst-types.ts';
import type { SignalSkipReason } from '../shared/signal-types.ts';

const MS_PER_HOUR = 3_600_000;

export interface ActiveCatalystInputs {
  /**
   * Deduped, window-bounded, look-ahead-gated events for THIS ticker.
   * Caller (Phase-3 orchestrator) MUST have run `classifyCatalystEvents`
   * first; this compute trusts that pipeline.
   */
  events: ReadonlyArray<RawCatalystEventInput>;
  /** Injected as-of timestamp — anchors age_hours arithmetic. ZERO wall-clock. */
  asOf: Date;
}

export type ActiveCatalystSkipReason = Extract<
  SignalSkipReason,
  'no_catalyst_events_in_window' | 'data_unavailable'
>;

export interface ActiveCatalystMeta {
  /** Total deduped events that contributed to `raw` (excludes malformed). */
  eventCount: number;
  /** Per-tier contribution counts. Tier-3 always 0 at v1 (OUT-set). */
  byTier: Readonly<Record<CatalystTier, number>>;
  /** Subset of `eventCount` with `source === 'keyword'`. */
  keywordSourceCount: number;
  /**
   * Dedup drops attributable to this compute. Always 0 by construction —
   * dedup happened upstream in `classifyCatalystEvents`. Surfaced as a
   * stable-shape field so the orchestrator can pass through the
   * `ClassifyResult.cross_vendor_duplicates_dropped` counter for the
   * `signal_compute_log.metadata` payload without a separate channel.
   */
  dedupDropped: number;
}

export type ActiveCatalystComputeResult =
  | { kind: 'value'; raw: number; meta: ActiveCatalystMeta }
  | { kind: 'skip'; reason: ActiveCatalystSkipReason; detail: string };

function isKnownEventType(t: string): t is CatalystEventType {
  return Object.prototype.hasOwnProperty.call(CATALYST_HALF_LIFE_HOURS, t);
}

/**
 * Pure compute. Same inputs → same outputs. No clock, no I/O, no random.
 */
export function computeActiveCatalyst(
  i: ActiveCatalystInputs,
): ActiveCatalystComputeResult {
  const asOfMs = i.asOf.getTime();
  if (!Number.isFinite(asOfMs)) {
    return {
      kind: 'skip',
      reason: 'data_unavailable',
      detail: 'asOf is not a valid Date',
    };
  }

  let raw = 0;
  let eventCount = 0;
  let keywordSourceCount = 0;
  let malformedCount = 0;
  const byTier: Record<CatalystTier, number> = { 1: 0, 2: 0, 3: 0 };

  for (const e of i.events) {
    if (!isKnownEventType(e.event_type)) {
      malformedCount++;
      continue;
    }
    const eventMs = Date.parse(e.event_at);
    if (!Number.isFinite(eventMs)) {
      malformedCount++;
      continue;
    }
    const tier = CATALYST_TIER_BY_EVENT_TYPE[e.event_type];
    const tierWeight = CATALYST_TIER_WEIGHT[tier];
    const halfLife = CATALYST_HALF_LIFE_HOURS[e.event_type];
    const ageHours = (asOfMs - eventMs) / MS_PER_HOUR;
    const decay = Math.exp(-ageHours / halfLife);
    raw += tierWeight * decay;
    eventCount++;
    byTier[tier]++;
    if (e.source === 'keyword') keywordSourceCount++;
  }

  if (eventCount === 0) {
    if (malformedCount > 0) {
      return {
        kind: 'skip',
        reason: 'data_unavailable',
        detail: `${malformedCount} malformed event row(s) (non-finite event_at or unknown event_type); none scorable`,
      };
    }
    return {
      kind: 'skip',
      reason: 'no_catalyst_events_in_window',
      detail: '0 deduped catalyst events inside trailing 5-trading-day window',
    };
  }

  // (d) raw >= 0 by construction — assert as a runtime guard against
  // future refactors that might introduce a sign-flip (the spec is
  // explicit: "Sign: Unsigned (always positive)").
  if (!(raw >= 0)) {
    throw new Error(
      `computeActiveCatalyst: raw must be >= 0 by construction (got ${raw}); §4.4.9 sign discipline violated`,
    );
  }

  return {
    kind: 'value',
    raw,
    meta: {
      eventCount,
      byTier: { 1: byTier[1], 2: byTier[2], 3: byTier[3] },
      keywordSourceCount,
      dedupDropped: 0,
    },
  };
}