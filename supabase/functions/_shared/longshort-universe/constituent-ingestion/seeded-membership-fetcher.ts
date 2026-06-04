/**
 * SeededMembershipFetcher — primary constituent source for FP-008.2.
 *
 * Replaces PolygonConstituentFetcher as the primary source for the
 * quarterly refresh. Polygon's reference endpoint sells per-index values
 * but NOT membership on the tier we hold (verified via Task 0 probes);
 * iShares CSVs server-side bot-block; FMP-free truncates; Finnhub-Estimate
 * is forecast-only. The authoritative source is operator-seeded membership
 * (IVV/IJH browser download → ishares_to_sql.py → universe_membership)
 * refreshed manually each quarter. Wikipedia is the automated cross-check
 * (see WikipediaConstituentFetcher).
 *
 * This fetcher reads the LATEST as_of_date in universe_membership for the
 * supplied operator and returns its tickers as UniverseConstituent rows.
 * Because universe_membership has no `index` column (sp500 + sp400 share
 * the table), the fetcher returns ALL tickers on the PRIMARY index call
 * and an empty array on the SECONDARY index call to avoid duplication
 * downstream in the orchestrator's [...sp500, ...sp400] concat.
 *
 * Contract per ConstituentFetcher:
 *   - Throws on DB-read failure (classified as system_bug by reconcile()).
 *   - Returns `null` only when the operator has not seeded any rows yet
 *     (typed-absence per §2 axiom 3); orchestrator throws
 *     'polygon_constituent_fetch_returned_null' which surfaces clearly.
 *   - Returns a non-empty array on success.
 *
 * Owner: longshort (FP-008.2).
 * Classification: financial-critical (primary universe source).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConstituentFetcher,
  IndexId,
  UniverseConstituent,
} from '../../longshort-universe-interfaces.ts';

const PRIMARY_INDEX: IndexId = 'sp500';

export class SeededMembershipFetcher implements ConstituentFetcher {
  constructor(
    private readonly db: SupabaseClient,
    private readonly operator_id: string,
  ) {}

  async fetchConstituents(
    index: IndexId,
    as_of: Date,
  ): Promise<UniverseConstituent[] | null> {
    // Secondary call returns empty — universe_membership doesn't split by
    // index, so all rows are returned on the primary call. Returning [] (not
    // null) signals "no rows for this index" without tripping the
    // orchestrator's null-throw.
    if (index !== PRIMARY_INDEX) return [];

    // Find the latest as_of_date for this operator.
    const { data: latest, error: latestErr } = await this.db
      .from('universe_membership')
      .select('as_of_date')
      .eq('operator_id', this.operator_id)
      .order('as_of_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) {
      throw new Error(
        `seeded_membership_fetch_failed_latest_lookup: ${latestErr.message}`,
      );
    }
    if (!latest) return null;

    // Page through all rows for that as_of_date (S&P 500 + 400 ≈ 900).
    const tickers: string[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await this.db
        .from('universe_membership')
        .select('ticker')
        .eq('operator_id', this.operator_id)
        .eq('as_of_date', latest.as_of_date)
        .order('ticker', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) {
        throw new Error(
          `seeded_membership_fetch_failed_page: ${error.message}`,
        );
      }
      if (!data || data.length === 0) break;
      for (const r of data) tickers.push(r.ticker as string);
      if (data.length < PAGE) break;
    }

    if (tickers.length === 0) return null;

    return tickers.map((t) => ({
      index: PRIMARY_INDEX,
      ticker: t,
      name: t,
      // 'manual' is preserved here at Step D-1; Step C renames the union to
      // include 'operator_seed' and migrates this site in the same commit.
      source: 'manual',
      fetched_at: as_of,
    }));
  }
}