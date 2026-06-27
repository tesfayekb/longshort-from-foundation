/**
 * preflight-composer — FP-056 v1.b §7 PRE-FLIGHT GATE COMPOSER (ACT-317 / E5.5 Phase-1).
 *
 * Orchestrates the §7 verify_* surfaces against a candidate set and produces
 * the `Map<PreflightKey, PreflightResult>` shape `planRebalance` consumes.
 * Replaces the orphaned-kernel premise that "the orchestrator computes this
 * upstream" — IS the orchestrator, for the §7 layer.
 *
 * LOAD-BEARING WIRING (DEC-068 clause e — E4 closure carried into Phase-1):
 *   The htb-cache reader is passed INTO `verifyShortAvailability` so the
 *   consult fires BEFORE the broker locate call. If the symbol is htb-marked,
 *   the verifier short-circuits (no broker call) and the composer records the
 *   short candidate as FAILED with `failed_verifiers: ['verify_short_
 *   availability']`. The E4 closure is unchanged at the verifier — Phase-1
 *   only OBSERVES that the consult is wired and that the locate adapter is
 *   NOT invoked on a htb-marked symbol (asserted by tests).
 *
 * PURITY:
 *   The composer is I/O on its EDGE (it calls the verify_* shells, which call
 *   the injected broker fetchers). The per-candidate classification is pure
 *   (PreflightResult is built from verifier `outcome` values, no wall-clock,
 *   no fetch). The injected `ts` is the SOLE Date source (DEC-034 (4)) — no
 *   `new Date()` / `Date.now()` / `performance.now()` in this module.
 *
 * SSR DETERMINATION (Phase-1 report — typed absence, NOT a synthetic SSR
 * clear, per §2 axiom):
 *   Alpaca paper does not expose SSR cleanly. When no `ssrStatusFetcher` is
 *   injected, the composer SKIPS `verify_ssr_status` on every short candidate
 *   and records the skip in the per-candidate `verifiers_skipped` summary +
 *   in the batch-level `summary.ssr_unavailable=true`. The composer DOES NOT
 *   synthesize an SSR-clear PreflightResult; the candidate's PreflightResult
 *   reflects ONLY the verifiers that actually ran. Phase-2 decides whether to
 *   inject an SSR fetcher from a non-Alpaca source or accept the degraded
 *   posture explicitly.
 *
 * PLANNER CONTRACT:
 *   Returns the `results` Map keyed by `preflightKey(symbol, side)` from
 *   `rebalance-planner.ts` — exact shape `planRebalance` consumes. The
 *   audit-only `summary` is a separate return value; the trigger edge fn
 *   (Phase 2) uses it for the dual audit envelope.
 *
 * SCOPE (Phase 1 — what the composer DOES and DOES NOT do):
 *   DOES per candidate:
 *     - verify_halt_status (every candidate, both sides)
 *     - verify_short_availability (short side only; WITH htb pre-flight consult
 *       passed through to the verifier)
 *     - verify_ssr_status (short side only; SKIPPED if no fetcher injected —
 *       typed absence per the SSR DETERMINATION above)
 *   DOES ONCE per batch:
 *     - verify_buying_power (system-level per §11.0.7 #9 / symbol=null;
 *       requested_position_size = SUM of candidate requested_position_sizes;
 *       insufficient-for-request → ALL candidates fail with reason
 *       'system_insufficient_buying_power' — a system-level failure
 *       short-circuits the whole batch per §11.0.7 #9 verbatim "skip entry")
 *   DOES NOT:
 *     - verify_position. That verifier requires `expected_qty` +
 *       `expected_cost_basis` from the internal cache and is a post-fill
 *       reconciliation surface, not a pre-flight gate for NEW candidates.
 *       The Phase-2 trigger will surface incumbent-position verification as a
 *       separate concern (the planner's CurrentPosition input is the broker's
 *       authoritative read; verify_position adds a divergence check against
 *       internal expectations that Phase-1 has no source for).
 *     - Any cron arm / live fire / placement.
 */

