/**
 * Insider transactions (Signal #4) per CROSSWIND §4.4.4.
 *
 * Two pure pieces in one module:
 *
 *   1. `classifyRoleWeight(row)` — deterministic title-heuristic classifier
 *      mapping each Form 4 row to a role weight in {1.0, 0.7, 0.5, 0.4, 0.3}.
 *      Per DEC-044 (Option 4): v1 uses a 3-tier `officer_title` parser as
 *      an NEO proxy because "NEO" is a proxy-statement concept and CANNOT
 *      be identified from Form 4 alone. Every observation carries
 *      `role_tier_source='title_heuristic'` (visible-approximation
 *      discipline). The authoritative DEF-14A upgrade is registered as
 *      DW-093.
 *
 *      Tier rules (highest weight wins on multi-role insiders):
 *        - C-suite / President (CEO / CFO / President matches in title)  → 1.0
 *        - Other named-exec proxy (other "Chief X Officer", EVP, SVP)    → 0.7
 *        - 10%+ owner (and not officer/director)                         → 0.5
 *        - Generic Section-16 officer (is_officer=true, no title match)  → 0.4
 *        - Independent director (is_director=true, is_officer=false)     → 0.3
 *        - Otherwise (e.g. not_subject_to_section_16=true, no flags)     → null
 *          (skip the row; no spec tier applies)
 *
 *   2. `computeInsiderSignal(rows, as_of, market_cap)` — applies the
 *      §4.4.4 filter, sums the weighted-decayed signed dollar flow, and
 *      divides by market_cap. Returns `null` when no qualifying
 *      transactions remain after filtering (typed-absence → orchestrator
 *      `no_qualifying_transactions` skip → `is_present=0`).
 *
 * Spec-literal formula:
 *
 *   raw_signal = Σ_qualifying( shares × price × sign × role_weight × exp(-age/14) ) / market_cap
 *
 *   age_days  = (as_of − transaction_date) in days  (NEVER negative)
 *   sign      = +1 for 'A' (acquired/purchase, bullish)
 *             = −1 for 'D' (disposed/sale,    bearish)
 *
 * Filter (load-bearing per §4.4.4):
 *   - Drop `record_type !== 'transaction'` (e.g. holding-only rows).
 *   - Keep `transaction_code === 'P'`           (open-market purchases — ALL).
 *   - Keep `transaction_code === 'S' && aff_10b5_one === false`
 *     (discretionary sales only; EXCLUDE 10b5-1 planned sales).
 *   - Drop everything else (M/C option exercises, A grants, G gifts, etc.).
 *
 * Wall-clock discipline (DEC-034 clause 4): all time arithmetic uses the
 * injected `as_of: Date` parameter. NO `Date.now()` / `new Date()` here.
 *
 * Pure: no I/O, no clock, no randomness. Deterministic for replay.
 *
 * Owner: longshort (FP-042 — Signal #4 / Phase 2.4)
 */

import type { Form4Row } from '../shared/polygon-form4-fetcher.ts';

const DECAY_HALF_LIFE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Tag persisted with each observation (and on intermediate rows) so the
 *  conscious approximation that "NEO" is title-derived (not DEF-14A
 *  authoritative) is visible downstream per §2 axiom 4. */
export const ROLE_TIER_SOURCE = 'title_heuristic' as const;
export type RoleTierSource = typeof ROLE_TIER_SOURCE;

export interface ClassifiedRow {
  row: Form4Row;
  role_weight: number;            // 1.0 / 0.7 / 0.5 / 0.4 / 0.3
  role_tier_source: RoleTierSource;
}

/**
 * Deterministic title-heuristic classifier. Returns `null` when no spec
 * tier applies (the row is then dropped from the sum — orchestrator
 * surfaces it as a typed-absence per-ticker contribution, not a fabricated
 * zero).
 *
 * Multi-role tie-break: returns the HIGHEST applicable weight (a CEO who
 * also holds 12 % is a 1.0, not a 0.5).
 */
export function classifyRoleWeight(row: Form4Row): number | null {
  const title = row.officer_title ?? '';
  // Tier 1: C-suite/President (the §4.4.4 1.0 tier). CEO/CFO are spec-named;
  // President is grouped here because the live-probe fixture "CEO AND
  // PRESIDENT" is a compound title and treating "President" as the lower
  // 0.7 tier would force a deflation of the spec-named CEO match. Word-
  // boundary regex so "CEO" matches inside compound titles like
  // "CEO AND PRESIDENT" but not inside random substrings.
  // `(?<!vice\s)\bpresident\b` keeps "President" / "Chief Executive
  // Officer and President" at tier 1 but PREVENTS "Vice President" /
  // "Executive Vice President" / "Senior Vice President" from accidentally
  // matching here (those belong at tier 2 NEO-proxy 0.7, not at tier 1
  // C-suite 1.0). Lookbehind catches both `vice president` and
  // `vice\u00a0president` (literal nbsp); we normalize via \s.
  const tier1 =
    /\bceo\b|\bcfo\b|chief executive officer|chief financial officer|(?<!vice\s)\bpresident\b/i.test(title);
  if (tier1) return 1.0;

  // Tier 2: named-exec proxy (the §4.4.4 0.7 NEO tier, approximated).
  // Other "Chief X Officer" titles (COO/CTO/CMO/CIO/...) + EVP/SVP. Per
  // DEC-044 these are NEO PROXIES — the authoritative source is DEF-14A
  // (DW-093). The role_tier_source tag persisted with the observation
  // makes the approximation visible.
  const tier2 = /chief\s+[a-z]+\s+officer|\bevp\b|\bsvp\b|executive vice president|senior vice president/i
    .test(title);
  if (tier2) return 0.7;

  // Tier 3 — boolean-only roles. Highest-applicable-weight tie-break:
  //   - 10%+ owner who is not also an officer/director → 0.5
  //   - Section-16 officer (no title match) → 0.4
  //   - Independent director (director, not officer) → 0.3
  // Order matters because an officer-AND-director resolves to officer 0.4
  // (higher than 0.3); an officer-AND-10%-owner resolves to officer 0.4
  // (we treat 0.5 as restricted to "pure" >10% holders — institutional
  // shareholders, not insiders). This is the conservative read of the
  // spec; alternative tie-breaks should be a DEC, not a silent change.
  if (row.is_officer === true) return 0.4;
  if (row.is_ten_percent_owner === true) return 0.5;
  if (row.is_director === true) return 0.3;

  return null;
}

