/**
 * Insider transactions (Signal #4) orchestrator — FP-050 Phase 2 EDGAR
 * rewiring. Daily-after-close cadence (intraday polling deferred per
 * DEC-048 review — Phase 3).
 *
 * Data acquisition (post-FP-050 rebuild):
 *
 *   1. CIK MAP fetch-per-fire (`EdgarCikMapper.loadMap`) — DEC-058 §(f1).
 *      Universe tickers that fail to resolve to a SEC CIK via the
 *      `company_tickers.json` snapshot + the hard-frozen
 *      `INSIDER_CIK_OVERRIDES` map surface as typed
 *      `ticker_to_cik_unresolved` skips. Silent mapping was the INC-70
 *      failure mode this rebuild exists to close.
 *
 *   2. DAILY-INDEX SWEEP over the trailing 90-calendar-day window
 *      [as_of − 90d, as_of] (`EdgarDailyIndexFetcher.fetchDay`). Each
 *      day's Form 4 / 4/A entries whose padded `filer_cik` matches a
 *      resolved-universe CIK10 are collected. Holiday/non-trading days
 *      return typed `unavailable` and are skipped cleanly. A throw on
 *      ANY day fails the run (`failure_reason='daily-index sweep failed:
 *      <message>'`) — the daily-index is the sole accession discovery
 *      truth-source under the (A) ruling and partial-day truncation
 *      would silently bias the window.
 *
 *   3. PER-ACCESSION INDEX.JSON discovery
 *      (`EdgarAccessionIndexFetcher.fetchIndex`) — DEC-058 §(i) ruling
 *      (A). One truth-source per accession carries BOTH the primary
 *      XML document basename AND the `acceptanceDateTime`. Selection
 *      is typed (no heuristic tiebreak); ambiguous accessions surface
 *      as per-ticker `data_unavailable` skips with the filename list
 *      in `detail`.
 *
 *   4. §(b) ACCEPTANCE GATE applied HERE (pre-XML-fetch). Accessions
 *      with `acceptance_datetime > as_of` are dropped and counted on
 *      `result.not_yet_knowable_excluded`. This closes the dual-date
 *      blind spot documented in FP-050 §22.3(e) row (e).
 *
 *   5. PER-ACCESSION FORM-4 XML FETCH + PARSE
 *      (`EdgarForm4Fetcher.fetchAndParse`). Rows are emitted in the
 *      `EdgarForm4Row` shape; the SEAM mapper at step 6 converts to the
 *      legacy `Form4Row` shape so the FP-042 compute / classifier /
 *      z-score code is reused byte-unchanged (the fence, per ACT-156).
 *
 *   6. §(h) MOST-RECENT-ACCESSION PREFERENCE. When a Form 4/A amendment
 *      supersedes a prior Form 4 row describing the same underlying
 *      transaction, the row with the latest `acceptance_datetime` wins.
 *      Dedup key: (issuer_cik, owner_cik, transaction_date,
 *      transaction_seq). Bypasses silent duplicate-counting of
 *      amended-then-restated trades.
 *
 *   7. SEAM → Form4Row. Per-row mapping is local and exhaustive (no
 *      defaults; the EdgarForm4Row contract supplies every field the
 *      compute layer reads). Rows are grouped by ticker via the CIK10
 *      reverse map; the FP-042 compute/classifier/z-score code consumes
 *      this rowsByTicker map unchanged.
 *
 * Rate-limiting: the injected `bucket` (TokenBucket at 5 rps default per
 * the SEC fair-access cap with headroom) gates BOTH the accession-index
 * GET and the Form-4 XML GET. The CIK-map and daily-index GETs are NOT
 * bucket-gated (they fire at most ~90 + 1 times per run, well under cap).
 *
 * Shares + price fetches reuse the existing Polygon fetchers for the
 * `market_cap = shares × close` denominator (no change vs FP-042).
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere
 * in this file. All timestamps derive from the injected `as_of`. The
 * rate-limit bucket's pacer is operational rate-limiting (parallel to
 * `_shared/rate-limit.ts:73`), explicitly carved out of the kernel ban.
 *
 * Owner: longshort (FP-050 Phase 2 — Signal #4 EDGAR rebuild)
 */

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
import type { PolygonPriceHistoryFetcher } from '../shared/polygon-price-history-fetcher.ts';
import { TokenBucket } from '../options-flow/token-bucket.ts';
import { EdgarCikMapper, EdgarFetchError } from './edgar-cik-mapper.ts';
import { EdgarDailyIndexFetcher } from './edgar-daily-index-fetcher.ts';
import { EdgarAccessionIndexFetcher } from './edgar-accession-index-fetcher.ts';
import { EdgarForm4Fetcher } from './edgar-form4-fetcher.ts';
import type { EdgarForm4Row } from './edgar-form4-parser.ts';
import type { Form4Row } from './form4-row-types.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'insider_transactions_90d';

