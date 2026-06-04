/**
 * longshort-universe-enrich-and-filter — bootstrap-class enrichment + §3.2
 * filter pass over the latest `universe_membership` snapshot.
 *
 * Bridges manually-seeded universe rows (source='manual', FP-008 manual seed)
 * into the §3.2 filtered eligibility state the signal stack will consume in
 * FP-009. Reads the latest as_of_date from `universe_membership`, enriches
 * via Polygon, applies §3.2 LOCKED filters, writes a new
 * `universe_refresh_log` row with outcome + filter_rejection_counts, and
 * UPDATEs `universe_membership.long_eligible` / `short_eligible` per filter
 * outcome.
 *
 * Cron-secret auth (system path). DEC-023 envelope (createHandler).
 * Wall-clock via productionClock per FP-013.
 *
 * Out of scope: new tables, new schedule, orchestrator changes, UI.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { PolygonEnrichmentFetcher } from '../_shared/longshort-universe/enrichment/polygon-enrichment-fetcher.ts';
import { applyFilters } from '../_shared/longshort-universe/filters/apply-filters.ts';
import { writeEligibilityCoverage } from '../_shared/longshort-universe/get-eligibility.ts';
import type { UniverseConstituent } from '../_shared/longshort-universe-interfaces.ts';
import type {
  EnrichedConstituent,
  EnrichmentSkipReason,
} from '../_shared/longshort-universe/enrichment/types.ts';
import type { FilterRejectionReason } from '../_shared/longshort-universe/filters/types.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// Wall-clock budget for one invocation. Edge functions hard-cap at ~150s; we
// leave headroom for persistence + audit on the way out.
const WALL_CLOCK_BUDGET_MS = 135_000;

// Concurrency cap for the Polygon enrichment fan-out. 903 tickers × 2 requests
// at 20-way concurrency and ~250ms/request ≈ 22s sequential-equivalent budget.
const ENRICHMENT_CONCURRENCY = 20;

/**
 * Native async limiter — bounded-parallelism map over `items`. Preserves
 * input order in the result array. No external dependencies.
 */
async function pLimitedMap<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}

