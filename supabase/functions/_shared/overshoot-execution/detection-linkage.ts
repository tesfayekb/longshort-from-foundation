// FP-069 W3.6.e-i (ACT-464.e-i) — DETECTION → ENTRY day-linkage decider.
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
// Consumed by the W3.6.e-ii ENTRY engine at pre-open (09:35 ET window):
// answers ONE question — which detection run's selections are eligible
// to enter TODAY? — from three injected inputs:
//
//   1. asOf                 (YYYY-MM-DD in America/New_York — the entry
//                            morning session date, sourced from the same
//                            market-clock snapshot used by session-age;
//                            PIN-1 machinery REUSED, never duplicated)
//   2. spyPriorSessionDates (SPY overshoot_daily_bars trade_date values,
//                            strictly < asOf, ascending, DEDUPLICATED —
//                            represents SETTLED SPY sessions the caller
//                            has already fetched from the DB)
//   3. detectionRun         (the single-latest completed
//                            overshoot_detection_runs row for the
//                            prior-SPY-session `as_of`, or null)
//
// RATIFIED RULE (ACT-464 A4):
//   T's detection run selections enter at T+1 RTH open. The prior SPY
//   session (= max(spyPriorSessionDates) < asOf) IS the detection
//   as_of the entry engine must load. Weekends and holidays collapse
//   identically because SPY daily bars only exist for trading sessions
//   — the "prior SPY session" is naturally holiday-aware.
//
// Three typed refusals (ratified verbatim):
//   'detection_run_missing_for_prior_session' — no run row exists for
//       the computed prior-session as_of. The engine writes zero entries
//       and records this refusal on the audit envelope.
//   'detection_run_not_completed'             — a row exists but its
//       outcome is not one of the completed-with-selections tokens.
//       Never enter on a partial or failed run.
//   'detection_run_stale'                     — the run's as_of is
//       further back than the immediate prior SPY session (typically
//       because yesterday's detection was skipped/failed). Stale
//       selections MUST NOT enter — the alpha window has moved past.
//
// PIN-1 REUSE: the "which is the prior SPY session for asOf" question is
// answered by the same SPY-bar sequence session-age.ts consumes. This
// module accepts the pre-fetched settled-dates array and does NOT
// re-query the DB or re-derive holiday logic; the caller shares its SPY
// fetch across both modules within one edge-fn invocation.

/** Detection-run outcome tokens considered "completed with actionable
 *  selections". Anything else (skipped, aborted, error, pre-open-skip)
 *  falls into `detection_run_not_completed`. */
export const OVERSHOOT_DETECTION_COMPLETED_OUTCOMES = [
  'completed',
  'completed_with_events',
] as const;
export type OvershootDetectionCompletedOutcome =
  typeof OVERSHOOT_DETECTION_COMPLETED_OUTCOMES[number];

export interface OvershootDetectionRunRow {
  run_id: string;
  /** overshoot_detection_runs.as_of — YYYY-MM-DD. */
  as_of: string;
  outcome: string;
  selected_count: number;
}

export type DetectionLinkageRefusalCode =
  | 'detection_run_missing_for_prior_session'
  | 'detection_run_not_completed'
  | 'detection_run_stale'
  | 'no_prior_spy_session'
  | 'malformed_session_date';

export interface DetectionLinkageRefusal {
  ok: false;
  refusal: DetectionLinkageRefusalCode;
  reason: string;
  priorSessionExpected: string | null;
  runAsOfActual: string | null;
}

export interface DetectionLinkageOk {
  ok: true;
  runId: string;
  priorSessionExpected: string;
  runAsOf: string;
  outcome: OvershootDetectionCompletedOutcome;
  selectedCount: number;
}

export type DetectionLinkageResult = DetectionLinkageOk | DetectionLinkageRefusal;

