/**
 * PortfolioInternalTab — FP-068 W1 (ACT-438).
 *
 * Reconciled internal ledger view over open longshort_lots. Since-fill P&L
 * is computed from the matched broker current_price when a match exists;
 * otherwise "—" (typed-absence — the internal ledger does not carry a mark).
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
import { daysHeldFrom, findBrokerFor } from './reconcile';
import { PnlCell, sumPriced, type SideFilter } from '@/components/trading/portfolio/format';
import { SideFilterControl } from '@/components/trading/portfolio/SideFilterControl';
import type { BrokerPositionRow, InternalLotRow } from './usePortfolioPositions';

interface Props {
  lots: InternalLotRow[];
  positions: BrokerPositionRow[];
  isLoading: boolean;
}

/**
 * cost_basis in longshort_lots is stored as per-share basis (see the FIFO
 * writer). If a future migration switches to total-dollars basis, this
 * derivation must be revisited. Since-fill P&L is only computable when a
 * matched broker position provides a current_price mark.
 */
function sinceFillPnl(
  lot: InternalLotRow,
  broker: BrokerPositionRow | null,
): number | null {
  if (broker === null || broker.current_price === null) return null;
  const sign = lot.side === 'long' ? 1 : -1;
  return (broker.current_price - lot.cost_basis) * lot.qty * sign;
}

export function PortfolioInternalTab({ lots, positions, isLoading }: Props) {
  const [filter, setFilter] = useState<SideFilter>('all');
  const filtered = useMemo(
    () => (filter === 'all' ? lots : lots.filter((l) => l.side === filter)),
    [lots, filter],
  );
  const enriched = useMemo(
    () =>
      filtered.map((l) => {
        const side = l.side as 'long' | 'short';
        const broker = findBrokerFor(positions, l.symbol, side);
        return { lot: l, side, broker, pnl: sinceFillPnl(l, broker) };
      }),
    [filtered, positions],
  );
  const totals = useMemo(() => computeBookTotals(enriched), [enriched]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Reconciled internal ledger — open lots in longshort_lots. Since-fill
          P&amp;L is derived from the matched broker mark when available;
          otherwise not shown.
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
              <TableHead className="text-right">Cost basis</TableHead>
              <TableHead className="text-right">Since-fill P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            ) : enriched.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  {lots.length === 0 ? 'No open internal lots.' : `No ${filter} internal lots.`}
                </TableCell>
              </TableRow>
            ) : (
              enriched.map(({ lot: l, side, pnl }) => (
                  <TableRow key={l.lot_id}>
                    <TableCell className="font-mono font-medium">{l.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant={side === 'long' ? 'default' : 'secondary'}
                        className="uppercase text-[10px]"
                      >
                        {side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Math.abs(l.qty).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {daysHeldFrom(l.entry_ts)}d
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${l.cost_basis.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PnlCell v={pnl} />
                    </TableCell>
                  </TableRow>
              ))
            )}
          </TableBody>
          {!isLoading && enriched.length > 0 ? (
            <TableFooter>
              <BookTotalRow label="Long book" totals={totals.long} show={filter !== 'short'} />
              <BookTotalRow label="Short book" totals={totals.short} show={filter !== 'long'} />
              <BookTotalRow label="Net" totals={totals.net} show={filter === 'all'} bold />
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}

interface Enriched {
  lot: InternalLotRow;
  side: 'long' | 'short';
  broker: BrokerPositionRow | null;
  pnl: number | null;
}

function computeBookTotals(rows: Enriched[]) {
  const bucket = (side: 'long' | 'short' | 'all') => {
    const subset = side === 'all' ? rows : rows.filter((r) => r.side === side);
    return {
      count: subset.length,
      sinceFill: sumPriced(subset.map((r) => r.pnl)),
    };
  };
  return { long: bucket('long'), short: bucket('short'), net: bucket('all') };
}

function PartialNote({ priced, total }: { priced: number; total: number }) {
  if (total === 0 || priced === total) return null;
  return (
    <span className="ml-1 text-[10px] text-muted-foreground">
      ({priced} of {total} priced)
    </span>
  );
}

function BookTotalRow({
  label,
  totals,
  show,
  bold,
}: {
  label: string;
  totals: { count: number; sinceFill: ReturnType<typeof sumPriced> };
  show: boolean;
  bold?: boolean;
}) {
  if (!show || totals.count === 0) return null;
  const cls = bold ? 'font-semibold' : '';
  return (
    <TableRow className={cls}>
      <TableCell colSpan={5} className="text-right text-xs uppercase tracking-wide text-muted-foreground">
        {label} · {totals.count} {totals.count === 1 ? 'lot' : 'lots'}
      </TableCell>
      <TableCell className="text-right">
        <PnlCell v={totals.sinceFill.sum} />
        <PartialNote priced={totals.sinceFill.priced} total={totals.sinceFill.total} />
      </TableCell>
    </TableRow>
  );
}