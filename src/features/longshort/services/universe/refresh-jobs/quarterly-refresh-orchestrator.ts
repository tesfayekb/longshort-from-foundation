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
 *   2. iShares constituent fetch (cross-check signal — Guardrail 2)
 *   2b. Cross-check (reconcile() invocation; failure_escalated/system_bug
 *       aborts pipeline) [FP-008 sub-step 8.8 / ACT-114 — Surface 4 Option a
 *       OUTSIDE persistence, BEFORE enrichment, for early-abort efficiency;
 *       Surface 5 Option q conditional abort on failure_escalated/system_bug]
 *   3. Polygon enrichment (Polygon-enriched primary path only)
 *   4. applyFilters (§3.2 six filters)
 *   5. applyHardExclusions (§3.3 eight rules)
 *   6. Persistence transaction (universe_membership INSERT + hard_exclusions
 *      UPSERT + refresh_log finalize) [FP-008 sub-step 8.7 / ACT-113]
 *   7. Health metrics emission (filter_rejection_counts + hard_exclusion_counts
 *      jsonb UPDATE on universe_refresh_log) [FP-008 sub-step 8.9 / ACT-115;
 *      emitted only on outcome='completed'; emitter errors logged but do NOT
 *      fail the refresh — emission is observability, not correctness]
 *
 * No clock injection (`as_of` is parameter); no `logAuditEvent` import
 * (DEC-033 v4.1 — audit emission lives in the edge function handler
 * chokepoint). Cross-check invocation per DEC-038.1 clause (2) flows through
 * `ctx.crossCheck` (edge function wires `buildUniverseCrossCheckSpec` +
 * `reconcile()`); universe-component does NOT directly write
 * `reconciliation_events` rows per AC-18.
 *
 * Owner: longshort (FP-008 sub-step 8.4)
 * Classification: financial-critical.
 */
