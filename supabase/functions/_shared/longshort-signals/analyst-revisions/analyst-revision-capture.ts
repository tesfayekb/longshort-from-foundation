/**
 * DW-178 — analyst_revision_observations capture adapter.
 *
 * Persists ONE row per fully-resolved scored revision the kernel
 * produced (i.e. one row per entry in `meta.scoredRevisions` from
 * `computeAnalystRevision`). Capture-only: does NOT modify the live
 * analyst signal value, z-score, ranker, or PnL.
 *
 * Anti-fabrication rules (the operator's binding constraint):
 *   - Unrecovered focals (no same-analyst prior) → NO row (typed
 *     absence in `meta.unrecoveredCount`).
 *   - Malformed focals (non-finite / non-positive targets) → NO row
 *     (typed absence in `meta.malformedCount`).
 *   - `direction === 0` (reiteration: prior recovered, magnitude 0) IS
 *     written — 0-by-observation, not absence.
 *   - Every column is fully resolved at compute time; no NULL slots.
 *
 * Idempotency: `ON CONFLICT DO NOTHING` (NOT upsert). The compute is
 * pure → a re-fire with identical fetched inputs produces byte-identical
 * rows → DO NOTHING is a clean no-op. UPSERT would silently MASK
 * recompute drift; DO NOTHING preserves the first-observed row and lets
 * drift surface.
 *
 * Composed PK collision safety: the PK includes `focal_published_at`
 * (ms-resolution timestamptz). A genuine same-(operator, signal,
 * as_of, ticker, analyst-name-key, analyst-company-key, focal-ts)
 * collision is structurally unobservable — `findSameAnalystPrior`
 * excludes equal-timestamp candidates (analyst-identity.ts:153), so
 * two scored revisions by the same analyst on the same ticker at the
 * exact same vendor timestamp would BOTH yield unrecovered (no row).
 *
 * Owner: longshort (DW-178 / Signal #1 per-revision capture).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnalystRevisionMeta,
  ScoredRevisionDetail,
} from './compute-analyst-revision.ts';

export interface AnalystRevisionCaptureRow {
  ticker: string;
  meta: AnalystRevisionMeta;
}

export interface AnalystRevisionCaptureArgs {
  supabase: SupabaseClient;
  operator_id: string;
  signal_id: string;
  as_of_date: string;
  computed_at: string;
  rows: ReadonlyArray<AnalystRevisionCaptureRow>;
}

function isRealDetail(d: ScoredRevisionDetail): boolean {
  return (
    typeof d.analystName === 'string' && d.analystName.length > 0 &&
    typeof d.analystCompany === 'string' &&
    typeof d.analystNameKey === 'string' && d.analystNameKey.length > 0 &&
    typeof d.analystCompanyKey === 'string' &&
    Number.isFinite(d.focalPublishedAtMs) &&
    Number.isFinite(d.priorPublishedAtMs) &&
    Number.isFinite(d.newTarget) && d.newTarget > 0 &&
    Number.isFinite(d.priorTarget) && d.priorTarget > 0 &&
    Number.isFinite(d.targetDelta) &&
    Number.isFinite(d.magnitudePct) &&
    (d.direction === -1 || d.direction === 0 || d.direction === 1) &&
    Number.isFinite(d.contribution) &&
    Number.isFinite(d.ageDays) &&
    (d.pairBasis === 'adjusted' || d.pairBasis === 'raw')
  );
}

/**
 * Capture-only adapter. Iterates per-ticker scoredRevisions and inserts
 * one row per detail entry, with ON CONFLICT DO NOTHING. Throws on
 * persistence error so the orchestrator surfaces the failure.
 */
export async function captureAnalystRevisions(
  args: AnalystRevisionCaptureArgs,
): Promise<void> {
  const { supabase, operator_id, signal_id, as_of_date, computed_at, rows } = args;

  const payload: Array<{
    operator_id: string;
    signal_id: string;
    as_of_date: string;
    ticker: string;
    analyst_name: string;
    analyst_company: string;
    analyst_name_key: string;
    analyst_company_key: string;
    focal_published_at: string;
    prior_published_at: string;
    new_target: number;
    prior_target: number;
    target_delta: number;
    magnitude_pct: number;
    direction: number;
    contribution: number;
    age_days: number;
    pair_basis: string;
    computed_at: string;
  }> = [];

  for (const r of rows) {
    const details = r.meta?.scoredRevisions;
    if (!Array.isArray(details) || details.length === 0) continue;
    for (const d of details) {
      if (!isRealDetail(d)) continue;
      payload.push({
        operator_id,
        signal_id,
        as_of_date,
        ticker: r.ticker,
        analyst_name: d.analystName,
        analyst_company: d.analystCompany,
        analyst_name_key: d.analystNameKey,
        analyst_company_key: d.analystCompanyKey,
        focal_published_at: new Date(d.focalPublishedAtMs).toISOString(),
        prior_published_at: new Date(d.priorPublishedAtMs).toISOString(),
        new_target: d.newTarget,
        prior_target: d.priorTarget,
        target_delta: d.targetDelta,
        magnitude_pct: d.magnitudePct,
        direction: d.direction,
        contribution: d.contribution,
        age_days: Math.trunc(d.ageDays),
        pair_basis: d.pairBasis,
        computed_at,
      });
    }
  }

  if (payload.length === 0) return;

  // ON CONFLICT DO NOTHING — pure compute → re-fire is a clean no-op;
  // upsert would mask drift. PostgREST upsert with
  // `ignoreDuplicates: true` emits ON CONFLICT DO NOTHING.
  const { error } = await supabase
    .from('analyst_revision_observations')
    .upsert(payload, {
      onConflict:
        'operator_id,signal_id,as_of_date,ticker,analyst_name_key,analyst_company_key,focal_published_at',
      ignoreDuplicates: true,
    });

  if (error) {
    throw new Error(
      `analyst_revision_observations insert failed: ${error.message}`,
    );
  }
}