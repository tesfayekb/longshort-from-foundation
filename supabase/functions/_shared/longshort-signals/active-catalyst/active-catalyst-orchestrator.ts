/**
 * Active Catalyst Flag (Signal #9) orchestrator — FP-049 Phase 3a.
 *
 * Architecture: SINGLE-INVOCATION (FP-047 shape). Ratified by the
 * Phase-3 arithmetic gate (supervisor ruling 2026-06-13, see
 * `docs/04-modules/longshort/signals/active-catalyst-flag.md §6` —
 * arithmetic row reproduced verbatim). Catalyst is calendar-shaped,
 * not feed-shaped; ≈ 8–13 vendor calls per fire; news-page sequential
 * drain inside the Polygon bucket dominates at ≈ 31–55 s end-to-end,
 * ≥ 65 s headroom under the 120 s STOP gate and ≥ 95 s under the
 * 150 s HTTP wall. Does NOT use the FP-045 queue-worker engine.
 *
 * ─── Per-vendor TokenBucket pacing (multi-vendor first in this repo) ──
 *
 * One TokenBucket per VENDOR (Catalog #39 generalized): three independent
 * buckets are constructed at the handler boundary and shared by every
 * fetcher that hits that vendor:
 *
 *   FMP      — 750 req/min × 0.85 ≈ 10.625 req/s
 *              (shared by earnings-calendar + M&A + grades fetchers)
 *   Polygon  — 10 req/s × 0.85 = 8.5 req/s (DEC-056 self-imposed cap)
 *              (shared by splits + dividends + news-keyword pages)
 *   Finnhub  — 300 req/min × 0.85 = 4.25 req/s
 *              (FDA-advisory fetcher only)
 *
 * Concurrent dispatch ACROSS vendors via `Promise.all`; serial drain
 * WITHIN each vendor by the bucket itself. Tradier is invoked only as
 * the DEC-057 §(i) typed-fallback — no bucket required at v1 (0 calls
 * in normal operation).
 *
 * ─── Pipeline ─────────────────────────────────────────────────────────
 *
 *   Stage 0  Universe load (mirrors analyst-revision-orchestrator —
 *            latest `universe_membership.as_of_date` then rows).
 *   Stage 1  Window construction. `window_start_at =
 *            nthPrecedingTradingDay(as_of, 5)` per §4.4.9 trailing
 *            5-trading-day window (DEC-057 §(f)). v1 approximation:
 *            weekends only — exchange holidays NOT modelled; documented
 *            in the module doc §(window-arithmetic) as a bounded
 *            shortfall (≤ 1 trading day per double-holiday week,
 *            absorbed by the 48 h earnings half-life envelope).
 *   Stage 2  Concurrent fetch across vendors (Promise.all):
 *              FMP    — earnings-calendar | M&A | grades
 *              Polygon — splits | dividends | news-keyword (pages)
 *              Finnhub — FDA-advisory
 *            Each fetcher returns `CatalystFetchResult` (events |
 *            unavailable). Per-vendor `unavailable` does NOT abort the
 *            run — the missing rows simply do not contribute events.
 *   Stage 3  Tradier typed-fallback (DEC-057 §(i)). Invoked iff EITHER
 *            Polygon splits OR dividends returned `unavailable`. Chunked
 *            per `TRADIER_MAX_SYMBOLS_PER_CALL`. Sets
 *            `tradier_fallback_invoked=true` in catalyst_meta.
 *   Stage 4  `classifyCatalystEvents` — vendor-precedence dedup
 *            (structured > keyword) + 1 h-bucket cross-vendor dedup +
 *            look-ahead gate + window lower bound. News-keyword
 *            rows are pre-classified (they already arrive as
 *            `RawCatalystEventInput` with `source='keyword'`); the
 *            classifier is invoked with `structured = (all rows
 *            including pre-classified keyword)`, `news = []` so its
 *            single dedup pass authoritatively resolves precedence.
 *   Stage 5  Per-ticker `computeActiveCatalyst` (CROSSWIND §4.4.9
 *            verbatim). Universe members with zero in-window events
 *            emit a typed `no_catalyst_events_in_window` skip so
 *            `|values| + |skips| = |universe|` (mass balance).
 *   Stage 6  Within-sector GICS z-score (±3 clip, typed-absence
 *            semantics) via the shared normalizer. NO mean-subtract
 *            in compute; the panel-level z-normalization centers.
 *   Stage 7  `captureSignalObservations` upsert. Handler writes
 *            `signal_compute_log` via `persistSignalComputeLog`.
 *
 * ─── Wall-clock discipline (DEC-034 clause 4, d066c890 pattern) ───────
 *
 * `as_of` is the ONLY timestamp that enters compute inputs (deterministic
 * per DEC-034 / DEC-035 replay). Orchestrator-telemetry timestamps
 * (`started_at` / `completed_at`) are stamped from the injected
 * `liveClock` (default `productionClock`) at orchestrator ENTRY and
 * FINALIZATION respectively — INC-73-sanctioned pattern, identical to
 * the analyst-revision orchestrator (line 134 there; do NOT
 * reintroduce the FP-047 defect where `started_at == completed_at` at
 * `as_of`). TokenBuckets carry their own internal `productionClock`
 * for pacing (operational rate-limiting is NOT a strategy-decision
 * kernel — see token-bucket.ts header).
 *
 * Owner: longshort (FP-049 Phase 3a — Signal #9)
 */
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import { productionClock, type ClockReader } from '../../longshort-clock.ts';
import {
  ACTIVE_CATALYST_SIGNAL_ID,
  type CatalystFetchResult,
  type CatalystFetchWindow,
  type CatalystTier,
  type RawCatalystEventInput,
} from './catalyst-types.ts';
import {
  classifyCatalystEvents,
  type ClassifyResult,
} from './classify-catalyst-event.ts';
import { computeActiveCatalyst } from './compute-active-catalyst.ts';
import type { FmpEarningsCalendarFetcher } from './fmp-earnings-calendar-fetcher.ts';
import type { FmpMaFetcher } from './fmp-ma-fetcher.ts';
import type { FmpGradesFetcher } from './fmp-grades-fetcher.ts';
import type { PolygonSplitsFetcher } from './polygon-splits-fetcher.ts';
import type { PolygonDividendsFetcher } from './polygon-dividends-fetcher.ts';
import type { FinnhubFdaAdvisoryFetcher } from './finnhub-fda-advisory-fetcher.ts';
import type { PolygonNewsKeywordFetcher } from './polygon-news-keyword-fetcher.ts';
import type { TradierCorporateActionsFetcher } from './tradier-corporate-actions-fetcher.ts';

