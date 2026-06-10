/**
 * longshort-options-flow-worker — DEPRECATED (FP-045 Phase 4).
 *
 * The FP-043 chunked coordinator/worker architecture is replaced by the
 * DEC-047 cursor-drain queue-worker engine. Per-ticker fetch + compute
 * for options-flow now runs inside `longshort-queue-slice` via the
 * options-flow queue adapter (`options-flow-queue-adapter.ts`). The
 * shared `_shared/longshort-signals/options-flow/options-flow-chunk-runner.ts`
 * remains in the tree (FP-043 preservation promise) — its per-ticker
 * semantics are mirrored by the queue adapter.
 *
 * This handler is preserved (not deleted) for the same reason: FP-043
 * code stays in the codebase. The behavior is replaced with a 410 Gone
 * response so any stale caller (cron command pointing at this URL, an
 * operator script, etc.) gets an honest deprecation signal instead of
 * a silent rate-cap-violating fan-out execution.
 *
 * Owner: longshort (FP-043 / FP-045 — deprecated by Phase 4)
 */
import { createHandler, apiError } from '../_shared/handler.ts';

Deno.serve(createHandler(async (_req: Request) => {
  return apiError(410, 'options_flow_worker_deprecated', {
    correlationId: crypto.randomUUID(),
    details: {
      replaced_by: 'longshort-queue-slice + options-flow-queue-adapter (FP-045 Phase 4 / DEC-047)',
      enqueue_path:
        'POST /functions/v1/longshort-options-flow-compute (cron) OR ' +
        '/functions/v1/longshort-options-flow-compute-manual (operator JWT)',
      reference: 'docs/04-modules/longshort/signals/queue-worker.md',
    },
  });
}));