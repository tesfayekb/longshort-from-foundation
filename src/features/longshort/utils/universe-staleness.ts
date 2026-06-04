/**
 * universe-staleness — pure-frontend staleness derivation for the
 * long-short universe re-seed cadence (FP-008.4 #16, Tier B).
 *
 * The backend canonical quarter format is `Q{1-4}_{YYYY}` (e.g., `Q2_2026`),
 * produced by `supabase/functions/_shared/longshort-universe/refresh-jobs/
 * quarterly-refresh-orchestrator.ts::quarterLabelFor`. The "what quarter is
 * it now" derivation MUST stay consistent with
 * `supabase/functions/_shared/longshort-universe/shared/trading-days.ts::
 * quarterOf`. This file is a deliberate frontend copy of that 4-line
 * predicate because the Deno `_shared` module cannot be imported into the
 * React/Vite runtime. The triplication (orchestrator + trading-days +
 * here) is logged as consolidation debt; see INC for FP-008.4 #16.
 *
 * Wall-clock note: this module calls `new Date()` at the caller boundary
 * (callers pass `now` in). That is correct here — staleness is a
 * presentation-layer "how fresh is the displayed data?" computation,
 * NOT a financial/decision/reconciliation kernel. The DEC-034 wall-clock
 * ban applies to `supabase/functions/` money paths and is enforced by
 * `scripts/check-wall-clock.ts`, which does not scan `src/`.
 *
 * Pure functions only: no React, no I/O, no React Query.
 */

export type QuarterNum = 1 | 2 | 3 | 4;

export interface QuarterTuple {
  readonly year: number;
  readonly q: QuarterNum;
}

/**
 * Canonical 4-value set of universe-refresh outcomes (subset of
 * `universe_refresh_log.outcome` widened at MIG-056). `null` represents
 * "no refresh row at all".
 */
export type RefreshOutcome =
  | 'completed'
  | 'failed'
  | 'partial'
  | 'circuit_breaker_open';

/**
 * Cross-reference framing for the operator tooltip on an overdue/stale
 * badge. Distinguishes "the scheduler tried and is failing" from "no
 * recent attempt at all" — different remediation paths.
 */
export type StalenessCause = 'refresh_failing' | 'no_recent_attempt' | null;

/**
 * 5-state discriminated union. `bootstrapping` short-circuits when there
 * is no universe data yet (the orchestrator's bootstrap loop runs daily
 * until the first `completed` row exists — see
 * `supabase/functions/longshort-universe-quarterly-refresh/index.ts`
 * L148-190).
 */
export type StalenessState =
  | { kind: 'bootstrapping' }
  | { kind: 'current'; latest: QuarterTuple; current: QuarterTuple }
  | {
      kind: 'aging';
      latest: QuarterTuple;
      current: QuarterTuple;
      cause: StalenessCause;
    }
  | {
      kind: 'overdue';
      latest: QuarterTuple;
      current: QuarterTuple;
      cause: StalenessCause;
    }
  | {
      kind: 'stale';
      latest: QuarterTuple;
      current: QuarterTuple;
      quartersBehind: number;
      cause: StalenessCause;
    };

/**
 * Presentation heuristic: how many calendar days into a new quarter
 * before "latest universe still from prev quarter" stops being normal
 * (aging) and becomes overdue.
 *
 * Cadence: the quarterly refresh fires on the first trading day of
 * Jan/Apr/Jul/Oct, with a 3-attempt circuit-breaker budget on top. A
 * 7-day window comfortably covers (a) the first-trading-day shift when
 * day-1 of the quarter is a weekend/holiday, plus (b) one or two
 * retry-day round-trips. NOT a financial threshold — purely a UI
 * heuristic for switching between "wait, this is normal" and "operator
 * action probably needed". Calendar-days (not trading-days) is the
 * right granularity here: the slack absorbs the difference, and using
 * trading-days would require importing the backend NYSE holiday
 * calendar into the React bundle.
 */
export const OVERDUE_TRADING_DAYS_INTO_QUARTER = 7;

const QUARTER_LABEL_RE = /^Q([1-4])_(\d{4})$/;

/** Parse the canonical backend `Q{1-4}_{YYYY}` format. Returns null on malformed input. */
export function parseQuarterLabel(label: string | null | undefined): QuarterTuple | null {
  if (!label) return null;
  const m = QUARTER_LABEL_RE.exec(label);
  if (!m) return null;
  const q = Number(m[1]) as QuarterNum;
  const year = Number(m[2]);
  if (!Number.isFinite(year)) return null;
  return { year, q };
}

/**
 * Compute the current calendar quarter from `now`. Mirrors
 * `trading-days.ts::quarterOf` — must stay in sync.
 */
export function currentQuarter(now: Date): QuarterTuple {
  const m = now.getUTCMonth();
  const q = (m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4) as QuarterNum;
  return { year: now.getUTCFullYear(), q };
}

/** Count of quarters from `a` (older) to `b` (newer). Negative if `a` is newer. */
function quartersBetween(a: QuarterTuple, b: QuarterTuple): number {
  return (b.year - a.year) * 4 + (b.q - a.q);
}

