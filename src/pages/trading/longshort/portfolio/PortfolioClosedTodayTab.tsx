/**
 * PortfolioClosedTodayTab — FP-068 W5 (ACT-444).
 *
 * "Closed today" view — what left the portfolio today and was it a
 * gain or a loss. Two sub-tabs:
 *
 *   - Broker-fills (primary, has data): today's Alpaca exit fills
 *     (intent IN close/decrease), matched to open lots on (symbol,side)
 *     to compute entry_avg → realized P&L. Unmatched fills are flagged
 *     BROKER-ONLY / DW-207 evidence — never fabricated into a match.
 *
 *   - Internal-closed (stubbed, honest empty state): reads
 *     longshort_lots WHERE status='closed'. Empty today; populates
 *     naturally once the strategy closes positions (see DW-207).
 *
 * Broker-truth is visually distinct from the internal-reconciled side
 * (same discipline as W1/W3).
 */
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fmtPrice, PnlCell, sumPriced } from '@/components/trading/portfolio/format';
import {
  useClosedFillsToday,
  findOpenLotFor,
  realizedPnl,
  type BrokerExitFillRow,
  type InternalClosedLotRow,
  type OpenLotForMatchRow,
} from './useClosedFillsToday';

export function PortfolioClosedTodayTab() {
  const query = useClosedFillsToday();
  const fills = query.data?.broker_exit_fills ?? [];
  const openLots = query.data?.open_lots_for_match ?? [];
  const internalClosed = query.data?.internal_closed_lots ?? [];

  return (
    <Tabs defaultValue="broker-fills" className="space-y-3">
      <TabsList>
        <TabsTrigger value="broker-fills">Broker-fills</TabsTrigger>
        <TabsTrigger value="internal-closed">Internal-closed</TabsTrigger>
      </TabsList>
      <TabsContent value="broker-fills">
        <BrokerFillsPanel
          fills={fills}
          openLots={openLots}
          isLoading={query.isLoading}
          isError={query.isError}
        />
      </TabsContent>
      <TabsContent value="internal-closed">
        <InternalClosedPanel lots={internalClosed} isLoading={query.isLoading} />
      </TabsContent>
    </Tabs>
  );
}

function BrokerFillsPanel({
  fills,
  openLots,
  isLoading,
  isError,
}: {
  fills: BrokerExitFillRow[];
  openLots: OpenLotForMatchRow[];
  isLoading: boolean;
  isError: boolean;
}) {
  const rows = useMemo(
    () =>
      fills.map((f) => {
        const lot = findOpenLotFor(openLots, f.symbol, f.side);
        const entryAvg =
          lot && lot.qty > 0 ? lot.cost_basis / lot.qty : null;
        const realized = realizedPnl(f, entryAvg);
        return { fill: f, entryAvg, realized, matched: lot !== null };
      }),
    [fills, openLots],
  );
  const totals = useMemo(
    () => sumPriced(rows.map((r) => r.realized)),
    [rows],
  );

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        BROKER-TRUTH — Alpaca-executed exits today (intent = close / decrease).
        Realized P&amp;L is derived from broker exit price and matched-lot
        entry_avg. Unmatched fills are flagged BROKER-ONLY (DW-207 evidence)
        and excluded from the reconciled total.
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Intent</TableHead>
              <TableHead>Filled at</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Entry → Exit</TableHead>
              <TableHead className="text-right">Realized P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive py-6">
                  Error loading exit fills.
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No exits today.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.fill.order_id}>
                  <TableCell className="font-mono font-medium">{r.fill.symbol}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.fill.side === 'long' ? 'default' : 'secondary'}
                      className="uppercase text-[10px]"
                    >
                      {r.fill.side}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {r.fill.intent}
                    </Badge>
                    {!r.matched && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px] uppercase border-amber-500/50 text-amber-600 dark:text-amber-500"
                        title="Broker exited a position with no matching open lot — DW-207 evidence."
                      >
                        unmatched
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.fill.filled_at
                      ? new Date(r.fill.filled_at).toLocaleTimeString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.fill.filled_qty.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtPrice(r.entryAvg)} → {fmtPrice(r.fill.filled_avg_price)}
                  </TableCell>
                  <TableCell className="text-right">
                    <PnlCell v={r.realized} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {!isLoading && rows.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={6} className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                  Realized today
                </TableCell>
                <TableCell className="text-right">
                  <PnlCell v={totals.sum} />
                  {totals.priced !== totals.total && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({totals.priced} of {totals.total} matched)
                    </span>
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

function InternalClosedPanel({
  lots,
  isLoading,
}: {
  lots: InternalClosedLotRow[];
  isLoading: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        INTERNAL-RECONCILED — closed lots from the internal ledger with
        cost-basis-derived realized P&amp;L.
      </div>
      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : lots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm">
          <div className="font-medium">No closed lots yet</div>
          <div className="text-muted-foreground mt-1">
            Populates as the strategy closes positions (see DW-207 — the
            rebalance close path is currently lot-fed, so broker-orphans
            liquidated outside the ledger will not appear here). This tab
            lights up automatically once the first close writes a closed lot.
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Exit at</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry → Exit</TableHead>
                <TableHead className="text-right">Realized P&amp;L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((l) => {
                const entryAvg =
                  l.qty > 0 ? l.cost_basis / Math.abs(l.qty) : null;
                return (
                  <TableRow key={l.lot_id}>
                    <TableCell className="font-mono font-medium">{l.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant={l.side === 'long' ? 'default' : 'secondary'}
                        className="uppercase text-[10px]"
                      >
                        {l.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.exit_ts ? new Date(l.exit_ts).toLocaleTimeString() : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Math.abs(l.qty).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPrice(entryAvg)} → {fmtPrice(l.exit_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PnlCell v={l.realized_pnl} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}