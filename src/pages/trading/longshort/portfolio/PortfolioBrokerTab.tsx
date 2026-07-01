/**
 * PortfolioBrokerTab — FP-068 W1 (ACT-438).
 *
 * BROKER-TRUTH mirror of the Alpaca paper account /v2/positions. Glance row:
 *   symbol · side badge · days-held · entry → mark · daily P&L · since-fill P&L.
 *
 * days-held is derived from the earliest matching internal lot's entry_ts
 * (Alpaca does not return a fill timestamp on /v2/positions). Typed-absence
 * ("—") when there is no matching lot or the field is null; NEVER fabricated 0.
 */
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { daysHeldFrom, findEarliestLotFor } from './reconcile';
import type { BrokerPositionRow, InternalLotRow } from './usePortfolioPositions';

interface Props {
  positions: BrokerPositionRow[];
  lots: InternalLotRow[];
  isLoading: boolean;
}

const fmtUsd = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const fmtPrice = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`;

function PnlCell({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const cls =
    v > 0
      ? 'text-green-600 dark:text-green-500'
      : v < 0
        ? 'text-red-600 dark:text-red-500'
        : 'text-muted-foreground';
  return <span className={`font-mono ${cls}`}>{fmtUsd(v)}</span>;
}

export function PortfolioBrokerTab({ positions, lots, isLoading }: Props) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        BROKER-TRUTH — a mirror of the Alpaca paper account. Distinct from the
        reconciled internal ledger tab.
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
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Loading…
                </TableCell>
              </TableRow>
            ) : positions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No open broker positions.
                </TableCell>
              </TableRow>
            ) : (
              positions.map((p) => {
                const lot = findEarliestLotFor(lots, p.symbol, p.side);
                const days = lot ? daysHeldFrom(lot.entry_ts) : null;
                return (
                  <TableRow key={`${p.symbol}-${p.side}`}>
                    <TableCell className="font-mono font-medium">{p.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant={p.side === 'long' ? 'default' : 'secondary'}
                        className="uppercase text-[10px]"
                      >
                        {p.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Math.abs(p.qty).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {days === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        `${days}d`
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPrice(p.avg_entry_price)} → {fmtPrice(p.current_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      <PnlCell v={p.unrealized_intraday_pl} />
                    </TableCell>
                    <TableCell className="text-right">
                      <PnlCell v={p.unrealized_pl} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}