export interface ResolveDetectionRunForEntryInput {
  /** Entry morning session date (from clock snapshot, YYYY-MM-DD). */
  asOf: string;
  /** Settled SPY session dates strictly < asOf, ascending. */
  spyPriorSessionDates: readonly string[];
  /** Latest-completed detection_runs row for the prior-session as_of, or null. */
  detectionRun: OvershootDetectionRunRow | null;
}

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

function isCompletedOutcome(v: string): v is OvershootDetectionCompletedOutcome {
  return (OVERSHOOT_DETECTION_COMPLETED_OUTCOMES as ReadonlyArray<string>).includes(v);
}

/**
 * Compute the prior SPY session date for a given entry `asOf`. Exported
 * so the entry engine can pass the same value into its detection-run
 * fetch (single source of truth — no duplicated derivation).
 */
export function computePriorSpySessionDate(
  asOf: string,
  spyPriorSessionDates: readonly string[],
): string | null {
  let latest: string | null = null;
  for (const d of spyPriorSessionDates) {
    if (d < asOf && (latest === null || d > latest)) latest = d;
  }
  return latest;
}

export function resolveDetectionRunForEntry(
  input: ResolveDetectionRunForEntryInput,
): DetectionLinkageResult {
  const { asOf, spyPriorSessionDates, detectionRun } = input;

  if (!YYYY_MM_DD.test(asOf)) {
    return {
      ok: false, refusal: 'malformed_session_date',
      reason: `asOf must be YYYY-MM-DD (got ${JSON.stringify(asOf)})`,
      priorSessionExpected: null, runAsOfActual: null,
    };
  }
  for (const d of spyPriorSessionDates) {
    if (!YYYY_MM_DD.test(d)) {
      return {
        ok: false, refusal: 'malformed_session_date',
        reason: `spyPriorSessionDates entry must be YYYY-MM-DD (got ${JSON.stringify(d)})`,
        priorSessionExpected: null, runAsOfActual: null,
      };
    }
  }

  const priorSession = computePriorSpySessionDate(asOf, spyPriorSessionDates);
  if (priorSession === null) {
    return {
      ok: false, refusal: 'no_prior_spy_session',
      reason: `no SPY session strictly < asOf=${asOf} in supplied bars`,
      priorSessionExpected: null, runAsOfActual: null,
    };
  }

  if (detectionRun === null) {
    return {
      ok: false, refusal: 'detection_run_missing_for_prior_session',
      reason: `no detection run for as_of=${priorSession}`,
      priorSessionExpected: priorSession, runAsOfActual: null,
    };
  }

  if (!YYYY_MM_DD.test(detectionRun.as_of)) {
    return {
      ok: false, refusal: 'malformed_session_date',
      reason: `detectionRun.as_of must be YYYY-MM-DD (got ${JSON.stringify(detectionRun.as_of)})`,
      priorSessionExpected: priorSession, runAsOfActual: detectionRun.as_of,
    };
  }

  if (detectionRun.as_of !== priorSession) {
    // The run exists but for an older date — yesterday's run was
    // skipped/failed and the caller fetched the most recent completed
    // predecessor. Stale selections MUST NOT enter.
    return {
      ok: false, refusal: 'detection_run_stale',
      reason: `detection run as_of=${detectionRun.as_of} predates prior SPY session ${priorSession} (stale selections)`,
      priorSessionExpected: priorSession, runAsOfActual: detectionRun.as_of,
    };
  }

  if (!isCompletedOutcome(detectionRun.outcome)) {
    return {
      ok: false, refusal: 'detection_run_not_completed',
      reason: `detection run outcome=${detectionRun.outcome} not in completed set`,
      priorSessionExpected: priorSession, runAsOfActual: detectionRun.as_of,
    };
  }

  return {
    ok: true,
    runId: detectionRun.run_id,
    priorSessionExpected: priorSession,
    runAsOf: detectionRun.as_of,
    outcome: detectionRun.outcome,
    selectedCount: detectionRun.selected_count,
  };
}