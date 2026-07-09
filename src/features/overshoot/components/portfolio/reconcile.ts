/**
 * Overshoot portfolio reconcile helpers — ACT-491 (1)(3).
 *
 * Overshoot-owned copy of the longshort reconcile join (INC-77
 * duplicate-primitive discipline — no cross-strategy import). Join key is
 * (symbol, side). Three mismatch classes: broker-orphan, ledger-orphan,
 * qty-mismatch. Days-held is a display-only helper (see comment).
 */
import type {
  OvershootBrokerPositionRow,
  OvershootInternalLotRow,
} from '../../hooks/useOvershootPortfolioPositions';

export interface OvershootReconciliationResult {
  brokerOrphans: string[];
  ledgerOrphans: string[];
  qtyMismatches: Array<{ key: string; brokerQty: number; ledgerQty: number }>;
  matched: number;
  brokerCount: number;
  ledgerCount: number;
}

const key = (symbol: string, side: 'long' | 'short') => `${symbol}/${side}`;

export function reconcileOvershoot(
  broker: OvershootBrokerPositionRow[],
  lots: OvershootInternalLotRow[],
): OvershootReconciliationResult {
  const brokerBy = new Map<string, number>();
  for (const p of broker) brokerBy.set(key(p.symbol, p.side), Math.abs(p.qty));

  const ledgerBy = new Map<string, number>();
  for (const l of lots) {
    const k = key(l.symbol, l.side);
    ledgerBy.set(k, (ledgerBy.get(k) ?? 0) + Math.abs(l.qty));
  }

  const brokerOrphans: string[] = [];
  const ledgerOrphans: string[] = [];
  const qtyMismatches: OvershootReconciliationResult['qtyMismatches'] = [];
  let matched = 0;

  for (const [k, bq] of brokerBy.entries()) {
    const lq = ledgerBy.get(k);
    if (lq === undefined) brokerOrphans.push(k);
    else if (Math.abs(bq - lq) > 1e-9) qtyMismatches.push({ key: k, brokerQty: bq, ledgerQty: lq });
    else matched += 1;
  }
  for (const k of ledgerBy.keys()) {
    if (!brokerBy.has(k)) ledgerOrphans.push(k);
  }

  return {
    brokerOrphans: brokerOrphans.sort(),
    ledgerOrphans: ledgerOrphans.sort(),
    qtyMismatches: qtyMismatches.sort((a, b) => a.key.localeCompare(b.key)),
    matched,
    brokerCount: broker.length,
    ledgerCount: lots.length,
  };
}

// Frontend display-only helper (no money-path effect); wall-clock allowed
// per `scripts/check-wall-clock.ts` scope (src/pages/** / feature components).
export function daysHeldFrom(entryIso: string, now: Date = new Date()): number {
  const entry = new Date(entryIso).getTime();
  if (!Number.isFinite(entry)) return 0;
  const days = (now.getTime() - entry) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(days));
}

export function findEarliestLotFor(
  lots: OvershootInternalLotRow[],
  symbol: string,
  side: 'long' | 'short',
): OvershootInternalLotRow | null {
  let earliest: OvershootInternalLotRow | null = null;
  for (const l of lots) {
    if (l.symbol !== symbol || l.side !== side) continue;
    if (earliest === null || new Date(l.entry_ts) < new Date(earliest.entry_ts)) earliest = l;
  }
  return earliest;
}

export function findBrokerFor(
  broker: OvershootBrokerPositionRow[],
  symbol: string,
  side: 'long' | 'short',
): OvershootBrokerPositionRow | null {
  return broker.find((p) => p.symbol === symbol && p.side === side) ?? null;
}