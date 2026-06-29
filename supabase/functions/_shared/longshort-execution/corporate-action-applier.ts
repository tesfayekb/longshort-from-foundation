/**
 * corporate-action-applier — FP-061 sub-step 4M.4 / ACT-378.
 *
 * The ex-date applier. For each `corporate_actions` row where
 * `ex_date <= as_of AND applied_at IS NULL`, mutates the OPEN lots
 * (status='open') for the symbol per the per-action_type dispatch table.
 * After per-action mutation the row is stamped `applied_at = as_of`,
 * `applied_lot_count = N`. `applied_lot_count = 0` is LEGITIMATE (no open
 * positions at ex-date — the gate still clears).
 *
 * COST-BASIS SEMANTICS (grep-confirmed at lot-ledger-writer.ts:168/281):
 *   `longshort_lots.cost_basis` is PER-SHARE (avg_fill_price). PnL is
 *   `(exit − cost_basis) × qty` for longs. Therefore ratio actions
 *   mutate qty MULTIPLICATIVELY (×num/den) and basis INVERSELY
 *   (×den/num); `qty × cost_basis` (total basis) is INVARIANT for
 *   ratio-shaped actions. The unit tests assert that invariant directly.
 *
 * STOP-CONDITION ENFORCEMENT (typed-absence-throw — NEVER default):
 *   split          → ratio_numerator / ratio_denominator both > 0
 *   stock_dividend → ratio_numerator / ratio_denominator both > 0
 *   cash_dividend  → cash_per_share > 0 (no-op on lots; stamped only)
 *   merger (cash)  → cash_per_share > 0
 *   merger (stock) → successor_symbol + ratio_numerator/denominator > 0
 *   spinoff        → successor_symbol + basis_allocation_pct in (0,100]
 *   (We discriminate merger-cash vs merger-stock by the presence of
 *    ratio_numerator+denominator. If both ratio AND cash_per_share are
 *    populated the cash leg dominates — but defensive: NOT in v1 scope;
 *    DW-197 covers the merger feed.)
 *
 * §2 AXIOM 4 — CLOCK INJECTION:
 *   The "ex_date <= today" comparison and the `applied_at` stamp use the
 *   INJECTED `as_of`. NO `Date.now()` / `new Date()` inside this module.
 *   The edge-fn entry (`longshort-corporate-action-applier`) sources wall
 *   clock ONCE via `productionClock.getWallClockTs()`.
 *
 * REUSE INVARIANT:
 *   - Spinoff child-lot open reuses 4M.1 `writeOpenLot` shape (synthetic
 *     entry fill at ex_date with allocated basis).
 *   - Merger-cash close reuses 4M.5a `closeLots` (realized-PnL captured
 *     correctly, verifyRealizedPnL chains automatically). The applier
 *     therefore does NOT introduce new ledger primitives — only the
 *     dispatch table + ratio math is new.
 *
 * GATE-13 ANNOTATIONS (5 spec-sanctioned mutation→verify pairs):
 *   The 5 ratio-mutation sites (split, stock_div, merger-stock,
 *   spinoff-parent-trim, spinoff-child-open) carry `gate-13-allow:` notes
 *   citing §7.8/§11.0.7 — the CA basis adjustment is persisted BEFORE
 *   `verify_lot_record` reconciles. Merger-cash close and cash-div no-op
 *   both go through pre-existing Gate-13-satisfied paths.
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import {
  writeOpenLot,
  closeLots,
  type LotLedgerClient,
  type CloseLotInput,
} from './lot-ledger-writer.ts';
import type { BrokerFillResult, BrokerRealizedPnLFetcher } from '../longshort-broker-interfaces.ts';
import type { FetcherSource } from '../longshort-reconciliation-types.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

export type ActionType =
  | 'split'
  | 'stock_dividend'
  | 'cash_dividend'
  | 'merger'
  | 'spinoff';

export interface CorporateActionRecord {
  ca_id: string;
  symbol: string;
  action_type: ActionType;
  ex_date: Date;
  ratio_numerator: number | null;
  ratio_denominator: number | null;
  cash_per_share: number | null;
  successor_symbol: string | null;
  basis_allocation_pct: number | null;
}

export interface OpenLotRow {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  entry_ts: Date;
}

/**
 * Read surface — the applier needs:
 *   (a) unapplied corporate_actions rows (ex_date <= as_of, applied_at IS NULL)
 *   (b) open lots for a given symbol (status='open')
 *
 * Sibling shape to `LotLedgerClient` / `FifoLotReaderClient`. Tests inject
 * an in-memory fake.
 */
