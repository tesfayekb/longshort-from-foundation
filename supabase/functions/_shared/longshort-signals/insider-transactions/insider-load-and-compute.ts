/**
 * insider-load-and-compute.ts — FP-050 Phase 3.6b.ii″ extraction.
 *
 * Consumer-callable load+compute module for Signal #4 (insider transactions
 * 90-day, 14-day decay). Reads pre-populated rows from `insider_form4_rows`
 * (work-list producer's substrate — registration lands in 3.6b.iii′),
 * applies the §(b) acceptance gate as a SQL `WHERE` filter, applies the
 * §(h) most-recent-accession preference at read time, seams to the
 * preserved FP-042 `Form4Row` shape, runs the byte-unchanged compute /
 * filter / classifier / z-score, and persists to `signal_observations`.
 *
 * Lift provenance (Q-A ruling 2026-06-12):
 *   - `preferMostRecentAccession` is the FORMER `insider-orchestrator.ts`
 *     export, moved verbatim — byte-for-byte against the four-part key
 *     `(issuer_cik, owner_cik, transaction_date, transaction_seq)` per
 *     DEC-058 §(h). MIG-095 (ACT-191) added `owner_cik` to the persisted
 *     row so the four-part key is fully reconstructable from the table.
 *   - The compute (`computeInsiderSignal` / `filterQualifyingTransactions`
 *     / `classifyRoleWeight`) is the FP-042 reuse fence — imported, not
 *     touched.
 *   - The §(b) gate is applied as the SQL `WHERE acceptance_datetime <=
 *     as_of` clause (semantically identical to the prior in-memory gate;
 *     parity asserted by fixture in the companion test file).
 *
 * Mass-balance invariant (the 839 balance, name-scope ledger per Q4):
 *   `universe_size === persisted_count + skipped.length + zero_value_persisted`
 *   where `zero_value_persisted` are rows the compute returned for and
 *   the z-score retained (singleton-sector / std=0 → null becomes a skip).
 *   The two-ledger note from `insider-transactions.md` §3.6b.i applies:
 *   item-level skips (per-accession permanent failures) land in
 *   `signal_queue_skips` (engine, producer side, 3.6b.iii′); consumer
 *   name-level skips land in the `skipped` array here.
 *
 * `not_yet_knowable_excluded`: the SQL §(b) gate excludes rows with
 * `acceptance_datetime > as_of` silently. We do NOT issue a second COUNT
 * query to surface that figure on `SignalOrchestratorResult`; per Q4 the
 * acceptance-look-ahead surface moves to producer-side run-meta
 * (`signal_queue_runs`) in 3.6b.iii′. This field is set to `0` for shape-
 * compatibility with the optional `SignalOrchestratorResult` slot.
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere
 * in this file. All timestamps derive from the injected `as_of`.
 *
 * Owner: longshort (FP-050 Phase 3.6b.ii″ — extraction)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip, SignalSkipReason } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { computeInsiderSignal, filterQualifyingTransactions } from './compute-insider.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { PolygonSharesOutstandingFetcher } from '../shared/polygon-shares-outstanding-fetcher.ts';
import type { Form4Row } from './form4-row-types.ts';

/** Locked signal-id. Moved from the deleted `insider-orchestrator.ts`
 *  verbatim (FP-050 Phase 3.6b.ii″). Do not rename. */
export const SIGNAL_ID = 'insider_transactions_90d';

/** §4.4.4 window — 90 calendar days. */
export const WINDOW_DAYS = 90;

const PRICE_LOOKBACK_DAYS = 7;
const DEFAULT_CONCURRENCY = 20;
/** SQL pagination page size. Supabase PostgREST default cap is 1000;
 *  we read in 1000-row pages until exhaustion. */
export const READ_PAGE_SIZE = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

/**
 * Shape of one `insider_form4_rows` row read by `loadAndCompute`. Mirrors
 * the live-DB column list verified at MIG-094 + MIG-095 (ACT-190 + ACT-191).
 * The `owner_cik` column landed in MIG-095 specifically to support the
 * four-part §(h) preference key.
 */
export interface InsiderRowFromTable {
  issuer_cik: string;
  owner_cik: string;
  accession_number: string;
  transaction_seq: number;
  transaction_date: string;            // ISO YYYY-MM-DD
  acceptance_datetime: string;         // ISO 8601 UTC
  transaction_code: string;
  transaction_acquired_disposed: string;
  transaction_shares: number;
  transaction_price_per_share: number | null;
  aff_10b5_one: boolean;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  officer_title: string | null;
  ticker: string;
}

