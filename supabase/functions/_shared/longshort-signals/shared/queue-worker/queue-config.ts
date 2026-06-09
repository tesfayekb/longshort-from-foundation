/**
 * Static, type-checked registry of queue-worker consumer configurations
 * (FP-045 / DEC-047 / Phase 2 addendum §1).
 *
 * Config-as-code, NOT a DB table:
 *   - These are ENGINE tuning parameters (slice size, vendor-rate share,
 *     calls-per-name, per-ticker compute adapter), not cadence — cadence
 *     remains in `job_registry` per DEC-048.
 *   - Type-checked: a new rate-capped signal is one registry entry; no
 *     schema migration, no runtime config drift between environments.
 *   - Reviewable: changes appear in code review diffs alongside the
 *     compute-arm + adapter that consume them.
 *
 * Phase 2 ships the engine + the registry TYPE + an EMPTY production
 * registry. Phase 3 registers PEAD; Phase 4 registers options-flow.
 * Tests build their own synthetic registries via `createTestRegistry()`
 * — never mutate the production singleton.
 *
 * Adapter contract (§2 of the addendum): compute code stays untouched.
 * Adapters wrap the existing per-ticker compute arm — `computePead`
 * dual-fetch for PEAD; `runOptionsFlowChunk` per-ticker for options.
 * The engine NEVER interprets signal semantics: `zero_dispersion`, the
 * PEAD N≥2 floor, options-flow MIN_QUALIFYING_PRINTS — all stay inside
 * the compute fns (Phase 2 addendum §7).
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

import type { SignalSkipReason } from '../signal-types.ts';

/**
 * Per-ticker compute adapter — returns a value-or-typed-skip. The engine
 * persists what it's told; it never fabricates a fallback. Throwing from
 * this function is treated as `fetch_error` by the slice-worker so a
 * vendor blip never silently drops a ticker.
 *
 * `asOf` is the run's wall-clock-derived `as_of`. Adapters MUST NOT call
 * `Date.now()` / `productionClock` directly — derive timestamps from
 * `asOf` (DEC-034 clause 4).
 */
export type TickerComputeFn = (args: {
  ticker: string;
  gicsSector: string | null;
  asOf: Date;
}) => Promise<TickerComputeResult>;

export type TickerComputeResult =
  | { kind: 'value'; raw: number }
  | { kind: 'skip'; reason: SignalSkipReason; detail: string };

export interface QueueSignalConfig {
  /** Stable signal id — matches `signal_observations.signal_id` etc. */
  signalId: string;
  /** `job_registry.id` for the init cron (truth-in-telemetry per DEC-048). */
  jobId: string;
  /** Vendor cap × 0.85 safety. PEAD: 4.25 (300/min Finnhub). Options: 1.7 (120/min Tradier). */
  ratePerSec: number;
  /** Drives the pre-flight arithmetic row. PEAD: 2. Options: 1. */
  callsPerName: number;
  /**
   * Slice size — tickers claimed per slice-worker invocation. Chosen so
   * `(sliceSize × callsPerName) / ratePerSec` fits well under the 150s
   * HTTP wall (Phase 2 addendum §6 — engine module doc captures the
   * arithmetic table).
   */
  sliceSize: number;
  /** Heartbeat staleness threshold for the orphan-sweeper, in seconds. */
  heartbeatTimeoutSec: number;
  /** Staging TTL for completed runs — sweeper deletes staging older than this. */
  stagingTtlSec: number;
  /** Per-ticker compute adapter — wraps the existing compute arm. */
  fetchAndCompute: TickerComputeFn;
}

export class QueueConfigRegistry {
  private readonly map = new Map<string, QueueSignalConfig>();

  register(cfg: QueueSignalConfig): void {
    validateConfig(cfg);
    if (this.map.has(cfg.signalId)) {
      throw new Error(
        `QueueConfigRegistry: signal_id '${cfg.signalId}' already registered`,
      );
    }
    this.map.set(cfg.signalId, cfg);
  }

  /** Throws if signalId is not registered — fail-loud (no silent fallback). */
  get(signalId: string): QueueSignalConfig {
    const cfg = this.map.get(signalId);
    if (!cfg) {
      throw new Error(
        `QueueConfigRegistry: no config registered for signal_id '${signalId}'`,
      );
    }
    return cfg;
  }

  has(signalId: string): boolean {
    return this.map.has(signalId);
  }

  listSignalIds(): string[] {
    return Array.from(this.map.keys()).sort();
  }
}

function validateConfig(cfg: QueueSignalConfig): void {
  if (!cfg.signalId || typeof cfg.signalId !== 'string') {
    throw new Error('QueueSignalConfig: signalId must be a non-empty string');
  }
  if (!cfg.jobId || typeof cfg.jobId !== 'string') {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: jobId must be a non-empty string`);
  }
  if (!Number.isFinite(cfg.ratePerSec) || cfg.ratePerSec <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: ratePerSec must be > 0`);
  }
  if (!Number.isInteger(cfg.callsPerName) || cfg.callsPerName <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: callsPerName must be a positive integer`);
  }
  if (!Number.isInteger(cfg.sliceSize) || cfg.sliceSize <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: sliceSize must be a positive integer`);
  }
  if (!Number.isInteger(cfg.heartbeatTimeoutSec) || cfg.heartbeatTimeoutSec <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: heartbeatTimeoutSec must be > 0`);
  }
  if (!Number.isInteger(cfg.stagingTtlSec) || cfg.stagingTtlSec <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: stagingTtlSec must be > 0`);
  }
  if (typeof cfg.fetchAndCompute !== 'function') {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: fetchAndCompute must be a function`);
  }
}

/**
 * The production singleton — intentionally EMPTY in Phase 2. Phase 3
 * registers PEAD; Phase 4 registers options-flow. Consumer registration
 * lives in the consumer's own module so deletion of a signal removes its
 * registration alongside its code (T6 per-strategy removability).
 */
export const productionQueueRegistry = new QueueConfigRegistry();

/** Build an isolated registry for tests; never share state with production. */
export function createTestRegistry(): QueueConfigRegistry {
  return new QueueConfigRegistry();
}