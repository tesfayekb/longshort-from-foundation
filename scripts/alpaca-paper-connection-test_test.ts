// @ts-nocheck — Deno test file
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseArgs, runConnectionTest } from './alpaca-paper-connection-test.ts';

function mkEnv(map: Record<string, string>) {
  return { get(name: string) { return map[name]; } };
}

Deno.test('(1) parseArgs reads --symbol/--ts/--order-id from argv', () => {
  const out = parseArgs(['--symbol', 'MSFT', '--ts', '2026-01-02T15:00:00Z', '--order-id', 'o1'], mkEnv({}));
  assertEquals(out.probeSymbol, 'MSFT');
  assertEquals(out.probeOrderId, 'o1');
  assertEquals(out.probeTs?.toISOString(), '2026-01-02T15:00:00.000Z');
});

Deno.test('(2) parseArgs falls back to env when argv missing', () => {
  const out = parseArgs([], mkEnv({ PROBE_SYMBOL: 'TSLA', PROBE_TS: '2026-02-01T13:30:00Z' }));
  assertEquals(out.probeSymbol, 'TSLA');
  assertEquals(out.probeTs?.toISOString(), '2026-02-01T13:30:00.000Z');
});

Deno.test('(3) runConnectionTest returns credential_error=true when env unset', async () => {
  const prevKey = Deno.env.get('ALPACA_PAPER_KEY');
  const prevSecret = Deno.env.get('ALPACA_PAPER_SECRET');
  Deno.env.delete('ALPACA_PAPER_KEY');
  Deno.env.delete('ALPACA_PAPER_SECRET');
  try {
    const result = await runConnectionTest({ probeSymbol: 'AAPL', probeTs: new Date('2026-01-02T14:30:00Z') });
    assertEquals(result.credential_error, true);
    assertEquals(result.overall_status, 'error');
    assert(Array.isArray(result.fetcher_results));
  } finally {
    if (prevKey !== undefined) Deno.env.set('ALPACA_PAPER_KEY', prevKey);
    if (prevSecret !== undefined) Deno.env.set('ALPACA_PAPER_SECRET', prevSecret);
  }
});