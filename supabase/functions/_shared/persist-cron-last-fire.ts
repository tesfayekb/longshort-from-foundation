/**
 * persistCronLastFire — DW-shadow-visibility Layer-1 (sub-step 1b)
 *
 * Writes the fire-status row for a cron in `public.cron_last_fire`
 * (MIG-103). The table is the operator-facing staleness anchor for
 * `job_registry` rows whose handlers bypass `_shared/job-executor.ts`
 * (the three shadow/heal crons: combiner_shadow_rank,
 * combiner_forward_returns, short_interest_carry).
 *
 * SEMANTICS (load-bearing — see DW-shadow-visibility design):
 *   - success: upsert {completed_at = now, outcome = 'success',
 *     failure_reason = null}. `completed_at` advances — this is the
 *     staleness anchor consumed by the AdminJobsPage column (1c).
 *   - failed:  upsert {outcome = 'failed', failure_reason = <trimmed>}
 *     and OMIT `completed_at` from the payload so the prior
 *     last-success timestamp is preserved on conflict (and stays NULL
 *     on a first-fire failure). This preserves last-success semantics
 *     so the staleness pill reflects the last *good* fire, not the
 *     last *attempt*.
 *
 * OBSERVABILITY-WRITE INVARIANT (CRITICAL):
 *   This helper MUST NOT throw. The shadow-book / carry-heal write is
 *   the primary job; a fire-status write failure is a telemetry
 *   degradation, never a job failure. The catch-block call site in
 *   each handler especially must never mask the original orchestrator
 *   error. All DB errors are swallowed + logged to console.
 *
 * `updated_at` is intentionally omitted — MIG-103 has a BEFORE UPDATE
 * trigger (`update_cron_last_fire_updated_at`) + a column default that
 * handle it.
 *
 * Owner: longshort (DW-shadow-visibility Layer-1 / sub-step 1b)
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const FAILURE_REASON_MAX_CHARS = 500;

export type CronLastFireOutcome = 'success' | 'failed';

export async function persistCronLastFire(
  supabase: SupabaseClient,
  jobId: string,
  outcome: CronLastFireOutcome,
  failureReason?: string | null,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      job_id: jobId,
      outcome,
    };
    if (outcome === 'success') {
      payload.completed_at = new Date().toISOString();
      payload.failure_reason = null;
    } else {
      // OMIT completed_at on failure — preserve prior last-success
      // timestamp on conflict (and leave NULL on first-fire failure).
      const trimmed = (failureReason ?? '').toString().trim();
      payload.failure_reason =
        trimmed.length > FAILURE_REASON_MAX_CHARS
          ? trimmed.slice(0, FAILURE_REASON_MAX_CHARS)
          : trimmed.length > 0
            ? trimmed
            : null;
    }

    const { error } = await supabase
      .from('cron_last_fire')
      .upsert(payload, { onConflict: 'job_id' });
    if (error) {
      console.error(
        `[persistCronLastFire] swallowed DB error for job_id=${jobId} outcome=${outcome}: ${error.message}`,
      );
    }
  } catch (e) {
    console.error(
      `[persistCronLastFire] swallowed throw for job_id=${jobId} outcome=${outcome}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}