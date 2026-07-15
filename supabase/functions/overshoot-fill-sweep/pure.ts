// ACT-489 — pure helpers extracted for unit tests (mirrors parse-as-of-date
// pattern: no Deno.serve, no side-effects at import, no --allow-net needed).

export const OVERSHOOT_FILL_SWEEP_VERSION = 'act493-v1-t3b-exit-adoption-20260715';
export const OVERSHOOT_FILL_SWEEP_DISCOVERY_QUERY_FINGERPRINT = 'sha256:inc90-created-at-window-action-order-id-v2+onconflict-partial-predicate';
// ACT-493 v1 Turn 3B — pinned fingerprint for the exit-fill discovery query.
// Matches action LIKE 'overshoot.exit.submitted.%' scoped by created_at within
// a 14-day session-date window, then joined to open lots via metadata->>'lot_ids'.
export const OVERSHOOT_FILL_SWEEP_EXIT_DISCOVERY_QUERY_FINGERPRINT =
  'sha256:act493-v1-t3b-exit-submitted-window-order-id-lot-ids-v1';
// Regex identifying our own exit CIDs — byte-identical to overshoot-exit-run's
// OVERSHOOT_EXIT_CID_REGEX. Re-declared here so pure helpers don't import the
// exit-run handler module. Any drift is caught by the canary test below.
export const OVERSHOOT_EXIT_CID_REGEX_STRING =
  '^ovs-[0-9a-f]{8}-([A-Z0-9.]{1,10})-([LS])-(exit_time|exit_manual)-\\d+$';

/** YYYY-MM-DD in America/New_York for an instant. DST-safe. */
export function toEtSessionDate(ts: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(ts);
}

export interface A5Diff {
  symbol: string;
  side: string;
  broker_qty: number | null;
  ledger_qty: number | null;
}

