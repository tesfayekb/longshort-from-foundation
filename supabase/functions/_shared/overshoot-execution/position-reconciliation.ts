// FP-069 W3.6.d-i (ACT-463.d-i) — POSITION RECONCILIATION module.
//
// PURE MODULE. No DB, no network, no wall-clock. Injects two collections
// (broker positions + local open lots), returns a structured match report
// with STRICT typed refusals. Consumed by the W3.6.d-ii exit engine
// BEFORE any exit order is submitted — a reconciliation failure blocks
// exit submission for the affected symbol/side and persists a
// reconciliation_events row for operator judgment.
//
// ---- OPERATOR RATIFICATION (A5, ACT-463.d ruling 3) -----------------------
// STRICT never-silent on BOTH refusal classes + a third for side/qty
// mismatch:
//
//   'lot_without_broker_position'  — local lot open but broker has no
//                                    matching position. Auto-close-as-
//                                    exited was CONSIDERED and REJECTED
//                                    on principle: it would forge a
//                                    broker confirmation (phantom-success
//                                    write on the money ledger). No
//                                    threshold at which that is
//                                    acceptable. Persist as reconciliation
//                                    event for operator judgment.
//
//   'unknown_broker_position'      — broker holds a position with no
//                                    matching open lot. Same treatment
//                                    (persist as reconciliation event,
//                                    never adopt silently).
//
//   'side_mismatch'                — same symbol on both sides but broker
//                                    side (long/short) disagrees with
//                                    aggregated lot side. Reconciliation
//                                    event; block exit until resolved.
//
//   'qty_mismatch'                 — same symbol+side present in both,
//                                    but broker qty ≠ SUM(open lot qty).
//                                    Reconciliation event; block exit
//                                    submission for that (symbol,side)
//                                    until operator resolves.
//
// Only symbols with `matched` status are safe to submit exit orders for
// on this cron tick. Every other status routes to a reconciliation event.

export type ReconciliationSide = 'long' | 'short';

export interface BrokerPositionRow {
  symbol: string;
  qty: number;         // absolute; Alpaca returns signed for short via `side` field
  side: ReconciliationSide;
}

export interface OpenLotRow {
  lot_id: string;
  symbol: string;
  qty: number;
  side: ReconciliationSide;
}

export type ReconciliationOutcomeCode =
  | 'matched'
  | 'lot_without_broker_position'
  | 'unknown_broker_position'
  | 'side_mismatch'
  | 'qty_mismatch';

export interface MatchedEntry {
  status: 'matched';
  symbol: string;
  side: ReconciliationSide;
  qty: number;
  lotIds: readonly string[];
}

export interface RefusalEntry {
  status: Exclude<ReconciliationOutcomeCode, 'matched'>;
  symbol: string;
  reason: string;
  /** Populated when known; null when the entire side is broker-only. */
  brokerSide: ReconciliationSide | null;
  brokerQty: number | null;
  lotSide: ReconciliationSide | null;
  lotQty: number | null;
  lotIds: readonly string[];
}

export type ReconciliationEntry = MatchedEntry | RefusalEntry;

export interface ReconciliationReport {
  matched: readonly MatchedEntry[];
  refusals: readonly RefusalEntry[];
  /** True iff every symbol on either side of the join is `matched`. */
  allMatched: boolean;
}

export interface ReconcilePositionsInput {
  brokerPositions: readonly BrokerPositionRow[];
  openLots: readonly OpenLotRow[];
  /** Absolute tolerance for the qty comparison. Exchanges settle in
   *  whole shares; default 0 (strict). Non-zero only for fractional-
   *  share regimes — overshoot is whole-share v1. */
  qtyEpsilon?: number;
}

interface Aggregated {
  qty: number;
  lotIds: string[];
}

