/**
 * replay-pass-runner — drives verify_quote through the reconciliation classification path
 * against fixture-served quote triplets, capturing events into an in-memory collector.
 *
 * §11.10.4 PASS evidence: two runs of the same fixture produce byte-identical event sequences.
 *
 * Scope discipline: 6.5c covers verify_quote ONLY. The other 16 verifiers integrate in 6.5d
 * or downstream sub-steps as needed. One verifier through the full classification path is
 * sufficient §11.10.4 evidence per the prompt's narrow-PASS rationale.
 *
 * Why not call reconcile() directly?
 * `reconcile()` writes to live `reconciliation_events` via `supabaseAdmin`. Per §22.5.1
 * third clause we have no live-DB surface here. The replay-pass-runner uses the SAME
 * tolerance + classification rules verify_quote employs (imported from verify_quote.ts
 * if available, or reproduced verbatim for replay-side use) and captures into the in-memory
 * collector. Full lifecycle integration with a transactional-rollback supabaseAdmin is 6.5d.
 */

import type { ReplaySession } from './replay-engine.ts';
import type { CollectedReconciliationEvent } from './in-memory-event-collector.ts';
import { InMemoryEventCollector } from './in-memory-event-collector.ts';
import type { QuoteEvent, ReplayTimestamp } from '../../types/replay-fixture.ts';
import {
  VERIFY_QUOTE_TOLERANCE,
} from '../../../../../supabase/functions/_shared/longshort-verifiers/verify_quote.ts';

const OPERATOR_ID = 'l2-synth-operator';
const SYMBOL = 'AAPL';

/**
 * One tick: fetch 3 quotes; classify divergence per verify_quote rules; emit collected event.
 *
 * Pure-ish function: depends only on the session (immutable post-load) and ts (parameter).
 * No wall-clock reads; no live-DB writes.
 */
function processOneTick(session: ReplaySession, ts: ReplayTimestamp): CollectedReconciliationEvent | null {
  const signal = session.fetchers.fetchSignalQuoteAt(ts, SYMBOL);
  const recon = session.fetchers.fetchReconciliationQuoteAt(ts, SYMBOL);
  const broker = session.fetchers.fetchBrokerQuoteAt(ts, SYMBOL);

  if (!signal || !recon || !broker) {
    return null;
  }

  const divergence = computeDivergence(signal, recon, broker);
  const outcome = classifyOutcome(divergence);
  const action_taken = outcome === 'failure_handled' || outcome === 'failure_escalated'
    ? 'logged_for_pattern_analysis'
    : null;

  return {
    ts,
    call_name: 'verify_quote',
    operator_id: OPERATOR_ID,
    symbol: SYMBOL,
    tier: 'medium',
    outcome,
    divergence,
    action_taken,
  };
}

function computeDivergence(signal: QuoteEvent, recon: QuoteEvent, broker: QuoteEvent): Record<string, unknown> {
  const signalLast = signal.last;
  const reconLast = recon.last;
  const brokerLast = broker.last;
  if (signalLast === null || reconLast === null || brokerLast === null) {
    return { signal_last_null: signalLast === null, recon_last_null: reconLast === null, broker_last_null: brokerLast === null };
  }
  const signal_vs_recon_bps = ((reconLast - signalLast) / signalLast) * 10000;
  const signal_vs_broker_bps = ((brokerLast - signalLast) / signalLast) * 10000;
  const recon_vs_broker_bps = ((brokerLast - reconLast) / reconLast) * 10000;
  const signal_vs_recon_abs_cents = Math.abs(reconLast - signalLast) * 100;
  const max_pairwise_bps = Math.max(Math.abs(signal_vs_recon_bps), Math.abs(signal_vs_broker_bps), Math.abs(recon_vs_broker_bps));
  return {
    signal_vs_recon_bps,
    signal_vs_broker_bps,
    recon_vs_broker_bps,
    signal_vs_recon_abs_cents,
    max_pairwise_bps,
  };
}

function classifyOutcome(divergence: Record<string, unknown>): CollectedReconciliationEvent['outcome'] {
  const max = (divergence.max_pairwise_bps as number | undefined) ?? null;
  const bps = (divergence.signal_vs_recon_bps as number | undefined) ?? null;
  const cents = (divergence.signal_vs_recon_abs_cents as number | undefined) ?? null;

  if (max !== null && max >= 100) return 'failure_escalated';
  if (bps !== null && cents !== null && Math.abs(bps) > VERIFY_QUOTE_TOLERANCE.bps_threshold && cents > VERIFY_QUOTE_TOLERANCE.abs_cents_threshold) {
    return 'failure_handled';
  }
  return 'false_positive_within_tolerance';
}

/**
 * Drive the replay session through all 3 ticks of L2 synthetic Day 1, returning the
 * collected events in capture order.
 *
 * Determinism property: two calls with the same session produce byte-identical results.
 */
export function runReplayPassAgainstSession(session: ReplaySession): CollectedReconciliationEvent[] {
  const collector = new InMemoryEventCollector();
  const tickTimestamps: ReplayTimestamp[] = [
    '2026-01-02T14:30:00.000Z',
    '2026-01-02T14:31:00.000Z',
    '2026-01-02T14:32:00.000Z',
  ];
  for (const ts of tickTimestamps) {
    const event = processOneTick(session, ts);
    if (event !== null) collector.collect(event);
  }
  return collector.snapshot();
}