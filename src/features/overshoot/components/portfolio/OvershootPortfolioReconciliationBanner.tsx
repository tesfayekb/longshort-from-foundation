/**
 * OvershootPortfolioReconciliationBanner — ACT-491 (3).
 *
 * Sits above the Portfolio tabs and surfaces broker-vs-internal
 * divergence. §2 axiom made visible: reconciliation is a UI element,
 * not hidden. Uses the client-side reconcile (join on symbol+side)
 * over the same data the tabs render.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { reconcileOvershoot } from './reconcile';
import type {
  OvershootBrokerPositionRow,
  OvershootInternalLotRow,
} from '../../hooks/useOvershootPortfolioPositions';

interface Props {
  broker: OvershootBrokerPositionRow[];
  lots: OvershootInternalLotRow[];
}

export function OvershootPortfolioReconciliationBanner({ broker, lots }: Props) {
  const result = useMemo(() => reconcileOvershoot(broker, lots), [broker, lots]);
  const [open, setOpen] = useState(false);

  const hasDivergence =
    result.brokerOrphans.length > 0 ||
    result.ledgerOrphans.length > 0 ||
    result.qtyMismatches.length > 0;

  const summary = `${result.brokerCount} broker / ${result.ledgerCount} internal`;

  if (!hasDivergence) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500 shrink-0" />
        <div className="text-sm">
          <span className="font-medium">Reconciled</span>
          <span className="text-muted-foreground"> — {summary}, matched ✓</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
        <div className="text-sm flex-1">
          <span className="font-medium">Mismatch</span>
          <span className="text-muted-foreground"> — {summary}</span>
          <span className="ml-3 inline-flex gap-2">
            {result.brokerOrphans.length > 0 && <Badge variant="outline" className="text-xs">broker-orphan: {result.brokerOrphans.length}</Badge>}
            {result.ledgerOrphans.length > 0 && <Badge variant="outline" className="text-xs">ledger-orphan: {result.ledgerOrphans.length}</Badge>}
            {result.qtyMismatches.length > 0 && <Badge variant="outline" className="text-xs">qty-mismatch: {result.qtyMismatches.length}</Badge>}
          </span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
          <DivergenceList title="Broker-orphan" hint="Broker holds a position that the internal ledger does not." items={result.brokerOrphans} />
          <DivergenceList title="Ledger-orphan" hint="Open lot has no matching broker position." items={result.ledgerOrphans} />
          <DivergenceList title="Qty-mismatch" hint="Both sides present; |broker.qty| != Σ lot.qty." items={result.qtyMismatches.map((m) => `${m.key} (broker ${m.brokerQty} / ledger ${m.ledgerQty})`)} />
        </div>
      )}
    </div>
  );
}

function DivergenceList({ title, hint, items }: { title: string; hint: string; items: string[] }) {
  return (
    <div className="rounded border border-border bg-background/50 p-2">
      <div className="font-medium">{title}</div>
      <div className="text-muted-foreground mb-1">{hint}</div>
      {items.length === 0 ? (
        <div className="text-muted-foreground/70">—</div>
      ) : (
        <ul className="font-mono space-y-0.5">{items.map((it) => <li key={it}>{it}</li>)}</ul>
      )}
    </div>
  );
}