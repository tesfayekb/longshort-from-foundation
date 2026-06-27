// @ts-nocheck — Deno test file.
/**
 * NullBorrowRateFetcher_test — DW-162a anti-sentinel.
 *
 * Asserts the fetcher NEVER returns a numeric rate (the §9 SENTINEL trap),
 * always throws a typed `BorrowRateUnavailableError`, and the error carries
 * the REAL broker-emitted `is_htb` derived from `easy_to_borrow`.
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  BrokerShortability,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';
import {
  BorrowRateUnavailableError,
  NullBorrowRateFetcher,
} from './null-borrow-rate-fetcher.ts';

const TS = new Date('2026-06-27T15:00:00Z');

function fakeShortability(
  easy_to_borrow: boolean | null,
  shortable = true,
): BrokerShortabilityFetcher {
  return {
    async fetchShortability(symbol): Promise<BrokerShortability> {
      return { symbol, shortable, easy_to_borrow, fetched_at: TS };
    },
  };
}

Deno.test('easy_to_borrow=true → throws with is_htb=false', async () => {
  const fetcher = new NullBorrowRateFetcher(fakeShortability(true));
  const err = await assertRejects(
    () => fetcher.fetchBorrowRate('AAPL', TS),
    BorrowRateUnavailableError,
  );
  assertEquals(err.is_htb, false);
  assertEquals(err.symbol, 'AAPL');
  assertEquals(err.reason, 'alpaca_paper_no_numeric_borrow_rate');
});

Deno.test('easy_to_borrow=false → throws with is_htb=true', async () => {
  const fetcher = new NullBorrowRateFetcher(fakeShortability(false));
  const err = await assertRejects(
    () => fetcher.fetchBorrowRate('GME', TS),
    BorrowRateUnavailableError,
  );
  assertEquals(err.is_htb, true);
});

Deno.test('easy_to_borrow=null → throws with is_htb=null (typed-absence, NOT coerced)', async () => {
  const fetcher = new NullBorrowRateFetcher(fakeShortability(null));
  const err = await assertRejects(
    () => fetcher.fetchBorrowRate('UNK', TS),
    BorrowRateUnavailableError,
  );
  assertEquals(err.is_htb, null);
});

Deno.test('underlying shortability throw propagates (not swallowed into a sentinel)', async () => {
  const fetcher = new NullBorrowRateFetcher({
    async fetchShortability() { throw new Error('network'); },
  });
  await assertRejects(() => fetcher.fetchBorrowRate('X', TS), Error, 'network');
});

Deno.test('anti-sentinel guarantee: NEVER resolves with a numeric rate', async () => {
  // Iterate all reachable boolean states; assert the call ALWAYS rejects.
  for (const etb of [true, false, null]) {
    const fetcher = new NullBorrowRateFetcher(fakeShortability(etb));
    let resolvedWithRate = false;
    try {
      const r = await fetcher.fetchBorrowRate('SENT', TS);
      // If we ever reach here a sentinel slipped in — this MUST not happen.
      resolvedWithRate = typeof r.annual_rate_pct === 'number';
    } catch (_) {
      // expected
    }
    assert(!resolvedWithRate, `NullBorrowRateFetcher returned a numeric rate for etb=${etb}`);
  }
});