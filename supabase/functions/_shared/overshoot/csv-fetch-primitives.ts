/**
 * csv-fetch-primitives — overshoot-local copies of three tiny leaf utilities
 * previously imported from the longshort tree.
 *
 * Provenance (LOCALIZED per FP-069 Separation Contract; supervisor-directed
 * "reuse fetcher primitives verbatim" reversed — copy-don't-import discipline
 * across strategy boundaries):
 *   - `fetchWithTimeoutAndRetry` copied verbatim from
 *     `_shared/longshort-universe/shared/fetch-with-timeout.ts`.
 *   - `parseCsvLine` / `findHeaderRowIndex` copied verbatim from
 *     `_shared/longshort-universe/constituent-ingestion/ishares-constituent-fetcher.ts`.
 *
 * Any future divergence between the two copies is intentional — this file is
 * owned by the overshoot module. Do not add re-imports from longshort here.
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

export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_RETRY_BACKOFF_MS: ReadonlyArray<number> = [1000, 2000, 4000];

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: ReadonlyArray<number>;
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
  if (maxAttempts > 1 && backoffMs.length === 0) {
    throw new Error(
      'csv-fetch-primitives: backoffMs must be non-empty when maxAttempts > 1',
    );
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const idx = Math.min(attempt - 1, backoffMs.length - 1);
      const delay = backoffMs[idx];
      if (delay === undefined) {
        throw new Error(
          `csv-fetch-primitives: backoff index out of range (idx=${idx}, len=${backoffMs.length})`,
        );
      }
      await sleep(delay);
    }
    try {
      const resp = await fetchWithTimeout(httpFetch, url, init, timeoutMs);
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        lastError = new Error(`HTTP ${resp.status} ${resp.statusText}`);
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

/**
 * Parse a single CSV line, honoring double-quote escapes per RFC 4180.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/**
 * Locate the header row in an iShares holdings CSV — the first line whose
 * fields include a column literally named `Ticker` (case-insensitive).
 * Returns the zero-based line index, or `null` (typed absence) if not found.
 */
export function findHeaderRowIndex(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]).map((f) => f.toLowerCase());
    if (fields.includes('ticker')) return i;
  }
  return null;
}