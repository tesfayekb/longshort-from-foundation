// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc. Matches sibling
// orchestrator-test convention (feature-assembler-orchestrator_test.ts) so the in-memory
// fake supabase can be passed structurally without an `as any` cast — which avoids the
// dual-linter mismatch (Deno's `deno-lint-ignore no-explicit-any` is NOT honored by CI's
// ESLint `@typescript-eslint/no-explicit-any` gate). See ai-failure-modes.md.
/**
 * Regime orchestrator tests (FP-052.2 / 3.2-b).
 *
 * Pins DEC-066 §(e) typed-fail-loud branches as DISTINCT outcomes (NOT
 * collapsed into one reason). Uses in-memory fakes — no Polygon, no
 * Supabase server.
 */

import {
  assert,
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { DailyBar } from '../shared/polygon-price-history-fetcher.ts';
import {
  createRegimeOrchestrator,
  MARKET_SENTINEL_TICKER,
  REGIME_TICKER,
  REGIME_PRICE_HISTORY_LOOKBACK_DAYS,
  type RegimeOrchestratorContext,
} from './regime-orchestrator.ts';

function makeBars(closes: ReadonlyArray<number>): DailyBar[] {
  return closes.map((close, i) => ({
    ts: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    close,
  }));
}

interface UpsertCall {
  payload: unknown[];
  options: Record<string, unknown>;
}

function makeFakeSupabase(opts: { upsertError?: { message: string } } = {}) {
  const calls: UpsertCall[] = [];
  const supabase = {
    from(_table: string) {
      return {
        upsert(payload: unknown[], options: Record<string, unknown>) {
          calls.push({ payload, options });
          return Promise.resolve({
            error: opts.upsertError ?? null,
            count: opts.upsertError ? null : payload.length,
          });
        },
      };
    },
  };
  return { supabase, calls };
}

function makeFakeFetcher(behavior:
  | { kind: 'bars'; bars: DailyBar[] }
  | { kind: 'null' }
  | { kind: 'throw'; error: Error }
) {
  const calls: Array<{ ticker: string; as_of: Date; lookbackDays: number }> = [];
  return {
    calls,
    fetcher: {
      fetchPriceHistory(ticker: string, as_of: Date, lookbackDays?: number) {
        calls.push({ ticker, as_of, lookbackDays: lookbackDays ?? -1 });
        if (behavior.kind === 'throw') return Promise.reject(behavior.error);
        if (behavior.kind === 'null') return Promise.resolve(null);
        return Promise.resolve(behavior.bars);
      },
    },
  };
}

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// ─────────────────────────────────────────────────────────────────────────

Deno.test('(o1) success path: SPY 504 bars → 2 rows written under __MARKET__ sentinel', async () => {
  const closes = new Array(504).fill(100);
  closes[0] = 100;
  closes[503] = 120;
  const { fetcher, calls: fetchCalls } = makeFakeFetcher({ kind: 'bars', bars: makeBars(closes) });
  const { supabase, calls } = makeFakeSupabase();
  const ctx: RegimeOrchestratorContext = { supabase, operator_id: OPERATOR_ID, priceHistory: fetcher };

  const res = await createRegimeOrchestrator(ctx).run(new Date('2026-06-23T12:00:00.000Z'));

  assertEquals(res.outcome, 'completed');
  assertEquals(res.bar_count, 504);
  assertEquals(res.persisted_count, 2);
  assertEquals(res.failure_reason, null);
  assertEquals(res.market_24m_cumulative_return, 120 / 100 - 1);
  assert(res.market_realized_vol_6m !== null);

  // SPY ticker requested; 810-day lookback (504 trading bars + ~55-bar
  // holiday margin; widened from 730 after 2026-06-23 manual fire returned
  // bar_count=501 < REGIME_24M_MIN_BARS=504 — see regime-orchestrator.ts
  // REGIME_PRICE_HISTORY_LOOKBACK_DAYS comment for the math).
  assertEquals(fetchCalls.length, 1);
  assertEquals(fetchCalls[0].ticker, REGIME_TICKER);
  assertEquals(fetchCalls[0].ticker, 'SPY');
  assertEquals(fetchCalls[0].lookbackDays, REGIME_PRICE_HISTORY_LOOKBACK_DAYS);
  assertEquals(REGIME_PRICE_HISTORY_LOOKBACK_DAYS, 810);
  // Floor: must exceed REGIME_24M_MIN_BARS / (252/365.25) with holiday
  // margin. Narrowing below this trips this guard so the 501<504 regression
  // can't recur silently.
  // 504 / (252/365.25) ≈ 730.36 calendar days at ZERO margin;
  // require ≥ 774 (~6% buffer for ~18 holidays per 2yr window).
  assert(REGIME_PRICE_HISTORY_LOOKBACK_DAYS >= 774);

  // Exactly 2 rows under __MARKET__.
  assertEquals(calls.length, 1);
  const rows = calls[0].payload as Array<Record<string, unknown>>;
  assertEquals(rows.length, 2);
  for (const row of rows) {
    assertEquals(row.ticker, MARKET_SENTINEL_TICKER);
    assertEquals(row.ticker, '__MARKET__');
    assertEquals(row.is_present, true);
    assertEquals(row.carried_forward, false);
    assertEquals(row.gics_sector, null);
    assert(typeof row.value === 'number');
  }
  const signalIds = rows.map((r) => r.signal_id).sort();
  assertEquals(signalIds, ['market_24m_cumulative_return', 'market_realized_vol_6m']);
});

Deno.test('(o2) typed-fail-loud: polygon 404 (null) → regime_data_missing_current_bar, NO rows written', async () => {
  const { fetcher } = makeFakeFetcher({ kind: 'null' });
  const { supabase, calls } = makeFakeSupabase();
  const res = await createRegimeOrchestrator({ supabase, operator_id: OPERATOR_ID, priceHistory: fetcher })
    .run(new Date('2026-06-23T00:00:00.000Z'));

  assertEquals(res.outcome, 'failed_missing_current_bar');
  assertEquals(res.failure_reason, 'regime_data_missing_current_bar');
  assertEquals(res.persisted_count, 0);
  assertEquals(calls.length, 0, 'NO supabase write on missing-current-bar');
});

Deno.test('(o2b) typed-fail-loud: empty-bar window → regime_data_missing_current_bar (NOT insufficient_history)', async () => {
  const { fetcher } = makeFakeFetcher({ kind: 'bars', bars: [] });
  const { supabase, calls } = makeFakeSupabase();
  const res = await createRegimeOrchestrator({ supabase, operator_id: OPERATOR_ID, priceHistory: fetcher })
    .run(new Date('2026-06-23T00:00:00.000Z'));

  assertEquals(res.outcome, 'failed_missing_current_bar');
  assertEquals(res.failure_reason, 'regime_data_missing_current_bar');
  // Pin the DISTINCT-reason discipline (DEC-066 §(e)): must NOT be insufficient_history.
  assertStrictEquals(res.failure_reason === 'regime_data_insufficient_history', false);
  assertEquals(calls.length, 0);
});

Deno.test('(o3) typed-fail-loud: cold-start (503 bars) → regime_data_insufficient_history, NO rows written', async () => {
  const { fetcher } = makeFakeFetcher({ kind: 'bars', bars: makeBars(new Array(503).fill(100)) });
  const { supabase, calls } = makeFakeSupabase();
  const res = await createRegimeOrchestrator({ supabase, operator_id: OPERATOR_ID, priceHistory: fetcher })
    .run(new Date('2026-06-23T00:00:00.000Z'));

  assertEquals(res.outcome, 'failed_insufficient_history');
  assertEquals(res.failure_reason, 'regime_data_insufficient_history');
  // Pin distinctness from missing-current-bar.
  assertStrictEquals(res.failure_reason === 'regime_data_missing_current_bar', false);
  assertEquals(res.bar_count, 503);
  assertEquals(res.persisted_count, 0);
  assertEquals(calls.length, 0, 'NO supabase write on insufficient-history');
});

Deno.test('(o4) typed-fail-loud: fetcher throws → regime_fetch_error, NO rows written', async () => {
  const { fetcher } = makeFakeFetcher({ kind: 'throw', error: new Error('network broken') });
  const { supabase, calls } = makeFakeSupabase();
  const res = await createRegimeOrchestrator({ supabase, operator_id: OPERATOR_ID, priceHistory: fetcher })
    .run(new Date('2026-06-23T00:00:00.000Z'));
  assertEquals(res.outcome, 'failed_fetch_error');
  assertEquals(res.failure_reason, 'regime_fetch_error');
  assertEquals(calls.length, 0);
});

Deno.test('(o5) persistence error → regime_persistence_error (rows attempted but DB rejected)', async () => {
  const closes = new Array(504).fill(100);
  closes[503] = 110;
  const { fetcher } = makeFakeFetcher({ kind: 'bars', bars: makeBars(closes) });
  const { supabase, calls } = makeFakeSupabase({ upsertError: { message: 'unique violation' } });
  const res = await createRegimeOrchestrator({ supabase, operator_id: OPERATOR_ID, priceHistory: fetcher })
    .run(new Date('2026-06-23T00:00:00.000Z'));
  assertEquals(res.outcome, 'failed_persistence_error');
  assertEquals(res.failure_reason, 'regime_persistence_error');
  // The orchestrator DID call upsert (and got the error back) — distinguish
  // from the no-write fail-loud branches above.
  assertEquals(calls.length, 1);
});

Deno.test('(o6) replay determinism: same as_of → byte-identical telemetry timestamps', async () => {
  const closes = new Array(504).fill(100);
  closes[503] = 105;
  const { fetcher: f1 } = makeFakeFetcher({ kind: 'bars', bars: makeBars(closes) });
  const { fetcher: f2 } = makeFakeFetcher({ kind: 'bars', bars: makeBars(closes) });
  const a = await createRegimeOrchestrator({ supabase: makeFakeSupabase().supabase, operator_id: OPERATOR_ID, priceHistory: f1 })
    .run(new Date('2026-06-23T12:34:56.789Z'));
  const b = await createRegimeOrchestrator({ supabase: makeFakeSupabase().supabase, operator_id: OPERATOR_ID, priceHistory: f2 })
    .run(new Date('2026-06-23T12:34:56.789Z'));
  assertEquals(a.started_at, b.started_at);
  assertEquals(a.completed_at, b.completed_at);
  assertEquals(a.as_of_date, '2026-06-23');
});

Deno.test('(o7) Gate 6 self-scan: regime-orchestrator.ts contains NO wall-clock reads', async () => {
  const src = await Deno.readTextFile(new URL('./regime-orchestrator.ts', import.meta.url));
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(\s*\)/.test(codeOnly), 'wall-clock leak: new Date()');
  assert(!/Date\.now\s*\(/.test(codeOnly), 'wall-clock leak: Date.now()');
  assert(!/performance\.now\s*\(/.test(codeOnly), 'wall-clock leak: performance.now()');
});

Deno.test('(o8) compute-regime.ts self-scan: pure-compute file is wall-clock free', async () => {
  const src = await Deno.readTextFile(new URL('./compute-regime.ts', import.meta.url));
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/new\s+Date\s*\(/.test(codeOnly), 'wall-clock leak in compute');
  assert(!/Date\.now\s*\(/.test(codeOnly), 'wall-clock leak in compute');
  assert(!/performance\.now\s*\(/.test(codeOnly), 'wall-clock leak in compute');
});