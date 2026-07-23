/**
 * OvershootUniverse — /trading/overshoot/universe page (FP-069 W4.g, ACT-465.g).
 *
 * Read-only. Renders the active `overshoot_universe` set and joins each
 * ticker to its latest `overshoot_short_interest` row for coverage evidence.
 *
 * Typed-absence semantics (R-4(a) ruling): tickers whose SI row is missing
 * or whose `si_pct_float` / `dtc` are NULL are flagged as TYPED ABSENCE
 * ("shares-unavailable"), never as missing/failed data. The engine's
 * DETECTOR_SI_STALENESS_MAX_DAYS gate governs whether the coverage counts
 * toward detection eligibility — see OvershootOverview for the display of
 * that threshold (single-home).
 *
 * ZERO writes. ZERO edge-function calls. RLS-inheriting SELECT only.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

interface UniverseRow {
  ticker: string;
  source: string | null;
  added_as_of: string | null;
  active: boolean;
}

interface SIRow {
  ticker: string;
  as_of_date: string;
  si_pct_float: number | null;
  dtc: number | null;
}

interface JoinedRow {
  ticker: string;
  added_as_of: string | null;
  active: boolean;
  si_as_of: string | null;
  si_pct_float: number | null;
  dtc: number | null;
  sharesUnavailable: boolean;
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${(Number(n) * 100).toFixed(2)}%`;
}

function fmtNum(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(2);
}

/**
 * Cadence-aware universe staleness — weekly Monday refresh cron
 * (see sql/39_overshoot_universe_refresh_cron_schedule.sql).
 *
 *   fresh  age ≤ 9d   (one full weekly cycle + weekend + one biz-day slack)
 *   stale  9d < age ≤ 35d (missed one refresh — investigate)
 *   alert  age > 35d  (multiple missed refreshes — page)
 *
 * Kills the false "stale 3d" chip that came from the raw calendar-day
 * derivation. Same design rule as DEC-504-4 AMENDMENT (SI staleness):
 * staleness is measured against the expected refresh cadence, not the
 * literal age of the data.
 */
const UNIVERSE_FRESH_MAX_DAYS = 9;
const UNIVERSE_ALERT_MIN_DAYS = 35;

function universeAgeDays(maxAddedAsOf: string | null, now: Date): number | null {
  if (!maxAddedAsOf) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(maxAddedAsOf);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  return days < 0 ? 0 : days;
}

