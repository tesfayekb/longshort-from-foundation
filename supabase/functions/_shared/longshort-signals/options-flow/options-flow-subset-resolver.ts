/**
 * Options-flow intraday subset resolver — FP-057 Sub-step 4c.
 *
 * Resolves the per-asOf-date set of tickers that the options-flow
 * adapter should compute on for the INTRADAY cadence. Names not in the
 * set are short-circuited at the adapter with a typed
 * `no_qualifying_flow` skip (combiner staleness rules carry last-known;
 * no fabrication, no sentinel).
 *
 * SET DEFINITION (mirrors the operator's spec verbatim):
 *
 *   BASE TIER      = top-N tickers by `day_options_volume` on the PRIOR
 *                    trading-day (MIG-133 sidecar). N defaults to 200;
 *                    env-overridable via `OPTIONS_FLOW_INTRADAY_SUBSET_N`
 *                    with a hard ceiling of 250.
 *
 *   DYNAMIC ADDITIONS = today's CATALYST-active + NEWS-active names,
 *                    read from `signal_observations`. The predicate is
 *                    LOAD-BEARING: `as_of_date = today` AND
 *                    `is_present = true` AND `carried_forward = false`.
 *                    The `carried_forward = false` clause selects
 *                    FRESHLY-fired-today names ONLY — the "tail becomes
 *                    active intraday" case — and EXCLUDES stale
 *                    carried-over rows.
 *
 *   UNION + PRIORITY + CAP = DISTINCT(base ∪ catalyst-active ∪
 *                    news-active). If the union exceeds the 255-budget,
 *                    ACTIVE-NAMES-FIRST (the fresh-signal tier wins);
 *                    fill remaining slots with top-volume base.
 *
 * ─── carried_forward audit-only isolation (DEC-060 §(v)) ──────────────
 * `carried_forward` is read here ONLY as a SQL query predicate (audit
 * domain). It MUST NOT flow into the feature-assembler input type, the
 * compute path, or any consumer reader-projection. The
 * `feature-assembler_carry-flag-isolation_test` greps the combiner
 * readers for the literal `carried_forward` in `.select(...)`; this
 * file is OUTSIDE that grep's target list (it lives under
 * `_shared/longshort-signals/options-flow/`, not under
 * `_shared/longshort-combiner/`). The resolver decides WHICH names to
 * seed; the flag never enters the signal computation.
 *
 * ─── Wall-clock discipline (DEC-034 cl.4) ─────────────────────────────
 * NO `new Date()` / `Date.now()` in this file. The caller-supplied
 * `asOf` is the SOLE clock source for `today(asOf)` and PRIOR-day
 * derivation.
 *
 * ─── Cadence gating ───────────────────────────────────────────────────
 * The resolver consults `signal_queue_runs.metadata.cadence` to decide
 * whether to filter. The DAILY full-universe run (cron 87) writes
 * `cadence='daily'` (or omits the field; both branches degrade to "no
 * filter"). The INTRADAY 15-min run writes `cadence='intraday'`; only
 * then does the resolver compute and return a non-null set. This keeps
 * the daily cron's behavior bit-identical to pre-4c.
 *
 * Memoized per `as_of_date` per isolate-boot, mirroring PEAD's
 * `worklistCache` pattern in `pead-queue-adapter.ts`.
 */

import type { OptionsFlowVolumeReader } from './options-flow-volume-store.ts';
import type { SupabaseChainedClient } from '../shared/supabase-chained-builder.ts';

/** The intraday signal IDs that feed the DYNAMIC ADDITIONS union. */
export const NEWS_SIGNAL_ID = 'news_sentiment_7d';
export const CATALYST_SIGNAL_ID = 'active_catalyst_flag';

/** Default subset size (env-overridable; hard-capped at SUBSET_HARD_CEILING). */
export const DEFAULT_SUBSET_N = 200;
export const SUBSET_HARD_CEILING = 250;
/** Overall budget after UNION (active-first wins). */
export const SUBSET_UNION_BUDGET = 255;

export type OptionsFlowSubsetResolver = (asOf: Date) => Promise<Set<string> | null>;

export interface ResolveSubsetDeps {
  volumeReader: OptionsFlowVolumeReader;
  supabase: SupabaseLike;
  /** Signal ID of the options-flow consumer (cadence-mode lookup key). */
  signalId: string;
  /** Override knob (env reader is the caller's concern). */
  subsetN?: number;
}

/**
 * Structural subset of the supabase client this resolver depends on.
 * Backed by the SHARED generic chained-builder type (Catalog #61 structural
 * prevention): each query at the call site declares its own row shape via the
 * `TRow` parameter on `select<TRow>(cols)`, so the two distinct queries here
 * (signal_observations → { ticker }, signal_queue_runs → { metadata }) cannot
 * conflate their result types.
 */
export type SupabaseLike = SupabaseChainedClient;

interface ObsRowDto { ticker: string }
interface RunRowDto { metadata: Record<string, unknown> | null }

