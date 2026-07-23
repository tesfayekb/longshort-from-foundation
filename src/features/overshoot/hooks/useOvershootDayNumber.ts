/**
 * useOvershootDayNumber — SINGLE SOURCE of the "Day/Today" number on
 * the Overshoot Overview (UI invariant, filed 2026-07-23):
 * every element labeled Day/Today on ANY overshoot page binds to this
 * hook. Live during RTH (broker Σ unrealized_intraday_pl + realized
 * today), Settled outside RTH (last two overshoot_equity_snapshots
 * broker_equity delta). The label follows the branch so the word
 * "Today" can never sit on a prior-day range, and the KPI-strip tile
 * and the TodayCard can never disagree at the same tick.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOvershootPortfolioPositions } from './useOvershootPortfolioPositions';

export type OvershootDayMode = 'live' | 'closing_unsettled' | 'settled';

export interface OvershootDayNumber {
  mode: OvershootDayMode;
  /** Card/tile title — 'Today (live)' or 'Settled YYYY-MM-DD'. */
  label: string;
  /** Signed USD delta for the labeled window, or null when unavailable. */
  valueUsd: number | null;
  /** Signed pct delta vs anchor equity, or null when unavailable. */
  pct: number | null;
  /** Realized closures today ($, count) — live branch only. */
  realizedToday: number | null;
  realizedCount: number | null;
  /** Σ broker unrealized_intraday_pl across open positions — live only. */
  openPnl: number | null;
  /** Anchor snapshot_date (YYYY-MM-DD) for live "vs settled" sub-line. */
  anchorDate: string | null;
  /** Settled-mode: previous snapshot date (window start). */
  prevDate: string | null;
  /** Settled-mode: latest snapshot date (window end / label). */
  latestDate: string | null;
  /**
   * Continuity subline — the previously settled window that the day tile
   * is displacing (rendered as a muted second line so both truths remain
   * visible when the tile is showing a live/unsettled figure, and as the
   * PRIOR settled pair when the tile is already the official settled row).
   */
  prevSettled: {
    valueUsd: number;
    pct: number | null;
    prevDate: string;
    latestDate: string;
  } | null;
  loading: boolean;
  error: string | null;
}

function isUsEquityMarketHours(now: Date): boolean {
  const dow = now.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  // 13:30Z (810) .. 21:00Z (1260) — widest RTH surface across DST.
  return mins >= 810 && mins < 1260;
}

function pairDelta(
  prev: { snapshot_date: string; broker_equity: number } | null,
  latest: { snapshot_date: string; broker_equity: number } | null,
): OvershootDayNumber['prevSettled'] {
  if (!prev || !latest) return null;
  const delta = latest.broker_equity - prev.broker_equity;
  const pct = prev.broker_equity > 0 ? (delta / prev.broker_equity) * 100 : null;
  return {
    valueUsd: delta,
    pct,
    prevDate: prev.snapshot_date,
    latestDate: latest.snapshot_date,
  };
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useOvershootDayNumber(
  snapshots: Array<{ snapshot_date: string; broker_equity: number }>,
  snapshotsLoading: boolean,
  now: Date,
): OvershootDayNumber {
  const live = isUsEquityMarketHours(now);
  const positions = useOvershootPortfolioPositions();
  const todayIso = utcDateStr(now);

  const realizedTodayQuery = useQuery({
    queryKey: ['overshoot', 'day-number', 'realized-today', todayIso],
    enabled: live,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_lots')
        .select('realized_pnl_partial, closed_at')
        .eq('status', 'closed')
        .gte('closed_at', `${todayIso}T00:00:00Z`);
      if (error) throw error;
      const rows = data ?? [];
      let sum = 0;
      for (const r of rows as Array<{ realized_pnl_partial: number | string | null }>) {
        if (r.realized_pnl_partial === null) continue;
        sum += Number(r.realized_pnl_partial);
      }
      return { sum, count: rows.length };
    },
    refetchInterval: 25_000,
    staleTime: 20_000,
  });

  const n = snapshots.length;
  const latestSnap = n > 0 ? snapshots[n - 1] : null;
  const prevSnap = n >= 2 ? snapshots[n - 2] : null;
  const priorSnap = n >= 3 ? snapshots[n - 3] : null;

  // Settled activates ONLY when a snapshot exists for the CURRENT session
  // date — otherwise today's number never disappears in the 20:00→21:10Z
  // window between close and the snapshot writer.
  const todaySettled = !!(latestSnap && latestSnap.snapshot_date.slice(0, 10) === todayIso);
  const useLiveComputation = live || !todaySettled;

  if (useLiveComputation) {
    const openPnl = (positions.data?.broker_positions ?? []).reduce(
      (acc, p) => acc + (p.unrealized_intraday_pl ?? 0),
      0,
    );
    const realizedToday = realizedTodayQuery.data?.sum ?? null;
    const realizedCount = realizedTodayQuery.data?.count ?? null;
    const loading =
      positions.isLoading || snapshotsLoading || realizedTodayQuery.isLoading;
    const total =
      realizedToday === null ? null : openPnl + realizedToday;
    const pct =
      total !== null && latestSnap && latestSnap.broker_equity > 0
        ? (total / latestSnap.broker_equity) * 100
        : null;
    return {
      mode: live ? 'live' : 'closing_unsettled',
      label: live ? 'Today (live)' : 'Today (closing, unsettled)',
      valueUsd: total,
      pct,
      realizedToday,
      realizedCount,
      openPnl,
      anchorDate: latestSnap ? latestSnap.snapshot_date : null,
      prevDate: null,
      latestDate: null,
      // Continuity: show the last officially settled window as a muted
      // second line so operator sees both truths without a second tile.
      prevSettled: pairDelta(prevSnap, latestSnap),
      loading,
      error: positions.error
        ? String((positions.error as Error).message ?? positions.error)
        : null,
    };
  }

  // Settled branch — today's snapshot is written, so the tile is the
  // official number for the session that just closed.
  const delta =
    latestSnap && prevSnap ? latestSnap.broker_equity - prevSnap.broker_equity : null;
  const pct =
    delta !== null && prevSnap && prevSnap.broker_equity > 0
      ? (delta / prevSnap.broker_equity) * 100
      : null;
  return {
    mode: 'settled',
    label: latestSnap && prevSnap
      ? `Settled ${prevSnap.snapshot_date.slice(0, 10)}→${latestSnap.snapshot_date.slice(0, 10)}`
      : latestSnap
        ? `Settled ${latestSnap.snapshot_date.slice(0, 10)}`
        : 'Settled —',
    valueUsd: delta,
    pct,
    realizedToday: null,
    realizedCount: null,
    openPnl: null,
    anchorDate: null,
    prevDate: prevSnap ? prevSnap.snapshot_date : null,
    latestDate: latestSnap ? latestSnap.snapshot_date : null,
    // Continuity in settled mode: show the PRIOR settled pair beneath the
    // official row (never the current pair — that IS the tile).
    prevSettled: pairDelta(priorSnap, prevSnap),
    loading: snapshotsLoading,
    error: null,
  };
}