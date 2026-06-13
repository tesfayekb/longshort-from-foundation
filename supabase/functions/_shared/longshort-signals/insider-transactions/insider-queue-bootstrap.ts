/**
 * insider-queue-bootstrap.ts — FP-050 Phase 3.6b.iii′ γ commit-2.
 *
 * Production wiring for Signal #4's work-list consumer. Two surfaces:
 *
 *   (1) `registerInsiderDailyConsumer()` — side-effect helper imported
 *       by `production-registrations.ts`. Registers Signal #4 in
 *       DAILY mode with lazy env-derived deps (parity with the news
 *       fetcher's lazy-construction pattern: `EDGAR_CONTACT_EMAIL` and
 *       `POLYGON_API_KEY` are read at first invocation, not at import,
 *       so test isolates remain constructable without the secrets).
 *
 *   (2) `buildInsiderBackfillConfig()` — used by the manual handler
 *       when the operator passes `backfill: true`. Builds a fresh
 *       `QueueSignalConfig` in BACKFILL mode and hands it directly to
 *       `initQueueRun`, BYPASSING the registry. The slice-worker /
 *       sweeper isolates still read DAILY-mode config from their own
 *       registries — processItem and loadAndCompute are mode-agnostic,
 *       so the asymmetry is safe by construction (asserted in the
 *       cross-mode contamination test).
 *
 * Wall-clock discipline (DEC-034 clause 4): no clock reads in this
 * file. `as_of` is supplied by the caller (handlers derive it from
 * `productionClock`).
 *
 * Owner: longshort (FP-050 — Phase 3.6b.iii′ γ commit-2).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../supabase-admin.ts';
import { productionQueueRegistry, type QueueSignalConfig } from '../shared/queue-worker/queue-config.ts';
import { EdgarCikMapper } from './edgar-cik-mapper.ts';
import { EdgarAccessionIndexFetcher } from './edgar-accession-index-fetcher.ts';
import { EdgarForm4Fetcher } from './edgar-form4-fetcher.ts';
import { PolygonSharesOutstandingFetcher } from '../shared/polygon-shares-outstanding-fetcher.ts';
import { PolygonPriceHistoryFetcher } from '../shared/polygon-price-history-fetcher.ts';
import {
  createInsiderWorkListConfig,
  INSIDER_SIGNAL_ID,
  type InsiderWorkListDeps,
  type InsiderWorkListMode,
} from './insider-work-list-registration.ts';

/** Default operator id — parity with `longshort-queue-init` handlers. */
export const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

function readEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || v.length === 0) {
    throw new Error(
      `insider-queue-bootstrap: ${name} is unset — required by the Signal #4 work-list consumer`,
    );
  }
  return v;
}

/**
 * Construct the full `InsiderWorkListDeps` from process env + the shared
 * Supabase admin client. Eager — throws if any secret is missing. Called
 * by `registerInsiderDailyConsumer` and `buildInsiderBackfillConfig` at
 * fire time, not at module import time (so test isolates without the
 * secrets can still import this file).
 */
export function buildInsiderDepsFromEnv(
  supabase: SupabaseClient = supabaseAdmin,
  operator_id: string = DEFAULT_OPERATOR_ID,
): InsiderWorkListDeps {
  const contactEmail = readEnv('EDGAR_CONTACT_EMAIL');
  const polygonKey = readEnv('POLYGON_API_KEY');
  const cikMapper = new EdgarCikMapper(contactEmail);
  const accessionIndex = new EdgarAccessionIndexFetcher(contactEmail);
  const form4Fetcher = new EdgarForm4Fetcher(contactEmail);
  const sharesOutstanding = new PolygonSharesOutstandingFetcher(polygonKey);
  const priceHistory = new PolygonPriceHistoryFetcher(polygonKey);
  return {
    supabase,
    operator_id,
    cikMapper,
    accessionIndex,
    form4Fetcher,
    loadAndComputeCtx: { supabase, operator_id, priceHistory, sharesOutstanding },
  };
}

