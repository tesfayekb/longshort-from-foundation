import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * FP-038 — Read-only hooks for the All-Signals overview.
 *
 * `signal_registry` is the index of all 9 signals (§4.4.1–§4.4.9) plus the
 * combiner composite. It is permission-scoped (`longshort.view`) and
 * deny-write at the database — writes are migration/governance-only.
 *
 * This hook does NOT recompute status — it surfaces the static-seeded
 * registry and joins last-fire telemetry from `signal_compute_log` for
 * live rows. Planned rows report `lastFire = null` (rendered as "—") by
 * construction, since no compute job has ever run for them.
 */

const sb = supabase as unknown as SupabaseClient;

export type SignalRegistryStatus = 'live' | 'planned' | 'deprecated';

export interface SignalRegistryRow {
  signal_id: string;
  signal_num: number | null;
  display_name: string;
  spec_ref: string | null;
  cadence: string | null;
  status: SignalRegistryStatus;
  criticality: 'critical' | 'non_critical' | null;
  stale_after_hours: number | null;
  planned_phase: string | null;
  job_registry_id: string | null;
  display_order: number;
}

export interface SignalLastFire {
  completed_at: string; // ISO
  as_of_date: string;
  outcome: string;
  universe_size: number | null;
  persisted_count: number | null;
}

export interface SignalRegistryRowWithFire extends SignalRegistryRow {
  lastFire: SignalLastFire | null;
  /** Total `signal_observations`-bearing rows persisted in `signal_compute_log`. */
  totalRuns: number;
  /** Distinct `as_of_date` count — drives the drift "insufficient history" gate. */
  distinctDates: number;
}

const KEY = ['longshort', 'signal-registry'] as const;

/** Drift threshold — below this we honestly show "insufficient history". */
export const DRIFT_MIN_HISTORY = 30;

/**
 * Fetch the registry rows + last-fire telemetry per signal in one round-trip
 * pair. Returns `signal_registry` ordered by `display_order` ASC.
 */
export function useSignalRegistry() {
  return useQuery({
    queryKey: [...KEY, 'all'],
    queryFn: async (): Promise<SignalRegistryRowWithFire[]> => {
      const { data: registry, error: regErr } = await sb
        .from('signal_registry')
        .select(
          'signal_id, signal_num, display_name, spec_ref, cadence, status, criticality, stale_after_hours, planned_phase, job_registry_id, display_order',
        )
        .order('display_order', { ascending: true });
      if (regErr) throw regErr;
      const rows = (registry ?? []) as SignalRegistryRow[];

      const liveIds = rows.filter((r) => r.status === 'live').map((r) => r.signal_id);
      if (liveIds.length === 0) {
        return rows.map((r) => ({ ...r, lastFire: null, totalRuns: 0, distinctDates: 0 }));
      }

      // Pull recent compute-log rows for the live signals (bounded). Per-signal
      // last-fire is derived client-side — cheap for the live set (2 today,
      // capped at 9 + composite long-term).
      const { data: logs, error: logErr } = await sb
        .from('signal_compute_log')
        .select('signal_id, completed_at, as_of_date, outcome, universe_size, persisted_count')
        .in('signal_id', liveIds)
        .order('completed_at', { ascending: false })
        .limit(2_000);
      if (logErr) throw logErr;

      const lastBySignal = new Map<string, SignalLastFire>();
      const totalBySignal = new Map<string, number>();
      const datesBySignal = new Map<string, Set<string>>();
      for (const l of (logs ?? []) as Array<{
        signal_id: string;
        completed_at: string | null;
        as_of_date: string;
        outcome: string;
        universe_size: number | null;
        persisted_count: number | null;
      }>) {
        if (!l.completed_at) continue;
        totalBySignal.set(l.signal_id, (totalBySignal.get(l.signal_id) ?? 0) + 1);
        if (!datesBySignal.has(l.signal_id)) datesBySignal.set(l.signal_id, new Set());
        datesBySignal.get(l.signal_id)!.add(l.as_of_date);
        if (!lastBySignal.has(l.signal_id)) {
          lastBySignal.set(l.signal_id, {
            completed_at: l.completed_at,
            as_of_date: l.as_of_date,
            outcome: l.outcome,
            universe_size: l.universe_size,
            persisted_count: l.persisted_count,
          });
        }
      }

      return rows.map((r) => ({
        ...r,
        lastFire: lastBySignal.get(r.signal_id) ?? null,
        totalRuns: totalBySignal.get(r.signal_id) ?? 0,
        distinctDates: datesBySignal.get(r.signal_id)?.size ?? 0,
      }));
    },
    staleTime: 60_000,
  });
}

/**
 * Staleness gate — given a registry row + the current time, returns the
 * fresh/stale/n-a verdict. `stale_after_hours = null` (intraday signals
 * we don't yet monitor at this layer, composite) → 'n/a'.
 */
export function deriveStaleness(
  row: SignalRegistryRowWithFire,
  now: Date,
): 'fresh' | 'stale' | 'n/a' {
  if (row.status !== 'live') return 'n/a';
  if (row.stale_after_hours == null) return 'n/a';
  if (!row.lastFire) return 'stale';
  const ageHours = (now.getTime() - new Date(row.lastFire.completed_at).getTime()) / 3_600_000;
  // Monday-of-week override — mirrors longshort-signal-monitor STALE_HOURS_MONDAY (72h).
  const isMondayUtc = now.getUTCDay() === 1;
  const threshold = isMondayUtc ? Math.max(row.stale_after_hours, 72) : row.stale_after_hours;
  return ageHours <= threshold ? 'fresh' : 'stale';
}