import { applyFilters } from '../filters/apply-filters.ts';
import { applyHardExclusions } from '../hard-exclusions/apply-hard-exclusions.ts';
import { isoDate } from '../shared/trading-days.ts';
import type { EligibleConstituent, HardExclusionFiring } from '../hard-exclusions/types.ts';
import type { FilterRejectionReason } from '../filters/types.ts';
import type { HardExclusionReason } from '../hard-exclusions/types.ts';
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
      let firings: ReadonlyArray<HardExclusionFiring> = [];
      let filter_rejection_reasons: ReadonlyArray<FilterRejectionReason> = [];
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

        // 2b. Cross-check invocation per DEC-038.1 clause (2) + AC-17 + AC-18 —
        // FP-008 sub-step 8.8 / ACT-114 (Surface 4 Option a: OUTSIDE
        // persistence, BEFORE enrichment, for early-abort efficiency;
        // Surface 5 Option q: abort on failure_escalated/system_bug to
        // preserve prior-quarter intactness per DEC-038 clause (3)).
        const cross = await ctx.crossCheck({
          operator_id,
          polygon_tickers: primary.map((c) => c.ticker),
          ishares_tickers: ishares_cross_check.map((c) => c.ticker),
          as_of,
        });
        if (cross.outcome === 'failure_escalated' || cross.outcome === 'system_bug') {
          throw new Error(
            cross.outcome === 'system_bug'
              ? 'cross_check_system_bug'
              : 'cross_check_failure_escalated',
          );
        }

        // 3. Polygon enrichment (primary path only).
        const enriched = await ctx.polygonEnrichment.enrich(primary, as_of);

        // 4. §3.2 filters.
        const filtered = applyFilters(enriched, as_of);
        total_post_filters = filtered.eligible.length;
        filter_rejection_reasons = filtered.rejected.map((r) => r.reason);

        // 5. §3.3 hard-exclusions.
        const hxResult = applyHardExclusions(filtered.eligible, ctx.exclusionInput, as_of);
        eligible = hxResult.eligible;
        firings = hxResult.firings;
        total_eligible_long = eligible.filter((e) => e.long_eligible).length;
        total_eligible_short = eligible.filter((e) => e.short_eligible).length;

        // Surface 5 Option q — two-phase persistence: pipeline transformation
        // completed without throwing; now persist eligible universe + hard-
        // exclusion firings. Any persistence failure rolls into the catch
        // block below, finalizing the refresh-log row with outcome='failed'
        // and preserving prior-quarter intactness per DEC-038 clause (3).
        await ctx.universeMembershipPersister.persist({
          operator_id,
          as_of_date,
          quarter_label,
          refresh_id,
          rows: eligible.map((e) => ({
            ticker: e.ticker,
            long_eligible: e.long_eligible,
            short_eligible: e.short_eligible,
          })),
        });

        // Surface 4 Option c — group multi-rule firings into one row per
        // (ticker, as_of_date) with firing_rules array per MIG-051 PK.
        const exclusionRows = groupFiringsByTicker(firings);
        if (exclusionRows.length > 0) {
          await ctx.hardExclusionsPersister.persist({
            operator_id,
            as_of_date,
            refresh_id,
            rows: exclusionRows,
          });
        }
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
          tickers: (ishares_cross_check ?? []).map((c) => c.ticker),
        },
      });

      // 7. Health metrics emission — FP-008 sub-step 8.9 / ACT-115.
      // Surface 3 Option ii point-in-time-snapshot: emit ONLY on outcome='completed'.
      // Failed/aborted refreshes produce no canonical metric snapshot
      // (refresh-log.outcome='failed' is the dashboard signal). Emitter errors are
      // observability defects, not correctness defects — orchestrator logs and
      // continues so a metric-emission failure does not flip a successful refresh
      // to outcome='failed'.
      if (ctx.metricsEmitter !== undefined && outcome === 'completed') {
        try {
          await ctx.metricsEmitter.emitRefreshMetrics({
            refresh_id,
            filter_rejection_reasons,
            hard_exclusion_reasons: firings.map((f) => f.reason),
          });
        } catch (emitErr) {
          // eslint-disable-next-line no-console
          console.warn(
            `quarterly-refresh-orchestrator: metrics emission failed for refresh_id ${refresh_id}: ${emitErr instanceof Error ? emitErr.message : String(emitErr)}`,
          );
        }
      }

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

/**
 * Surface 4 Option c — caller-side per-ticker grouping of HardExclusionFiring
 * entries into the MIG-051 one-row-per-(ticker, as_of_date) shape with
 * firing_rules text[] array. Reason code → §3.3 rule key mapping mirrors the
 * HardExclusionReason union enumerated in hard-exclusions/types.ts.
 */
function groupFiringsByTicker(
  firings: ReadonlyArray<HardExclusionFiring>,
): Array<{
  ticker: string;
  firing_rules: ReadonlyArray<string>;
  firing_reasons: Record<string, unknown>;
}> {
  const map = new Map<string, { rules: string[]; reasons: Record<string, unknown> }>();
  for (const f of firings) {
    const ticker = f.constituent.ticker;
    const rule = reasonToRuleKey(f.reason);
    const entry = map.get(ticker) ?? { rules: [], reasons: {} };
    if (!entry.rules.includes(rule)) entry.rules.push(rule);
    entry.reasons[rule] = {
      reason: f.reason,
      applies_to: f.applies_to,
      evidence: f.evidence,
    };
    map.set(ticker, entry);
  }
  return Array.from(map.entries()).map(([ticker, v]) => ({
    ticker,
    firing_rules: v.rules,
    firing_reasons: v.reasons,
  }));
}

function reasonToRuleKey(reason: HardExclusionFiring['reason']): string {
  switch (reason) {
    case 'earnings_window': return '3.3a';
    case 'ma_target':
    case 'ma_large_acquirer': return '3.3b';
    case 'halted_5d_lookback': return '3.3c';
    case 'htb_no_locate':
    case 'htb_borrow_rate_excessive': return '3.3d';
    case 'short_interest_excessive': return '3.3e';
  }
}
