/**
 * longshort-settlement-reconciler — daily T+1 settlement reconciler.
 *
 * FP-061 sub-step 4M.2 / ACT-377. Mirrors the cron-fired edge-fn shape
 * used by `longshort-queue-sweeper` (cron-secret verify → injected as_of
 * from `productionClock` → call into shared logic → audit event).
 *
 * Cadence: DAILY (post-close). Reads open lots with
 * `settlement_state='pending'` whose `expected_settlement_ts <= as_of`
 * (T+1 elapsed, reusing the EXISTING stamp from `lot-ledger-writer`);
 * flips them to `settled` and stamps `settled_at = as_of` (MIG-143).
 *
 * §2 AXIOM 4: the financial comparison ("is T+1 elapsed") uses the
 * INJECTED `as_of` — `productionClock.getWallClockTs()` is sourced ONCE
 * at the boundary and threaded through. The shared logic never calls
 * Date.now() / new Date().
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { runSettlementReconciler } from '../_shared/longshort-execution/settlement-reconciler.ts';

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  try {
    const result = await runSettlementReconciler({ as_of });
    if (result.flipped > 0) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'settlement_reconciler_flipped',
        correlationId,
        metadata: {
          as_of: as_of.toISOString(),
          flipped: result.flipped,
          lot_ids: result.settled_rows.map((r) => r.lot_id),
        },
      });
    }
    return apiSuccess({
      status: 'ok',
      as_of: as_of.toISOString(),
      flipped: result.flipped,
      correlation_id: correlationId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return apiError(500, 'settlement_reconciler_failed', { correlationId, details: msg });
  }
}));