export interface DiscoveryAuditFixtureRow {
  action: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface DiscoveryCandidateFixtureRow {
  order_id: string;
  ticker: string;
  side: 'long' | 'short';
  client_order_id: string;
  run_id: string | null;
}

/** Compare two (symbol|side)→qty maps; return symmetric-diff rows. */
export function computeA5SymmetricDiff(
  broker: Map<string, { side: string; qty: number }>,
  ledger: Map<string, { side: string; qty: number }>,
): A5Diff[] {
  const diffs: A5Diff[] = [];
  const keys = new Set<string>([...broker.keys(), ...ledger.keys()]);
  for (const k of Array.from(keys).sort()) {
    const b = broker.get(k) ?? null;
    const l = ledger.get(k) ?? null;
    const bQty = b ? b.qty : null;
    const lQty = l ? l.qty : null;
    const bSide = b ? b.side : (l ? l.side : '');
    const lSide = l ? l.side : (b ? b.side : '');
    const symbol = k.split('|')[0] ?? k;
    if (bQty === null || lQty === null || Math.abs((bQty ?? 0) - (lQty ?? 0)) > 1e-9 || bSide !== lSide) {
      diffs.push({ symbol, side: bSide || lSide, broker_qty: bQty, ledger_qty: lQty });
    }
  }
  return diffs;
}

export function shouldSuppressPauseForDiscoveryShortfall(args: {
  candidatesDiscovered: number;
  brokerCount: number;
  ledgerCount: number;
}): boolean {
  return args.candidatesDiscovered === 0 && args.ledgerCount === 0 && args.brokerCount > 0;
}

export function shouldInvokePauseForA5Divergence(args: {
  diffCount: number;
  dryRun: boolean;
  discoveryShortfall: boolean;
}): boolean {
  return args.diffCount > 0 && !args.dryRun && !args.discoveryShortfall;
}

// ─────────────────────────────────────────────────────────────────────
// ACT-493 v1 Turn 3B — M7 exit-fill allocation (pure, side-effect-free).
//
// CONTRACT (operator-ratified overfill-safety rules):
//   (a) The delta to distribute this pass = broker.filled_qty (order-level
//       cumulative) − Σ (per-lot filled_qty already recorded across the
//       order's lot_ids). This is race-safe under FOR UPDATE lot locks
//       (see index.ts M7 loop).
//   (b) If ANY per-lot allocation would push its filled_qty above its
//       original `qty`, we HALT the entire order's application and emit a
//       typed audit `overshoot.exit_fill_overflow` (severity HIGH). We do
//       NOT silently clamp — a clamp would hide the defect class the
//       in-flight guard exists to prevent (double-submit / CID collision).
//   (c) exit_attempts resets to 0 on ANY per-lot fill (partial included)
//       per M4a intent: the counter measures CONSECUTIVE FRUITLESS
//       attempts, and a partial fill is fruit.
//
// A5 SET-EQUALITY: after M7, broker positions are compared against
// SUM(remaining_qty) — not SUM(qty) — because closed / partially-filled
// lots may still carry status='open' but with reduced residuals. See the
// A5 query in index.ts (SUM(remaining_qty) as qty).
// ─────────────────────────────────────────────────────────────────────

export interface ExitFillAllocationInputLot {
  lot_id: string;
  qty: number;
  filled_qty: number;
  remaining_qty: number;
}

export interface ExitFillAllocationResult {
  overflow: boolean;
  overflow_reason?: string;
  broker_filled_qty: number;
  already_applied_total: number;
  delta_to_apply: number;
  per_lot_deltas: Array<{ lot_id: string; delta_qty: number; will_close: boolean }>;
  unallocated_residual: number;
}

/**
 * Allocate a broker-order fill across the order's lot_ids in order.
 * Never mutates inputs. Returns `overflow=true` when the applied total for
 * any lot would exceed its original `qty` (double-submit signature) — the
 * caller MUST halt that order's application and emit the HIGH-severity
 * `overshoot.exit_fill_overflow` audit rather than clamping.
 */
export function allocateExitFillToLots(args: {
  brokerFilledQty: number;
  lots: ReadonlyArray<ExitFillAllocationInputLot>;
}): ExitFillAllocationResult {
  const alreadyAppliedTotal = args.lots.reduce((s, l) => s + l.filled_qty, 0);
  const delta = args.brokerFilledQty - alreadyAppliedTotal;
  const result: ExitFillAllocationResult = {
    overflow: false,
    broker_filled_qty: args.brokerFilledQty,
    already_applied_total: alreadyAppliedTotal,
    delta_to_apply: delta,
    per_lot_deltas: [],
    unallocated_residual: 0,
  };
  if (delta <= 0) return result;
  let remaining = delta;
  for (const lot of args.lots) {
    if (remaining <= 0) break;
    // Per-lot headroom before overflow: how much MORE this lot can absorb
    // without exceeding its ORIGINAL qty. If broker allocates more than
    // headroom, that's the overflow signature — halt, do not clamp.
    const headroom = lot.qty - lot.filled_qty;
    if (headroom < 0) {
      result.overflow = true;
      result.overflow_reason =
        `lot_${lot.lot_id}_filled_qty_exceeds_qty: filled=${lot.filled_qty} qty=${lot.qty}`;
      return result;
    }
    const allocate = Math.min(remaining, lot.remaining_qty);
    // Overflow signature: if the broker's total delta would force us to
    // allocate MORE to this lot than its headroom, halt.
    if (allocate > headroom + 1e-9) {
      result.overflow = true;
      result.overflow_reason =
        `lot_${lot.lot_id}_would_overfill: proposed_delta=${allocate} headroom=${headroom}`;
      return result;
    }
    if (allocate > 0) {
      const willClose = Math.abs(lot.remaining_qty - allocate) < 1e-9;
      result.per_lot_deltas.push({
        lot_id: lot.lot_id,
        delta_qty: allocate,
        will_close: willClose,
      });
      remaining -= allocate;
    }
  }
  // Residual means: the broker filled MORE than the sum of all lots'
  // remaining_qty could absorb — a distinct overflow class (broker
  // over-filled beyond the total order intent). Halt, do not clamp.
  if (remaining > 1e-9) {
    result.overflow = true;
    result.overflow_reason =
      `broker_over_filled_order: unallocated_residual=${remaining} across ${args.lots.length} lot(s)`;
    result.unallocated_residual = remaining;
  }
  return result;
}

/**
 * Weighted-average exit price update, incorporating a new delta at the
 * broker's order-level `filled_avg_price`. Pure — used by the M7 UPDATE
 * body-in-SQL as authoritative math the DB path must match.
 */
export function nextAvgExitPrice(args: {
  prevFilledQty: number;
  prevAvgExitPrice: number | null;
  deltaQty: number;
  brokerAvgFillPrice: number;
}): number {
  if (args.prevFilledQty === 0 || args.prevAvgExitPrice === null) {
    return args.brokerAvgFillPrice;
  }
  const total = args.prevFilledQty + args.deltaQty;
  if (total <= 0) return args.prevAvgExitPrice;
  return (
    (args.prevAvgExitPrice * args.prevFilledQty +
      args.brokerAvgFillPrice * args.deltaQty) /
    total
  );
}

/**
 * Realized P&L increment for a per-lot exit-fill delta.
 * LONG:  delta_qty * (exit_price − entry_avg_price)
 * SHORT: delta_qty * (entry_avg_price − exit_price)
 */
export function realizedPnlDelta(args: {
  side: 'long' | 'short';
  deltaQty: number;
  brokerAvgFillPrice: number;
  entryAvgPrice: number;
}): number {
  const sign = args.side === 'long' ? 1 : -1;
  return sign * args.deltaQty * (args.brokerAvgFillPrice - args.entryAvgPrice);
}

export function discoverCandidateRowsForTest(
  rows: DiscoveryAuditFixtureRow[],
  sessionDate: string,
  existingSourceOrderIds: ReadonlySet<string>,
): DiscoveryCandidateFixtureRow[] {
  const start = Date.parse(`${sessionDate}T00:00:00.000Z`) - 14 * 24 * 60 * 60 * 1000;
  const end = Date.parse(`${sessionDate}T00:00:00.000Z`) + 2 * 24 * 60 * 60 * 1000;
  const byOrderId = new Map<string, DiscoveryCandidateFixtureRow>();
  for (const row of rows) {
    if (row.action !== 'overshoot.entry.submitted.entry') continue;
    const createdAt = Date.parse(row.created_at);
    if (!Number.isFinite(createdAt) || createdAt < start || createdAt >= end) continue;
    const orderId = asNonEmptyString(row.metadata.order_id);
    if (!orderId || existingSourceOrderIds.has(orderId)) continue;
    const ticker = asNonEmptyString(row.metadata.ticker);
    const side = asSide(row.metadata.side);
    const clientOrderId = asNonEmptyString(row.metadata.client_order_id);
    if (!ticker || !side || !clientOrderId) continue;
    byOrderId.set(orderId, {
      order_id: orderId,
      ticker,
      side,
      client_order_id: clientOrderId,
      run_id: asNonEmptyString(row.metadata.run_id),
    });
  }
  return Array.from(byOrderId.values()).sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asSide(value: unknown): 'long' | 'short' | null {
  return value === 'long' || value === 'short' ? value : null;
}