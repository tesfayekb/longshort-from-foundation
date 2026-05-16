import { test, expect } from '../playwright-fixture';

// These tests verify trading.access permission gating at the layout level.
// Per DEC-031 sub-point 10, admin and user roles do NOT receive trading.access
// by default — only superadmin (via inheritance) does until trader-class roles
// are created.
//
// Auth strategy: mirrors e2e/admin-role-assignment.spec.ts skip-on-no-session
// pattern. CI environments without authenticated session skip authenticated
// scenarios gracefully — the unauthenticated test always runs.

test.describe('Trading panel access control', () => {
    test('unauthenticated user is redirected to login', async ({ page }) => {
        await page.goto('/trading');
        await expect(page).toHaveURL(/\/sign-?in|\/auth|\/login/);
    });

    test('authenticated user without trading.access sees AccessDenied', async ({
        page,
    }) => {
        await page.goto('/trading');
        if (page.url().includes('sign-in')) {
            test.skip(
                true,
                'No authenticated session — requires user without trading.access',
            );
            return;
        }
        await expect(
            page.getByText('You need trading panel access to view this page.'),
        ).toBeVisible();
    });

    test('superadmin can access trading panel', async ({ page }) => {
        await page.goto('/trading');
        if (page.url().includes('sign-in')) {
            test.skip(true, 'No authenticated session — requires superadmin login');
            return;
        }
        await expect(
            page.getByRole('heading', { name: /trading/i }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: /no strategies enabled/i }),
        ).toBeVisible();
    });
});
