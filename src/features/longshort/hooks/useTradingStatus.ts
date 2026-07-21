/**
 * FP-033 — useTradingStatus.
 *
 * Read-only aggregate for the persistent trading-console status strip.
 * Fans out four independent reads (each through the caller's RLS — no new
 * permission path); any individual read that fails or returns no rows
 * degrades to `null`, so the strip can still render the other indicators.
 *
 * Reads:
 *   - `signal_compute_log.completed_at` — latest fire timestamp.
 *   - `universe_refresh_log.refresh_completed_at` + `outcome` — universe freshness.
 *   - `kill_switches` (strategy_key = 'longshort') — breaker state.
 *   - `reconciliation_events` — count of unresolved (resolved_at IS NULL,
 *     severity > clean) rows.
 *
 * Zero writes. Zero new permissions. Zero touch to cron / signal-math /
 * Bucket-C surfaces.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

const sb = supabase as unknown as SupabaseClient;

export type KillSwitchState = 'active' | 'soft_paused' | 'hard_paused' | 'liquidating';

export interface TradingStatusSnapshot {
  lastFire: { completed_at: string } | null;
  universe: { completed_at: string | null; outcome: string | null } | null;
  breaker: { state: KillSwitchState } | null;
  reconciliation: { openCount: number } | null;
}

export const TRADING_STATUS_QUERY_KEY = ['longshort', 'trading-status'] as const;

/**
 * Display scope for the persistent trading-console status strip. The strip
 * itself is longshort-authored (T5 carve-out) but is mounted on EVERY
 * trading route via `TradingLayout`; on overshoot routes we swap in
 * overshoot-true data sources for the universe chip and hide the
 * cross-strategy OPEN-reconciliation badge (which reads longshort
 * reconciliation state and would leak that scope into overshoot). Crosswind
 * is frozen — no new permissions, no read into overshoot's A5 surface.
 */
export type TradingStatusScope = 'longshort' | 'overshoot';

async function fetchLastFire(): Promise<TradingStatusSnapshot['lastFire']> {
  const { data, error } = await sb
    .from('signal_compute_log')
    .select('completed_at')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { completed_at: string };
  return { completed_at: row.completed_at };
}

async function fetchUniverseLongshort(): Promise<TradingStatusSnapshot['universe']> {
  const { data, error } = await sb
    .from('universe_refresh_log')
    .select('refresh_completed_at, outcome')
    .order('refresh_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { refresh_completed_at: string | null; outcome: string | null };
  return { completed_at: row.refresh_completed_at, outcome: row.outcome };
}

/**
 * Overshoot universe freshness — `MAX(updated_at)` over the active roster
 * seeded by `overshoot-universe-refresh` (ACT-547 / INC-109 pipeline).
 * Read-only, no new permissions; existing RLS on `overshoot_universe`
 * governs visibility.
 */
async function fetchUniverseOvershoot(): Promise<TradingStatusSnapshot['universe']> {
  const { data, error } = await sb
    .from('overshoot_universe')
    .select('updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { updated_at: string | null };
  return { completed_at: row.updated_at, outcome: null };
}

async function fetchBreaker(): Promise<TradingStatusSnapshot['breaker']> {
  const { data, error } = await sb
    .from('kill_switches')
    .select('state')
    .eq('strategy_key', 'longshort')
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { state: KillSwitchState };
  return { state: row.state };
}

async function fetchOpenReconciliation(): Promise<TradingStatusSnapshot['reconciliation']> {
  // Count of unresolved events that are NOT in the clean noise-floor
  // (DEC-038 clause (2) — those do not count toward escalation).
  const { count, error } = await sb
    .from('reconciliation_events')
    .select('event_id', { count: 'exact', head: true })
    .is('resolved_at', null)
    .not('outcome', 'in', '(false_positive_within_tolerance,expected_divergence_handled)');
  if (error) return null;
  return { openCount: count ?? 0 };
}

export function useTradingStatus(scope: TradingStatusScope = 'longshort') {
  return useQuery<TradingStatusSnapshot>({
    // Cache-key includes scope so overshoot and longshort chips do not
    // cross-contaminate each other's cached snapshot.
    queryKey: [...TRADING_STATUS_QUERY_KEY, scope],
    queryFn: async () => {
      const universeFetcher =
        scope === 'overshoot' ? fetchUniverseOvershoot : fetchUniverseLongshort;
      // On overshoot routes we deliberately do NOT read longshort
      // reconciliation state (that is what the operator flagged as
      // cross-scope leakage). The strip's Open indicator hides itself
      // when this returns null AND scope is 'overshoot'.
      const reconciliationFetcher =
        scope === 'overshoot'
          ? async (): Promise<TradingStatusSnapshot['reconciliation']> => null
          : fetchOpenReconciliation;
      const [lastFire, universe, breaker, reconciliation] = await Promise.all([
        fetchLastFire().catch(() => null),
        universeFetcher().catch(() => null),
        fetchBreaker().catch(() => null),
        reconciliationFetcher().catch(() => null),
      ]);
      return { lastFire, universe, breaker, reconciliation };
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}