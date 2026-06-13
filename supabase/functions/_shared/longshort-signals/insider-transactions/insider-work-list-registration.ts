/**
 * insider-work-list-registration.ts — FP-050 Phase 3.6b.iii′ γ commit-1
 * (producer module for Signal #4 on the FP-045 queue engine's work-list
 * mode; ratified at ACT-193 crosswalk; conforms to the M1-M5 rulings as
 * landed at ACT-194; sizes against the corrected ~253 typical / ~352
 * measured-max in-universe band per the ACT-194 Rule-8 M4 RE-RULE).
 *
 * ─── Mode discipline — work-list (FP-045 Phase 3.6a engine union) ────
 *
 * `mode: 'work-list'` because Signal #4's work unit is a pre-enumerable
 * set of EDGAR accession numbers (one per Form-4 / 4/A filing the
 * universe filer set produced on a target date). Distinct from
 * sequential-feed (no opaque vendor cursor — the daily-index is the
 * deterministic enumeration) and per-ticker (the work is per-accession,
 * not per-name; the per-name compute is the FINALIZE-time aggregation).
 *
 * ─── Two construction variants — daily vs backfill ──────────────────
 *
 * The work-list engine contract (`WorkListSeedFn`) is `(asOf) => items`.
 * The DAILY cron seeds yesterday's trading-day index; the BACKFILL
 * manual path seeds the trailing ~63-trading-day sweep (the 90-calendar-
 * day decay window per §4.4.4, weekends-only-skip approximation per
 * `edgar-daily-index-fetcher.ts`). The variant is chosen at
 * registration time via the factory's `mode` parameter — γ commit-2
 * wires the cron handler to `'daily'` and the manual handler to
 * `'backfill'` behind the operator's `backfill: true` flag. Two
 * separate `signalId`s? NO — same `signalId` (`insider_transactions_90d`),
 * different `jobId` so the registry can hold both registrations
 * disjointly (`longshort.insider.compute` daily / `longshort.insider.
 * compute.backfill` manual). Selection at registration time keeps the
 * `WorkListSeedFn` signature pure (no `backfill` flag leaking into the
 * engine contract; the engine remains semantics-agnostic).
 *
 * ─── Per-call-site Q3 classification (typed-permanent vs transient) ──
 *
 * The crosswalk pins the classification at each EDGAR call site; this
 * module honors it verbatim:
 *   - accession `index.json` 404 → permanent_skip `data_unavailable`
 *   - accession `index.json` ambiguous (0 or >1 primary docs) →
 *     permanent_skip `no_primary_doc` (M2 union member; the INC-70
 *     anti-heuristic rule — never guess a filename)
 *   - accession `index.json` 429 → THROW (transient — engine cursor
 *     preserved; the 5 rps bucket should prevent this in practice)
 *   - Form-4 XML 404 → permanent_skip `data_unavailable`
 *   - Form-4 XML 429 → THROW (transient)
 *   - Form-4 XML unparseable (M1: includes absent `owner_cik`) →
 *     permanent_skip `data_unavailable` (malformed XML won't fix on
 *     retry; the M1 contract owner enforces upstream so the consumer
 *     never sees an empty `owner_cik` defaulted)
 *   - upsert error → THROW (transient — Postgres temporal failures)
 *
 * ─── §(h) PK + INC-74 batch-dedupe (M5 verified) ────────────────────
 *
 * MIG-094 PK = `(issuer_cik, accession_number, transaction_seq)` — the
 * §(h) idempotency triple. `processItem` upserts with
 * `onConflict: 'issuer_cik,accession_number,transaction_seq'` quoted
 * verbatim per M5. The §(h) FOUR-part most-recent-accession preference
 * (`+owner_cik, +transaction_date`) is READ-TIME (`preferMostRecentAccession`),
 * NOT a unique constraint. INC-74 in-batch dedupe is applied on the PK
 * BEFORE upsert as a defensive layer (within ONE accession this should
 * be a no-op — Form 4 emits each transaction once — but the dedupe
 * enforces the invariant the table requires regardless of parser
 * behavior).
 *
 * The MIG-095 dual-write contract is honored by passing `owner_cik`
 * verbatim from the parser's `EdgarForm4Row` — the M1 hardening
 * guarantees no empty-string sentinel ever reaches this layer.
 *
 * ─── accessionsPerSlice arithmetic row (Catalog #39 both-bounds) ────
 *
 *   itemsPerSlice       = 50      (chosen so the slice budget fits well
 *                                   under the 120s STOP gate and 150s
 *                                   HTTP wall; see derivation below)
 *   callsPerItem        = 2       (accession `index.json` + Form-4 XML;
 *                                   the daily-index sweep + CIK map are
 *                                   seed-time, not per-item; per
 *                                   DEC-058 §(i) (A))
 *   ratePerSec          = 5 × 0.85 = 4.25   (SEC fair-access 10 rps
 *                                   half-share with the FP-045
 *                                   convention safety multiplier 0.85;
 *                                   matches PEAD/options/news cap shape)
 *   → rate-bound  per slice = 50 × 2 / 4.25 ≈ 23.5 s paced
 *   + parser CPU + per-row upsert wall ≈ +10-30 s (XML parse + Supabase
 *     upsert for a typical 1-5 transaction filing)
 *   = end-to-end slice wall ≈ 35-55 s
 *     vs 120 s STOP gate ≈ 65-85 s headroom — SAFE
 *     vs 150 s HTTP wall ≈ 95-115 s headroom — SAFE
 *
 *   Daily-fire drain estimate (F2.c queue-evidence update — Catalog #43
 *   recursive application; supersedes the M4 RE-RULE ~352 estimate;
 *   ACT-205):
 *     typical ~225 in-universe accessions (F2.b backfill
 *       `discovery_correlation_id=aad615ab-…` drained 14,172 rows across
 *       63 days ≈ 225/day) → ⌈225/50⌉ = 5 slices ≈ 3-5 min
 *     measured-max post-earnings-cluster ceiling = 800 (real evidence:
 *       770 on 2026-04-02; 522 on 2026-03-17 — both above the prior soft
 *       500 band; 800 pads the empirically-measured top by ~4% for
 *       variance robustness) → ⌈800/50⌉ = 16 slices ≈ 9-15 min,
 *       inside the ~21:15→pre-market window with hours of headroom.
 *
 *   Backfill-fire drain estimate (F2.c queue-evidence update):
 *     63 trading days × ~225 accessions/day ≈ 14,172 accessions
 *     ⌈14172/50⌉ = 284 slices × ~35-55 s ≈ ~2.8-4.3 hours queue-drained
 *     (fits comfortably in the single overnight window between US close
 *     21:00 UTC and pre-market 13:00 UTC with ~7-9 h headroom).
 *
 * `accessionsPerSliceDrift` test asserts the structural ceiling
 * `itemsPerSlice * callsPerItem / ratePerSec < 60` so any future
 * tightening of the rate cap or loosening of the slice size fails the
 * test rather than silently breaching the 120s/150s walls (drift
 * sentinel discipline per FP-045 Phase 2 addendum §6).
 *
 * ─── F2.c queue switch (R1 + R2 contract) ───────────────────────────
 *
 * `seedWorkItems` no longer hits EDGAR. It claims pre-discovered rows
 * from `public.insider_accession_discovery_queue` (F2.a / MIG-096),
 * populated by the GHA-egress producer (`scripts/insider-discovery-
 * egress.ts` / F2.b). The on-EDGAR daily-index call site is the
 * producer's exclusive surface; the F1 drift sentinels travel with
 * the producer (parser/fetcher), never relaxed.
 *
 * R1 (heartbeat-at-write-seam, codified F2.b): the producer writes a
 * single sentinel row for empty/unavailable days using `issuer_cik =
 * accession_number = '__heartbeat__'`. The claim query STRUCTURALLY
 * excludes the sentinel via the operator-verbatim predicate
 * `NOT (issuer_cik='__heartbeat__' AND accession_number='__heartbeat__')`.
 * The 63 inert pre-hardening heartbeats from run `658b8070-…` exercised
 * this filter on first use (ACT-205 finding (a)).
 *
 * R2 (concurrency safety — ratified narrowing from "same TX" to
 * single-statement atomicity, per operator F2.c ruling; supervisor
 * brief defect catalogued under recursive #43): the claim is one
 * `UPDATE ... WHERE consumed_at IS NULL ... RETURNING ...` statement.
 * Two concurrent calls against the same `as_of_date` serialize at
 * Postgres row-level locks; the second update returns zero rows; the
 * engine's downstream cursor INSERT inherits atomicity from per-run_id
 * uniqueness. Pinned by `insider-r2-concurrent-claim_test.ts`, the
 * project's FIRST transactional-contention test pattern (Deno-driven
 * two-client concurrent fire); pattern is forward-binding for future
 * signals.
 *
 * Backfill iterates the queue's distinct `as_of_date`s (bounded by
 * `INSIDER_BACKFILL_TRADING_DAYS`), each claimed in its own UPDATE
 * statement; concurrent backfill+daily on overlapping dates is
 * structurally prevented by the same row-lock atomicity.
 *
 * ─── Heartbeat / staging-TTL sizing ─────────────────────────────────
 *
 * `heartbeatTimeoutSec = 600` — 10 min, parity with PEAD/options/news.
 * `stagingTtlSec = 86400` — 24 h, parity.
 *
 * Wall-clock discipline (DEC-034 clause 4): NO `Date.now()` / `performance.now()`
 * reads in this file. All timestamps derive from the engine-injected
 * `asOf` Date. The CIK mapper / EDGAR fetchers themselves have no
 * wall-clock reads (verified at MIG-094 / FP-050 Phase 2 landing).
 *
 * Owner: longshort (FP-050 — Phase 3.6b.iii′ γ commit-1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  productionQueueRegistry,
  type QueueSignalConfig,
  type WorkListItem,
  type WorkListItemResult,
  type WorkListLoadAndComputeFn,
  type WorkListProcessItemFn,
  type WorkListSeedFn,
  type TickerComputeResult,
} from '../shared/queue-worker/queue-config.ts';
import {
  EdgarCikMapper,
  type CikLookupResult,
} from './edgar-cik-mapper.ts';
import {
  EdgarAccessionIndexFetcher,
  type EdgarAccessionIndexResult,
} from './edgar-accession-index-fetcher.ts';
import {
  EdgarForm4Fetcher,
  type EdgarForm4FetchResult,
} from './edgar-form4-fetcher.ts';
import type { EdgarForm4Row } from './edgar-form4-parser.ts';
import {
  createInsiderLoadAndCompute,
  SIGNAL_ID,
  type InsiderLoadAndComputeContext,
} from './insider-load-and-compute.ts';
import { SignalComputationError } from '../shared/signal-types.ts';

// ─── Public registry constants (mirrors news/PEAD/options exports) ─────

/** Stable signal id — matches `signal_observations.signal_id` (DEC-058). */
export const INSIDER_SIGNAL_ID = SIGNAL_ID;

