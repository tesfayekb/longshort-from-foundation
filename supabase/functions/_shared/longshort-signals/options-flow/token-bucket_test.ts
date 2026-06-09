// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { TokenBucket, pacedHttpFetch } from './token-bucket.ts';

function makeFakeClock(start = 0) {
  let nowMs = start;
  const sleeps: number[] = [];
  return {
    now: () => nowMs,
    advance: (ms: number) => { nowMs += ms; },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      nowMs += ms;
    },
    sleeps,
  };
}

Deno.test('TokenBucket: first acquire is immediate', async () => {
  const c = makeFakeClock();
  const b = new TokenBucket({ ratePerSec: 2, now: c.now, sleep: c.sleep });
  await b.acquire();
  assertEquals(c.sleeps, []);
});

Deno.test('TokenBucket: spaces subsequent acquires at 1000/rate ms', async () => {
  const c = makeFakeClock();
  const b = new TokenBucket({ ratePerSec: 4, now: c.now, sleep: c.sleep });
  await b.acquire(); // t=0
  await b.acquire(); // expects ~250ms wait
  await b.acquire(); // another ~250ms
  assertEquals(c.sleeps, [250, 250]);
});

Deno.test('TokenBucket: does not double-charge if caller is slow', async () => {
  const c = makeFakeClock();
  const b = new TokenBucket({ ratePerSec: 2, now: c.now, sleep: c.sleep });
  await b.acquire();              // t=0, schedules next at 500
  c.advance(1000);                // caller idle for 1s
  await b.acquire();              // should be immediate (no waiting)
  assertEquals(c.sleeps, []);
});

Deno.test('TokenBucket: rejects non-positive ratePerSec', () => {
  let threw = false;
  try { new TokenBucket({ ratePerSec: 0 }); } catch { threw = true; }
  assert(threw);
  threw = false;
  try { new TokenBucket({ ratePerSec: -1 }); } catch { threw = true; }
  assert(threw);
});

Deno.test('pacedHttpFetch: calls acquire() before each underlying fetch', async () => {
  const c = makeFakeClock();
  const b = new TokenBucket({ ratePerSec: 10, now: c.now, sleep: c.sleep });
  let calls = 0;
  const underlying = async () => {
    calls += 1;
    return { ok: true, status: 200, statusText: 'OK', text: async () => '', json: async () => ({}) };
  };
  const paced = pacedHttpFetch(b, underlying);
  await paced('https://x/1');
  await paced('https://x/2');
  await paced('https://x/3');
  assertEquals(calls, 3);
  assertEquals(c.sleeps, [100, 100]); // 1000/10 = 100ms apart
});