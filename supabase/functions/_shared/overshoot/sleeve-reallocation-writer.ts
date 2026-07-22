// DEC-504-4 WIRE (2026-07-22) — transition-edge sleeve-reallocation writer.
//
// Owner: overshoot module (SI-staleness → SHORT-sleeve reallocation to LONG).
// Classification: audit-critical (money-path adjacent — controls capacity envelope).
// Lifecycle: active.
//
// PURPOSE — single-homed helper that:
//   1. Reads the PRIOR completed detection run's sleeve posture from
//      `overshoot_detection_runs.sleeves` (jsonb), returning both the prior
//      `reallocation_active` flag AND the last engagement audit uuid (for W5
//      ref stability across consecutive engaged runs).
//   2. Decides whether the current run represents an ENGAGE / DISENGAGE /
//      NOOP transition versus the prior state.
//   3. On engage/disengage ONLY, writes ONE `overshoot.sleeve.reallocation_
//      engaged|disengaged` row to `overshoot_audit_logs` via the sanctioned
//      `writeStrategyAuditEvent` helper (T4-safe — never the platform writer).
//
// IDEMPOTENCE — repeated identical-state runs write nothing (one row per
// transition). Callers MUST call `resolveSleeveContext` first, then supply
// the current run's `sleeveDecision` to `maybeWriteSleeveTransition`, then
// take the returned `w5ReallocationRef` — which is:
//   - the new audit uuid when transition == 'engage'
//   - the PRIOR engagement audit uuid when currently active AND transition
//     == 'noop' (i.e. still engaged from a prior run)
//   - null otherwise (disengaged, or never-engaged)
//
// Pure `decideTransition` is exported for unit testing without a DB.

import { writeStrategyAuditEvent } from '../strategy-audit.ts';
import type { SleeveAllocation } from './si-freshness.ts';

// deno-lint-ignore no-explicit-any
type Sql = any;

export type SleeveTransition = 'engage' | 'disengage' | 'noop';

/** Pure decision — one row per state edge; identical-state runs are noop. */
export function decideTransition(
  priorActive: boolean,
  currActive: boolean,
): SleeveTransition {
  if (priorActive === currActive) return 'noop';
  return currActive ? 'engage' : 'disengage';
}

export interface SleeveContext {
  /** Prior completed run's `sleeves.reallocation_active`; false if no prior. */
  priorActive: boolean;
  /** Prior engagement's audit uuid (from `sleeves.w5_reallocation_ref`), or null. */
  priorEngageAuditId: string | null;
}

/**
 * Read the prior completed detection run's sleeve posture. "Prior" = the
 * most recent `overshoot_detection_runs` row with outcome='completed' whose
 * `run_id` differs from the current run. When the sleeves column is empty
 * (pre-wire rows) OR no prior completed run exists, returns
 * `{ priorActive: false, priorEngageAuditId: null }` — the safe fresh-book
 * default.
 */
export async function resolveSleeveContext(
  sql: Sql,
  currentRunId: string,
): Promise<SleeveContext> {
  const rows = await sql<{ sleeves: Record<string, unknown> | null }[]>`
    SELECT sleeves
    FROM overshoot_detection_runs
    WHERE outcome = 'completed'
      AND run_id <> ${currentRunId}::uuid
    ORDER BY detected_at DESC
    LIMIT 1
  `;
  const s = rows[0]?.sleeves ?? null;
  if (!s || typeof s !== 'object') {
    return { priorActive: false, priorEngageAuditId: null };
  }
  const priorActive = s['reallocation_active'] === true;
  const rawRef = s['w5_reallocation_ref'];
  const priorEngageAuditId = typeof rawRef === 'string' && rawRef.length > 0 ? rawRef : null;
  return { priorActive, priorEngageAuditId };
}

export interface MaybeWriteTransitionParams {
  transition: SleeveTransition;
  correlationId: string;
  runId: string;
  asOfIso: string;
  freshestSiAsOfDateIso: string | null;
  sleeveDecision: SleeveAllocation;
  stalenessMaxDays: number;
  reason: 'si_stale_active' | 'si_freshness_restored';
}

/**
 * Write ONE `overshoot.sleeve.reallocation_engaged` or `_disengaged` audit
 * row on a transition edge. Returns the new audit uuid on success (engage
 * transitions), or null for noop / disengage / write failure.
 *
 * On write failure the caller does NOT abort the run — the sleeve capacity
 * envelope has already been decided; a missed audit line is a diagnostic
 * gap, not a money-path defect. The strategy-audit helper logs the failure
 * structurally.
 */
export async function maybeWriteSleeveTransition(
  params: MaybeWriteTransitionParams,
): Promise<string | null> {
  if (params.transition === 'noop') return null;
  const action = params.transition === 'engage'
    ? 'overshoot.sleeve.reallocation_engaged'
    : 'overshoot.sleeve.reallocation_disengaged';
  const result = await writeStrategyAuditEvent({
    strategyKey: 'overshoot',
    action,
    // System-originated: no operator identity; default operator uuid applies.
    targetType: 'overshoot_detection_runs',
    targetId: params.runId,
    correlationId: params.correlationId,
    metadata: {
      set_by_kind: 'system',
      source_ref: 'si-freshness',
      reason: params.reason,
      as_of: params.asOfIso,
      freshest_si_as_of_date: params.freshestSiAsOfDateIso,
      si_staleness_max_days: params.stalenessMaxDays,
      long_capacity: params.sleeveDecision.longCapacity,
      short_capacity: params.sleeveDecision.shortCapacity,
      long_allocation_pct: params.sleeveDecision.longAllocationPct,
      short_allocation_pct: params.sleeveDecision.shortAllocationPct,
    },
  });
  if (result.success) return result.auditId;
  console.warn(JSON.stringify({
    level: 'warn',
    event: 'overshoot.sleeve.transition_audit_write_failed',
    correlationId: params.correlationId,
    code: result.code,
    reason: result.reason,
  }));
  return null;
}

/**
 * Resolve the W5 reallocation ref that should stamp target rows / lots on
 * this run. Stable across consecutive engaged runs; null when not engaged.
 */
export function resolveW5ReallocationRef(
  currentActive: boolean,
  transition: SleeveTransition,
  newlyWrittenAuditId: string | null,
  priorEngageAuditId: string | null,
): string | null {
  if (!currentActive) return null;
  if (transition === 'engage') return newlyWrittenAuditId;
  // transition === 'noop' AND currentActive → still engaged from prior run.
  return priorEngageAuditId;
}