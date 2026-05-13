/**
 * RW-016: Configurable MFA enforcement policy (PLAN-AUTH-MFA-POLICY-001 / DEC-028).
 *
 * Guards against regressions in the per-panel and per-user MFA gates so that:
 *   - AdminLayout only redirects to /mfa-enroll when panel policy is 'required'
 *     AND the user has no MFA factor.
 *   - UserLayout only redirects when the user opted in via require_mfa_for_self.
 *   - The policy hook contract and edge-function authorization remain intact.
 *   - The strict 'required' | 'optional' enum is enforced (no 'disabled').
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');

describe('RW-016: MFA policy enforcement gate', () => {
  const adminLayout = read('../layouts/AdminLayout.tsx');
  const userLayout = read('../layouts/UserLayout.tsx');
  const policyHook = read('../hooks/useMfaPolicy.ts');
  const updatePolicyFn = read('../../supabase/functions/update-mfa-policy/index.ts');
  const updateSelfPrefFn = read('../../supabase/functions/update-mfa-self-pref/index.ts');
  const getPolicyFn = read('../../supabase/functions/get-mfa-policy/index.ts');

  describe('AdminLayout panel-level gate', () => {
    it('reads the policy via useMfaPolicy', () => {
      expect(adminLayout).toContain("from '@/hooks/useMfaPolicy'");
      expect(adminLayout).toMatch(/useMfaPolicy\(\)/);
    });

    it("only redirects when admin panel policy === 'required' AND mfaStatus === 'none'", () => {
      expect(adminLayout).toMatch(/policy\?\.panels\?\.admin === ['"]required['"]/);
      expect(adminLayout).toMatch(/mfaStatus === ['"]none['"]/);
      expect(adminLayout).toContain('adminRequired && mfaStatus');
      expect(adminLayout).toContain('ROUTES.MFA_ENROLL');
    });

    it('preserves returnTo so user lands back on the requested admin route', () => {
      expect(adminLayout).toMatch(/state=\{\{ returnTo \}\}/);
      expect(adminLayout).toContain('location.pathname');
    });

    it('prefetches the policy to avoid added paint latency', () => {
      expect(adminLayout).toContain('MFA_POLICY_KEY');
      expect(adminLayout).toContain('mfaPolicyQueryFn');
      expect(adminLayout).toContain('prefetchQuery');
    });
  });

  describe('UserLayout self-preference gate', () => {
    it('does NOT enforce panel policy on the user dashboard', () => {
      expect(userLayout).not.toMatch(/policy\?\.panels\?\.admin/);
    });

    it("redirects only when require_mfa_for_self is true AND mfaStatus === 'none'", () => {
      expect(userLayout).toContain('require_mfa_for_self === true');
      expect(userLayout).toMatch(/mfaStatus === ['"]none['"]/);
      expect(userLayout).toContain('ROUTES.MFA_ENROLL');
    });
  });

  describe('useMfaPolicy hook contract', () => {
    it('exposes panels, require_mfa_for_self, and version on the response', () => {
      expect(policyHook).toMatch(/panels:\s*Record<string,\s*PanelEnforcement>/);
      expect(policyHook).toContain('require_mfa_for_self: boolean');
      expect(policyHook).toContain('version: number');
    });

    it("limits PanelEnforcement to 'required' | 'optional' (no 'disabled')", () => {
      expect(policyHook).toMatch(/PanelEnforcement\s*=\s*['"]required['"]\s*\|\s*['"]optional['"]/);
      expect(policyHook).not.toMatch(/['"]disabled['"]/);
    });

    it('caches the policy for 5 minutes', () => {
      expect(policyHook).toContain('5 * 60 * 1000');
    });

    it('invalidates the cache after policy mutations', () => {
      expect(policyHook).toContain('invalidateQueries');
      expect(policyHook).toContain('MFA_POLICY_KEY');
    });
  });

  describe('update-mfa-policy edge function authorization', () => {
    it('requires PATCH method', () => {
      expect(updatePolicyFn).toContain("req.method !== 'PATCH'");
    });

    it('enforces superadmin + admin.config + recent reauth', () => {
      expect(updatePolicyFn).toContain('is_superadmin');
      expect(updatePolicyFn).toMatch(/checkPermissionOrThrow\([^)]*,\s*['"]admin\.config['"]\)/);
      expect(updatePolicyFn).toContain('requireRecentAuth');
    });

    it("rejects values outside the 'required' | 'optional' enum", () => {
      expect(updatePolicyFn).toMatch(/z\.enum\(\[['"]required['"],\s*['"]optional['"]\]\)/);
    });

    it("emits an audit event for every policy change", () => {
      expect(updatePolicyFn).toContain('mfa_policy_changed');
    });
  });

  describe('update-mfa-self-pref edge function', () => {
    it('requires PATCH and authentication', () => {
      expect(updateSelfPrefFn).toContain("req.method !== 'PATCH'");
      expect(updateSelfPrefFn).toContain('authenticateRequest');
    });

    it('only updates the calling user’s own profile row', () => {
      expect(updateSelfPrefFn).toMatch(/\.eq\(['"]id['"],\s*ctx\.user\.id\)/);
    });

    it('emits an audit event when the preference flips', () => {
      expect(updateSelfPrefFn).toContain('mfa_self_pref_changed');
    });
  });

  describe('get-mfa-policy edge function defaults', () => {
    it("defaults the admin panel to 'optional' when system_config row is missing", () => {
      expect(getPolicyFn).toContain('SAFE_DEFAULT');
      expect(getPolicyFn).toMatch(/admin:\s*['"]optional['"]/);
    });

    it("whitelists enum values so unknown values fall back to 'optional'", () => {
      expect(getPolicyFn).toMatch(/val === ['"]required['"]\s*\?\s*['"]required['"]\s*:\s*['"]optional['"]/);
    });
  });
});