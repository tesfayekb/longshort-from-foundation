/**
 * PortfolioInternalTab — FP-068 W1 (ACT-438).
 *
 * Reconciled internal ledger view over open longshort_lots. Since-fill P&L
 * is computed from the matched broker current_price when a match exists;
 * otherwise "—" (typed-absence — the internal ledger does not carry a mark).
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
import { daysHeldFrom, findBrokerFor } from './reconcile';
import type { BrokerPositionRow, InternalLotRow } from './usePortfolioPositions';

interface Props {
  lots: InternalLotRow[];
  positions: BrokerPositionRow[];
  isLoading: boolean;
}

const fmtUsd = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

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
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Reconciled internal ledger — open lots in longshort_lots. Since-fill
        P&amp;L is derived from the matched broker mark when available;
        otherwise not shown.
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
            ) : lots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No open internal lots.
                </TableCell>
              </TableRow>
            ) : (
              lots.map((l) => {
                const side = l.side as 'long' | 'short';
                const broker = findBrokerFor(positions, l.symbol, side);
                const pnl = sinceFillPnl(l, broker);
                return (
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}