/**
 * list-roles — Return all roles with permission and user counts.
 *
 * Requires: roles.view permission.
 *
 * GET /list-roles
 * Response: { data: RoleListItem[] }
 *
 * Superadmin auto-inherits all permissions via is_superadmin() — it has zero
 * rows in role_permissions by design. permission_count is overridden to the
 * total permission count for the superadmin role.
 *
 * Performance: Uses PostgREST aggregate joins to fetch counts in a single
 * round-trip instead of 4 sequential queries.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts'
import { authenticateRequest } from '../_shared/authenticate-request.ts'
import { checkPermissionOrThrow } from '../_shared/authorization.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

interface RoleListItem {
  id: string
  key: string
  name: string
  description: string | null
  is_base: boolean
  is_immutable: boolean
  is_permission_locked: boolean
  created_at: string
  updated_at: string
  permission_count: number
  user_count: number
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'GET') {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() })
  }

  const ctx = await authenticateRequest(req)
  await checkPermissionOrThrow(ctx.user.id, 'roles.view')

  // Fetch roles, total perm count, and user-role's permission IDs in parallel
  const [rolesResult, totalPermResult, userRolePermsResult] = await Promise.all([
    supabaseAdmin
      .from('roles')
      .select('id, key, name, description, is_base, is_immutable, is_permission_locked, created_at, updated_at, role_permissions(count), user_roles(count)')
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('permissions')
      .select('id', { count: 'exact', head: true }),
    // Get the 'user' role's permission IDs for inheritance calculation
    supabaseAdmin
      .from('roles')
      .select('id')
      .eq('key', 'user')
      .single()
      .then(async ({ data: userRole }) => {
        if (!userRole) return []
        const { data } = await supabaseAdmin
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', userRole.id)
        return (data ?? []).map((rp) => rp.permission_id)
      }),
  ])

  if (rolesResult.error) throw rolesResult.error

  const totalPermCount = totalPermResult.count ?? 0
  const userRolePermIds = new Set(userRolePermsResult)
  const userRolePermCount = userRolePermIds.size

  // For non-superadmin, non-user roles we need overlap with user-role permissions.
  // Fetch all role_permissions to compute effective counts accurately.
  const rolePermMap = new Map<string, Set<string>>()
  if (userRolePermCount > 0) {
    const { data: allRp } = await supabaseAdmin
      .from('role_permissions')
      .select('role_id, permission_id')
    for (const rp of allRp ?? []) {
      if (!rolePermMap.has(rp.role_id)) rolePermMap.set(rp.role_id, new Set())
      rolePermMap.get(rp.role_id)!.add(rp.permission_id)
    }
  }

  type RoleRow = {
    id: string
    key: string
    name: string
    description: string | null
    is_base: boolean
    is_immutable: boolean
    is_permission_locked: boolean
    created_at: string
    updated_at: string
    role_permissions?: { count: number }[]
    user_roles?: { count: number }[]
  }
  const result: RoleListItem[] = (rolesResult.data ?? []).map((r: RoleRow) => {
    let permCount: number
    if (r.key === 'superadmin') {
      permCount = totalPermCount
    } else if (r.key === 'user') {
      permCount = r.role_permissions?.[0]?.count ?? 0
    } else {
      // Effective = direct permissions ∪ user-role permissions
      const directIds = rolePermMap.get(r.id) ?? new Set<string>()
      const effectiveIds = new Set([...directIds, ...userRolePermIds])
      permCount = effectiveIds.size
    }
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      is_base: r.is_base,
      is_immutable: r.is_immutable,
      is_permission_locked: r.is_permission_locked,
      created_at: r.created_at,
      updated_at: r.updated_at,
      permission_count: permCount,
      user_count: r.user_roles?.[0]?.count ?? 0,
    }
  })

  return apiSuccess(result)
}))