/** First day of the given quarter (UTC midnight on Jan/Apr/Jul/Oct 1st). */
function startOfQuarter(qt: QuarterTuple): Date {
  const monthIdx = (qt.q - 1) * 3; // 0, 3, 6, 9
  return new Date(Date.UTC(qt.year, monthIdx, 1));
}

/**
 * Calendar-days from the start of `current`'s quarter to `now`. Used
 * only as the aging-vs-overdue threshold input (see
 * `OVERDUE_TRADING_DAYS_INTO_QUARTER` doc for why calendar-days is the
 * right granularity for this presentation heuristic).
 */
export function calendarDaysIntoQuarter(now: Date, current: QuarterTuple): number {
  const start = startOfQuarter(current).getTime();
  const elapsed = now.getTime() - start;
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / (24 * 60 * 60 * 1000));
}

function deriveCause(outcome: RefreshOutcome | null): StalenessCause {
  if (outcome == null) return 'no_recent_attempt';
  if (outcome === 'completed') return 'no_recent_attempt';
  // failed / partial / circuit_breaker_open — scheduler attempted, upstream failing
  return 'refresh_failing';
}

export interface ComputeStalenessArgs {
  /** Canonical `Q{1-4}_{YYYY}` label of the latest universe membership, or null if none. */
  readonly latestQuarterLabel: string | null | undefined;
  /**
   * Outcome of the MOST RECENT refresh row (any outcome), not the most
   * recent completed. Drives the cross-reference cause framing for
   * overdue/stale states. Null if no refresh row exists.
   */
  readonly latestRefreshOutcome: RefreshOutcome | null;
  /** Caller-supplied wall-clock (presentation-layer; see module docstring). */
  readonly now: Date;
}

/**
 * Compute the staleness state. See `StalenessState` for the 5 kinds.
 *
 * Notes:
 *   - `bootstrapping` short-circuits when `latestQuarterLabel` is null /
 *     unparseable. The membership page already shows a dedicated empty
 *     state in that case; the badge simply suppresses itself.
 *   - `quartersBehind` is computed for both `overdue` (where it equals
 *     1 by definition; not surfaced separately) and `stale` (where it
 *     drives the badge label).
 */
export function computeStaleness(args: ComputeStalenessArgs): StalenessState {
  const latest = parseQuarterLabel(args.latestQuarterLabel);
  if (latest == null) return { kind: 'bootstrapping' };

  const current = currentQuarter(args.now);
  const behind = quartersBetween(latest, current);

  if (behind <= 0) {
    // Latest is current quarter (behind === 0) or somehow future-dated
    // (behind < 0; treat as current — operator shouldn't see "future"
    // framed as stale).
    return { kind: 'current', latest, current };
  }

  const cause = deriveCause(args.latestRefreshOutcome);

  if (behind >= 2) {
    return { kind: 'stale', latest, current, quartersBehind: behind, cause };
  }

  // behind === 1 — previous quarter. Aging-vs-overdue depends on how
  // far into the current quarter we are.
  const days = calendarDaysIntoQuarter(args.now, current);
  if (days <= OVERDUE_TRADING_DAYS_INTO_QUARTER) {
    return { kind: 'aging', latest, current, cause };
  }
  return { kind: 'overdue', latest, current, cause };
}

// ===== Presentation helpers (label / variant) =====

/** StatusBadge variant mapping for the 5 states. */
export type StalenessBadgeVariant = 'active' | 'info' | 'pending' | 'deactivated';

export function stalenessBadgeVariant(state: StalenessState): StalenessBadgeVariant | null {
  switch (state.kind) {
    case 'bootstrapping':
      return null; // suppress badge entirely; the page shows its own empty state
    case 'current':
      return 'active';
    case 'aging':
      return 'info';
    case 'overdue':
      return 'pending';
    case 'stale':
      return 'deactivated';
  }
}

function quarterDisplay(q: QuarterTuple): string {
  return `Q${q.q} ${q.year}`;
}

/** Short badge label (no tooltip context — see `stalenessTooltip` for the long form). */
export function stalenessBadgeLabel(state: StalenessState): string {
  switch (state.kind) {
    case 'bootstrapping':
      return '';
    case 'current':
      return `Current (${quarterDisplay(state.latest)})`;
    case 'aging':
      return `New-quarter refresh pending`;
    case 'overdue':
      return `Re-seed overdue`;
    case 'stale':
      return `Stale (${state.quartersBehind} quarters behind)`;
  }
}

/**
 * Long-form tooltip cause framing. Returns null when no decoration
 * applies (current / bootstrapping).
 */
export function stalenessCauseHint(state: StalenessState): string | null {
  if (state.kind === 'current' || state.kind === 'bootstrapping') return null;
  if (state.kind === 'aging') {
    return `Latest universe is ${quarterDisplay(state.latest)}; current quarter is ${quarterDisplay(state.current)}. Within the normal early-quarter window — the new refresh may not have completed yet.`;
  }
  const head = `Latest universe is ${quarterDisplay(state.latest)}; current quarter is ${quarterDisplay(state.current)}.`;
  const tail =
    state.cause === 'refresh_failing'
      ? 'The most recent refresh attempt did not complete — check upstream data sources and the circuit-breaker state.'
      : 'No recent refresh attempt of any outcome has been recorded — check the scheduler.';
  return `${head} ${tail}`;
}