/**
 * Idempotent registration — guarded so duplicate side-effect imports
 * (e.g. cron + slice + sweeper isolates each re-importing
 * `production-registrations.ts`) no-op cleanly.
 *
 * Lazy-deps pattern: the seed/processItem/loadAndCompute closures
 * resolve `buildInsiderDepsFromEnv()` on FIRST INVOCATION, cached
 * thereafter. Import-time has no env dependency.
 *
 * Mode is DAILY — backfill mode is reachable only via the manual
 * handler's per-request config build (`buildInsiderBackfillConfig`)
 * and is intentionally NOT registered (the queue engine's registry
 * rejects duplicate signalId, and the slice/sweeper paths don't need
 * the backfill seed — only init does).
 */
export function registerInsiderDailyConsumer(): void {
  if (productionQueueRegistry.has(INSIDER_SIGNAL_ID)) return;

  let cached: InsiderWorkListDeps | null = null;
  const getDeps = (): InsiderWorkListDeps => {
    if (cached !== null) return cached;
    cached = buildInsiderDepsFromEnv();
    return cached;
  };

  // Build a daily config eagerly, but wrap its closures so the deps
  // they captured are resolved lazily. We use a sentinel placeholder
  // deps object that throws if its fields are touched at import time,
  // and a Proxy-like wrapper would over-engineer this; instead we
  // construct the config via a thin wrapper that resolves deps on
  // first invocation of each closure.
  productionQueueRegistry.register(buildLazyWorkListConfig(getDeps, 'daily'));
}

/**
 * Build a fresh backfill-mode config for the manual handler. Eager —
 * env reads happen here. NOT registered (passed directly to
 * `initQueueRun`).
 */
export function buildInsiderBackfillConfig(
  supabase: SupabaseClient = supabaseAdmin,
  operator_id: string = DEFAULT_OPERATOR_ID,
): QueueSignalConfig {
  const deps = buildInsiderDepsFromEnv(supabase, operator_id);
  return createInsiderWorkListConfig(deps, 'backfill');
}

/**
 * Lazy-deps wrapper around `createInsiderWorkListConfig`. The returned
 * config carries the SAME field shape (engine never introspects the
 * closures); each closure resolves `getDeps()` on first call.
 */
function buildLazyWorkListConfig(
  getDeps: () => InsiderWorkListDeps,
  mode: InsiderWorkListMode,
): QueueSignalConfig {
  let resolved: QueueSignalConfig | null = null;
  const resolve = (): QueueSignalConfig => {
    if (resolved !== null) return resolved;
    resolved = createInsiderWorkListConfig(getDeps(), mode);
    return resolved;
  };
  // Build a SHELL config carrying the constants (signalId/jobId/rates/
  // mode + the work-list field markers) and closure wrappers that
  // forward to the resolved config's closures on first call. The engine
  // validates field SHAPE only — function presence + primitive bounds —
  // so the shell passes validation and the lazy resolution happens at
  // first invocation.
  const eagerForConstants = createInsiderWorkListConfig(
    // The placeholder deps are NEVER touched at import — they're only
    // captured by the closures we then overwrite below.
    placeholderDeps(),
    mode,
  );
  return {
    ...eagerForConstants,
    seedWorkItems: (args) => resolve().seedWorkItems!(args),
    processItem: (args) => resolve().processItem!(args),
    loadAndCompute: (args) => resolve().loadAndCompute!(args),
  };
}

/**
 * A deps placeholder used to build the constants-bearing shell config.
 * Fields are typed but unused — the lazy wrapper REPLACES the closures
 * that would have captured them before any closure is invoked.
 */
function placeholderDeps(): InsiderWorkListDeps {
  const stub = {} as never;
  return {
    supabase: stub,
    operator_id: DEFAULT_OPERATOR_ID,
    cikMapper: stub,
    accessionIndex: stub,
    form4Fetcher: stub,
    loadAndComputeCtx: stub,
  };
}