/** Daily cron job id — `job_registry.id` for the after-close compute. */
export const INSIDER_DAILY_JOB_ID = 'longshort.insider.compute';

/** Backfill manual-trigger job id — distinct from daily so the registry
 *  can hold both registrations disjointly. γ commit-2 wires the manual
 *  handler to this id behind the `backfill: true` operator flag. */
export const INSIDER_BACKFILL_JOB_ID = 'longshort.insider.compute.backfill';

/** SEC fair-access half-share (10 rps / 2). */
export const SEC_HALF_SHARE_RPS = 5;

/** FP-045 convention safety multiplier. */
export const RATE_SAFETY_MULTIPLIER = 0.85;

export const INSIDER_ITEMS_PER_SLICE = 50;
export const INSIDER_CALLS_PER_ITEM = 2;
export const INSIDER_RATE_PER_SEC = SEC_HALF_SHARE_RPS * RATE_SAFETY_MULTIPLIER; // 4.25
export const INSIDER_HEARTBEAT_TIMEOUT_SEC = 600;
export const INSIDER_STAGING_TTL_SEC = 86_400;

/** §4.4.4 90-calendar-day decay window — approximated as 63 trading days
 *  for the backfill seed sweep (weekends-only-skip; identical to the
 *  daily-index fetcher's v1 trading-day rule). */