/** ISO yyyy-mm-dd from a Date in UTC (no wall-clock leak). */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * PRIOR-trading-day calendar approximation: subtract one day unless
 * Saturday/Sunday/Monday, in which case subtract more to land on Friday.
 * The resolver only uses this as a READ KEY against MIG-133; on a
 * federal-holiday miss (e.g. yesterday was a market holiday) the base
 * tier is empty and the UNION carries fresh-active names alone — same
 * graceful-degradation posture as a DB read miss.
 */
export function priorTradingDayIso(asOf: Date): string {
  const utcDay = asOf.getUTCDay(); // 0=Sun 1=Mon ... 6=Sat
  let offset = 1;
  if (utcDay === 1) offset = 3;      // Monday → Friday
  else if (utcDay === 0) offset = 2; // Sunday → Friday
  else if (utcDay === 6) offset = 1; // Saturday → Friday
  const prior = new Date(asOf.getTime() - offset * 86_400_000);
  return isoDate(prior);
}

/** Resolve N from env, clamping to [1, SUBSET_HARD_CEILING]. Caller may
 *  also override directly via `deps.subsetN`. */
export function resolveSubsetN(envValue: string | undefined, override?: number): number {
  const raw = override !== undefined
    ? override
    : envValue !== undefined ? Number.parseInt(envValue, 10) : DEFAULT_SUBSET_N;
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SUBSET_N;
  return Math.min(Math.floor(raw), SUBSET_HARD_CEILING);
}

/**
 * Build a memoizing resolver. The closure captures `supabase` +
 * `volumeReader` (registration-time dependency injection mirrors
 * pead-queue-adapter.ts's `getWorklist` pattern).
 */
export function createOptionsFlowSubsetResolver(
  deps: ResolveSubsetDeps,
): OptionsFlowSubsetResolver {
  const cache = new Map<string, Promise<Set<string> | null>>();
  return (asOf: Date): Promise<Set<string> | null> => {
    const key = isoDate(asOf);
    const cached = cache.get(key);
    if (cached) return cached;
    const p = resolveOnce(asOf, deps);
    cache.set(key, p);
    return p;
  };
}

async function resolveOnce(
  asOf: Date,
  deps: ResolveSubsetDeps,
): Promise<Set<string> | null> {
  // ── (1) Cadence gate. If no open run for this asOf-date is tagged
  //       `cadence='intraday'`, return null (no filter) — the DAILY
  //       full-universe run path stays bit-identical to pre-4c.
  const cadenceIntraday = await isIntradayRun(deps, asOf);
  if (!cadenceIntraday) return null;

  // ── (2) BASE TIER — top-N from PRIOR trading-day.
  const n = resolveSubsetN(undefined, deps.subsetN);
  const priorDate = priorTradingDayIso(asOf);
  const baseRows = await deps.volumeReader.topN(priorDate, n);
  const baseOrdered = baseRows.map((r) => r.ticker); // already DESC by volume

  // ── (3) DYNAMIC ADDITIONS — fresh-today catalyst + news active.
  const todayIso = isoDate(asOf);
  const activeFresh = await fetchFreshActive(deps, todayIso);

  // ── (4) UNION + PRIORITY + CAP. Active-first wins the budget.
  const out = new Set<string>();
  for (const t of activeFresh) {
    if (out.size >= SUBSET_UNION_BUDGET) break;
    out.add(t);
  }
  for (const t of baseOrdered) {
    if (out.size >= SUBSET_UNION_BUDGET) break;
    out.add(t);
  }
  return out;
}

async function isIntradayRun(deps: ResolveSubsetDeps, asOf: Date): Promise<boolean> {
  const asOfDate = isoDate(asOf);
  const { data, error } = await deps.supabase
    .from('signal_queue_runs')
    .select<RunRowDto>('metadata')
    .eq('signal_id', deps.signalId)
    .eq('as_of_date', asOfDate)
    .in('status', ['running', 'finalizing'])
    .order('heartbeat_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return false;
  const md = data[0].metadata ?? {};
  return md['cadence'] === 'intraday';
}

async function fetchFreshActive(
  deps: ResolveSubsetDeps,
  todayIso: string,
): Promise<ReadonlyArray<string>> {
  // carried_forward = false is LOAD-BEARING: selects FRESHLY-fired-today
  // names ONLY (the operator's "becomes active intraday" case). NEVER
  // pulls in carried-over stale rows.
  const { data, error } = await deps.supabase
    .from('signal_observations')
    .select<ObsRowDto>('ticker')
    .in('signal_id', [CATALYST_SIGNAL_ID, NEWS_SIGNAL_ID])
    .eq('as_of_date', todayIso)
    .eq('is_present', true)
    .eq('carried_forward', false);
  if (error || !data) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of data) {
    if (seen.has(r.ticker)) continue;
    seen.add(r.ticker);
    out.push(r.ticker);
  }
  return out;
}