/**
 * overshoot-ibkr-shadow-reconcile — ACT-572 skeleton (dormant).
 *
 * Nightly A5-style reconciliation vs IBKR paper (positions, cash,
 * equity). Divergences write typed rows into
 * `ibkr_shadow_reconciliation_events` with severity
 * `shadow_low|shadow_medium|shadow_high` — the primary rail's
 * alerting NEVER pages on these. Charter §1.5.
 *
 * Dormant until §4 operator TO-DO completes.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { isIbkrShadowEnabled, IbkrShadowNotImplementedError } from '../_shared/overshoot-shadow-ibkr/cp-client.ts';

const SOURCE_VERSION = 'act572-skel-v1';

export default createHandler(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return apiSuccess({ status: 'method_not_allowed', method: req.method }, 405);
  }

  const enabled = await isIbkrShadowEnabled(supabaseAdmin as unknown as Parameters<typeof isIbkrShadowEnabled>[0]);
  if (!enabled) {
    return apiSuccess({
      status: 'shadow_disabled',
      reason: 'ibkr_shadow_enabled=false — charter §4 operator TO-DO not complete',
      source_version: SOURCE_VERSION,
    }, 200);
  }

  try {
    throw new IbkrShadowNotImplementedError('reconcile.nightly');
  } catch (err) {
    return apiSuccess({
      status: 'shadow_not_implemented',
      typed_error: (err as { typedError?: string }).typedError ?? 'unknown',
      source_version: SOURCE_VERSION,
    }, 200);
  }
}, { sourceVersion: SOURCE_VERSION });