/** Locked signal_id (matches signal_registry row). Do NOT rename. */
export const SIGNAL_ID = ACTIVE_CATALYST_SIGNAL_ID;

/** §4.4.9 trailing window length, trading days. DEC-057 §(f) frozen. */
export const CATALYST_WINDOW_TRADING_DAYS = 5;

/** Tradier per-call symbol-chunk cap (matches fetcher-side constant). */
const TRADIER_CHUNK_SIZE = 200;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

/**
 * Extended orchestrator result. Adds `catalyst_meta` carrying the
 * Signal-#9-specific aggregates surfaced through the handler audit
 * envelope. The base `SignalOrchestratorResult` shape is preserved so
 * `persistSignalComputeLog` consumes this value unchanged (the meta
 * lives in audit-event metadata, not `signal_compute_log`, since the
 * latter has no jsonb metadata column at v1).
 */
export interface ActiveCatalystOrchestratorResult
  extends SignalOrchestratorResult {
  catalyst_meta: ActiveCatalystMeta;
}

export interface ActiveCatalystMeta {
  /** Sum of deduped, in-window events that contributed to ≥ 1 ticker raw. */
  total_event_count: number;
  /** Per-tier contribution counts aggregated across all tickers. */
  by_tier: Readonly<Record<CatalystTier, number>>;
  /** Subset of `total_event_count` with `source === 'keyword'`. */
  keyword_source_count: number;
  /** §(h) cross-vendor dedup drops (from classifier). */
  cross_vendor_duplicates_dropped: number;
  /** §(d) look-ahead drops (from classifier; combined structured + keyword). */
  future_event_excluded: number;
  /** §(b) verb-gate drops (from classifier; reflects news-keyword pre-classify pass). */
  verb_gate_drops: number;
  /** §(b) numeric-gate drops on guidance (from classifier). */
  numeric_gate_drops: number;
  /** §(e) dividends-only declaration-date-missing counter (Polygon + Tradier). */
  declaration_date_unavailable: number;
  /** True iff Tradier was invoked as the DEC-057 §(i) typed-fallback. */
  tradier_fallback_invoked: boolean;
  /** Per-vendor `unavailable` flags for diagnosability. */
  vendor_unavailable: Readonly<{
    fmp_earnings: boolean;
    fmp_ma: boolean;
    fmp_grades: boolean;
    polygon_splits: boolean;
    polygon_dividends: boolean;
    polygon_news_keyword: boolean;
    finnhub_fda: boolean;
  }>;
}