/**
 * Context for the load+compute consumer. Subset of the FP-042 orchestrator
 * context — no EDGAR fetchers, no TokenBucket, no daily-index sweeper
 * (those moved to the work-list producer in 3.6b.iii′). The Polygon shares
 * fetcher remains here for the market-cap denominator side-input; the
 * priceHistory fetcher is inherited from `SignalOrchestratorContext`.
 */
export interface InsiderLoadAndComputeContext extends SignalOrchestratorContext {
  sharesOutstanding: PolygonSharesOutstandingFetcher;
}

/**
 * §(h) most-recent-accession preference. Deduplicates rows describing the
 * same underlying transaction across a Form 4 and its 4/A amendment.
 *
 * Key (four-part — MIG-095 makes `owner_cik` reconstructable from the
 * persisted row): `(issuer_cik, owner_cik, transaction_date, transaction_seq)`.
 * Tie-break: highest `acceptance_datetime` (ISO 8601 UTC lex-sorts).
 *
 * Lift provenance: moved verbatim from the now-deleted
 * `insider-orchestrator.ts:185-199` (FP-042 origin). The R1 collision
 * (silent three-part dedup) is falsified-forever by the regression
 * fixture in the companion test file.
 */
export function preferMostRecentAccession<T extends {
  issuer_cik: string;
  owner_cik: string;
  transaction_date: string;
  transaction_seq: number;
  acceptance_datetime: string;
}>(rows: ReadonlyArray<T>): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const key = `${r.issuer_cik}|${r.owner_cik}|${r.transaction_date}|${r.transaction_seq}`;
    const existing = best.get(key);
    if (existing === undefined) {
      best.set(key, r);
      continue;
    }
    if (r.acceptance_datetime > existing.acceptance_datetime) {
      best.set(key, r);
    }
  }
  return Array.from(best.values());
}

/**
 * Seam mapper: `insider_form4_rows` row → FP-042 `Form4Row` shape consumed
 * by `compute-insider.ts`. `record_type` is hard-coded `'transaction'`
 * because the producer only persists non-derivative transaction rows
 * (mirrors `mapEdgarRowToForm4Row` from the deleted orchestrator).
 *
 * `transaction_price_per_share` is nullable on the persisted row (the
 * EDGAR parser can emit null prices for some grant-style codes that the
 * compute layer already drops via the P/S filter); coerce to `0` here so
 * the typed contract holds, and rely on the compute's downstream
 * `dollars === 0` filter to drop the row honestly. `officer_title` null
 * → empty string (the classifier already tolerates absent titles).
 */
export function mapInsiderRowToForm4Row(r: InsiderRowFromTable): Form4Row {
  return {
    record_type: 'transaction',
    transaction_code: r.transaction_code,
    aff_10b5_one: r.aff_10b5_one,
    transaction_acquired_disposed: r.transaction_acquired_disposed,
    transaction_shares: r.transaction_shares,
    transaction_price_per_share: r.transaction_price_per_share ?? 0,
    transaction_date: r.transaction_date,
    is_director: r.is_director,
    is_officer: r.is_officer,
    is_ten_percent_owner: r.is_ten_percent_owner,
    officer_title: r.officer_title ?? '',
  };
}

/**
 * Paginated 90-day read of `insider_form4_rows` with SQL §(b) acceptance
 * gate. Reads in `READ_PAGE_SIZE`-row pages until exhausted; throws on any
 * PostgREST error (the orchestrator's `outcome:'failed'` boundary).
 *
 * The SQL `WHERE` clauses applied:
 *   - `ticker IN (...)`                          — universe scope
 *   - `transaction_date >= as_of − 90d`          — §4.4.4 decay window
 *   - `acceptance_datetime <= as_of`             — §(b) acceptance gate
 *
 * Parity claim: the prior in-memory §(b) gate at the deleted orchestrator
 * step 5(b) was `if (idxRes.acceptance_datetime > ts) { excluded += 1;
 * continue; }` — a strict `>` filter. The SQL `<=` is the boolean
 * complement, semantically identical. Asserted by fixture in the
 * companion test file (the boundary pair: acceptance===as_of included,
 * acceptance > as_of excluded).
 */
