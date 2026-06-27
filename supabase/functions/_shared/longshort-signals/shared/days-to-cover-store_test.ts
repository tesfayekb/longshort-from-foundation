// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createSupabaseDaysToCoverReader,
  createSupabaseDaysToCoverWriter,
} from './days-to-cover-store.ts';

function makeSupabase(opts: {
  rows?: Array<{ ticker: string; operator_id: string; latest_days_to_cover: number | null }>;
  readError?: { message: string };
  upsertError?: { message: string };
}) {
  type ReadResult = { data: Array<{ latest_days_to_cover: number | null }> | null; error: { message: string } | null };
  interface MockBuilder extends PromiseLike<ReadResult> {
    upsert(payload: unknown, opts?: unknown): Promise<{ error: { message: string } | null }>;
    select(cols: string): MockBuilder;
    eq(col: string, val: string): MockBuilder;
  }
  const upserts: unknown[][] = [];
  const supabase = {
    from(table: string) {
      if (table !== 'short_interest_days_to_cover') {
        throw new Error(`unexpected table ${table}`);
      }
      let filterTicker: string | null = null;
      let filterOp: string | null = null;
      const builder: MockBuilder = {
        upsert(payload: unknown, _opts?: unknown) {
          upserts.push(payload as unknown[]);
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
        select(_cols: string) { return builder; },
        eq(col: string, val: string) {
          if (col === 'ticker') filterTicker = val;
          if (col === 'operator_id') filterOp = val;
          return builder;
        },
        then(onFul: (value: ReadResult) => unknown, onRej: (reason: unknown) => unknown) {
          if (opts.readError) {
            return Promise.resolve({ data: null, error: opts.readError }).then(onFul, onRej);
          }
          const rows = (opts.rows ?? []).filter(
            (r) => r.ticker === filterTicker && r.operator_id === filterOp,
          ).map((r) => ({ latest_days_to_cover: r.latest_days_to_cover }));
          return Promise.resolve({ data: rows, error: null }).then(onFul, onRej);
        },
      };
      return builder;
    },
  };
  return { supabase, upserts };
}

const OP = '00000000-0000-0000-0000-000000000001';

Deno.test('writer: upsertLatest sends payload and surfaces error=null', async () => {
  const { supabase, upserts } = makeSupabase({});
  const writer = createSupabaseDaysToCoverWriter(supabase);
  const { error } = await writer.upsertLatest([
    { operator_id: OP, ticker: 'AAPL', as_of_date: '2026-06-08', latest_days_to_cover: 3.2, report_date: '2026-05-31' },
    { operator_id: OP, ticker: 'TSLA', as_of_date: '2026-06-08', latest_days_to_cover: null,  report_date: '2026-05-31' },
  ]);
  assertEquals(error, null);
  assertEquals(upserts.length, 1);
  assertEquals((upserts[0] as Array<{ ticker: string }>).length, 2);
});

Deno.test('writer: empty batch is a no-op (no row, no error)', async () => {
  const { supabase, upserts } = makeSupabase({});
  const writer = createSupabaseDaysToCoverWriter(supabase);
  const { error } = await writer.upsertLatest([]);
  assertEquals(error, null);
  assertEquals(upserts.length, 0);
});

Deno.test('reader: returns numeric DTC when present', async () => {
  const { supabase } = makeSupabase({
    rows: [{ operator_id: OP, ticker: 'GME', latest_days_to_cover: 12.5 }],
  });
  const reader = createSupabaseDaysToCoverReader(supabase, OP);
  assertEquals(await reader.read('GME'), 12.5);
});

Deno.test('reader: returns null on missing row (typed-absence)', async () => {
  const { supabase } = makeSupabase({ rows: [] });
  const reader = createSupabaseDaysToCoverReader(supabase, OP);
  assertEquals(await reader.read('AAPL'), null);
});

Deno.test('reader: returns null on DB error (does NOT throw — pre-flight stays live)', async () => {
  const { supabase } = makeSupabase({ readError: { message: 'boom' } });
  const reader = createSupabaseDaysToCoverReader(supabase, OP);
  assertEquals(await reader.read('AAPL'), null);
});

Deno.test('reader: returns null when stored value is null (illiquid name)', async () => {
  const { supabase } = makeSupabase({
    rows: [{ operator_id: OP, ticker: 'ILLQ', latest_days_to_cover: null }],
  });
  const reader = createSupabaseDaysToCoverReader(supabase, OP);
  assertEquals(await reader.read('ILLQ'), null);
});