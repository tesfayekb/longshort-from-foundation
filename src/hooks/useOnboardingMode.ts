/**
 * useOnboardingMode — Public hook to check if signup is enabled.
 * Does NOT require authentication (calls get-system-config which is public).
 *
 * Owner: user-onboarding module
 */
import { useQuery } from '@tanstack/react-query';
import { env, getFunctionsBaseUrl } from '@/lib/env';

interface OnboardingMode {
  signup_enabled: boolean;
  invite_enabled: boolean;
}

export function useOnboardingMode() {
  return useQuery({
    queryKey: ['public', 'onboarding-mode'],
    queryFn: async (): Promise<OnboardingMode> => {
      const res = await fetch(`${getFunctionsBaseUrl()}/get-system-config`, {
        headers: { 'apikey': env.SUPABASE_PUBLISHABLE_KEY },
      });
      if (!res.ok) {
        // Default to allowing signup if config can't be fetched
        return { signup_enabled: true, invite_enabled: true };
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes — config rarely changes
    retry: 1,
  });
}
