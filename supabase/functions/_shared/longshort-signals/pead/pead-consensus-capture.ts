/**
 * DW-172 — pead_consensus_observations capture adapter.
 *
 * Persists ONE row per scored PEAD ticker (one SUE per ticker per tick).
 * Capture-only: does NOT modify the live PEAD signal value (SUE × decay),
 * z-score, ranker, or PnL.
 *
 * Anti-fabrication rules (the binding constraint):
 *   - The 3 typed-absence skip reasons (pead_panel_below_floor /
 *     zero_dispersion / no_recent_earnings) produce NO row by
 *     construction — only the compute's `kind:'value'` branch surfaces
 *     the inputs_snapshot, and the orchestrator passes only those into
 *     the capture. Writing a zero_dispersion row with σ_proxy=0 /
 *     sue=NULL would manufacture the ε-fallback DEC-053 explicitly
 *     forbids; writing a below_floor row with N=1 would fabricate a
 *     "consensus" the spec rejects.
 *   - Every column is observationally real for a scored PEAD: finite
 *     epsActual/avg/high/low, N≥2, σ_proxy>0, resolved report period,
 *     finite SUE. No NULL slots; the table is 13 NOT-NULL columns.
 *
 * Idempotency: `ON CONFLICT DO NOTHING`. The compute is pure → identical
 * re-fires on the same (operator, signal, as_of_date, ticker) produce
 * byte-identical rows; DO NOTHING preserves the first daily snapshot
 * and lets compute drift surface (UPSERT would silently mask it).
 *
 * Forward purpose (DEC-053): the daily series of T-0 snapshots accrued
 * forward enables Phase-7 T-5 walk-down reconstruction (compare the
 * captured snapshot at as_of_date = report_date − 5 trading days
 * against the live T-0-frozen SUE).
 *
 * Owner: longshort (DW-172 / Signal #2 T-0 consensus capture).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PeadConsensusSnapshot {
  report_period_date: string;
  eps_actual: number;
  consensus_eps_avg: number;
  eps_high: number;
  eps_low: number;
  number_analysts: number;
  sigma_proxy: number;
  sue: number;
  trading_days_since: number;
}

export interface PeadConsensusCaptureRow {
  ticker: string;
  snapshot: PeadConsensusSnapshot;
}

export interface PeadConsensusCaptureArgs {
  supabase: SupabaseClient;
  operator_id: string;
  signal_id: string;
  as_of_date: string;
  computed_at: string;
  rows: ReadonlyArray<PeadConsensusCaptureRow>;
}

function isRealSnapshot(s: PeadConsensusSnapshot): boolean {
  return (
    typeof s.report_period_date === 'string' && s.report_period_date.length >= 10 &&
    Number.isFinite(s.eps_actual) &&
    Number.isFinite(s.consensus_eps_avg) &&
    Number.isFinite(s.eps_high) &&
    Number.isFinite(s.eps_low) &&
    Number.isInteger(s.number_analysts) && s.number_analysts >= 2 &&
    Number.isFinite(s.sigma_proxy) && s.sigma_proxy > 0 &&
    Number.isFinite(s.sue) &&
    Number.isInteger(s.trading_days_since) && s.trading_days_since >= 0
  );
}

export async function capturePeadConsensus(
  args: PeadConsensusCaptureArgs,
): Promise<void> {
  const { supabase, operator_id, signal_id, as_of_date, computed_at, rows } = args;

  const payload: Array<{
    operator_id: string;
    signal_id: string;
    as_of_date: string;
    ticker: string;
    report_period_date: string;
    eps_actual: number;
    consensus_eps_avg: number;
    eps_high: number;
    eps_low: number;
    number_analysts: number;
    sigma_proxy: number;
    sue: number;
    trading_days_since: number;
    computed_at: string;
  }> = [];

  for (const r of rows) {
    if (!r || typeof r.ticker !== 'string' || r.ticker.length === 0) continue;
    if (!r.snapshot || !isRealSnapshot(r.snapshot)) continue;
    payload.push({
      operator_id,
      signal_id,
      as_of_date,
      ticker: r.ticker,
      report_period_date: r.snapshot.report_period_date,
      eps_actual: r.snapshot.eps_actual,
      consensus_eps_avg: r.snapshot.consensus_eps_avg,
      eps_high: r.snapshot.eps_high,
      eps_low: r.snapshot.eps_low,
      number_analysts: r.snapshot.number_analysts,
      sigma_proxy: r.snapshot.sigma_proxy,
      sue: r.snapshot.sue,
      trading_days_since: r.snapshot.trading_days_since,
      computed_at,
    });
  }

  if (payload.length === 0) return;

  // ON CONFLICT DO NOTHING — pure compute → identical re-fires; UPSERT
  // would silently mask drift. PostgREST upsert with
  // ignoreDuplicates:true emits ON CONFLICT DO NOTHING.
  const { error } = await supabase
    .from('pead_consensus_observations')
    .upsert(payload, {
      onConflict: 'operator_id,signal_id,as_of_date,ticker',
      ignoreDuplicates: true,
    });

  if (error) {
    throw new Error(
      `pead_consensus_observations insert failed: ${error.message}`,
    );
  }
}