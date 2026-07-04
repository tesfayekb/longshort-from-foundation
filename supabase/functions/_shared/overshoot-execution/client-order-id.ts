// FP-069 W3.6.a (ACT-463) — overshoot execution client-order-id (CID) module.
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
//
// Operator-ratified scheme (I1, verbatim):
//   ovs-{run8}-{ticker}-{side1}-{intent}-{attempt}
//
//   run8    : lowercase-hex first 8 chars of the overshoot detection run_id
//             (UUIDv4; 8 hex chars = 32 bits of run entropy).
//   ticker  : uppercase [A-Z0-9.] 1..10 chars (matches the overshoot_events
//             ticker column shape observed in first-light: e.g. VRT, GLW,
//             INTC, RH; the dot supports class-share tickers like BRK.B).
//   side1   : 'L' | 'S' (from overshoot_events.side ∈ {LONG,SHORT}).
//   intent  : 'entry' | 'exit_time' | 'exit_manual' (I2 taxonomy, ratified).
//   attempt : non-negative integer (0..N). 0 = first attempt; increments
//             on operator-authorized retry within the same tuple.
//
// Idempotency anchor (I1, verbatim): the ratified tuple
//   (run_id, ticker, side, intent, attempt)
// uniquely identifies a broker submission. Persistence-layer UNIQUE constraint
// lives in W3.6.b/c migrations; this module produces the deterministic CID
// string only.
//
// Length audit (worst-case): "ovs-"(4) + 8 + "-"(1) + 10 + "-"(1) + 1 + "-"(1)
//   + "exit_manual"(11) + "-"(1) + attempt-digits. With attempt<=9 (single
//   digit) worst-case = 4+8+1+10+1+1+1+11+1+1 = 39 chars. Two-digit attempt
//   = 40. Three-digit = 41. All well under the 48-char operator gate.

export type OvershootSide = 'LONG' | 'SHORT';
export type OvershootIntent = 'entry' | 'exit_time' | 'exit_manual';

export interface OvershootCidComponents {
  runId: string;
  ticker: string;
  side: OvershootSide;
  intent: OvershootIntent;
  attempt: number;
}

// Ratified regex (I1). Anchored. Matches any legally-formed overshoot CID.
// Ticker: uppercase alphanumeric + dot, 1..10 chars (matches the overshoot
// universe shape and mirrors the SEC ticker character set).
export const OVERSHOOT_CID_RE =
  /^ovs-([0-9a-f]{8})-([A-Z0-9.]{1,10})-([LS])-(entry|exit_time|exit_manual)-(\d+)$/;

// Absolute upper-bound the operator gated us on (I1: "<48 chars verified").
export const OVERSHOOT_CID_MAX_LEN = 48;

const RUN_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TICKER_RE = /^[A-Z0-9.]{1,10}$/;

const INTENTS: ReadonlyArray<OvershootIntent> = ['entry', 'exit_time', 'exit_manual'];

export function buildOvershootClientOrderId(
  parts: OvershootCidComponents,
): string {
  const { runId, ticker, side, intent, attempt } = parts;

  if (!RUN_ID_UUID_RE.test(runId)) {
    throw new Error(
      `overshoot-cid: runId is not a lowercase-hex UUID (got ${JSON.stringify(runId)})`,
    );
  }
  if (!TICKER_RE.test(ticker)) {
    throw new Error(
      `overshoot-cid: ticker fails [A-Z0-9.]{1,10} (got ${JSON.stringify(ticker)})`,
    );
  }
  if (side !== 'LONG' && side !== 'SHORT') {
    throw new Error(`overshoot-cid: side must be LONG|SHORT (got ${JSON.stringify(side)})`);
  }
  if (!INTENTS.includes(intent)) {
    throw new Error(`overshoot-cid: intent must be one of ${INTENTS.join('|')} (got ${JSON.stringify(intent)})`);
  }
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error(`overshoot-cid: attempt must be non-negative integer (got ${JSON.stringify(attempt)})`);
  }

  const run8 = runId.slice(0, 8).toLowerCase();
  const side1 = side === 'LONG' ? 'L' : 'S';
  const cid = `ovs-${run8}-${ticker}-${side1}-${intent}-${attempt}`;

  if (cid.length > OVERSHOOT_CID_MAX_LEN) {
    throw new Error(
      `overshoot-cid: assembled length ${cid.length} exceeds ratified max ${OVERSHOOT_CID_MAX_LEN} (cid=${cid})`,
    );
  }
  return cid;
}

export interface OvershootCidParsed {
  run8: string;
  ticker: string;
  side: OvershootSide;
  intent: OvershootIntent;
  attempt: number;
}

// Strict parse. Returns null on any structural mismatch. Callers that need to
// surface a typed refusal MUST branch on null themselves — never silent-pass.
export function parseOvershootClientOrderId(cid: string): OvershootCidParsed | null {
  const m = OVERSHOOT_CID_RE.exec(cid);
  if (!m) return null;
  const [, run8, ticker, side1, intent, attemptStr] = m;
  const attempt = Number.parseInt(attemptStr, 10);
  if (!Number.isFinite(attempt) || attempt < 0) return null;
  return {
    run8,
    ticker,
    side: side1 === 'L' ? 'LONG' : 'SHORT',
    intent: intent as OvershootIntent,
    attempt,
  };
}

// Convenience: bump attempt within the same idempotency tuple. Callers use
// this on operator-authorized retry paths (W3.6.e entry engine + W3.6.d exit
// engine); the retry policy itself lives in the engine, not here.
export function incrementAttempt(parts: OvershootCidComponents): OvershootCidComponents {
  return { ...parts, attempt: parts.attempt + 1 };
}