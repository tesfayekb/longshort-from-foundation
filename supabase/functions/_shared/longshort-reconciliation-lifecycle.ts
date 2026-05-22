/**
 * longshort-reconciliation-lifecycle — 6-step lifecycle entrypoint per DEC-034.1 clause (4).
 *
 * Owner: longshort (sub-step 6.2)
 *
 * The reconcile() function is the SINGULAR entry point through which all 17 verify_*
 * invocations flow. Sub-step 6.3a/b/c/d verify_* implementations build a
 * ReconcileCallSpec + caller-provided invoke function and call reconcile() to run
 * the lifecycle.
 *
 * Per DEC-034.1 clause (4) — every verify_* invocation flows through:
 *   (a) invoke               — execute broker call + capture expected vs observed
 *   (b) classify outcome     — assign one of the 5-value outcome enum
 *   (c) write event row      — INSERT row to reconciliation_events with full schema
 *   (d) update state surface — update rolling-window counter, cooldown, escalation flag
 *   (e) execute failure action — inline action per §11.0.8 (specific per call_name)
 *   (f) return ReconcileResult to caller
 *
 * Banned per DEC-034 clauses (2)(4) (.cursorrules Rules 8/9/10):
 *   - Date.now() / new Date() outside of injected ts (use ts parameter throughout)
 *   - Sentinel fallbacks (value ?? 0, parseFloat(x) || 0, hardcoded 0/-1/-999)
 *   - try { ... } catch { return 0 } phantom-success swallowing
 *   - import logAuditEvent from _shared/audit.ts (audit-writer trap — engine writes to
 *     reconciliation_events directly, NOT to audit_logs)
 */

import { supabaseAdmin } from './supabase-admin.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationEventRow,
  ReconciliationOutcome,
} from './longshort-reconciliation-types.ts';
import { ENGINE_VERSION } from './longshort-reconciliation-types.ts';
import { DEFAULT_ROLLING_WINDOW_MS } from './longshort-reconciliation-state.ts';

/**
 * Execute the 6-step lifecycle for one verify_* invocation.
 *
 * @param spec Call specification (call_name, tier, tolerance, classifier, failure_action)
 * @param invoke Caller-provided broker invocation — pure async function returning expected + observed
 * @param ts Injected timestamp (replay determinism per DEC-035 clause (2))
 *
 * Throws on:
 *   - invoke() rejection: re-thrown (infrastructure failure outside lifecycle classification)
 *   - reconciliation_events INSERT failure: re-thrown (event log is authoritative)
 *
 * Does NOT throw on:
 *   - failure_action error: caught and recorded in event row's `notes` field
 *   - state update error: caught and recorded in event row's `notes` field; lifecycle still returns
 *     (state is a cache; event log is authoritative per DEC-034.1 clause (2))
 */
