/**
 * OvershootPortfolioBrokerTab — ACT-491 (1).
 *
 * BROKER-TRUTH mirror of the OVERSHOOT Alpaca paper /v2/positions. Sibling
 * of longshort's PortfolioBrokerTab; shape identical (INC-77 duplicate-
 * primitive discipline — no cross-strategy import from src/features/longshort).
 *
 * Marks source per ACT-491 ratification: broker /v2/positions.current_price.
 * This surface is display-only observability, NOT a DECISION price
 * consumer — Polygon-only LIVE-PRICE contract stays intact for sizing,
 * exit pricing, I5, detection.
 *
 * Days-held: SPY-session ordinal is authoritative for exit clocks in
 * `_shared/overshoot-execution/session-age.ts`; on the display mirror we
 * derive from the earliest matching lot's entry_ts (calendar-day floor)
 * because the broker returns no fill timestamp on /v2/positions. Typed-
 * absence when no matching lot exists.
 */
import { useMemo, useState } from 'react';
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
import { fmtPrice, PnlCell, sumPriced, type SideFilter } from '@/components/trading/portfolio/format';
import { SideFilterControl } from '@/components/trading/portfolio/SideFilterControl';
import { daysHeldFrom, findEarliestLotFor } from './reconcile';
import type {
  OvershootBrokerPositionRow,
  OvershootInternalLotRow,
} from '../../hooks/useOvershootPortfolioPositions';

interface Props {
  positions: OvershootBrokerPositionRow[];
  lots: OvershootInternalLotRow[];
  isLoading: boolean;
}

export function OvershootPortfolioBrokerTab({ positions, lots, isLoading }: Props) {
  const [filter, setFilter] = useState<SideFilter>('all');
  const filtered = useMemo(
    () => (filter === 'all' ? positions : positions.filter((p) => p.side === filter)),
    [positions, filter],
  );
  const totals = useMemo(() => computeBookTotals(filtered), [filtered]);
  const deployedNotional = useMemo(
    () =>
      filtered.reduce(
        (acc, p) => acc + (p.market_value !== null && Number.isFinite(p.market_value) ? Math.abs(p.market_value) : 0),
        0,
      ),
    [filtered],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-xs text-muted-foreground min-w-0 flex-1">
          BROKER-TRUTH — a mirror of the Alpaca paper account (overshoot).
          Distinct from the reconciled internal ledger tab. Marks are
          broker-reported (observability); the Polygon LIVE-PRICE contract
          continues to govern all decision paths.
        </div>
        <SideFilterControl value={filter} onChange={setFilter} />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Days held</TableHead>
              <TableHead className="text-right">Entry → Mark</TableHead>
              <TableHead className="text-right">Daily P&amp;L</TableHead>
              <TableHead className="text-right">Since-fill P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  {positions.length === 0 ? 'No open broker positions.' : `No ${filter} broker positions.`}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const lot = findEarliestLotFor(lots, p.symbol, p.side);
                const days = lot ? daysHeldFrom(lot.entry_ts) : null;
                return (
                  <TableRow key={`${p.symbol}-${p.side}`}>
                    <TableCell className="font-mono font-medium">{p.symbol}</TableCell>
                    <TableCell>
                      <Badge variant={p.side === 'long' ? 'default' : 'secondary'} className="uppercase text-[10px]">{p.side}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{Math.abs(p.qty).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">
                      {days === null ? <span className="text-muted-foreground">—</span> : `${days}d`}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPrice(p.avg_entry_price)} → {fmtPrice(p.current_price)}
                    </TableCell>
                    <TableCell className="text-right"><PnlCell v={p.unrealized_intraday_pl} /></TableCell>
                    <TableCell className="text-right"><PnlCell v={p.unrealized_pl} /></TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {!isLoading && filtered.length > 0 ? (
            <TableFooter>
              <BookTotalRow label="Long book" totals={totals.long} show={filter !== 'short'} />
              <BookTotalRow label="Short book" totals={totals.short} show={filter !== 'long'} />
              <BookTotalRow label="Net" totals={totals.net} show={filter === 'all'} deployed={deployedNotional} bold />
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}

function computeBookTotals(rows: OvershootBrokerPositionRow[]) {
  const bucket = (side: 'long' | 'short' | 'all') => {
    const subset = side === 'all' ? rows : rows.filter((r) => r.side === side);
    return {
      count: subset.length,
      daily: sumPriced(subset.map((r) => r.unrealized_intraday_pl)),
      sinceFill: sumPriced(subset.map((r) => r.unrealized_pl)),
    };
  };
  return { long: bucket('long'), short: bucket('short'), net: bucket('all') };
}

function PartialNote({ priced, total }: { priced: number; total: number }) {
  if (total === 0 || priced === total) return null;
  return <span className="ml-1 text-[10px] text-muted-foreground">({priced} of {total} priced)</span>;
}

function BookTotalRow({
  label, totals, show, bold, deployed,
}: {
  label: string;
  totals: { count: number; daily: ReturnType<typeof sumPriced>; sinceFill: ReturnType<typeof sumPriced> };
  show: boolean;
  bold?: boolean;
  deployed?: number;
}) {
  if (!show || totals.count === 0) return null;
  const cls = bold ? 'font-semibold' : '';
  const deployedStr = deployed !== undefined
    ? ` · deployed $${deployed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : '';
  return (
    <TableRow className={cls}>
      <TableCell colSpan={5} className="text-right text-xs uppercase tracking-wide text-muted-foreground">
        {label} · {totals.count} {totals.count === 1 ? 'position' : 'positions'}{deployedStr}
      </TableCell>
      <TableCell className="text-right">
        <PnlCell v={totals.daily.sum} />
        <PartialNote priced={totals.daily.priced} total={totals.daily.total} />
      </TableCell>
      <TableCell className="text-right">
        <PnlCell v={totals.sinceFill.sum} />
        <PartialNote priced={totals.sinceFill.priced} total={totals.sinceFill.total} />
      </TableCell>
    </TableRow>
  );
}