/**
 * Context extension. Drops `priceHistory` (Signal #9 has no Polygon
 * price-history input). Each fetcher MUST already be wrapped with its
 * vendor's paced HttpFetch at the handler boundary (per-vendor bucket
 * pattern — see file header).
 */
export interface ActiveCatalystOrchestratorContext
  extends Omit<SignalOrchestratorContext, 'priceHistory'> {
  fmpEarnings: FmpEarningsCalendarFetcher;
  fmpMa: FmpMaFetcher;
  fmpGrades: FmpGradesFetcher;
  polygonSplits: PolygonSplitsFetcher;
  polygonDividends: PolygonDividendsFetcher;
  polygonNewsKeyword: PolygonNewsKeywordFetcher;
  finnhubFda: FinnhubFdaAdvisoryFetcher;
  /** DEC-057 §(i) typed-fallback. Invoked only on Polygon splits/dividends unavailable. */
  tradier: TradierCorporateActionsFetcher;
  /**
   * Injectable wall-clock for orchestrator telemetry (`started_at` /
   * `completed_at`). Defaults to `productionClock`. Compute inputs
   * never touch this clock — they consume `as_of` only.
   */
  liveClock?: ClockReader;
}

export function createActiveCatalystOrchestrator(
  ctx: ActiveCatalystOrchestratorContext,
) {
  const liveClock = ctx.liveClock ?? productionClock;
  return {
    async run(as_of: Date): Promise<ActiveCatalystOrchestratorResult> {
      const started_at = liveClock.getWallClockTs().toISOString();
      const as_of_iso = as_of.toISOString();
      const as_of_date = as_of_iso.slice(0, 10);
      const finalize = (): string => liveClock.getWallClockTs().toISOString();

      // ── Stage 0: load current universe (mirrors analyst-orchestrator) ──
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);
      if (latestErr) {
        throw new Error(
          `active-catalyst-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
        );
      }
      const latest_as_of_date =
        latestRows && latestRows.length > 0
          ? (latestRows[0] as { as_of_date: string }).as_of_date
          : null;
      if (latest_as_of_date === null) {
        return emptyUniverseResult(as_of_date, started_at, finalize());
      }
      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', latest_as_of_date);
      if (universeErr) {
        throw new Error(
          `active-catalyst-orchestrator: universe_membership read failed: ${universeErr.message}`,
        );
      }
      const universe = (universeRows ?? []) as UniverseRow[];
      if (universe.length === 0) {
        return emptyUniverseResult(as_of_date, started_at, finalize());
      }
      const universeSet = new Set<string>(universe.map((u) => u.ticker));

      // ── Stage 1: window construction (§(f) trailing 5 trading days) ──
      const window_start_at = nthPrecedingTradingDay(as_of, CATALYST_WINDOW_TRADING_DAYS);
      const window: CatalystFetchWindow = { as_of, window_start_at };

      // ── Stage 2: concurrent fetch across vendors ───────────────────
      const [
        fmpEarningsRes,
        fmpMaRes,
        fmpGradesRes,
        polygonSplitsRes,
        polygonDividendsRes,
        polygonNewsRes,
        finnhubFdaRes,
      ] = await Promise.all([
        safeFetch(() => ctx.fmpEarnings.fetch(window)),
        safeFetch(() => ctx.fmpMa.fetch(window)),
        safeFetch(() => ctx.fmpGrades.fetch(window)),
        safeFetch(() => ctx.polygonSplits.fetch(window)),
        safeFetch(() => ctx.polygonDividends.fetch(window)),
        safeFetch(() => ctx.polygonNewsKeyword.fetch(window)),
        safeFetch(() => ctx.finnhubFda.fetch(window)),
      ]);

      const vendor_unavailable = {
        fmp_earnings: fmpEarningsRes.kind === 'unavailable',
        fmp_ma: fmpMaRes.kind === 'unavailable',
        fmp_grades: fmpGradesRes.kind === 'unavailable',
        polygon_splits: polygonSplitsRes.kind === 'unavailable',
        polygon_dividends: polygonDividendsRes.kind === 'unavailable',
        polygon_news_keyword: polygonNewsRes.kind === 'unavailable',
        finnhub_fda: finnhubFdaRes.kind === 'unavailable',
      } as const;

      let declaration_date_unavailable =
        (polygonDividendsRes.kind === 'events'
          ? polygonDividendsRes.declaration_date_unavailable ?? 0
          : 0);

      // ── Stage 3: Tradier typed-fallback (DEC-057 §(i)) ─────────────
      let tradier_fallback_invoked = false;
      let tradierRows: RawCatalystEventInput[] = [];
      if (vendor_unavailable.polygon_splits || vendor_unavailable.polygon_dividends) {
        tradier_fallback_invoked = true;
        const tickers = Array.from(universeSet);
        for (let i = 0; i < tickers.length; i += TRADIER_CHUNK_SIZE) {
          const chunk = tickers.slice(i, i + TRADIER_CHUNK_SIZE);
          const r = await safeFetch(() => ctx.tradier.fetch(window, chunk));
          if (r.kind === 'events') {
            tradierRows.push(...r.rows);
            declaration_date_unavailable += r.declaration_date_unavailable ?? 0;
          }
          // Per-chunk unavailable: silently skip — Tradier itself is the
          // fallback; double-failure surfaces as zero contribution, NOT
          // as orchestrator failure (the named structured fetchers
          // already emitted typed unavailables).
        }
      }

      // ── Stage 4: classify + dedup ───────────────────────────────────
      const allStructured: RawCatalystEventInput[] = [];
      pushIfEvents(allStructured, fmpEarningsRes, universeSet);
      pushIfEvents(allStructured, fmpMaRes, universeSet);
      pushIfEvents(allStructured, fmpGradesRes, universeSet);
      pushIfEvents(allStructured, polygonSplitsRes, universeSet);
      pushIfEvents(allStructured, polygonDividendsRes, universeSet);
      pushIfEvents(allStructured, finnhubFdaRes, universeSet);
      // Pre-classified keyword rows arrive in `RawCatalystEventInput`
      // shape with `source='keyword'`. Pass through as `structured` so
      // the classifier's single dedup pass authoritatively resolves
      // §(h) vendor precedence (structured > keyword).
      pushIfEvents(allStructured, polygonNewsRes, universeSet);
      pushRawIfUniverse(allStructured, tradierRows, universeSet);

      const classified: ClassifyResult = classifyCatalystEvents(
        allStructured,
        [],
        { as_of, window_start_at },
      );

      // ── Stage 5: per-ticker compute + mass-balance skips ────────────
      const eventsByTicker = groupByTicker(classified.rows);
      const values: Array<{ ticker: string; value: number; gics_sector: string | null }> = [];
      const skips: SignalSkip[] = [];
      const by_tier: Record<CatalystTier, number> = { 1: 0, 2: 0, 3: 0 };
      let total_event_count = 0;
      let keyword_source_count = 0;

      for (const u of universe) {
        const events = eventsByTicker.get(u.ticker) ?? [];
        const out = computeActiveCatalyst({ events, asOf: as_of });
        if (out.kind === 'skip') {
          skips.push({ ticker: u.ticker, reason: out.reason, detail: out.detail });
          continue;
        }
        values.push({ ticker: u.ticker, value: out.raw, gics_sector: u.gics_sector });
        total_event_count += out.meta.eventCount;
        keyword_source_count += out.meta.keywordSourceCount;
        by_tier[1] += out.meta.byTier[1];
        by_tier[2] += out.meta.byTier[2];
        by_tier[3] += out.meta.byTier[3];
      }

      // ── Stage 6: within-sector z-score ──────────────────────────────
      const zScored = zScoreNormalizeWithinSector(values);

      const computed_at = as_of_iso;
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

      // ── Stage 7: persist observations ───────────────────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(
        ctx.supabase,
        rows,
      );
      const catalyst_meta: ActiveCatalystMeta = {
        total_event_count,
        by_tier: { 1: by_tier[1], 2: by_tier[2], 3: by_tier[3] },
        keyword_source_count,
        cross_vendor_duplicates_dropped: classified.cross_vendor_duplicates_dropped,
        future_event_excluded: classified.future_event_excluded,
        verb_gate_drops: classified.verb_gate_drops,
        numeric_gate_drops: classified.numeric_gate_drops,
        declaration_date_unavailable,
        tradier_fallback_invoked,
        vendor_unavailable,
      };
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
          completed_at: finalize(),
          catalyst_meta,
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
        completed_at: finalize(),
        catalyst_meta,
      };
    },
  };
}

function emptyUniverseResult(
  as_of_date: string,
  started_at: string,
  completed_at: string,
): ActiveCatalystOrchestratorResult {
  return {
    outcome: 'failed',
    signal_id: SIGNAL_ID,
    as_of_date,
    universe_size: 0,
    persisted_count: 0,
    skipped: [],
    failure_reason: 'empty_universe',
    started_at,
    completed_at,
    catalyst_meta: emptyMeta(),
  };
}

function emptyMeta(): ActiveCatalystMeta {
  return {
    total_event_count: 0,
    by_tier: { 1: 0, 2: 0, 3: 0 },
    keyword_source_count: 0,
    cross_vendor_duplicates_dropped: 0,
    future_event_excluded: 0,
    verb_gate_drops: 0,
    numeric_gate_drops: 0,
    declaration_date_unavailable: 0,
    tradier_fallback_invoked: false,
    vendor_unavailable: {
      fmp_earnings: false,
      fmp_ma: false,
      fmp_grades: false,
      polygon_splits: false,
      polygon_dividends: false,
      polygon_news_keyword: false,
      finnhub_fda: false,
    },
  };
}

/**
 * Wrap a fetcher call so that thrown errors degrade to a typed
 * `unavailable` (per-vendor degradation; the run as a whole proceeds
 * with the remaining vendors). Mirrors the analyst-orchestrator vendor
 * fan-out discipline — typed-absence beats orchestrator failure.
 */
async function safeFetch(
  fn: () => Promise<CatalystFetchResult>,
): Promise<CatalystFetchResult> {
  try {
    return await fn();
  } catch (_err) {
    return { kind: 'unavailable', reason: 'data_unavailable' };
  }
}

function pushIfEvents(
  out: RawCatalystEventInput[],
  r: CatalystFetchResult,
  universeSet: ReadonlySet<string>,
): void {
  if (r.kind !== 'events') return;
  for (const row of r.rows) {
    if (universeSet.has(row.ticker)) out.push(row);
  }
}

function pushRawIfUniverse(
  out: RawCatalystEventInput[],
  rows: ReadonlyArray<RawCatalystEventInput>,
  universeSet: ReadonlySet<string>,
): void {
  for (const row of rows) {
    if (universeSet.has(row.ticker)) out.push(row);
  }
}

function groupByTicker(
  rows: ReadonlyArray<RawCatalystEventInput>,
): Map<string, RawCatalystEventInput[]> {
  const out = new Map<string, RawCatalystEventInput[]>();
  for (const r of rows) {
    const bucket = out.get(r.ticker) ?? [];
    bucket.push(r);
    out.set(r.ticker, bucket);
  }
  return out;
}

/**
 * Compute the start-of-day timestamp `n` trading days before `as_of`.
 * v1 approximation: weekends-only (Sat/Sun skipped); US exchange
 * holidays NOT modelled — documented in the module doc §(window-
 * arithmetic). Bounded shortfall ≤ 1 trading day per double-holiday
 * week, materially absorbed by the §(a) 48 h earnings half-life.
 * Returned date is the start (00:00 UTC) of the resulting trading day.
 */
export function nthPrecedingTradingDay(as_of: Date, n: number): Date {
  if (!Number.isFinite(as_of.getTime())) {
    throw new Error('nthPrecedingTradingDay: as_of is not a finite Date');
  }
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`nthPrecedingTradingDay: n must be a non-negative finite number, got ${n}`);
  }
  // Start from the UTC date of as_of at 00:00 UTC.
  const d = new Date(Date.UTC(
    as_of.getUTCFullYear(),
    as_of.getUTCMonth(),
    as_of.getUTCDate(),
    0, 0, 0, 0,
  ));
  let remaining = n;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay(); // 0 Sun, 6 Sat
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}