/**
 * Analyst Revision Drift (Signal #1) orchestrator — FP-047 Phase 3.
 *
 * Architecture (Branch A+H per FP-047 Phase-0 closure — SINGLE-INVOCATION;
 * NO queue engine):
 *
 *   Stage 1 (discovery): the FmpPriceTargetFeedFetcher pages
 *     `/stable/price-target-latest-news` for trailing 30d vs as_of (~37
 *     calls under default 40-page cap with limit=100). All fetcher HTTP
 *     calls are routed through ONE shared TokenBucket sized at
 *     750 req/min × 0.85 ≈ 10.625 req/s (Catalog #39 + FP-044 lesson:
 *     one bucket per vendor, never one-per-fetcher).
 *
 *   Stage 2 (history): for EACH universe symbol with ≥1 in-window focal
 *     event, ONE call to FmpPriceTargetHistoryFetcher
 *     `/stable/price-target-news?symbol={t}` recovers prior targets for
 *     `findSameAnalystPrior`. Bounded-concurrency via `pLimitedMap` at
 *     `concurrency` (default 6) — token-bucket below caps aggregate rps.
 *
 *   Stage 3 (compute): per-symbol `computeAnalystRevision` (CROSSWIND
 *     §4.4.5 verbatim). Universe symbols with zero in-window focal events
 *     emit a typed `no_revisions_in_window` skip so the mass-balance
 *     identity holds: |values| + |skips| = |universe|.
 *
 *   Stage 4 (persist): within-sector GICS z-score via the shared
 *     normalizer (±3 clip + typed-absence semantics — DO NOT
 *     reimplement), `captureSignalObservations` upsert, then the cron /
 *     manual handler writes `signal_compute_log` via
 *     `persistSignalComputeLog`.
 *
 * ─── Pre-flight arithmetic (BOTH bounds — Catalog #39 binding) ────────
 *
 * Universe = 839 (worst case = every name has a focal event in window).
 * FMP Premium cap = 750 req/min; budget = 750 × 0.85 = 637.5/min ≈ 10.625
 * req/s. Feed paging: 37 calls typical, 40 cap.
 *
 *   Rate-bound (single-bucket floor):
 *     typical H≈100 → (37 + 100) / 10.625 ≈ 12.9 s
 *     worst   H=839 → (37 + 839) / 10.625 ≈ 82.4 s
 *
 *   Latency-bound (observed ~400 ms / call, concurrency C = 6):
 *     typical → (37 + 100) × 0.4 / 6 ≈ 9.1 s
 *     worst   → (37 + 839) × 0.4 / 6 ≈ 58.4 s
 *
 * Worst-case binding bound is the rate-bound floor (82.4 s) — under the
 * 150 s HTTP wall with ≈45 % headroom. Earnings-season clustering raises
 * H toward the worst case; the worst-case row is the operating guarantee.
 *
 * ─── Wall-clock discipline (DEC-034 clause 4) ─────────────────────────
 * NO wall-clock reads in this file. All timestamps derive from the
 * injected `as_of` parameter. The shared TokenBucket has its own
 * internal `productionClock` for pacing (operational rate-limiting is
 * NOT a strategy-decision kernel — see token-bucket.ts header).
 *
 * Owner: longshort (FP-047 Phase 3 — Signal #1)
 */
import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type {
  SignalRow,
  SignalSkip,
} from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { FmpPriceTargetFeedFetcher } from './fmp-price-target-feed-fetcher.ts';
import type { FmpPriceTargetHistoryFetcher } from './fmp-price-target-history-fetcher.ts';
import {
  computeAnalystRevision,
  type AnalystRevisionMeta,
} from './compute-analyst-revision.ts';
import type { RawPriceTargetRow } from './analyst-identity.ts';

/** Locked signal_id (matches signal_registry row). Do NOT rename. */
export const SIGNAL_ID = 'analyst_revision_drift';

/**
 * Default bounded-concurrency for history fetches. Token-bucket caps the
 * aggregate rps at 10.625; concurrency 6 keeps queue depth low while
 * still saturating the bucket under typical latency (≈400 ms/call).
 */