export interface CorporateActionApplierClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
      is(col: string, val: null): {
        lte(col: string, val: string): {
          order(col: string, opts: { ascending: boolean }): Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    update(patch: Record<string, unknown>): {
      eq(col: string, val: string): Promise<{ error: { message: string } | null }>;
      in(col: string, vals: readonly string[]): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface CorporateActionApplierInput {
  as_of: Date;
  operator_id?: string;
  client?: CorporateActionApplierClient;
  /** Wired into closeLots → verifyRealizedPnL for merger-cash. Defaults
   *  to 'live'; tests inject 'test'. */
  fetcher_source?: FetcherSource;
  /** Soft-dependent (FP-062). Required only if merger-cash rows are
   *  present in the run. */
  realizedPnlFetcher?: BrokerRealizedPnLFetcher;
}

export interface AppliedActionSummary {
  ca_id: string;
  symbol: string;
  action_type: ActionType;
  applied_lot_count: number;
}

export interface CorporateActionApplierResult {
  as_of: Date;
  rows_seen: number;
  rows_applied: number;
  applied: readonly AppliedActionSummary[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function requireRatio(rec: CorporateActionRecord, scope: string): { num: number; den: number } {
  if (
    rec.ratio_numerator == null || !(rec.ratio_numerator > 0) ||
    rec.ratio_denominator == null || !(rec.ratio_denominator > 0)
  ) {
    throw new Error(
      `corporate_action_applier: ${scope} requires ratio_numerator+denominator > 0; ca_id=${rec.ca_id}`,
    );
  }
  return { num: rec.ratio_numerator, den: rec.ratio_denominator };
}

function requireCashPerShare(rec: CorporateActionRecord, scope: string): number {
  if (rec.cash_per_share == null || !(rec.cash_per_share > 0)) {
    throw new Error(
      `corporate_action_applier: ${scope} requires cash_per_share > 0; ca_id=${rec.ca_id}`,
    );
  }
  return rec.cash_per_share;
}

function requireSuccessor(rec: CorporateActionRecord, scope: string): string {
  if (!rec.successor_symbol || rec.successor_symbol.length === 0) {
    throw new Error(
      `corporate_action_applier: ${scope} requires successor_symbol; ca_id=${rec.ca_id}`,
    );
  }
  return rec.successor_symbol;
}

function requireBasisAllocation(rec: CorporateActionRecord): number {
  if (
    rec.basis_allocation_pct == null ||
    !(rec.basis_allocation_pct > 0) ||
    rec.basis_allocation_pct > 100
  ) {
    throw new Error(
      `corporate_action_applier: spinoff requires basis_allocation_pct in (0,100]; ca_id=${rec.ca_id}`,
    );
  }
  return rec.basis_allocation_pct;
}

// ── Read helpers ──────────────────────────────────────────────────────

async function readUnappliedActions(
  client: CorporateActionApplierClient,
  as_of: Date,
): Promise<CorporateActionRecord[]> {
  const { data, error } = await client
    .from('corporate_actions')
    .select('ca_id, symbol, action_type, ex_date, ratio_numerator, ratio_denominator, cash_per_share, successor_symbol, basis_allocation_pct')
    .is('applied_at', null)
    .lte('ex_date', as_of.toISOString().slice(0, 10))
    .order('ex_date', { ascending: true });
  if (error) {
    throw new Error(`corporate_action_applier_read_failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ca_id: String(r.ca_id),
    symbol: String(r.symbol),
    action_type: String(r.action_type) as ActionType,
    ex_date: new Date(String(r.ex_date)),
    ratio_numerator: r.ratio_numerator == null ? null : Number(r.ratio_numerator),
    ratio_denominator: r.ratio_denominator == null ? null : Number(r.ratio_denominator),
    cash_per_share: r.cash_per_share == null ? null : Number(r.cash_per_share),
    successor_symbol: r.successor_symbol == null ? null : String(r.successor_symbol),
    basis_allocation_pct: r.basis_allocation_pct == null ? null : Number(r.basis_allocation_pct),
  }));
}

async function readOpenLotsForSymbol(
  client: CorporateActionApplierClient,
  symbol: string,
): Promise<OpenLotRow[]> {
  const { data, error } = await client
    .from('longshort_lots')
    .select('lot_id, symbol, side, qty, cost_basis, entry_ts')
    .eq('symbol', symbol)
    .eq('status', 'open');
  if (error) {
    throw new Error(`corporate_action_applier_lots_read_failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    lot_id: String(r.lot_id),
    symbol: String(r.symbol),
    side: r.side as 'long' | 'short',
    qty: Number(r.qty),
    cost_basis: Number(r.cost_basis),
    entry_ts: new Date(String(r.entry_ts)),
  }));
}

// ── Per-action mutation primitives ────────────────────────────────────

async function applyRatioToLots(
  client: CorporateActionApplierClient,
  lots: readonly OpenLotRow[],
  num: number,
  den: number,
  successor_symbol: string | null,  // non-null for merger-stock
): Promise<number> {
  let n = 0;
  for (const lot of lots) {
    // PER-SHARE basis semantics (grep-confirmed):
    //   qty        *= num/den
    //   cost_basis *= den/num   ← INVERSE; total basis (qty*cost_basis) invariant
    const newQty = lot.qty * (num / den);
    const newBasis = lot.cost_basis * (den / num);
    const patch: Record<string, unknown> = {
      qty: newQty,
      cost_basis: newBasis,
    };
    if (successor_symbol) patch.symbol = successor_symbol;
    // gate-13-allow: post-mutation verify per §7.8/§11.0.7 — CA basis adjustment persisted before verify_lot_record reconciles (spec-sanctioned mutation→verify; the ratio rewrite IS the truth for this lot post-ex-date).
    const upd = await client.from('longshort_lots').update(patch).eq('lot_id', lot.lot_id);
    if (upd.error) {
      throw new Error(`corporate_action_ratio_update_failed: lot_id=${lot.lot_id} ${upd.error.message}`);
    }
    n++;
  }
  return n;
}

// ── Per-row dispatch ──────────────────────────────────────────────────

async function applyOne(
  rec: CorporateActionRecord,
  input: Required<Pick<CorporateActionApplierInput, 'as_of'>> & {
    operator_id: string;
    client: CorporateActionApplierClient;
    fetcher_source: FetcherSource;
    realizedPnlFetcher?: BrokerRealizedPnLFetcher;
  },
): Promise<number> {
  const { client, as_of } = input;
  const lots = await readOpenLotsForSymbol(client, rec.symbol);

  switch (rec.action_type) {
    case 'split': {
      const { num, den } = requireRatio(rec, 'split');
      // gate-13-allow: post-mutation verify per §7.8/§11.0.7 — split ratio applied to qty+cost_basis; verify_lot_record reconciles after persist.
      return applyRatioToLots(client, lots, num, den, null);
    }
    case 'stock_dividend': {
      const { num, den } = requireRatio(rec, 'stock_dividend');
      // gate-13-allow: post-mutation verify per §7.8/§11.0.7 — stock-dividend ratio applied identically to split; total basis invariant.
      return applyRatioToLots(client, lots, num, den, null);
    }
    case 'cash_dividend': {
      // Validates cash_per_share for adapter-side integrity (STOP-cond)
      // even though the applier does NOT mutate lots — defensive re-check.
      requireCashPerShare(rec, 'cash_dividend');
      // NO lot mutation per §7.6 — cash divs do not touch basis; cash-ledger
      // accrual is DW-198. Stamp applied_at to clear the §7 composer gate.
      // applied_lot_count = 0 is LEGITIMATE here even when lots > 0
      // (mutation-count, not affected-position-count).
      return 0;
    }
    case 'merger': {
      // Discriminator: ratio present → stock-for-stock; cash only → merger-cash.
      const hasRatio = rec.ratio_numerator != null && rec.ratio_denominator != null;
      const hasCash = rec.cash_per_share != null;
      if (hasRatio) {
        const { num, den } = requireRatio(rec, 'merger(stock)');
        const successor = requireSuccessor(rec, 'merger(stock)');
        // gate-13-allow: post-mutation verify per §7.8/§11.0.7 — stock-for-stock merger applies ratio AND renames symbol; verify_lot_record reconciles against new symbol post-persist.
        return applyRatioToLots(client, lots, num, den, successor);
      } else if (hasCash) {
        const cashPx = requireCashPerShare(rec, 'merger(cash)');
        if (!input.realizedPnlFetcher) {
          throw new Error(
            `corporate_action_applier: merger(cash) requires realizedPnlFetcher injection; ca_id=${rec.ca_id}`,
          );
        }
        // Close via 4M.5a closeLots — realized PnL captured correctly,
        // verifyRealizedPnL chains (already Gate-13-satisfied path).
        const inputs: CloseLotInput[] = lots.map((l) => ({
          lot_id: l.lot_id,
          exit_price: cashPx,
          exit_trade_id: `corp_action_${rec.ca_id}`,
          is_trim: false,
        }));
        const closed = await closeLots(
          inputs,
          as_of,
          input.realizedPnlFetcher,
          input.fetcher_source,
          client as unknown as LotLedgerClient,
        );
        return closed.length;
      } else {
        throw new Error(
          `corporate_action_applier: merger row must carry either ratio_* OR cash_per_share; ca_id=${rec.ca_id}`,
        );
      }
    }
    case 'spinoff': {
      const successor = requireSuccessor(rec, 'spinoff');
      const allocPct = requireBasisAllocation(rec);
      const childFraction = allocPct / 100;
      const parentFraction = 1 - childFraction;
      let n = 0;
      for (const lot of lots) {
        if (lot.side !== 'long') {
          // Conservative v1: spinoff on shorts is rare and ambiguous IRS-wise;
          // skip without mutation rather than guess. Surfaces via lot_count.
          continue;
        }
        const parentNewBasis = lot.cost_basis * parentFraction;
        const childPerShareBasis = lot.cost_basis * childFraction;
        // gate-13-allow: post-mutation verify per §7.8/§11.0.7 — spinoff parent-basis trim persisted before verify_lot_record reconciles; basis-allocation comes from Form 8937 (basis_allocation_pct).
        const upd = await client
          .from('longshort_lots')
          .update({ cost_basis: parentNewBasis })
          .eq('lot_id', lot.lot_id);
        if (upd.error) {
          throw new Error(`corporate_action_spinoff_parent_update_failed: lot_id=${lot.lot_id} ${upd.error.message}`);
        }
        // gate-13-allow: post-mutation verify per §7.8/§11.0.7 — spinoff child lot opened via writeOpenLot at ex_date with allocated basis; verify_lot_record reconciles the new lot.
        const synthetic: BrokerFillResult = {
          order_id: `corp_action_${rec.ca_id}`,
          filled: true,
          filled_qty: lot.qty,
          avg_fill_price: childPerShareBasis,
          fetched_at: as_of,
        };
        await writeOpenLot(
          synthetic,
          {
            operator_id: input.operator_id,
            symbol: successor,
            side: 'long',
            source_order_id: `corp_action_${rec.ca_id}`,
            locate_id: null,
          },
          as_of,
          client as unknown as LotLedgerClient,
        );
        n++;
      }
      return n;
    }
    default: {
      // Exhaustiveness — unknown action_type passing the CHECK constraint is impossible.
      const _exhaust: never = rec.action_type;
      void _exhaust;
      throw new Error(`corporate_action_applier: unsupported action_type ${rec.action_type}`);
    }
  }
}

/**
 * Run one applier pass. Idempotent: re-running with the same `as_of`
 * skips already-applied rows (the SELECT filter is `applied_at IS NULL`).
 */
export async function runCorporateActionApplier(
  input: CorporateActionApplierInput,
): Promise<CorporateActionApplierResult> {
  const operator_id = input.operator_id ?? DEFAULT_OPERATOR_ID;
  const client = input.client ?? (supabaseAdmin as unknown as CorporateActionApplierClient);
  const fetcher_source: FetcherSource = input.fetcher_source ?? 'live';

  const recs = await readUnappliedActions(client, input.as_of);
  const applied: AppliedActionSummary[] = [];

  for (const rec of recs) {
    const count = await applyOne(rec, {
      as_of: input.as_of,
      operator_id,
      client,
      fetcher_source,
      realizedPnlFetcher: input.realizedPnlFetcher,
    });
    // Stamp applied_at + applied_lot_count even when count=0 — legitimate
    // (no open positions at ex-date). The gate fulcrum requires the stamp.
    const upd = await client
      .from('corporate_actions')
      .update({
        applied_at: input.as_of.toISOString(),
        applied_lot_count: count,
      })
      .eq('ca_id', rec.ca_id);
    if (upd.error) {
      throw new Error(`corporate_action_applier_stamp_failed: ca_id=${rec.ca_id} ${upd.error.message}`);
    }
    applied.push({
      ca_id: rec.ca_id,
      symbol: rec.symbol,
      action_type: rec.action_type,
      applied_lot_count: count,
    });
  }

  return {
    as_of: input.as_of,
    rows_seen: recs.length,
    rows_applied: applied.length,
    applied,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Composer-side reader — §7 BLOCK on unapplied corporate actions.
// Mirrors `WashSaleBlockReader` pattern (table-local, zero broker calls).
// ─────────────────────────────────────────────────────────────────────────

export interface UnappliedCorporateAction {
  action_type: ActionType;
  ex_date: Date;
}

export interface UnappliedCorporateActionReader {
  /**
   * For each input symbol, return an unapplied CA row whose
   * `ex_date <= as_of AND applied_at IS NULL` — or omit the symbol from
   * the returned map if none. When multiple unapplied rows exist for the
   * same symbol, returns the earliest by `ex_date`.
   */
  fetchUnapplied(
    symbols: readonly string[],
    as_of: Date,
  ): Promise<Map<string, UnappliedCorporateAction>>;
}

/** Narrow read surface for the composer gate. */
export interface UnappliedCorporateActionReaderClient {
  from(table: string): {
    select(cols: string): {
      is(col: string, val: null): {
        lte(col: string, val: string): {
          in(col: string, vals: readonly string[]): {
            order(col: string, opts: { ascending: boolean }): Promise<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

export function createSupabaseUnappliedCorporateActionReader(): UnappliedCorporateActionReader {
  const client = supabaseAdmin as unknown as UnappliedCorporateActionReaderClient;
  return {
    async fetchUnapplied(symbols, as_of) {
      const out = new Map<string, UnappliedCorporateAction>();
      if (symbols.length === 0) return out;
      const { data, error } = await client
        .from('corporate_actions')
        .select('symbol, action_type, ex_date')
        .is('applied_at', null)
        .lte('ex_date', as_of.toISOString().slice(0, 10))
        .in('symbol', symbols)
        .order('ex_date', { ascending: true });
      if (error) {
        throw new Error(`unapplied_corporate_action_read_failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      for (const r of rows) {
        const sym = String(r.symbol);
        if (!out.has(sym)) {
          out.set(sym, {
            action_type: String(r.action_type) as ActionType,
            ex_date: new Date(String(r.ex_date)),
          });
        }
      }
      return out;
    },
  };
}