// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pLimitedMap } from './p-limited-map.ts';

Deno.test('(1) limit=1 sequential equivalence', async () => {
  const input = [1, 2, 3, 4, 5];
  const out = await pLimitedMap(input, 1, async (n) => n * 2);
  assertEquals(out, [2, 4, 6, 8, 10]);
});

Deno.test('(2) order preserved despite varying fn latency', async () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = await pLimitedMap(input, 20, async (n) => {
    // earlier indices wait longer; completion order ≠ input order
    await new Promise((r) => setTimeout(r, (50 - n) % 7));
    return n;
  });
  assertEquals(out, input);
});

Deno.test('(3) limit > items → workerCount clamped to items.length', async () => {
  const inFlight = { now: 0, peak: 0 };
  const out = await pLimitedMap([1, 2, 3], 50, async (n) => {
    inFlight.now++;
    inFlight.peak = Math.max(inFlight.peak, inFlight.now);
    await new Promise((r) => setTimeout(r, 5));
    inFlight.now--;
    return n;
  });
  assertEquals(out, [1, 2, 3]);
  assert(inFlight.peak <= 3, `peak=${inFlight.peak}`);
});

Deno.test('(4) limit=0 or negative clamps to 1', async () => {
  const out0 = await pLimitedMap([1, 2, 3], 0, async (n) => n);
  const outNeg = await pLimitedMap([1, 2, 3], -5, async (n) => n);
  assertEquals(out0, [1, 2, 3]);
  assertEquals(outNeg, [1, 2, 3]);
});

Deno.test('(5) empty input → empty output, fn never invoked', async () => {
  let calls = 0;
  const out = await pLimitedMap([], 10, async (n) => {
    calls++;
    return n;
  });
  assertEquals(out, []);
  assertEquals(calls, 0);
});

Deno.test('(6) determinism — same inputs produce identical output', async () => {
  const fn = async (n: number) => n * n;
  const a = await pLimitedMap([1, 2, 3, 4], 3, fn);
  const b = await pLimitedMap([1, 2, 3, 4], 3, fn);
  assertEquals(a, b);
});

Deno.test('(7) concurrency cap honored at peak (limit=3, n=20)', async () => {
  const inFlight = { now: 0, peak: 0 };
  const items = Array.from({ length: 20 }, (_, i) => i);
  await pLimitedMap(items, 3, async (n) => {
    inFlight.now++;
    inFlight.peak = Math.max(inFlight.peak, inFlight.now);
    await new Promise((r) => setTimeout(r, 2));
    inFlight.now--;
    return n;
  });
  assert(inFlight.peak <= 3, `peak=${inFlight.peak}`);
});