/**
 * getEligibility — eligibility-caveat enforcement wrapper.
 *
 * FP-008.4 Commit 2 — TS-layer enforcement of the §3.3 sub-rule coverage
 * contract. The ONLY sanctioned read path for `universe_membership.long_eligible`
 * / `short_eligible` for downstream consumers (signal stack, sizing, execution
 * — Phase 2+).
 *
 * Contract:
 *   1. Call `assert_eligibility_complete(operator_id, as_of_date)` RPC first.
 *   2. If false → throw `EligibilityIncompleteError` (downstream MUST NOT trade).
 *   3. If true → return eligibility rows from `universe_membership`.
 *
 * The Gate 12 banned-pattern check (`scripts/check-eligibility-bypass.ts`)
 * forbids direct `.long_eligible` / `.short_eligible` property access outside
 * a sanctioned allowlist (this file + the producer/persister/verifier files
 * that are upstream of the wrapper). New Phase 2+ consumers MUST route through
 * `getEligibility()`.
 *
 * Owner: longshort (FP-008.4 Commit 2)
 * Classification: financial-critical (gates entry decisions on coverage state).
 * Fail behavior: fail-fast — throws on incomplete coverage; never silently
 *                returns a partial / unverified eligibility set.
 */
import { supabaseAdmin } from '../supabase-admin.ts';

export class EligibilityIncompleteError extends Error {
  readonly operator_id: string;
  readonly as_of_date: string;
  constructor(operator_id: string, as_of_date: string) {
    super(
      `EligibilityIncompleteError: universe_eligibility_coverage not complete for ` +
        `operator_id=${operator_id} as_of_date=${as_of_date}. Downstream consumers ` +
        `must not treat eligibility as fully §3.3-screened until every sub-rule is wired. ` +
        `See Phase 1 closure addendum eligibility-caveat section + MIG-055.`,
    );
    this.name = 'EligibilityIncompleteError';
    this.operator_id = operator_id;
    this.as_of_date = as_of_date;
  }
}

export interface EligibilityRow {
  readonly ticker: string;
  readonly long_eligible: boolean;
  readonly short_eligible: boolean;
}

export interface EligibilityResult {
  readonly operator_id: string;
  readonly as_of_date: string;
  readonly rows: ReadonlyArray<EligibilityRow>;
}

export interface GetEligibilityParams {
  readonly operator_id: string;
  readonly as_of_date: string; // ISO date 'YYYY-MM-DD'
  readonly side?: 'long' | 'short' | 'both';
}

/**
 * Fetch eligibility for (operator_id, as_of_date), gated on
 * assert_eligibility_complete. Returns all eligible tickers (per side filter)
 * for that as_of_date, or throws if coverage is incomplete.
 *
 * Page-safe: pages through 1000-row PostgREST default cap to defeat universe
 * sizes of 900+ rows (S&P 500 + 400).
 */
export async function getEligibility(
  params: GetEligibilityParams,
): Promise<EligibilityResult> {
  const { operator_id, as_of_date } = params;
  const side = params.side ?? 'both';

  const { data: completeData, error: completeErr } = await supabaseAdmin.rpc(
    'assert_eligibility_complete',
    { _operator_id: operator_id, _as_of_date: as_of_date },
  );
  if (completeErr) {
    throw new Error(
      `getEligibility: assert_eligibility_complete RPC failed: ${completeErr.message}`,
    );
  }
  if (completeData !== true) {
    throw new EligibilityIncompleteError(operator_id, as_of_date);
  }

  const rows: EligibilityRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    let q = supabaseAdmin
      .from('universe_membership')
      .select('ticker,long_eligible,short_eligible')
      .eq('operator_id', operator_id)
      .eq('as_of_date', as_of_date)
      .order('ticker', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (side === 'long') q = q.eq('long_eligible', true);
    else if (side === 'short') q = q.eq('short_eligible', true);

    const { data, error } = await q;
    if (error) {
      throw new Error(`getEligibility: universe_membership read failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as EligibilityRow[]));
    if (data.length < PAGE) break;
  }

  return { operator_id, as_of_date, rows };
}

/**
 * Write coverage via the SECURITY DEFINER RPC. Idempotent ON CONFLICT.
 * Engine path (longshort-universe-enrich-and-filter) calls this AFTER the
 * refresh_log INSERT succeeds, in a separate try/catch.
 *
 * Forward-compatible payload: extra `covers_3_3X` keys can be added in Phase 2
 * without changing this signature.
 */
export interface CoveragePayload {
  readonly covers_3_3a: boolean;
  readonly covers_3_3b: boolean;
  readonly covers_3_3c: boolean;
  readonly covers_3_3d: boolean;
  readonly covers_3_3e: boolean;
}

export async function writeEligibilityCoverage(
  operator_id: string,
  as_of_date: string,
  coverage: CoveragePayload,
): Promise<{ complete: boolean }> {
  const { data, error } = await supabaseAdmin.rpc(
    'write_universe_eligibility_coverage',
    {
      _operator_id: operator_id,
      _as_of_date: as_of_date,
      _coverage: coverage,
    },
  );
  if (error) {
    throw new Error(
      `writeEligibilityCoverage: RPC failed: ${error.message}`,
    );
  }
  const complete = !!(data && typeof data === 'object' && (data as Record<string, unknown>).complete === true);
  return { complete };
}
