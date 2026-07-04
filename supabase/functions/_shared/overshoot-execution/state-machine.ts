// FP-069 W3.6.a (ACT-463) — overshoot execution state machine.
//
// PURE MODULE. Zero runtime imports. No DB, no network, no wall-clock.
//
// Operator-ratified 6-terminal state machine (I2). Every execution attempt
// begins at 'submitted' (a transient state — the CID has been assembled and
// the broker submission is in-flight) and MUST reach exactly one terminal.
// No silent drop: any code path that produces neither a transition nor a
// typed refusal is a governance violation (DW-208 anti-pattern class).
//
// TERMINALS (6, ratified):
//   'entry_refused_pre_open' — stabilization re-check refused entry BEFORE
//                              broker submission (I5 DEFAULT-DENY firing).
//                              Observed gap persisted for W5 threshold
//                              opportunity-cost measurement.
//   'rejected'               — broker rejected the submission (auth,
//                              locate, price band, halted, etc.). Terminal.
//   'expired'                — broker accepted but the order expired
//                              unfilled by the intent's cutoff (entry:
//                              first-open marketable-limit window; exit_time:
//                              T+5 session close). Persisted with full
//                              never-silent-drop discipline.
//   'filled'                 — entry terminal: broker reports full fill.
//   'exited'                 — exit terminal: broker reports the closing
//                              fill for a previously-filled entry.
//   'exit_failed'            — exit submission rejected/expired AND the
//                              position remains open. Escalation state for
//                              the operator; NOT a silent-drop terminal.
//
// TRANSITIONS (only these are legal):
//   submitted → entry_refused_pre_open   (entry intent, pre-open re-check)
//   submitted → rejected                 (any intent)
//   submitted → expired                  (any intent)
//   submitted → filled                   (entry intent only)
//   submitted → exited                   (exit_time | exit_manual only)
//   submitted → exit_failed              (exit_time | exit_manual only)
//
// The (intent × terminal) legality table is enforced by `transition()`.
// Terminals are absorbing: no transition out of a terminal is legal. Retry
// = new attempt (attempt++), new CID, new state-machine instance.

import type { OvershootIntent } from './intents.ts';

export const OVERSHOOT_EXECUTION_TERMINALS = [
  'entry_refused_pre_open',
  'rejected',
  'expired',
  'filled',
  'exited',
  'exit_failed',
] as const;
export type OvershootExecutionTerminal = typeof OVERSHOOT_EXECUTION_TERMINALS[number];

export type OvershootExecutionState = 'submitted' | OvershootExecutionTerminal;

export function isOvershootTerminal(state: OvershootExecutionState): state is OvershootExecutionTerminal {
  return (OVERSHOOT_EXECUTION_TERMINALS as ReadonlyArray<string>).includes(state);
}

// Intent × terminal legality. Encoded here (not in a comment) so the guard
// in `transition()` is machine-checkable — the intent taxonomy owner is
// intents.ts; the reachability contract is owned here.
const LEGAL_TERMINALS_BY_INTENT: Record<OvershootIntent, ReadonlyArray<OvershootExecutionTerminal>> = {
  entry: ['entry_refused_pre_open', 'rejected', 'expired', 'filled'],
  exit_time: ['rejected', 'expired', 'exited', 'exit_failed'],
  exit_manual: ['rejected', 'expired', 'exited', 'exit_failed'],
};

export function legalTerminalsFor(intent: OvershootIntent): ReadonlyArray<OvershootExecutionTerminal> {
  return LEGAL_TERMINALS_BY_INTENT[intent];
}

export interface OvershootExecutionAttempt {
  intent: OvershootIntent;
  attempt: number;
  state: OvershootExecutionState;
}

export function newAttempt(intent: OvershootIntent, attempt: number): OvershootExecutionAttempt {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error(`overshoot-state: attempt must be non-negative integer (got ${JSON.stringify(attempt)})`);
  }
  return { intent, attempt, state: 'submitted' };
}

// Pure transition. Throws on any illegal move. Callers wrap the throw with
// a typed refusal upstream where appropriate — never swallow.
export function transition(
  current: OvershootExecutionAttempt,
  next: OvershootExecutionTerminal,
): OvershootExecutionAttempt {
  if (current.state !== 'submitted') {
    throw new Error(
      `overshoot-state: absorbing-terminal violation — cannot transition from '${current.state}' to '${next}'`,
    );
  }
  const legal = LEGAL_TERMINALS_BY_INTENT[current.intent];
  if (!legal.includes(next)) {
    throw new Error(
      `overshoot-state: illegal transition intent='${current.intent}' → terminal='${next}' (legal: ${legal.join(',')})`,
    );
  }
  return { ...current, state: next };
}

// Retry-shape idempotency helper: given a terminated attempt, produce the
// SHAPE (intent + attempt+1) for the next retry. Does NOT mint a CID — the
// caller pairs this with buildOvershootClientOrderId(...) so the ratified
// tuple (run_id, ticker, side, intent, attempt) advances atomically.
export function retryShape(current: OvershootExecutionAttempt): { intent: OvershootIntent; attempt: number } {
  if (!isOvershootTerminal(current.state)) {
    throw new Error(`overshoot-state: retryShape requires terminated attempt (state='${current.state}')`);
  }
  return { intent: current.intent, attempt: current.attempt + 1 };
}