const DEFAULT_CONCURRENCY = 20;
const PRICE_LOOKBACK_DAYS = 7;
/** §4.4.4 window in calendar days. The daily-index sweep enumerates each
 *  day in [as_of − WINDOW_DAYS, as_of] inclusive. */
export const WINDOW_DAYS = 90;
/** SEC fair-access self-cap: 10 rps documented; we self-cap at 5 rps to
 *  leave headroom and ensure we never hit 429. Configurable via ctx for
 *  tests (the test bucket runs at high rate with a stub sleep). */
export const DEFAULT_EDGAR_RPS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

/**
 * Context for the EDGAR-rewired insider-transactions orchestrator.
 *
 * NEW vs FP-042:
 *   - `cikMapper`, `dailyIndex`, `accessionIndex`, `form4Edgar`,
 *     `bucket` are all injectable for tests.
 *   - `form4` (the legacy Polygon fetcher) is REMOVED — its source file
 *     `polygon-form4-fetcher.ts` is deleted in this commit per DW-094.
 *
 * PRESERVED:
 *   - `sharesOutstanding`, `priceHistory` — the Polygon market-cap
 *     denominator side-inputs (compute fence per ACT-156).
 */
export interface InsiderOrchestratorContext extends SignalOrchestratorContext {
  cikMapper: EdgarCikMapper;
  dailyIndex: EdgarDailyIndexFetcher;
  accessionIndex: EdgarAccessionIndexFetcher;
  form4Edgar: EdgarForm4Fetcher;
  sharesOutstanding: PolygonSharesOutstandingFetcher;
  priceHistory: PolygonPriceHistoryFetcher;
  /**
   * Wire the 5-rps TokenBucket HERE (orchestrator is the rate-limit
   * authority boundary). Default constructor: 5 rps. Tests inject a
   * high-rate bucket with stubbed sleep for determinism.
   */
  bucket: TokenBucket;
}

