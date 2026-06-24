/**
 * cache-propagator-io (I/O SHELL) — FP-056 E4 (DEC-068 clause e; ACT-312).
 *
 * Wraps the pure cache-propagator.ts kernel around an injected htb writer
 * + the shared ReconciliationEventWriter (mirrors E3's lifecycle-
 * orchestrator pattern). NO broker instantiation (the BP "refresh" is
 * just the next-tick live verify_buying_power, NOT an E4 call). Injected
 * clock; `ts` is the sole Date source (DEC-034 (4)).
 *
 * Event shape (verbatim per §11.0.4 / §8.9 L274):
 *   call_name = 'broker_rejection_propagation'
 *   payload   = { symbol, rejection_reason, propagation_class,
 *                 failure_action, persisted, htb_write_succeeded? }
 *
 * tier/outcome mapping for the emitted event:
 *   failure_handled → tier='tier2', outcome='failure_handled'
 *   system_bug      → tier='tier3', outcome='failure_escalated' (pre-flight
 *                     gate defect — routes to the same paging path as the
 *                     E3 tier-3 events; pre-pause-class operator-alert).
 */

import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import {
  classifyRejectionPropagation,
  computeHtbRecordWrite,
  type HtbRecordWrite,
  type PropagationDecision,
  type SameTickContradictoryPass,
} from './cache-propagator.ts';

/** htb UPSERT writer (mirrors E2's submitter injection pattern). The live
 *  impl performs `INSERT … ON CONFLICT (symbol) DO UPDATE SET marked_htb_at,
 *  expires_at = EXCLUDED.*` against MIG-119
 *  `public.longshort_short_availability_cache`. Tests inject a capturing stub. */
export interface HtbCacheWriter {
  upsertHtb(write: HtbRecordWrite): Promise<void>;
}

/** The propagator surface E3's lifecycle-orchestrator invokes inline in
 *  its terminal-rejection branch (the inline seam — zero propagation lag). */
export interface RejectionPropagator {
  propagate(args: {
    symbol: string;
    rejection_reason: string | null;
    sameTickPasses: readonly SameTickContradictoryPass[];
    ts: Date;
    /** Diagnostic context carried into the emitted event payload. */
    order_id?: string;
    client_order_id?: string;
  }): Promise<PropagationDecision | null>;
}

export function createRejectionPropagator(deps: {
  htbWriter: HtbCacheWriter;
  eventWriter: ReconciliationEventWriter;
}): RejectionPropagator {
  return {
    async propagate(args) {
      const decision = classifyRejectionPropagation({
        symbol: args.symbol,
        rejection_reason: args.rejection_reason,
        sameTickPasses: args.sameTickPasses,
      });

      // Reason not in NO-PAUSE scope (pause-class / unknown). No-op — E3's
      // rejection-classifier + kernel already tagged the order tier-3.
      if (decision === null) return null;

      // PERSIST PATH (htb only). Compute write spec from pure kernel.
      let htb_write_succeeded: boolean | undefined;
      if (decision.persist) {
        const write = computeHtbRecordWrite(args.symbol, args.ts);
        try {
          await deps.htbWriter.upsertHtb(write);
          htb_write_succeeded = true;
        } catch (err) {
          // Cache-write failure is itself a tier-3 surface: the loop-break
          // record didn't land, so the next tick CAN re-reject. Emit a
          // distinct diagnostic event so the operator alert fires on the
          // write-failure (not on the rejection), then re-throw — the
          // orchestrator's outer try will route to tier-3.
          htb_write_succeeded = false;
          await deps.eventWriter.emit(
            {
              call_name: 'longshort.execution.htb_cache_write_failed',
              tier: 'tier3',
              outcome: 'failure_escalated',
              payload: {
                symbol: args.symbol,
                order_id: args.order_id,
                error: err instanceof Error ? err.message : String(err),
              },
            },
            args.ts,
          );
          // Fall through to emit the propagation event with persisted=false
          // so the audit trail records BOTH the rejection-propagation
          // attempt AND the write failure (correlated by symbol+ts).
        }
      }

      // OBSERVABILITY EMIT — always fires for all three classes.
      const event: EmittedExecutionEvent = {
        call_name: 'broker_rejection_propagation',
        tier: decision.outcome === 'system_bug' ? 'tier3' : 'tier2',
        outcome: decision.outcome === 'system_bug' ? 'failure_escalated' : 'failure_handled',
        payload: {
          symbol: args.symbol,
          rejection_reason: args.rejection_reason,
          propagation_class: decision.class,
          failure_action: decision.failure_action,
          persisted: decision.persist && htb_write_succeeded === true,
          ...(decision.persist ? { htb_write_succeeded } : {}),
          ...(args.order_id ? { order_id: args.order_id } : {}),
          ...(args.client_order_id ? { client_order_id: args.client_order_id } : {}),
        },
      };
      await deps.eventWriter.emit(event, args.ts);

      return decision;
    },
  };
}