Deno.serve(createHandler(async (req: Request) => {
  const as_of = productionClock.getWallClockTs();
  const startMs = as_of.getTime();
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  // Step 1 — find the latest as_of_date in universe_membership.
  const { data: latestRow, error: latestErr } = await supabaseAdmin
    .from('universe_membership')
    .select('as_of_date, quarter_label')
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    return apiError(500, `universe_membership_read_failed: ${latestErr.message}`, {
      correlationId,
    });
  }

  if (!latestRow) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.universe.enrich_and_filter.skipped',
      correlationId,
      metadata: { reason: 'no_universe_to_filter', as_of: as_of.toISOString() },
    });
    return apiSuccess({
      outcome: 'skipped',
      skip_reason: 'no_universe_to_filter',
      as_of: as_of.toISOString(),
    });
  }

  const asOfDate: string = latestRow.as_of_date;
  const quarterLabel: string = latestRow.quarter_label;

  // Step 2 — read all tickers for that as_of_date. Page through to defeat the
  // PostgREST 1000-row default cap (S&P 500 + 400 ≈ 900 rows).
  const allMembership: Array<{ ticker: string }> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('universe_membership')
      .select('ticker')
      .eq('as_of_date', asOfDate)
      .order('ticker', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      return apiError(500, `universe_membership_page_failed: ${error.message}`, {
        correlationId,
      });
    }
    if (!data || data.length === 0) break;
    allMembership.push(...data);
    if (data.length < PAGE) break;
  }

  if (allMembership.length === 0) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.universe.enrich_and_filter.skipped',
      correlationId,
      metadata: {
        reason: 'no_tickers_for_latest_as_of_date',
        as_of_date: asOfDate,
      },
    });
    return apiSuccess({
      outcome: 'skipped',
      skip_reason: 'no_tickers_for_latest_as_of_date',
      as_of_date: asOfDate,
    });
  }

  const constituents: UniverseConstituent[] = allMembership.map((r) => ({
    // We don't store index on universe_membership; default to sp500 for the
    // enrichment call (the fetcher does not branch on index, and §3.2 filters
    // are index-agnostic — index is a labelling concern handled at ingest).
    index: 'sp500',
    ticker: r.ticker,
    name: r.ticker,
    source: 'manual',
    fetched_at: as_of,
  }));

  const fetcher = new PolygonEnrichmentFetcher(polygonApiKey);

  // Step 3 — bounded-concurrency enrichment with a defensive wall-clock cutoff.
  // Enrich one ticker at a time inside each worker; if the budget is blown
  // mid-fan-out, return outcome='partial' with processed/remaining counts so
  // a follow-up call can resume on the same as_of_date.
  //
  // FP-008.4 #23 — per-ticker enrichment failure attribution. The fetcher
  // returns { enriched, skipped } with two structural skip reasons; the
  // caller adds a third (`'fetch_error'`) for any thrown ConstituentFetchError
  // (HTTP non-404 / parse / timeout / network — INC-24 per-ticker context
  // now captured structurally, not only in console.warn). Aggregate counts
  // persist to universe_refresh_log.enrichment_skip_counts (MIG-061),
  // parallel to filter_rejection_counts.
  type EnrichSkipReason = EnrichmentSkipReason | 'fetch_error';
  type EnrichOutcome =
    | { kind: 'ok'; row: EnrichedConstituent }
    | { kind: 'skipped'; skips: Array<{ ticker: string; reason: EnrichSkipReason }> }
    | { kind: 'timed_out' };

  let timedOut = false;
  let processed = 0;

  const settled = await pLimitedMap(constituents, ENRICHMENT_CONCURRENCY, async (c): Promise<EnrichOutcome> => {
    if (timedOut || productionClock.getWallClockTs().getTime() - startMs > WALL_CLOCK_BUDGET_MS) {
      timedOut = true;
      return { kind: 'timed_out' };
    }
    try {
      const { enriched: enrichedOne, skipped: structuralSkips } = await fetcher.enrich([c], as_of);
      processed += 1;
      if (enrichedOne.length === 0) {
        // Fetcher dropped this ticker structurally; carry reason+ticker.
        return {
          kind: 'skipped',
          skips: structuralSkips.map((s) => ({ ticker: s.ticker, reason: s.reason })),
        };
      }
      return { kind: 'ok', row: enrichedOne[0] };
    } catch (e) {
      // Per-ticker fetch failure shouldn't sink the batch; treat as skipped.
      // The §3.2 filter pipeline naturally rejects missing-input rows. The
      // INC-24 per-ticker context (ConstituentFetchError message) is now
      // captured structurally as a `fetch_error` skip-attribution entry,
      // not only in console.warn. console.warn preserved for runtime
      // debuggability; structured attribution is the new primary record.
      processed += 1;
      console.warn(`enrich_ticker_failed ticker=${c.ticker} err=${(e as Error).message}`);
      return {
        kind: 'skipped',
        skips: [{ ticker: c.ticker, reason: 'fetch_error' }],
      };
    }
  });

  const enriched: EnrichedConstituent[] = [];
  // Aggregate enrichment-skip attribution by reason. Tracked-zero is distinct
  // from untracked-NULL (MIG-061 comment): this refresh tracked enrichment
  // skips, so all three reasons appear with explicit 0s when they didn't fire.
  const enrichmentSkipCounts: Record<EnrichSkipReason, number> = {
    not_in_polygon_404: 0,
    fetch_error: 0,
    ishares_source: 0,
  };
  for (const s of settled) {
    if (s.kind === 'ok') {
      enriched.push(s.row);
    } else if (s.kind === 'skipped') {
      for (const skip of s.skips) {
        enrichmentSkipCounts[skip.reason] += 1;
      }
    }
  }

  // Step 4 — §3.2 LOCKED filter pipeline.
  const filterResult = applyFilters(enriched, as_of);

  const rejectionCounts: Record<FilterRejectionReason, number> = {
    missing_filter_input_data: 0,
    below_min_avg_daily_dollar_volume: 0,
    below_min_share_price: 0,
    below_min_market_cap: 0,
    below_min_listing_age: 0,
    adr_excluded: 0,
    reit_excluded: 0,
  };
  for (const r of filterResult.rejected) rejectionCounts[r.reason] += 1;

  const eligibleTickers = new Set(filterResult.eligible.map((c) => c.ticker));

  // Step 5 — persistence. Per MIG-050 CHECK (long_eligible OR short_eligible)
  // and the universe-membership-persister design (ACT-113): ineligible rows
  // do NOT exist in universe_membership. So we DELETE filtered-out tickers
  // for this as_of_date; eligible rows are already long=short=true from the
  // FP-008 manual seed and stay as-is.
  //
  // On a `partial` outcome we DELETE only the ineligibles we actually
  // evaluated; remaining (unprocessed) rows stay untouched so a follow-up
  // invocation can resume. Tickers we processed but couldn't enrich (Polygon
  // 404 / per-ticker fetch fail) are NOT deleted — they remain in the
  // candidate set for a future enrichment retry rather than being
  // permanently dropped on a transient failure.
  const eligibleArr = Array.from(eligibleTickers);
  const enrichedTickers = new Set(enriched.map((c) => c.ticker));
  const ineligibleArr = enriched
    .map((c) => c.ticker)
    .filter((t) => !eligibleTickers.has(t));

  async function deleteIneligible(tickers: string[]) {
    if (tickers.length === 0) return;
    const BATCH = 500;
    for (let i = 0; i < tickers.length; i += BATCH) {
      const slice = tickers.slice(i, i + BATCH);
      const { error } = await supabaseAdmin
        .from('universe_membership')
        .delete()
        .eq('as_of_date', asOfDate)
        .in('ticker', slice);
      if (error) throw new Error(`universe_membership_delete_failed: ${error.message}`);
    }
  }

  try {
    await deleteIneligible(ineligibleArr);
  } catch (e) {
    return apiError(500, `universe_membership_delete_failed: ${(e as Error).message}`, {
      correlationId,
    });
  }

  const outcome: 'completed' | 'partial' = timedOut ? 'partial' : 'completed';
  const completedAt = productionClock.getWallClockTs();

  const { error: logErr } = await supabaseAdmin
    .from('universe_refresh_log')
    .insert({
      operator_id: DEFAULT_OPERATOR_ID,
      refresh_started_at: as_of.toISOString(),
      refresh_completed_at: completedAt.toISOString(),
      as_of_date: asOfDate,
      quarter_label: quarterLabel,
      total_constituents_raw: constituents.length,
      total_post_filters: filterResult.eligible.length,
      total_eligible_long: eligibleArr.length,
      total_eligible_short: eligibleArr.length,
      outcome,
      failure_reason: timedOut
        ? `wall_clock_budget_exceeded: processed=${processed} remaining=${constituents.length - processed}`
        : null,
      filter_rejection_counts: rejectionCounts,
      enrichment_skip_counts: enrichmentSkipCounts,
    });

  if (logErr) {
    return apiError(500, `universe_refresh_log_insert_failed: ${logErr.message}`, {
      correlationId,
    });
  }

  // Step 5.5 — eligibility-caveat coverage write (FP-008.4 Commit 2 / MIG-055).
  // Decoupled idempotent write: failure does NOT roll back the refresh_log
  // insert above. Fail-safe semantics — assert_eligibility_complete returns
  // false for this (operator_id, as_of_date) until a corrective re-run, which
  // is exactly what downstream getEligibility() consumers must see when
  // coverage is unknown. Today: only §3.3d (HTB) is wired; §3.3a/b/c/e are
  // feed-deferred-placeholders per DW-063 + §3.3 v1 disposition.
  let coverageComplete = false;
  let coverageWriteError: string | null = null;
  try {
    const res = await writeEligibilityCoverage(DEFAULT_OPERATOR_ID, asOfDate, {
      covers_3_3a: false,
      covers_3_3b: false,
      covers_3_3c: false,
      covers_3_3d: true,
      covers_3_3e: false,
    });
    coverageComplete = res.complete;
  } catch (e) {
    coverageWriteError = (e as Error).message;
    console.warn(
      `universe_eligibility_coverage_write_failed as_of_date=${asOfDate} err=${coverageWriteError}`,
    );
  }

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.universe.enrich_and_filter.completed',
    correlationId,
    metadata: {
      outcome,
      as_of_date: asOfDate,
      total_constituents_raw: constituents.length,
      total_enriched: enriched.length,
      total_eligible: eligibleArr.length,
      total_deleted_ineligible: ineligibleArr.length,
      total_unenrichable: processed - enrichedTickers.size,
      filter_rejection_counts: rejectionCounts,
      enrichment_skip_counts: enrichmentSkipCounts,
      tickers_processed: processed,
      tickers_remaining: timedOut ? constituents.length - processed : 0,
      wall_clock_ms: productionClock.getWallClockTs().getTime() - startMs,
      eligibility_coverage_complete: coverageComplete,
      eligibility_coverage_write_error: coverageWriteError,
    },
  });

  return apiSuccess({
    outcome,
    as_of_date: asOfDate,
    total_constituents_raw: constituents.length,
    total_enriched: enriched.length,
    total_eligible: eligibleArr.length,
    total_deleted_ineligible: ineligibleArr.length,
    total_unenrichable: processed - enrichedTickers.size,
    filter_rejection_counts: rejectionCounts,
    enrichment_skip_counts: enrichmentSkipCounts,
    tickers_processed: processed,
    tickers_remaining: timedOut ? constituents.length - processed : 0,
    wall_clock_ms: productionClock.getWallClockTs().getTime() - startMs,
    correlation_id: correlationId,
    eligibility_coverage_complete: coverageComplete,
    eligibility_coverage_write_error: coverageWriteError,
  });
}));