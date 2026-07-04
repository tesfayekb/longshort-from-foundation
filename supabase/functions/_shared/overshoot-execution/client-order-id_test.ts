// FP-069 W3.6.a (ACT-463) — CID round-trip + validation + length audit tests.

import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildOvershootClientOrderId,
  incrementAttempt,
  OVERSHOOT_CID_MAX_LEN,
  OVERSHOOT_CID_RE,
  parseOvershootClientOrderId,
  type OvershootCidComponents,
} from './client-order-id.ts';

const RUN_ID = '2985db66-a9f2-4a8f-9e7a-4259d1bd4a38';

function comp(over: Partial<OvershootCidComponents> = {}): OvershootCidComponents {
  return {
    runId: RUN_ID,
    ticker: 'VRT',
    side: 'LONG',
    intent: 'entry',
    attempt: 0,
    ...over,
  };
}

Deno.test('CID: builds ratified shape ovs-{run8}-{ticker}-{side1}-{intent}-{attempt}', () => {
  assertEquals(buildOvershootClientOrderId(comp()), 'ovs-2985db66-VRT-L-entry-0');
  assertEquals(
    buildOvershootClientOrderId(comp({ ticker: 'RH', side: 'SHORT', intent: 'exit_time', attempt: 2 })),
    'ovs-2985db66-RH-S-exit_time-2',
  );
  assertEquals(
    buildOvershootClientOrderId(comp({ intent: 'exit_manual', attempt: 9 })),
    'ovs-2985db66-VRT-L-exit_manual-9',
  );
});

Deno.test('CID: matches operator-ratified regex', () => {
  const cid = buildOvershootClientOrderId(comp({ intent: 'exit_manual', attempt: 99 }));
  assert(OVERSHOOT_CID_RE.test(cid), `regex must accept assembled cid ${cid}`);
});

Deno.test('CID: round-trip parse restores every field losslessly', () => {
  const cases: OvershootCidComponents[] = [
    comp(),
    comp({ ticker: 'BRK.B', side: 'SHORT', intent: 'exit_time', attempt: 3 }),
    comp({ ticker: 'GLW', intent: 'exit_manual', attempt: 12 }),
  ];
  for (const c of cases) {
    const cid = buildOvershootClientOrderId(c);
    const parsed = parseOvershootClientOrderId(cid);
    assert(parsed, `parse must succeed for ${cid}`);
    assertEquals(parsed!.run8, c.runId.slice(0, 8));
    assertEquals(parsed!.ticker, c.ticker);
    assertEquals(parsed!.side, c.side);
    assertEquals(parsed!.intent, c.intent);
    assertEquals(parsed!.attempt, c.attempt);
  }
});

Deno.test('CID: worst-case length stays under 48 chars (operator gate)', () => {
  const worst = buildOvershootClientOrderId(
    comp({ ticker: 'AAAAAAAAAA', intent: 'exit_manual', attempt: 999 }),
  );
  assert(
    worst.length <= OVERSHOOT_CID_MAX_LEN,
    `assembled=${worst.length} must be <= ${OVERSHOOT_CID_MAX_LEN} (cid=${worst})`,
  );
});

Deno.test('CID: rejects malformed runId (non-UUID)', () => {
  assertThrows(() => buildOvershootClientOrderId(comp({ runId: 'not-a-uuid' })), Error, 'runId');
});

Deno.test('CID: rejects malformed ticker (lowercase / too-long / bad char)', () => {
  assertThrows(() => buildOvershootClientOrderId(comp({ ticker: 'vrt' })), Error, 'ticker');
  assertThrows(() => buildOvershootClientOrderId(comp({ ticker: 'AAAAAAAAAAA' })), Error, 'ticker');
  assertThrows(() => buildOvershootClientOrderId(comp({ ticker: 'VR T' })), Error, 'ticker');
});

Deno.test('CID: rejects invalid side and intent', () => {
  assertThrows(
    () => buildOvershootClientOrderId(comp({ side: 'FLAT' as unknown as 'LONG' })),
    Error,
    'side',
  );
  assertThrows(
    () => buildOvershootClientOrderId(comp({ intent: 'exit' as unknown as 'exit_time' })),
    Error,
    'intent',
  );
});

Deno.test('CID: rejects negative / non-integer attempt', () => {
  assertThrows(() => buildOvershootClientOrderId(comp({ attempt: -1 })), Error, 'attempt');
  assertThrows(() => buildOvershootClientOrderId(comp({ attempt: 1.5 })), Error, 'attempt');
});

Deno.test('CID: parse returns null on structural mismatch (never silent-pass)', () => {
  assertEquals(parseOvershootClientOrderId('lsh-2985db66-VRT-L-entry-0'), null);
  assertEquals(parseOvershootClientOrderId('ovs-2985DB66-VRT-L-entry-0'), null); // uppercase run8
  assertEquals(parseOvershootClientOrderId('ovs-2985db66-VRT-X-entry-0'), null); // bad side1
  assertEquals(parseOvershootClientOrderId('ovs-2985db66-VRT-L-liquidate-0'), null); // unknown intent
  assertEquals(parseOvershootClientOrderId(''), null);
});

Deno.test('CID: incrementAttempt bumps only the attempt field (tuple-idempotency shape)', () => {
  const base = comp({ attempt: 0 });
  const next = incrementAttempt(base);
  assertEquals(next.runId, base.runId);
  assertEquals(next.ticker, base.ticker);
  assertEquals(next.side, base.side);
  assertEquals(next.intent, base.intent);
  assertEquals(next.attempt, 1);
  const cid0 = buildOvershootClientOrderId(base);
  const cid1 = buildOvershootClientOrderId(next);
  assert(cid0 !== cid1, 'attempt++ must produce a distinct CID');
});