export async function reconcile<TExpected, TObserved>(
  spec: ReconcileCallSpec<TExpected, TObserved>,
  invoke: (ts: Date) => Promise<{ expected: TExpected; observed: TObserved }>,
  ts: Date,
): Promise<ReconcileResult> {
  // STEP (a) — invoke broker call
  const { expected, observed } = await invoke(ts);

  // STEP (b) — classify outcome (pure functions; deterministic per DEC-035 clause (1))
  const divergence = spec.compute_divergence(expected, observed);
  const outcome = spec.classify_outcome(divergence, spec.tolerance);

  // STEP (e) — execute failure action BEFORE event INSERT so `failure_action` can be
  // persisted in the event row in a single round-trip. The spec permits pre-INSERT or
  // post-INSERT-then-UPDATE ordering; pre-INSERT keeps event rows atomically complete and
  // avoids the second round-trip. failure_action errors are caught — never propagated.
  let action_taken: string | null = null;
  let action_error: string | null = null;
  const shouldRunAction =
    outcome === 'failure_handled' ||
    outcome === 'failure_escalated' ||
    outcome === 'system_bug';
  if (shouldRunAction) {
    try {
      const actionResult = await spec.failure_action({
        ts,
        outcome,
        divergence,
        expected,
        observed,
      });
      action_taken = actionResult.action_taken;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      action_error = `failure_action_error: ${errMsg}`;
      // Per CROSSWIND §11.0.8 + DEC-034 clauses (2)+(10): failures emit a structured log
      // record; log + record in notes + continue. NOT swallowed silently.
      console.error('[reconcile] failure_action threw', {
        call_name: spec.call_name,
        symbol: spec.symbol,
        outcome,
        error: errMsg,
      });
    }
  }

  // STEP (c) — write event row to reconciliation_events
  const event_id = await writeEventRow({
    operator_id: spec.operator_id,
    ts,
    engine_version: ENGINE_VERSION,
    call_name: spec.call_name,
    tier: spec.tier,
    symbol: spec.symbol,
    expected_value: expected as Record<string, unknown> | null,
    observed_value: observed as Record<string, unknown> | null,
    divergence,
    tolerance: spec.tolerance,
    outcome,
    failure_action: action_taken,
    phase_0b_run_id: null, // populated by replay framework in sub-step 6.5
    pr_evidence_ref: null, // populated by evidence tooling in sub-step 6.4
    notes: action_error,
  });

  // STEP (d) — update state surface (does not block return on error per DEC-034.1 clause (2)
  // state-as-cache contract — the event log is authoritative)
  try {
    await updateStateSurface({ spec, outcome, ts });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[reconcile] updateStateSurface failed (event row persisted)', {
      call_name: spec.call_name,
      symbol: spec.symbol,
      event_id,
      error: errMsg,
    });
    await annotateEventNotes(event_id, `state_update_error: ${errMsg}`);
  }

  // STEP (f) — return ReconcileResult to caller
  return {
    ts,
    call_name: spec.call_name,
    symbol: spec.symbol,
    outcome,
    divergence,
    event_id,
    action_taken,
  };
}

/** INSERT one row into reconciliation_events. RETURNING event_id. Throws on error. */
async function writeEventRow(
  row: Omit<ReconciliationEventRow, 'event_id' | 'resolved_at' | 'resolution_pr_ref'>,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('reconciliation_events')
    .insert({
      operator_id: row.operator_id,
      ts: row.ts.toISOString(),
      engine_version: row.engine_version,
      call_name: row.call_name,
      tier: row.tier,
      symbol: row.symbol,
      expected_value: row.expected_value,
      observed_value: row.observed_value,
      divergence: row.divergence,
      tolerance: row.tolerance,
      outcome: row.outcome,
      failure_action: row.failure_action,
      phase_0b_run_id: row.phase_0b_run_id,
      pr_evidence_ref: row.pr_evidence_ref,
      notes: row.notes,
    })
    .select('event_id')
    .single();

  if (error || !data) {
    throw new Error(
      `writeEventRow: INSERT failed: ${error?.message ?? 'no row returned'}`,
    );
  }
  return data.event_id as string;
}

/**
 * Upsert the (operator_id, symbol, call_name) state row.
 *
 * Rules per CROSSWIND §11.0.9 + §11.0.10:
 *   - Increment rolling_window_count ONLY for failure_handled / failure_escalated.
 *   - Set escalation_active=true for failure_escalated / system_bug.
 *   - Rolling-window reset: if (ts - rolling_window_start) > DEFAULT_ROLLING_WINDOW_MS,
 *     reset window_start to ts and count to 1 if firing, else 0.
 *   - false_positive_within_tolerance and expected_divergence_handled do NOT increment.
 *
 * Skips system-level calls (symbol === null) — state surface PK requires non-null symbol.
 */