export async function readInsiderRowsWindow(
  supabase: SupabaseClient,
  tickers: string[],
  as_of: Date,
): Promise<InsiderRowFromTable[]> {
  if (tickers.length === 0) return [];
  const startMs = as_of.getTime() - WINDOW_DAYS * MS_PER_DAY;
  const startDateIso = new Date(startMs).toISOString().slice(0, 10);
  const asOfIso = as_of.toISOString();

  const rows: InsiderRowFromTable[] = [];
  let offset = 0;
  // deno-lint-ignore no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('insider_form4_rows')
      .select([
        'issuer_cik', 'owner_cik', 'accession_number', 'transaction_seq',
        'transaction_date', 'acceptance_datetime',
        'transaction_code', 'transaction_acquired_disposed',
        'transaction_shares', 'transaction_price_per_share', 'aff_10b5_one',
        'is_director', 'is_officer', 'is_ten_percent_owner',
        'officer_title', 'ticker',
      ].join(', '))
      .in('ticker', tickers)
      .gte('transaction_date', startDateIso)
      .lte('acceptance_datetime', asOfIso)
      .order('acceptance_datetime', { ascending: true })
      .range(offset, offset + READ_PAGE_SIZE - 1);
    if (error) {
      throw new Error(
        `insider-load-and-compute: insider_form4_rows read failed: ${error.message}`,
      );
    }
    const batch = (data ?? []) as InsiderRowFromTable[];
    for (const r of batch) rows.push(r);
    if (batch.length < READ_PAGE_SIZE) break;
    offset += READ_PAGE_SIZE;
  }
  return rows;
}

/**
 * Constructor. Returns an object with `run(as_of)` that produces a
 * `SignalOrchestratorResult`. Mirrors the FP-042 orchestrator's surface
 * so consumers (cron handler, manual handler, queue finalizer in
 * 3.6b.iii′) can swap call-sites mechanically.
 */
