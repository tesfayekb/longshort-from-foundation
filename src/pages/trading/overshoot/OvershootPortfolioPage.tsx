/**
 * Page wrapper for /trading/overshoot/portfolio — ACT-491.
 *
 * Tabs (Broker-truth · Internal ledger · Reconciliation · Closed lots ·
 * Equity curve). Broker-truth is the new default. Reconciliation banner
 * sits above the tabs (§2 axiom: reconciliation is visible, not hidden).
 *
 * MONEY-PATH INVARIANT: read-only — hook wraps a GET-only edge fn plus
 * `overshoot_lots` / `overshoot_audit_logs` / `overshoot_equity_snapshots`
 * SELECTs. Manual refresh + 25s poll (paused when tab hidden). T1:
 * imports ONLY from the strategy façade.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PnlCell, sumPriced } from '@/components/trading/portfolio/format';

function BookTotalStrip({
  label,
  daily,
  since,
  bold,
}: {
  label: string;
  daily: ReturnType<typeof sumPriced>;
  since: ReturnType<typeof sumPriced>;
  bold?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${bold ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground uppercase text-[10px] tracking-wide">{label}</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="text-muted-foreground text-[10px]">daily</span>
        <PnlCell v={daily.sum} />
        {daily.total > 0 && daily.priced !== daily.total && (
          <span className="text-[10px] text-muted-foreground">({daily.priced}/{daily.total})</span>
        )}
      </span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="text-muted-foreground text-[10px]">since-fill</span>
        <PnlCell v={since.sum} />
        {since.total > 0 && since.priced !== since.total && (
          <span className="text-[10px] text-muted-foreground">({since.priced}/{since.total})</span>
        )}
      </span>
    </div>
  );
}
import {
  OvershootHubTabs,
  OvershootPortfolioPnLPage,
  OvershootPortfolioBrokerTab,
  OvershootPortfolioReconciliationTab,
  OvershootPortfolioReconciliationBanner,
  OvershootEquityCurveTab,
  useOvershootPortfolioPositions,
  OvershootCapCompliance,
  useOvershootEquitySnapshots,
} from '@/features/overshoot';

function formatRelative(ts: number | null): string {
  if (ts === null) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function OvershootPortfolioPage() {
  const query = useOvershootPortfolioPositions();
  const broker = query.data?.broker_positions ?? [];
  const lots = query.data?.internal_lots ?? [];
  const updatedAt = query.dataUpdatedAt || null;
  const fetchedAt = query.data?.fetched_at ?? null;

  // Latest equity snapshot supplies the ratified sizingBase (broker_equity
  // × strategy_allocation_pct=1.0 × margin_multiplier=1.0 by ratified
  // defaults). Cap-compliance line is display-only; the money-path gate
  // remains evaluateAllocationCap in the entry handler.
  const equityQuery = useOvershootEquitySnapshots(1);
  const latestSnapshot = equityQuery.data && equityQuery.data.length > 0
    ? equityQuery.data[equityQuery.data.length - 1]
    : null;

  // Prefer broker-mark MV; fall back to cost basis per allocation-cap
  // module rules (marks preferred, cost-basis fallback — never understate).
  const longMv = broker
    .filter((p) => p.side === 'long')
    .reduce((acc, p) => acc + (
      p.market_value !== null && Number.isFinite(p.market_value)
        ? Math.abs(p.market_value)
        : Math.abs(p.avg_entry_price * p.qty)
    ), 0);
  const shortMv = broker
    .filter((p) => p.side === 'short')
    .reduce((acc, p) => acc + (
      p.market_value !== null && Number.isFinite(p.market_value)
        ? Math.abs(p.market_value)
        : Math.abs(p.avg_entry_price * p.qty)
    ), 0);
  const sizingBase = latestSnapshot ? latestSnapshot.broker_equity : null;

  // ACT-525 (UI sweep item 2) — top-of-page totals strip so the day's P&L
  // is legible without scrolling the tabs. Sums broker rows (typed-absence
  // honesty via sumPriced; nulls excluded, never fabricated to 0).
  const longRows = broker.filter((p) => p.side === 'long');
  const shortRows = broker.filter((p) => p.side === 'short');
  const longDaily = sumPriced(longRows.map((r) => r.unrealized_intraday_pl));
  const longSince = sumPriced(longRows.map((r) => r.unrealized_pl));
  const shortDaily = sumPriced(shortRows.map((r) => r.unrealized_intraday_pl));
  const shortSince = sumPriced(shortRows.map((r) => r.unrealized_pl));
  const netDaily = sumPriced(broker.map((r) => r.unrealized_intraday_pl));
  const netSince = sumPriced(broker.map((r) => r.unrealized_pl));

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overshoot · Portfolio"
        subtitle="Broker-truth positions (Alpaca paper) and the reconciled internal ledger. Read-only display; the money-path is untouched."
      />

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <OvershootCapCompliance
          sizingBaseUsd={sizingBase}
          longMvUsd={query.isLoading ? null : longMv}
          shortMvUsd={query.isLoading ? null : shortMv}
          labelPrefix="Cap compliance:"
        />
      </div>

      {/* Book totals summary — day's P&L legible above the tabs. */}
      {!query.isLoading && broker.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
            Book totals (broker-truth)
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {longRows.length > 0 && (
              <BookTotalStrip
                label={`Long book · ${longRows.length}`}
                daily={longDaily}
                since={longSince}
              />
            )}
            {shortRows.length > 0 && (
              <BookTotalStrip
                label={`Short book · ${shortRows.length}`}
                daily={shortDaily}
                since={shortSince}
              />
            )}
            <BookTotalStrip
              label={`Net · ${broker.length}`}
              daily={netDaily}
              since={netSince}
              bold
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {query.isError ? (
            <span className="text-destructive">Error loading positions — retry with refresh.</span>
          ) : query.isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>
              Last updated {formatRelative(updatedAt)} · auto-refresh 25s
              {query.isFetching ? ' · refreshing…' : ''}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <OvershootPortfolioReconciliationBanner broker={broker} lots={lots} />

      <OvershootHubTabs
        defaultTab="broker"
        tabs={[
          {
            value: 'broker',
            label: 'Broker-truth',
            content: (
              <OvershootPortfolioBrokerTab
                positions={broker}
                lots={lots}
                isLoading={query.isLoading}
              />
            ),
          },
          {
            value: 'reconciliation',
            label: 'Reconciliation',
            content: (
              <OvershootPortfolioReconciliationTab
                broker={broker}
                lots={lots}
                fetchedAt={fetchedAt}
                isLoading={query.isLoading}
              />
            ),
          },
          {
            value: 'closed-lots',
            label: 'Closed Lots',
            content: <OvershootPortfolioPnLPage />,
          },
          {
            value: 'equity-curve',
            label: 'Equity Curve',
            content: <OvershootEquityCurveTab />,
          },
        ]}
      />
    </div>
  );
}