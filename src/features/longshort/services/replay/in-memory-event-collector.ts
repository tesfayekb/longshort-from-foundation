/**
 * in-memory-event-collector — replay-side substitute for the live `reconciliation_events`
 * DB-write path.
 *
 * The reconciliation lifecycle (`reconcile()` in `longshort-reconciliation-lifecycle.ts`)
 * normally writes events via `supabaseAdmin`. For 6.5c replay-test PASS we need to capture
 * those rows WITHOUT touching live DB (per §22.5.1 third clause).
 *
 * Strategy: 6.5c does NOT modify the lifecycle. Instead, the replay-pass-runner builds a
 * thin shim that mimics the (expected, observed) outcome calculation + classification +
 * event-row shape, captures it here, and returns a ReconcileResult to the caller. This
 * sidesteps the lifecycle's DB-write entirely — at the cost that we're testing the
 * verifier + classifier integration, not the full DB write surface.
 *
 * In 6.5d AI-loop verification surface, we can additionally inject a service-role
 * `supabaseAdmin` that uses a transactional rollback wrapper for full lifecycle exercise,
 * but that's later-phase work.
 */

import type { ReconciliationOutcome, ReconciliationTier } from '../../../../../supabase/functions/_shared/longshort-reconciliation-types.ts';

/** Snapshot of a single reconciliation event captured by the collector. */
export interface CollectedReconciliationEvent {
  ts: string;             // ISO-8601
  call_name: string;
  operator_id: string;
  symbol: string | null;
  tier: ReconciliationTier;
  outcome: ReconciliationOutcome;
  divergence: Record<string, unknown>;
  action_taken: string | null;
}

/** Stateful collector — caller drains rows after replay finishes. */
export class InMemoryEventCollector {
  private readonly rows: CollectedReconciliationEvent[] = [];

  collect(event: CollectedReconciliationEvent): void {
    this.rows.push(event);
  }

  /** Returns a defensive copy. Caller may compare across two runs. */
  snapshot(): CollectedReconciliationEvent[] {
    return JSON.parse(JSON.stringify(this.rows));
  }

  clear(): void {
    this.rows.length = 0;
  }

  count(): number {
    return this.rows.length;
  }
}