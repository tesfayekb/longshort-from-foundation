// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { applyHardExclusions } from './apply-hard-exclusions.ts';
import { ec, TEST_AS_OF } from './test-fixtures.ts';
import type { ExclusionInputData } from './types.ts';

function emptyInput(): ExclusionInputData {
  return {
    earnings_calendar: { entries: [], fetched_at: TEST_AS_OF },
    ma_actions: [],
    halt_history: [],
    locate_data: [],
    short_interest: [],
  };
}

Deno.test('orchestrator: empty input → all constituents eligible long, ineligible short (no locate)', () => {
  const result = applyHardExclusions([ec({ ticker: 'AAPL' })], emptyInput(), TEST_AS_OF);
  assertEquals(result.eligible.length, 1);
  // Long is eligible (no firing applies to long); short is ineligible (htb_no_locate fires).
  assertEquals(result.eligible[0].long_eligible, true);
  assertEquals(result.eligible[0].short_eligible, false);
  // Exactly one firing — §3.3d htb_no_locate.
  assertEquals(result.firings.length, 1);
  assertEquals(result.firings[0].reason, 'htb_no_locate');
  assertEquals(result.firings[0].applies_to, 'short');
});

Deno.test('orchestrator: with locate, empty other inputs → fully eligible both books', () => {
  const input: ExclusionInputData = {
    ...emptyInput(),
    locate_data: [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: 50 }],
  };
  const result = applyHardExclusions([ec({ ticker: 'AAPL' })], input, TEST_AS_OF);
  assertEquals(result.eligible[0].long_eligible, true);
  assertEquals(result.eligible[0].short_eligible, true);
  assertEquals(result.firings.length, 0);
});

Deno.test('orchestrator: book-symmetric firing (earnings) excludes BOTH books', () => {
  const input: ExclusionInputData = {
    ...emptyInput(),
    locate_data: [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: 50 }],
    earnings_calendar: {
      entries: [{ ticker: 'AAPL', scheduled_date: '2026-04-29', time_of_day: 'AMC' }],
      fetched_at: TEST_AS_OF,
    },
  };
  const result = applyHardExclusions([ec({ ticker: 'AAPL' })], input, TEST_AS_OF);
  assertEquals(result.eligible[0].long_eligible, false);
  assertEquals(result.eligible[0].short_eligible, false);
  assert(result.firings.some((f) => f.reason === 'earnings_window'));
});

Deno.test('orchestrator: book-asymmetric firing (short interest) excludes ONLY short', () => {
  const input: ExclusionInputData = {
    ...emptyInput(),
    locate_data: [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: 50 }],
    short_interest: [{
      ticker: 'AAPL',
      report_date: '2026-04-15',
      short_interest_shares: 300,
      float_shares: 1000,
      short_interest_pct_float: 0.30,
    }],
  };
  const result = applyHardExclusions([ec({ ticker: 'AAPL' })], input, TEST_AS_OF);
  assertEquals(result.eligible[0].long_eligible, true);
  assertEquals(result.eligible[0].short_eligible, false);
});

Deno.test('orchestrator: multiple constituents handled independently', () => {
  const input: ExclusionInputData = {
    ...emptyInput(),
    locate_data: [
      { ticker: 'AAPL', locate_available: true, borrow_rate_bps: 50 },
      { ticker: 'MSFT', locate_available: true, borrow_rate_bps: 50 },
    ],
  };
  const result = applyHardExclusions(
    [ec({ ticker: 'AAPL' }), ec({ ticker: 'MSFT' })],
    input,
    TEST_AS_OF,
  );
  assertEquals(result.eligible.length, 2);
  assertEquals(result.firings.length, 0);
});

Deno.test('orchestrator: §3.3f/§3.3g/§3.3h N/A v1 — never fire (no entries in firings)', () => {
  const input: ExclusionInputData = {
    ...emptyInput(),
    locate_data: [{ ticker: 'AAPL', locate_available: true, borrow_rate_bps: 50 }],
  };
  const result = applyHardExclusions([ec({ ticker: 'AAPL' })], input, TEST_AS_OF);
  for (const f of result.firings) {
    assert(
      !['secondary_offerings', 'going_concern', 'sector_restriction'].includes(f.reason as string),
      `unexpected firing for N/A v1 rule: ${f.reason}`,
    );
  }
});