export const INSIDER_BACKFILL_TRADING_DAYS = 63;

/** R1 heartbeat sentinel (producer-side: `scripts/insider-discovery-
 *  egress.ts` → `HEARTBEAT_ISSUER_CIK` / `HEARTBEAT_ACCESSION_NUMBER`).
 *  Re-declared here so the consumer's claim predicate doesn't import
 *  from `scripts/`; the test (D.5) pins string equality across both
 *  modules so producer/consumer cannot drift. */
export const INSIDER_HEARTBEAT_ISSUER_CIK = '__heartbeat__';
export const INSIDER_HEARTBEAT_ACCESSION_NUMBER = '__heartbeat__';

/** F2.c per-day work-budget ceiling (queue-evidence update; ACT-205).
 *  Real-evidence max measured at 770 on 2026-04-02 (post-earnings
 *  cluster); 800 pads by ~4% for variance robustness. Supersedes the
 *  prior ~352 M4 RE-RULE estimate per Catalog #43. The (A.2) drift
 *  sentinel converts this to a slice-count derived against
 *  `INSIDER_ITEMS_PER_SLICE` so any future tightening that would
 *  breach the daily window fails the test rather than silently
 *  sliding past pre-market. */
export const INSIDER_PER_DAY_WORK_BUDGET_CEILING = 800;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Universe-row shape (mirrors insider-load-and-compute.ts) ──────────

