/**
 * rankings-generation-picker_test — DW-209 (ACT-450).
 * E1 multi-slot fixture, E3/E4 determinism, empty-case preservation.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickLatestRankingsGeneration } from './rankings-generation-picker.ts';

type HeadRow = { as_of_date: string; intraday_slot: number; computed_at: string | null };

function mkHeadClient(rows: HeadRow[]) {
  const sorted = [...rows].sort((a, b) => {
    if (a.as_of_date !== b.as_of_date) return a.as_of_date < b.as_of_date ? 1 : -1;
    const ac = a.computed_at ?? ''; const bc = b.computed_at ?? '';
    if (ac !== bc) return ac < bc ? 1 : -1;
    return 0;
  });
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.order = chain;
  builder.limit = (n: number) => Promise.resolve({ data: sorted.slice(0, n), error: null });
  return {
    from(_table: string) { return builder; },
  } as unknown as Parameters<typeof pickLatestRankingsGeneration>[0];
}

Deno.test('E1 multi-slot picks latest by (as_of_date, computed_at) DESC', async () => {
  const client = mkHeadClient([
    { as_of_date: '2026-06-30', intraday_slot: 0, computed_at: '2026-06-30T23:50:00Z' },
    { as_of_date: '2026-06-30', intraday_slot: 1, computed_at: '2026-07-01T13:35:00Z' },
    { as_of_date: '2026-06-30', intraday_slot: 2, computed_at: '2026-07-01T14:05:00Z' },
  ]);
  const gen = await pickLatestRankingsGeneration(client, 'op');
  assert(gen !== null);
  assertEquals(gen!.as_of_date, '2026-06-30');
  assertEquals(gen!.intraday_slot, 2);
  assertEquals(gen!.computed_at, '2026-07-01T14:05:00Z');
});

Deno.test('E3/E4 determinism: repeated invocations return the same generation', async () => {
  const client = mkHeadClient([
    { as_of_date: '2026-06-30', intraday_slot: 0, computed_at: '2026-06-30T23:50:00Z' },
    { as_of_date: '2026-06-30', intraday_slot: 3, computed_at: '2026-07-01T14:20:00Z' },
    { as_of_date: '2026-06-30', intraday_slot: 1, computed_at: '2026-07-01T13:35:00Z' },
  ]);
  const a = await pickLatestRankingsGeneration(client, 'op');
  const b = await pickLatestRankingsGeneration(client, 'op');
  assertEquals(a, b);
  assertEquals(a!.intraday_slot, 3);
});

Deno.test('empty-case: null when no rows (preserves prior reader semantics)', async () => {
  const client = mkHeadClient([]);
  const gen = await pickLatestRankingsGeneration(client, 'op');
  assertEquals(gen, null);
});