export function createInsiderLoadAndCompute(ctx: InsiderLoadAndComputeContext) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Step 1: load current universe ─────────────────────────────────
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);
      if (latestErr) {
        throw new Error(
          `insider-load-and-compute: universe_membership latest-date read failed: ${latestErr.message}`,
        );
      }
      const latest_as_of_date = latestRows && latestRows.length > 0
        ? (latestRows[0] as { as_of_date: string }).as_of_date
        : null;
      if (latest_as_of_date === null) {
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: 0, persisted_count: 0, skipped: [],
          failure_reason: 'empty_universe',
          started_at, completed_at: ts,
          not_yet_knowable_excluded: 0,
        };
      }
      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', latest_as_of_date);
      if (universeErr) {
        throw new Error(
          `insider-load-and-compute: universe_membership read failed: ${universeErr.message}`,
        );
      }
      const universe = (universeRows ?? []) as UniverseRow[];
      if (universe.length === 0) {
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: 0, persisted_count: 0, skipped: [],
          failure_reason: 'empty_universe',
          started_at, completed_at: ts,
          not_yet_knowable_excluded: 0,
        };
      }

      // ── Step 2: paginated 90-day read of insider_form4_rows ───────────
      const tickers = universe.map((u) => u.ticker);
      let allRows: InsiderRowFromTable[];
      try {
        allRows = await readInsiderRowsWindow(ctx.supabase, tickers, as_of);
      } catch (e) {
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: universe.length, persisted_count: 0, skipped: [],
          failure_reason: e instanceof Error ? e.message : String(e),
          started_at, completed_at: ts,
          not_yet_knowable_excluded: 0,
        };
      }

      // ── Step 3: group by ticker → §(h) preference → seam ──────────────
      const rowsByTicker = new Map<string, InsiderRowFromTable[]>();
      for (const r of allRows) {
        const b = rowsByTicker.get(r.ticker);
        if (b === undefined) rowsByTicker.set(r.ticker, [r]);
        else b.push(r);
      }
      const dedupedByTicker = new Map<string, InsiderRowFromTable[]>();
      for (const [t, rs] of rowsByTicker.entries()) {
        dedupedByTicker.set(t, preferMostRecentAccession(rs));
      }

      // ── Step 4: per-ticker filter → qualifying set ────────────────────
      const perTicker: PerTickerResult[] = [];
      type QualifyingTicker = { row: UniverseRow; rows: Form4Row[] };
      const qualifying: QualifyingTicker[] = [];
      for (const u of universe) {
        const tableRows = dedupedByTicker.get(u.ticker) ?? [];
        const f4Rows: Form4Row[] = tableRows.map(mapInsiderRowToForm4Row);
        const filtered = filterQualifyingTransactions(f4Rows);
        if (filtered.length === 0) {
          perTicker.push({
            kind: 'skip',
            skip: {
              ticker: u.ticker,
              reason: 'no_qualifying_transactions',
              detail: `0 qualifying transactions in trailing 90d (${f4Rows.length} parsed rows pre-filter, ${tableRows.length} post-§(h) dedup)`,
            },
          });
          continue;
        }
        qualifying.push({ row: u, rows: f4Rows });
      }

      // ── Step 5: per-qualifying-ticker shares+price + compute ──────────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const computed = await pLimitedMap<QualifyingTicker, PerTickerResult>(
        qualifying,
        concurrency,
        async ({ row, rows }) => {
          const { ticker, gics_sector } = row;
          try {
            const [sharesResult, priceResult] = await Promise.all([
              ctx.sharesOutstanding.fetchShares(ticker),
              ctx.priceHistory.fetchPriceHistory(ticker, as_of, PRICE_LOOKBACK_DAYS),
            ]);
            if (sharesResult.kind === 'unavailable') {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'missing_shares_outstanding',
                  detail: sharesResult.reason === 'subscription_gated'
                    ? 'polygon 403: reference endpoint not entitled (shares-outstanding unavailable)'
                    : 'polygon reference endpoint returned no usable share_class_shares_outstanding',
                },
              };
            }
            if (priceResult === null || priceResult.length === 0) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'data_unavailable',
                  detail: priceResult === null
                    ? 'polygon 404: ticker missing from reference (likely delisted)'
                    : `no price bars in trailing ${PRICE_LOOKBACK_DAYS}d window`,
                },
              };
            }
            const shares = sharesResult.shares;
            const lastClose = priceResult[priceResult.length - 1].close;
            if (
              !Number.isFinite(shares) || shares <= 0 ||
              !Number.isFinite(lastClose) || lastClose <= 0
            ) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'missing_shares_outstanding',
                  detail: `defensive: shares=${shares} close=${lastClose} not positive-finite`,
                },
              };
            }
            const market_cap = shares * lastClose;
            const res = computeInsiderSignal(rows, as_of, market_cap);
            if (res === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'no_qualifying_transactions',
                  detail: `0 role-classifiable rows after filter (${rows.length} raw rows pre-filter)`,
                },
              };
            }
            return { kind: 'value', ticker, raw_signal: res.raw_signal, gics_sector };
          } catch (err) {
            const message = err instanceof SignalComputationError ? err.message
              : err instanceof Error ? err.message : String(err);
            return {
              kind: 'skip',
              skip: { ticker, reason: 'fetch_error', detail: message },
            };
          }
        },
      );
      for (const r of computed) perTicker.push(r);

      // ── Step 6: within-sector z-score ─────────────────────────────────
      const values = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'value' }> => r.kind === 'value')
        .map((r) => ({ ticker: r.ticker, value: r.raw_signal, gics_sector: r.gics_sector }));
      const skips: SignalSkip[] = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'skip' }> => r.kind === 'skip')
        .map((r) => r.skip);
      const zScored = zScoreNormalizeWithinSector(values);
      const computed_at = ts;
      const outRows: SignalRow[] = [];
      for (const z of zScored) {
        if (z.value === null) {
          const reason: SignalSkipReason =
            z.gics_sector === null ? 'missing_sector' : 'singleton_sector';
          skips.push({
            ticker: z.ticker,
            reason,
            detail: z.gics_sector
              ? `sector="${z.gics_sector}" yielded std=0`
              : 'gics_sector is null',
          });
          continue;
        }
        outRows.push({
          operator_id: ctx.operator_id,
          signal_id: SIGNAL_ID,
          ticker: z.ticker,
          as_of_date,
          value: z.value,
          is_present: true,
          gics_sector: z.gics_sector,
          computed_at,
        });
      }

      // ── Step 7: persist ───────────────────────────────────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(ctx.supabase, outRows);
      if (persistErr) {
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: universe.length, persisted_count: 0, skipped: skips,
          failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
          started_at, completed_at: ts,
          not_yet_knowable_excluded: 0,
        };
      }
      return {
        outcome: 'completed', signal_id: SIGNAL_ID, as_of_date,
        universe_size: universe.length, persisted_count: inserted, skipped: skips,
        started_at, completed_at: ts,
        not_yet_knowable_excluded: 0,
      };
    },
  };
}