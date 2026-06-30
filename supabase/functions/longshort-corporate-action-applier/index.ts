/**
 * longshort-corporate-action-applier — daily ex-date applier.
 *
 * FP-061 sub-step 4M.4 / ACT-378. Mirrors the cron-fired edge-fn shape of
 * `longshort-settlement-reconciler` (ACT-377): cron-secret verify →
 * injected `as_of` from `productionClock` → call into shared applier
 * (`corporate-action-applier.ts`) → audit event.
 *
 * Cadence: DAILY (post-close). For each unapplied `corporate_actions` row
 * whose `ex_date <= as_of`, mutates open lots per action_type (split /
 * stock_dividend / cash_dividend no-op / merger-stock / merger-cash via
 * closeLots / spinoff parent-trim + child-open via writeOpenLot) and stamps
 * `applied_at = as_of`, `applied_lot_count = N`.
 *
 * §2 AXIOM 4: wall-clock sourced ONCE here via
 * `productionClock.getWallClockTs()` and threaded into the applier; the
 * shared module NEVER calls Date.now() / new Date().
 *
 * MERGER-CASH note: requires a `BrokerRealizedPnLFetcher` to close lots
 * cleanly through `closeLots`. Until FP-062 wires the real Alpaca fetcher,
 * the cron will refuse merger-cash rows (the applier throws). This is the
 * intended STOP behavior — a merger row in the queue without the fetcher
 * surfaces, not silently no-ops.
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { runCorporateActionApplier } from '../_shared/longshort-execution/corporate-action-applier.ts';
// FP-062 6I.2b gap (b) / ACT-413 — inject the real bootstrap-composed CA
// fetcher so production exercises the AlpacaCorporateActionFetcher path
// (composing the internal stand-in for recent-action provenance).
//
// STAY-SOFT IS FETCHER-ONLY (DW-199): if `AlpacaPaperClient` construction
// throws (creds absent in CI / preview), we fall back to the bare internal
// stand-in — the verifier wire itself still fires at the producing seam.
// The mock→real fetcher flip stays deferred to DW-199; this edge fn is
// the production composition root that opts into the real fetcher when
// creds are provisioned.
//
// TAUTOLOGICAL-BUT-LOAD-BEARING ON PAPER: even the real fetcher composes
// the internal stand-in for the recent-action provenance fields (paper
// has no CA feed). The applier-ran confirmation + reconciliation_events
// emission are the value on paper; the real broker basis cross-check
// arrives with DW-199.
import {
  AlpacaPaperClient,
  AlpacaCredentialError,
} from '../_shared/longshort-broker/alpaca-paper-client.ts';
import { AlpacaCorporateActionFetcher } from '../_shared/longshort-broker/alpaca-corporate-action-fetcher.ts';
import { createInternalCorporateActionStatusFetcher } from '../_shared/longshort-execution/internal-corporate-action-status-fetcher.ts';
import type { BrokerCorporateActionFetcher } from '../_shared/longshort-broker-interfaces.ts';

function resolveCorporateActionFetcher(): BrokerCorporateActionFetcher {
  try {
    return new AlpacaCorporateActionFetcher(
      new AlpacaPaperClient(),
      createInternalCorporateActionStatusFetcher(),
    );
  } catch (e) {
    if (e instanceof AlpacaCredentialError) {
      // Creds-free path (CI / preview): fall back to the bare internal
      // stand-in. Verifier wire still fires (tautological-but-load-bearing
      // — confirms applier ran + emits reconciliation_events row).
      return createInternalCorporateActionStatusFetcher();
    }
    throw e;
  }
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  const as_of = productionClock.getWallClockTs();

  try {
    const corporateActionFetcher = resolveCorporateActionFetcher();
    const result = await runCorporateActionApplier({ as_of, corporateActionFetcher });
    if (result.rows_applied > 0) {
      await writeStrategyAuditEvent({
        strategyKey: 'longshort',
        action: 'corporate_action_applier_applied',
        correlationId,
        metadata: {
          as_of: as_of.toISOString(),
          rows_seen: result.rows_seen,
          rows_applied: result.rows_applied,
          applied: result.applied,
        },
      });
    }
    return apiSuccess({
      status: 'ok',
      as_of: as_of.toISOString(),
      rows_seen: result.rows_seen,
      rows_applied: result.rows_applied,
      correlation_id: correlationId,
    });
  } catch (_e) {
    return apiError(500, 'corporate_action_applier_failed', { correlationId });
  }
}));