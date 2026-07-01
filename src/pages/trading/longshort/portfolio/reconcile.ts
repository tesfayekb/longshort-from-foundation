/**
 * reconcile — FP-068 W1 (ACT-438) pure join helpers.
 *
 * Join key is (symbol, side). Three mismatch classes:
 *   - broker-orphan: broker holds a position not present in longshort_lots.
 *   - ledger-orphan: open lot has no matching broker position.
 *   - qty-mismatch:  both sides present but |broker.qty| != Σ lot.qty.
 *
 * Absolute-value comparison: Alpaca signs short qty negative; internal
 * ledger stores side separately with positive qty.
 */
import type { BrokerPositionRow, InternalLotRow } from './usePortfolioPositions';

export interface ReconciliationResult {
  brokerOrphans: string[];        // "SYM/side"
  ledgerOrphans: string[];        // "SYM/side"
  qtyMismatches: Array<{ key: string; brokerQty: number; ledgerQty: number }>;
  matched: number;
  brokerCount: number;
  ledgerCount: number;
}

const key = (symbol: string, side: 'long' | 'short') => `${symbol}/${side}`;

export function reconcile(
  broker: BrokerPositionRow[],
  lots: InternalLotRow[],
): ReconciliationResult {
  const brokerBy = new Map<string, number>();
  for (const p of broker) brokerBy.set(key(p.symbol, p.side), Math.abs(p.qty));

  const ledgerBy = new Map<string, number>();
  for (const l of lots) {
    const k = key(l.symbol, l.side as 'long' | 'short');
    ledgerBy.set(k, (ledgerBy.get(k) ?? 0) + Math.abs(l.qty));
  }

  const brokerOrphans: string[] = [];
  const ledgerOrphans: string[] = [];
  const qtyMismatches: ReconciliationResult['qtyMismatches'] = [];
  let matched = 0;

  for (const [k, bq] of brokerBy.entries()) {
    const lq = ledgerBy.get(k);
    if (lq === undefined) {
      brokerOrphans.push(k);
    } else if (Math.abs(bq - lq) > 1e-9) {
      qtyMismatches.push({ key: k, brokerQty: bq, ledgerQty: lq });
    } else {
      matched += 1;
    }
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

export function daysHeldFrom(entryIso: string, now: Date = new Date()): number {
  const entry = new Date(entryIso).getTime();
  if (!Number.isFinite(entry)) return 0;
  const days = (now.getTime() - entry) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(days));
}

/** Lookup a broker row by (symbol, side). Used by the Internal tab to enrich
 *  with current_price / since-fill P&L when a broker match exists. */
export function findBrokerFor(
  broker: BrokerPositionRow[],
  symbol: string,
  side: 'long' | 'short',
): BrokerPositionRow | null {
  return broker.find((p) => p.symbol === symbol && p.side === side) ?? null;
}

/** Lookup earliest matching open lot for a broker row (for days-held on the
 *  Broker tab — Alpaca returns no entry_ts). */
export function findEarliestLotFor(
  lots: InternalLotRow[],
  symbol: string,
  side: 'long' | 'short',
): InternalLotRow | null {
  let earliest: InternalLotRow | null = null;
  for (const l of lots) {
    if (l.symbol !== symbol || l.side !== side) continue;
    if (earliest === null || new Date(l.entry_ts) < new Date(earliest.entry_ts)) {
      earliest = l;
    }
  }
  return earliest;
}