interface UniverseRowWithCik {
  ticker: string;
  gics_sector: string | null;
  /** Padded 10-digit CIK resolved via `EdgarCikMapper.loadMap()`. */
  cik10: string;
}

// ─── Work-item payload shape — opaque to the engine, semantic to us ────

/** Persisted on the cursor row; threaded back into `processItem`. */
export interface InsiderWorkItemPayload {
  /** Unpadded filer CIK from the daily-index row (used for URL paths). */
  filer_cik_raw: string;
  /** 10-digit padded CIK (used for the PK on `insider_form4_rows`). */
  filer_cik_padded: string;
  /** Universe ticker the filer CIK resolved to (for the table column). */
  ticker: string;
  /** ISO YYYY-MM-DD date the filing landed in the index (diagnostics). */
  date_filed: string;
  /** '4' or '4/A' verbatim from the index. Persisted as `filing_form_type`. */
  form_type: '4' | '4/A';
}

// ─── Date math: previous calendar day / weekends-only-skip ─────────────

/** UTC YYYY-MM-DD slice of a Date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Day-of-week (0=Sun, 6=Sat) in UTC. */
function utcDow(d: Date): number {
  return d.getUTCDay();
}

/**
 * "Yesterday's trading day" relative to `asOf` — weekends-only-skip
 * approximation (parity with `edgar-daily-index-fetcher.ts`'s v1 rule;
 * NYSE-calendar upgrade tracked separately). Holidays return cleanly
 * as `kind:'unavailable'` from the daily-index fetcher — the seed
 * surfaces an empty list for that day, which is a VALID empty seed
 * per the work-list contract (Q5).
 *
 * Worked example (crosswalk D.1): `asOf=2026-06-12T21:00:00Z` (Friday)
 * → `asOf - 1 day = 2026-06-11` (Thursday) → no weekend skip → target
 * date `2026-06-11`. `asOf=2026-06-15` (Monday) → `2026-06-14` (Sat)
 * → skip → `2026-06-13` (Fri).
 */
export function previousTradingDay(asOf: Date): Date {
  let cursor = new Date(asOf.getTime() - MS_PER_DAY);
  // Skip Saturday (6) → Friday; Sunday (0) → Friday.
  while (utcDow(cursor) === 0 || utcDow(cursor) === 6) {
    cursor = new Date(cursor.getTime() - MS_PER_DAY);
  }
  return new Date(Date.UTC(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth(),
    cursor.getUTCDate(),
    0, 0, 0, 0,
  ));
}

/**
 * Trailing N trading-day list (weekends-only-skip), most-recent first.
 * Used by the backfill seed sweep. N=63 ≈ 90 calendar days under the
 * weekends-only approximation (5/7 × 90 ≈ 64.3).
 */
export function trailingTradingDays(asOf: Date, n: number): Date[] {
  const out: Date[] = [];
  let cursor = previousTradingDay(asOf);
  out.push(cursor);
  while (out.length < n) {
    cursor = previousTradingDay(cursor);
    out.push(cursor);
  }
  return out;
}

// ─── INC-74 batch dedupe (PK-scoped) ───────────────────────────────────

/**
 * Within one accession, the parser SHOULD emit each transaction exactly
 * once (transaction_seq is the parser's 0-indexed counter). This dedupe
 * is a defensive layer that enforces the PK invariant the table
 * requires, mirroring INC-74's feed-mode dedupe discipline at the
 * accession-batch grain. Returns the deduplicated row list AND the
 * number of dropped duplicates (for diagnostic counting; γ commit-2
 * may surface this in the run-meta but γ commit-1 only enforces the
 * invariant).
 */
export function dedupeFormRowsByPk<T extends {
  issuer_cik: string;
  accession_number: string;
  transaction_seq: number;
}>(rows: ReadonlyArray<T>): { kept: T[]; dropped: number } {
  const seen = new Set<string>();
  const kept: T[] = [];
  let dropped = 0;
  for (const r of rows) {
    const k = `${r.issuer_cik}|${r.accession_number}|${r.transaction_seq}`;
    if (seen.has(k)) { dropped += 1; continue; }
    seen.add(k);
    kept.push(r);
  }
  return { kept, dropped };
}

// ─── Construction surface ──────────────────────────────────────────────

/**
 * Construction dependencies for the producer — every IO surface
 * injected so tests can stub each axis independently and the
 * registration is environment-agnostic at import time (matches the
 * lazy-fetcher pattern in `news-sentiment-queue-registration.ts`).
 */
