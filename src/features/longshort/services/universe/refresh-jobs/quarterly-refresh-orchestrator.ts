/**
 * Quarterly refresh orchestrator — FP-008 sub-step 8.4 / ACT-108.
 *
 * Per CROSSWIND §3.4 + DEC-038.1 clause (4) + AC-08. Stateless transformation
 * with constructor-injected fetchers + persister (testability + replay parity
 * per DEC-035). Atomic R3 semantics: a failure at any pipeline step finalizes
 * the current quarter's universe_refresh_log row with outcome='failed';
 * prior-quarter rows + (future) universe_membership rows are untouched.
 *
 * Pipeline order (BINDING):
 *   1. Polygon constituent fetch (membership)
 *   2. iShares constituent fetch (cross-check snapshot only — Guardrail 2)
 *   3. Polygon enrichment (Polygon-enriched primary path only)
 *   4. applyFilters (§3.2 six filters)
 *   5. applyHardExclusions (§3.3 eight rules)
 *   6. Finalize universe_refresh_log row (sub-step 8.4)
 *      [universe_membership persistence lands at sub-step 8.6 / MIG-050]
 *
 * No reconcile() coupling at this layer (cross-check at 8.8 per
 * DEC-038.1 clause (2)); no clock injection (`as_of` is parameter); no
 * `logAuditEvent` import (DEC-033 v4.1 — audit emission lives in the edge
 * function handler chokepoint).
 *
 * Owner: longshort (FP-008 sub-step 8.4)
 * Classification: financial-critical.
 */
import { applyFilters } from '../filters/apply-filters.ts';
import { applyHardExclusions } from '../hard-exclusions/apply-hard-exclusions.ts';
import { isoDate } from '../shared/trading-days.ts';
import type { EligibleConstituent } from '../hard-exclusions/types.ts';
import type {
  RefreshExecutionContext,
  RefreshResult,
  RefreshOutcome,
} from './types.ts';

const PRIMARY_INDEX = 'sp500' as const;
const SECONDARY_INDEX = 'sp400' as const;

function quarterLabelFor(d: Date): string {
  const m = d.getUTCMonth();
  const q = m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4;
  return `Q${q}_${d.getUTCFullYear()}`;
}

export interface QuarterlyRefreshOrchestrator {
  run(as_of: Date): Promise<RefreshResult>;
}

/**
 * Build an orchestrator bound to the given execution context.
 *
 * `operator_id` is supplied separately so the same orchestrator instance can
 * (in a multi-instance future) be invoked on behalf of any operator. v1 ships
 * with a single default operator UUID wired from the edge-function handler.
 */
export function createQuarterlyRefreshOrchestrator(
  ctx: RefreshExecutionContext,
  operator_id: string,
): QuarterlyRefreshOrchestrator {
  return {
    async run(as_of: Date): Promise<RefreshResult> {
      const startedAt = isoTimestamp(as_of);
      const as_of_date = isoDate(as_of);
      const quarter_label = quarterLabelFor(as_of);

      const { refresh_id } = await ctx.refreshLogPersister.insertStart({
        operator_id,
        refresh_started_at: startedAt,
        as_of_date,
        quarter_label,
      });

      let total_constituents_raw = 0;
      let total_post_filters = 0;
      let total_eligible_long = 0;
      let total_eligible_short = 0;
      let eligible: ReadonlyArray<EligibleConstituent> = [];
      let ishares_cross_check: Awaited<
        ReturnType<typeof ctx.iSharesConstituents.fetchConstituents>
      > = [];
      let outcome: RefreshOutcome = 'completed';
      let failure_reason: string | null = null;

      try {
        // 1. Primary constituent fetch (Polygon S&P 500 + S&P 400).
        const sp500 = await ctx.polygonConstituents.fetchConstituents(PRIMARY_INDEX, as_of);
        const sp400 = await ctx.polygonConstituents.fetchConstituents(SECONDARY_INDEX, as_of);
        if (sp500 === null || sp400 === null) {
          throw new Error('polygon_constituent_fetch_returned_null');
        }
        const primary = [...sp500, ...sp400];
        total_constituents_raw = primary.length;

        // 2. Cross-check membership snapshot (Guardrail 2 — iShares does NOT flow forward).
        const ivv = await ctx.iSharesConstituents.fetchConstituents(PRIMARY_INDEX, as_of);
        const ijh = await ctx.iSharesConstituents.fetchConstituents(SECONDARY_INDEX, as_of);
        ishares_cross_check = [...(ivv ?? []), ...(ijh ?? [])];

        // 3. Polygon enrichment (primary path only).
        const enriched = await ctx.polygonEnrichment.enrich(primary, as_of);

        // 4. §3.2 filters.
        const filtered = applyFilters(enriched, as_of);
        total_post_filters = filtered.kept.length;

        // 5. §3.3 hard-exclusions.
        const hxResult = applyHardExclusions(filtered.kept, ctx.exclusionInput, as_of);
        eligible = hxResult.eligible;
        total_eligible_long = eligible.filter((e) => e.long_eligible).length;
        total_eligible_short = eligible.filter((e) => e.short_eligible).length;
      } catch (err) {
        outcome = 'failed';
        failure_reason = err instanceof Error ? err.message : String(err);
      }

      // 6. Atomic finalize — always emitted, even on failure (R3 mitigation).
      await ctx.refreshLogPersister.finalize(refresh_id, {
        refresh_completed_at: isoTimestamp(as_of),
        total_constituents_raw,
        total_post_filters,
        total_eligible_long,
        total_eligible_short,
        outcome,
        failure_reason,
        ishares_cross_check_snapshot: {
          snapshot_at: startedAt,
          tickers: ishares_cross_check.map((c) => c.symbol),
        },
      });

      return {
        refresh_id,
        as_of_date,
        quarter_label,
        outcome,
        total_constituents_raw,
        total_post_filters,
        total_eligible_long,
        total_eligible_short,
        eligible,
        failure_reason,
        ishares_cross_check: ishares_cross_check ?? [],
      };
    },
  };
}

/**
 * Helper: stable ISO timestamp string from `as_of` Date. Kept local because
 * `shared/trading-days.ts` exposes only date-level helpers (no times).
 */
function isoTimestamp(d: Date): string {
  return d.toISOString();
}

/** Lookup for filter-pipeline output shape — filters expose `kept` array. */
type _FiltersKeptCheck = ReturnType<typeof applyFilters>['kept'];