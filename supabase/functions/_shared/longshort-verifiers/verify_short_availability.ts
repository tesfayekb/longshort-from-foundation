/**
 * verify_short_availability — Reconciliation verifier #4 per CROSSWIND §11.0.7.
 *
 * Tier: strong
 * Tolerance class: low_tolerance (3 firings in 1h escalates per §11.0.9)
 *
 * Per §11.0.7 verbatim: "calls Alpaca's locate service. Failure action: skip short entry;
 * do NOT substitute long; do NOT default to 'assume available'."
 *
 * Divergence shape: { available, qty_requested, qty_available }
 *
 * classify_outcome rule:
 *   - !available                                                              → failure_handled
 *   - available AND qty_available !== null AND qty_available < qty_requested  → failure_handled
 *   - available AND qty_available >= qty_requested                            → false_positive_within_tolerance
 *
 * FP-056 E4 (ACT-312) — htb cache wiring (THE LOAD-BEARING WIRING; without it
 * the MIG-119 record is written but never read, and the re-reject loop is
 * NOT broken):
 *
 *   PRE-FLIGHT CONSULT — when an HtbCacheReader is injected, the verifier
 *   first asks `isMarkedHtb(symbol, ts)`. If true → return a synthesized
 *   `failure_handled` ReconcileResult WITHOUT calling the broker locate
 *   endpoint. This is the loop-break: the morning-snapshot prime is stale
 *   (Alpaca docs — assets table is once-each-morning, intraday borrow
 *   changes don't reflect until next morning), and the MIG-119 record is
 *   the within-day correction over that stale prime.
 *
 *   CLEAR-ON-GENUINE-SUCCESS — when an HtbCacheClearer is injected and the
 *   classified outcome is `false_positive_within_tolerance` (genuine
 *   success, i.e. `available AND qty_available >= qty_requested`), the
 *   verifier DELETEs the row. The PARTIAL case
 *   (`available AND qty_available < qty_requested`) does NOT clear — the
 *   symbol is still constrained; a blanket clear would re-open the loop.
 *
 * The cache injections are optional to preserve backward compatibility
 * with existing call sites that have not yet been migrated to E4 wiring.
 * Production short-flow callers MUST inject both reader + clearer.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerLocateFetcher,
  BrokerLocateResult,
} from '../longshort-broker-interfaces.ts';
import type {
  HtbCacheReader,
  HtbCacheClearer,
} from '../longshort-execution/cache-propagator-io.ts';

interface ShortAvailExpected {
  qty_requested: number;
}

interface ShortAvailDivergence extends Record<string, unknown> {
  available: boolean;
  qty_requested: number;
  qty_available: number | null;
}

export function buildVerifyShortAvailabilitySpec(args: {
  symbol: string;
  operator_id: string;
  qty_requested: number;
}): ReconcileCallSpec<ShortAvailExpected, BrokerLocateResult> {
  return {
    call_name: 'verify_short_availability',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'strong',
    tolerance_class: 'low_tolerance',
    tolerance: { /* low_tolerance: 3 firings in 1h — enforced by state surface, not in classifier */ },

    compute_divergence: (expected, observed): ShortAvailDivergence => {
      return {
        available: observed.available,
        qty_requested: expected.qty_requested,
        qty_available: observed.qty_available,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as ShortAvailDivergence;
      if (!d.available) {
        return 'failure_handled';
      }
      // Per §11.0.7 #4: do NOT substitute long; partial qty also skips.
      if (d.qty_available !== null && d.qty_available < d.qty_requested) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (_ctx) => {
      return {
        action_taken: 'short_entry_skipped_locate_unavailable',
        action_metadata: { symbol: args.symbol, qty_requested: args.qty_requested },
      };
    },
  };
}

export async function verifyShortAvailability(
  args: {
    symbol: string;
    operator_id: string;
    qty_requested: number;
  },
  fetcher: BrokerLocateFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
  cache?: { reader?: HtbCacheReader; clearer?: HtbCacheClearer },
): Promise<ReconcileResult> {
  const spec = buildVerifyShortAvailabilitySpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
    qty_requested: args.qty_requested,
  });

  // PRE-FLIGHT CONSULT — fast-fail when symbol is marked htb (within TTL).
  // Loop-break path: short-circuits the broker locate call by feeding the
  // standard `reconcile()` pipeline a synthesized `unavailable` observation.
  // The pipeline classifies as `failure_handled` and writes the standard
  // reconciliation_events row, preserving the full audit trail. The pre-
  // flight read is gated on `cache?.reader` injection so legacy call sites
  // remain backward-compatible.
  const marked = cache?.reader ? await cache.reader.isMarkedHtb(args.symbol, ts) : false;

  const result = await reconcile(
    spec,
    async (callTs) => {
      if (marked) {
        // Synthesized unavailable observation — broker NOT called. Fields
        // mirror the explicit-unavailable contract of BrokerLocateResult
        // (per §11.0.7 #4: locate absence returns available:false explicitly).
        const synthetic: BrokerLocateResult = {
          symbol: args.symbol,
          available: false,
          locate_id: null,
          qty_available: null,
          fetched_at: callTs,
        };
        return { expected: { qty_requested: args.qty_requested }, observed: synthetic };
      }
      const observed = await fetcher.fetchLocate(args.symbol, callTs);
      return { expected: { qty_requested: args.qty_requested }, observed };
    },
    ts,
    fetcher_source,
  );

  // CLEAR-ON-GENUINE-SUCCESS — fires ONLY on the `false_positive_within_
  // tolerance` outcome (available AND qty_available >= qty_requested).
  // The PARTIAL case classifies as `failure_handled` and intentionally
  // leaves the htb mark in place — partial locates do NOT prove the
  // symbol is fully tradeable, and a blanket clear would re-open the
  // re-reject loop on subsequent ticks at full requested quantity.
  if (cache?.clearer && result.outcome === 'false_positive_within_tolerance') {
    await cache.clearer.clearHtb(args.symbol);
  }

  return result;
}