export interface InsiderWorkListDeps {
  supabase: SupabaseClient;
  operator_id: string;
  cikMapper: EdgarCikMapper;
  accessionIndex: EdgarAccessionIndexFetcher;
  form4Fetcher: EdgarForm4Fetcher;
  /** The same context shape `createInsiderLoadAndCompute` takes; passed
   *  through to `loadAndCompute` (the engine finalizer owns z+persist
   *  per M3, so we call `runStaged` and map the result). */
  loadAndComputeCtx: InsiderLoadAndComputeContext;
}

export type InsiderWorkListMode = 'daily' | 'backfill';

/**
 * Build the queue-engine `QueueSignalConfig` for Signal #4 in work-list
 * mode. The returned config is registry-ready — handlers in γ commit-2
 * call `productionQueueRegistry.register(config)` with the appropriate
 * mode at module-import time.
 */
export function createInsiderWorkListConfig(
  deps: InsiderWorkListDeps,
  mode: InsiderWorkListMode,
): QueueSignalConfig {
  const seedWorkItems = makeSeedWorkItems(deps, mode);
  const processItem = makeProcessItem(deps);
  const loadAndCompute = makeLoadAndCompute(deps);

  return {
    signalId: INSIDER_SIGNAL_ID,
    jobId: mode === 'backfill' ? INSIDER_BACKFILL_JOB_ID : INSIDER_DAILY_JOB_ID,
    ratePerSec: INSIDER_RATE_PER_SEC,
    heartbeatTimeoutSec: INSIDER_HEARTBEAT_TIMEOUT_SEC,
    stagingTtlSec: INSIDER_STAGING_TTL_SEC,
    mode: 'work-list',
    itemsPerSlice: INSIDER_ITEMS_PER_SLICE,
    callsPerItem: INSIDER_CALLS_PER_ITEM,
    seedWorkItems,
    processItem,
    loadAndCompute,
  };
}

// ─── seedWorkItems factory ─────────────────────────────────────────────

function makeSeedWorkItems(deps: InsiderWorkListDeps, mode: InsiderWorkListMode): WorkListSeedFn {
  return async ({ asOf }): Promise<ReadonlyArray<WorkListItem>> => {
    // Step S.1: load universe (latest as_of_date). Empty universe →
    // VALID empty seed (Q5; engine finalizes cleanly).
    const universe = await loadCurrentUniverse(deps);
    if (universe.length === 0) return [];

    // Step S.2: ticker → padded CIK lookup (fetch-per-fire per
    // DEC-058 §(f1)). Throws → Q5 `seed_failed` (engine inserts the
    // terminal failed-run row; never half-seeded).
    const lookup = await deps.cikMapper.loadMap();
    const byPaddedCik = new Map<string, UniverseRowWithCik>();
    const paddedUniverseCiks: string[] = [];
    for (const u of universe) {
      const r: CikLookupResult = lookup(u.ticker);
      if (r.kind === 'unresolved') continue;
      byPaddedCik.set(r.cik10, { ticker: u.ticker, gics_sector: u.gics_sector, cik10: r.cik10 });
      paddedUniverseCiks.push(r.cik10);
    }
    if (paddedUniverseCiks.length === 0) return [];

    // Step S.3: enumerate target trading days. Daily = yesterday's
    // trading day (weekends-only-skip). Backfill = the queue's own
    // distinct unconsumed `as_of_date`s within the 63-trading-day
    // window (most-recent first) — the queue is the source of truth
    // for which days have producer-discovery rows; gaps stay gaps.
    const targetDays: string[] = mode === 'backfill'
      ? await loadDistinctBackfillDates(deps, asOf)
      : [isoDate(previousTradingDay(asOf))];

    // Step S.4 — R2 atomic claim (single-statement row-lock atomicity;
    // see module-doc §R2 contract narrowing). Per-day UPDATE …
    // RETURNING; per-run_id uniqueness on the downstream cursor INSERT
    // closes the disjoint-outcome property end-to-end.
    const consumedAtIso = asOf.toISOString();
    const items: WorkListItem[] = [];
    const seenAccession = new Set<string>(); // backfill cross-day defense
    for (const day of targetDays) {
      const claimed = await claimDiscoveryRowsForDay(deps, day, paddedUniverseCiks, consumedAtIso);
      for (const row of claimed) {
        if (seenAccession.has(row.accession_number)) continue;
        seenAccession.add(row.accession_number);
        const u = byPaddedCik.get(row.issuer_cik);
        if (u === undefined) continue; // defensive (universe drift since producer)
        const payload: InsiderWorkItemPayload = {
          filer_cik_raw: row.issuer_cik.replace(/^0+/, '') || '0',
          filer_cik_padded: row.issuer_cik,
          ticker: u.ticker,
          date_filed: day,
          form_type: row.form_type,
        };
        items.push({
          id: row.accession_number,
          payload: payload as unknown as Readonly<Record<string, unknown>>,
        });
      }
    }
    return items;
  };
}

