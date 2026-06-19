/**
 * Shadow assembler unit tests — FP-052 3.M-ii / ACT-242.
 *
 * DB-FREE. No Supabase, no Date, no -999, no clock.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assembleShadowVectors,
  type ShadowObservationInput,
} from './shadow-assembler.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
} from './signal-catalog.ts';

function obs(
  ticker: string,
  signal_id: string,
  value: number | null,
  is_present: boolean,
  gics_sector: string | null = 'TECH',
): ShadowObservationInput {
  return { ticker, signal_id, value, is_present, gics_sector };
}

Deno.test('shadow-assembler: all-ticker grouping (NO exclusion)', () => {
  const rows: ShadowObservationInput[] = [
    // AAPL — only critical #6 present (would be EXCLUDED by live gate)
    obs('AAPL', SIGNAL_IDS_CRITICAL[0], 0.5, true),
    obs('AAPL', SIGNAL_IDS_CRITICAL[1], null, false),
    // MSFT — fully covered
    obs('MSFT', SIGNAL_IDS_CRITICAL[0], 1.2, true),
    obs('MSFT', SIGNAL_IDS_CRITICAL[1], -0.3, true),
    obs('MSFT', SIGNAL_IDS_NON_CRITICAL[0], 0.7, true),
    obs('MSFT', SIGNAL_IDS_NON_CRITICAL[1], 0.8, true),
    obs('MSFT', SIGNAL_IDS_NON_CRITICAL[2], 0.9, true),
    // ZZZ — totally empty (no present signals)
    obs('ZZZ', SIGNAL_IDS_CRITICAL[0], null, false),
  ];
  const vectors = assembleShadowVectors(rows);
  // ALL three tickers emitted (no exclusion).
  assertEquals(vectors.map((v) => v.ticker), ['AAPL', 'MSFT', 'ZZZ']);
  const aapl = vectors.find((v) => v.ticker === 'AAPL')!;
  assertEquals(aapl.presentCount, 1);
  assertEquals(aapl.present.get(SIGNAL_IDS_CRITICAL[0]), 0.5);
  const msft = vectors.find((v) => v.ticker === 'MSFT')!;
  assertEquals(msft.presentCount, 5);
  const zzz = vectors.find((v) => v.ticker === 'ZZZ')!;
  assertEquals(zzz.presentCount, 0);
  assertEquals(zzz.present.size, 0);
});

Deno.test('shadow-assembler: typed-absence rows are skipped, value never coerced', () => {
  const rows: ShadowObservationInput[] = [
    // is_present=false, value=null  → skipped
    obs('A', SIGNAL_IDS_CRITICAL[0], null, false),
    // is_present=true, value=NaN    → defensively skipped (not coerced to 0)
    obs('A', SIGNAL_IDS_CRITICAL[1], NaN, true),
    // is_present=true, value=number → included
    obs('A', SIGNAL_IDS_NON_CRITICAL[0], 1.5, true),
  ];
  const v = assembleShadowVectors(rows)[0];
  assertEquals(v.presentCount, 1);
  assertEquals(v.present.get(SIGNAL_IDS_NON_CRITICAL[0]), 1.5);
  // Critically: present map carries NO zero entry for the absent criticals.
  assert(!v.present.has(SIGNAL_IDS_CRITICAL[0]));
  assert(!v.present.has(SIGNAL_IDS_CRITICAL[1]));
});

Deno.test('shadow-assembler: deterministic ticker-ASC emission order', () => {
  const rows: ShadowObservationInput[] = [
    obs('ZZZ', SIGNAL_IDS_CRITICAL[0], 1.0, true),
    obs('AAA', SIGNAL_IDS_CRITICAL[0], 1.0, true),
    obs('MMM', SIGNAL_IDS_CRITICAL[0], 1.0, true),
  ];
  const out = assembleShadowVectors(rows);
  assertEquals(out.map((v) => v.ticker), ['AAA', 'MMM', 'ZZZ']);
});

Deno.test('shadow-assembler: unknown signal_id ignored (F7 defense-in-depth)', () => {
  const rows: ShadowObservationInput[] = [
    obs('A', 'some_unknown_signal', 99.0, true),
    obs('A', SIGNAL_IDS_CRITICAL[0], 1.0, true),
  ];
  const v = assembleShadowVectors(rows)[0];
  assertEquals(v.presentCount, 1);
});

Deno.test('shadow-assembler: first non-null gics_sector wins', () => {
  const rows: ShadowObservationInput[] = [
    obs('A', SIGNAL_IDS_CRITICAL[0], 1.0, true, null),
    obs('A', SIGNAL_IDS_CRITICAL[1], 1.0, true, 'TECH'),
    obs('A', SIGNAL_IDS_NON_CRITICAL[0], 1.0, true, 'HEALTHCARE'),
  ];
  const v = assembleShadowVectors(rows)[0];
  assertEquals(v.gics_sector, 'TECH');
});
