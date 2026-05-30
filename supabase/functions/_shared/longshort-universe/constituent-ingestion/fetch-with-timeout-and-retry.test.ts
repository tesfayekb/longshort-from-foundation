/**
 * Vitest behavioral tests for the FP-009a fetch-with-timeout + retry helper.
 *
 * Covers:
 *   - per-request timeout fires → AbortError raised
 *   - 429 response → retried with backoff → eventual success on attempt 3
 *   - 5xx response → retried → exhausted attempts → throws
 *   - 4xx (non-429) response → NOT retried (returned to caller as-is)
 *   - network TypeError → retried
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithTimeout,
  fetchWithTimeoutAndRetry,
  type MinimalHttpFetch,
  type MinimalHttpResponse,
} from '../shared/fetch-with-timeout.ts';

function mkResp(status: number, body: unknown = {}): MinimalHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `STATUS_${status}`,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  };
}

// Fast no-op sleep so backoff doesn't slow the suite.
const noSleep = async (_ms: number) => {};

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aborts the underlying fetch when the timeout fires', async () => {
    // The mock fetch resolves when its signal is aborted.
    const httpFetch: MinimalHttpFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const promise = fetchWithTimeout(httpFetch, 'https://x', {}, 1000);
    // Attach a rejection handler before advancing timers to avoid unhandled
    // rejection noise from Vitest's fake timers.
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });
});

describe('fetchWithTimeoutAndRetry', () => {
  it('retries on 429 and succeeds on a later attempt', async () => {
    let calls = 0;
    const httpFetch: MinimalHttpFetch = async () => {
      calls += 1;
      if (calls < 3) return mkResp(429);
      return mkResp(200, { ok: true });
    };
    const resp = await fetchWithTimeoutAndRetry(httpFetch, 'https://x', {}, {
      sleep: noSleep,
      maxAttempts: 3,
    });
    expect(calls).toBe(3);
    expect(resp.status).toBe(200);
  });

  it('retries 5xx and throws after exhausting attempts', async () => {
    let calls = 0;
    const httpFetch: MinimalHttpFetch = async () => {
      calls += 1;
      return mkResp(503);
    };
    await expect(
      fetchWithTimeoutAndRetry(httpFetch, 'https://x', {}, {
        sleep: noSleep,
        maxAttempts: 3,
      }),
    ).rejects.toThrow(/HTTP 503/);
    expect(calls).toBe(3);
  });

  it('does NOT retry on a non-429 4xx response', async () => {
    let calls = 0;
    const httpFetch: MinimalHttpFetch = async () => {
      calls += 1;
      return mkResp(401);
    };
    const resp = await fetchWithTimeoutAndRetry(httpFetch, 'https://x', {}, {
      sleep: noSleep,
      maxAttempts: 3,
    });
    expect(calls).toBe(1);
    expect(resp.status).toBe(401);
  });

  it('retries on TypeError (network error)', async () => {
    let calls = 0;
    const httpFetch: MinimalHttpFetch = async () => {
      calls += 1;
      if (calls < 2) {
        const err = new TypeError('fetch failed');
        throw err;
      }
      return mkResp(200);
    };
    const resp = await fetchWithTimeoutAndRetry(httpFetch, 'https://x', {}, {
      sleep: noSleep,
      maxAttempts: 3,
    });
    expect(calls).toBe(2);
    expect(resp.status).toBe(200);
  });

  it('does NOT retry on a non-retryable error class', async () => {
    const httpFetch: MinimalHttpFetch = async () => {
      throw new Error('parse exploded');
    };
    await expect(
      fetchWithTimeoutAndRetry(httpFetch, 'https://x', {}, {
        sleep: noSleep,
        maxAttempts: 3,
      }),
    ).rejects.toThrow(/parse exploded/);
  });
});
describe('fetchWithTimeoutAndRetry — configuration guards', () => {
  it('throws on empty backoffMs when maxAttempts > 1', async () => {
    const httpFetch = vi.fn();
    await expect(
      fetchWithTimeoutAndRetry(httpFetch as unknown as MinimalHttpFetch, 'https://example.test/x', {}, {
        maxAttempts: 3,
        backoffMs: [],
      }),
    ).rejects.toThrow(/backoffMs must be non-empty/);
    expect(httpFetch).not.toHaveBeenCalled();
  });

  it('accepts empty backoffMs when maxAttempts = 1 (no retry path exercised)', async () => {
    const ok: MinimalHttpResponse = {
      ok: true, status: 200, statusText: 'OK',
      text: async () => '', json: async () => ({}),
    };
    const httpFetch = vi.fn().mockResolvedValue(ok);
    const resp = await fetchWithTimeoutAndRetry(httpFetch as unknown as MinimalHttpFetch, 'https://example.test/x', {}, {
      maxAttempts: 1,
      backoffMs: [],
    });
    expect(resp.ok).toBe(true);
    expect(httpFetch).toHaveBeenCalledTimes(1);
  });
});