interface ClaimedDiscoveryRow {
  issuer_cik: string;
  accession_number: string;
  form_type: '4' | '4/A';
}

/**
 * R2 atomic claim — one PostgREST UPDATE-with-RETURNING. The WHERE
 * conjunction is:
 *
 *   as_of_date            = $1
 *   AND consumed_at       IS NULL
 *   AND issuer_cik        = ANY($paddedUniverseCiks)     -- in-universe
 *   AND NOT (issuer_cik='__heartbeat__'
 *            AND accession_number='__heartbeat__')      -- R1 heartbeat exclusion
 *
 * The heartbeat exclusion is the operator-verbatim predicate. It is
 * redundant given the in-universe IN-filter (no universe CIK equals
 * '__heartbeat__'), but kept as a defense-in-depth structural pin —
 * if a future change widens the in-universe set or relaxes the
 * IN-filter, the heartbeat exclusion remains the structural barrier.
 *
 * Concurrency (R2): two concurrent UPDATEs against overlapping rows
 * serialize at row-lock; the second sees `consumed_at IS NOT NULL`
 * (already set by the first commit) and updates zero rows. RETURNING
 * is empty for the loser. The engine's downstream cursor INSERT is
 * keyed by `(run_id, ticker)` PK with unique `run_id` per init, so
 * double-insert is structurally impossible.
 */
async function claimDiscoveryRowsForDay(
  deps: InsiderWorkListDeps,
  asOfDate: string,
  paddedUniverseCiks: ReadonlyArray<string>,
  consumedAtIso: string,
): Promise<ClaimedDiscoveryRow[]> {
  const heartbeatExclusion =
    `issuer_cik.neq.${INSIDER_HEARTBEAT_ISSUER_CIK},` +
    `accession_number.neq.${INSIDER_HEARTBEAT_ACCESSION_NUMBER}`;
  const { data, error } = await deps.supabase
    .from('insider_accession_discovery_queue')
    .update({ consumed_at: consumedAtIso })
    .eq('as_of_date', asOfDate)
    .is('consumed_at', null)
    .in('issuer_cik', paddedUniverseCiks as string[])
    .or(heartbeatExclusion)
    .select('issuer_cik, accession_number, form_type');
  if (error) {
    throw new Error(
      `insider-work-list-registration: discovery-queue claim failed ` +
        `(as_of_date=${asOfDate}): ${error.message}`,
    );
  }
  const rows = (data ?? []) as Array<{
    issuer_cik: string;
    accession_number: string;
    form_type: string;
  }>;
  const out: ClaimedDiscoveryRow[] = [];
  for (const r of rows) {
    if (r.form_type !== '4' && r.form_type !== '4/A') continue;
    out.push({
      issuer_cik: r.issuer_cik,
      accession_number: r.accession_number,
      form_type: r.form_type,
    });
  }
  return out;
}

/**
 * Backfill seed helper — read the queue's distinct unconsumed
 * `as_of_date`s within the 63-trading-day window bounded by
 * `previousTradingDay(asOf)` and the oldest trailing day. The queue
 * is authoritative for which days have producer-discovery rows; gaps
 * (days the producer did not run for) stay gaps and are not
 * synthesized here. Most-recent first to match the trailing-days
 * ordering used in unit tests.
 */
async function loadDistinctBackfillDates(
  deps: InsiderWorkListDeps,
  asOf: Date,
): Promise<string[]> {
  const window = trailingTradingDays(asOf, INSIDER_BACKFILL_TRADING_DAYS);
  const oldestIso = isoDate(window[window.length - 1]);
  const newestIso = isoDate(window[0]);
  const { data, error } = await deps.supabase
    .from('insider_accession_discovery_queue')
    .select('as_of_date')
    .gte('as_of_date', oldestIso)
    .lte('as_of_date', newestIso)
    .is('consumed_at', null);
  if (error) {
    throw new Error(
      `insider-work-list-registration: backfill distinct-dates read failed: ${error.message}`,
    );
  }
  const seen = new Set<string>();
  for (const r of (data ?? []) as Array<{ as_of_date: string }>) {
    seen.add(r.as_of_date);
  }
  return Array.from(seen).sort().reverse();
}