const DEFAULT_CONCURRENCY = 6;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerSymbolResult =
  | {
      kind: 'value';
      ticker: string;
      raw_signal: number;
      gics_sector: string | null;
      meta: AnalystRevisionMeta;
    }
  | { kind: 'skip'; skip: SignalSkip };

/**
 * Context extension — drops `priceHistory` (Signal #1 has no Polygon
 * price-history input) and injects the two FMP fetchers (feed +
 * per-symbol history). Both fetchers must already be wrapped with the
 * shared TokenBucket-paced httpFetch at the handler boundary.
 */
export interface AnalystRevisionOrchestratorContext
  extends Omit<SignalOrchestratorContext, 'priceHistory'> {
  feed: FmpPriceTargetFeedFetcher;
  history: FmpPriceTargetHistoryFetcher;
}

export function createAnalystRevisionOrchestrator(
  ctx: AnalystRevisionOrchestratorContext,
) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Stage 0: load current universe (mirrors pead-orchestrator) ──
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);
      if (latestErr) {
        throw new Error(
          `analyst-revision-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
        );
      }
      const latest_as_of_date =
        latestRows && latestRows.length > 0
          ? (latestRows[0] as { as_of_date: string }).as_of_date
          : null;
      if (latest_as_of_date === null) {
        return emptyUniverseResult(as_of_date, started_at, ts);
      }
      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', latest_as_of_date);
      if (universeErr) {
        throw new Error(
          `analyst-revision-orchestrator: universe_membership read failed: ${universeErr.message}`,
        );
      }
      const universe = (universeRows ?? []) as UniverseRow[];
      if (universe.length === 0) {
        return emptyUniverseResult(as_of_date, started_at, ts);
      }
      const universeBySymbol = new Map<string, UniverseRow>();
      for (const u of universe) universeBySymbol.set(u.ticker, u);

      // ── Stage 1: feed-paged discovery ──────────────────────────────
      let feedRowsBySymbol: Map<string, RawPriceTargetRow[]>;
      try {
        const feedResult = await ctx.feed.fetchFeed(as_of);
        if (feedResult.kind === 'unavailable') {
          // Vendor-wide gating / rate-limit on the discovery endpoint —
          // we cannot derive any in-window focal events; every universe
          // member becomes a typed skip. Distinguish gating reasons.
          const reason = feedResult.reason === 'subscription_gated'
            ? 'subscription_gated'
            : feedResult.reason === 'rate_limited'
            ? 'fetch_error'
            : 'data_unavailable';
          const skips: SignalSkip[] = universe.map((u) => ({
            ticker: u.ticker,
            reason,
            detail: `fmp feed unavailable: ${feedResult.reason}`,
          }));
          return {
            outcome: 'completed',
            signal_id: SIGNAL_ID,
            as_of_date,
            universe_size: universe.length,
            persisted_count: 0,
            skipped: skips,
            started_at,
            completed_at: ts,
          };
        }
        feedRowsBySymbol = groupFeedRowsByUniverseSymbol(
          feedResult.rows,
          universeBySymbol,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: universe.length,
          persisted_count: 0,
          skipped: [],
          failure_reason: `feed_fetch_failed: ${message}`,
          started_at,
          completed_at: ts,
        };
      }

      // Symbols with focal events → require history fetch. Symbols
      // without → typed skip `no_revisions_in_window` directly.
      const symbolsNeedingHistory: UniverseRow[] = [];
      const noWindowSkips: SignalSkip[] = [];
      for (const u of universe) {
        const rows = feedRowsBySymbol.get(u.ticker);
        if (rows === undefined || rows.length === 0) {
          noWindowSkips.push({
            ticker: u.ticker,
            reason: 'no_revisions_in_window',
            detail: '0 focal revisions in trailing 30d feed window',
          });
        } else {
          symbolsNeedingHistory.push(u);
        }
      }

      // ── Stage 2+3: per-symbol history fetch + compute (bounded) ────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perSymbol = await pLimitedMap<UniverseRow, PerSymbolResult>(
        symbolsNeedingHistory,
        concurrency,
        async (u): Promise<PerSymbolResult> => {
          const focalRows = feedRowsBySymbol.get(u.ticker) ?? [];
          try {
            const hist = await ctx.history.fetchHistory(u.ticker, as_of);
            if (hist.kind === 'unavailable') {
              const reason: SignalSkip['reason'] =
                hist.reason === 'subscription_gated'
                  ? 'subscription_gated'
                  : hist.reason === 'rate_limited'
                  ? 'fetch_error'
                  : 'revision_prior_unavailable';
              return {
                kind: 'skip',
                skip: {
                  ticker: u.ticker,
                  reason,
                  detail: `fmp history unavailable: ${hist.reason}`,
                },
              };
            }
            const result = computeAnalystRevision({
              focalRows,
              history: hist.rows,
              asOf: as_of,
            });
            if (result.kind === 'skip') {
              return {
                kind: 'skip',
                skip: {
                  ticker: u.ticker,
                  reason: result.reason,
                  detail: result.detail,
                },
              };
            }
            return {
              kind: 'value',
              ticker: u.ticker,
              raw_signal: result.raw,
              gics_sector: u.gics_sector,
              meta: result.meta,
            };
          } catch (err) {
            const message =
              err instanceof SignalComputationError
                ? err.message
                : err instanceof Error
                ? err.message
                : String(err);
            return {
              kind: 'skip',
              skip: {
                ticker: u.ticker,
                reason: 'fetch_error',
                detail: message,
              },
            };
          }
        },
      );

      // ── Stage 4a: within-sector z-score ────────────────────────────
      const values = perSymbol
        .filter((r): r is Extract<PerSymbolResult, { kind: 'value' }> => r.kind === 'value')
        .map((r) => ({ ticker: r.ticker, value: r.raw_signal, gics_sector: r.gics_sector }));
      const skips: SignalSkip[] = [
        ...noWindowSkips,
        ...perSymbol
          .filter((r): r is Extract<PerSymbolResult, { kind: 'skip' }> => r.kind === 'skip')
          .map((r) => r.skip),
      ];

      const zScored = zScoreNormalizeWithinSector(values);

      // ── Stage 4b: SignalRow build + sector-related typed skips ─────
      const computed_at = ts;
      const rows: SignalRow[] = [];
      for (const z of zScored) {
        if (z.value === null) {
          skips.push({
            ticker: z.ticker,
            reason: z.gics_sector === null ? 'missing_sector' : 'singleton_sector',
            detail: z.gics_sector
              ? `sector="${z.gics_sector}" yielded std=0`
              : 'gics_sector is null',
          });
          continue;
        }
        rows.push({
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

      // ── Stage 4c: persist ──────────────────────────────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(
        ctx.supabase,
        rows,
      );
      if (persistErr) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: universe.length,
          persisted_count: 0,
          skipped: skips,
          failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
          started_at,
          completed_at: ts,
        };
      }

      return {
        outcome: 'completed',
        signal_id: SIGNAL_ID,
        as_of_date,
        universe_size: universe.length,
        persisted_count: inserted,
        skipped: skips,
        started_at,
        completed_at: ts,
      };
    },
  };
}

function emptyUniverseResult(
  as_of_date: string,
  started_at: string,
  ts: string,
): SignalOrchestratorResult {
  return {
    outcome: 'failed',
    signal_id: SIGNAL_ID,
    as_of_date,
    universe_size: 0,
    persisted_count: 0,
    skipped: [],
    failure_reason: 'empty_universe',
    started_at,
    completed_at: ts,
  };
}

/**
 * Group feed rows into a `Map<symbol, rows[]>`, dropping any symbol not
 * in the universe (the feed is global; we only score names we own).
 * Pure — no clock, no I/O.
 */
function groupFeedRowsByUniverseSymbol(
  rows: ReadonlyArray<RawPriceTargetRow>,
  universeBySymbol: ReadonlyMap<string, UniverseRow>,
): Map<string, RawPriceTargetRow[]> {
  const out = new Map<string, RawPriceTargetRow[]>();
  for (const r of rows) {
    if (!universeBySymbol.has(r.symbol)) continue;
    const bucket = out.get(r.symbol) ?? [];
    bucket.push(r);
    out.set(r.symbol, bucket);
  }
  return out;
}