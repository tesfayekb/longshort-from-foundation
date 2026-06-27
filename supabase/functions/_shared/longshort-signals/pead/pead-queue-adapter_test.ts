// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import per FP-045 Phase 3 sentinel pattern
// @ts-nocheck — Deno test file.
/**
 * Unit tests for the PEAD queue-worker adapter (FP-045 Phase 3).
 *
 * Covers the same skip/value paths as the orchestrator's per-ticker arm,
 * sourced through the engine's TickerComputeFn contract. The orchestrator
 * itself stays untouched (used by the manual handler) — these tests
 * guarantee the adapter's behavior is semantically locked to the
 * orchestrator's even though the two share no code.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createPeadAdapter } from './pead-queue-adapter.ts';

const AS_OF = new Date('2026-06-09T20:00:00Z');

function epsFetcher(rows: unknown) {
  return { async fetchEpsEstimates(_t: string) { return rows; } } as unknown;
}
function earnFetcher(rows: unknown) {
  return { async fetchEarnings(_t: string) { return rows; } } as unknown;
}

Deno.test('adapter: unavailable eps-estimate (subscription_gated) → typed skip', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'unavailable', reason: 'subscription_gated' }),
    earnings: earnFetcher({ kind: 'ok', rows: [] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals(r.kind, 'skip');
  assertEquals((r as unknown).reason, 'subscription_gated');
});

Deno.test('adapter: unavailable eps-estimate (data_unavailable) → data_unavailable skip', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'unavailable', reason: 'data_unavailable' }),
    earnings: earnFetcher({ kind: 'ok', rows: [] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'data_unavailable');
});

Deno.test('adapter: unavailable earnings (data_unavailable) → no_recent_earnings skip', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'ok', rows: [] }),
    earnings: earnFetcher({ kind: 'unavailable', reason: 'data_unavailable' }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'no_recent_earnings');
});

Deno.test('adapter: fetcher throw → typed fetch_error skip (never throws to engine)', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: { async fetchEpsEstimates() { throw new Error('vendor 503'); } } as unknown,
    earnings: earnFetcher({ kind: 'ok', rows: [] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals(r.kind, 'skip');
  assertEquals((r as unknown).reason, 'fetch_error');
  assert(String((r as unknown).detail).includes('vendor 503'));
});

Deno.test('adapter: no matching period → no_recent_earnings', async () => {
  // earnings row exists but no matching eps-estimate row for same period.
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'ok', rows: [
      { period: '2024-03-31', epsAvg: 1, epsHigh: 1.1, epsLow: 0.9, numberAnalysts: 5 },
    ] }),
    earnings: earnFetcher({ kind: 'ok', rows: [
      { period: '2026-03-31', actual: 1.5, estimate: 1.3 },
    ] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'no_recent_earnings');
});

Deno.test('adapter: panel below floor (N=1) → pead_panel_below_floor', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'ok', rows: [
      { period: '2026-03-31', epsAvg: 1, epsHigh: 1.1, epsLow: 0.9, numberAnalysts: 1 },
    ] }),
    earnings: earnFetcher({ kind: 'ok', rows: [
      { period: '2026-03-31', actual: 1.5, estimate: 1.0 },
    ] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'pead_panel_below_floor');
});

Deno.test('adapter: zero dispersion (high==low) → zero_dispersion', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'ok', rows: [
      { period: '2026-03-31', epsAvg: 1.0, epsHigh: 1.0, epsLow: 1.0, numberAnalysts: 4 },
    ] }),
    earnings: earnFetcher({ kind: 'ok', rows: [
      { period: '2026-03-31', actual: 1.5, estimate: 1.0 },
    ] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'zero_dispersion');
});

Deno.test('adapter: happy path returns kind=value with finite raw', async () => {
  const adapter = createPeadAdapter({
    epsEstimate: epsFetcher({ kind: 'ok', rows: [
      { period: '2026-05-31', epsAvg: 1.0, epsHigh: 1.2, epsLow: 0.8, numberAnalysts: 8 },
    ] }),
    earnings: earnFetcher({ kind: 'ok', rows: [
      { period: '2026-05-31', actual: 1.5, estimate: 1.0 },
    ] }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals(r.kind, 'value');
  assert(Number.isFinite((r as unknown).raw));
});

// ── FP-057 Sub-step 4b — work-list pre-filter short-circuit ───────────

function calendarFetcher(tickers: string[]) {
  let calls = 0;
  return {
    get calls() { return calls; },
    fetcher: {
      async fetchCalendar(_f: string, _t: string) {
        calls++;
        return { kind: 'calendar' as const, tickers: new Set(tickers) };
      },
    },
  };
}

Deno.test('adapter [4b]: ticker NOT in work-list → no_recent_earnings skip WITHOUT dual-fetch', async () => {
  let estCalls = 0, earnCalls = 0;
  const adapter = createPeadAdapter({
    epsEstimate: { async fetchEpsEstimates() { estCalls++; return { kind: 'ok', rows: [] }; } } as unknown,
    earnings: { async fetchEarnings() { earnCalls++; return { kind: 'ok', rows: [] }; } } as unknown,
    earningsCalendar: calendarFetcher(['MSFT']).fetcher as never,
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals(r.kind, 'skip');
  assertEquals((r as unknown).reason, 'no_recent_earnings');
  assert(String((r as unknown).detail).includes('not in event work-list'));
  // CRITICAL: zero Finnhub fetches for filtered-out names.
  assertEquals(estCalls, 0);
  assertEquals(earnCalls, 0);
});

Deno.test('adapter [4b]: ticker IN work-list → dual-fetch proceeds normally', async () => {
  let estCalls = 0;
  const adapter = createPeadAdapter({
    epsEstimate: {
      async fetchEpsEstimates() {
        estCalls++;
        return { kind: 'ok', rows: [
          { period: '2026-05-31', epsAvg: 1.0, epsHigh: 1.2, epsLow: 0.8, numberAnalysts: 8 },
        ] };
      },
    } as unknown,
    earnings: earnFetcher({ kind: 'ok', rows: [
      { period: '2026-05-31', actual: 1.5, estimate: 1.0 },
    ] }),
    earningsCalendar: calendarFetcher(['AAPL']).fetcher as never,
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals(r.kind, 'value');
  assertEquals(estCalls, 1);
});

Deno.test('adapter [4b]: calendar fetched ONCE per as_of_date across many ticker calls (memoization)', async () => {
  const cal = calendarFetcher(['AAPL']);
  const adapter = createPeadAdapter({
    epsEstimate: { async fetchEpsEstimates() { return { kind: 'ok', rows: [] }; } } as unknown,
    earnings: { async fetchEarnings() { return { kind: 'ok', rows: [] }; } } as unknown,
    earningsCalendar: cal.fetcher as never,
  });
  // 5 calls across the same as_of_date.
  for (const t of ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA']) {
    await adapter({ ticker: t, gicsSector: 'Tech', asOf: AS_OF });
  }
  // Memoized: exactly ONE calendar fetch despite 5 ticker invocations.
  assertEquals(cal.calls, 1);
});

Deno.test('adapter [4b]: empty calendar (unavailable) → every ticker short-circuits, NO full-universe fallback', async () => {
  let estCalls = 0;
  const emptyCal = {
    async fetchCalendar() {
      return { kind: 'unavailable' as const, reason: 'data_unavailable' as const };
    },
  };
  const adapter = createPeadAdapter({
    epsEstimate: { async fetchEpsEstimates() { estCalls++; return { kind: 'ok', rows: [] }; } } as unknown,
    earnings: { async fetchEarnings() { return { kind: 'ok', rows: [] }; } } as unknown,
    earningsCalendar: emptyCal as never,
  });
  for (const t of ['AAPL', 'MSFT', 'GOOG']) {
    const r = await adapter({ ticker: t, gicsSector: 'Tech', asOf: AS_OF });
    assertEquals(r.kind, 'skip');
    assertEquals((r as unknown).reason, 'no_recent_earnings');
  }
  // STOP-condition: ZERO Finnhub fetches even though calendar said "unavailable".
  assertEquals(estCalls, 0);
});