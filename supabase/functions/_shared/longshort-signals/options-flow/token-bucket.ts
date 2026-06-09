/**
 * Leaky-bucket pacer for Tradier production market-data
 * (FP-043 / Signal #3 / Phase 3 — ACT-157 confirmed cap: 120 req/min).
 *
 * Contract:
 *   - `acquire()` resolves immediately on first call, then spaces every
 *     subsequent call at exactly `1000 / ratePerSec` ms apart.
 *   - Time advances via injectable `now()` (defaults to the sanctioned
 *     `productionClock` from `_shared/longshort-clock.ts`, which is the
 *     SOLE wall-clock read location per DEC-034 (4)) and `sleep()`
 *     (defaults to `setTimeout`-based), so tests can run deterministically
 *     without consuming real wall-clock.
 *   - This is operational rate-limiting infrastructure, NOT a strategy-
 *     decision kernel: per docs/00-governance/constitution.md the wall-
 *     clock ban applies to reconciliation / replay / strategy-decision
 *     code. Rate-limit pacing is permitted to use real time (parallels
 *     `supabase/functions/_shared/rate-limit.ts:73`).
 *
 * Per-worker sizing (coordinator passes this in):
 *   total Tradier cap = 120 req/min = 2 req/sec
 *   N workers = 6  →  per-worker target ≈ 0.3 req/sec (≈108/min total,
 *   ~10% headroom under cap; absorbs 429 retries via the fetcher's
 *   existing fetchWithTimeoutAndRetry [1s,2s,4s] schedule without
 *   compounding into a cap violation).
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 3)
 */

import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { productionClock } from '../../longshort-clock.ts';

export interface TokenBucketOptions {
  ratePerSec: number;
  /** Injectable monotonic-ish clock; defaults to Date.now. */
  now?: () => number;
  /** Injectable sleep; defaults to setTimeout-based promise. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class TokenBucket {
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private nextAvailableMs: number;

  constructor(opts: TokenBucketOptions) {
    if (!Number.isFinite(opts.ratePerSec) || opts.ratePerSec <= 0) {
      throw new Error(`TokenBucket: ratePerSec must be > 0, got ${opts.ratePerSec}`);
    }
    this.intervalMs = 1000 / opts.ratePerSec;
    // Default clock routes through the sanctioned `productionClock` so this
    // file contains NO direct wall-clock read. The pacer is operational
    // rate-limiting (not a signal-value path); the signal value is derived
    // entirely from `as_of` math in compute-options-flow.ts.
    this.now = opts.now ?? (() => productionClock.getWallClockTs().getTime());
    this.sleep = opts.sleep ?? defaultSleep;
    this.nextAvailableMs = this.now();
  }

  /** Block until a token is available, then consume it. */
  async acquire(): Promise<void> {
    const nowMs = this.now();
    const scheduled = Math.max(nowMs, this.nextAvailableMs);
    this.nextAvailableMs = scheduled + this.intervalMs;
    const wait = scheduled - nowMs;
    if (wait > 0) await this.sleep(wait);
  }
}

/**
 * Build a paced `HttpFetch` by wrapping any underlying fetch with a token-
 * bucket `acquire()` before delegation. Compatible with
 * `TradierOptionsChainFetcher`'s `HttpFetch` constructor parameter.
 */
export function pacedHttpFetch(bucket: TokenBucket, underlying: HttpFetch): HttpFetch {
  return async (input, init) => {
    await bucket.acquire();
    return underlying(input, init);
  };
}