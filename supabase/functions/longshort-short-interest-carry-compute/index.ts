/**
 * longshort-short-interest-carry-compute — DAILY weekday carry-forward cron
 * handler for Signal #9 (`short_interest_change_30d`). FP-053 / DW-106-c-ii.
 *
 * Mirrors `longshort-short-interest-compute/index.ts` skeleton VERBATIM:
 *   verifyCronSecret(req) (401 on missing/bad X-Cron-Secret)
 *   → as_of = productionClock.getWallClockTs() (sole sanctioned wall-clock
 *     chokepoint — DEC-034 clause 4)
 *   → three-event audit envelope
 *     `longshort.short_interest_carry.compute.{started,completed,failed}`
 *     all carrying `trigger:'cron'`
 *   → createCarryOrchestrator({supabase, operator_id}).run(as_of)
 *
 * DIFFERENCES vs the native short-interest cron fn:
 *   - NO Polygon fetchers / NO POLYGON_API_KEY check (carry is pure-DB).
 *   - NO persistSignalComputeLog (carry result shape is custom
 *     `CarryOrchestratorResult`; telemetry travels in the audit envelope).
 *   - On successful completion with `carried_count >= 1`, stamps
 *     `system_config.dw_106_short_interest_heal_date` via
 *     `stampHealDateIfFirst` (INSERT ... ON CONFLICT (key) DO NOTHING —
 *     PERMANENT / idempotent / NEVER overwritten per DEC-060 §(iii)).
 *   - The manual sibling (`longshort-short-interest-carry-compute-manual`,
 *     c-i) does NOT stamp `heal_date` — that gate is reserved for the
 *     first CRON emission so operator §22.5.1 smoke runs cannot
 *     prematurely open the DEC-059 n≥30 measurement window.
 *
 * DISARMED at creation (job_registry.enabled=false). Operator flips the
 * enable + wires the cron at DW-106-c-d only after end-to-end DEC-043
 * attestation (200 + cron-attributable artifact row).
 *
 * Owner: longshort (FP-053 / DW-106-c-ii).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createCarryOrchestrator,
  SIGNAL_ID,
  type CarryOrchestratorContext,
} from '../_shared/longshort-signals/short-interest-change/carry-orchestrator.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** DEC-060 §(iii) heal_date key. */
export const HEAL_DATE_CONFIG_KEY = 'dw_106_short_interest_heal_date';

/**
 * Permanent, idempotent stamp of the DW-106 coverage-heal date.
 *
 * Inserts `system_config(key, value) = (HEAL_DATE_CONFIG_KEY, {heal_date,
 * stamped_at, correlation_id})` with `ON CONFLICT (key) DO NOTHING` — so
 * the row is written exactly ONCE on the first cron emission with
 * `carried_count >= 1`, and is NEVER overwritten on subsequent fires.
 * DEC-060 §(iii) + §(vi) — re-stamping invalidates the DEC-059 n≥30
 * measurement clock and requires a superseding DEC.
 *
 * Returns `{ stamped }` reporting whether THIS call inserted (true) or the
 * row already existed (false). The boolean is advisory only; the
 * DB-level `ON CONFLICT DO NOTHING` is the load-bearing guarantee.
 */
export async function stampHealDateIfFirst(
  supabase: SupabaseClient,
  as_of: Date,
  correlationId: string,
): Promise<{ stamped: boolean; error?: Error }> {
  const as_of_date = as_of.toISOString().slice(0, 10);
  const value = {
    heal_date: as_of_date,
    stamped_at: as_of.toISOString(),
    correlation_id: correlationId,
  };
  const { data, error } = await supabase
    .from('system_config')
    .insert({ key: HEAL_DATE_CONFIG_KEY, value })
    .select('key');
  if (error) {
    // 23505 unique_violation is the ON-CONFLICT-DO-NOTHING analog when the
    // PostgREST client surfaces a conflict; treat as "already stamped".
    if ((error as { code?: string }).code === '23505') {
      return { stamped: false };
    }
    return { stamped: false, error: new Error(error.message) };
  }
  return { stamped: Array.isArray(data) && data.length === 1 };
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.short_interest_carry.compute.started',
    correlationId,
    metadata: { as_of: as_of.toISOString(), signal_id: SIGNAL_ID, trigger: 'cron' },
  });

  const ctx: CarryOrchestratorContext = {
    supabase: supabaseAdmin,
    operator_id: DEFAULT_OPERATOR_ID,
  };

  try {
    const orch = createCarryOrchestrator(ctx);
    const result = await orch.run(as_of);

    let heal_date_stamped: boolean | null = null;
    let heal_date_error: string | undefined;
    if (result.outcome === 'completed' && result.carried_count >= 1) {
      const stampRes = await stampHealDateIfFirst(supabaseAdmin, as_of, correlationId);
      heal_date_stamped = stampRes.stamped;
      if (stampRes.error) heal_date_error = stampRes.error.message;
    }

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.short_interest_carry.compute.completed'
          : 'longshort.short_interest_carry.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        outcome: result.outcome,
        universe_size: result.universe_size,
        persisted_count: result.persisted_count,
        carried_count: result.carried_count,
        past_bound_count: result.past_bound_count,
        no_publication_count: result.no_publication_count,
        skipped_native_count: result.skipped_native_count,
        failure_reason: result.failure_reason,
        heal_date_stamped,
        heal_date_error,
        trigger: 'cron',
      },
    });

    return apiSuccess({
      status: 'ok',
      signal_id: SIGNAL_ID,
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      universe_size: result.universe_size,
      persisted_count: result.persisted_count,
      carried_count: result.carried_count,
      past_bound_count: result.past_bound_count,
      no_publication_count: result.no_publication_count,
      skipped_native_count: result.skipped_native_count,
      heal_date_stamped,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.short_interest_carry.compute.failed',
      correlationId,
      metadata: {
        signal_id: SIGNAL_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'short_interest_carry_compute_failed', { correlationId });
  }
}));