async function loadCurrentUniverse(
  deps: InsiderWorkListDeps,
): Promise<Array<{ ticker: string; gics_sector: string | null }>> {
  const { data: latest, error: latestErr } = await deps.supabase
    .from('universe_membership')
    .select('as_of_date')
    .eq('operator_id', deps.operator_id)
    .order('as_of_date', { ascending: false })
    .limit(1);
  if (latestErr) {
    throw new Error(
      `insider-work-list-registration: universe_membership latest-date read failed: ${latestErr.message}`,
    );
  }
  if (!latest || latest.length === 0) return [];
  const asOfDate = (latest[0] as { as_of_date: string }).as_of_date;
  const { data, error } = await deps.supabase
    .from('universe_membership')
    .select('ticker, gics_sector')
    .eq('operator_id', deps.operator_id)
    .eq('as_of_date', asOfDate);
  if (error) {
    throw new Error(
      `insider-work-list-registration: universe_membership read failed: ${error.message}`,
    );
  }
  return (data ?? []) as Array<{ ticker: string; gics_sector: string | null }>;
}

// ─── processItem factory ───────────────────────────────────────────────

function makeProcessItem(deps: InsiderWorkListDeps): WorkListProcessItemFn {
  return async ({ item, asOf }): Promise<WorkListItemResult> => {
    const payload = item.payload as Readonly<InsiderWorkItemPayload>;

    // Step P.1: accession `index.json` discovery.
    const idx: EdgarAccessionIndexResult = await deps.accessionIndex.fetchIndex({
      cik: payload.filer_cik_padded,
      accession_number: item.id,
    });
    if (idx.kind === 'unavailable') {
      return { kind: 'permanent_skip', reason: 'data_unavailable', detail: `accession index 404 (cik=${payload.filer_cik_padded} acc=${item.id})` };
    }
    if (idx.kind === 'rate_limited') {
      // Transient — engine cursor preserved, slice retries naturally.
      throw new SignalComputationError(
        INSIDER_SIGNAL_ID,
        payload.ticker,
        `accession index 429 (cik=${payload.filer_cik_padded} acc=${item.id})`,
      );
    }
    if (idx.kind === 'ambiguous') {
      // M2: typed-permanent `no_primary_doc` — never guess a filename
      // (the INC-70 anti-heuristic rule).
      return {
        kind: 'permanent_skip',
        reason: 'no_primary_doc',
        detail: `eligible=${idx.eligible_count}; filenames=${idx.filenames.join(',')}`,
      };
    }

    // Step P.2: Form-4 XML fetch + parse (M1-hardened parser; absent
    // owner_cik is `unparseable` upstream so the consumer never sees
    // an empty-string sentinel reach the upsert).
    const fetched: EdgarForm4FetchResult = await deps.form4Fetcher.fetchAndParse({
      cik: payload.filer_cik_padded,
      accession_number: item.id,
      acceptance_datetime: idx.acceptance_datetime,
      primary_document: idx.primary_document,
    });
    if (fetched.kind === 'unavailable') {
      return { kind: 'permanent_skip', reason: 'data_unavailable', detail: `form4 xml 404 (cik=${payload.filer_cik_padded} acc=${item.id})` };
    }
    if (fetched.kind === 'rate_limited') {
      throw new SignalComputationError(
        INSIDER_SIGNAL_ID,
        payload.ticker,
        `form4 xml 429 (cik=${payload.filer_cik_padded} acc=${item.id})`,
      );
    }
    if (fetched.kind === 'unparseable') {
      return { kind: 'permanent_skip', reason: 'data_unavailable', detail: `form4 unparseable: ${fetched.reason}` };
    }

    // Step P.3: INC-74 batch-dedupe (PK-scoped — defensive, expected no-op).
    const { kept } = dedupeFormRowsByPk(fetched.rows);

    // Step P.4: a legitimately empty filing (derivative-only / option-
    // exercise-only) returns zero rows — cursor deletes as `processed`,
    // no upsert needed.
    if (kept.length === 0) {
      return { kind: 'processed' };
    }

    // Step P.5: upsert with onConflict quoted verbatim per M5 — the
    // MIG-094 PK triple. `owner_cik` lands on every row (MIG-095 dual-
    // write contract honored by parser-side M1 hardening; the
    // assertion below is a belt-and-braces defense — should never fire).
    const upsertPayload = kept.map((r: EdgarForm4Row) => {
      if (r.owner_cik.length === 0) {
        // Defensive: M1 should have made this unreachable. If it ever
        // fires, we surface a typed-permanent skip rather than write
        // an empty-string sentinel that violates MIG-095 NOT NULL.
        throw new SignalComputationError(
          INSIDER_SIGNAL_ID,
          payload.ticker,
          `MIG-095 dual-write contract violated: empty owner_cik on parsed row (cik=${payload.filer_cik_padded} acc=${item.id} seq=${r.transaction_seq}). M1 parser hardening should have made this unreachable.`,
        );
      }
      return {
        issuer_cik: r.issuer_cik,
        owner_cik: r.owner_cik,
        accession_number: r.accession_number,
        transaction_seq: r.transaction_seq,
        transaction_date: r.transaction_date,
        acceptance_datetime: r.acceptance_datetime,
        transaction_code: r.transaction_code,
        transaction_acquired_disposed: r.acquired_disposed,
        transaction_shares: r.shares,
        transaction_price_per_share: r.price_per_share,
        aff_10b5_one: r.has_10b5_1_mention,
        is_director: r.is_director,
        is_officer: r.is_officer,
        is_ten_percent_owner: r.is_ten_percent_owner,
        officer_title: r.officer_title,
        ticker: payload.ticker,
        filing_form_type: payload.form_type,
        // DEC-034 clause 4: ingested_at derived from injected asOf, NOT
        // wall-clock. The DB-side default `now()` would otherwise inject
        // a non-deterministic timestamp that breaks replay-determinism.
        ingested_at: asOf.toISOString(),
      };
    });

    const { error } = await deps.supabase
      .from('insider_form4_rows')
      .upsert(upsertPayload, {
        onConflict: 'issuer_cik,accession_number,transaction_seq',
      });
    if (error) {
      // Transient — Postgres temporal failures (lock contention, etc.).
      // The engine's 3-strikes deadlock guard handles repeated failure.
      throw new SignalComputationError(
        INSIDER_SIGNAL_ID,
        payload.ticker,
        `insider_form4_rows upsert failed (acc=${item.id}): ${error.message}`,
      );
    }
    // Q1 barrier honored: upsert completed BEFORE returning `processed`.
    return { kind: 'processed' };
  };
}