async function updateStateSurface(args: {
  spec: ReconcileCallSpec<unknown, unknown>;
  outcome: ReconciliationOutcome;
  ts: Date;
}): Promise<void> {
  const { spec, outcome, ts } = args;
  if (spec.symbol === null) {
    // System-level calls (verify_buying_power, verify_rebalance_aggregate) do not project
    // onto the per-symbol state surface. Their evidence lives in reconciliation_events only.
    return;
  }

  const isFiring = outcome === 'failure_handled' || outcome === 'failure_escalated';
  const setsEscalation = outcome === 'failure_escalated' || outcome === 'system_bug';

  // Read current row (if any) to drive rolling-window arithmetic.
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('longshort_reconciliation_state')
    .select('*')
    .eq('operator_id', spec.operator_id)
    .eq('symbol', spec.symbol)
    .eq('call_name', spec.call_name)
    .maybeSingle();

  if (readErr) {
    throw new Error(`updateStateSurface: SELECT failed: ${readErr.message}`);
  }

  let rolling_window_count: number;
  let rolling_window_start: Date;

  if (!existing) {
    rolling_window_start = ts;
    rolling_window_count = isFiring ? 1 : 0;
  } else {
    const prevStart = new Date(existing.rolling_window_start as string);
    const elapsed = ts.getTime() - prevStart.getTime();
    if (elapsed > DEFAULT_ROLLING_WINDOW_MS) {
      rolling_window_start = ts;
      rolling_window_count = isFiring ? 1 : 0;
    } else {
      rolling_window_start = prevStart;
      rolling_window_count =
        (existing.rolling_window_count as number) + (isFiring ? 1 : 0);
    }
  }

  const escalation_active = setsEscalation
    ? true
    : (existing?.escalation_active as boolean | undefined) ?? false;
  const escalation_count_24h_prev =
    (existing?.escalation_count_24h as number | undefined) ?? 0;
  const escalation_count_24h = setsEscalation
    ? escalation_count_24h_prev + 1
    : escalation_count_24h_prev;
  const last_firing_ts = isFiring || outcome === 'system_bug'
    ? ts.toISOString()
    : (existing?.last_firing_ts as string | null | undefined) ?? null;

  const { error: upsertErr } = await supabaseAdmin
    .from('longshort_reconciliation_state')
    .upsert(
      {
        operator_id: spec.operator_id,
        symbol: spec.symbol,
        call_name: spec.call_name,
        rolling_window_count,
        rolling_window_start: rolling_window_start.toISOString(),
        last_firing_ts,
        cooldown_until: (existing?.cooldown_until as string | null | undefined) ?? null,
        escalation_active,
        escalation_count_24h,
        updated_at: ts.toISOString(),
      },
      { onConflict: 'operator_id,symbol,call_name' },
    );

  if (upsertErr) {
    throw new Error(`updateStateSurface: upsert failed: ${upsertErr.message}`);
  }
}

/**
 * Append a note to an existing reconciliation_events row. Used when failure_action throws or
 * when state update fails — preserves the otherwise-complete event row.
 *
 * Note: supabaseAdmin bypasses RLS, so the INSERT-only RLS policy on reconciliation_events
 * does not block this UPDATE. Service-role mutation is the sanctioned write surface.
 */
async function annotateEventNotes(event_id: string, note: string): Promise<void> {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from('reconciliation_events')
    .select('notes')
    .eq('event_id', event_id)
    .single();
  if (readErr) {
    console.error('[reconcile] annotateEventNotes: SELECT failed', {
      event_id,
      error: readErr.message,
    });
    return;
  }
  const prev = (existing?.notes as string | null) ?? '';
  const merged = prev.length > 0 ? `${prev}\n${note}` : note;
  const { error: updErr } = await supabaseAdmin
    .from('reconciliation_events')
    .update({ notes: merged })
    .eq('event_id', event_id);
  if (updErr) {
    console.error('[reconcile] annotateEventNotes: UPDATE failed', {
      event_id,
      error: updErr.message,
    });
  }
}