/** Pad raw integer-string CIK to 10 chars (mirrors EdgarCikMapper). */
function padCik10(raw: string): string {
  return raw.padStart(10, '0');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Seam — convert one EDGAR-parsed row into the FP-042 `Form4Row` shape
 * the compute layer consumes. Per-row, exhaustive, no silent defaults.
 * `record_type` is hard-coded `'transaction'` because the EDGAR parser
 * emits ONLY non-derivative transaction rows (derivative-only filings
 * yield an empty row list per `edgar-form4-parser.ts` doc).
 */
export function mapEdgarRowToForm4Row(r: EdgarForm4Row): Form4Row {
  return {
    record_type: 'transaction',
    transaction_code: r.transaction_code,
    aff_10b5_one: r.has_10b5_1_mention,
    transaction_acquired_disposed: r.acquired_disposed,
    transaction_shares: r.shares,
    transaction_price_per_share: r.price_per_share,
    transaction_date: r.transaction_date,
    is_director: r.is_director,
    is_officer: r.is_officer,
    is_ten_percent_owner: r.is_ten_percent_owner,
    officer_title: r.officer_title,
  };
}

/**
 * §(h) most-recent-accession preference. Deduplicates rows describing
 * the same underlying transaction across a Form 4 and its 4/A amendment.
 * Key: (issuer_cik, owner_cik, transaction_date, transaction_seq).
 * Tie-break: highest `acceptance_datetime` string compare (ISO 8601 UTC
 * lex-sorts correctly).
 *
 * Exported for test-fence isolation.
 */
export function preferMostRecentAccession(rows: ReadonlyArray<EdgarForm4Row>): EdgarForm4Row[] {
  const best = new Map<string, EdgarForm4Row>();
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

export function createInsiderOrchestrator(ctx: InsiderOrchestratorContext) {
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
          `insider-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          `insider-orchestrator: universe_membership read failed: ${universeErr.message}`,
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

      const perTicker: PerTickerResult[] = [];
      let not_yet_knowable_excluded = 0;

      // ── Step 2: CIK map fetch-per-fire ────────────────────────────────
      let lookup: ReturnType<EdgarCikMapper['loadMap']> extends Promise<infer T> ? T : never;
      try {
        lookup = await ctx.cikMapper.loadMap();
      } catch (err) {
        const message = err instanceof EdgarFetchError ? err.message
          : err instanceof Error ? err.message : String(err);
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: universe.length, persisted_count: 0, skipped: [],
          failure_reason: `CIK map fetch failed: ${message}`,
          started_at, completed_at: ts,
          not_yet_knowable_excluded,
        };
      }

      // ── Step 3: reverse map cik10 → universe row; emit unresolved ─────
      const resolvedByCik10 = new Map<string, UniverseRow>();
      for (const u of universe) {
        const r = lookup(u.ticker);
        if (r.kind === 'unresolved') {
          perTicker.push({
            kind: 'skip',
            skip: {
              ticker: u.ticker,
              reason: 'ticker_to_cik_unresolved',
              detail: 'ticker missing from SEC company_tickers.json and INSIDER_CIK_OVERRIDES (DEC-058 §(f))',
            },
          });
          continue;
        }
        // First wins on CIK10 collisions (universe-table dedupe is upstream).
        if (!resolvedByCik10.has(r.cik10)) {
          resolvedByCik10.set(r.cik10, u);
        }
      }

      // ── Step 4: daily-index sweep [as_of − 90d, as_of] inclusive ──────
      // Accessions keyed by cik10 → set of accession_number; per-accession
      // form-type tracking is implicit (Form 4 and 4/A are processed
      // identically per §(h)).
      type AccessionTask = { cik10: string; accession_number: string; ticker: string };
      const tasks: AccessionTask[] = [];
      const seenAccessions = new Set<string>(); // dedupe within sweep window
      const startMs = as_of.getTime() - WINDOW_DAYS * MS_PER_DAY;
      try {
        for (let dayMs = startMs; dayMs <= as_of.getTime(); dayMs += MS_PER_DAY) {
          const d = new Date(dayMs);
          const res = await ctx.dailyIndex.fetchDay(d);
          if (res.kind === 'unavailable') continue;
          for (const entry of res.entries) {
            const cik10 = padCik10(entry.filer_cik);
            const u = resolvedByCik10.get(cik10);
            if (u === undefined) continue;
            const key = `${cik10}|${entry.accession_number}`;
            if (seenAccessions.has(key)) continue;
            seenAccessions.add(key);
            tasks.push({ cik10, accession_number: entry.accession_number, ticker: u.ticker });
          }
        }
      } catch (err) {
        const message = err instanceof EdgarFetchError ? err.message
          : err instanceof Error ? err.message : String(err);
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: universe.length, persisted_count: 0, skipped: [],
          failure_reason: `daily-index sweep failed: ${message}`,
          started_at, completed_at: ts,
          not_yet_knowable_excluded,
        };
      }

      // ── Step 5 + 6: per-accession index.json discovery + §(b) gate
      //               + Form-4 XML fetch+parse (5 rps via bucket) ────────
      const rowsByTicker = new Map<string, EdgarForm4Row[]>();
      const accessionSkipsByTicker = new Map<string, SignalSkip>(); // first ambiguous wins per ticker
      for (const task of tasks) {
        // (a) accession-index — bucket-gated.
        await ctx.bucket.acquire();
        let idxRes: Awaited<ReturnType<EdgarAccessionIndexFetcher['fetchIndex']>>;
        try {
          idxRes = await ctx.accessionIndex.fetchIndex({
            cik: task.cik10,
            accession_number: task.accession_number,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!accessionSkipsByTicker.has(task.ticker)) {
            accessionSkipsByTicker.set(task.ticker, {
              ticker: task.ticker,
              reason: 'fetch_error',
              detail: `accession-index fetch threw on ${task.accession_number}: ${message}`,
            });
          }
          continue;
        }
        if (idxRes.kind === 'unavailable' || idxRes.kind === 'rate_limited') {
          // 404 / 429 — typed; surface as soft per-ticker drop only if
          // no other accession for this ticker resolves later. We do NOT
          // emit a skip per dropped accession (that would be the INC-70
          // double-tally shape).
          continue;
        }
        if (idxRes.kind === 'ambiguous') {
          if (!accessionSkipsByTicker.has(task.ticker)) {
            accessionSkipsByTicker.set(task.ticker, {
              ticker: task.ticker,
              reason: 'data_unavailable',
              detail: `accession ${task.accession_number} primary-doc ambiguous (eligible_count=${idxRes.eligible_count}); filenames=[${idxRes.filenames.join(',')}]; acceptance_present=${idxRes.acceptance_datetime !== null}`,
            });
          }
          continue;
        }
        // (b) §(b) ACCEPTANCE GATE — drop + count if not-yet-knowable.
        if (idxRes.acceptance_datetime > ts) {
          not_yet_knowable_excluded += 1;
          continue;
        }
        // (c) Form-4 XML fetch+parse — bucket-gated.
        await ctx.bucket.acquire();
        let parsed: Awaited<ReturnType<EdgarForm4Fetcher['fetchAndParse']>>;
        try {
          parsed = await ctx.form4Edgar.fetchAndParse({
            cik: task.cik10,
            accession_number: task.accession_number,
            acceptance_datetime: idxRes.acceptance_datetime,
            primary_document: idxRes.primary_document,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!accessionSkipsByTicker.has(task.ticker)) {
            accessionSkipsByTicker.set(task.ticker, {
              ticker: task.ticker,
              reason: 'fetch_error',
              detail: `form-4 XML fetch threw on ${task.accession_number}: ${message}`,
            });
          }
          continue;
        }
        if (parsed.kind === 'rows') {
          const bucket = rowsByTicker.get(task.ticker);
          if (bucket === undefined) rowsByTicker.set(task.ticker, parsed.rows.slice());
          else for (const r of parsed.rows) bucket.push(r);
        }
        // unavailable / rate_limited / unparseable — silent drop of THIS
        // accession; other accessions for the ticker may still resolve.
      }

      // ── Step 7: §(h) most-recent-accession preference per ticker ──────
      const dedupedByTicker = new Map<string, EdgarForm4Row[]>();
      for (const [ticker, rows] of rowsByTicker.entries()) {
        dedupedByTicker.set(ticker, preferMostRecentAccession(rows));
      }

      // ── Step 8: seam → Form4Row + per-ticker filter to qualifying ─────
      // Mirrors the FP-042 fence: tickers with zero qualifying rows surface
      // as no_qualifying_transactions (the expected sparse profile).
      type QualifyingTicker = { row: UniverseRow; rows: Form4Row[]; rawRowCount: number };
      const qualifying: QualifyingTicker[] = [];
      for (const u of universe) {
        // Skip tickers already marked unresolved (already in perTicker).
        const r = lookup(u.ticker);
        if (r.kind === 'unresolved') continue;
        // Surface any per-ticker accession-discovery skip exactly once.
        const discSkip = accessionSkipsByTicker.get(u.ticker);
        if (discSkip !== undefined) {
          perTicker.push({ kind: 'skip', skip: discSkip });
          continue;
        }
        const edgarRows = dedupedByTicker.get(u.ticker) ?? [];
        const f4Rows: Form4Row[] = edgarRows.map(mapEdgarRowToForm4Row);
        const filtered = filterQualifyingTransactions(f4Rows);
        if (filtered.length === 0) {
          perTicker.push({
            kind: 'skip',
            skip: {
              ticker: u.ticker,
              reason: 'no_qualifying_transactions',
              detail: `0 qualifying transactions in trailing 90d (${f4Rows.length} parsed rows pre-filter, ${edgarRows.length} post-§(h) dedup)`,
            },
          });
          continue;
        }
        qualifying.push({ row: u, rows: f4Rows, rawRowCount: f4Rows.length });
      }

      // ── Step 9: per-qualifying-ticker shares+price + compute ──────────
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

      // ── Step 10: within-sector z-score ───────────────────────────────
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

      // ── Step 11: persist ──────────────────────────────────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(ctx.supabase, outRows);
      if (persistErr) {
        return {
          outcome: 'failed', signal_id: SIGNAL_ID, as_of_date,
          universe_size: universe.length, persisted_count: 0, skipped: skips,
          failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
          started_at, completed_at: ts,
          not_yet_knowable_excluded,
        };
      }
      return {
        outcome: 'completed', signal_id: SIGNAL_ID, as_of_date,
        universe_size: universe.length, persisted_count: inserted, skipped: skips,
        started_at, completed_at: ts,
        not_yet_knowable_excluded,
      };
    },
  };
}