// ─── loadAndCompute adapter (M3: calls runStaged; engine owns z+persist) ─

function makeLoadAndCompute(deps: InsiderWorkListDeps): WorkListLoadAndComputeFn {
  return async ({ asOf }) => {
    const staged = await createInsiderLoadAndCompute(deps.loadAndComputeCtx).runStaged(asOf);
    if (staged.kind === 'short-circuit') {
      // The engine's WorkListLoadAndComputeFn has no `failed` discriminator;
      // throwing surfaces as `fetch_error` at the finalizer with the
      // failure_reason verbatim — matches the deleted-orchestrator's
      // `outcome:'failed'` boundary semantics.
      throw new SignalComputationError(
        INSIDER_SIGNAL_ID,
        '__loadAndCompute__',
        `loadAndCompute short-circuit: ${staged.failure_reason}`,
      );
    }
    return staged.per_ticker.map((r) => {
      if (r.kind === 'value') {
        const result: TickerComputeResult = { kind: 'value', raw: r.raw_signal };
        return { ticker: r.ticker, gicsSector: r.gics_sector, result };
      }
      const result: TickerComputeResult = { kind: 'skip', reason: r.skip.reason, detail: r.skip.detail ?? '' };
      return { ticker: r.skip.ticker, gicsSector: null, result };
    });
  };
}

// ─── Registration entrypoint (sibling of news/PEAD/options) ────────────

/**
 * Idempotent registration — guarded so duplicate side-effect imports
 * no-op cleanly (parity with `registerNewsSentimentQueueConsumer`).
 * Caller passes the constructed deps + mode; γ commit-2 wires the
 * cron handler to `'daily'` and the manual handler to `'backfill'`.
 *
 * Note: same `signalId` for both modes (the engine's `register` throws
 * on duplicate `signalId`); only ONE registration may live at a time
 * per isolate. γ commit-2's handlers each construct their own deps +
 * call this function — the backfill manual handler isolate has its
 * own registry entry, and the daily cron handler isolate has its own.
 */
export function registerInsiderQueueConsumer(
  deps: InsiderWorkListDeps,
  mode: InsiderWorkListMode,
): void {
  if (productionQueueRegistry.has(INSIDER_SIGNAL_ID)) return;
  productionQueueRegistry.register(createInsiderWorkListConfig(deps, mode));
}