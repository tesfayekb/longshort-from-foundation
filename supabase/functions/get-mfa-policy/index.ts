/**
 * get-mfa-policy — Returns current MFA enforcement state for the calling user.
 *
 * Owner: auth module (PLAN-AUTH-MFA-POLICY-001 / DEC-028)
 * Classification: api-standard
 * Lifecycle: active
 *
 * GET /get-mfa-policy
 * Auth required.
 * Response: {
 *   panels: { admin: 'required' | 'optional', [key: string]: 'required' | 'optional' },
 *   require_mfa_for_self: boolean,
 *   version: number
 * }
 *
 * Read-only, low-sensitivity. Bypasses RLS via service role to merge
 * (a) the global panel policy from system_config and
 * (b) the calling user's own profile preference,
 * returning a single per-user view layouts can gate on.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts'
import { authenticateRequest } from '../_shared/authenticate-request.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

const SAFE_DEFAULT = {
  version: 1,
  panels: { admin: 'optional' as const },
  require_mfa_for_self: false,
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'GET') {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() })
  }

  const ctx = await authenticateRequest(req)

  const [policyRow, profileRow] = await Promise.all([
    supabaseAdmin
      .from('system_config')
      .select('value')
      .eq('key', 'mfa_enforcement_policy')
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('require_mfa_for_self')
      .eq('id', ctx.user.id)
      .maybeSingle(),
  ])

  const raw = (policyRow.data?.value as { version?: number; panels?: Record<string, string> }) ?? {}
  const panelsRaw = raw.panels ?? {}
  // Whitelist enum values; anything unexpected falls back to 'optional' (fail-open
  // for the gate but still readable — production deploy SOP forces 'required').
  const panels: Record<string, 'required' | 'optional'> = {}
  for (const [key, val] of Object.entries(panelsRaw)) {
    panels[key] = val === 'required' ? 'required' : 'optional'
  }
  if (!('admin' in panels)) panels.admin = SAFE_DEFAULT.panels.admin

  return apiSuccess({
    version: typeof raw.version === 'number' ? raw.version : SAFE_DEFAULT.version,
    panels,
    require_mfa_for_self: !!profileRow.data?.require_mfa_for_self,
  })
}))
