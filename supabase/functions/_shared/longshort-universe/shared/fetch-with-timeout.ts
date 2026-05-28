/**
 * fetch-with-timeout — FP-009a hardening helper.
 *
 * Provides:
 *   - `fetchWithTimeout(httpFetch, url, init, timeoutMs)` — wraps `httpFetch`
 *     in an `AbortController` that fires after `timeoutMs`. Re-raises the
 *     underlying error (including `AbortError` on timeout) so callers can
 *     wrap it into the file's domain error type.
 *   - `fetchWithTimeoutAndRetry(httpFetch, url, init, opts)` — same as above
 *     plus exponential backoff on 429 / 5xx responses and network/abort
 *     errors. Bounded by `maxAttempts` (default 3) with delays in
 *     `backoffMs` (default [1000, 2000, 4000]).
 *
 * Shared across the three universe fetchers (Polygon constituent, iShares
 * constituent, Polygon enrichment) per the FP-009a §2/§3 hardening surface.
 * Module-private extraction (one helper, three call sites) keeps each
 * fetcher free of duplicated control flow while preserving each fetcher's
 * own error-wrapping at the catch boundary.
 *
 * No clock injection — `setTimeout` is the only wall-clock surface, and the
 * helper does NOT reason about market time. Replay parity is preserved
 * because production fetchers are gated behind `universe.enabled=false` and
 * unit tests use `vi.useFakeTimers()` to advance the timeout/backoff
 * deterministically.
 */

export type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type MinimalHttpResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

export type MinimalHttpFetch = (
  input: string,
  init?: FetchInit,
) => Promise<MinimalHttpResponse>;

/** Default per-request timeout. iShares CSV downloads may need a longer cap;
 *  callers can override via `timeoutMs`. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/** Default backoff schedule between retry attempts (ms). Length sets the
 *  per-attempt delay; `maxAttempts` caps total attempts. */
export const DEFAULT_RETRY_BACKOFF_MS: ReadonlyArray<number> = [1000, 2000, 4000];

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: ReadonlyArray<number>;
  /** Override the sleep primitive — exposed for tests with fake timers that
   *  pre-empt the default `setTimeout` path. */
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(
  httpFetch: MinimalHttpFetch,
  url: string,
  init: FetchInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<MinimalHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await httpFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wrap `fetchWithTimeout` with exponential-backoff retry on transient
 * failures. Retry triggers:
 *   - HTTP 429 (rate-limited)
 *   - HTTP 5xx (server errors)
 *   - AbortError (per-request timeout fired)
 *   - TypeError (Node/Deno fetch network-error class)
 *
 * Non-retryable conditions (4xx other than 429, parse errors, etc.) are
 * passed through to the caller unchanged.
 */
export async function fetchWithTimeoutAndRetry(
  httpFetch: MinimalHttpFetch,
  url: string,
  init: FetchInit = {},
  opts: FetchWithRetryOptions = {},
): Promise<MinimalHttpResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const backoffMs = opts.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  const maxAttempts = opts.maxAttempts ?? backoffMs.length;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  // Guard: backoffMs must be non-empty so the index lookup below is always
  // defined for any attempt >= 1. Empty backoffMs is a configuration error,
  // not a runtime condition we silently zero through.
  if (maxAttempts > 1 && backoffMs.length === 0) {
    throw new Error(
      'fetch-with-timeout: backoffMs must be non-empty when maxAttempts > 1',
    );
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      // Math.min clamp keeps idx within [0, backoffMs.length-1]. The
      // pre-loop guard above proves backoffMs.length >= 1 here, so the
      // index lookup is always defined. The explicit undefined-check is
      // §2 axiom 3 typed-absence discipline: if the invariant ever breaks
      // we throw rather than silently sleep(0) and burn retries instantly.
      const idx = Math.min(attempt - 1, backoffMs.length - 1);
      const delay = backoffMs[idx];
      if (delay === undefined) {
        throw new Error(
          `fetch-with-timeout: backoff index out of range (idx=${idx}, len=${backoffMs.length})`,
        );
      }
      await sleep(delay);
    }
    try {
      const resp = await fetchWithTimeout(httpFetch, url, init, timeoutMs);
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        lastError = new Error(`HTTP ${resp.status} ${resp.statusText}`);
        // Drain the body to free the connection before retrying.
        try { await resp.text(); } catch { /* ignore */ }
        continue;
      }
      return resp;
    } catch (e) {
      lastError = e;
      const isRetryable =
        e instanceof Error && (e.name === 'AbortError' || e.name === 'TypeError');
      if (!isRetryable) throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed after retries');
}