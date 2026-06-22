/**
 * longshort-signal-decay-capture - per-signal close-to-next-open alpha
 * decay accrual fire (MIG-114 / ACT-279 / DEC-048 evidence plumbing).
 *
 * Daily-morning measurement fire at ~13:35 UTC Mon-Fri (~5 min after
 * US cash-open 13:30 UTC, to let Polygon settle the open print). Reads
 * fresh signal_observations across all signals, anti-joins existing
 * success rows (DW-135 cross-source reconcile is the only event that
 * promotes unreconciled -> success), fetches Polygon adjusted daily
 * open+close bars at bounded concurrency, applies universe / hard-
 * exclusion eligibility, and UPSERTs typed-absence-disciplined rows
 * into signal_decay_returns.
 *
 * Auth: cron-only - verifyCronSecret against X-Cron-Secret.
 *
 * Wall-clock discipline (DEC-034 (4) / FP-047): as_of_run derives from
 * productionClock.getWallClockTs() - the SOLE sanctioned wall-clock
 * site. The orchestrator anchors Polygon lookback against this run-date;
 * per-row computed_at = as_of_run.toISOString().
 *
 * POLYGON_API_KEY check: 500 polygon_api_key_unset (mirrors
 * longshort-combiner-forward-returns).
 *
 * 200-on-completed AND 200-on-failed (clean orchestrator failure with
 * typed failure_reason); per-ticker typed-absence rows are NORMAL (not
 * a run failure - they retry on the next cron tick). 500 ONLY on
 * orchestrator throw (true fatal).
 *
 * Run-level telemetry written to signal_decay_log (NOT signal_compute_log
 * - decay instrument is measurement-only with distinct semantics).
 *
 * Audit envelope MIRRORS longshort-combiner-forward-returns/index.ts:
 *   .started BEFORE; .completed / .failed AFTER; catch -> .failed with
 *   stage='orchestrator_throw'. All with trigger:'cron'.
 *
 * No job_registry row (measurement, not live trading). Schedule is
 * operator-applied via sql/22_longshort_signal_decay_cron_schedule.sql.
 *
 * MEASUREMENT-ONLY: nothing consumes signal_decay_returns or
 * signal_decay_log. The instrument banks the evidence the Phase-7
 * cadence decision (DEC-048), the fast-signal overnight weighting
 * question, and the Phase 4/5 exit thresholds all depend on.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createSignalDecayOrchestrator } from '../_shared/longshort-signals/decay/signal-decay-orchestrator.ts';
import { PolygonOpenCloseFetcher } from '../_shared/longshort-signals/shared/polygon-open-close-fetcher.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();
  const started_at_iso = as_of.toISOString();

  const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonApiKey) {
    return apiError(500, 'polygon_api_key_unset', { correlationId });
  }

  await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.signal.decay_capture.started',
    correlationId,
    metadata: {
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      trigger: 'cron',
    },
  });

  try {
    const openClose = new PolygonOpenCloseFetcher(polygonApiKey);
    const orch = createSignalDecayOrchestrator({
      supabase: supabaseAdmin,
      operator_id: DEFAULT_OPERATOR_ID,
      openClose,
    });
    const result = await orch.run(as_of);

    // Run-level log row in signal_decay_log (NOT signal_compute_log).
    // completed_at is read from the SAME injected-clock snapshot at log
    // time (not Date.now()) - kept consistent with the run instant.
    const completed_at_iso = productionClock.getWallClockTs().toISOString();
    const { error: logErr } = await supabaseAdmin.from('signal_decay_log').insert({
      operator_id: DEFAULT_OPERATOR_ID,
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      signals_considered: result.signals_considered,
      observations_considered: result.observations_considered,
      distinct_tickers_fetched: result.distinct_tickers_fetched,
      rows_written: result.rows_written,
      by_status: result.by_status,
      failure_reason:
        result.outcome === 'failed' ? result.failure_reason : null,
      started_at: started_at_iso,
      completed_at: completed_at_iso,
    });
    if (logErr) {
      // Log-row failure is itself surfaced via audit but does not flip the
      // run outcome (UPSERT rows already landed - the measurement is real
      // whether or not the run-summary row persists).
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'longshort.signal.decay_capture.log_persist_failed',
        correlationId,
        metadata: {
          operator_id: DEFAULT_OPERATOR_ID,
          as_of: as_of.toISOString(),
          error: logErr.message,
        },
      });
    }

    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action:
        result.outcome === 'completed'
          ? 'longshort.signal.decay_capture.completed'
          : 'longshort.signal.decay_capture.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        as_of_date: result.as_of_date,
        outcome: result.outcome,
        signals_considered: result.signals_considered,
        observations_considered: result.observations_considered,
        observations_after_anti_join: result.observations_after_anti_join,
        distinct_tickers_fetched: result.distinct_tickers_fetched,
        rows_written: result.rows_written,
        by_status: result.by_status,
        failure_reason:
          result.outcome === 'failed' ? result.failure_reason : undefined,
        trigger: 'cron',
      },
    });

    return apiSuccess({
      status: 'ok',
      operator_id: DEFAULT_OPERATOR_ID,
      as_of: as_of.toISOString(),
      as_of_date: result.as_of_date,
      outcome: result.outcome,
      signals_considered: result.signals_considered,
      observations_considered: result.observations_considered,
      observations_after_anti_join: result.observations_after_anti_join,
      distinct_tickers_fetched: result.distinct_tickers_fetched,
      rows_written: result.rows_written,
      by_status: result.by_status,
      failure_reason:
        result.outcome === 'failed' ? result.failure_reason : undefined,
      correlation_id: correlationId,
    });
  } catch (e) {
    await writeStrategyAuditEvent({
      strategyKey: 'longshort',
      action: 'longshort.signal.decay_capture.failed',
      correlationId,
      metadata: {
        operator_id: DEFAULT_OPERATOR_ID,
        as_of: as_of.toISOString(),
        error: e instanceof Error ? e.message : String(e),
        stage: 'orchestrator_throw',
        trigger: 'cron',
      },
    });
    return apiError(500, 'cron_signal_decay_capture_failed', { correlationId });
  }
}));