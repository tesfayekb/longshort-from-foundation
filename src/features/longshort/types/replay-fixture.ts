/**
 * Replay fixture types — discriminated union for the 8 capture streams per CROSSWIND §11.10.1.
 *
 * Sub-step 6.5a (foundation): types + contracts only. Sub-step 6.5b consumes these in the
 * deterministic replay engine; sub-step 6.5c emits L2 synthetic Day 1 fixtures conforming to
 * these types.
 *
 * Per ADR-005: Deno-native implementation; §11.10 "pytest" reference is non-normative.
 * Per DEC-034 clause (4): all timestamps use injected ISO-8601 strings; no `Date.now()`.
 * Per §11.10.3: ts ordering is the canonical sort key; replay engine consumes events in
 *   ascending `ts` order across all streams.
 */

/** Canonical timestamp shape — ISO-8601 string. Injected; never derived from Date.now(). */
export type ReplayTimestamp = string;

/** Fixture format version. Increments only on breaking changes. */
export const REPLAY_FIXTURE_FORMAT_VERSION = 1 as const;

/** Canonical replay-day identifier. Format: `<source>-day-<NN>` (e.g., `l2-synthetic-day-1`). */
export type ReplayDayId = string;

/** Discriminator field. All fixture events have a `stream` discriminator. */
export type ReplayStreamName =
  | 'broker_state'
  | 'signal_quote'
  | 'reconciliation_quote'
  | 'broker_quote'
  | 'halt_feed'
  | 'locate_feed'
  | 'corporate_actions'
  | 'combiner_io';

// ──────────────────────────────────────────────────────────────────
// Stream 1: Broker state (Alpaca positions / orders / fills / borrow / account)
// ──────────────────────────────────────────────────────────────────

export type BrokerStateEventKind =
  | 'position_snapshot'
  | 'order_submitted'
  | 'order_filled'
  | 'order_rejected'
  | 'order_canceled'
  | 'borrow_status'
  | 'account_snapshot';

export interface BrokerStateEvent {
  stream: 'broker_state';
  ts: ReplayTimestamp;
  kind: BrokerStateEventKind;
  payload: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────
// Streams 2-4: Quote streams (signal-source / reconciliation-source / broker-source)
// ──────────────────────────────────────────────────────────────────

export interface QuoteEvent {
  stream: 'signal_quote' | 'reconciliation_quote' | 'broker_quote';
  ts: ReplayTimestamp;
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume?: number;
  source: string;
}

// ──────────────────────────────────────────────────────────────────
// Stream 5: Halt feed
// ──────────────────────────────────────────────────────────────────

export interface HaltEvent {
  stream: 'halt_feed';
  ts: ReplayTimestamp;
  symbol: string;
  halted: boolean;
  halt_code?: string;
  reason?: string;
}

// ──────────────────────────────────────────────────────────────────
// Stream 6: Locate feed
// ──────────────────────────────────────────────────────────────────

export interface LocateEvent {
  stream: 'locate_feed';
  ts: ReplayTimestamp;
  symbol: string;
  locate_id: string;
  available: boolean;
  qty_available?: number;
  ttl_seconds?: number;
}

// ──────────────────────────────────────────────────────────────────
// Stream 7: Corporate actions feed
// ──────────────────────────────────────────────────────────────────

export interface CorporateActionEvent {
  stream: 'corporate_actions';
  ts: ReplayTimestamp;
  symbol: string;
  action_type: 'split' | 'dividend' | 'merger' | 'spinoff' | 'ticker_change' | 'other';
  ex_date: ReplayTimestamp;
  payload: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────
// Stream 8: Combiner I/O capture
// Per §11.10.1 verbatim: "at every ranking event, full (symbol, signal_id, value, is_present,
// timestamp) tuples + produced ranking with rank, score, SHAP attribution per name"
// ──────────────────────────────────────────────────────────────────

export interface CombinerSignalInput {
  symbol: string;
  signal_id: string;
  value: number | null;
  is_present: boolean;
  ts: ReplayTimestamp;
}

export interface CombinerRankingOutput {
  symbol: string;
  rank: number;
  score: number;
  shap_attribution: Record<string, number>;
}

export interface CombinerIOEvent {
  stream: 'combiner_io';
  ts: ReplayTimestamp;
  inputs: CombinerSignalInput[];
  outputs: CombinerRankingOutput[];
}

// ──────────────────────────────────────────────────────────────────
// Discriminated union — the canonical event type the replay engine consumes
// ──────────────────────────────────────────────────────────────────

export type ReplayFixtureEvent =
  | BrokerStateEvent
  | QuoteEvent
  | HaltEvent
  | LocateEvent
  | CorporateActionEvent
  | CombinerIOEvent;

/**
 * Type-guard helpers. Used by the replay engine (6.5b) to narrow events per stream.
 */
export function isBrokerStateEvent(e: ReplayFixtureEvent): e is BrokerStateEvent {
  return e.stream === 'broker_state';
}
export function isQuoteEvent(e: ReplayFixtureEvent): e is QuoteEvent {
  return e.stream === 'signal_quote' || e.stream === 'reconciliation_quote' || e.stream === 'broker_quote';
}
export function isHaltEvent(e: ReplayFixtureEvent): e is HaltEvent {
  return e.stream === 'halt_feed';
}
export function isLocateEvent(e: ReplayFixtureEvent): e is LocateEvent {
  return e.stream === 'locate_feed';
}
export function isCorporateActionEvent(e: ReplayFixtureEvent): e is CorporateActionEvent {
  return e.stream === 'corporate_actions';
}
export function isCombinerIOEvent(e: ReplayFixtureEvent): e is CombinerIOEvent {
  return e.stream === 'combiner_io';
}