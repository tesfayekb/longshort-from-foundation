// ACT-489 — overshoot-fill-sweep unit tests (pure helpers only; no
// Deno.serve import — matches parse-as-of-date_test convention so the
// suite runs without --allow-net / port binds).
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { computeA5SymmetricDiff, toEtSessionDate } from './index.ts';

Deno.test('toEtSessionDate: DST-safe YYYY-MM-DD for America/New_York', () => {
  // 2026-07-08 13:37:10 UTC = 09:37:10 ET (EDT summer).
  const d = new Date('2026-07-08T13:37:10.000Z');
  assertEquals(toEtSessionDate(d), '2026-07-08');
  // Winter regime: 2026-01-15 13:35:00 UTC = 08:35:00 EST.
  const w = new Date('2026-01-15T13:35:00.000Z');
  assertEquals(toEtSessionDate(w), '2026-01-15');
  // Late-night rollover: 2026-07-09 03:00:00 UTC = 2026-07-08 23:00:00 ET.
  const r = new Date('2026-07-09T03:00:00.000Z');
  assertEquals(toEtSessionDate(r), '2026-07-08');
});

Deno.test('A5 diff: empty when broker and ledger match exactly', () => {
  const broker = new Map([['CBOE|long', { side: 'long', qty: 9 }], ['OLN|long', { side: 'long', qty: 118 }]]);
  const ledger = new Map([['CBOE|long', { side: 'long', qty: 9 }], ['OLN|long', { side: 'long', qty: 118 }]]);
  assertEquals(computeA5SymmetricDiff(broker, ledger), []);
});

Deno.test('A5 diff: broker-only symbol surfaces as ledger_qty=null (broker>ledger)', () => {
  const broker = new Map([['XOM|long', { side: 'long', qty: 17 }]]);
  const ledger = new Map<string, { side: string; qty: number }>();
  const diff = computeA5SymmetricDiff(broker, ledger);
  assertEquals(diff.length, 1);
  assertEquals(diff[0].symbol, 'XOM');
  assertEquals(diff[0].broker_qty, 17);
  assertEquals(diff[0].ledger_qty, null);
});

Deno.test('A5 diff: ledger-only symbol surfaces as broker_qty=null (ledger>broker)', () => {
  const broker = new Map<string, { side: string; qty: number }>();
  const ledger = new Map([['APA|long', { side: 'long', qty: 71 }]]);
  const diff = computeA5SymmetricDiff(broker, ledger);
  assertEquals(diff.length, 1);
  assertEquals(diff[0].symbol, 'APA');
  assertEquals(diff[0].broker_qty, null);
  assertEquals(diff[0].ledger_qty, 71);
});

Deno.test('A5 diff: qty mismatch surfaces both sides', () => {
  const broker = new Map([['PLTR|long', { side: 'long', qty: 19 }]]);
  const ledger = new Map([['PLTR|long', { side: 'long', qty: 18 }]]);
  const diff = computeA5SymmetricDiff(broker, ledger);
  assertEquals(diff.length, 1);
  assertEquals(diff[0].broker_qty, 19);
  assertEquals(diff[0].ledger_qty, 18);
});

Deno.test('A5 diff: side mismatch (long vs short) surfaces', () => {
  const broker = new Map([['STLD|long', { side: 'long', qty: 10 }]]);
  const ledger = new Map([['STLD|short', { side: 'short', qty: 10 }]]);
  const diff = computeA5SymmetricDiff(broker, ledger);
  // Different keys → both surfaced as one-sided diffs.
  assertEquals(diff.length, 2);
});

Deno.test('ACT-489 sentinel: fill-sweep never imports exit-timing consumers', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // Exit-clock source of truth is overshoot_lots.entry_ts via
  // computeSessionAge in overshoot-exit-run. Fill-sweep MUST NOT import
  // session-age (would make it a second home for exit timing) and MUST
  // NOT write the T+10 clock into audit metadata.
  if (src.includes("from '../_shared/overshoot-execution/session-age.ts'")) {
    throw new Error('fill-sweep must not import session-age (T+10 clock single-home rule)');
  }
  if (/expected_exit_session/i.test(src)) {
    throw new Error('fill-sweep must not stamp expected_exit_session (single-home: lots.entry_ts)');
  }
  if (!/observability_only_never_consumed_for_exit_timing/.test(src)) {
    throw new Error('fill-sweep must carry the observability_only sentinel in overshoot.lot.opened metadata');
  }
});

Deno.test('ACT-489 sentinel: idempotency uses ON CONFLICT on source_order_id', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  if (!/ON CONFLICT \(source_order_id\) DO NOTHING/.test(src)) {
    throw new Error('fill-sweep must use ON CONFLICT (source_order_id) DO NOTHING for idempotency');
  }
});

Deno.test('ACT-489 sentinel: broker-truth adoption (no self-computed qty/price)', async () => {
  const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  // The INSERT must consume fill.filled_qty and fill.avg_fill_price
  // verbatim — not a limit_price, not our submitted qty.
  if (!/fill\.filled_qty/.test(src) || !/fill\.avg_fill_price/.test(src)) {
    throw new Error('fill-sweep must consume broker fill.filled_qty and fill.avg_fill_price verbatim');
  }
  if (/limit_price\s*\*/.test(src)) {
    throw new Error('fill-sweep must not use limit_price as a cost-basis source');
  }
});