function UniverseFreshnessChip({ maxAddedAsOf }: { maxAddedAsOf: string | null }) {
  const age = universeAgeDays(maxAddedAsOf, new Date());
  if (age === null) {
    return <Badge variant="outline" className="font-mono text-xs">no refresh yet</Badge>;
  }
  if (age > UNIVERSE_ALERT_MIN_DAYS) {
    return (
      <Badge variant="destructive" className="font-mono text-xs" title={`age ${age}d > alert ${UNIVERSE_ALERT_MIN_DAYS}d`}>
        universe: alert · {age}d
      </Badge>
    );
  }
  if (age > UNIVERSE_FRESH_MAX_DAYS) {
    return (
      <Badge variant="secondary" className="font-mono text-xs" title={`age ${age}d > fresh ${UNIVERSE_FRESH_MAX_DAYS}d — one weekly refresh missed`}>
        universe: stale · {age}d
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-xs" title={`fresh (age ≤ ${UNIVERSE_FRESH_MAX_DAYS}d; weekly Monday refresh cadence)`}>
      universe: fresh · {age}d
    </Badge>
  );
}

export function OvershootUniverse() {
  const universeQuery = useQuery({
    queryKey: ['overshoot', 'universe', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('overshoot_universe')
        .select('ticker, source, added_as_of, active')
        .eq('active', true)
        .order('ticker', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UniverseRow[];
    },
  });

  const siQuery = useQuery({
    queryKey: ['overshoot', 'universe', 'si-latest-all'],
    queryFn: async () => {
      // Pull all recent SI rows (RLS-scoped). We reduce to latest-per-ticker
      // client-side. Cap at 5000 to stay comfortably above the ~839 active
      // universe × recent snapshots.
      const { data, error } = await supabase
        .from('overshoot_short_interest')
        .select('ticker, as_of_date, si_pct_float, dtc')
        .order('as_of_date', { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as SIRow[];
    },
  });

  const universe = universeQuery.data ?? [];
  const siRows = siQuery.data ?? [];

  const joined = useMemo<JoinedRow[]>(() => {
    const latestByTicker = new Map<string, SIRow>();
    for (const r of siRows) {
      const cur = latestByTicker.get(r.ticker);
      if (!cur || r.as_of_date > cur.as_of_date) latestByTicker.set(r.ticker, r);
    }
    return universe.map((u) => {
      const si = latestByTicker.get(u.ticker) ?? null;
      const sharesUnavailable =
        !!si && (si.si_pct_float === null || si.dtc === null);
      return {
        ticker: u.ticker,
        added_as_of: u.added_as_of,
        active: u.active,
        si_as_of: si?.as_of_date ?? null,
        si_pct_float: si?.si_pct_float ?? null,
        dtc: si?.dtc ?? null,
        sharesUnavailable,
      };
    });
  }, [universe, siRows]);

  const coverageCount = joined.filter((r) => r.si_as_of !== null).length;
  const sharesUnavailableCount = joined.filter((r) => r.sharesUnavailable).length;
  const maxSiAsOf = joined.reduce<string | null>(
    (acc, r) => (r.si_as_of && (!acc || r.si_as_of > acc) ? r.si_as_of : acc),
    null,
  );
  const maxAddedAsOf = universe.reduce<string | null>(
    (acc, r) => (r.added_as_of && (!acc || r.added_as_of > acc) ? r.added_as_of : acc),
    null,
  );

  const loading = universeQuery.isLoading || siQuery.isLoading;
  const error = universeQuery.error || siQuery.error;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold">Overshoot — Universe</h1>
          <UniverseFreshnessChip maxAddedAsOf={maxAddedAsOf} />
        </div>
        <p className="text-sm text-muted-foreground">
          Active <code className="font-mono">overshoot_universe</code> set joined to the latest
          <code className="font-mono"> overshoot_short_interest</code> snapshot per ticker. Tickers whose SI row
          reports NULL <code className="font-mono">si_pct_float</code> or <code className="font-mono">dtc</code>
          are flagged as <strong>typed-absence</strong> (shares-unavailable) — not missing data.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Active universe</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold font-mono">{universe.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">SI coverage</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold font-mono">{coverageCount}</p>
            <p className="text-xs text-muted-foreground/80 font-mono">
              {universe.length > 0
                ? `${((coverageCount / universe.length) * 100).toFixed(1)}% of active`
                : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Shares unavailable</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold font-mono">{sharesUnavailableCount}</p>
            <p className="text-xs text-muted-foreground/80 font-mono">typed absence</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Max SI as_of</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold font-mono">{maxSiAsOf ?? '—'}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Universe + SI coverage matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load universe or short-interest.</p>
          ) : joined.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active universe rows.</p>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Added as-of</TableHead>
                    <TableHead>SI as_of</TableHead>
                    <TableHead className="text-right">SI % float</TableHead>
                    <TableHead className="text-right">DTC</TableHead>
                    <TableHead>Coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {joined.map((r) => (
                    <TableRow key={r.ticker}>
                      <TableCell className="font-mono">{r.ticker}</TableCell>
                      <TableCell className="font-mono text-xs">{r.added_as_of ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.si_as_of ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPct(r.si_pct_float)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(r.dtc)}</TableCell>
                      <TableCell>
                        {r.si_as_of === null ? (
                          <Badge variant="outline">no SI row</Badge>
                        ) : r.sharesUnavailable ? (
                          <Badge variant="secondary" title="typed absence — not missing data">
                            shares-unavailable
                          </Badge>
                        ) : (
                          <Badge variant="default">covered</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}