/**
 * overshoot-ibkr-shadow-mirror — ACT-572 skeleton (dormant).
 *
 * PRIME DIRECTIVE (charter §0): the shadow lane NEVER feeds any
 * primary-lane decision. This handler exists to accumulate real-broker
 * fill evidence once §4 operator TO-DO completes; until then it
 * no-ops with `{status:'shadow_disabled'}` and never awaits any
 * primary-lane RPC.
 *
 * OPTIONS probe echoes `x-source-version: act572-skel-v1` (via
 * `createHandler.sourceVersion`), which is the FIX-3 source-version
 * rail signature for this dormant skeleton.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { isIbkrShadowEnabled, IbkrShadowNotImplementedError } from '../_shared/overshoot-shadow-ibkr/cp-client.ts';

const SOURCE_VERSION = 'act572-skel-v1';

Deno.serve(createHandler(async (req: Request): Promise<Response> => {
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

  // Enabled path — Phase-1 wiring pending.
  try {
    throw new IbkrShadowNotImplementedError('mirror.dispatch');
  } catch (err) {
    return apiSuccess({
      status: 'shadow_not_implemented',
      typed_error: (err as { typedError?: string }).typedError ?? 'unknown',
      source_version: SOURCE_VERSION,
    }, 200);
  }
}, { sourceVersion: SOURCE_VERSION }));