import type {
  BrokerHaltStatusFetcher,
  BrokerLocateFetcher,
  BrokerSSRStatusFetcher,
  BrokerBuyingPowerFetcher,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';
import {
  preflightKey,
  type PreflightKey,
  type PreflightResult,
} from './rebalance-planner.ts';
import type {
  HtbCacheReader,
  HtbCacheClearer,
} from './cache-propagator-io.ts';
import type { FetcherSource } from '../longshort-reconciliation-types.ts';
import type { DaysToCoverReader } from '../longshort-signals/shared/days-to-cover-store.ts';

/**
 * COMPOSER ↔ VERIFIER LAYER DISTINCTION (load-bearing):
 *
 * The §7 PRE-FLIGHT GATE is a pure CLASSIFIER (does the candidate pass?).
 * The verify_*.ts SHELLS wrap each gate in the `reconcile()` lifecycle, which
 * WRITES `reconciliation_events` via supabaseAdmin every call. Pre-flight
 * runs O(candidates × verifiers) times per tick (up to 40 names × 4 gates =
 * 160 writes per rebalance) — flooding the events table with PASS rows is
 * the wrong observability shape AND couples the composer to a DB client.
 *
 * Resolution: the composer calls the broker fetchers DIRECTLY and applies
 * the SAME classification rules as the verifier specs (transcribed inline,
 * comments cite the verbatim verifier source). The verify_*.ts shells remain
 * the AUTHORITATIVE reconciliation surface — they fire during real-fill
 * post-mortems (verify_position) and the strong-evidence reconciliation
 * sweeps. The composer is the GATE, not the recorder. Phase-2 trigger emits
 * its own placement audit envelope; per-candidate gate decisions are
 * surfaced through the `summary` return + the trigger's audit metadata, NOT
 * through reconciliation_events.
 *
 * Classification rules MUST stay in sync with the verifier specs they
 * mirror — any change to a spec's `classify_outcome` MUST be carried here
 * verbatim. The unit tests assert the per-rule outcomes on every gate.
 */

// ────────────────────────────────────────────────────────────────────────────
// Public types.
// ────────────────────────────────────────────────────────────────────────────

export interface PreflightCandidate {
  symbol: string;
  side: 'long' | 'short';
  /** Dollar notional the candidate is sized for at this tick. Summed across
   *  candidates to drive the system-level `verify_buying_power` call. */
  requested_position_size: number;
}

export interface PreflightComposerDeps {
  haltStatusFetcher: BrokerHaltStatusFetcher;
  /** Optional — typed absence per DEC-068 clause (p). When omitted, every
   *  short candidate is recorded FAILED with reason
   *  `short_availability_source_unavailable` (NOT `failed_verifiers:
   *  ['verify_short_availability']`), the broker locate adapter is NEVER
   *  called, and `summary.locate_unavailable=true`. Mirrors clause-(n)'s
   *  `ssrStatusFetcher?` pattern. */
  locateFetcher?: BrokerLocateFetcher;
  /** Optional — pre-trade shortability via `/v2/assets.shortable` (DEC-068
   *  clause (q)). When PRESENT and the htb-cache consult MISSES, the
   *  composer calls this fetcher BEFORE the locate fetcher (and BEFORE
   *  the typed-absence short-circuit). When ABSENT, the composer falls
   *  through to the `locateFetcher` path; when BOTH are absent, the
   *  short candidate is FAILED with reason `short_availability_source_
   *  unavailable` (clause-(p) typed-absence shape). */
  shortabilityFetcher?: BrokerShortabilityFetcher;
  buyingPowerFetcher: BrokerBuyingPowerFetcher;
  /** Optional — typed absence per the SSR DETERMINATION above. When omitted,
   *  every short candidate records `verify_ssr_status` as SKIPPED. */
  ssrStatusFetcher?: BrokerSSRStatusFetcher;
  /** Optional — when present, threads through to `verifyShortAvailability` so
   *  the htb consult fires BEFORE the broker locate call. Production-grade
   *  short-flow callers MUST inject both reader + clearer (E4 invariant). */
  htbCache?: { reader?: HtbCacheReader; clearer?: HtbCacheClearer };
  operator_id: string;
  /** Wired into every verify_* call as `fetcher_source`. Default 'live'. */
  fetcher_source?: FetcherSource;
  /**
   * Optional days-to-cover reader for the SHORT-SIDE squeeze-avoidance gate
   * (DW-165 / Squeeze Protection Component 2). When INJECTED, every short
   * candidate has its latest DTC read; DTC ≥ `shortDtcExcludeThreshold`
   * fails the candidate with `failed_verifiers: ['verify_days_to_cover']`
   * and `reason: 'high_days_to_cover'`. The pre-flight failure triggers
   * the EXISTING planner-side substitution scan (per-side, asymmetric —
   * long candidates are NEVER affected). When ABSENT, the gate is
   * structurally skipped on every short candidate (`summary.dtc_unavailable
   * = true`); short-side substitution still works via the other gates.
   *
   * NULL-DTC POLICY (DW-165): a null DTC value is PASSING (do NOT exclude
   * on data gaps; the active −15% short-stop is the backstop). Null reads
   * are counted in `summary.null_dtc_short_candidates` so the policy is
   * observable — if squeeze events cluster on null-DTC names we revisit.
   *
   * NO-CONTAMINATION INVARIANT: DTC is read ONLY here, ONLY for short
   * candidates, ONLY as a hard-exclude. It MUST NEVER enter the combiner
   * feature vector (`combiner_feature_vectors.features`).
   */
  daysToCoverReader?: DaysToCoverReader;
  /**
   * Hard-exclude threshold for the short-side DTC gate (DW-165). Default
   * 7.0 (Phase-7-calibrated; literature 5–10 day range). Operators
   * override via `LONGSHORT_DTC_SHORT_EXCLUDE_THRESHOLD` (env), parsed
   * with strict finite-positive validation at the composer caller.
   */
  shortDtcExcludeThreshold?: number;
}

export interface PreflightComposerInput {
  candidates: readonly PreflightCandidate[];
  /** Internal expectation passed to verify_buying_power. The planner's
   *  sizing math runs AFTER this — Phase-1 callers pass the broker's
   *  previous-tick observed BP as expected; the §11.0.9 magnitude check is
   *  best-effort at the gate (the planner re-reads `available_bp` directly
   *  for sizing). */
  internal_expected_bp: number;
  ts: Date;
}

/** Audit-only batch summary — carried by the Phase-2 trigger into its dual
 *  audit envelope. Not consumed by `planRebalance`. */
export interface PreflightComposerSummary {
  candidate_count: number;
  passed_count: number;
  failed_count: number;
  bp_insufficient: boolean;
  bp_observed: number;
  bp_requested_total: number;
  /** TRUE iff no `ssrStatusFetcher` was injected — SSR was UNIFORMLY skipped
   *  on every short candidate (typed absence per §2 axiom). */
  ssr_unavailable: boolean;
  /** TRUE iff no `locateFetcher` was injected — short-availability source
   *  is structurally absent on this venue (DEC-068 clause (p) typed-absence
   *  on Alpaca paper). Short candidates are FAILED with reason
   *  `short_availability_source_unavailable`; broker locate was NEVER called. */
  locate_unavailable: boolean;
  /** TRUE iff no `shortabilityFetcher` was injected (DEC-068 clause (q)).
   *  `long_only_mode` at the trigger is `locate_unavailable &&
   *  shortability_unavailable` (both pre-trade short-gates structurally
   *  absent). FALSE on Alpaca paper by default — clause (q) ratifies
   *  `/v2/assets.shortable` as the gate. */
  shortability_unavailable: boolean;
  /**
   * DW-165 — TRUE iff no `daysToCoverReader` was injected. The short-side
   * squeeze-avoidance gate is structurally absent; the −15% short-stop is
   * the sole squeeze backstop on this tick.
   */
  dtc_unavailable: boolean;
  /** DW-165 — short candidates whose DTC was null (typed-absence; PASS + log). */
  null_dtc_short_candidates: number;
  /** DW-165 — short candidates hard-excluded for DTC ≥ threshold. */
  dtc_excluded_short_candidates: number;
  /** DW-165 — threshold actually used this tick (after env override). */
  dtc_threshold: number;
  short_count: number;
  long_count: number;
}

export interface PreflightComposerOutput {
  /** The shape `planRebalance` consumes. */
  results: Map<PreflightKey, PreflightResult>;
  /** Per-candidate `verifiers_skipped` (audit only — not consumed by planner). */
  skipped: Map<PreflightKey, readonly string[]>;
  summary: PreflightComposerSummary;
}

// ────────────────────────────────────────────────────────────────────────────
// Composer entry.
// ────────────────────────────────────────────────────────────────────────────

export async function composePreflightResults(
  input: PreflightComposerInput,
  deps: PreflightComposerDeps,
): Promise<PreflightComposerOutput> {
  // fetcher_source is reserved for the Phase-2 trigger's audit metadata;
  // the gate-level composer does not project it onto reconciliation_events.
  const _fetcherSource: FetcherSource = deps.fetcher_source ?? 'live';
  void _fetcherSource;
  const ssrUnavailable = deps.ssrStatusFetcher === undefined;
  const locateUnavailable = deps.locateFetcher === undefined;
  const shortabilityUnavailable = deps.shortabilityFetcher === undefined;
  const dtcReader = deps.daysToCoverReader;
  const dtcUnavailable = dtcReader === undefined;
  const dtcThreshold = deps.shortDtcExcludeThreshold ?? DEFAULT_SHORT_DTC_EXCLUDE_THRESHOLD;
  let nullDtcShortCandidates = 0;
  let dtcExcludedShortCandidates = 0;
  // The pre-trade short gate is structurally ABSENT only when BOTH the
  // shortability fetcher and the locate fetcher are missing. Either one
  // present satisfies §11.0.7 #4 "skip short entry; do NOT default to
  // 'assume available'."
  const shortGateAbsent = shortabilityUnavailable && locateUnavailable;

  const requestedTotal = input.candidates.reduce(
    (acc, c) => acc + Math.abs(c.requested_position_size),
    0,
  );

  // ── SYSTEM-LEVEL: verify_buying_power gate (ONE call for the whole batch).
  // Mirrors verify_buying_power.ts classify_outcome — `insufficient_for_request`
  // when `observed_bp < requested_total` (§11.0.7 #9 verbatim "skip entry").
  // System-level failure short-circuits every candidate.
  const bp = await deps.buyingPowerFetcher.fetchBuyingPower(input.ts);
  const bpObserved = bp.available_bp;
  const bpInsufficient = bp.available_bp < requestedTotal;
  void input.internal_expected_bp; // reserved for the Phase-2 trigger audit envelope

  const results = new Map<PreflightKey, PreflightResult>();
  const skipped = new Map<PreflightKey, readonly string[]>();
  let passedCount = 0;
  let failedCount = 0;
  let shortCount = 0;
  let longCount = 0;

  for (const c of input.candidates) {
    if (c.side === 'short') shortCount++;
    else longCount++;

    const key = preflightKey(c.symbol, c.side);
    const failed: string[] = [];
    const skippedHere: string[] = [];

    // System-level BP failure short-circuits every candidate per §11.0.7 #9.
    if (bpInsufficient) {
      failed.push('verify_buying_power');
    }

    // ── HALT (every candidate). ──
    // Mirrors verify_halt_status.ts classify_outcome —
    // observed.halted === true → failure_handled (gate FAIL).
    const halt = await deps.haltStatusFetcher.fetchHaltStatus(c.symbol, input.ts);
    if (halt.halted === true) {
      failed.push('verify_halt_status');
    }

    // ── SHORT-SIDE GATES. ──
    if (c.side === 'short') {
      // ── DEC-068 clause (p)+(q) TYPED-ABSENCE SHORT-CIRCUIT ────────────
      // When BOTH `locateFetcher` AND `shortabilityFetcher` are absent
      // the short-availability source is structurally absent. We DO NOT
      // call any broker gate, DO NOT consult htb (no fetch follows), and
      // record the candidate FAILED with reason
      // `short_availability_source_unavailable` — distinct in audit shape
      // from a transient broker-reported htb reject (clause (p)
      // DISTINGUISHABILITY INVARIANT). The verifier name is added to
      // `verifiers_skipped`, NOT to `failed_verifiers`. Composer writes
      // NO reconciliation_events row for the locate verifier.
      if (shortGateAbsent) {
        skippedHere.push('verify_short_availability');
        // SSR typed-absence skip on the short side (when applicable)
        // is still recorded alongside.
        if (deps.ssrStatusFetcher === undefined) {
          skippedHere.push('verify_ssr_status');
        }
        // Bypass htb-consult + locate + SSR; record the fail-shape.
        const reasonParts: string[] = ['short_availability_source_unavailable'];
        // If BP was already insufficient, surface that too — it remains
        // an authoritative system-level failure on this candidate.
        if (failed.length > 0) {
          reasonParts.unshift(`preflight_failed:${failed.join(',')}`);
        }
        passedCount += 0;
        failedCount++;
        results.set(key, {
          passed: false,
          reason: reasonParts.join('|'),
          failed_verifiers: failed, // does NOT include verify_short_availability
        });
        if (skippedHere.length > 0) skipped.set(key, skippedHere);
        continue;
      }
      // ── E4 LOAD-BEARING WIRING (consult-before-locate) ─────────────────
      // Composer layering (clause (q) refinement 1 — fail-closed):
      //   1. htb-cache consult (cache HIT short-circuits BEFORE any
      //      assets read — the broken-loop guarantee from E4).
      //   2. shortability fetcher (clause (q) pre-trade gate via
      //      assets.shortable). When present this IS the pre-trade
      //      decision; structurally equivalent to a locate.
      //   3. locate fetcher (legacy POST /v2/short_locates path; only
      //      reached when shortabilityFetcher is absent).
      // Per §11.0.7 #4 verbatim "skip short entry; do NOT substitute
      // long; do NOT default to 'assume available'."
      const htbMarked = deps.htbCache?.reader
        ? await deps.htbCache.reader.isMarkedHtb(c.symbol, input.ts)
        : false;
      let shortFailed = false;
      if (htbMarked) {
        shortFailed = true; // consult HIT — no further short-gate calls.
      } else if (deps.shortabilityFetcher !== undefined) {
        // ── clause-(q) PRE-TRADE SHORTABILITY GATE ────────────────────
        // STEP-A verified `shortable === true` is the authoritative gate
        // on Alpaca paper. Layered AFTER the htb consult so cache-hits
        // never spend an assets read. On `shortable === false` the
        // candidate fails with verify_short_availability marked failed —
        // mirrors the locate-path classification so downstream readers
        // see one consistent failure shape regardless of which gate fired.
        const sh = await deps.shortabilityFetcher.fetchShortability(c.symbol, input.ts);
        if (!sh.shortable) {
          shortFailed = true;
        }
        // CLEAR-ON-GENUINE-SUCCESS — mirrors the locate-path semantics
        // below. A shortable name has its (possibly stale) htb mark
        // cleared so the next-tick consult doesn't keep it gated.
        if (!shortFailed && deps.htbCache?.clearer) {
          await deps.htbCache.clearer.clearHtb(c.symbol);
        }
      } else {
        // Consult MISS — call the locate adapter.
        const locate = await deps.locateFetcher!.fetchLocate(c.symbol, input.ts);
        // Mirrors verify_short_availability.ts classify_outcome:
        //   !available                                              → failure_handled
        //   available && qty_available < qty_requested              → failure_handled (partial)
        //   available && qty_available >= qty_requested             → false_positive_within_tolerance (PASS)
        // GATE SEMANTICS: at pre-flight time the candidate carries DOLLAR
        // notional (`requested_position_size`), not shares — share count
        // is computed at submit-time via pricing.ts. The gate therefore
        // asks the boundary question "can we borrow at all?" (qty_available
        // ≥ 1 share). The submit-time path re-checks against actual share
        // count via the standalone verify_short_availability surface when
        // wired into the reconciliation sweeps. Splitting the check this
        // way keeps the gate fast + dollar-denominated and the verifier
        // share-denominated, which is what each layer's input contract is.
        if (!locate.available) {
          shortFailed = true;
        } else if (locate.qty_available !== null && locate.qty_available < 1) {
          shortFailed = true;
        }
        // CLEAR-ON-GENUINE-SUCCESS — mirrors verify_short_availability.ts
        // line ~155: clear ONLY on the genuine-success branch (passed AND
        // qty_available >= 1 share at the gate). Partial-on-actual-shares
        // is enforced at the submit-time verifier surface, which DOES NOT
        // clear on partial — the gate's clear here is the "any-borrow"
        // green-light, not the full-size green-light.
        if (!shortFailed && deps.htbCache?.clearer) {
          await deps.htbCache.clearer.clearHtb(c.symbol);
        }
      }
      if (shortFailed) {
        failed.push('verify_short_availability');
      }

      // verify_ssr_status — typed absence when no fetcher injected.
      if (deps.ssrStatusFetcher !== undefined) {
        // Mirrors verify_ssr_status.ts classify_outcome:
        //   not_active    → PASS
        //   active        → failure_handled (gate FAIL — SSR-compliant routing required)
        //   indeterminate → failure_handled (gate FAIL — refuse this tick)
        const ssr = await deps.ssrStatusFetcher.fetchSSRStatus(c.symbol, input.ts);
        if (ssr.state !== 'not_active') {
          failed.push('verify_ssr_status');
        }
      } else {
        skippedHere.push('verify_ssr_status');
      }

      // ── DW-165 SHORT-SIDE DAYS-TO-COVER (squeeze-avoidance) ──────────
      // Hard-exclude when DTC ≥ threshold. Null DTC = PASS + log
      // (typed-absence; the −15% short-stop is the active backstop).
      // Reader missing entirely = SKIP (typed-absence on the whole gate,
      // mirrors the SSR-skip shape). NO broker call here — read is
      // table-local; therefore zero rate-limit footprint.
      if (dtcReader === undefined) {
        skippedHere.push('verify_days_to_cover');
      } else {
        const dtc = await dtcReader.read(c.symbol);
        if (dtc === null) {
          nullDtcShortCandidates++;
          // PASS — no failed.push.
        } else if (dtc >= dtcThreshold) {
          failed.push('verify_days_to_cover');
          dtcExcludedShortCandidates++;
        }
      }
    }

    const passed = failed.length === 0;
    if (passed) passedCount++;
    else failedCount++;

    // DW-165: when verify_days_to_cover is the SOLE failure, surface the
    // spec-mandated reason verbatim (`high_days_to_cover`) so substitution-
    // scan telemetry can attribute the rejection. Composite failures keep
    // the existing `preflight_failed:<verifiers>` shape for diagnosability.
    const reasonStr = passed
      ? null
      : (failed.length === 1 && failed[0] === 'verify_days_to_cover')
        ? 'high_days_to_cover'
        : `preflight_failed:${failed.join(',')}`;

    results.set(key, {
      passed,
      reason: reasonStr,
      failed_verifiers: failed,
    });
    if (skippedHere.length > 0) skipped.set(key, skippedHere);
  }

  return {
    results,
    skipped,
    summary: {
      candidate_count: input.candidates.length,
      passed_count: passedCount,
      failed_count: failedCount,
      bp_insufficient: bpInsufficient,
      bp_observed: bpObserved,
      bp_requested_total: requestedTotal,
      ssr_unavailable: ssrUnavailable,
      locate_unavailable: locateUnavailable,
      shortability_unavailable: shortabilityUnavailable,
      dtc_unavailable: dtcUnavailable,
      null_dtc_short_candidates: nullDtcShortCandidates,
      dtc_excluded_short_candidates: dtcExcludedShortCandidates,
      dtc_threshold: dtcThreshold,
      short_count: shortCount,
      long_count: longCount,
    },
  };
}

/**
 * Default short-side DTC exclude threshold (DW-165). Phase-7-calibrated
 * starting value — literature 5–10 day range; 7 = midpoint. NO spec
 * basis; the constant is re-tunable from a single site.
 */
export const DEFAULT_SHORT_DTC_EXCLUDE_THRESHOLD = 7.0;

/**
 * Resolve the short-side DTC exclude threshold from the env override
 * `LONGSHORT_DTC_SHORT_EXCLUDE_THRESHOLD`, falling back to
 * `DEFAULT_SHORT_DTC_EXCLUDE_THRESHOLD`. Mirrors the hardened parse
 * pattern used for `LONGSHORT_SHORT_STOP_THRESHOLD`: strict `parseFloat`,
 * `> 0`, finite — any malformed value throws with the offending input
 * surfaced. Call this at the composer caller boundary (NOT inside the
 * composer, which must stay free of `Deno.env` for testability).
 */
export function resolveShortDtcExcludeThreshold(
  envGet: (name: string) => string | undefined,
): number {
  const raw = envGet('LONGSHORT_DTC_SHORT_EXCLUDE_THRESHOLD');
  if (raw === undefined || raw === '') return DEFAULT_SHORT_DTC_EXCLUDE_THRESHOLD;
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(
      `LONGSHORT_DTC_SHORT_EXCLUDE_THRESHOLD must be a finite, positive number; got "${raw}"`,
    );
  }
  return v;
}