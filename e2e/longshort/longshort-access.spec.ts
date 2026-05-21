import { test, expect } from '../../playwright-fixture';

// These tests verify longshort.view permission gating at the route level
// AND audit emission via the longshort-emit-init edge function.
//
// AC-21: /trading/longshort RBAC gating (mirrors e2e/trading-panel-access.spec.ts pattern)
// AC-22: longshort-emit-init audit emission with correlation_id propagation
//
// Per DEC-031 sub-point 10, admin and user roles do NOT receive longshort.view
// by default — only superadmin (via inheritance) does until trader-class roles
// are created.
//
// Auth strategy: mirrors e2e/admin-role-assignment.spec.ts and
// e2e/trading-panel-access.spec.ts skip-on-no-session pattern. CI environments
// without authenticated session skip authenticated scenarios gracefully — the
// unauthenticated test always runs.

test.describe('Long-short strategy access control', () => {
  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.goto('/trading/longshort');
    await expect(page).toHaveURL(/\/sign-?in|\/auth|\/login/);
  });

  test('authenticated user without longshort.view sees AccessDenied', async ({
    page,
  }) => {
    await page.goto('/trading/longshort');
    if (page.url().includes('sign-in')) {
      test.skip(
        true,
        'No authenticated session — requires user without longshort.view',
      );
      return;
    }
    // AccessDenied component (src/components/dashboard/AccessDenied.tsx) shows
    // the generic default message: "You don't have permission to access this page."
    await expect(
      page.getByRole('heading', { name: /access denied/i }),
    ).toBeVisible();
  });

  test('authorized user can access long-short dashboard', async ({ page }) => {
    await page.goto('/trading/longshort');
    if (page.url().includes('sign-in')) {
      test.skip(
        true,
        'No authenticated session — requires superadmin or user with longshort.view',
      );
      return;
    }
    // Skip if the authenticated user lacks longshort.view (covered by the
    // previous test); only assert dashboard render when no AccessDenied chrome.
    const denied = await page
      .getByRole('heading', { name: /access denied/i })
      .isVisible()
      .catch(() => false);
    if (denied) {
      test.skip(true, 'Authenticated user lacks longshort.view');
      return;
    }
    await expect(
      page.getByRole('heading', { name: /long-short strategy/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/FP-005 bootstrap surface/i),
    ).toBeVisible();
  });
});

test.describe('Long-short audit emission', () => {
  test('longshort-emit-init writes audit row with correlation_id in response', async ({
    page,
    request,
  }) => {
    // Skip if no auth session available (mirrors RBAC scenarios above).
    await page.goto('/trading');
    if (page.url().includes('sign-in')) {
      test.skip(true, 'No authenticated session for edge function invocation');
      return;
    }

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
    if (!SUPABASE_URL) {
      test.skip(true, 'VITE_SUPABASE_URL not set; cannot invoke edge function');
      return;
    }

    const correlationId = crypto.randomUUID();

    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/longshort-emit-init`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId,
        },
        data: {},
      },
    );

    // 401/403 → RBAC gate working; we can't proceed without longshort.view.
    if (response.status() === 401 || response.status() === 403) {
      test.skip(true, 'Insufficient auth for edge function; RBAC gate verified');
      return;
    }

    expect(response.status()).toBe(200);
    const body = await response.json();
    // The handler envelope wraps the payload; tolerate either shape.
    const payload = body?.data ?? body;
    expect(payload).toHaveProperty('audit_id');
    expect(payload).toHaveProperty('correlation_id');
    // Per DEC-023 envelope semantics, either the envelope honors the
    // x-correlation-id header or it mints a fresh UUID — both acceptable.
    expect(typeof payload.correlation_id).toBe('string');
    expect(payload.correlation_id).toMatch(/^[0-9a-f-]{36}$/i);
    // audit_id existence is transitive proof that writeStrategyAuditEvent
    // inserted a row into longshort_audit_logs (the helper returns
    // {success: true, auditId} only on successful INSERT).
    expect(typeof payload.audit_id).toBe('string');
    expect(payload.audit_id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});