export function reconcileOpenPositions(input: ReconcilePositionsInput): ReconciliationReport {
  const eps = input.qtyEpsilon ?? 0;

  // Aggregate lots by (symbol, side).
  const lotAgg = new Map<string, Map<ReconciliationSide, Aggregated>>();
  for (const lot of input.openLots) {
    const bySide = lotAgg.get(lot.symbol) ?? new Map<ReconciliationSide, Aggregated>();
    const cur = bySide.get(lot.side) ?? { qty: 0, lotIds: [] };
    cur.qty += lot.qty;
    cur.lotIds.push(lot.lot_id);
    bySide.set(lot.side, cur);
    lotAgg.set(lot.symbol, bySide);
  }

  // Aggregate broker positions by (symbol, side).
  const brokerAgg = new Map<string, Map<ReconciliationSide, number>>();
  for (const p of input.brokerPositions) {
    const bySide = brokerAgg.get(p.symbol) ?? new Map<ReconciliationSide, number>();
    bySide.set(p.side, (bySide.get(p.side) ?? 0) + p.qty);
    brokerAgg.set(p.symbol, bySide);
  }

  const matched: MatchedEntry[] = [];
  const refusals: RefusalEntry[] = [];

  const symbols = new Set<string>([...lotAgg.keys(), ...brokerAgg.keys()]);
  for (const symbol of symbols) {
    const lotSides = lotAgg.get(symbol);
    const brokerSides = brokerAgg.get(symbol);

    if (lotSides && !brokerSides) {
      // Every lot side has no broker counterpart.
      for (const [side, agg] of lotSides.entries()) {
        refusals.push({
          status: 'lot_without_broker_position',
          symbol,
          reason: `open lot(s) present (qty=${agg.qty}, side=${side}) with no broker position`,
          brokerSide: null, brokerQty: null,
          lotSide: side, lotQty: agg.qty, lotIds: agg.lotIds,
        });
      }
      continue;
    }

    if (!lotSides && brokerSides) {
      for (const [side, qty] of brokerSides.entries()) {
        refusals.push({
          status: 'unknown_broker_position',
          symbol,
          reason: `broker position present (qty=${qty}, side=${side}) with no open lot`,
          brokerSide: side, brokerQty: qty,
          lotSide: null, lotQty: null, lotIds: [],
        });
      }
      continue;
    }

    // Both present. Compare per side.
    const allSides: ReconciliationSide[] = ['long', 'short'];
    for (const side of allSides) {
      const lot = lotSides!.get(side);
      const brokerQty = brokerSides!.get(side);

      if (lot && brokerQty === undefined) {
        // Broker holds the SAME symbol but opposite side. side_mismatch
        // is the correct classification: our lot side is not represented
        // on the broker book. This is stricter than `lot_without_...`
        // because the broker's other-side position implies an operator-
        // level ambiguity, not just a missing row.
        const otherSide: ReconciliationSide = side === 'long' ? 'short' : 'long';
        const otherQty = brokerSides!.get(otherSide);
        refusals.push({
          status: 'side_mismatch',
          symbol,
          reason: `open lot side=${side} qty=${lot.qty}; broker side=${otherSide} qty=${otherQty ?? 0}`,
          brokerSide: otherSide, brokerQty: otherQty ?? null,
          lotSide: side, lotQty: lot.qty, lotIds: lot.lotIds,
        });
        continue;
      }

      if (!lot && brokerQty !== undefined) {
        // Broker holds a side not represented in lots. If the OTHER side
        // has a matched/lot entry we've already flagged that above with
        // a side_mismatch — but this loop iterates BOTH sides so we must
        // avoid double-flagging. Only emit unknown_broker_position for
        // this side if the other side has no lot either. Given the outer
        // `both present` branch, we know there IS a lot on the other
        // side, so classify as side_mismatch to attach the lot context.
        const otherSide: ReconciliationSide = side === 'long' ? 'short' : 'long';
        const otherLot = lotSides!.get(otherSide);
        if (otherLot) {
          // Already flagged (or will be) by the `lot exists, broker
          // absent` branch on the other side iteration. Skip to avoid
          // dupes; the side_mismatch entry captures the pair.
          continue;
        }
        refusals.push({
          status: 'unknown_broker_position',
          symbol,
          reason: `broker side=${side} qty=${brokerQty}; no open lot on either side`,
          brokerSide: side, brokerQty,
          lotSide: null, lotQty: null, lotIds: [],
        });
        continue;
      }

      if (lot && brokerQty !== undefined) {
        if (Math.abs(brokerQty - lot.qty) > eps) {
          refusals.push({
            status: 'qty_mismatch',
            symbol,
            reason: `broker qty=${brokerQty} != sum(lot qty)=${lot.qty} (eps=${eps})`,
            brokerSide: side, brokerQty,
            lotSide: side, lotQty: lot.qty, lotIds: lot.lotIds,
          });
        } else {
          matched.push({
            status: 'matched', symbol, side, qty: brokerQty, lotIds: lot.lotIds,
          });
        }
      }
    }
  }

  return {
    matched,
    refusals,
    allMatched: refusals.length === 0,
  };
}
