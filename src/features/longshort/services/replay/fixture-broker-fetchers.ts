/**
 * fixture-broker-fetchers — broker interface implementations backed by fixture event index.
 *
 * Implements the existing broker fetcher interfaces from
 * `supabase/functions/_shared/longshort-broker-interfaces.ts` so the reconciliation engine
 * (sub-step 6.5c) can call them with the same shape it uses against live Alpaca, but they
 * return fixture-captured data instead of live API responses.
 *
 * The interfaces (BrokerPositionFetcher, BrokerQuoteFetcher, etc.) are NOT modified; we
 * implement them.
 *
 * Determinism guarantee per §11.10.3: two consecutive calls with identical (ts, symbol)
 * arguments return byte-identical results, because the underlying event index is immutable
 * after construction.
 */

import type { EventIndex } from './event-index.ts';
import { findAtOrBefore } from './event-index.ts';
import {
  isBrokerStateEvent,
  isQuoteEvent,
  isHaltEvent,
  isLocateEvent,
  type BrokerStateEvent,
  type QuoteEvent,
  type HaltEvent,
  type LocateEvent,
  type ReplayFixtureEvent,
  type ReplayTimestamp,
} from '../../types/replay-fixture.ts';

/**
 * Replay-side broker fetcher bundle. Each method consumes (ts, symbol) and returns the
 * fixture-captured state at that point in time.
 *
 * Methods return null when no event matches — caller (verifier) decides disposition per
 * its own typed-null path (DEC-034 clause (2)). The engine does NOT coerce missing data
 * to sentinel values.
 */
export interface ReplayBrokerFetchers {
  fetchPositionAt(ts: ReplayTimestamp, symbol: string): BrokerStateEvent | null;
  fetchSignalQuoteAt(ts: ReplayTimestamp, symbol: string): QuoteEvent | null;
  fetchReconciliationQuoteAt(ts: ReplayTimestamp, symbol: string): QuoteEvent | null;
  fetchBrokerQuoteAt(ts: ReplayTimestamp, symbol: string): QuoteEvent | null;
  fetchHaltStatusAt(ts: ReplayTimestamp, symbol: string): HaltEvent | null;
  fetchLocateAt(ts: ReplayTimestamp, symbol: string): LocateEvent | null;
}

/**
 * Build fetchers backed by the given event index. The returned object is a value-object
 * with all fetchers; engine code captures it by reference + reuses across all verifier
 * invocations for a given replay run.
 */
export function buildReplayBrokerFetchers(index: EventIndex): ReplayBrokerFetchers {
  const isBrokerStateForSymbol = (sym: string) => (e: ReplayFixtureEvent): e is BrokerStateEvent => {
    if (!isBrokerStateEvent(e)) return false;
    const payload = e.payload as Record<string, unknown>;
    return payload.symbol === sym;
  };

  const isQuoteForSymbolAndStream = (sym: string, stream: 'signal_quote' | 'reconciliation_quote' | 'broker_quote') =>
    (e: ReplayFixtureEvent): e is QuoteEvent => {
      if (!isQuoteEvent(e)) return false;
      return e.stream === stream && e.symbol === sym;
    };

  const isHaltForSymbol = (sym: string) => (e: ReplayFixtureEvent): e is HaltEvent => {
    if (!isHaltEvent(e)) return false;
    return e.symbol === sym;
  };

  const isLocateForSymbol = (sym: string) => (e: ReplayFixtureEvent): e is LocateEvent => {
    if (!isLocateEvent(e)) return false;
    return e.symbol === sym;
  };

  return {
    fetchPositionAt(ts, symbol) {
      return findAtOrBefore(index, 'broker_state', ts, isBrokerStateForSymbol(symbol));
    },
    fetchSignalQuoteAt(ts, symbol) {
      return findAtOrBefore(index, 'signal_quote', ts, isQuoteForSymbolAndStream(symbol, 'signal_quote'));
    },
    fetchReconciliationQuoteAt(ts, symbol) {
      return findAtOrBefore(index, 'reconciliation_quote', ts, isQuoteForSymbolAndStream(symbol, 'reconciliation_quote'));
    },
    fetchBrokerQuoteAt(ts, symbol) {
      return findAtOrBefore(index, 'broker_quote', ts, isQuoteForSymbolAndStream(symbol, 'broker_quote'));
    },
    fetchHaltStatusAt(ts, symbol) {
      return findAtOrBefore(index, 'halt_feed', ts, isHaltForSymbol(symbol));
    },
    fetchLocateAt(ts, symbol) {
      return findAtOrBefore(index, 'locate_feed', ts, isLocateForSymbol(symbol));
    },
  };
}