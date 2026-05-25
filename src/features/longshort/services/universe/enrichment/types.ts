/**
 * Universe enrichment tier per DEC-038.1 clause (1) folder-pattern accommodation
 * (enrichment/ extends the enumerated sub-modules under universe-component;
 * no DEC amendment per ACT-106 Guardrail 1).
 *
 * EnrichedConstituent provides the §3.2-filter-input data layer:
 * daily volume + share price + market cap + listing date + asset class.
 * Source: Polygon (primary path only per ACT-106 Guardrail 2; iShares stays
 * unenriched — secondary path is a membership cross-check at sub-step 8.8,
 * not a filter input).
 *
 * Owner: longshort (FP-008 sub-step 8.2)
 * Classification: financial-critical (enrichment provides §3.2 filter inputs;
 * AC-06 path).
 */
import type { UniverseConstituent } from '../../../../../../supabase/functions/_shared/longshort-universe-interfaces.ts';

/**
 * Constituent enriched with §3.2 filter-input fields.
 *
 * All numeric fields use the repo-native `number` idiom — `Decimal` is NOT
 * used anywhere in this repo per v0.6.2 §22.3 (b) idiom-grep; thresholds
 * ($20M / $1B / $5 / 365 days) are well under `Number.MAX_SAFE_INTEGER`.
 *
 * `null` semantics per §2 axiom 3 + DEC-038 clause (6): `null` means the
 * upstream source explicitly reports no data for that field (e.g., Polygon
 * returns no `market_cap` for a legacy security). Network / auth / parse
 * failures throw `ConstituentFetchError` — they do NOT degrade to `null`.
 *
 * The §3.2 filter pipeline at `../filters/apply-filters.ts` treats `null`
 * filter-input data as a `missing_filter_input_data` rejection reason —
 * NOT a silent default to zero.
 */
export interface EnrichedConstituent extends UniverseConstituent {
  /** 60-day average daily dollar volume (mean of close × volume over the last 60 trading days). `null` if Polygon reports fewer than 60 trading-day aggregates. */
  avg_daily_dollar_volume: number | null;
  /** Most recent close price in USD. `null` if no closing print is available. */
  share_price: number | null;
  /** Market capitalization in USD as reported by Polygon ticker-details. `null` if Polygon omits the `market_cap` field. */
  market_cap: number | null;
  /** Listing date as ISO date string (YYYY-MM-DD) from Polygon `list_date`. `null` if Polygon omits the field. Used by the listing-age filter (`as_of - listing_date >= 365 days`). */
  listing_date: string | null;
  /** True if Polygon classifies the security as an ADR per the ticker-details `type` field (ADRC / ADRP / ADRR / ADRW). */
  is_adr: boolean;
  /** True if Polygon classifies the security as a REIT per the ticker-details `sic_description` (or related industry classification). */
  is_reit: boolean;
}

/**
 * Enrichment fetcher contract. Takes a membership list (UniverseConstituent[])
 * → security-properties list (EnrichedConstituent[]). One Polygon
 * ticker-details call + one daily-aggregates call per ticker.
 *
 * No `reconcile()` coupling at this layer per v0.6.2 §22.3 (c) minimum-coupling
 * — cross-check execution lands at sub-step 8.8 via DEC-038.1 clause (2).
 * No DB writes — persistence lands at sub-step 8.6.
 * No clock injection — `as_of: Date` is a parameter; callers obtain it from
 * the injected Clock at the quarterly-refresh-job entry point (sub-step 8.4).
 */
export interface UniverseEnrichmentFetcher {
  enrich(constituents: UniverseConstituent[], as_of: Date): Promise<EnrichedConstituent[]>;
}