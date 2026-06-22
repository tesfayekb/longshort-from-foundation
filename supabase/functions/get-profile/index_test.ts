/**
 * Stage 3C -- Comprehensive authenticated edge function tests.
 *
 * Creates a dedicated test user via Admin API, assigns superadmin role,
 * signs in to obtain a real JWT, exercises all endpoints, then deletes the user.
 *
 * DW-121: env-guarded. The prior `throw new Error('SKIP: ...')` in SETUP was a
 * real Deno.test failure (not a skip) that cascaded 11 fails when the
 * SERVICE_ROLE_KEY was absent. The fake-skip throw has been removed in favor
 * of `Deno.test({ ignore: !HAS_SERVICE, ... })` -- honest skips when the
 * live env is absent.
 *
 * Coverage:
 *   URL-only (HAS_ENV):
 *     - Unauthenticated denial (401) x 5
 *     - Method denial (405) x 5
 *     - CORS preflight (200) x 5
 *   SERVICE_ROLE-dependent (HAS_SERVICE):
 *     - SETUP / TEARDOWN
 *     - Validation (400) x 3
 *     - Self-access x 2
 *     - Admin access x 2
 *     - Deactivation boundaries x 3
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

const BASE = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const HAS_ENV = !!BASE && !!ANON_KEY
// DW-121: log-sudo-event/index_test.ts sets SUPABASE_SERVICE_ROLE_KEY='test-srk' at module
// top-level for its unit-test mocks; in tree-wide deno runs that pollutes global env and would
// make us attempt live admin-API calls with a fake key. Reject the known sentinel. Real
// service-role keys are JWTs (>>16 chars). Spinoff DW filed for the cross-test env pollution.
const SERVICE_ROLE_KEY_LOOKS_REAL = !!SERVICE_ROLE_KEY && SERVICE_ROLE_KEY !== 'test-srk' && SERVICE_ROLE_KEY.length > 32
const HAS_SERVICE = HAS_ENV && SERVICE_ROLE_KEY_LOOKS_REAL

function fnUrl(fn: string, query?: Record<string, string>): string {
  const base = `${BASE}/functions/v1/${fn}`;
  if (!query) return base;
  return `${base}?${new URLSearchParams(query)}`;
}

// -- Test user lifecycle --
const TEST_EMAIL = `test-3c-${Date.now()}@test.local`
const TEST_PASSWORD = 'TestPassword12345!'
let testUserId = ''
let testToken = ''

async function setupTestUser(): Promise<void> {
  // SERVICE_ROLE_KEY presence guaranteed by HAS_SERVICE ignore-gate on this Deno.test.
  const createRes = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  })
  const createData = await createRes.json()
  if (!createData.id) throw new Error(`Failed to create test user: ${JSON.stringify(createData)}`)
  testUserId = createData.id

  await new Promise(r => setTimeout(r, 1000))

  const roleRes = await fetch(`${BASE}/rest/v1/roles?key=eq.superadmin&select=id`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
  })
  const roles = await roleRes.json()
  if (!roles?.[0]?.id) throw new Error('Could not find superadmin role')

  const assignRes = await fetch(`${BASE}/rest/v1/user_roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ user_id: testUserId, role_id: roles[0].id }),
  })
  await assignRes.text()

  const signInRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  const signInData = await signInRes.json()
  if (!signInData.access_token) throw new Error(`Failed to sign in test user: ${JSON.stringify(signInData)}`)
  testToken = signInData.access_token
}

async function teardownTestUser(): Promise<void> {
  if (!testUserId) return
  const res = await fetch(`${BASE}/auth/v1/admin/users/${testUserId}`, {
    method: 'DELETE',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
  })
  await res.text()
}

// =============================================================
// SETUP
// =============================================================

Deno.test({ name: '00: SETUP -- create test user', ignore: !HAS_SERVICE, fn: setupTestUser, sanitizeResources: false, sanitizeOps: false })

// =============================================================
// SECTION 1: UNAUTHENTICATED DENIAL (401)  --  URL-only
// =============================================================

for (const [fn, method, body] of [
  ['get-profile', 'GET', undefined],
  ['update-profile', 'PATCH', JSON.stringify({ display_name: 'Test' })],
  ['list-users', 'GET', undefined],
  ['deactivate-user', 'POST', JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000' })],
  ['reactivate-user', 'POST', JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000' })],
] as const) {
  Deno.test({ name: `01: ${fn}: rejects unauthenticated (401)`, ignore: !HAS_ENV, fn: async () => {
    const headers: Record<string, string> = { 'Authorization': `Bearer ${ANON_KEY}` }
    if (body) headers['Content-Type'] = 'application/json'
    const res = await fetch(fnUrl(fn), { method, headers, body: body as string | undefined })
    assertEquals(res.status, 401)
    await res.text()
  }})
}

// =============================================================
// SECTION 2: METHOD DENIAL (405)  --  URL-only
// =============================================================

for (const [fn, wrongMethod] of [
  ['get-profile', 'POST'],
  ['update-profile', 'GET'],
  ['list-users', 'POST'],
  ['deactivate-user', 'GET'],
  ['reactivate-user', 'GET'],
] as const) {
  Deno.test({ name: `02: ${fn}: rejects wrong method (405)`, ignore: !HAS_ENV, fn: async () => {
    const res = await fetch(fnUrl(fn), {
      method: wrongMethod,
      headers: { 'Authorization': `Bearer ${ANON_KEY}` },
    })
    assertEquals(res.status, 405)
    await res.text()
  }})
}

// =============================================================
// SECTION 3: CORS PREFLIGHT (200)  --  URL-only
// =============================================================

for (const fn of ['get-profile', 'update-profile', 'list-users', 'deactivate-user', 'reactivate-user']) {
  Deno.test({ name: `03: ${fn}: OPTIONS CORS preflight (200)`, ignore: !HAS_ENV, fn: async () => {
    const res = await fetch(fnUrl(fn), { method: 'OPTIONS' })
    assertEquals(res.status, 200)
    assertEquals(!!res.headers.get('access-control-allow-origin'), true)
    await res.text()
  }})
}

// =============================================================
// SECTION 4: VALIDATION ERRORS (400)  --  needs testToken
// =============================================================

Deno.test({ name: '04: get-profile: invalid UUID -> 400', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('get-profile', { user_id: 'not-a-uuid' }), {
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY },
  })
  assertEquals(res.status, 400)
  await res.text()
}})

Deno.test({ name: '04: update-profile: empty body -> 400', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('update-profile'), {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assertEquals(res.status, 400)
  await res.text()
}})

Deno.test({ name: '04: deactivate-user: missing user_id -> 400', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('deactivate-user'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  assertEquals(res.status, 400)
  await res.text()
}})

// =============================================================
// SECTION 5: AUTHENTICATED SELF-ACCESS  --  needs testToken
// =============================================================

Deno.test({ name: '05: get-profile: self-access returns own profile (200)', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('get-profile'), {
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY },
  })
  const body = await res.json()
  assertEquals(res.status, 200)
  assertExists(body.profile?.id)
  assertEquals(body.profile.id, testUserId)
  assertEquals(body.profile.status, 'active')
}})

Deno.test({ name: '05: update-profile: self-update display_name (200)', ignore: !HAS_SERVICE, fn: async () => {
  const testName = `Stage3C_${Date.now()}`
  const res = await fetch(fnUrl('update-profile'), {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: testName }),
  })
  const body = await res.json()
  assertEquals(res.status, 200)
  assertEquals(body.profile?.display_name, testName)
}})

// =============================================================
// SECTION 6: ADMIN ACCESS  --  needs testToken
// =============================================================

Deno.test({ name: '06: list-users: admin pagination (200)', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('list-users', { limit: '5' }), {
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY },
  })
  const body = await res.json()
  assertEquals(res.status, 200)
  assertEquals(Array.isArray(body.users), true)
  assertEquals(typeof body.total, 'number')
}})

Deno.test({ name: '06: get-profile: admin view non-existent user -> 404', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('get-profile', { user_id: '00000000-0000-0000-0000-000000000001' }), {
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY },
  })
  assertEquals(res.status, 404)
  await res.text()
}})

// =============================================================
// SECTION 7: DEACTIVATION BOUNDARIES  --  needs testToken
// =============================================================

Deno.test({ name: '07: deactivate-user: self-deactivation blocked (400)', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('deactivate-user'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: testUserId }),
  })
  assertEquals(res.status, 400)
  await res.text()
}})

Deno.test({ name: '07: deactivate-user: non-existent user -> 404', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('deactivate-user'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000001' }),
  })
  assertEquals(res.status, 404)
  await res.text()
}})

Deno.test({ name: '07: reactivate-user: non-existent user -> 404', ignore: !HAS_SERVICE, fn: async () => {
  const res = await fetch(fnUrl('reactivate-user'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${testToken}`, 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000001' }),
  })
  assertEquals(res.status, 404)
  await res.text()
}})

// =============================================================
// TEARDOWN
// =============================================================

Deno.test({ name: '99: TEARDOWN -- delete test user', ignore: !HAS_SERVICE, fn: teardownTestUser, sanitizeResources: false, sanitizeOps: false })
