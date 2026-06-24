/**
 * cache-propagator (PURE) — FP-056 E4 (DEC-068 clause e; ACT-312).
 *
 * The §8.9 rejection→cache-propagation classifier + the htb write-spec
 * generator. Pure: fixtures-in, decisions-out. NO IO, NO Date.now, NO
 * broker calls. Injected `ts` is the sole Date source (DEC-034 (4)).
 *
 * v1 HYBRID resolution (operator-ratified; documented in DEC-068 append):
 *   halted        → live verify_halt_status is AUTHORITATIVE next tick;
 *                   observability-emit ONLY (persist=false). A cache
 *                   would INTRODUCE staleness a live read doesn't have
 *                   (§2 anti-pattern).
 *   transient_bp  → live verify_buying_power is AUTHORITATIVE next tick;
 *                   observability-emit ONLY (persist=false). "Refresh"
 *                   means the next-tick live read, not an E4 broker call.
 *   htb           → the prime ITSELF is stale (Alpaca's /v2/assets
 *                   shortable column is a once-each-morning snapshot per
 *                   Alpaca docs; intraday borrow changes are not reflected
 *                   until next-morning refresh). The within-day correction
 *                   record breaks the otherwise-uninterrupted re-reject
 *                   loop: pre-flight passes stale snapshot → broker rejects
 *                   htb → next tick re-passes same stale snapshot → re-
 *                   rejects → … . The substitution layer does NOT break
 *                   the loop (substitution fires only when pre-flight
 *                   FAILS; here pre-flight keeps PASSING). persist=true.
 *                   NOT a §2 violation: this is a CORRECTION over a known-
 *                   stale prime, not a derivative drifting from a live one.
 *
 * v1 NO-PAUSE-CLASSES-ONLY: ssr_violation / pdt_block / persistent-BP
 * (3-in-1h) are out of scope (DW-150 / DW-151 / DW-152). LULD is subsumed
 * by halted per §8.10.
 *
 * SYSTEM_BUG CLASSIFICATION (§8.9 L274-275): if the same tick produced a
 * verifier pass that would have caught this rejection (e.g., verify_short_
 * availability passed yet broker rejected htb), the pre-flight gate has a
 * defect — outcome=system_bug. Else outcome=failure_handled (genuine
 * between-gate-and-submit market-state change). Same-tick scope matches
 * §8.9 L275 "moments earlier" + the zero-cross-tick state model.
 */

/** §8.9 NO-PAUSE rejection classes. */
export type PropagationClass = 'halted' | 'htb' | 'transient_bp';

/** §8.9 L274 outcome. */
export type PropagationOutcome = 'failure_handled' | 'system_bug';

/** Verbatim §8.9 failure_action strings — DO NOT EDIT (operator-pinned). */
export const FAILURE_ACTIONS = {
  halted: 'halt_cache_updated_from_rejection',
  htb: 'short_availability_cache_updated_htb',
  transient_bp: 'buying_power_cache_refreshed',
} as const;

/** Wall-clock TTL backstop for an htb record that is never re-attempted
 *  (no daily assets-refresh job exists — grep confirmed only quarterly
 *  universe refresh). 24h conservative wall-clock approximation; a
 *  trading-calendar-aware TTL is flagged for DEC-068 append. */
export const HTB_TTL_SECONDS = 24 * 60 * 60;

/** Per-tick snapshot of §7 verifier PASSes that would have caught a
 *  rejection. Populated by the caller (E1 / pre-flight composer) and
 *  passed in for system_bug classification. Empty list ⇒ no contradiction
 *  ⇒ failure_handled. */
export interface SameTickContradictoryPass {
  symbol: string;
  class: PropagationClass;
}

export interface PropagationDecision {
  class: PropagationClass;
  outcome: PropagationOutcome;
  /** Verbatim §8.9 failure_action — `FAILURE_ACTIONS[class]`. */
  failure_action: string;
  /** True ONLY for htb (the one class whose prime is stale). */
  persist: boolean;
}

/** Lowercase-substring matching against the rejection reason. Mirrors the
 *  E3 rejection-classifier discipline. */
const CLASS_TOKENS: ReadonlyArray<{ class: PropagationClass; tokens: readonly string[] }> = [
  { class: 'halted', tokens: ['halted', 'halt'] },
  { class: 'htb', tokens: ['htb', 'hard_to_borrow', 'hard-to-borrow'] },
  { class: 'transient_bp', tokens: ['insufficient_buying_power', 'insufficient buying power'] },
];

/** Pure classifier. Returns null when the reason does NOT match any of the
 *  three NO-PAUSE classes (caller should NOT invoke propagator for such
 *  rejections — they belong to the pause-class deferred scope or are
 *  unknown tier-3 unknowns handled by E3's rejection-classifier). */
export function classifyRejectionPropagation(args: {
  symbol: string;
  rejection_reason: string | null;
  sameTickPasses: readonly SameTickContradictoryPass[];
}): PropagationDecision | null {
  if (args.rejection_reason === null) return null;
  const r = args.rejection_reason.toLowerCase();
  if (r.length === 0) return null;

  let matched: PropagationClass | null = null;
  for (const entry of CLASS_TOKENS) {
    for (const tok of entry.tokens) {
      if (r.includes(tok)) {
        matched = entry.class;
        break;
      }
    }
    if (matched !== null) break;
  }
  if (matched === null) return null;

  const contradicted = args.sameTickPasses.some(
    (p) => p.symbol === args.symbol && p.class === matched,
  );

  return {
    class: matched,
    outcome: contradicted ? 'system_bug' : 'failure_handled',
    failure_action: FAILURE_ACTIONS[matched],
    persist: matched === 'htb',
  };
}

/** The single persist path: htb only. Halted / transient_bp have NO write
 *  spec by design (lean observability-emit only). */
export interface HtbRecordWrite {
  table: 'longshort_short_availability_cache';
  row: {
    symbol: string;
    marked_htb_at: string; // ISO
    expires_at: string;    // ISO — marked_htb_at + HTB_TTL_SECONDS
  };
}

/** Pure write-spec generator. `ts` is the injected sole Date source. */
export function computeHtbRecordWrite(symbol: string, ts: Date): HtbRecordWrite {
  const expires = new Date(ts.getTime() + HTB_TTL_SECONDS * 1000);
  return {
    table: 'longshort_short_availability_cache',
    row: {
      symbol,
      marked_htb_at: ts.toISOString(),
      expires_at: expires.toISOString(),
    },
  };
}