// ─── Live htb writer adapter ────────────────────────────────────────────
//
// Thin Supabase wrapper. Held here (not the pure module) because it
// imports the supabase client. Tests inject `HtbCacheWriter` directly and
// never construct this; this adapter is what the production edge-function
// wiring would import. Kept ts-only / no fetch in the import graph.

/** Structural type for the supabase client surface this adapter uses.
 *  Keeps the module decoupled from the supabase-js npm specifier in the
 *  test path; the runtime client passed by the edge function satisfies it. */
export interface MinimalSupabaseClient {
  from(table: string): {
    upsert(values: Record<string, unknown>, options?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
    delete(): { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
    select(columns: string): {
      eq(column: string, value: string): {
        gt(column: string, value: string): {
          maybeSingle(): Promise<{ data: { symbol: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

export function createSupabaseHtbCacheWriter(client: MinimalSupabaseClient): HtbCacheWriter {
  return {
    async upsertHtb(write) {
      const { error } = await client
        .from(write.table)
        .upsert(
          {
            symbol: write.row.symbol,
            marked_htb_at: write.row.marked_htb_at,
            expires_at: write.row.expires_at,
          },
          { onConflict: 'symbol' },
        );
      if (error) throw new Error(`htb upsert failed: ${error.message}`);
    },
  };
}

// ─── Live htb cache reader + clearer (for verify_short_availability) ───
//
// The LOAD-BEARING WIRING — verify_short_availability consults this reader
// BEFORE the broker locate call. Without the consult, the htb record is
// written but never read, and the re-reject loop is NOT broken.

/** Pre-flight htb consult — true ⇒ symbol is currently marked htb (and
 *  the TTL backstop has not expired). Filters `expires_at > ts` so an
 *  expired never-re-attempted record does not block re-eligibility. */
export interface HtbCacheReader {
  isMarkedHtb(symbol: string, ts: Date): Promise<boolean>;
}

/** Clear-on-genuine-success — fires ONLY on
 *  `qty_available >= qty_requested` (the `false_positive_within_tolerance`
 *  outcome). MUST NOT fire on the PARTIAL case (the symbol is still
 *  constrained; a blanket clear would re-open the loop). */
export interface HtbCacheClearer {
  clearHtb(symbol: string): Promise<void>;
}

export function createSupabaseHtbCacheReader(client: MinimalSupabaseClient): HtbCacheReader {
  return {
    async isMarkedHtb(symbol, ts) {
      const { data, error } = await client
        .from('longshort_short_availability_cache')
        .select('symbol')
        .eq('symbol', symbol)
        .gt('expires_at', ts.toISOString())
        .maybeSingle();
      if (error) throw new Error(`htb read failed: ${error.message}`);
      return data !== null;
    },
  };
}

export function createSupabaseHtbCacheClearer(client: MinimalSupabaseClient): HtbCacheClearer {
  return {
    async clearHtb(symbol) {
      const { error } = await client
        .from('longshort_short_availability_cache')
        .delete()
        .eq('symbol', symbol);
      if (error) throw new Error(`htb clear failed: ${error.message}`);
    },
  };
}