/**
 * §4.4.4 filter. Returns rows that survive the include/exclude rules.
 * Pure.
 */
export function filterQualifyingTransactions(rows: ReadonlyArray<Form4Row>): Form4Row[] {
  const out: Form4Row[] = [];
  for (const r of rows) {
    // FIRST gate: drop holding-only rows (the endpoint returns BOTH).
    if (r.record_type !== 'transaction') continue;
    // Hard-required fields. Without these the row cannot contribute.
    if (
      typeof r.transaction_code !== 'string' ||
      typeof r.transaction_shares !== 'number' ||
      typeof r.transaction_price_per_share !== 'number' ||
      typeof r.transaction_date !== 'string' ||
      (r.transaction_acquired_disposed !== 'A' && r.transaction_acquired_disposed !== 'D')
    ) {
      continue;
    }
    // Code filter. P: all purchases included. S: discretionary only
    // (aff_10b5_one === false — strict equality; missing flag means we
    // cannot prove it was discretionary, so we EXCLUDE conservatively).
    if (r.transaction_code === 'P') {
      out.push(r);
      continue;
    }
    if (r.transaction_code === 'S' && r.aff_10b5_one === false) {
      out.push(r);
      continue;
    }
    // Everything else (S w/ 10b5-1=true, M, C, A, G, ...) drops.
  }
  return out;
}

function ageDays(transaction_date: string, as_of: Date): number {
  // Parse as UTC midnight. Polygon emits ISO YYYY-MM-DD; using `new
  // Date('YYYY-MM-DD')` yields a UTC-midnight Date in V8/Deno per spec.
  const txMs = Date.parse(`${transaction_date}T00:00:00Z`);
  if (!Number.isFinite(txMs)) return Number.POSITIVE_INFINITY;
  const ageMs = as_of.getTime() - txMs;
  // Clamp negative age to 0 — defensive against future-dated rows (the
  // 90-day window upstream should already exclude them, but a future date
  // here must NOT inflate the decay factor above 1).
  return ageMs > 0 ? ageMs / MS_PER_DAY : 0;
}

export interface InsiderSignalResult {
  raw_signal: number;
  qualifying_count: number;
  role_tier_source: RoleTierSource;
}

/**
 * Compute §4.4.4 weighted-decay sum / market_cap.
 *
 * Returns `null` when:
 *   - market_cap is not a positive finite number (divide-by-zero guard);
 *     OR
 *   - the filter yields zero qualifying transactions OR every qualifying
 *     transaction has no classifiable role
 *     (typed-absence → orchestrator `no_qualifying_transactions` skip).
 *
 * Caller MUST be the orchestrator's market_cap branch (the orchestrator
 * pre-validates market_cap and emits the appropriate skip reason; the
 * `null` returned here for a zero/negative market_cap is a defensive
 * second guard, not the primary surface).
 */
export function computeInsiderSignal(
  rows: ReadonlyArray<Form4Row>,
  as_of: Date,
  market_cap: number,
): InsiderSignalResult | null {
  if (!Number.isFinite(market_cap) || market_cap <= 0) return null;

  const qualifying = filterQualifyingTransactions(rows);
  if (qualifying.length === 0) return null;

  let sum = 0;
  let counted = 0;
  for (const r of qualifying) {
    const weight = classifyRoleWeight(r);
    if (weight === null) continue;
    const sign = r.transaction_acquired_disposed === 'A' ? 1 : -1;
    const age = ageDays(r.transaction_date!, as_of);
    if (!Number.isFinite(age)) continue;
    const decay = Math.exp(-age / DECAY_HALF_LIFE_DAYS);
    const dollars = (r.transaction_shares ?? 0) * (r.transaction_price_per_share ?? 0);
    if (!Number.isFinite(dollars) || dollars === 0) continue;
    sum += dollars * sign * weight * decay;
    counted++;
  }

  if (counted === 0) return null;

  const raw_signal = sum / market_cap;
  if (!Number.isFinite(raw_signal)) return null;

  return {
    raw_signal,
    qualifying_count: counted,
    role_tier_source: ROLE_TIER_SOURCE,
  };
}