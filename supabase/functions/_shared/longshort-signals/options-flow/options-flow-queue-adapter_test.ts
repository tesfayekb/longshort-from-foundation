// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import per FP-045 sentinel pattern
// @ts-nocheck — Deno test file.
/**
 * Unit tests for the options-flow queue-worker adapter (FP-045 Phase 4).
 *
 * Mirrors the chunk-runner's per-ticker tests (the semantics this
 * adapter mirrors verbatim). The chunk-runner stays in the tree as the
 * canonical per-ticker semantics pin (FP-043 preservation); these tests
 * guarantee the adapter's behavior is locked to those semantics under
 * the engine's `TickerComputeFn` shape.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createOptionsFlowAdapter } from './options-flow-queue-adapter.ts';

const AS_OF = new Date('2026-06-10T20:00:00Z');

function tradierMock(opts: {
  expirations?: unknown;
  chain?: unknown;
  throwOn?: 'expirations' | 'chain';
}) {
  return {
    async fetchExpirations(_t: string) {
      if (opts.throwOn === 'expirations') throw new Error('boom-exp');
      return opts.expirations;
    },
    async fetchChain(_t: string, _e: string) {
      if (opts.throwOn === 'chain') throw new Error('boom-chain');
      return opts.chain;
    },
  } as unknown;
}

Deno.test('adapter: expirations subscription_gated → typed skip', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({ expirations: { kind: 'unavailable', reason: 'subscription_gated' } }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals(r.kind, 'skip');
  assertEquals((r as unknown).reason, 'subscription_gated');
});

Deno.test('adapter: expirations data_unavailable → typed skip', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({ expirations: { kind: 'unavailable', reason: 'data_unavailable' } }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'data_unavailable');
});

Deno.test('adapter: no expiration meets MIN_DTE_DAYS → data_unavailable', async () => {
  // expirations all in the past relative to AS_OF
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({ expirations: { kind: 'ok', expirations: ['2026-06-01', '2026-06-05'] } }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'data_unavailable');
});

Deno.test('adapter: chain subscription_gated → typed skip', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({
      expirations: { kind: 'ok', expirations: ['2026-07-18'] },
      chain: { kind: 'unavailable', reason: 'subscription_gated' },
    }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'subscription_gated');
});

Deno.test('adapter: chain data_unavailable → typed skip', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({
      expirations: { kind: 'ok', expirations: ['2026-07-18'] },
      chain: { kind: 'unavailable', reason: 'data_unavailable' },
    }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'data_unavailable');
});

Deno.test('adapter: empty/no qualifying chain → no_qualifying_flow', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({
      expirations: { kind: 'ok', expirations: ['2026-07-18'] },
      chain: { kind: 'ok', contracts: [] },
    }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'no_qualifying_flow');
});

Deno.test('adapter: expirations fetch throw → fetch_error', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({ throwOn: 'expirations' }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'fetch_error');
});

Deno.test('adapter: chain fetch throw → fetch_error', async () => {
  const adapter = createOptionsFlowAdapter({
    tradier: tradierMock({
      expirations: { kind: 'ok', expirations: ['2026-07-18'] },
      throwOn: 'chain',
    }),
  });
  const r = await adapter({ ticker: 'AAPL', gicsSector: 'Tech', asOf: AS_OF });
  assertEquals((r as unknown).reason, 'fetch_error');
});

Deno.test('adapter: no Date.now / new Date in source', async () => {
  const src = await Deno.readTextFile(
    new URL('./options-flow-queue-adapter.ts', import.meta.url),
  );
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  if (/new\s+Date\s*\(\s*\)/.test(codeOnly)) throw new Error('new Date() leak');
  if (/Date\.now\s*\(/.test(codeOnly)) throw new Error('Date.now() leak');
});