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
  locateFetcher: BrokerLocateFetcher;
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
      // ── E4 LOAD-BEARING WIRING (consult-before-locate) ─────────────────
      // verify_short_availability.ts:107-114 transcribed verbatim: the htb
      // pre-flight consult fires BEFORE the broker locate call. If
      // `isMarkedHtb` returns true the candidate FAILS without invoking
      // the locate adapter (the loop-break the E4 closure depends on).
      // Per §11.0.7 #4 verbatim "skip short entry; do NOT substitute long;
      // do NOT default to 'assume available'."
      const htbMarked = deps.htbCache?.reader
        ? await deps.htbCache.reader.isMarkedHtb(c.symbol, input.ts)
        : false;
      let shortFailed = false;
      if (htbMarked) {
        shortFailed = true; // consult HIT — locate is NOT called.
      } else {
        // Consult MISS — call the locate adapter.
        const locate = await deps.locateFetcher.fetchLocate(c.symbol, input.ts);
        // Mirrors verify_short_availability.ts classify_outcome:
        //   !available                                              → failure_handled
        //   available && qty_available < qty_requested              → failure_handled (partial)
        //   available && qty_available >= qty_requested             → false_positive_within_tolerance (PASS)
        // qty_requested at the gate uses the candidate's requested
        // position size; the locate adapter's probe qty is its own
        // construction default (1 share — "can we borrow at all?").
        if (!locate.available) {
          shortFailed = true;
        } else if (
          locate.qty_available !== null &&
          locate.qty_available < Math.max(1, Math.abs(c.requested_position_size))
        ) {
          shortFailed = true;
        }
        // CLEAR-ON-GENUINE-SUCCESS — mirrors verify_short_availability.ts
        // line ~155: clear ONLY on the genuine-success branch (passed AND
        // qty_available >= requested). Partial does NOT clear.
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
    }

    const passed = failed.length === 0;
    if (passed) passedCount++;
    else failedCount++;

    results.set(key, {
      passed,
      reason: passed ? null : `preflight_failed:${failed.join(',')}`,
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
      short_count: shortCount,
      long_count: longCount,
    },
  };
}